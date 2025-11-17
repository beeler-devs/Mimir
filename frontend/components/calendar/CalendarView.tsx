'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ScheduleView } from './ScheduleView';
import { TaskChat } from './TaskChat';
import { TaskList } from './TaskList';
import { Button } from '@/components/common';
import type { Task, ScheduledBlock, CalendarPreferences } from '@/lib/types';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, List, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabaseClient';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schedulingTask, setSchedulingTask] = useState(false);

  const supabase = createClient();

  // Load tasks, blocks, and preferences on mount
  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          throw new Error('Not authenticated');
        }

        // Load tasks
        const { data: tasksData, error: tasksError } = await supabase
          .from('tasks')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (tasksError) throw tasksError;

        // Load scheduled blocks
        const { data: blocksData, error: blocksError } = await supabase
          .from('scheduled_blocks')
          .select('*')
          .eq('user_id', user.id)
          .order('start_time', { ascending: true });

        if (blocksError) throw blocksError;

        // Load preferences or create default
        let { data: prefsData, error: prefsError } = await supabase
          .from('calendar_preferences')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (prefsError && prefsError.code !== 'PGRST116') {
          // PGRST116 is "no rows returned" - that's ok, we'll create defaults
          throw prefsError;
        }

        // Create default preferences if none exist
        if (!prefsData) {
          const defaultPrefs = {
            user_id: user.id,
            work_hours_start: '09:00',
            work_hours_end: '17:00',
            work_days: [1, 2, 3, 4, 5],
            preferred_session_duration_minutes: 60,
            min_session_duration_minutes: 30,
            max_session_duration_minutes: 120,
            break_duration_minutes: 15,
            prefer_morning: false,
            prefer_afternoon: false,
            prefer_evening: false,
            default_pomodoro_work_minutes: 25,
            default_pomodoro_break_minutes: 5,
            default_pomodoro_long_break_minutes: 15,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          };

          const { data: createdPrefs, error: createError } = await supabase
            .from('calendar_preferences')
            .insert(defaultPrefs)
            .select()
            .single();

          if (createError) throw createError;
          prefsData = createdPrefs;
        }

        if (mounted) {
          setTasks((tasksData as any[])?.map(convertTaskFromDb) || []);
          setScheduledBlocks((blocksData as any[])?.map(convertBlockFromDb) || []);
          setPreferences(prefsData ? convertPreferencesFromDb(prefsData) : null);
        }
      } catch (err) {
        console.error('Error loading calendar data:', err);
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load calendar data');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, []);

  const handleTaskCreated = useCallback(async (task: Task) => {
    setTasks(prev => [...prev, task]);

    // Trigger AI scheduling
    if (preferences) {
      setSchedulingTask(true);
      try {
        await scheduleTask(task);
      } catch (err) {
        console.error('Error scheduling task:', err);
        setError('Failed to schedule task automatically. You can drag it to a time slot manually.');
      } finally {
        setSchedulingTask(false);
      }
    }
  }, [preferences, scheduledBlocks]);

  const scheduleTask = async (task: Task) => {
    if (!preferences) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const response = await fetch('/api/schedule-task', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
      },
      body: JSON.stringify({
        task: {
          id: task.id,
          title: task.title,
          description: task.description,
          estimatedDurationMinutes: task.estimatedDurationMinutes,
          dueDate: task.dueDate,
          priority: task.priority,
          taskCategory: task.taskCategory,
        },
        preferences: {
          workHoursStart: preferences.workHoursStart,
          workHoursEnd: preferences.workHoursEnd,
          workDays: preferences.workDays,
          preferredSessionDurationMinutes: preferences.preferredSessionDurationMinutes,
          minSessionDurationMinutes: preferences.minSessionDurationMinutes,
          maxSessionDurationMinutes: preferences.maxSessionDurationMinutes,
          breakDurationMinutes: preferences.breakDurationMinutes,
          preferMorning: preferences.preferMorning,
          preferAfternoon: preferences.preferAfternoon,
          preferEvening: preferences.preferEvening,
          timezone: preferences.timezone,
        },
        existingBlocks: scheduledBlocks.map(b => ({
          id: b.id,
          startTime: b.startTime,
          endTime: b.endTime,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to schedule task');
    }

    const result = await response.json();
    if (result.scheduledBlocks) {
      setScheduledBlocks(prev => [...prev, ...result.scheduledBlocks.map((b: any) => ({
        ...b,
        id: `${b.taskId}-${Date.now()}-${Math.random()}`, // Temporary ID
        userId: user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }))]);
    }
  };

  const handleBlockMove = useCallback(async (blockId: string, newStart: Date, newEnd: Date) => {
    try {
      const block = scheduledBlocks.find(b => b.id === blockId);
      if (!block) return;

      const updatedBlock = {
        ...block,
        startTime: newStart.toISOString(),
        endTime: newEnd.toISOString(),
        durationMinutes: Math.round((newEnd.getTime() - newStart.getTime()) / 60000),
        isAutoScheduled: false,
        updatedAt: new Date().toISOString(),
      };

      // Optimistic update
      setScheduledBlocks(prev => prev.map(b => b.id === blockId ? updatedBlock : b));

      // Update database
      const { error } = await supabase
        .from('scheduled_blocks')
        .update({
          start_time: newStart.toISOString(),
          end_time: newEnd.toISOString(),
          is_auto_scheduled: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', blockId);

      if (error) throw error;
    } catch (err) {
      console.error('Error updating block:', err);
      setError('Failed to update scheduled block');
      // Revert on error
      const { data } = await supabase
        .from('scheduled_blocks')
        .select('*')
        .eq('id', blockId)
        .single();
      if (data) {
        setScheduledBlocks(prev => prev.map(b =>
          b.id === blockId ? convertBlockFromDb(data) : b
        ));
      }
    }
  }, [scheduledBlocks]);

  const navigateDate = useCallback((direction: 'prev' | 'next') => {
    setCurrentDate(prevDate => {
      const newDate = new Date(prevDate);
      if (viewMode === 'month') {
        newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
      } else if (viewMode === 'week') {
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
      } else {
        newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
      }
      return newDate;
    });
  }, [viewMode]);

  const formatDateRange = useCallback(() => {
    const options: Intl.DateTimeFormatOptions = {
      month: 'long',
      year: 'numeric',
      day: viewMode === 'day' ? 'numeric' : undefined
    };

    if (viewMode === 'week') {
      const weekStart = getWeekStart(currentDate);
      const weekEnd = new Date(weekStart.getTime());
      weekEnd.setDate(weekEnd.getDate() + 6);

      return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }

    return currentDate.toLocaleDateString('en-US', options);
  }, [viewMode, currentDate]);

  const getWeekStart = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday as week start
    const result = new Date(d);
    result.setDate(d.getDate() + diff);
    return result;
  };

  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading calendar...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-4">
        <div className="max-w-md w-full bg-card border border-border rounded-lg p-6 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Error Loading Calendar</h2>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button onClick={() => window.location.reload()}>
            Reload Page
          </Button>
        </div>
      </div>
    );
  }

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
      <div className="flex-1 flex flex-col min-w-0">
        {/* Calendar header */}
        <div className="border-b border-border bg-card/50 backdrop-blur-sm flex-shrink-0">
          <div className="px-6 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTaskList(!showTaskList)}
                aria-label="Toggle task list"
                className="p-2"
              >
                <List className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-primary" />
                <h1 className="text-2xl font-bold">Calendar</h1>
              </div>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={goToToday}
              >
                Today
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigateDate('prev')}
                  aria-label="Previous"
                  className="p-2"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <div className="min-w-[200px] text-center">
                  <span className="text-lg font-semibold">{formatDateRange()}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigateDate('next')}
                  aria-label="Next"
                  className="p-2"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
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
          {schedulingTask && (
            <div className="px-6 py-2 bg-primary/10 border-b border-primary/20 text-sm text-primary flex items-center gap-2">
              <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span>Scheduling task with AI...</span>
            </div>
          )}
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

// Database conversion helpers
function convertTaskFromDb(dbTask: any): Task {
  return {
    id: dbTask.id,
    userId: dbTask.user_id,
    title: dbTask.title,
    description: dbTask.description,
    estimatedDurationMinutes: dbTask.estimated_duration_minutes,
    actualDurationMinutes: dbTask.actual_duration_minutes,
    dueDate: dbTask.due_date,
    priority: dbTask.priority,
    status: dbTask.status,
    taskCategory: dbTask.task_category,
    tags: dbTask.tags,
    instanceId: dbTask.instance_id,
    completedAt: dbTask.completed_at,
    createdAt: dbTask.created_at,
    updatedAt: dbTask.updated_at,
  };
}

function convertBlockFromDb(dbBlock: any): ScheduledBlock {
  return {
    id: dbBlock.id,
    userId: dbBlock.user_id,
    taskId: dbBlock.task_id,
    startTime: dbBlock.start_time,
    endTime: dbBlock.end_time,
    durationMinutes: dbBlock.duration_minutes,
    isCompleted: dbBlock.is_completed,
    isAutoScheduled: dbBlock.is_auto_scheduled,
    sessionNotes: dbBlock.session_notes,
    createdAt: dbBlock.created_at,
    updatedAt: dbBlock.updated_at,
  };
}

function convertPreferencesFromDb(dbPrefs: any): CalendarPreferences {
  return {
    id: dbPrefs.id,
    userId: dbPrefs.user_id,
    workHoursStart: dbPrefs.work_hours_start,
    workHoursEnd: dbPrefs.work_hours_end,
    workDays: dbPrefs.work_days,
    preferredSessionDurationMinutes: dbPrefs.preferred_session_duration_minutes,
    minSessionDurationMinutes: dbPrefs.min_session_duration_minutes,
    maxSessionDurationMinutes: dbPrefs.max_session_duration_minutes,
    breakDurationMinutes: dbPrefs.break_duration_minutes,
    preferMorning: dbPrefs.prefer_morning,
    preferAfternoon: dbPrefs.prefer_afternoon,
    preferEvening: dbPrefs.prefer_evening,
    defaultPomodoroWorkMinutes: dbPrefs.default_pomodoro_work_minutes,
    defaultPomodoroBreakMinutes: dbPrefs.default_pomodoro_break_minutes,
    defaultPomodoroLongBreakMinutes: dbPrefs.default_pomodoro_long_break_minutes,
    timezone: dbPrefs.timezone,
    createdAt: dbPrefs.created_at,
    updatedAt: dbPrefs.updated_at,
  };
}
