'use client';

import React, { useCallback } from 'react';
import { Mic, MicOff, Loader2, AlertCircle, Radio } from 'lucide-react';
import { useVoiceSession, type VoiceTranscript, type UIAction } from '@/hooks/useVoiceSession';

interface VoiceButtonProps {
  size?: 'sm' | 'md';
  className?: string;
  userId: string;
  instanceId: string;
  workspaceContext?: any; // WorkspaceContext from parent
  onTranscript?: (transcript: VoiceTranscript) => void;
  onUIAction?: (action: UIAction) => void;
  disabled?: boolean;
}

/**
 * Voice assistant button with real-time voice tutoring
 *
 * States:
 * - idle: Not active
 * - connecting: Establishing connection
 * - listening: Waiting for user to speak
 * - thinking: Processing user's speech
 * - speaking: AI is responding
 * - error: Error occurred
 */
export const VoiceButton: React.FC<VoiceButtonProps> = ({
  size = 'md',
  className = '',
  userId,
  instanceId,
  workspaceContext,
  onTranscript,
  onUIAction,
  disabled = false
}) => {
  // Debug: Log workspace context
  console.log('[VoiceButton] Rendering with:', {
    hasWorkspaceContext: !!workspaceContext,
    contextKeys: workspaceContext ? Object.keys(workspaceContext) : [],
    instancesCount: workspaceContext?.instances?.length || 0,
    foldersCount: workspaceContext?.folders?.length || 0
  });

  const {
    state,
    isConnected,
    startVoice,
    stopVoice,
    error
  } = useVoiceSession({
    userId,
    instanceId,
    workspaceContext,
    onTranscript,
    onUIAction,
    onError: (err) => {
      console.error('Voice session error:', err);
    }
  });

  const handleClick = useCallback(async () => {
    if (state === 'idle') {
      try {
        await startVoice();
      } catch (err) {
        console.error('Failed to start voice:', err);
      }
    } else {
      stopVoice();
    }
  }, [state, startVoice, stopVoice]);

  const dimension = size === 'sm' ? 'h-8 w-8' : 'h-11 w-11';
  const iconSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  // Determine visual state
  const getButtonStyles = () => {
    if (disabled) {
      return 'bg-muted text-muted-foreground border-border cursor-not-allowed opacity-50';
    }

    switch (state) {
      case 'connecting':
        return 'bg-blue-500 text-white border-transparent animate-pulse';
      case 'listening':
        return 'bg-green-500 text-white border-transparent animate-pulse';
      case 'thinking':
        return 'bg-yellow-500 text-white border-transparent';
      case 'speaking':
        return 'bg-primary text-primary-foreground border-transparent animate-pulse';
      case 'error':
        return 'bg-red-500 text-white border-transparent';
      default:
        return 'bg-card text-foreground hover:bg-muted border-border';
    }
  };

  const getIcon = () => {
    if (state === 'error') {
      return <AlertCircle className={iconSize} />;
    }
    if (state === 'connecting') {
      return <Loader2 className={`${iconSize} animate-spin`} />;
    }
    if (state === 'thinking') {
      return <Loader2 className={`${iconSize} animate-spin`} />;
    }
    if (state === 'speaking') {
      return <Radio className={iconSize} />;
    }
    if (isConnected && state !== 'idle') {
      return <Mic className={iconSize} />;
    }
    return <Mic className={iconSize} />;
  };

  const getAriaLabel = () => {
    switch (state) {
      case 'idle':
        return 'Start voice assistant';
      case 'connecting':
        return 'Connecting to voice assistant...';
      case 'listening':
        return 'Listening... Speak now';
      case 'thinking':
        return 'Processing your speech...';
      case 'speaking':
        return 'AI is speaking. Click to stop';
      case 'error':
        return `Voice error: ${error?.message || 'Unknown error'}`;
      default:
        return 'Voice assistant';
    }
  };

  const getTooltip = () => {
    if (disabled) return 'Voice assistant not available';
    if (state === 'error') return error?.message || 'Voice error';
    return getAriaLabel();
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      title={getTooltip()}
      className={`
        inline-flex items-center justify-center rounded-full border
        transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60
        ${dimension}
        ${getButtonStyles()}
        ${className}
      `}
      aria-label={getAriaLabel()}
      aria-pressed={state !== 'idle'}
    >
      {getIcon()}
    </button>
  );
};
