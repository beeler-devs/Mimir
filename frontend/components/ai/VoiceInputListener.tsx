'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';

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
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastTranscriptRef = useRef<string>('');

  // VAD configuration
  const SILENCE_THRESHOLD_MS = 1500; // 1.5 seconds of silence = end of speech

  // Initialize speech recognition
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
    recognition.continuous = true; // Keep listening
    recognition.interimResults = true; // Get partial results
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    // Handle results (transcription)
    recognition.onresult = (event: any) => {
      const current = event.resultIndex;
      const transcript = event.results[current][0].transcript;
      const isFinal = event.results[current].isFinal;

      // Detect voice activity start (first result)
      if (!isSpeaking) {
        console.log('🎤 User started speaking (VAD)');
        setIsSpeaking(true);
        onVoiceActivityStart();
      }

      // Clear silence timer (user still speaking)
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }

      // Start silence detection timer
      silenceTimerRef.current = setTimeout(() => {
        if (isSpeaking) {
          console.log('🔇 User stopped speaking (VAD - silence detected)');
          setIsSpeaking(false);
          onVoiceActivityEnd();
        }
      }, SILENCE_THRESHOLD_MS);

      // Send final transcription
      if (isFinal && transcript.trim()) {
        console.log('📝 Transcription:', transcript);
        lastTranscriptRef.current = transcript;
        onTranscription(transcript);
      }
    };

    // Handle errors
    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);

      // Restart on network errors (common)
      if (event.error === 'network') {
        console.log('🔄 Network error, restarting recognition...');
        setTimeout(() => {
          if (isEnabled && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch (err) {
              console.error('Failed to restart recognition:', err);
            }
          }
        }, 1000);
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        onError?.(new Error(`Speech recognition error: ${event.error}`));
      }
    };

    // Handle end (auto-restart for continuous listening)
    recognition.onend = () => {
      console.log('🔄 Recognition ended, restarting...');
      setIsListening(false);

      // Auto-restart if still enabled
      if (isEnabled && recognitionRef.current) {
        try {
          setTimeout(() => {
            if (recognitionRef.current && isEnabled) {
              recognitionRef.current.start();
              setIsListening(true);
            }
          }, 100);
        } catch (err) {
          console.error('Failed to restart recognition:', err);
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (err) {
          // Ignore errors on cleanup
        }
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, [isEnabled, onTranscription, onVoiceActivityStart, onVoiceActivityEnd, onError, isSpeaking]);

  // Start/stop recognition based on isEnabled
  useEffect(() => {
    if (!recognitionRef.current) return;

    if (isEnabled && !isListening) {
      try {
        console.log('🎤 Starting voice recognition...');
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err: any) {
        if (err.name !== 'InvalidStateError') {
          console.error('Failed to start recognition:', err);
          onError?.(err);
        }
      }
    } else if (!isEnabled && isListening) {
      try {
        console.log('🔇 Stopping voice recognition...');
        recognitionRef.current.stop();
        setIsListening(false);
        setIsSpeaking(false);
      } catch (err) {
        console.error('Failed to stop recognition:', err);
      }
    }
  }, [isEnabled, isListening, onError]);

  // This component doesn't render UI
  return null;
};
