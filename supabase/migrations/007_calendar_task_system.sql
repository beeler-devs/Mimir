-- Calendar and Task Management System
-- Creates tables for task scheduling, time tracking, and Pomodoro sessions

-- Tasks table: User's assignments and work items
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,

  -- Time estimates and tracking
  estimated_duration_minutes INTEGER, -- User's initial estimate
  actual_duration_minutes INTEGER, -- Actual time spent (calculated from time_tracking)
  due_date TIMESTAMPTZ,

  -- Priority and status
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  status TEXT CHECK (status IN ('todo', 'in_progress', 'completed', 'cancelled')) DEFAULT 'todo',

  -- Learning metadata
  task_category TEXT, -- e.g., 'homework', 'project', 'study', 'assignment'
  tags TEXT[], -- For categorization and learning patterns

  -- Related instance (optional)
  instance_id UUID REFERENCES documents(id) ON DELETE SET NULL,

  -- Completion tracking
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scheduled blocks: Time blocks assigned to tasks
CREATE TABLE IF NOT EXISTS scheduled_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,

  -- Time block details
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (end_time - start_time)) / 60
  ) STORED,

  -- Block metadata
  is_completed BOOLEAN DEFAULT FALSE,
  is_auto_scheduled BOOLEAN DEFAULT TRUE, -- True if scheduled by AI, false if manually placed

  -- Notes for this specific session
  session_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraint: end time must be after start time
  CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- Time tracking: Track actual time spent on tasks
CREATE TABLE IF NOT EXISTS time_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  scheduled_block_id UUID REFERENCES scheduled_blocks(id) ON DELETE SET NULL,

  -- Time tracking
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_minutes INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN end_time IS NOT NULL
      THEN EXTRACT(EPOCH FROM (end_time - start_time)) / 60
      ELSE NULL
    END
  ) STORED,

  -- Session type
  session_type TEXT CHECK (session_type IN ('work', 'pomodoro', 'break')) DEFAULT 'work',

  -- Interruptions and focus
  interruption_count INTEGER DEFAULT 0,
  focus_rating INTEGER CHECK (focus_rating >= 1 AND focus_rating <= 5), -- 1-5 scale

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pomodoro sessions: Track Pomodoro timer sessions
CREATE TABLE IF NOT EXISTS pomodoro_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  time_tracking_id UUID REFERENCES time_tracking(id) ON DELETE SET NULL,

  -- Pomodoro settings
  work_duration_minutes INTEGER DEFAULT 25,
  break_duration_minutes INTEGER DEFAULT 5,
  long_break_duration_minutes INTEGER DEFAULT 15,
  sessions_until_long_break INTEGER DEFAULT 4,

  -- Session tracking
  session_number INTEGER DEFAULT 1, -- Which pomodoro in the set
  session_type TEXT CHECK (session_type IN ('work', 'short_break', 'long_break')) DEFAULT 'work',

  -- Timing
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  total_pause_duration_minutes INTEGER DEFAULT 0,

  -- Completion status
  is_completed BOOLEAN DEFAULT FALSE,
  was_interrupted BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Task templates: Learn patterns for duration estimation
CREATE TABLE IF NOT EXISTS task_duration_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Pattern identification
  task_category TEXT NOT NULL,
  tags TEXT[],
  keywords TEXT[], -- Common words in similar tasks

  -- Duration statistics
  sample_count INTEGER DEFAULT 0,
  avg_estimated_duration_minutes NUMERIC,
  avg_actual_duration_minutes NUMERIC,
  std_dev_minutes NUMERIC,

  -- Accuracy metrics
  avg_estimation_error_percent NUMERIC, -- How far off estimates typically are

  -- Last updated
  last_updated TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint on category + tags combination per user
  UNIQUE(user_id, task_category, tags)
);

