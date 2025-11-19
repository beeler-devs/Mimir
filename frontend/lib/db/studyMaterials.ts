/**
 * Database operations for study materials (quizzes, flashcards, summaries)
 * Includes versioning, analytics, and spaced repetition support
 */

import { supabase } from '../supabaseClient';
import {
  StudyMaterial,
  StudyMaterialType,
  Summary,
  SummaryWithMaterial,
  FlashcardSet,
  Flashcard,
  FlashcardSetWithCards,
  FlashcardReview,
  Quiz,
  QuizQuestion,
  QuizWithQuestions,
  QuizAttempt,
  QuizAnswer,
  QuizAttemptWithAnswers,
  FlashcardStats,
  QuizStats,
  StudyMaterialsOverview,
} from '../types';

/**
 * Calculate hash of content for versioning
 */
export function calculateContentHash(content: string): string {
  // Simple hash function - in production, use a proper hash like SHA-256
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

// =====================================================
// STUDY MATERIALS (Parent operations)
// =====================================================

/**
 * Get latest version of a study material for an instance
 */
export async function getLatestStudyMaterial(
  instanceId: string,
  type: StudyMaterialType
): Promise<StudyMaterial | null> {
  const { data, error } = await supabase
    .from('study_materials')
    .select('*')
    .eq('instance_id', instanceId)
    .eq('type', type)
    .eq('is_archived', false)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // No rows found
    throw error;
  }

  return data ? mapStudyMaterial(data) : null;
}

/**
 * Get all versions of a study material
 */
export async function getStudyMaterialVersions(
  instanceId: string,
  type: StudyMaterialType
): Promise<StudyMaterial[]> {
  const { data, error } = await supabase
    .from('study_materials')
    .select('*')
    .eq('instance_id', instanceId)
    .eq('type', type)
    .order('version', { ascending: false });

  if (error) throw error;
  return data ? data.map(mapStudyMaterial) : [];
}

/**
 * Create a new study material (increments version automatically)
 */
export async function createStudyMaterial(
  instanceId: string,
  type: StudyMaterialType,
  contentHash: string | null,
  metadata?: Record<string, any>
): Promise<StudyMaterial> {
  // Get the current user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  // Get latest version
  const latest = await getLatestStudyMaterial(instanceId, type);
  const nextVersion = latest ? latest.version + 1 : 1;

  const { data, error } = await supabase
    .from('study_materials')
    .insert({
      user_id: user.id,
      instance_id: instanceId,
      type,
      version: nextVersion,
      source_content_hash: contentHash,
      metadata: metadata || null,
      is_archived: false,
    })
    .select()
    .single();

  if (error) throw error;
  return mapStudyMaterial(data);
}

/**
 * Archive a study material version
 */
export async function archiveStudyMaterial(studyMaterialId: string): Promise<void> {
  const { error } = await supabase
    .from('study_materials')
    .update({ is_archived: true })
    .eq('id', studyMaterialId);

  if (error) throw error;
}

// =====================================================
// SUMMARIES
// =====================================================

/**
 * Save a summary to the database
 */
