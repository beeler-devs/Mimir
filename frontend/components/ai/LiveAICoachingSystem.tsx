'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PointerPosition } from './LaserPointerOverlay';
import { VoiceInputListener } from './VoiceInputListener';
import { getConversationStateManager } from '../../lib/conversationState';
import { detectHelpRequest, extractIntent } from '../../lib/semanticAnalyzer';
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

interface LiveAICoachingSystemProps {
  excalidrawRef: React.RefObject<any>;
  voiceSynthesisRef: React.RefObject<VoiceSynthesisController>;
  elements: any[];
  onLaserPositionChange: (position: PointerPosition | null) => void;
  onAddAnnotation: (annotation: { text: string; x: number; y: number; type: string }) => void;
  onSpeakText: (text: string) => void;
  isEnabled: boolean;
  isVoiceEnabled: boolean;
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
  isEnabled,
  isVoiceEnabled,
}) => {
  const conversationManager = getConversationStateManager();
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);

  const analysisTimerRef = useRef<NodeJS.Timeout | null>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const interventionInProgressRef = useRef(false);

  // Configuration
  const IDLE_THRESHOLD_MS = 15000; // 15 seconds
  const ANALYSIS_DEBOUNCE_MS = 3000; // 3 seconds
  const MIN_INTERVENTION_INTERVAL_MS = 30000; // 30 seconds

  // Export canvas as screenshot
  const captureCanvasScreenshot = useCallback(async (): Promise<string | null> => {
    try {
      if (!excalidrawRef.current) return null;

      const api = excalidrawRef.current;
      const { elements: currentElements, appState, files } = api.getSceneElements
        ? api.getSceneElements()
        : { elements, appState: api.getAppState(), files: {} };

      const visibleElements = currentElements.filter((el: any) => !el.isDeleted);
      if (visibleElements.length === 0) return null;

      const excalidrawModule = await import('@excalidraw/excalidraw');
      const { exportToCanvas } = excalidrawModule;

      const canvas = await exportToCanvas({
        elements: visibleElements,
        appState: appState || {},
        files: files || {},
      });

      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error('Failed to capture canvas screenshot:', error);
      return null;
    }
  }, [excalidrawRef, elements]);

  // Execute AI intervention
  const executeIntervention = useCallback(
    (intervention: AIIntervention) => {
      if (intervention.voiceText) {
        console.log('🗣️ AI speaking:', intervention.voiceText);
        conversationManager.startAIUtterance(intervention.voiceText);
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

        // Clear laser after estimated speak duration
        const speakDuration = intervention.voiceText
          ? intervention.voiceText.split('.').length * 3000
          : 5000;
        setTimeout(() => {
          onLaserPositionChange(null);
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
    },
    [onSpeakText, onLaserPositionChange, onAddAnnotation, conversationManager]
  );

  // Call AI API for intervention
  const callAIForIntervention = useCallback(
    async (context: {
      trigger: 'idle' | 'help_request' | 'interrupt';
      userSpeech?: string;
    }) => {
      if (interventionInProgressRef.current) return;

      const conversationState = conversationManager.getSummaryForAPI();
      const screenshot = await captureCanvasScreenshot();

      if (!screenshot) {
        console.warn('Failed to capture screenshot');
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

      interventionInProgressRef.current = true;

      try {
        const response = await fetch('/api/ai-coach-conversational', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            screenshot,
            elements: elementData,
            conversationContext: {
              ...conversationState,
              trigger: context.trigger,
              userSpeech: context.userSpeech,
            },
          }),
        });

        if (!response.ok) {
          throw new Error('AI coaching request failed');
        }

        const intervention: AIIntervention = await response.json();
        executeIntervention(intervention);
      } catch (error) {
        console.error('❌ AI intervention failed:', error);
      } finally {
        interventionInProgressRef.current = false;
      }
    },
    [elements, conversationManager, captureCanvasScreenshot, executeIntervention]
  );

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
    [voiceSynthesisRef, conversationManager, callAIForIntervention]
  );

  // Handle voice activity start (user started speaking)
  const handleVoiceActivityStart = useCallback(() => {
    console.log('🎤 User started speaking (VAD)');
    setIsUserSpeaking(true);

    // If AI is speaking, pause immediately
    if (voiceSynthesisRef.current?.isSpeaking() && !voiceSynthesisRef.current?.isPaused()) {
      console.log('⏸️ Auto-pausing AI speech (user started speaking)');
      voiceSynthesisRef.current.pause();
    }
  }, [voiceSynthesisRef]);

  // Handle voice activity end (user stopped speaking)
  const handleVoiceActivityEnd = useCallback(() => {
    console.log('🔇 User stopped speaking (VAD)');
    setIsUserSpeaking(false);
  }, []);

  // Track canvas changes (idle detection)
  useEffect(() => {
    if (!isEnabled) return;

    // Clear existing timers
    if (analysisTimerRef.current) clearTimeout(analysisTimerRef.current);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

    // Debounce analysis
    analysisTimerRef.current = setTimeout(() => {
      console.log('⏱️ Canvas change debounce complete');
    }, ANALYSIS_DEBOUNCE_MS);

    // Idle timer
    idleTimerRef.current = setTimeout(() => {
      console.log('💤 User is idle on canvas');

      // Only intervene if user is not speaking and hasn't intervened recently
      const timeSinceLastIntervention =
        Date.now() - conversationManager.getState().lastInterventionTime;

      if (
        !isUserSpeaking &&
        timeSinceLastIntervention > MIN_INTERVENTION_INTERVAL_MS &&
        elements.length > 0
      ) {
        callAIForIntervention({ trigger: 'idle' });
      }
    }, IDLE_THRESHOLD_MS);

    return () => {
      if (analysisTimerRef.current) clearTimeout(analysisTimerRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [elements, isEnabled, isUserSpeaking, conversationManager, callAIForIntervention]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (analysisTimerRef.current) clearTimeout(analysisTimerRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
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
