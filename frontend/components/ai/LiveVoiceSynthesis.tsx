'use client';

import React, { useEffect, useRef } from 'react';

interface LiveVoiceSynthesisProps {
  text: string | null;
  onComplete?: () => void;
}

/**
 * Live voice synthesis component - speaks text immediately when it changes
 * Uses Web Speech API for real-time TTS
 */
export const LiveVoiceSynthesis: React.FC<LiveVoiceSynthesisProps> = ({
  text,
  onComplete,
}) => {
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const lastSpokenTextRef = useRef<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  useEffect(() => {
    if (!text || !synthRef.current || text === lastSpokenTextRef.current) {
      return;
    }

    // Cancel any ongoing speech
    synthRef.current.cancel();

    // Create new utterance
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95; // Slightly slower for clarity
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

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

    utterance.onend = () => {
      onComplete?.();
    };

    utterance.onerror = (error) => {
      console.error('Speech synthesis error:', error);
      onComplete?.();
    };

    // Speak
    synthRef.current.speak(utterance);
    lastSpokenTextRef.current = text;

    console.log('🗣️ Speaking:', text);
  }, [text, onComplete]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);

  return null; // This component doesn't render anything
};