export async function saveSummary(
  instanceId: string,
  content: string,
  metadata?: Record<string, any>
): Promise<SummaryWithMaterial> {
  const contentHash = calculateContentHash(content);

  // Create study material
  const studyMaterial = await createStudyMaterial(instanceId, 'summary', contentHash, metadata);

  // Create summary
  const { data, error } = await supabase
    .from('summaries')
    .insert({
      study_material_id: studyMaterial.id,
      content,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    ...mapSummary(data),
    studyMaterial,
  };
}

/**
 * Get the latest summary for an instance
 */
export async function getLatestSummary(instanceId: string): Promise<SummaryWithMaterial | null> {
  const studyMaterial = await getLatestStudyMaterial(instanceId, 'summary');
  if (!studyMaterial) return null;

  const { data, error } = await supabase
    .from('summaries')
    .select('*')
    .eq('study_material_id', studyMaterial.id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data
    ? {
        ...mapSummary(data),
        studyMaterial,
      }
    : null;
}

/**
 * Get all summaries for an instance (all versions)
 */
export async function getAllSummaries(instanceId: string): Promise<SummaryWithMaterial[]> {
  const studyMaterials = await getStudyMaterialVersions(instanceId, 'summary');
  if (studyMaterials.length === 0) return [];

  const { data, error } = await supabase
    .from('summaries')
    .select('*')
    .in(
      'study_material_id',
      studyMaterials.map((sm) => sm.id)
    )
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((summary) => ({
    ...mapSummary(summary),
    studyMaterial: studyMaterials.find((sm) => sm.id === summary.study_material_id)!,
  }));
}

// =====================================================
// FLASHCARDS
// =====================================================

/**
 * Save a flashcard set to the database
 */
export async function saveFlashcardSet(
  instanceId: string,
  flashcards: Array<{ front: string; back: string }>,
  title?: string,
  description?: string,
  metadata?: Record<string, any>
): Promise<FlashcardSetWithCards> {
  const contentHash = calculateContentHash(JSON.stringify(flashcards));

  // Create study material
  const studyMaterial = await createStudyMaterial(instanceId, 'flashcard_set', contentHash, metadata);

  // Create flashcard set
  const { data: setData, error: setError } = await supabase
    .from('flashcard_sets')
    .insert({
      study_material_id: studyMaterial.id,
      title: title || null,
      description: description || null,
    })
    .select()
    .single();

  if (setError) throw setError;

  // Create flashcards
  const flashcardInserts = flashcards.map((card, index) => ({
    flashcard_set_id: setData.id,
    front: card.front,
    back: card.back,
    position: index,
  }));

  const { data: cardsData, error: cardsError } = await supabase
    .from('flashcards')
    .insert(flashcardInserts)
    .select();

  if (cardsError) throw cardsError;

  return {
    ...mapFlashcardSet(setData),
    flashcards: (cardsData || []).map(mapFlashcard),
    studyMaterial,
  };
}

/**
 * Get the latest flashcard set for an instance
 */
export async function getLatestFlashcardSet(instanceId: string): Promise<FlashcardSetWithCards | null> {
  const studyMaterial = await getLatestStudyMaterial(instanceId, 'flashcard_set');
  if (!studyMaterial) return null;

  const { data: setData, error: setError } = await supabase
    .from('flashcard_sets')
    .select('*')
    .eq('study_material_id', studyMaterial.id)
    .single();

  if (setError) {
    if (setError.code === 'PGRST116') return null;
    throw setError;
  }

  const { data: cardsData, error: cardsError } = await supabase
    .from('flashcards')
    .select('*')
    .eq('flashcard_set_id', setData.id)
    .order('position');

  if (cardsError) throw cardsError;

  return {
    ...mapFlashcardSet(setData),
    flashcards: (cardsData || []).map(mapFlashcard),
    studyMaterial,
  };
}

/**
 * Record a flashcard review (spaced repetition)
 * Uses SM-2 algorithm
 */
export async function recordFlashcardReview(
  flashcardId: string,
  qualityRating: number // 0-5
): Promise<FlashcardReview> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  // Get previous review if exists
  const { data: prevReview } = await supabase
    .from('flashcard_reviews')
    .select('*')
    .eq('flashcard_id', flashcardId)
    .eq('user_id', user.id)
    .order('reviewed_at', { ascending: false })
    .limit(1)
    .single();

  // SM-2 algorithm calculation
  let easeFactor = prevReview?.ease_factor || 2.5;
  let repetitions = prevReview?.repetitions || 0;
  let interval = prevReview?.interval_days || 1;

  if (qualityRating >= 3) {
    // Correct response
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions++;
  } else {
    // Incorrect response - reset
    repetitions = 0;
    interval = 1;
  }

  // Update ease factor
  easeFactor = easeFactor + (0.1 - (5 - qualityRating) * (0.08 + (5 - qualityRating) * 0.02));
  if (easeFactor < 1.3) easeFactor = 1.3;

  // Calculate next review date
  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + interval);

  const { data, error } = await supabase
    .from('flashcard_reviews')
    .insert({
      flashcard_id: flashcardId,
      user_id: user.id,
      quality_rating: qualityRating,
      ease_factor: easeFactor,
      interval_days: interval,
      repetitions,
      next_review_date: nextReviewDate.toISOString().split('T')[0],
    })
    .select()
    .single();

  if (error) throw error;
  return mapFlashcardReview(data);
}

/**
 * Get flashcard statistics for a user
 */
