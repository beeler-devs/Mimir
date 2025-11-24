'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { PointerPosition } from './LaserPointerOverlay';

export interface VoiceExplanationSegment {
  id: string;
  text: string;
  position: {
    x: number;
    y: number;
    elementId?: string;
    offset?: { x: number; y: number };
  };
  duration: number; // milliseconds
  pointerStyle?: 'point' | 'circle' | 'highlight' | 'ripple';
  emphasis?: number; // 0-1
}

interface VoiceOrchestratorProps {
  segments: VoiceExplanationSegment[];
  onPositionChange: (position: PointerPosition | null) => void;
  onComplete?: () => void;
  onSegmentChange?: (segmentIndex: number) => void;
  autoStart?: boolean;
}

type PlaybackState = 'idle' | 'playing' | 'paused' | 'completed';

/**
 * Orchestrates voice synthesis and laser pointer synchronization
 * Manages the timeline of explanation segments
 */
export const VoiceOrchestrator: React.FC<VoiceOrchestratorProps> = ({
  segments,
  onPositionChange,
  onComplete,
  onSegmentChange,
  autoStart = false,
}) => {
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [progress, setProgress] = useState(0); // 0-100

  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);

  // Initialize speech synthesis
  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  // Auto-start if requested
  useEffect(() => {
    if (autoStart && segments.length > 0) {
      startPlayback();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  // Play a single segment
  const playSegment = useCallback(
    (index: number) => {
      if (!synthRef.current || index >= segments.length) {
        // Playback complete
        setPlaybackState('completed');
        onPositionChange(null);
        onComplete?.();
        return;
      }

      const segment = segments[index];
      setCurrentSegmentIndex(index);
      onSegmentChange?.(index);

      // Update pointer position
      const pointerPosition: PointerPosition = {
        x: segment.position.x + (segment.position.offset?.x || 0),
        y: segment.position.y + (segment.position.offset?.y || 0),
        style: segment.pointerStyle || 'point',
        emphasis: segment.emphasis || 0.7,
      };
      onPositionChange(pointerPosition);

      // Create speech utterance
      const utterance = new SpeechSynthesisUtterance(segment.text);
      utterance.rate = 0.9; // Slightly slower for clarity
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      // Use a pleasant voice if available
      const voices = synthRef.current.getVoices();
      const preferredVoice = voices.find(
        (voice) =>
          voice.lang.startsWith('en') &&
          (voice.name.includes('Google') || voice.name.includes('Microsoft'))
      );
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utteranceRef.current = utterance;

      // Handle utterance end
      utterance.onend = () => {
        // Move to next segment after duration
        const nextIndex = index + 1;
        if (nextIndex < segments.length) {
          timeoutRef.current = setTimeout(() => {
            playSegment(nextIndex);
          }, 500); // Small gap between segments
        } else {
          setPlaybackState('completed');
          onPositionChange(null);
          onComplete?.();
        }
      };

      utterance.onerror = (error) => {
        console.error('Speech synthesis error:', error);
        // Try to continue to next segment
        const nextIndex = index + 1;
        if (nextIndex < segments.length) {
          playSegment(nextIndex);
        } else {
          setPlaybackState('completed');
          onPositionChange(null);
          onComplete?.();
        }
      };

      // Start speaking
      synthRef.current.speak(utterance);

      // Update progress based on segment duration
      startTimeRef.current = Date.now();
      updateProgress(index, segment.duration);
    },
    [segments, onPositionChange, onComplete, onSegmentChange]
  );

  // Update progress indicator
  const updateProgress = (segmentIndex: number, duration: number) => {
    const totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0);
    const previousDuration = segments
      .slice(0, segmentIndex)
      .reduce((sum, seg) => sum + seg.duration, 0);

    const intervalId = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const segmentProgress = Math.min(elapsed / duration, 1);
      const totalProgress = ((previousDuration + elapsed) / totalDuration) * 100;
      setProgress(Math.min(totalProgress, 100));

      if (segmentProgress >= 1) {
        clearInterval(intervalId);
      }
    }, 100);

    // Clean up interval on unmount or state change
    return () => clearInterval(intervalId);
  };

  // Start playback from beginning
  const startPlayback = useCallback(() => {
    if (!synthRef.current || segments.length === 0) return;

    setPlaybackState('playing');
    setCurrentSegmentIndex(0);
    setProgress(0);
    playSegment(0);
  }, [segments, playSegment]);

  // Pause playback
  const pausePlayback = useCallback(() => {
    if (!synthRef.current) return;

    synthRef.current.pause();
    setPlaybackState('paused');
    pausedTimeRef.current = Date.now();

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  // Resume playback
  const resumePlayback = useCallback(() => {
    if (!synthRef.current) return;

    synthRef.current.resume();
    setPlaybackState('playing');
  }, []);

  // Stop playback
  const stopPlayback = useCallback(() => {
    if (!synthRef.current) return;

    synthRef.current.cancel();
    setPlaybackState('idle');
    setCurrentSegmentIndex(0);
    setProgress(0);
    onPositionChange(null);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, [onPositionChange]);

  // Skip to specific segment
  const skipToSegment = useCallback(
    (index: number) => {
      if (index < 0 || index >= segments.length) return;

      if (synthRef.current) {
        synthRef.current.cancel();
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      playSegment(index);
    },
    [segments, playSegment]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="voice-orchestrator flex items-center gap-3 p-3 bg-muted rounded-lg border border-border">
      {/* Playback controls */}
      <div className="flex items-center gap-2">
        {playbackState === 'idle' || playbackState === 'completed' ? (
          <button
            onClick={startPlayback}
            disabled={segments.length === 0}
            className="p-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            title="Play explanation"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
          </button>
        ) : playbackState === 'playing' ? (
          <button
            onClick={pausePlayback}
            className="p-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            title="Pause"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
            </svg>
          </button>
        ) : (
          <button
            onClick={resumePlayback}
            className="p-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            title="Resume"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
          </button>
        )}

        <button
          onClick={stopPlayback}
          disabled={playbackState === 'idle'}
          className="p-2 rounded-md bg-muted-foreground/20 hover:bg-muted-foreground/30 disabled:opacity-50"
          title="Stop"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M5.25 3A2.25 2.25 0 003 5.25v9.5A2.25 2.25 0 005.25 17h9.5A2.25 2.25 0 0017 14.75v-9.5A2.25 2.25 0 0014.75 3h-9.5z" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <div className="flex-1">
        <div className="h-2 bg-muted-foreground/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Segment {currentSegmentIndex + 1} of {segments.length}
        </div>
      </div>

      {/* Segment navigation */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => skipToSegment(currentSegmentIndex - 1)}
          disabled={currentSegmentIndex === 0 || playbackState === 'idle'}
          className="p-1 rounded-md bg-muted-foreground/20 hover:bg-muted-foreground/30 disabled:opacity-50 text-sm"
          title="Previous segment"
        >
          ←
        </button>
        <button
          onClick={() => skipToSegment(currentSegmentIndex + 1)}
          disabled={currentSegmentIndex >= segments.length - 1 || playbackState === 'idle'}
          className="p-1 rounded-md bg-muted-foreground/20 hover:bg-muted-foreground/30 disabled:opacity-50 text-sm"
          title="Next segment"
        >
          →
        </button>
      </div>
    </div>
  );
};
