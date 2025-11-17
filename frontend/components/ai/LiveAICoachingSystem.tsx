'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PointerPosition } from './LaserPointerOverlay';

interface AIContextState {
  canvasContent: {
    screenshot: string;
    elements: any[];
    lastAnalyzed: number;
  } | null;
  userActivity: {
    lastActionTime: number;
    actionCount: number;
    isIdle: boolean;
  };
  aiUnderstanding: {
    currentTopic: string | null;
    detectedConcepts: string[];
    strugglingWith: string | null;
    lastInterventionTime: number;
  };
  shouldIntervene: boolean;
}

interface AIIntervention {
  type: 'voice' | 'annotation' | 'both';
  voiceText?: string;
  laserPosition?: {
    x: number;
    y: number;
    style?: 'point' | 'circle' | 'highlight' | 'ripple';
  };
  annotation?: {
    text: string; // Can include LaTeX wrapped in $$...$$
    position: { x: number; y: number };
    type: 'hint' | 'explanation' | 'correction';
  };
}

interface LiveAICoachingSystemProps {
  excalidrawRef: React.RefObject<any>;
  elements: any[];
  onLaserPositionChange: (position: PointerPosition | null) => void;
  onAddAnnotation: (annotation: { text: string; x: number; y: number; type: string }) => void;
  onSpeakText: (text: string) => void;
  isEnabled: boolean;
}

/**
 * Live AI Coaching System - Continuously monitors canvas and provides
 * proactive assistance through voice, laser pointer, and canvas annotations
 */
export const LiveAICoachingSystem: React.FC<LiveAICoachingSystemProps> = ({
  excalidrawRef,
  elements,
  onLaserPositionChange,
  onAddAnnotation,
  onSpeakText,
  isEnabled,
}) => {
  const [aiState, setAiState] = useState<AIContextState>({
    canvasContent: null,
    userActivity: {
      lastActionTime: Date.now(),
      actionCount: 0,
      isIdle: false,
    },
    aiUnderstanding: {
      currentTopic: null,
      detectedConcepts: [],
      strugglingWith: null,
      lastInterventionTime: 0,
    },
    shouldIntervene: false,
  });

  const analysisTimerRef = useRef<NodeJS.Timeout | null>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const interventionInProgressRef = useRef(false);

  // Configuration
  const IDLE_THRESHOLD_MS = 15000; // 15 seconds of inactivity
  const ANALYSIS_DEBOUNCE_MS = 3000; // 3 seconds after last change
  const MIN_INTERVENTION_INTERVAL_MS = 30000; // 30 seconds between AI interventions
  const HELP_KEYWORDS = ['help', '?', 'stuck', 'confused', 'hint'];

  // Detect if user is asking for help
  const detectHelpRequest = useCallback((elements: any[]): boolean => {
    const recentTextElements = elements.filter(
      (el) =>
        el.type === 'text' &&
        el.text &&
        Date.now() - el.created < 5000 // Created in last 5 seconds
    );

    return recentTextElements.some((el) => {
      const text = el.text.toLowerCase();
      return HELP_KEYWORDS.some((keyword) => text.includes(keyword));
    });
  }, []);

  // Export canvas as screenshot
  const captureCanvasScreenshot = useCallback(async (): Promise<string | null> => {
    try {
      if (!excalidrawRef.current) return null;

      const api = excalidrawRef.current;
      const { elements: currentElements, appState, files } = api.getSceneElements
        ? api.getSceneElements()
        : { elements, appState: api.getAppState(), files: {} };

      // Filter visible elements
      const visibleElements = currentElements.filter((el: any) => !el.isDeleted);

      if (visibleElements.length === 0) return null;

      // Dynamically import Excalidraw utilities
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

  // Analyze canvas content and decide if AI should intervene
  const analyzeCanvasAndDecideIntervention = useCallback(async () => {
    if (!isEnabled || interventionInProgressRef.current) return;

    const now = Date.now();
    const timeSinceLastIntervention = now - aiState.aiUnderstanding.lastInterventionTime;

    // Don't intervene too frequently
    if (timeSinceLastIntervention < MIN_INTERVENTION_INTERVAL_MS) {
      console.log('⏳ Too soon for another intervention');
      return;
    }

    // Check if user asked for help explicitly
    const userAskedForHelp = detectHelpRequest(elements);

    // Check if user is idle
    const isUserIdle = aiState.userActivity.isIdle;

    // Decide if we should intervene
    const shouldIntervene = userAskedForHelp || (isUserIdle && elements.length > 0);

    if (!shouldIntervene) {
      console.log('🤖 No intervention needed yet');
      return;
    }

    console.log('🎯 AI intervention triggered:', {
      reason: userAskedForHelp ? 'User asked for help' : 'User is idle',
      elementCount: elements.length,
    });

    // Capture screenshot
    const screenshot = await captureCanvasScreenshot();
    if (!screenshot) {
      console.warn('Failed to capture screenshot');
      return;
    }

    // Prepare element data
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

    // Call AI API for live coaching
    interventionInProgressRef.current = true;

    try {
      const response = await fetch('/api/ai-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          screenshot,
          elements: elementData,
          context: {
            isUserIdle,
            userAskedForHelp,
            previousTopic: aiState.aiUnderstanding.currentTopic,
            detectedConcepts: aiState.aiUnderstanding.detectedConcepts,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('AI coaching request failed');
      }

      const intervention: AIIntervention = await response.json();

      // Execute intervention
      if (intervention.voiceText) {
        console.log('🗣️ AI speaking:', intervention.voiceText);
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

        // Clear laser after speaking duration (estimate 5 seconds per sentence)
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

      // Update AI state
      setAiState((prev) => ({
        ...prev,
        aiUnderstanding: {
          ...prev.aiUnderstanding,
          lastInterventionTime: Date.now(),
        },
      }));
    } catch (error) {
      console.error('❌ AI intervention failed:', error);
    } finally {
      interventionInProgressRef.current = false;
    }
  }, [
    isEnabled,
    elements,
    aiState,
    captureCanvasScreenshot,
    detectHelpRequest,
    onLaserPositionChange,
    onAddAnnotation,
    onSpeakText,
  ]);

  // Track user activity when elements change
  useEffect(() => {
    if (!isEnabled) return;

    // User made a change
    setAiState((prev) => ({
      ...prev,
      userActivity: {
        lastActionTime: Date.now(),
        actionCount: prev.userActivity.actionCount + 1,
        isIdle: false,
      },
    }));

    // Clear existing timers
    if (analysisTimerRef.current) {
      clearTimeout(analysisTimerRef.current);
    }
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }

    // Debounce analysis - wait for user to stop making changes
    analysisTimerRef.current = setTimeout(() => {
      console.log('⏱️ Analysis debounce complete, analyzing...');
      analyzeCanvasAndDecideIntervention();
    }, ANALYSIS_DEBOUNCE_MS);

    // Start idle timer
    idleTimerRef.current = setTimeout(() => {
      console.log('💤 User is idle');
      setAiState((prev) => ({
        ...prev,
        userActivity: {
          ...prev.userActivity,
          isIdle: true,
        },
      }));

      // Trigger analysis when user becomes idle
      analyzeCanvasAndDecideIntervention();
    }, IDLE_THRESHOLD_MS);

    return () => {
      if (analysisTimerRef.current) clearTimeout(analysisTimerRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [elements, isEnabled, analyzeCanvasAndDecideIntervention]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (analysisTimerRef.current) clearTimeout(analysisTimerRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  // This component doesn't render UI - it's a background system
  return null;
};
