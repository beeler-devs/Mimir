-- Add position tracking to quiz attempts for resume functionality
-- This allows users to resume incomplete quiz attempts from where they left off

ALTER TABLE quiz_attempts
ADD COLUMN current_question_index INTEGER DEFAULT 0;

COMMENT ON COLUMN quiz_attempts.current_question_index IS 'Current question index for resuming incomplete attempts (0-based)';

