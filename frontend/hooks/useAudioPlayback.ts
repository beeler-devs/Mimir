/**
 * Hook for playing audio from voice assistant
 */
import { useRef, useCallback, useState, useEffect } from 'react';
import { int16ToFloat32, AUDIO_CONFIG } from '@/lib/voice/audioUtils';

export interface UseAudioPlaybackOptions {
  sampleRate?: number;
  onPlaybackEnd?: () => void;
}

export interface UseAudioPlaybackReturn {
  playAudio: (audioData: Int16Array, streamId?: string) => void;
  stopAudio: () => void;
  isPlaying: boolean;
  queueSize: number;
}

export function useAudioPlayback(options: UseAudioPlaybackOptions = {}): UseAudioPlaybackReturn {
  const {
    sampleRate = AUDIO_CONFIG.SAMPLE_RATE,
    onPlaybackEnd
  } = options;

  const [isPlaying, setIsPlaying] = useState(false);
  const [queueSize, setQueueSize] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const currentStreamIdRef = useRef<string | null>(null);

  // Initialize audio context
  useEffect(() => {
    audioContextRef.current = new AudioContext({ sampleRate });

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [sampleRate]);

  const playAudio = useCallback((audioData: Int16Array, streamId?: string) => {
    const audioContext = audioContextRef.current;
    if (!audioContext) {
      console.error('Audio context not initialized');
      return;
    }

    // If this is a new stream, stop the previous one
    if (streamId && streamId !== currentStreamIdRef.current) {
      console.log(`[Audio] New stream detected: ${streamId} (previous: ${currentStreamIdRef.current})`);

      // Stop all active sources from previous stream
      activeSourcesRef.current.forEach(source => {
        try {
          source.stop();
          console.log('[Audio] Stopped previous stream source');
        } catch (e) {
          // Ignore if already stopped
        }
      });

      // Reset state for new stream
      activeSourcesRef.current = [];
      nextStartTimeRef.current = 0;
      currentStreamIdRef.current = streamId;

      console.log(`[Audio] Reset playback state for new stream: ${streamId}`);
    }

    // Convert to Float32Array
    const float32Data = int16ToFloat32(audioData);

    // Create audio buffer
    const audioBuffer = audioContext.createBuffer(
      AUDIO_CONFIG.CHANNELS,
      float32Data.length,
      sampleRate
    );
    audioBuffer.getChannelData(0).set(float32Data);

    // Create source
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);

    // Calculate start time
    const currentTime = audioContext.currentTime;
    let startTime = Math.max(currentTime, nextStartTimeRef.current);

    // Update next start time
    const duration = audioBuffer.duration;
    nextStartTimeRef.current = startTime + duration;

    // Track active source
    activeSourcesRef.current.push(source);

    // Handle playback end
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);

      if (activeSourcesRef.current.length === 0) {
        setIsPlaying(false);
        nextStartTimeRef.current = 0;
        if (onPlaybackEnd) {
          onPlaybackEnd();
        }
      }
    };

    // Start playback
    source.start(startTime);
    setIsPlaying(true);

  }, [sampleRate, onPlaybackEnd]);

  const stopAudio = useCallback(() => {
    console.log('[Audio] Stopping all audio playback');

    // Stop all active sources
    activeSourcesRef.current.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // Ignore if already stopped
      }
    });

    activeSourcesRef.current = [];
    audioQueueRef.current = [];
    nextStartTimeRef.current = 0;
    currentStreamIdRef.current = null;
    setIsPlaying(false);
    setQueueSize(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, [stopAudio]);

  return {
    playAudio,
    stopAudio,
    isPlaying,
    queueSize: activeSourcesRef.current.length
  };
}
