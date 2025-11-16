'use client';

import React, { useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

interface VoiceButtonProps {
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Voice assistant button used inside panels or collapsed rails
 */
export const VoiceButton: React.FC<VoiceButtonProps> = ({ size = 'md', className = '' }) => {
  const [isRecording, setIsRecording] = useState(false);

  const handleToggleRecording = () => {
    if (!isRecording) {
      console.log('Starting voice recording...');
      setIsRecording(true);
      // TODO: Implement MediaRecorder API

      setTimeout(() => {
        setIsRecording(false);
        console.log('Recording stopped');
        alert('Voice assistant will be implemented in a future update!');
      }, 3000);
    } else {
      setIsRecording(false);
      console.log('Recording stopped by user');
    }
  };

  const dimension = size === 'sm' ? 'h-8 w-8' : 'h-11 w-11';
  const iconSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  return (
    <button
      onClick={handleToggleRecording}
      className={`
        inline-flex items-center justify-center rounded-full border
        transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60
        ${dimension}
        ${isRecording ? 'bg-red-500 text-white border-transparent' : 'bg-card text-foreground hover:bg-muted border-border'}
        ${className}
      `}
      aria-label={isRecording ? 'Stop recording' : 'Start voice recording'}
    >
      {isRecording ? (
        <MicOff className={iconSize} />
      ) : (
        <Mic className={iconSize} />
      )}
    </button>
  );
};
