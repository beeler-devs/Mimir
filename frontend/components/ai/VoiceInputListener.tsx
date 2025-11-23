'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { AI_COACH_CONFIG } from '../../lib/aiCoachConfig';

interface VoiceInputListenerProps {
  isEnabled: boolean;
  onTranscription: (text: string) => void;
  onVoiceActivityStart: () => void;
  onVoiceActivityEnd: () => void;
  onError?: (error: Error) => void;
}

/**
 * Voice Input Listener with VAD (Voice Activity Detection)
 * - Continuously listens to microphone
 * - Detects when user starts/stops speaking (VAD)
 * - Transcribes speech to text in real-time
 * - Uses Web Speech API for STT
 */
export const VoiceInputListener: React.FC<VoiceInputListenerProps> = ({
  isEnabled,
  onTranscription,
  onVoiceActivityStart,
  onVoiceActivityEnd,
  onError,
}) => {
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const isEnabledRef = useRef(isEnabled);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const restartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Keep refs in sync
  useEffect(() => {
    isEnabledRef.current = isEnabled;
  }, [isEnabled]);

  // Clear silence timer helper
  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // Clear restart timeout helper
  const clearRestartTimeout = useCallback(() => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
  }, []);

  // Start recognition
  const startRecognition = useCallback(() => {
    if (!recognitionRef.current || isListeningRef.current || !isMountedRef.current) return;

    try {
      console.log('🎤 Starting voice recognition...');
      recognitionRef.current.start();
      isListeningRef.current = true;
    } catch (err: any) {
      if (err.name !== 'InvalidStateError') {
        console.error('Failed to start recognition:', err);
        onError?.(err);
      }
    }
  }, [onError]);

  // Stop recognition
  const stopRecognition = useCallback(() => {
    if (!recognitionRef.current || !isListeningRef.current) return;

    try {
      console.log('🔇 Stopping voice recognition...');
      recognitionRef.current.stop();
      isListeningRef.current = false;

      // Clear speaking state
      if (isSpeakingRef.current) {
        isSpeakingRef.current = false;
        onVoiceActivityEnd();
      }

      clearSilenceTimer();
      clearRestartTimeout();
    } catch (err) {
      console.error('Failed to stop recognition:', err);
    }
  }, [onVoiceActivityEnd, clearSilenceTimer, clearRestartTimeout]);

  // Initialize speech recognition (only once)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check for browser support
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.error('Speech recognition not supported in this browser');
      onError?.(new Error('Speech recognition not supported'));
      return;
    }

    // Create recognition instance
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    // Handle results (transcription)
    recognition.onresult = (event: any) => {
      if (!isMountedRef.current) return;

      const current = event.resultIndex;
      const transcript = event.results[current][0].transcript;
      const isFinal = event.results[current].isFinal;

      // Detect voice activity start (first result)
      if (!isSpeakingRef.current) {
        console.log('🎤 User started speaking (VAD)');
        isSpeakingRef.current = true;
        onVoiceActivityStart();
      }

      // Clear silence timer (user still speaking)
      clearSilenceTimer();

      // Start silence detection timer
      silenceTimerRef.current = setTimeout(() => {
        if (isSpeakingRef.current && isMountedRef.current) {
          console.log('🔇 User stopped speaking (VAD - silence detected)');
          isSpeakingRef.current = false;
          onVoiceActivityEnd();
        }
      }, AI_COACH_CONFIG.vadSilenceThresholdMs);

      // Send final transcription
      if (isFinal && transcript.trim()) {
        console.log('📝 Transcription:', transcript);
        onTranscription(transcript);
      }
    };

    // Handle errors
    recognition.onerror = (event: any) => {
      if (!isMountedRef.current) return;

      console.error('Speech recognition error:', event.error);

      // Don't treat these as real errors
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }

      // Restart on network errors (common)
      if (event.error === 'network' && isEnabledRef.current) {
        console.log('🔄 Network error, restarting recognition...');
        clearRestartTimeout();
        restartTimeoutRef.current = setTimeout(() => {
          if (isEnabledRef.current && isMountedRef.current) {
            startRecognition();
          }
        }, 1000);
      } else {
        onError?.(new Error(`Speech recognition error: ${event.error}`));
      }
    };

    // Handle end (auto-restart for continuous listening)
    recognition.onend = () => {
      if (!isMountedRef.current) return;

      console.log('🔄 Recognition ended');
      isListeningRef.current = false;

      // Auto-restart if still enabled
      if (isEnabledRef.current) {
        clearRestartTimeout();
        restartTimeoutRef.current = setTimeout(() => {
          if (isEnabledRef.current && isMountedRef.current) {
            startRecognition();
          }
        }, 100);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      isMountedRef.current = false;
      clearSilenceTimer();
      clearRestartTimeout();

      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (err) {
          // Ignore errors on cleanup
        }
      }
    };
  }, [onTranscription, onVoiceActivityStart, onVoiceActivityEnd, onError, clearSilenceTimer, clearRestartTimeout, startRecognition]);

  // Start/stop recognition based on isEnabled
  useEffect(() => {
    if (!recognitionRef.current) return;

    if (isEnabled) {
      startRecognition();
    } else {
      stopRecognition();
    }
  }, [isEnabled, startRecognition, stopRecognition]);

  // This component doesn't render UI
  return null;
};
