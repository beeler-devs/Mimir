'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { Task, PomodoroSession, PomodoroSessionType } from '@/lib/types';
import { Play, Pause, RotateCcw, X, CheckCircle2, Settings, Timer as TimerIcon } from 'lucide-react';
import { nanoid } from 'nanoid';

interface PomodoroTimerProps {
  tasks: Task[];
  onClose?: () => void;
  onSessionComplete?: (session: PomodoroSession) => void;
}

/**
 * Pomodoro timer component with task linking and session tracking
 */
export const PomodoroTimer: React.FC<PomodoroTimerProps> = ({
  tasks,
  onClose,
  onSessionComplete,
}) => {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [sessionType, setSessionType] = useState<PomodoroSessionType>('work');
  const [sessionNumber, setSessionNumber] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(25 * 60); // 25 minutes in seconds
  const [showSettings, setShowSettings] = useState(false);

  // Settings
  const [workDuration, setWorkDuration] = useState(25);
  const [shortBreakDuration, setShortBreakDuration] = useState(5);
  const [longBreakDuration, setLongBreakDuration] = useState(15);
  const [sessionsUntilLongBreak, setSessionsUntilLongBreak] = useState(4);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const sessionStartTimeRef = useRef<Date | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);

  // Audio notification
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Create audio element for notifications
    if (typeof window !== 'undefined') {
      audioRef.current = new Audio();
      // Using a simple beep sound - in production, you'd use a proper audio file
      audioRef.current.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZRA==';
    }
  }, []);

  useEffect(() => {
    if (isRunning && !isPaused) {
      intervalRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            handleSessionComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, isPaused]);

  const handleStart = () => {
    if (!isRunning) {
      setIsRunning(true);
      sessionStartTimeRef.current = new Date();
      currentSessionIdRef.current = nanoid();
    }
    setIsPaused(false);
  };

  const handlePause = () => {
    setIsPaused(true);
  };

  const handleReset = () => {
    setIsRunning(false);
    setIsPaused(false);
    const duration = sessionType === 'work'
      ? workDuration
      : sessionType === 'short_break'
      ? shortBreakDuration
      : longBreakDuration;
    setTimeRemaining(duration * 60);
    currentSessionIdRef.current = null;
  };

  const handleSessionComplete = () => {
    // Play notification sound
    if (audioRef.current) {
      audioRef.current.play().catch(console.error);
    }

    // Show notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Pomodoro Complete!', {
        body: sessionType === 'work'
          ? 'Time for a break!'
          : 'Break complete! Ready to focus?',
        icon: '/favicon.ico',
      });
    }

    // Create session record
    if (sessionStartTimeRef.current && currentSessionIdRef.current) {
      const session: PomodoroSession = {
        id: currentSessionIdRef.current,
        userId: 'current-user', // TODO: Get from auth
        taskId: selectedTask?.id,
        workDurationMinutes: workDuration,
        breakDurationMinutes: shortBreakDuration,
        longBreakDurationMinutes: longBreakDuration,
        sessionsUntilLongBreak,
        sessionNumber,
        sessionType,
        startedAt: sessionStartTimeRef.current.toISOString(),
        completedAt: new Date().toISOString(),
        totalPauseDurationMinutes: 0,
        isCompleted: true,
        wasInterrupted: false,
        createdAt: sessionStartTimeRef.current.toISOString(),
      };

      if (onSessionComplete) {
        onSessionComplete(session);
      }
    }

    // Auto-advance to next session
    if (sessionType === 'work') {
      if (sessionNumber % sessionsUntilLongBreak === 0) {
        // Long break
        setSessionType('long_break');
        setTimeRemaining(longBreakDuration * 60);
      } else {
        // Short break
        setSessionType('short_break');
        setTimeRemaining(shortBreakDuration * 60);
      }
      setSessionNumber(prev => prev + 1);
    } else {
      // Back to work
      setSessionType('work');
      setTimeRemaining(workDuration * 60);
    }

    setIsRunning(false);
    setIsPaused(false);
    currentSessionIdRef.current = null;
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgress = (): number => {
    const totalSeconds = sessionType === 'work'
      ? workDuration * 60
      : sessionType === 'short_break'
      ? shortBreakDuration * 60
      : longBreakDuration * 60;
    return ((totalSeconds - timeRemaining) / totalSeconds) * 100;
  };

  const activeTasks = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card rounded-2xl shadow-2xl border border-border overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TimerIcon className="h-6 w-6 text-primary" />
            <h2 className="text-xl font-bold">Pomodoro Timer</h2>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              aria-label="Settings"
            >
              <Settings className="h-5 w-5" />
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {showSettings ? (
          /* Settings Panel */
          <div className="p-6 space-y-4">
            <h3 className="font-semibold mb-4">Timer Settings</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Work Duration (minutes)</label>
                <input
                  type="number"
                  value={workDuration}
                  onChange={(e) => setWorkDuration(parseInt(e.target.value) || 25)}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background"
                  min="1"
                  max="120"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Short Break (minutes)</label>
                <input
                  type="number"
                  value={shortBreakDuration}
                  onChange={(e) => setShortBreakDuration(parseInt(e.target.value) || 5)}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background"
                  min="1"
                  max="30"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Long Break (minutes)</label>
                <input
                  type="number"
                  value={longBreakDuration}
                  onChange={(e) => setLongBreakDuration(parseInt(e.target.value) || 15)}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background"
                  min="1"
                  max="60"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Sessions Until Long Break</label>
                <input
                  type="number"
                  value={sessionsUntilLongBreak}
                  onChange={(e) => setSessionsUntilLongBreak(parseInt(e.target.value) || 4)}
                  className="w-full mt-1 px-3 py-2 rounded-lg border border-border bg-background"
                  min="2"
                  max="10"
                />
              </div>
            </div>
            <button
              onClick={() => setShowSettings(false)}
              className="w-full mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Timer Display */}
            <div className="p-8">
              {/* Session Type Indicator */}
              <div className="text-center mb-6">
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
                  sessionType === 'work'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-green-500/10 text-green-600'
                }`}>
                  {sessionType === 'work' ? '🎯 Focus Time' : '☕ Break Time'}
                  <span className="text-xs opacity-70">Session {sessionNumber}</span>
                </div>
              </div>

              {/* Circular Progress */}
              <div className="relative w-64 h-64 mx-auto mb-8">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="128"
                    cy="128"
                    r="120"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    className="text-muted"
                  />
                  <circle
                    cx="128"
                    cy="128"
                    r="120"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray={`${2 * Math.PI * 120}`}
                    strokeDashoffset={`${2 * Math.PI * 120 * (1 - getProgress() / 100)}`}
                    className={sessionType === 'work' ? 'text-primary' : 'text-green-500'}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-6xl font-bold tabular-nums">{formatTime(timeRemaining)}</span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex justify-center gap-4 mb-6">
                {!isRunning || isPaused ? (
                  <button
                    onClick={handleStart}
                    className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-all shadow-lg hover:shadow-xl"
                    aria-label="Start"
                  >
                    <Play className="h-8 w-8" />
                  </button>
                ) : (
                  <button
                    onClick={handlePause}
                    className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-all shadow-lg hover:shadow-xl"
                    aria-label="Pause"
                  >
                    <Pause className="h-8 w-8" />
                  </button>
                )}
                <button
                  onClick={handleReset}
                  className="w-16 h-16 rounded-full bg-muted text-foreground flex items-center justify-center hover:bg-muted/80 transition-all"
                  aria-label="Reset"
                >
                  <RotateCcw className="h-6 w-6" />
                </button>
              </div>

              {/* Task Selection */}
              <div>
                <label className="text-sm font-medium mb-2 block">Working on:</label>
                <select
                  value={selectedTask?.id || ''}
                  onChange={(e) => {
                    const task = tasks.find(t => t.id === e.target.value);
                    setSelectedTask(task || null);
                  }}
                  className="w-full px-4 py-2.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                  disabled={isRunning && !isPaused}
                >
                  <option value="">No task selected</option>
                  {activeTasks.map(task => (
                    <option key={task.id} value={task.id}>
                      {task.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Session Progress Dots */}
            <div className="px-8 pb-6">
              <div className="flex justify-center gap-2">
                {Array.from({ length: sessionsUntilLongBreak }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-3 h-3 rounded-full ${
                      i < sessionNumber - 1
                        ? 'bg-primary'
                        : i === sessionNumber - 1 && sessionType === 'work'
                        ? 'bg-primary/50'
                        : 'bg-muted'
                    }`}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
