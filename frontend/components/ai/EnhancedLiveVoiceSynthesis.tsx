'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { AI_COACH_CONFIG } from '../../lib/aiCoachConfig';

interface EnhancedLiveVoiceSynthesisProps {
  text: string | null;
  onStart?: () => void;
  onComplete?: () => void;
  onProgress?: (progress: number) => void; // 0-1
}

export interface VoiceSynthesisController {
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  isPaused: () => boolean;
  isSpeaking: () => boolean;
  getProgress: () => number; // 0-1 estimate
}

/**
 * Enhanced live voice synthesis with pause/resume support
 * Exposes controller for interrupt handling
 */
export const EnhancedLiveVoiceSynthesis = React.forwardRef<
  VoiceSynthesisController,
  EnhancedLiveVoiceSynthesisProps
>(({ text, onStart, onComplete, onProgress }, ref) => {
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const lastSpokenTextRef = useRef<string>('');
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  const estimatedDurationRef = useRef<number>(0);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const voicesLoadedRef = useRef(false);

  // Initialize speech synthesis
  useEffect(() => {
    if (typeof window === 'undefined') return;

    synthRef.current = window.speechSynthesis;

    // Handle voices loaded event
    const handleVoicesChanged = () => {
      voicesLoadedRef.current = true;
    };

    if (synthRef.current) {
      synthRef.current.addEventListener('voiceschanged', handleVoicesChanged);
      // Check if voices are already loaded
      if (synthRef.current.getVoices().length > 0) {
        voicesLoadedRef.current = true;
      }
    }

    return () => {
      if (synthRef.current) {
        synthRef.current.removeEventListener('voiceschanged', handleVoicesChanged);
      }
    };
  }, []);

  // Estimate speaking duration using configured WPM
  const estimateDuration = useCallback((text: string): number => {
    const words = text.split(/\s+/).length;
    const minutes = words / AI_COACH_CONFIG.estimatedWordsPerMinute;
    return minutes * 60 * 1000; // Convert to milliseconds
  }, []);

  // Clear progress interval
  const clearProgressInterval = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  // Track progress
  const startProgressTracking = useCallback(() => {
    clearProgressInterval();

    startTimeRef.current = Date.now();

    progressIntervalRef.current = setInterval(() => {
      if (!isMountedRef.current) {
        clearProgressInterval();
        return;
      }

      // Don't update progress if paused
      if (synthRef.current?.paused) {
        return;
      }

      if (!synthRef.current?.speaking) {
        clearProgressInterval();
        return;
      }

      const elapsed = Date.now() - startTimeRef.current;
      const progress = Math.min(elapsed / estimatedDurationRef.current, 1);
      onProgress?.(progress);
    }, AI_COACH_CONFIG.progressUpdateIntervalMs);
  }, [onProgress, clearProgressInterval]);

  // Get preferred voice
  const getPreferredVoice = useCallback((): SpeechSynthesisVoice | null => {
    if (!synthRef.current) return null;

    const voices = synthRef.current.getVoices();
    if (voices.length === 0) return null;

    // Try to find a high-quality English voice
    const preferredVoice = voices.find(
      (voice) =>
        voice.lang.startsWith('en') &&
        (voice.name.includes('Google') ||
          voice.name.includes('Microsoft') ||
          voice.name.includes('Natural'))
    );

    return preferredVoice || voices.find((voice) => voice.lang.startsWith('en')) || null;
  }, []);

  // Speak text
  useEffect(() => {
    if (!text || !synthRef.current) {
      return;
    }

    // Don't repeat the exact same text
    if (text === lastSpokenTextRef.current) {
      return;
    }

    // Cancel any ongoing speech
    synthRef.current.cancel();
    clearProgressInterval();

    // Create new utterance
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Estimate duration
    estimatedDurationRef.current = estimateDuration(text);

    // Set voice (if available)
    const voice = getPreferredVoice();
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onstart = () => {
      if (!isMountedRef.current) return;
      onStart?.();
      startProgressTracking();
      console.log('🗣️ Started speaking:', text.substring(0, 50) + '...');
    };

    utterance.onend = () => {
      if (!isMountedRef.current) return;
      onComplete?.();
      clearProgressInterval();
      console.log('✅ Finished speaking');
    };

    utterance.onerror = (error) => {
      if (!isMountedRef.current) return;
      console.error('Speech synthesis error:', error);
      onComplete?.();
      clearProgressInterval();
    };

    utteranceRef.current = utterance;

    // Speak
    synthRef.current.speak(utterance);
    lastSpokenTextRef.current = text;
  }, [text, onStart, onComplete, estimateDuration, getPreferredVoice, startProgressTracking, clearProgressInterval]);

  // Expose controller via ref
  React.useImperativeHandle(
    ref,
    () => ({
      pause: () => {
        if (synthRef.current?.speaking && !synthRef.current?.paused) {
          synthRef.current.pause();
          pausedTimeRef.current = Date.now();
          console.log('⏸️ Paused speaking');
        }
      },
      resume: () => {
        if (synthRef.current?.paused) {
          synthRef.current.resume();

          // Adjust start time to account for pause duration
          if (pausedTimeRef.current && startTimeRef.current) {
            const pauseDuration = Date.now() - pausedTimeRef.current;
            startTimeRef.current += pauseDuration;
          }

          console.log('▶️ Resumed speaking');
        }
      },
      cancel: () => {
        if (synthRef.current) {
          synthRef.current.cancel();
          clearProgressInterval();
          lastSpokenTextRef.current = ''; // Allow re-speaking after cancel
          console.log('⏹️ Cancelled speaking');
        }
      },
      isPaused: () => {
        return synthRef.current?.paused ?? false;
      },
      isSpeaking: () => {
        return synthRef.current?.speaking ?? false;
      },
      getProgress: () => {
        if (!startTimeRef.current || !estimatedDurationRef.current) return 0;
        const elapsed = Date.now() - startTimeRef.current;
        return Math.min(elapsed / estimatedDurationRef.current, 1);
      },
    }),
    [clearProgressInterval]
  );

  // Cleanup
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (synthRef.current) {
        synthRef.current.cancel();
      }
      clearProgressInterval();
    };
  }, [clearProgressInterval]);

  return null;
});

EnhancedLiveVoiceSynthesis.displayName = 'EnhancedLiveVoiceSynthesis';
