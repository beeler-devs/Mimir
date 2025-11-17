'use client';

import React, { useEffect, useRef, useCallback } from 'react';

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
  const estimatedDurationRef = useRef<number>(0);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  // Estimate speaking duration (rough: ~150 words per minute)
  const estimateDuration = useCallback((text: string): number => {
    const words = text.split(/\s+/).length;
    const wordsPerMinute = 150;
    const minutes = words / wordsPerMinute;
    return minutes * 60 * 1000; // Convert to milliseconds
  }, []);

  // Track progress
  const startProgressTracking = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    startTimeRef.current = Date.now();

    progressIntervalRef.current = setInterval(() => {
      if (!synthRef.current?.speaking) {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
        return;
      }

      const elapsed = Date.now() - startTimeRef.current;
      const progress = Math.min(elapsed / estimatedDurationRef.current, 1);
      onProgress?.(progress);
    }, 100);
  }, [onProgress]);

  // Speak text
  useEffect(() => {
    if (!text || !synthRef.current || text === lastSpokenTextRef.current) {
      return;
    }

    // Cancel any ongoing speech
    synthRef.current.cancel();

    // Create new utterance
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Estimate duration
    estimatedDurationRef.current = estimateDuration(text);

    // Use a pleasant voice if available
    const voices = synthRef.current.getVoices();
    const preferredVoice = voices.find(
      (voice) =>
        voice.lang.startsWith('en') &&
        (voice.name.includes('Google') ||
          voice.name.includes('Microsoft') ||
          voice.name.includes('Natural'))
    );
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => {
      onStart?.();
      startProgressTracking();
      console.log('🗣️ Started speaking:', text);
    };

    utterance.onend = () => {
      onComplete?.();
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      console.log('✅ Finished speaking');
    };

    utterance.onerror = (error) => {
      console.error('Speech synthesis error:', error);
      onComplete?.();
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };

    utteranceRef.current = utterance;

    // Speak
    synthRef.current.speak(utterance);
    lastSpokenTextRef.current = text;
  }, [text, onStart, onComplete, estimateDuration, startProgressTracking]);

  // Expose controller via ref
  React.useImperativeHandle(ref, () => ({
    pause: () => {
      if (synthRef.current?.speaking) {
        synthRef.current.pause();
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
        console.log('⏸️ Paused speaking');
      }
    },
    resume: () => {
      if (synthRef.current?.paused) {
        synthRef.current.resume();
        startProgressTracking();
        console.log('▶️ Resumed speaking');
      }
    },
    cancel: () => {
      if (synthRef.current) {
        synthRef.current.cancel();
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
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
  }));

  // Cleanup
  useEffect(() => {
    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  return null;
});

EnhancedLiveVoiceSynthesis.displayName = 'EnhancedLiveVoiceSynthesis';
