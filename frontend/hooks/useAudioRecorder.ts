/**
 * Hook for recording audio from microphone
 */
import { useRef, useCallback, useState, useEffect } from 'react';
import {
  getUserMicrophoneStream,
  float32ToInt16,
  resampleBuffer,
  AUDIO_CONFIG
} from '@/lib/voice/audioUtils';

export interface UseAudioRecorderOptions {
  onAudioData?: (audioData: Int16Array) => void;
  onError?: (error: Error) => void;
  sampleRate?: number;
}

export interface UseAudioRecorderReturn {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  isRecording: boolean;
  error: Error | null;
}

export function useAudioRecorder(options: UseAudioRecorderOptions = {}): UseAudioRecorderReturn {
  const {
    onAudioData,
    onError,
    sampleRate = AUDIO_CONFIG.SAMPLE_RATE
  } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const startRecording = useCallback(async () => {
    try {
      setError(null);

      // Get microphone stream
      const stream = await getUserMicrophoneStream();
      mediaStreamRef.current = stream;

      // Create audio context
      const audioContext = new AudioContext({ sampleRate });
      audioContextRef.current = audioContext;

      // Create source from stream
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Create script processor for capturing audio
      const processor = audioContext.createScriptProcessor(
        AUDIO_CONFIG.BUFFER_SIZE,
        AUDIO_CONFIG.CHANNELS,
        AUDIO_CONFIG.CHANNELS
      );
      processorRef.current = processor;

      // Process audio data
      processor.onaudioprocess = (e) => {
        if (!onAudioData) return;

        const inputData = e.inputBuffer.getChannelData(0);

        // Resample if necessary
        let processedData = inputData;
        if (audioContext.sampleRate !== sampleRate) {
          processedData = resampleBuffer(
            inputData,
            audioContext.sampleRate,
            sampleRate
          );
        }

        // Convert to Int16
        const int16Data = float32ToInt16(processedData);

        // Send to callback
        onAudioData(int16Data);
      };

      // Connect nodes
      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsRecording(true);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to start recording');
      setError(error);
      if (onError) {
        onError(error);
      }
      throw error;
    }
  }, [onAudioData, onError, sampleRate]);

  const stopRecording = useCallback(() => {
    // Disconnect and cleanup
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    setIsRecording(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return {
    startRecording,
    stopRecording,
    isRecording,
    error
  };
}
