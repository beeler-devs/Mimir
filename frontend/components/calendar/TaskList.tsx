'use client';

import React, { useMemo } from 'react';
import type { Task, TaskStatus } from '@/lib/types';
import { CheckCircle2, Circle, Clock, AlertCircle } from 'lucide-react';

interface TaskListProps {
  tasks: Task[];
  onTaskSelect: (task: Task) => void;
  selectedTaskId?: string;
}

const priorityColors = {
  low: 'text-blue-500',
  medium: 'text-yellow-500',
  high: 'text-orange-500',
  urgent: 'text-red-500',
};

const statusIcons: Record<TaskStatus, React.ComponentType<{ className?: string }>> = {
  todo: Circle,
  in_progress: Clock,
  completed: CheckCircle2,
  cancelled: Circle,
};

/**
 * Task list sidebar component
 */
export const TaskList: React.FC<TaskListProps> = ({ tasks, onTaskSelect, selectedTaskId }) => {
  const groupedTasks = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const groups: Record<string, Task[]> = {
      overdue: [],
      today: [],
      tomorrow: [],
      thisWeek: [],
      later: [],
      noDueDate: [],
    };

    tasks.forEach(task => {
      if (task.status === 'completed' || task.status === 'cancelled') {
        return; // Don't show completed/cancelled tasks
      }

      if (!task.dueDate) {
        groups.noDueDate.push(task);
        return;
      }

      const dueDate = new Date(task.dueDate);
      const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

      if (dueDateOnly < today) {
        groups.overdue.push(task);
      } else if (dueDateOnly.getTime() === today.getTime()) {
        groups.today.push(task);
      } else if (dueDateOnly.getTime() === tomorrow.getTime()) {
        groups.tomorrow.push(task);
      } else if (dueDateOnly <= nextWeek) {
        groups.thisWeek.push(task);
      } else {
        groups.later.push(task);
      }
    });

    return groups;
  }, [tasks]);

  const renderTaskGroup = (title: string, tasks: Task[], icon?: React.ReactNode) => {
    if (tasks.length === 0) return null;

    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 px-4 mb-2">
          {icon}
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            {title}
          </h3>
          <span className="text-xs text-muted-foreground">({tasks.length})</span>
        </div>
        <div className="space-y-1">
          {tasks.map(task => renderTask(task))}
        </div>
      </div>
    );
  };

  const renderTask = (task: Task) => {
    const StatusIcon = statusIcons[task.status];
    const isSelected = task.id === selectedTaskId;

    return (
      <button
        key={task.id}
        onClick={() => onTaskSelect(task)}
        className={`w-full px-4 py-3 text-left transition-colors ${
          isSelected ? 'bg-primary/10 border-l-2 border-primary' : 'hover:bg-muted/50'
        }`}
      >
        <div className="flex items-start gap-3">
          <StatusIcon className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
            task.status === 'completed' ? 'text-green-500' : 'text-muted-foreground'
          }`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-medium text-sm truncate">{task.title}</h4>
              {task.priority !== 'medium' && (
                <AlertCircle className={`h-3.5 w-3.5 flex-shrink-0 ${priorityColors[task.priority]}`} />
              )}
            </div>
            {task.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mb-1">
                {task.description}
              </p>
            )}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {task.estimatedDurationMinutes && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDuration(task.estimatedDurationMinutes)}
                </span>
              )}
              {task.taskCategory && (
                <span className="px-2 py-0.5 rounded-full bg-muted text-xs">
                  {task.taskCategory}
                </span>
              )}
            </div>
          </div>
        </div>
      </button>
    );
  };

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="py-4">
        {renderTaskGroup('Overdue', groupedTasks.overdue, <AlertCircle className="h-4 w-4 text-red-500" />)}
        {renderTaskGroup('Today', groupedTasks.today, <Circle className="h-4 w-4 text-primary" />)}
        {renderTaskGroup('Tomorrow', groupedTasks.tomorrow)}
        {renderTaskGroup('This Week', groupedTasks.thisWeek)}
        {renderTaskGroup('Later', groupedTasks.later)}
        {renderTaskGroup('No Due Date', groupedTasks.noDueDate)}

        {tasks.length === 0 && (
          <div className="px-4 py-12 text-center">
            <Circle className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No tasks yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add your first task using the chat on the right
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
