'use client';

import React, { useState } from 'react';
import type { Task, CalendarPreferences, TaskPriority } from '@/lib/types';
import { Send, Sparkles } from 'lucide-react';
import { nanoid } from 'nanoid';

interface TaskChatProps {
  onTaskCreated: (task: Task) => void;
  preferences: CalendarPreferences | null;
}

/**
 * Chat interface for adding tasks with natural language input
 */
export const TaskChat: React.FC<TaskChatProps> = ({ onTaskCreated, preferences }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    {
      role: 'assistant',
      content: "Hi! I'll help you schedule your work. Tell me about a task, including:\n\n• What you need to do\n• How long you think it'll take\n• When it's due\n\nFor example: \"Finish math homework, should take 2 hours, due Friday\"",
    },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    const userMessage = input.trim();
    setInput('');
    setMessages([...messages, { role: 'user', content: userMessage }]);
    setIsProcessing(true);

    try {
      // Parse the task from natural language
      const parsedTask = await parseTaskFromNaturalLanguage(userMessage);

      // Create the task
      const newTask: Task = {
        id: nanoid(),
        userId: 'current-user', // TODO: Get from auth
        title: parsedTask.title,
        description: parsedTask.description,
        estimatedDurationMinutes: parsedTask.estimatedDurationMinutes,
        dueDate: parsedTask.dueDate,
        priority: parsedTask.priority,
        status: 'todo',
        taskCategory: parsedTask.category,
        tags: parsedTask.tags,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      onTaskCreated(newTask);

      const confirmationMessage = `Great! I've added "${newTask.title}" to your calendar${
        newTask.estimatedDurationMinutes ? ` (${newTask.estimatedDurationMinutes} minutes)` : ''
      }${newTask.dueDate ? `, due ${new Date(newTask.dueDate).toLocaleDateString()}` : ''}. I'll find the best time to schedule it!`;

      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: confirmationMessage },
      ]);
    } catch (error) {
      console.error('Error parsing task:', error);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: "I had trouble understanding that. Could you try again? Include what you need to do, how long it'll take, and when it's due.",
        },
      ]);
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
    // TODO: Replace with actual Claude API call
    // For now, using simple regex-based parsing

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
    }

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
    <div className="flex-1 flex flex-col">
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
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe your task..."
            className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
            disabled={isProcessing}
          />
          <button
            type="submit"
            disabled={!input.trim() || isProcessing}
            className="px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </form>
    </div>
  );
};
