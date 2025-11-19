-- Study Materials System Migration
-- Adds comprehensive support for quizzes, flashcards, and summaries with versioning and analytics
-- This migration creates 9 tables with proper RLS policies and indexes

-- =====================================================
-- STUDY_MATERIALS TABLE (Parent table)
-- =====================================================
CREATE TABLE study_materials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('quiz', 'flashcard_set', 'summary')),
  version INTEGER NOT NULL DEFAULT 1,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_content_hash TEXT,
  metadata JSONB,
  is_archived BOOLEAN DEFAULT false,
  UNIQUE(instance_id, type, version)
);

-- Indexes for study_materials
CREATE INDEX idx_study_materials_user_instance ON study_materials(user_id, instance_id);
CREATE INDEX idx_study_materials_type ON study_materials(type);
CREATE INDEX idx_study_materials_generated_at ON study_materials(generated_at DESC);
CREATE INDEX idx_study_materials_archived ON study_materials(is_archived) WHERE is_archived = false;

-- RLS for study_materials
ALTER TABLE study_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own study materials"
  ON study_materials FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own study materials"
  ON study_materials FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own study materials"
  ON study_materials FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own study materials"
  ON study_materials FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- SUMMARIES TABLE
-- =====================================================
CREATE TABLE summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  study_material_id UUID NOT NULL REFERENCES study_materials(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  word_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for summaries
CREATE INDEX idx_summaries_study_material ON summaries(study_material_id);

-- RLS for summaries (inherit from study_materials)
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view summaries from their own study materials"
  ON summaries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM study_materials
      WHERE study_materials.id = summaries.study_material_id
      AND study_materials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create summaries for their own study materials"
  ON summaries FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM study_materials
      WHERE study_materials.id = summaries.study_material_id
      AND study_materials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update summaries from their own study materials"
  ON summaries FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM study_materials
      WHERE study_materials.id = summaries.study_material_id
      AND study_materials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete summaries from their own study materials"
  ON summaries FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM study_materials
      WHERE study_materials.id = summaries.study_material_id
      AND study_materials.user_id = auth.uid()
    )
  );

-- =====================================================
-- FLASHCARD_SETS TABLE
-- =====================================================
CREATE TABLE flashcard_sets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  study_material_id UUID NOT NULL REFERENCES study_materials(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  card_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for flashcard_sets
CREATE INDEX idx_flashcard_sets_study_material ON flashcard_sets(study_material_id);

-- RLS for flashcard_sets
ALTER TABLE flashcard_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view flashcard sets from their own study materials"
  ON flashcard_sets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM study_materials
      WHERE study_materials.id = flashcard_sets.study_material_id
      AND study_materials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create flashcard sets for their own study materials"
  ON flashcard_sets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM study_materials
      WHERE study_materials.id = flashcard_sets.study_material_id
      AND study_materials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update flashcard sets from their own study materials"
  ON flashcard_sets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM study_materials
      WHERE study_materials.id = flashcard_sets.study_material_id
      AND study_materials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete flashcard sets from their own study materials"
  ON flashcard_sets FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM study_materials
      WHERE study_materials.id = flashcard_sets.study_material_id
      AND study_materials.user_id = auth.uid()
    )
  );

-- =====================================================
-- FLASHCARDS TABLE
-- =====================================================
CREATE TABLE flashcards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flashcard_set_id UUID NOT NULL REFERENCES flashcard_sets(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  position INTEGER NOT NULL,
  difficulty_rating DECIMAL(3,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for flashcards
CREATE INDEX idx_flashcards_set ON flashcards(flashcard_set_id);
CREATE INDEX idx_flashcards_position ON flashcards(flashcard_set_id, position);

-- RLS for flashcards
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view flashcards from their own flashcard sets"
  ON flashcards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM flashcard_sets
      JOIN study_materials ON study_materials.id = flashcard_sets.study_material_id
      WHERE flashcard_sets.id = flashcards.flashcard_set_id
      AND study_materials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create flashcards for their own flashcard sets"
  ON flashcards FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM flashcard_sets
      JOIN study_materials ON study_materials.id = flashcard_sets.study_material_id
      WHERE flashcard_sets.id = flashcards.flashcard_set_id
      AND study_materials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update flashcards from their own flashcard sets"
  ON flashcards FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM flashcard_sets
      JOIN study_materials ON study_materials.id = flashcard_sets.study_material_id
      WHERE flashcard_sets.id = flashcards.flashcard_set_id
      AND study_materials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete flashcards from their own flashcard sets"
  ON flashcards FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM flashcard_sets
      JOIN study_materials ON study_materials.id = flashcard_sets.study_material_id
      WHERE flashcard_sets.id = flashcards.flashcard_set_id
      AND study_materials.user_id = auth.uid()
    )
  );

