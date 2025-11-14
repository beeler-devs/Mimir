'use client';

import React, { useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

/**
 * Floating voice assistant button (stub for now)
 */
export const VoiceButton: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);

  const handleToggleRecording = () => {
    if (!isRecording) {
      // Start recording
      console.log('Starting voice recording...');
      setIsRecording(true);
      // TODO: Implement MediaRecorder API
      
      // Stub: Auto-stop after 3 seconds
      setTimeout(() => {
        setIsRecording(false);
        console.log('Recording stopped');
        alert('Voice assistant will be implemented in a future update!');
      }, 3000);
    } else {
      // Stop recording
      setIsRecording(false);
      console.log('Recording stopped by user');
    }
  };

  return (
    <button
      onClick={handleToggleRecording}
      className={`
        fixed bottom-6 right-6 z-50
        w-14 h-14 rounded-full
        flex items-center justify-center
        shadow-lg transition-all
        ${isRecording 
          ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
          : 'bg-primary hover:bg-primary/90'}
        text-white
      `}
      aria-label={isRecording ? 'Stop recording' : 'Start voice recording'}
    >
      {isRecording ? (
        <MicOff className="h-6 w-6" />
      ) : (
        <Mic className="h-6 w-6" />
      )}
    </button>
  );
};

