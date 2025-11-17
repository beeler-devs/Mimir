'use client';

import React, { useMemo, useState } from 'react';
import type { ScheduledBlock, Task, CalendarPreferences, CalendarEvent } from '@/lib/types';

interface ScheduleViewProps {
  viewMode: 'month' | 'week' | 'day';
  currentDate: Date;
  scheduledBlocks: ScheduledBlock[];
  tasks: Task[];
  onBlockMove: (blockId: string, newStart: Date, newEnd: Date) => void;
  preferences: CalendarPreferences | null;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Calendar schedule view with drag-and-drop support
 */
export const ScheduleView: React.FC<ScheduleViewProps> = ({
  viewMode,
  currentDate,
  scheduledBlocks,
  tasks,
  onBlockMove,
  preferences,
}) => {
  const [draggedBlock, setDraggedBlock] = useState<string | null>(null);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);

  // Convert scheduled blocks to calendar events
  const events = useMemo((): CalendarEvent[] => {
    return scheduledBlocks.map(block => {
      const task = tasks.find(t => t.id === block.taskId);
      return {
        id: block.id,
        taskId: block.taskId,
        title: task?.title || 'Unknown Task',
        description: task?.description,
        startTime: new Date(block.startTime),
        endTime: new Date(block.endTime),
        isCompleted: block.isCompleted,
        isAutoScheduled: block.isAutoScheduled,
        priority: task?.priority || 'medium',
        color: getPriorityColor(task?.priority || 'medium'),
      };
    });
  }, [scheduledBlocks, tasks]);

  // Get the days to display based on view mode
  const displayDays = useMemo((): Date[] => {
    if (viewMode === 'day') {
      return [new Date(currentDate)];
    } else if (viewMode === 'week') {
      const weekStart = getWeekStart(currentDate);
      return Array.from({ length: 7 }, (_, i) => {
        const date = new Date(weekStart);
        date.setDate(date.getDate() + i);
        return date;
      });
    } else {
      // Month view
      const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      const startDay = monthStart.getDay();
      const daysInMonth = monthEnd.getDate();
      const totalDays = Math.ceil((startDay + daysInMonth) / 7) * 7;

      return Array.from({ length: totalDays }, (_, i) => {
        const date = new Date(monthStart);
        date.setDate(date.getDate() - startDay + i);
        return date;
      });
    }
  }, [viewMode, currentDate]);