-- =====================================================
-- FLASHCARD_REVIEWS TABLE (Spaced Repetition)
-- =====================================================
CREATE TABLE flashcard_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flashcard_id UUID NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quality_rating INTEGER NOT NULL CHECK (quality_rating BETWEEN 0 AND 5),
  ease_factor DECIMAL(4,2) NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 1,
  repetitions INTEGER NOT NULL DEFAULT 0,
  next_review_date DATE NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for flashcard_reviews (spaced repetition queries)
CREATE INDEX idx_flashcard_reviews_user_next_review ON flashcard_reviews(user_id, next_review_date);
CREATE INDEX idx_flashcard_reviews_flashcard ON flashcard_reviews(flashcard_id);
CREATE INDEX idx_flashcard_reviews_user_flashcard ON flashcard_reviews(user_id, flashcard_id);

-- RLS for flashcard_reviews
ALTER TABLE flashcard_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own flashcard reviews"
  ON flashcard_reviews FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own flashcard reviews"
  ON flashcard_reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own flashcard reviews"
  ON flashcard_reviews FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own flashcard reviews"
  ON flashcard_reviews FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- QUIZZES TABLE
-- =====================================================
CREATE TABLE quizzes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  study_material_id UUID NOT NULL REFERENCES study_materials(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  question_count INTEGER NOT NULL DEFAULT 0,
  time_limit_seconds INTEGER,
  passing_score_percent INTEGER DEFAULT 70,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quizzes
CREATE INDEX idx_quizzes_study_material ON quizzes(study_material_id);

-- RLS for quizzes
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view quizzes from their own study materials"
  ON quizzes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM study_materials
      WHERE study_materials.id = quizzes.study_material_id
      AND study_materials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create quizzes for their own study materials"
  ON quizzes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM study_materials
      WHERE study_materials.id = quizzes.study_material_id
      AND study_materials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update quizzes from their own study materials"
  ON quizzes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM study_materials
      WHERE study_materials.id = quizzes.study_material_id
      AND study_materials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete quizzes from their own study materials"
  ON quizzes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM study_materials
      WHERE study_materials.id = quizzes.study_material_id
      AND study_materials.user_id = auth.uid()
    )
  );

-- =====================================================
-- QUIZ_QUESTIONS TABLE
-- =====================================================
CREATE TABLE quiz_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  correct_option_index INTEGER NOT NULL,
  explanation TEXT,
  position INTEGER NOT NULL,
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for quiz_questions
CREATE INDEX idx_quiz_questions_quiz ON quiz_questions(quiz_id);
CREATE INDEX idx_quiz_questions_position ON quiz_questions(quiz_id, position);

-- RLS for quiz_questions
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view quiz questions from their own quizzes"
  ON quiz_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM quizzes
      JOIN study_materials ON study_materials.id = quizzes.study_material_id
      WHERE quizzes.id = quiz_questions.quiz_id
      AND study_materials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create quiz questions for their own quizzes"
  ON quiz_questions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quizzes
      JOIN study_materials ON study_materials.id = quizzes.study_material_id
      WHERE quizzes.id = quiz_questions.quiz_id
      AND study_materials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update quiz questions from their own quizzes"
  ON quiz_questions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM quizzes
      JOIN study_materials ON study_materials.id = quizzes.study_material_id
      WHERE quizzes.id = quiz_questions.quiz_id
      AND study_materials.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete quiz questions from their own quizzes"
  ON quiz_questions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM quizzes
      JOIN study_materials ON study_materials.id = quizzes.study_material_id
      WHERE quizzes.id = quiz_questions.quiz_id
      AND study_materials.user_id = auth.uid()
    )
  );

-- =====================================================
-- QUIZ_ATTEMPTS TABLE
-- =====================================================
CREATE TABLE quiz_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  score INTEGER,
  total_questions INTEGER,
  time_taken_seconds INTEGER,
  passed BOOLEAN,
  attempt_number INTEGER NOT NULL
);

-- Indexes for quiz_attempts (analytics queries)
CREATE INDEX idx_quiz_attempts_user_quiz ON quiz_attempts(user_id, quiz_id);
CREATE INDEX idx_quiz_attempts_completed ON quiz_attempts(completed_at);
CREATE INDEX idx_quiz_attempts_user ON quiz_attempts(user_id, started_at DESC);

-- RLS for quiz_attempts
ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own quiz attempts"
  ON quiz_attempts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own quiz attempts"
  ON quiz_attempts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own quiz attempts"
  ON quiz_attempts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own quiz attempts"
  ON quiz_attempts FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- QUIZ_ANSWERS TABLE
-- =====================================================
CREATE TABLE quiz_answers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quiz_attempt_id UUID NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  quiz_question_id UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  selected_option_index INTEGER NOT NULL,
  is_correct BOOLEAN NOT NULL,
  time_taken_seconds INTEGER,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for quiz_answers
