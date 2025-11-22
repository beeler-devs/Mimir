-- Add option_explanations column to quiz_questions table
-- This allows storing an explanation for each quiz option (correct or incorrect)

ALTER TABLE quiz_questions
ADD COLUMN option_explanations JSONB;

COMMENT ON COLUMN quiz_questions.option_explanations IS 'Array of explanations for each quiz option - explains why each option is correct or incorrect';

