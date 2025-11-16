'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface WebSocketMessage {
  type: 'connected' | 'frame' | 'progress' | 'error' | 'complete';
  job_id: string;
  frame_number?: number;
  data?: string; // base64 encoded frame
  timestamp?: number;
  phase?: 'code_generation' | 'rendering';
  message?: string;
  percentage?: number;
  error?: string;
  video_url?: string;
  total_frames?: number;
}

export interface UseManimWebSocketOptions {
  jobId: string | null;
  enabled?: boolean;
  onFrame?: (frameNumber: number, frameData: string) => void;
  onProgress?: (phase: string, message: string, percentage: number) => void;
  onError?: (error: string) => void;
  onComplete?: (videoUrl?: string, totalFrames?: number) => void;
  fallbackToPolling?: boolean;
  onFallback?: () => void;
}

export interface UseManimWebSocketReturn {
  connected: boolean;
  error: string | null;
  reconnect: () => void;
  disconnect: () => void;
}

const WEBSOCKET_TIMEOUT = 2000; // 2 seconds to detect connection failure

export function useManimWebSocket({
  jobId,
  enabled = true,
  onFrame,
  onProgress,
  onError,
  onComplete,
  fallbackToPolling = true,
  onFallback,
}: UseManimWebSocketOptions): UseManimWebSocketReturn {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasFallenBackRef = useRef(false);
  
  // Use refs for callbacks to prevent unnecessary re-renders
  const onFrameRef = useRef(onFrame);
  const onProgressRef = useRef(onProgress);
  const onErrorRef = useRef(onError);
  const onCompleteRef = useRef(onComplete);
  const onFallbackRef = useRef(onFallback);
  
  // Update refs when callbacks change
  useEffect(() => {
    onFrameRef.current = onFrame;
    onProgressRef.current = onProgress;
    onErrorRef.current = onError;
    onCompleteRef.current = onComplete;
    onFallbackRef.current = onFallback;
  }, [onFrame, onProgress, onError, onComplete, onFallback]);

  const getWebSocketUrl = useCallback(() => {
    const backendUrl = process.env.NEXT_PUBLIC_MANIM_WORKER_URL || process.env.MANIM_WORKER_URL || 'http://localhost:8001';
    // Convert http:// to ws:// and https:// to wss://
    const wsUrl = backendUrl.replace(/^http/, 'ws').replace(/^https/, 'wss');
    const fullUrl = `${wsUrl}/ws/manim/${jobId}`;
    console.log(`Connecting to WebSocket: ${fullUrl}`);
    return fullUrl;
  }, [jobId]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
    }
    setConnected(false);
  }, []);

  const connect = useCallback(async () => {
    if (!jobId || !enabled || hasFallenBackRef.current) {
      return;
    }

    // Clean up existing connection
    disconnect();

    // First, verify backend is reachable
    try {
      const backendUrl = process.env.NEXT_PUBLIC_MANIM_WORKER_URL || process.env.MANIM_WORKER_URL || 'http://localhost:8001';
      const healthCheck = await fetch(`${backendUrl}/health`);
      if (!healthCheck.ok) {
        console.error('[WebSocket] Backend health check failed');
        if (fallbackToPolling && !hasFallenBackRef.current) {
          hasFallenBackRef.current = true;
          setError('Backend not reachable, using polling mode');
          onFallbackRef.current?.();
        }
        return;
      }
      console.log('[WebSocket] Backend is reachable');
    } catch (err) {
      console.error('[WebSocket] Cannot reach backend:', err);
      if (fallbackToPolling && !hasFallenBackRef.current) {
        hasFallenBackRef.current = true;
        setError('Backend not reachable, using polling mode');
        onFallback?.();
      }
      return;
    }

    try {
      const url = getWebSocketUrl();
      console.log(`[WebSocket] Attempting to connect to: ${url}`);
      console.log(`[WebSocket] Job ID: ${jobId}`);
      
      const ws = new WebSocket(url);
      
      // Log connection state changes
      const logState = () => {
        const states = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
        console.log(`[WebSocket] State changed to: ${states[ws.readyState]} (${ws.readyState})`);
      };
      
      // Monitor state changes (for debugging)
      let stateCheckInterval: NodeJS.Timeout | null = null;
      if (process.env.NODE_ENV === 'development') {
        stateCheckInterval = setInterval(() => {
          logState();
          if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.OPEN) {
            if (stateCheckInterval) {
              clearInterval(stateCheckInterval);
              stateCheckInterval = null;
            }
          }
        }, 100);
      }

      // Set connection timeout
      connectionTimeoutRef.current = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
          if (fallbackToPolling && !hasFallenBackRef.current) {
            hasFallenBackRef.current = true;
            setError('WebSocket connection timeout, falling back to polling');
            onFallback?.();
          }
        }
      }, WEBSOCKET_TIMEOUT);

      ws.onopen = () => {
        clearTimeout(connectionTimeoutRef.current!);
        if (stateCheckInterval) {
          clearInterval(stateCheckInterval);
        }
        setConnected(true);
        setError(null);
        console.log(`[WebSocket] ✓ Connected successfully for job ${jobId}`);
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'connected':
              console.log(`WebSocket connected for job ${message.job_id}`);
              break;
            
                    case 'frame':
                      if (message.frame_number !== undefined && message.data) {
                        onFrameRef.current?.(message.frame_number, message.data);
                      }
                      break;
                    
                    case 'progress':
                      if (message.phase && message.message !== undefined && message.percentage !== undefined) {
                        onProgressRef.current?.(message.phase, message.message, message.percentage);
                      }
                      break;
                    
                    case 'error':
                      setError(message.error || 'Unknown error');
                      onErrorRef.current?.(message.error || 'Unknown error');
                      break;
                    
                    case 'complete':
                      onCompleteRef.current?.(message.video_url, message.total_frames);
                      // Keep connection open for a bit, then disconnect
                      setTimeout(() => disconnect(), 1000);
                      break;
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error event:', event);
        console.error('WebSocket readyState:', ws.readyState, '(0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)');
        console.error('WebSocket URL:', url);
        // WebSocket error events don't always have detailed info
        // If readyState is already CLOSED (3), the connection failed immediately
        if (ws.readyState === WebSocket.CLOSED) {
          console.error('WebSocket connection failed immediately - check if backend is running and URL is correct');
          setError('WebSocket connection failed - is the backend running?');
          // Trigger fallback immediately if connection is already closed
          if (fallbackToPolling && !hasFallenBackRef.current) {
            hasFallenBackRef.current = true;
            onFallback?.();
          }
        } else {
          setError('WebSocket connection error');
          // Don't immediately fallback on error - wait for close event
        }
      };

      ws.onclose = (event) => {
        clearTimeout(connectionTimeoutRef.current!);
        if (stateCheckInterval) {
          clearInterval(stateCheckInterval);
        }
        setConnected(false);
        
        console.log(`[WebSocket] Connection closed: code=${event.code}, reason="${event.reason || 'none'}", wasClean=${event.wasClean}`);
        
        // Common close codes:
        // 1000 = Normal closure
        // 1001 = Going away
        // 1006 = Abnormal closure (no close frame received)
        // 1011 = Internal server error
        
        if (event.code === 1006) {
          console.error('[WebSocket] Connection closed abnormally (1006) - server may not be running or endpoint is incorrect');
        }
        
        // If connection closed abnormally and we haven't fallen back, trigger fallback
        if (!event.wasClean && event.code !== 1000 && fallbackToPolling && !hasFallenBackRef.current) {
          console.log('[WebSocket] Falling back to polling mode');
          hasFallenBackRef.current = true;
          setError('WebSocket connection closed, using polling mode');
          onFallback?.();
        }
        // Only attempt reconnect if it was a normal closure and not falling back
        else if (event.code === 1000 && !hasFallenBackRef.current && enabled) {
          console.log('[WebSocket] Closed normally, attempting reconnect...');
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 3000);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[WebSocket] Error creating WebSocket:', err);
      setError(err instanceof Error ? err.message : 'Failed to create WebSocket');
      if (fallbackToPolling && !hasFallenBackRef.current) {
        hasFallenBackRef.current = true;
        onFallback?.();
      }
    }
  }, [jobId, enabled, getWebSocketUrl, disconnect, fallbackToPolling]);

  const reconnect = useCallback(() => {
    hasFallenBackRef.current = false;
    connect();
  }, [connect]);

  useEffect(() => {
    console.log('[useEffect] Running with jobId:', jobId, 'enabled:', enabled);
    if (jobId && enabled) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      console.log('[useEffect] Cleanup running for jobId:', jobId);
      disconnect();
    };
  }, [jobId, enabled]); // Only re-run when jobId or enabled changes

  return {
    connected,
    error,
    reconnect,
    disconnect,
  };
}

