/**
 * Main hook for voice assistant session
 * Handles WebSocket connection, audio streaming, and state management
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useAudioRecorder } from './useAudioRecorder';
import { useAudioPlayback } from './useAudioPlayback';
import { int16ToHex, hexToInt16 } from '@/lib/voice/audioUtils';

export type VoiceState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface VoiceTranscript {
  type: 'user' | 'assistant';
  text: string;
  isFinal: boolean;
  timestamp: Date;
}

export interface UIAction {
  type: string;
  [key: string]: any;
}

export interface UseVoiceSessionOptions {
  userId: string;
  instanceId: string;
  backendUrl?: string;
  workspaceContext?: any; // WorkspaceContext from buildWorkspaceContext
  onTranscript?: (transcript: VoiceTranscript) => void;
  onUIAction?: (action: UIAction) => void;
  onError?: (error: Error) => void;
}

export interface UseVoiceSessionReturn {
  state: VoiceState;
  isConnected: boolean;
  startVoice: () => Promise<void>;
  stopVoice: () => void;
  muteAssistant: () => void;
  unmuteAssistant: () => void;
  isMuted: boolean;
  currentTranscript: VoiceTranscript | null;
  error: Error | null;
  updateWorkspaceContext: (context: any) => void;
}

export function useVoiceSession(options: UseVoiceSessionOptions): UseVoiceSessionReturn {
  const {
    userId,
    instanceId,
    backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'ws://localhost:8001',
    onTranscript,
    onUIAction,
    onError
  } = options;

  const [state, setState] = useState<VoiceState>('idle');
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState<VoiceTranscript | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 3;

  // Audio recorder
  const {
    startRecording,
    stopRecording,
    isRecording
  } = useAudioRecorder({
    onAudioData: (audioData) => {
      // Send audio to backend
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const hex = int16ToHex(audioData);
        wsRef.current.send(JSON.stringify({
          type: 'audio',
          audio: hex
        }));
      }
    },
    onError: (err) => {
      console.error('Audio recorder error:', err);
      setError(err);
      if (onError) onError(err);
    }
  });

  // Audio playback
  const {
    playAudio,
    stopAudio,
    isPlaying
  } = useAudioPlayback({
    onPlaybackEnd: () => {
      if (state === 'speaking') {
        setState('listening');
      }
    }
  });

  // Handle WebSocket messages
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'connected':
          sessionIdRef.current = data.session_id;
          setIsConnected(true);
          setState('listening');
          console.log('Voice session connected:', data.session_id);
          break;

        case 'partial_transcript':
          const partialTranscript: VoiceTranscript = {
            type: 'user',
            text: data.transcript,
            isFinal: false,
            timestamp: new Date()
          };
          setCurrentTranscript(partialTranscript);
          if (onTranscript) onTranscript(partialTranscript);
          break;

        case 'final_transcript':
          const finalTranscript: VoiceTranscript = {
            type: 'user',
            text: data.transcript,
            isFinal: true,
            timestamp: new Date()
          };
          setCurrentTranscript(finalTranscript);
          if (onTranscript) onTranscript(finalTranscript);
          setState('thinking');
          break;

        case 'assistant_transcript':
          const assistantTranscript: VoiceTranscript = {
            type: 'assistant',
            text: data.transcript,
            isFinal: true,
            timestamp: new Date()
          };
          setCurrentTranscript(assistantTranscript);
          if (onTranscript) onTranscript(assistantTranscript);
          break;

        case 'audio_chunk':
          if (!isMuted && data.audio) {
            // Convert hex to audio and play with stream_id
            const audioData = hexToInt16(data.audio);
            const streamId = data.stream_id || undefined;
            playAudio(audioData, streamId);
            if (state !== 'speaking') {
              setState('speaking');
            }
          }
          break;

        case 'barge_in':
          // User interrupted, stop playback
          stopAudio();
          setState('listening');
          console.log('Barge-in detected');
          break;

        case 'ui_actions':
          if (data.actions && onUIAction) {
            data.actions.forEach((action: UIAction) => {
              onUIAction(action);
            });
          }
          break;

        case 'state_change':
          // Update state based on backend state
          const backendState = data.state;
          if (backendState === 'user_speaking') {
            setState('listening');
          } else if (backendState === 'processing') {
            setState('thinking');
          } else if (backendState === 'assistant_speaking') {
            setState('speaking');
          } else if (backendState === 'idle') {
            setState('listening');
          }
          break;

        case 'error':
        case 'stt_error':
        case 'tts_error':
          const err = new Error(data.error || 'Voice session error');
          setError(err);
          if (onError) onError(err);
          setState('error');
          break;

        case 'ping':
          // Respond to ping
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'pong' }));
          }
          break;

        case 'pong':
          // Pong received
          break;

        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (err) {
      console.error('Error parsing WebSocket message:', err);
    }
  }, [state, isMuted, onTranscript, onUIAction, onError, playAudio, stopAudio]);

  // Connect to WebSocket
  const connect = useCallback(async () => {
    try {
      setState('connecting');
      setError(null);

      // Construct WebSocket URL
      const wsUrl = backendUrl.replace(/^http/, 'ws') + '/ws/voice';

      // Create WebSocket connection
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // WebSocket event handlers
      ws.onopen = () => {
        console.log('WebSocket connected');

        // Debug: Log context being sent
        console.log('[useVoiceSession] Sending auth with context:', {
          hasContext: !!options.workspaceContext,
          contextSize: options.workspaceContext ? JSON.stringify(options.workspaceContext).length : 0,
          instancesCount: options.workspaceContext?.instances?.length || 0
        });

        // Send auth message with workspace context
        ws.send(JSON.stringify({
          type: 'auth',
          user_id: userId,
          instance_id: instanceId,
          workspace_context: options.workspaceContext
        }));
      };

      ws.onmessage = handleMessage;

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        const err = new Error('WebSocket connection error');
        setError(err);
        if (onError) onError(err);
      };

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        setIsConnected(false);

        // Attempt reconnection if not intentional
        if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          console.log(`Reconnecting (attempt ${reconnectAttemptsRef.current})...`);
          setTimeout(() => {
            connect();
          }, 2000 * reconnectAttemptsRef.current);
        } else {
          setState('idle');
        }
      };

    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to connect');
      setError(error);
      if (onError) onError(error);
      setState('error');
      throw error;
    }
  }, [userId, instanceId, backendUrl, handleMessage, onError]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnected');
      wsRef.current = null;
    }
    sessionIdRef.current = null;
    setIsConnected(false);
    reconnectAttemptsRef.current = 0;
  }, []);

  // Start voice session
  const startVoice = useCallback(async () => {
    try {
      // Connect to WebSocket
      await connect();

      // Start recording
      await startRecording();

      setState('listening');
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to start voice');
      setError(error);
      if (onError) onError(error);
      setState('error');
      throw error;
    }
  }, [connect, startRecording, onError]);

  // Stop voice session
  const stopVoice = useCallback(() => {
    stopRecording();
    stopAudio();
    disconnect();
    setState('idle');
    setCurrentTranscript(null);
  }, [stopRecording, stopAudio, disconnect]);

  // Mute assistant audio
  const muteAssistant = useCallback(() => {
    setIsMuted(true);
    stopAudio();
  }, [stopAudio]);

  // Unmute assistant audio
  const unmuteAssistant = useCallback(() => {
    setIsMuted(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVoice();
    };
  }, [stopVoice]);

  const updateWorkspaceContext = useCallback((context: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'update_context',
        workspace_context: context
      }));
      console.log('Updated workspace context for voice session');
    }
  }, []);

  return {
    state,
    isConnected,
    startVoice,
    stopVoice,
    muteAssistant,
    unmuteAssistant,
    isMuted,
    currentTranscript,
    error,
    updateWorkspaceContext
  };
}
