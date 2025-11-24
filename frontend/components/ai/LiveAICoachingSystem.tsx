'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PointerPosition } from './LaserPointerOverlay';
import { VoiceInputListener } from './VoiceInputListener';
import { getConversationStateManager } from '../../lib/conversationState';
import { detectHelpRequest, extractIntent } from '../../lib/semanticAnalyzer';
import { AI_COACH_CONFIG, type CoachingMode, getCoachingModeBehavior } from '../../lib/aiCoachConfig';
import { retryAICoachingRequest } from '../../lib/retryFetch';
import type { VoiceSynthesisController } from './EnhancedLiveVoiceSynthesis';

interface AIIntervention {
  type: 'voice' | 'annotation' | 'both';
  voiceText?: string;
  laserPosition?: {
    x: number;
    y: number;
    style?: 'point' | 'circle' | 'highlight' | 'ripple';
  };
  annotation?: {
    text: string;
    position: { x: number; y: number };
    type: string;
  };
}

export type AIState = 'idle' | 'listening' | 'thinking' | 'speaking';

interface LiveAICoachingSystemProps {
  excalidrawRef: React.RefObject<any>;
  voiceSynthesisRef: React.RefObject<VoiceSynthesisController>;
  elements: any[];
  onLaserPositionChange: (position: PointerPosition | null) => void;
  onAddAnnotation: (annotation: { text: string; x: number; y: number; type: string }) => void;
  onSpeakText: (text: string) => void;
  onStateChange?: (state: AIState) => void;
  isEnabled: boolean;
  isVoiceEnabled: boolean;
  coachingMode: CoachingMode;
}

/**
 * Enhanced Live AI Coaching System with Voice Input and Interrupt Handling
 * - Monitors canvas changes
 * - Listens to user voice continuously
 * - Detects help requests via semantic analysis
 * - Handles interruptions intelligently
 * - Re-evaluates context when interrupted
 */