  const getWeekStart = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day; // Monday as week start
    const result = new Date(d);
    result.setDate(d.getDate() + diff);
    return result;
  };

  const getPriorityColor = (priority: string): string => {
    const colors = {
      low: 'bg-blue-500',
      medium: 'bg-yellow-500',
      high: 'bg-orange-500',
      urgent: 'bg-red-500',
    };
    return colors[priority as keyof typeof colors] || colors.medium;
  };

  const getEventsForDay = (day: Date): CalendarEvent[] => {
    return events.filter(event => {
      const eventDate = new Date(event.startTime);
      return (
        eventDate.getDate() === day.getDate() &&
        eventDate.getMonth() === day.getMonth() &&
        eventDate.getFullYear() === day.getFullYear()
      );
    });
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const handleDragStart = (blockId: string) => {
    setDraggedBlock(blockId);
  };

  const handleDragEnd = () => {
    setDraggedBlock(null);
    setDragOverCell(null);
  };

  const handleDrop = (day: Date, hour: number) => {
    if (!draggedBlock) return;

    const newStart = new Date(day);
    newStart.setHours(hour, 0, 0, 0);

    const originalBlock = scheduledBlocks.find(b => b.id === draggedBlock);
    if (!originalBlock) return;

    const duration = originalBlock.durationMinutes;
    const newEnd = new Date(newStart);
    newEnd.setMinutes(newEnd.getMinutes() + duration);

    onBlockMove(draggedBlock, newStart, newEnd);
    setDraggedBlock(null);
    setDragOverCell(null);
  };

  if (viewMode === 'month') {
    return (
      <div className="h-full overflow-auto p-4">
        <div className="grid grid-cols-7 gap-2">
          {/* Day headers */}
          {DAYS_OF_WEEK.map(day => (
            <div key={day} className="text-center text-sm font-semibold text-muted-foreground py-2">
              {day}
            </div>
          ))}

          {/* Calendar cells */}
          {displayDays.map((day, index) => {
            const dayEvents = getEventsForDay(day);
            const isCurrentMonth = day.getMonth() === currentDate.getMonth();
            const isToday =
              day.getDate() === new Date().getDate() &&
              day.getMonth() === new Date().getMonth() &&
              day.getFullYear() === new Date().getFullYear();

            return (
              <div
                key={index}
                className={`min-h-[120px] border rounded-lg p-2 transition-colors ${
                  isCurrentMonth ? 'bg-background' : 'bg-muted/20'
                } ${isToday ? 'ring-2 ring-primary' : ''}`}
              >
                <div className={`text-sm font-medium mb-1 ${isToday ? 'text-primary' : 'text-foreground'}`}>
                  {day.getDate()}
                </div>
                <div className="space-y-1">
                  {dayEvents.slice(0, 3).map(event => (
                    <div
                      key={event.id}
                      className={`text-xs px-2 py-1 rounded ${event.color} text-white truncate cursor-pointer opacity-90 hover:opacity-100 transition-opacity`}
                      title={`${event.title}\n${formatTime(event.startTime)} - ${formatTime(event.endTime)}`}
                    >
                      {formatTime(event.startTime)} {event.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="text-xs text-muted-foreground">
                      +{dayEvents.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Week/Day view with hourly grid
  const workHoursStart = preferences?.workHoursStart
    ? parseInt(preferences.workHoursStart.split(':')[0])
    : 9;
  const workHoursEnd = preferences?.workHoursEnd
    ? parseInt(preferences.workHoursEnd.split(':')[0])
    : 17;

  const displayHours = HOURS.slice(workHoursStart, workHoursEnd + 1);

  // Fix: Use proper grid class instead of template literal
  const gridClassName = viewMode === 'day' ? 'grid grid-cols-1' : 'grid grid-cols-7';

  return (
    <div className="h-full overflow-auto">
      <div className="flex">
        {/* Time column */}
        <div className="w-20 flex-shrink-0 border-r border-border">
          <div className="h-12" /> {/* Header spacer */}
          {displayHours.map(hour => (
            <div key={hour} className="h-16 border-t border-border text-xs text-muted-foreground px-2 py-1">
              {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
            </div>
          ))}
        </div>

        {/* Days columns */}
        <div className="flex-1 overflow-x-auto">
          <div className={`${gridClassName} min-w-full`}>
            {displayDays.map((day, dayIndex) => {
              const dayEvents = getEventsForDay(day);
              const isToday =
                day.getDate() === new Date().getDate() &&
                day.getMonth() === new Date().getMonth() &&
                day.getFullYear() === new Date().getFullYear();

              return (
                <div key={dayIndex} className="border-r border-border last:border-r-0">
                  {/* Day header */}
                  <div className={`h-12 border-b border-border flex flex-col items-center justify-center transition-colors ${
                    isToday ? 'bg-primary/5' : ''
                  }`}>
                    <div className="text-xs text-muted-foreground">
                      {DAYS_OF_WEEK[day.getDay()]}
                    </div>
                    <div className={`text-lg font-semibold ${isToday ? 'text-primary' : ''}`}>
                      {day.getDate()}
                    </div>
                  </div>

                  {/* Hour cells */}
                  <div className="relative">
                    {displayHours.map((hour) => {
                      const cellKey = `${day.toDateString()}-${hour}`;
                      const isDragOver = dragOverCell === cellKey;

                      return (
                        <div
                          key={hour}
                          className={`h-16 border-t border-border transition-colors ${
                            isDragOver ? 'bg-primary/10' : 'hover:bg-muted/30'
                          }`}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragOverCell(cellKey);
                          }}
                          onDragLeave={() => {
                            setDragOverCell(null);
                          }}
                          onDrop={() => handleDrop(day, hour)}
                        />
                      );
                    })}

                    {/* Events overlay */}
                    {dayEvents.map(event => {
                      const startHour = event.startTime.getHours();
                      const startMinute = event.startTime.getMinutes();
                      const endHour = event.endTime.getHours();
                      const endMinute = event.endTime.getMinutes();

                      // Calculate position
                      const top = ((startHour - workHoursStart) * 64) + (startMinute / 60 * 64);
                      const height = (((endHour - startHour) * 60 + (endMinute - startMinute)) / 60) * 64;

                      // Skip if event is outside work hours
                      if (top < 0 || height <= 0) return null;

                      const isDragging = draggedBlock === event.id;

                      return (
                        <div
                          key={event.id}
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            handleDragStart(event.id);
                          }}
                          onDragEnd={handleDragEnd}
                          className={`absolute left-1 right-1 ${event.color} text-white rounded-lg p-2 cursor-move shadow-sm hover:shadow-md transition-all ${
                            isDragging ? 'opacity-50 scale-95' : event.isCompleted ? 'opacity-50' : 'opacity-90 hover:opacity-100'
                          }`}
                          style={{ top: `${top}px`, height: `${Math.max(height, 24)}px`, minHeight: '24px' }}
                          title={`${event.title}\n${formatTime(event.startTime)} - ${formatTime(event.endTime)}${event.description ? `\n${event.description}` : ''}`}
                        >
                          <div className="text-xs font-semibold truncate">{event.title}</div>
                          {height > 40 && (
                            <div className="text-xs opacity-90">
                              {formatTime(event.startTime)} - {formatTime(event.endTime)}
                            </div>
                          )}
                          {height > 60 && event.isAutoScheduled && (
                            <div className="text-xs opacity-75 mt-1">✨ Auto-scheduled</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
