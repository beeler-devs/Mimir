'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { Task, CalendarPreferences, TaskPriority } from '@/lib/types';
import { Send, Sparkles, AlertCircle } from 'lucide-react';
import { Button } from '@/components/common';
import { createClient } from '@/lib/supabaseClient';

interface TaskChatProps {
  onTaskCreated: (task: Task) => void;
  preferences: CalendarPreferences | null;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_MESSAGES = 20; // Prevent memory leak

/**
 * Chat interface for adding tasks with natural language input
 */
export const TaskChat: React.FC<TaskChatProps> = ({ onTaskCreated, preferences }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hi! I'll help you schedule your work. Tell me about a task, including:\n\n• What you need to do\n• How long you think it'll take\n• When it's due\n\nFor example: \"Finish math homework, should take 2 hours, due Friday\"",
    },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const supabase = createClient();

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    const userMessage = input.trim();
    setInput('');
    setError(null);

    // Add user message
    setMessages(prev => {
      const newMessages = [...prev, { role: 'user' as const, content: userMessage }];
      // Keep only last MAX_MESSAGES to prevent memory leak
      return newMessages.slice(-MAX_MESSAGES);
    });

    setIsProcessing(true);

    try {
      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('You must be logged in to create tasks');
      }

      // Parse the task from natural language
      const parsedTask = await parseTaskFromNaturalLanguage(userMessage);

      // Create the task in database
      const taskData = {
        user_id: user.id,
        title: parsedTask.title,
        description: parsedTask.description,
        estimated_duration_minutes: parsedTask.estimatedDurationMinutes,
        due_date: parsedTask.dueDate,
        priority: parsedTask.priority,
        status: 'todo',
        task_category: parsedTask.category,
        tags: parsedTask.tags || [],
      };

      const { data: newTask, error: insertError } = await supabase
        .from('tasks')
        .insert(taskData)
        .select()
        .single();

      if (insertError) throw insertError;

      const task: Task = {
        id: newTask.id,
        userId: newTask.user_id,
        title: newTask.title,
        description: newTask.description,
        estimatedDurationMinutes: newTask.estimated_duration_minutes,
        actualDurationMinutes: newTask.actual_duration_minutes,
        dueDate: newTask.due_date,
        priority: newTask.priority,
        status: newTask.status,
        taskCategory: newTask.task_category,
        tags: newTask.tags,
        instanceId: newTask.instance_id,
        completedAt: newTask.completed_at,
        createdAt: newTask.created_at,
        updatedAt: newTask.updated_at,
      };

      onTaskCreated(task);

      const confirmationMessage = `Great! I've added "${task.title}" to your calendar${
        task.estimatedDurationMinutes ? ` (${task.estimatedDurationMinutes} minutes)` : ''
      }${task.dueDate ? `, due ${new Date(task.dueDate).toLocaleDateString()}` : ''}. I'm finding the best time to schedule it!`;

      setMessages(prev => {
        const newMessages = [...prev, { role: 'assistant' as const, content: confirmationMessage }];
        return newMessages.slice(-MAX_MESSAGES);
      });
    } catch (error) {
      console.error('Error creating task:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create task';
      setError(errorMessage);

      setMessages(prev => {
        const newMessages = [
          ...prev,
          {
            role: 'assistant' as const,
            content: "I had trouble creating that task. Could you try again? Make sure to include what you need to do, how long it'll take, and when it's due.",
          },
        ];
        return newMessages.slice(-MAX_MESSAGES);
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const parseTaskFromNaturalLanguage = async (text: string): Promise<{
    title: string;
    description?: string;
    estimatedDurationMinutes?: number;
    dueDate?: string;
    priority: TaskPriority;
    category?: string;
    tags?: string[];
  }> => {
    // Extract duration (look for patterns like "2 hours", "30 minutes", "1.5 hrs")
    const durationMatch = text.match(/(\d+\.?\d*)\s*(hour|hr|minute|min|h|m)s?/i);
    let estimatedDurationMinutes: number | undefined;
    if (durationMatch) {
      const value = parseFloat(durationMatch[1]);
      const unit = durationMatch[2].toLowerCase();
      if (unit.startsWith('h')) {
        estimatedDurationMinutes = Math.round(value * 60);
      } else {
        estimatedDurationMinutes = Math.round(value);
      }
    }

    // Extract due date (look for patterns like "due Friday", "deadline tomorrow", "by Monday")
    const dueDateMatch = text.match(/(?:due|deadline|by)\s+(\w+)/i);
    let dueDate: string | undefined;
    if (dueDateMatch) {
      const dateStr = dueDateMatch[1].toLowerCase();
      const date = parseDateString(dateStr);
      if (date) {
        dueDate = date.toISOString();
      }
    }

    // Extract priority
    const priority: TaskPriority = text.match(/urgent|asap|important/i) ? 'high' : 'medium';

    // Extract category from keywords
    let category: string | undefined;
    if (text.match(/homework|assignment|study/i)) {
      category = 'homework';
    } else if (text.match(/project/i)) {
      category = 'project';
    } else if (text.match(/reading|read/i)) {
      category = 'reading';
    } else if (text.match(/exam|test|quiz/i)) {
      category = 'study';
    }

    // Extract tags
    const tags: string[] = [];
    if (text.match(/math/i)) tags.push('math');
    if (text.match(/code|programming|coding/i)) tags.push('coding');
    if (text.match(/write|writing|essay/i)) tags.push('writing');

    // Use the original text as title (clean it up a bit)
    let title = text
      .replace(/(\d+\.?\d*)\s*(hour|hr|minute|min|h|m)s?/gi, '')
      .replace(/(?:due|deadline|by)\s+\w+/gi, '')
      .replace(/urgent|asap|important/gi, '')
      .trim();

    // Capitalize first letter
    title = title.charAt(0).toUpperCase() + title.slice(1);

    // If title is too long, truncate and use rest as description
    let description: string | undefined;
    if (title.length > 100) {
      description = title;
      title = title.substring(0, 97) + '...';
    }

    return {
      title,
      description,
      estimatedDurationMinutes,
      dueDate,
      priority,
      category,
      tags: tags.length > 0 ? tags : undefined,
    };
  };

  const parseDateString = (dateStr: string): Date | null => {
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of day

    const lowerDateStr = dateStr.toLowerCase();

    if (lowerDateStr === 'today') {
      return today;
    } else if (lowerDateStr === 'tomorrow') {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    } else if (lowerDateStr === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday;
    }

    // Day of week
    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayIndex = daysOfWeek.indexOf(lowerDateStr);
    if (dayIndex !== -1) {
      const currentDay = today.getDay();
      let daysUntil = dayIndex - currentDay;
      if (daysUntil <= 0) {
        daysUntil += 7; // Next week
      }
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + daysUntil);
      return targetDate;
    }

    return null;
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Error banner */}
      {error && (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-4 py-2.5 ${
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground'
              }`}
            >
              {message.role === 'assistant' && (
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium text-primary">AI Assistant</span>
                </div>
              )}
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-4 py-2.5">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-border flex-shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe your task..."
            className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isProcessing}
            maxLength={500}
          />
          <Button
            type="submit"
            disabled={!input.trim() || isProcessing}
            size="sm"
            className="px-4 py-2.5"
            aria-label="Send message"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </form>
    </div>
  );
};