export const LiveAICoachingSystem: React.FC<LiveAICoachingSystemProps> = ({
  excalidrawRef,
  voiceSynthesisRef,
  elements,
  onLaserPositionChange,
  onAddAnnotation,
  onSpeakText,
  onStateChange,
  isEnabled,
  isVoiceEnabled,
  coachingMode,
}) => {
  const conversationManager = getConversationStateManager();
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [aiState, setAIState] = useState<AIState>('idle');

  // Get coaching mode behavior
  const modeBehavior = getCoachingModeBehavior(coachingMode);

  // Update AI state and notify parent
  const updateAIState = useCallback((newState: AIState) => {
    setAIState(newState);
    onStateChange?.(newState);
  }, [onStateChange]);

  const analysisTimerRef = useRef<NodeJS.Timeout | null>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const laserTimerRef = useRef<NodeJS.Timeout | null>(null);
  const interventionInProgressRef = useRef(false);
  const isMountedRef = useRef(true);

  // Canvas version tracking (increments on any change)
  const canvasVersionRef = useRef(0);
  const lastCanvasVersionRef = useRef(0);

  // Interrupt storm protection
  const recentInterruptsRef = useRef<number[]>([]); // Timestamps
  const inCooldownRef = useRef(false);
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Screenshot cache (avoid re-capturing identical canvas)
  const screenshotCacheRef = useRef<{
    version: number;
    screenshot: string;
  } | null>(null);

  // Helper: Resize canvas if it exceeds max dimensions
  const resizeCanvasIfNeeded = useCallback(
    (canvas: HTMLCanvasElement, maxWidth: number, maxHeight: number): HTMLCanvasElement => {
      const { width, height } = canvas;

      // Check if resize needed
      if (width <= maxWidth && height <= maxHeight) {
        return canvas; // No resize needed
      }

      // Calculate scale to fit within bounds while maintaining aspect ratio
      const scale = Math.min(maxWidth / width, maxHeight / height);
      const newWidth = Math.floor(width * scale);
      const newHeight = Math.floor(height * scale);

      console.log(`🔧 Resizing screenshot: ${width}x${height} → ${newWidth}x${newHeight}`);

      // Create new canvas with resized dimensions
      const resizedCanvas = document.createElement('canvas');
      resizedCanvas.width = newWidth;
      resizedCanvas.height = newHeight;

      const ctx = resizedCanvas.getContext('2d');
      if (!ctx) return canvas; // Fallback if context unavailable

      // Draw resized image
      ctx.drawImage(canvas, 0, 0, newWidth, newHeight);

      return resizedCanvas;
    },
    []
  );

  // Export canvas as screenshot with optimization
  const captureCanvasScreenshot = useCallback(async (): Promise<string | null> => {
    try {
      if (!excalidrawRef.current) return null;

      // Check cache: if canvas version unchanged, reuse screenshot
      const currentVersion = canvasVersionRef.current;
      if (screenshotCacheRef.current?.version === currentVersion) {
        console.log('📸 Using cached screenshot (canvas unchanged)');
        return screenshotCacheRef.current.screenshot;
      }

      const api = excalidrawRef.current;
      const { elements: currentElements, appState, files } = api.getSceneElements
        ? api.getSceneElements()
        : { elements, appState: api.getAppState(), files: {} };

      const visibleElements = currentElements.filter((el: any) => !el.isDeleted);
      if (visibleElements.length === 0) return null;

      const excalidrawModule = await import('@excalidraw/excalidraw');
      const { exportToCanvas } = excalidrawModule;

      // Export with configured scale for optimization
      const canvas = await exportToCanvas({
        elements: visibleElements,
        appState: {
          ...(appState || {}),
          exportScale: AI_COACH_CONFIG.screenshotScale,
        },
        files: files || {},
      });

      // Optionally resize if canvas is too large
      const optimizedCanvas = resizeCanvasIfNeeded(
        canvas,
        AI_COACH_CONFIG.maxScreenshotWidth,
        AI_COACH_CONFIG.maxScreenshotHeight
      );

      // Convert to data URL with quality optimization
      const screenshot = optimizedCanvas.toDataURL('image/png', 0.85); // 85% quality

      // Cache the screenshot
      screenshotCacheRef.current = {
        version: currentVersion,
        screenshot,
      };

      const sizeKB = Math.round(screenshot.length / 1024);
      console.log(`📸 Captured screenshot (${sizeKB}KB, version ${currentVersion})`);

      return screenshot;
    } catch (error) {
      console.error('Failed to capture canvas screenshot:', error);
      return null;
    }
  }, [excalidrawRef, elements, resizeCanvasIfNeeded]);

  // Execute AI intervention
  const executeIntervention = useCallback(
    (intervention: AIIntervention) => {
      if (!isMountedRef.current) return;

      try {
        if (intervention.voiceText) {
          console.log('🗣️ AI speaking:', intervention.voiceText);
          conversationManager.startAIUtterance(intervention.voiceText);
          updateAIState('speaking');
          onSpeakText(intervention.voiceText);
        }

        if (intervention.laserPosition) {
          console.log('🔴 Laser pointing to:', intervention.laserPosition);
          onLaserPositionChange({
            x: intervention.laserPosition.x,
            y: intervention.laserPosition.y,
            style: intervention.laserPosition.style || 'point',
            emphasis: 0.8,
          });

          // Clear any existing laser timer
          if (laserTimerRef.current) {
            clearTimeout(laserTimerRef.current);
          }

          // Clear laser after estimated speak duration
          const speakDuration = intervention.voiceText
            ? intervention.voiceText.split('.').length * AI_COACH_CONFIG.laserDurationPerSentenceMs
            : 5000;
          laserTimerRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              onLaserPositionChange(null);
            }
          }, speakDuration);
        }

        if (intervention.annotation) {
          console.log('✍️ AI writing annotation:', intervention.annotation.text);
          onAddAnnotation({
            text: intervention.annotation.text,
            x: intervention.annotation.position.x,
            y: intervention.annotation.position.y,
            type: intervention.annotation.type,
          });
        }

        conversationManager.recordIntervention();
      } catch (error) {
        console.error('Failed to execute intervention:', error);
      } finally {
        // After intervention completes, return to idle (unless still speaking)
        // The voice synthesis component should manage 'speaking' state duration
        if (!intervention.voiceText) {
          updateAIState('idle');
        }
      }
    },
    [onSpeakText, onLaserPositionChange, onAddAnnotation, conversationManager, updateAIState]
  );

  // Call AI API for intervention
  const callAIForIntervention = useCallback(
    async (context: {
      trigger: 'idle' | 'help_request' | 'interrupt';
      userSpeech?: string;
    }) => {
      if (interventionInProgressRef.current || !isMountedRef.current) return;

      interventionInProgressRef.current = true;
      updateAIState('thinking');

      try {
        const conversationState = conversationManager.getSummaryForAPI();
        const screenshot = await captureCanvasScreenshot();

        if (!isMountedRef.current) return;

        if (!screenshot) {
          console.warn('⚠️ Failed to capture screenshot, cannot proceed with intervention');
          return;
        }

        const elementData = elements
          .filter((el: any) => !el.isDeleted)
          .map((el: any) => ({
            id: el.id,
            type: el.type,
            x: el.x,
            y: el.y,
            width: el.width || 0,
            height: el.height || 0,
            text: el.text || undefined,
          }));

        // Use retry logic for robustness
        const intervention: AIIntervention = await retryAICoachingRequest(
          screenshot,
          elementData,
          {
            ...conversationState,
            trigger: context.trigger,
            userSpeech: context.userSpeech,
            coachingMode, // Pass mode to API
          },
          {
            onRetry: (attempt, error) => {
              if (isMountedRef.current) {
                console.log(`🔄 Retrying AI intervention (attempt ${attempt}):`, error.message);
              }
            },
          }
        );

        if (!isMountedRef.current) return;

        executeIntervention(intervention);
      } catch (error) {
        if (isMountedRef.current) {
          console.error('❌ AI intervention failed after retries:', error);

          // Provide fallback voice feedback to user
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error occurred';

          const fallbackIntervention: AIIntervention = {
            type: 'voice',
            voiceText: `I'm having trouble right now. ${
              errorMessage.includes('timeout')
                ? 'The request timed out.'
                : 'There was a network issue.'
            } Please try again in a moment.`,
          };

          executeIntervention(fallbackIntervention);
        }
      } finally {
        if (isMountedRef.current) {
          interventionInProgressRef.current = false;
          // Reset to idle after API call completes (executeIntervention will set to 'speaking' if needed)
          if (aiState === 'thinking') {
            updateAIState('idle');
          }
        }
      }
    },
    [elements, conversationManager, captureCanvasScreenshot, executeIntervention, updateAIState, aiState, coachingMode]
  );

  // Check for interrupt storm
  const checkInterruptStorm = useCallback((): boolean => {
    const now = Date.now();
    const windowMs = 10_000; // 10 second window

    // Clean up old interrupts outside the window
    recentInterruptsRef.current = recentInterruptsRef.current.filter(
      (timestamp) => now - timestamp < windowMs
    );

    // Add current interrupt
    recentInterruptsRef.current.push(now);

    // Check if we've exceeded the limit
    if (recentInterruptsRef.current.length > AI_COACH_CONFIG.maxRapidInterrupts) {
      if (!inCooldownRef.current) {
        console.warn('🚨 Interrupt storm detected! Entering cooldown...');
        inCooldownRef.current = true;

        // Clear cooldown after timeout
        if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = setTimeout(() => {
          console.log('✅ Cooldown period ended');
          inCooldownRef.current = false;
          recentInterruptsRef.current = [];
        }, AI_COACH_CONFIG.interruptCooldownMs);

        return true; // Storm detected
      }
    }

    return inCooldownRef.current; // Return current cooldown status
  }, []);

  // Handle user voice input (transcription)
  const handleTranscription = useCallback(
    async (text: string) => {
      console.log('📝 User said:', text);

      // Check if AI is currently speaking
      const isAISpeaking = voiceSynthesisRef.current?.isSpeaking();

      // Add to conversation history
      conversationManager.addUserSpeech(text, !!isAISpeaking);

      // Detect if user needs help
      const helpDetection = await detectHelpRequest(text);
      const intent = extractIntent(text);

      console.log('🔍 Intent analysis:', { helpDetection, intent });

      // If user needs help
      if (helpDetection.needsHelp || intent.intent === 'help' || intent.intent === 'question') {
        console.log('🚨 Help request detected!');

        // If AI is currently speaking, pause and re-evaluate
        if (isAISpeaking) {
          console.log('⏸️ AI was speaking, pausing to handle interrupt...');
          voiceSynthesisRef.current?.pause();

          const progress = voiceSynthesisRef.current?.getProgress() || 0.5;
          conversationManager.markAIUtteranceInterrupted(progress);

          // Check for interrupt storm
          const isStorm = checkInterruptStorm();

          if (isStorm) {
            console.warn('⚠️ Too many rapid interrupts - in cooldown, not re-evaluating yet');
            // Don't call AI, just keep paused
            // User can resume by saying affirmation or waiting for cooldown to end
            return;
          }

          // Re-evaluate with interrupt context
          await callAIForIntervention({
            trigger: 'interrupt',
            userSpeech: text,
          });
        } else {
          // AI not speaking, just respond to help request
          await callAIForIntervention({
            trigger: 'help_request',
            userSpeech: text,
          });
        }
      } else if (intent.intent === 'affirmation') {
        // User is acknowledging AI - mark completion and continue
        console.log('✅ User acknowledged, continuing...');
        conversationManager.completeAIUtterance();

        // If AI was paused, resume
        if (voiceSynthesisRef.current?.isPaused()) {
          voiceSynthesisRef.current.resume();
        }
      } else {
        // User made a statement - just log it
        console.log('💬 User statement noted:', text);
      }
    },
    [voiceSynthesisRef, conversationManager, callAIForIntervention, checkInterruptStorm]
  );

  // Handle voice activity start (user started speaking)
  const handleVoiceActivityStart = useCallback(() => {
    console.log('🎤 User started speaking (VAD)');
    setIsUserSpeaking(true);
    updateAIState('listening');

    // If AI is speaking, pause immediately
    if (voiceSynthesisRef.current?.isSpeaking() && !voiceSynthesisRef.current?.isPaused()) {
      console.log('⏸️ Auto-pausing AI speech (user started speaking)');
      voiceSynthesisRef.current.pause();
    }
  }, [voiceSynthesisRef, updateAIState]);

  // Handle voice activity end (user stopped speaking)
  const handleVoiceActivityEnd = useCallback(() => {
    console.log('🔇 User stopped speaking (VAD)');
    setIsUserSpeaking(false);

    // Return to idle state if not thinking or speaking
    if (aiState === 'listening') {
      updateAIState('idle');
    }
  }, [aiState, updateAIState]);

  // Track canvas changes (idle detection with version tracking)
  useEffect(() => {
    if (!isEnabled || !isMountedRef.current) return;

    // Increment canvas version on any change
    canvasVersionRef.current += 1;
    const currentVersion = canvasVersionRef.current;

    // Check if this is a real change (not just a re-render)
    const hasChanged = currentVersion !== lastCanvasVersionRef.current;

    if (hasChanged) {
      lastCanvasVersionRef.current = currentVersion;

      const visibleElementCount = elements.filter((el: any) => !el.isDeleted).length;

      console.log(`📊 Canvas changed (v${currentVersion}), ${visibleElementCount} elements`);

      // Clear existing timers
      if (analysisTimerRef.current) clearTimeout(analysisTimerRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

      // Debounce analysis
      analysisTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          console.log('⏱️ Canvas change debounce complete');
        }
      }, AI_COACH_CONFIG.canvasDebounceMs);

      // Idle timer - triggers after student stops making changes
      idleTimerRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;

        console.log(`💤 User is idle (no canvas changes for ${AI_COACH_CONFIG.idleThresholdMs}ms)`);

        // Check if mode allows idle interventions
        if (!modeBehavior.allowIdleIntervention) {
          console.log('🚫 Idle intervention disabled in current mode:', coachingMode);
          return;
        }

        // Only intervene if user is not speaking and hasn't intervened recently
        const timeSinceLastIntervention =
          Date.now() - conversationManager.getState().lastInterventionTime;

        if (
          !isUserSpeaking &&
          timeSinceLastIntervention > AI_COACH_CONFIG.minInterventionIntervalMs &&
          visibleElementCount > 0
        ) {
          callAIForIntervention({ trigger: 'idle' });
        }
      }, AI_COACH_CONFIG.idleThresholdMs);
    }

    return () => {
      if (analysisTimerRef.current) clearTimeout(analysisTimerRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [elements, isEnabled, isUserSpeaking, conversationManager, callAIForIntervention, modeBehavior, coachingMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (analysisTimerRef.current) clearTimeout(analysisTimerRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (laserTimerRef.current) clearTimeout(laserTimerRef.current);
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, []);

  return (
    <>
      {/* Voice Input Listener */}
      {isVoiceEnabled && (
        <VoiceInputListener
          isEnabled={isVoiceEnabled}
          onTranscription={handleTranscription}
          onVoiceActivityStart={handleVoiceActivityStart}
          onVoiceActivityEnd={handleVoiceActivityEnd}
        />
      )}
    </>
  );
};