-- User calendar preferences
CREATE TABLE IF NOT EXISTS calendar_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Working hours
  work_hours_start TIME DEFAULT '09:00',
  work_hours_end TIME DEFAULT '17:00',
  work_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5], -- 0=Sunday, 1=Monday, etc.

  -- Preferences
  preferred_session_duration_minutes INTEGER DEFAULT 60,
  min_session_duration_minutes INTEGER DEFAULT 30,
  max_session_duration_minutes INTEGER DEFAULT 120,
  break_duration_minutes INTEGER DEFAULT 15,

  -- Scheduling preferences
  prefer_morning BOOLEAN DEFAULT FALSE,
  prefer_afternoon BOOLEAN DEFAULT FALSE,
  prefer_evening BOOLEAN DEFAULT FALSE,

  -- Pomodoro defaults
  default_pomodoro_work_minutes INTEGER DEFAULT 25,
  default_pomodoro_break_minutes INTEGER DEFAULT 5,
  default_pomodoro_long_break_minutes INTEGER DEFAULT 15,

  -- Timezone
  timezone TEXT DEFAULT 'UTC',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_category ON tasks(task_category);

CREATE INDEX idx_scheduled_blocks_user_id ON scheduled_blocks(user_id);
CREATE INDEX idx_scheduled_blocks_task_id ON scheduled_blocks(task_id);
CREATE INDEX idx_scheduled_blocks_time_range ON scheduled_blocks(start_time, end_time);

CREATE INDEX idx_time_tracking_user_id ON time_tracking(user_id);
CREATE INDEX idx_time_tracking_task_id ON time_tracking(task_id);
CREATE INDEX idx_time_tracking_start_time ON time_tracking(start_time);

CREATE INDEX idx_pomodoro_sessions_user_id ON pomodoro_sessions(user_id);
CREATE INDEX idx_pomodoro_sessions_task_id ON pomodoro_sessions(task_id);

CREATE INDEX idx_task_patterns_user_category ON task_duration_patterns(user_id, task_category);

-- Row Level Security (RLS) Policies
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE pomodoro_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_duration_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_preferences ENABLE ROW LEVEL SECURITY;

-- Tasks policies
CREATE POLICY "Users can view their own tasks"
  ON tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tasks"
  ON tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tasks"
  ON tasks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own tasks"
  ON tasks FOR DELETE
  USING (auth.uid() = user_id);

-- Scheduled blocks policies
CREATE POLICY "Users can view their own scheduled blocks"
  ON scheduled_blocks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own scheduled blocks"
  ON scheduled_blocks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own scheduled blocks"
  ON scheduled_blocks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own scheduled blocks"
  ON scheduled_blocks FOR DELETE
  USING (auth.uid() = user_id);

-- Time tracking policies
CREATE POLICY "Users can view their own time tracking"
  ON time_tracking FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own time tracking"
  ON time_tracking FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own time tracking"
  ON time_tracking FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own time tracking"
  ON time_tracking FOR DELETE
  USING (auth.uid() = user_id);

-- Pomodoro sessions policies
CREATE POLICY "Users can view their own pomodoro sessions"
  ON pomodoro_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own pomodoro sessions"
  ON pomodoro_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pomodoro sessions"
  ON pomodoro_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own pomodoro sessions"
  ON pomodoro_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- Task duration patterns policies
CREATE POLICY "Users can view their own task patterns"
  ON task_duration_patterns FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own task patterns"
  ON task_duration_patterns FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own task patterns"
  ON task_duration_patterns FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own task patterns"
  ON task_duration_patterns FOR DELETE
  USING (auth.uid() = user_id);

-- Calendar preferences policies
CREATE POLICY "Users can view their own calendar preferences"
  ON calendar_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own calendar preferences"
  ON calendar_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own calendar preferences"
  ON calendar_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own calendar preferences"
  ON calendar_preferences FOR DELETE
  USING (auth.uid() = user_id);

-- Functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scheduled_blocks_updated_at
  BEFORE UPDATE ON scheduled_blocks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_time_tracking_updated_at
  BEFORE UPDATE ON time_tracking
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calendar_preferences_updated_at
  BEFORE UPDATE ON calendar_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to update task actual duration from time tracking
CREATE OR REPLACE FUNCTION update_task_actual_duration()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE tasks
  SET actual_duration_minutes = (
    SELECT COALESCE(SUM(duration_minutes), 0)
    FROM time_tracking
    WHERE task_id = NEW.task_id
      AND end_time IS NOT NULL
  )
  WHERE id = NEW.task_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update task duration when time tracking changes
CREATE TRIGGER update_task_duration_on_tracking
  AFTER INSERT OR UPDATE ON time_tracking
  FOR EACH ROW
  WHEN (NEW.end_time IS NOT NULL)
  EXECUTE FUNCTION update_task_actual_duration();