export async function getFlashcardStats(flashcardSetId: string): Promise<FlashcardStats> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  // Get all flashcards in the set
  const { data: flashcards } = await supabase
    .from('flashcards')
    .select('id')
    .eq('flashcard_set_id', flashcardSetId);

  const totalCards = flashcards?.length || 0;

  if (totalCards === 0) {
    return {
      totalCards: 0,
      reviewedCards: 0,
      dueForReview: 0,
      averageEaseFactor: 0,
      masteredCards: 0,
    };
  }

  // Get latest reviews for all cards
  const { data: reviews } = await supabase
    .from('flashcard_reviews')
    .select('flashcard_id, ease_factor, next_review_date')
    .in(
      'flashcard_id',
      flashcards!.map((c) => c.id)
    )
    .eq('user_id', user.id);

  const reviewedCards = new Set(reviews?.map((r) => r.flashcard_id)).size;
  const today = new Date().toISOString().split('T')[0];
  const dueForReview = reviews?.filter((r) => r.next_review_date <= today).length || 0;
  const averageEaseFactor =
    reviews && reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.ease_factor, 0) / reviews.length : 0;
  const masteredCards = reviews?.filter((r) => r.ease_factor > 2.5).length || 0;

  return {
    totalCards,
    reviewedCards,
    dueForReview,
    averageEaseFactor,
    masteredCards,
  };
}

// =====================================================
// QUIZZES
// =====================================================

/**
 * Save a quiz to the database
 */
export async function saveQuiz(
  instanceId: string,
  questions: Array<{
    question: string;
    options: string[];
    correctIndex: number;
    explanation?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
  }>,
  title?: string,
  description?: string,
  metadata?: Record<string, any>
): Promise<QuizWithQuestions> {
  const contentHash = calculateContentHash(JSON.stringify(questions));

  // Create study material
  const studyMaterial = await createStudyMaterial(instanceId, 'quiz', contentHash, metadata);

  // Create quiz
  const { data: quizData, error: quizError } = await supabase
    .from('quizzes')
    .insert({
      study_material_id: studyMaterial.id,
      title: title || null,
      description: description || null,
    })
    .select()
    .single();

  if (quizError) throw quizError;

  // Create questions
  const questionInserts = questions.map((q, index) => ({
    quiz_id: quizData.id,
    question: q.question,
    options: q.options,
    correct_option_index: q.correctIndex,
    explanation: q.explanation || null,
    position: index,
    difficulty: q.difficulty || null,
  }));

  const { data: questionsData, error: questionsError } = await supabase
    .from('quiz_questions')
    .insert(questionInserts)
    .select();

  if (questionsError) throw questionsError;

  return {
    ...mapQuiz(quizData),
    questions: (questionsData || []).map(mapQuizQuestion),
    studyMaterial,
  };
}

/**
 * Get the latest quiz for an instance
 */
export async function getLatestQuiz(instanceId: string): Promise<QuizWithQuestions | null> {
  const studyMaterial = await getLatestStudyMaterial(instanceId, 'quiz');
  if (!studyMaterial) return null;

  const { data: quizData, error: quizError } = await supabase
    .from('quizzes')
    .select('*')
    .eq('study_material_id', studyMaterial.id)
    .single();

  if (quizError) {
    if (quizError.code === 'PGRST116') return null;
    throw quizError;
  }

  const { data: questionsData, error: questionsError } = await supabase
    .from('quiz_questions')
    .select('*')
    .eq('quiz_id', quizData.id)
    .order('position');

  if (questionsError) throw questionsError;

  return {
    ...mapQuiz(quizData),
    questions: (questionsData || []).map(mapQuizQuestion),
    studyMaterial,
  };
}

/**
 * Start a quiz attempt
 */
export async function startQuizAttempt(quizId: string): Promise<QuizAttempt> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  // Get question count
  const { data: quiz } = await supabase.from('quizzes').select('question_count').eq('id', quizId).single();

  const { data, error } = await supabase
    .from('quiz_attempts')
    .insert({
      quiz_id: quizId,
      user_id: user.id,
      total_questions: quiz?.question_count || 0,
    })
    .select()
    .single();

  if (error) throw error;
  return mapQuizAttempt(data);
}

/**
 * Submit a quiz answer
 */