CREATE INDEX idx_quiz_answers_attempt ON quiz_answers(quiz_attempt_id);
CREATE INDEX idx_quiz_answers_question ON quiz_answers(quiz_question_id);

-- RLS for quiz_answers (inherit from quiz_attempts)
ALTER TABLE quiz_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view answers from their own quiz attempts"
  ON quiz_answers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM quiz_attempts
      WHERE quiz_attempts.id = quiz_answers.quiz_attempt_id
      AND quiz_attempts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create answers for their own quiz attempts"
  ON quiz_answers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quiz_attempts
      WHERE quiz_attempts.id = quiz_answers.quiz_attempt_id
      AND quiz_attempts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update answers from their own quiz attempts"
  ON quiz_answers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM quiz_attempts
      WHERE quiz_attempts.id = quiz_answers.quiz_attempt_id
      AND quiz_attempts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete answers from their own quiz attempts"
  ON quiz_answers FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM quiz_attempts
      WHERE quiz_attempts.id = quiz_answers.quiz_attempt_id
      AND quiz_attempts.user_id = auth.uid()
    )
  );

-- =====================================================
-- TRIGGERS AND FUNCTIONS
-- =====================================================

-- Function to update card_count in flashcard_sets
CREATE OR REPLACE FUNCTION update_flashcard_set_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE flashcard_sets
    SET card_count = card_count + 1
    WHERE id = NEW.flashcard_set_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE flashcard_sets
    SET card_count = card_count - 1
    WHERE id = OLD.flashcard_set_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update flashcard_sets.card_count
CREATE TRIGGER update_flashcard_set_count_trigger
  AFTER INSERT OR DELETE ON flashcards
  FOR EACH ROW
  EXECUTE FUNCTION update_flashcard_set_count();

-- Function to update question_count in quizzes
CREATE OR REPLACE FUNCTION update_quiz_question_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE quizzes
    SET question_count = question_count + 1
    WHERE id = NEW.quiz_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE quizzes
    SET question_count = question_count - 1
    WHERE id = OLD.quiz_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update quizzes.question_count
CREATE TRIGGER update_quiz_question_count_trigger
  AFTER INSERT OR DELETE ON quiz_questions
  FOR EACH ROW
  EXECUTE FUNCTION update_quiz_question_count();

-- Function to calculate word count for summaries
CREATE OR REPLACE FUNCTION calculate_summary_word_count()
RETURNS TRIGGER AS $$
BEGIN
  NEW.word_count = array_length(regexp_split_to_array(trim(NEW.content), '\s+'), 1);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically calculate word_count on summary insert/update
CREATE TRIGGER calculate_summary_word_count_trigger
  BEFORE INSERT OR UPDATE OF content ON summaries
  FOR EACH ROW
  EXECUTE FUNCTION calculate_summary_word_count();

-- Function to calculate attempt_number for quiz attempts
CREATE OR REPLACE FUNCTION calculate_quiz_attempt_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.attempt_number = COALESCE(
    (SELECT MAX(attempt_number) + 1 
     FROM quiz_attempts 
     WHERE quiz_id = NEW.quiz_id AND user_id = NEW.user_id),
    1
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically calculate attempt_number
CREATE TRIGGER calculate_quiz_attempt_number_trigger
  BEFORE INSERT ON quiz_attempts
  FOR EACH ROW
  EXECUTE FUNCTION calculate_quiz_attempt_number();

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================
COMMENT ON TABLE study_materials IS 'Parent table for all study materials (quizzes, flashcards, summaries) with versioning support';
COMMENT ON TABLE summaries IS 'AI-generated summaries of educational content';
COMMENT ON TABLE flashcard_sets IS 'Collections of flashcards for spaced repetition learning';
COMMENT ON TABLE flashcards IS 'Individual flashcard items with front/back content';
COMMENT ON TABLE flashcard_reviews IS 'Spaced repetition tracking using SM-2 algorithm';
COMMENT ON TABLE quizzes IS 'Quiz metadata and settings';
COMMENT ON TABLE quiz_questions IS 'Individual quiz questions with multiple choice options';
COMMENT ON TABLE quiz_attempts IS 'User attempts at quizzes with scoring and timing';
COMMENT ON TABLE quiz_answers IS 'Individual question answers within quiz attempts';

COMMENT ON COLUMN study_materials.source_content_hash IS 'Hash of source content to detect when regeneration is needed';
COMMENT ON COLUMN study_materials.is_archived IS 'Soft delete for versioning - allows keeping old versions';
COMMENT ON COLUMN flashcard_reviews.quality_rating IS '0=complete blackout, 5=perfect recall (SM-2 algorithm)';
COMMENT ON COLUMN flashcard_reviews.ease_factor IS 'SM-2 algorithm ease factor for spaced repetition';
COMMENT ON COLUMN flashcard_reviews.interval_days IS 'Days until next review (SM-2 algorithm)';



