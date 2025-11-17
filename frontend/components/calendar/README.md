# Calendar & Task Management System

AI-powered calendar and task scheduling system with Pomodoro timer integration.

## Features

### 📅 Smart Calendar
- **Multiple Views**: Month, week, and day views
- **AI-Powered Scheduling**: Automatically finds optimal time slots for tasks
- **Drag & Drop**: Manually adjust scheduled blocks
- **Task Splitting**: Long tasks are automatically split into manageable sessions
- **Conflict Detection**: Never schedules overlapping tasks

### 💬 Natural Language Task Input
- Describe tasks in plain English
- Automatically extracts:
  - Task title and description
  - Duration estimates
  - Due dates
  - Priority levels
  - Categories

Example: *"Finish math homework, should take 2 hours, due Friday"*

### ⏱️ Pomodoro Timer
- Customizable work/break durations
- Session tracking with task linking
- Visual progress indicators
- Auto-advance between work and break sessions
- Long break after configurable number of sessions
- Browser notifications

### 🎯 Smart Features
- **Learning System**: Tracks actual vs estimated time to improve future estimates
- **Priority-Based Scheduling**: Urgent tasks get earlier time slots
- **Work Preference Aware**: Respects morning/afternoon/evening preferences
- **Break Management**: Automatically schedules breaks between sessions
- **Time Tracking**: Records actual time spent on tasks for analytics

## Database Schema

### Tables

#### `tasks`
Main task storage with:
- Title, description, category, tags
- Estimated and actual duration
- Due date, priority, status
- Learning metadata

#### `scheduled_blocks`
Time blocks assigned to tasks:
- Start/end time
- Auto-scheduled flag (AI vs manual)
- Completion status
- Session notes

#### `time_tracking`
Actual time spent tracking:
- Start/end time
- Session type (work/pomodoro/break)
- Interruption count
- Focus rating (1-5)

#### `pomodoro_sessions`
Pomodoro timer sessions:
- Work/break durations
- Session number in cycle
- Pause tracking
- Completion status

#### `task_duration_patterns`
Learning system for duration estimation:
- Category-based patterns
- Statistical metrics (avg, std dev)
- Estimation error tracking

#### `calendar_preferences`
User scheduling preferences:
- Work hours and days
- Session duration preferences
- Time-of-day preferences
- Pomodoro defaults

## Components

### CalendarView
Main calendar component with three-panel layout:
- **Left**: Task list grouped by due date
- **Center**: Calendar grid (month/week/day)
- **Right**: Task input chat

```tsx
import { CalendarView } from '@/components/calendar';

function Page() {
  return <CalendarView />;
}
```

### TaskChat
Natural language task input interface using AI to parse task details.

```tsx
import { TaskChat } from '@/components/calendar';

<TaskChat
  onTaskCreated={(task) => console.log('Created:', task)}
  preferences={userPreferences}
/>
```

### ScheduleView
Calendar grid with drag-and-drop support.

```tsx
import { ScheduleView } from '@/components/calendar';

<ScheduleView
  viewMode="week"
  currentDate={new Date()}
  scheduledBlocks={blocks}
  tasks={tasks}
  onBlockMove={(blockId, start, end) => updateBlock(blockId, start, end)}
  preferences={preferences}
/>
```

### PomodoroTimer
Full-screen Pomodoro timer modal.

```tsx
import { PomodoroTimer } from '@/components/calendar';

<PomodoroTimer
  tasks={activeTasks}
  onClose={() => setTimerOpen(false)}
  onSessionComplete={(session) => saveSession(session)}
/>
```

## API Endpoints

### POST `/supabase/functions/schedule-task`

AI-powered task scheduling endpoint.

**Request:**
```json
{
  "task": {
    "id": "task-123",
    "title": "Complete project report",
    "estimatedDurationMinutes": 120,
    "dueDate": "2025-11-20T23:59:59Z",
    "priority": "high"
  },
  "preferences": {
    "workHoursStart": "09:00",
    "workHoursEnd": "17:00",
    "workDays": [1, 2, 3, 4, 5],
    "preferredSessionDurationMinutes": 60,
    "minSessionDurationMinutes": 30,
    "maxSessionDurationMinutes": 120
  },
  "existingBlocks": [
    {
      "id": "block-1",
      "startTime": "2025-11-18T10:00:00Z",
      "endTime": "2025-11-18T11:00:00Z"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "scheduledBlocks": [
    {
      "taskId": "task-123",
      "startTime": "2025-11-18T14:00:00Z",
      "endTime": "2025-11-18T15:00:00Z",
      "durationMinutes": 60,
      "isAutoScheduled": true,
      "sessionNotes": "Afternoon session, good focus time"
    },
    {
      "taskId": "task-123",
      "startTime": "2025-11-19T09:00:00Z",
      "endTime": "2025-11-19T10:00:00Z",
      "durationMinutes": 60,
      "isAutoScheduled": true,
      "sessionNotes": "Morning session to complete task before deadline"
    }
  ],
  "reasoning": "Scheduled 2 session(s) for this task"
}
```

## Usage Flow

### Adding a Task

1. User clicks Calendar icon in sidebar
2. User types task description in chat: *"Study for physics exam, 3 hours, due Monday"*
3. AI parses:
   - Title: "Study for physics exam"
   - Duration: 180 minutes
   - Due Date: Next Monday at 11:59 PM
   - Category: "study"
4. Task is created and sent to scheduling AI
5. AI finds optimal time slots considering:
   - User's work hours (e.g., 9 AM - 5 PM)
   - Existing scheduled blocks
   - Due date urgency
   - Preferred session length (60 min with breaks)
6. Task is split into 3 one-hour sessions
7. Sessions appear on calendar as colored blocks

### Using Pomodoro Timer

1. User clicks Timer icon in sidebar
2. Selects a task from dropdown
3. Adjusts settings if needed (default 25 min work, 5 min break)
4. Clicks play to start
5. Timer counts down
6. Browser notification at completion
7. Auto-advances to break or next work session
8. Session is saved with task linkage

### Manual Adjustments

1. User sees auto-scheduled task block on calendar
2. Drags block to different time slot
3. Block updates with `isAutoScheduled: false`
4. Database is updated with new times

## Learning System

The system learns from actual task completion times:

1. **Pattern Recognition**: Groups similar tasks by category and tags
2. **Statistical Analysis**: Calculates average duration and variance
3. **Estimation Improvement**: Adjusts future estimates based on patterns
4. **User Feedback**: Tracks estimation error to improve AI scheduling

Example: After completing 5 "homework" tasks that all took 20% longer than estimated, the system will automatically add 20% to future homework estimates.

## Accessibility

- Keyboard navigation support
- ARIA labels on all interactive elements
- Screen reader compatible
- High contrast mode support
- Focus indicators

## Browser Notifications

The Pomodoro timer uses the Web Notifications API. Users are prompted to allow notifications on first use.

```typescript
// Request permission
if ('Notification' in window && Notification.permission === 'default') {
  await Notification.requestPermission();
}
```

## Future Enhancements

- [ ] Recurring tasks
- [ ] Task dependencies
- [ ] Team collaboration
- [ ] Calendar sync (Google Calendar, Outlook)
- [ ] Mobile app
- [ ] Offline support
- [ ] Analytics dashboard
- [ ] AI suggestions based on productivity patterns
- [ ] Integration with workspace instances
- [ ] Voice input for tasks