export async function submitQuizAnswer(
  attemptId: string,
  questionId: string,
  selectedOptionIndex: number,
  timeTakenSeconds?: number
): Promise<QuizAnswer> {
  // Get the correct answer
  const { data: question } = await supabase
    .from('quiz_questions')
    .select('correct_option_index')
    .eq('id', questionId)
    .single();

  const isCorrect = question ? selectedOptionIndex === question.correct_option_index : false;

  const { data, error } = await supabase
    .from('quiz_answers')
    .insert({
      quiz_attempt_id: attemptId,
      quiz_question_id: questionId,
      selected_option_index: selectedOptionIndex,
      is_correct: isCorrect,
      time_taken_seconds: timeTakenSeconds || null,
    })
    .select()
    .single();

  if (error) throw error;
  return mapQuizAnswer(data);
}

/**
 * Complete a quiz attempt
 */
export async function completeQuizAttempt(attemptId: string): Promise<QuizAttemptWithAnswers> {
  // Get all answers
  const { data: answers } = await supabase.from('quiz_answers').select('*').eq('quiz_attempt_id', attemptId);

  const score = answers?.filter((a) => a.is_correct).length || 0;
  const totalQuestions = answers?.length || 0;

  // Get quiz to check passing score
  const { data: attempt } = await supabase.from('quiz_attempts').select('quiz_id').eq('id', attemptId).single();

  const { data: quiz } = await supabase
    .from('quizzes')
    .select('passing_score_percent')
    .eq('id', attempt?.quiz_id)
    .single();

  const passingScore = quiz?.passing_score_percent || 70;
  const passed = totalQuestions > 0 ? (score / totalQuestions) * 100 >= passingScore : false;

  // Calculate total time
  const startTime = await supabase.from('quiz_attempts').select('started_at').eq('id', attemptId).single();

  const timeTaken = startTime?.data?.started_at
    ? Math.floor((Date.now() - new Date(startTime.data.started_at).getTime()) / 1000)
    : null;

  // Update attempt
  const { data, error } = await supabase
    .from('quiz_attempts')
    .update({
      completed_at: new Date().toISOString(),
      score,
      time_taken_seconds: timeTaken,
      passed,
    })
    .eq('id', attemptId)
    .select()
    .single();

  if (error) throw error;

  return {
    ...mapQuizAttempt(data),
    answers: (answers || []).map(mapQuizAnswer),
  };
}

/**
 * Get quiz statistics for a user
 */
export async function getQuizStats(quizId: string): Promise<QuizStats> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  // Get all attempts
  const { data: attempts } = await supabase
    .from('quiz_attempts')
    .select('*')
    .eq('quiz_id', quizId)
    .eq('user_id', user.id)
    .not('completed_at', 'is', null);

  if (!attempts || attempts.length === 0) {
    return {
      totalAttempts: 0,
      averageScore: 0,
      bestScore: 0,
      passRate: 0,
      averageTimeSeconds: 0,
      weakQuestions: [],
    };
  }

  const totalAttempts = attempts.length;
  const scores = attempts.map((a) => (a.total_questions ? (a.score / a.total_questions) * 100 : 0));
  const averageScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  const bestScore = Math.max(...scores);
  const passRate = (attempts.filter((a) => a.passed).length / totalAttempts) * 100;
  const averageTimeSeconds =
    attempts.reduce((sum, a) => sum + (a.time_taken_seconds || 0), 0) / attempts.length;

  // Get weak questions (most frequently incorrect)
  const { data: allAnswers } = await supabase
    .from('quiz_answers')
    .select('quiz_question_id, is_correct')
    .in(
      'quiz_attempt_id',
      attempts.map((a) => a.id)
    );

  const questionStats = new Map<string, { incorrect: number; total: number }>();
  allAnswers?.forEach((answer) => {
    const stats = questionStats.get(answer.quiz_question_id) || { incorrect: 0, total: 0 };
    stats.total++;
    if (!answer.is_correct) stats.incorrect++;
    questionStats.set(answer.quiz_question_id, stats);
  });

  // Get questions with > 50% incorrect rate
  const weakQuestionIds = Array.from(questionStats.entries())
    .filter(([_, stats]) => stats.incorrect / stats.total > 0.5)
    .sort((a, b) => b[1].incorrect - a[1].incorrect)
    .slice(0, 5)
    .map(([id]) => id);

  let weakQuestions: Array<{ questionId: string; question: string; incorrectCount: number }> = [];

  if (weakQuestionIds.length > 0) {
    const { data: questions } = await supabase
      .from('quiz_questions')
      .select('id, question')
      .in('id', weakQuestionIds);

    weakQuestions =
      questions?.map((q) => ({
        questionId: q.id,
        question: q.question,
        incorrectCount: questionStats.get(q.id)?.incorrect || 0,
      })) || [];
  }

  return {
    totalAttempts,
    averageScore,
    bestScore,
    passRate,
    averageTimeSeconds,
    weakQuestions,
  };
}

