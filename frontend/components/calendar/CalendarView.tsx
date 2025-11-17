'use client';

import React, { useState, useEffect } from 'react';
import { ScheduleView } from './ScheduleView';
import { TaskChat } from './TaskChat';
import { TaskList } from './TaskList';
import type { Task, ScheduledBlock, CalendarPreferences, CalendarEvent } from '@/lib/types';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, List } from 'lucide-react';

type ViewMode = 'month' | 'week' | 'day';

/**
 * Main calendar view component with AI-powered scheduling
 */
export const CalendarView: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [scheduledBlocks, setScheduledBlocks] = useState<ScheduledBlock[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showTaskList, setShowTaskList] = useState(true);
  const [preferences, setPreferences] = useState<CalendarPreferences | null>(null);

  // Load tasks and scheduled blocks on mount
  useEffect(() => {
    loadTasksAndBlocks();
    loadPreferences();
  }, []);

  const loadTasksAndBlocks = async () => {
    // TODO: Implement Supabase queries to load tasks and blocks
    // For now, using mock data
    setTasks([]);
    setScheduledBlocks([]);
  };

  const loadPreferences = async () => {
    // TODO: Load user preferences from Supabase
    // For now, using defaults
    setPreferences({
      id: 'default',
      userId: 'user',
      workHoursStart: '09:00',
      workHoursEnd: '17:00',
      workDays: [1, 2, 3, 4, 5],
      preferredSessionDurationMinutes: 60,
      minSessionDurationMinutes: 30,
      maxSessionDurationMinutes: 120,
      breakDurationMinutes: 15,
      preferMorning: false,
      preferAfternoon: false,
      preferEvening: false,
      defaultPomodoroWorkMinutes: 25,
      defaultPomodoroBreakMinutes: 5,
      defaultPomodoroLongBreakMinutes: 15,
      timezone: 'UTC',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  const handleTaskCreated = async (task: Task) => {
    setTasks([...tasks, task]);
    // Trigger AI scheduling
    await scheduleTask(task);
  };

  const scheduleTask = async (task: Task) => {
    // TODO: Call AI scheduling API
    console.log('Scheduling task:', task);
  };

  const handleBlockMove = async (blockId: string, newStart: Date, newEnd: Date) => {
    // Update scheduled block times
    const updatedBlocks = scheduledBlocks.map(block => {
      if (block.id === blockId) {
        return {
          ...block,
          startTime: newStart.toISOString(),
          endTime: newEnd.toISOString(),
          durationMinutes: Math.round((newEnd.getTime() - newStart.getTime()) / 60000),
          isAutoScheduled: false, // Manual move
        };
      }
      return block;
    });
    setScheduledBlocks(updatedBlocks);
    // TODO: Update in database
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    } else {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    }
    setCurrentDate(newDate);
  };

  const formatDateRange = () => {
    const options: Intl.DateTimeFormatOptions = {
      month: 'long',
      year: 'numeric',
      day: viewMode === 'day' ? 'numeric' : undefined
    };

    if (viewMode === 'week') {
      const weekStart = getWeekStart(currentDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }

    return currentDate.toLocaleDateString('en-US', options);
  };

  const getWeekStart = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    return new Date(d.setDate(diff));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Left sidebar - Task list */}
      {showTaskList && (
        <div className="w-80 border-r border-border flex flex-col">
          <div className="p-4 border-b border-border">
            <h2 className="text-lg font-semibold">Tasks</h2>
          </div>
          <TaskList
            tasks={tasks}
            onTaskSelect={setSelectedTask}
            selectedTaskId={selectedTask?.id}
          />
        </div>
      )}

      {/* Main calendar area */}
      <div className="flex-1 flex flex-col">
        {/* Calendar header */}
        <div className="border-b border-border bg-card/50 backdrop-blur-sm">
          <div className="px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowTaskList(!showTaskList)}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
                aria-label="Toggle task list"
              >
                <List className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-primary" />
                <h1 className="text-2xl font-bold">Calendar</h1>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={goToToday}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-muted transition-colors"
              >
                Today
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => navigateDate('prev')}
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                  aria-label="Previous"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="min-w-[200px] text-center">
                  <span className="text-lg font-semibold">{formatDateRange()}</span>
                </div>
                <button
                  onClick={() => navigateDate('next')}
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                  aria-label="Next"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>

              <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
                <button
                  onClick={() => setViewMode('day')}
                  className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                    viewMode === 'day' ? 'bg-background shadow-sm' : 'hover:bg-background/50'
                  }`}
                >
                  Day
                </button>
                <button
                  onClick={() => setViewMode('week')}
                  className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                    viewMode === 'week' ? 'bg-background shadow-sm' : 'hover:bg-background/50'
                  }`}
                >
                  Week
                </button>
                <button
                  onClick={() => setViewMode('month')}
                  className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                    viewMode === 'month' ? 'bg-background shadow-sm' : 'hover:bg-background/50'
                  }`}
                >
                  Month
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Calendar grid */}
        <div className="flex-1 overflow-hidden">
          <ScheduleView
            viewMode={viewMode}
            currentDate={currentDate}
            scheduledBlocks={scheduledBlocks}
            tasks={tasks}
            onBlockMove={handleBlockMove}
            preferences={preferences}
          />
        </div>
      </div>

      {/* Right sidebar - Task chat */}
      <div className="w-96 border-l border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Add Task</h2>
          <p className="text-sm text-muted-foreground">
            Describe your task, time estimate, and due date
          </p>
        </div>
        <TaskChat
          onTaskCreated={handleTaskCreated}
          preferences={preferences}
        />
      </div>
    </div>
  );
};