/**
 * Get all study materials for an instance
 */
export async function getStudyMaterialsOverview(instanceId: string): Promise<StudyMaterialsOverview> {
  const [summaries, flashcardSets, quizzes] = await Promise.all([
    getAllSummaries(instanceId),
    getLatestFlashcardSet(instanceId).then((set) => (set ? [set] : [])),
    getLatestQuiz(instanceId).then((quiz) => (quiz ? [quiz] : [])),
  ]);

  return {
    instanceId,
    summaries,
    flashcardSets,
    quizzes,
  };
}

// =====================================================
// MAPPING FUNCTIONS (camelCase conversion)
// =====================================================

function mapStudyMaterial(data: any): StudyMaterial {
  return {
    id: data.id,
    userId: data.user_id,
    instanceId: data.instance_id,
    type: data.type,
    version: data.version,
    generatedAt: data.generated_at,
    sourceContentHash: data.source_content_hash,
    metadata: data.metadata,
    isArchived: data.is_archived,
  };
}

function mapSummary(data: any): Summary {
  return {
    id: data.id,
    studyMaterialId: data.study_material_id,
    content: data.content,
    wordCount: data.word_count,
    createdAt: data.created_at,
  };
}

function mapFlashcardSet(data: any): FlashcardSet {
  return {
    id: data.id,
    studyMaterialId: data.study_material_id,
    title: data.title,
    description: data.description,
    cardCount: data.card_count,
    createdAt: data.created_at,
  };
}

function mapFlashcard(data: any): Flashcard {
  return {
    id: data.id,
    flashcardSetId: data.flashcard_set_id,
    front: data.front,
    back: data.back,
    position: data.position,
    difficultyRating: data.difficulty_rating,
    createdAt: data.created_at,
  };
}

function mapFlashcardReview(data: any): FlashcardReview {
  return {
    id: data.id,
    flashcardId: data.flashcard_id,
    userId: data.user_id,
    qualityRating: data.quality_rating,
    easeFactor: data.ease_factor,
    intervalDays: data.interval_days,
    repetitions: data.repetitions,
    nextReviewDate: data.next_review_date,
    reviewedAt: data.reviewed_at,
  };
}

function mapQuiz(data: any): Quiz {
  return {
    id: data.id,
    studyMaterialId: data.study_material_id,
    title: data.title,
    description: data.description,
    questionCount: data.question_count,
    timeLimitSeconds: data.time_limit_seconds,
    passingScorePercent: data.passing_score_percent,
    createdAt: data.created_at,
  };
}

function mapQuizQuestion(data: any): QuizQuestion {
  return {
    id: data.id,
    quizId: data.quiz_id,
    question: data.question,
    options: data.options,
    correctOptionIndex: data.correct_option_index,
    explanation: data.explanation,
    position: data.position,
    difficulty: data.difficulty,
    createdAt: data.created_at,
  };
}

function mapQuizAttempt(data: any): QuizAttempt {
  return {
    id: data.id,
    quizId: data.quiz_id,
    userId: data.user_id,
    startedAt: data.started_at,
    completedAt: data.completed_at,
    score: data.score,
    totalQuestions: data.total_questions,
    timeTakenSeconds: data.time_taken_seconds,
    passed: data.passed,
    attemptNumber: data.attempt_number,
  };
}

function mapQuizAnswer(data: any): QuizAnswer {
  return {
    id: data.id,
    quizAttemptId: data.quiz_attempt_id,
    quizQuestionId: data.quiz_question_id,
    selectedOptionIndex: data.selected_option_index,
    isCorrect: data.is_correct,
    timeTakenSeconds: data.time_taken_seconds,
    answeredAt: data.answered_at,
  };
}



