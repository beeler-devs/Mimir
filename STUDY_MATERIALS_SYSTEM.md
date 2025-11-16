# Study Materials System Documentation

This document describes the comprehensive study materials database system for storing and managing quizzes, flashcards, and summaries with versioning and analytics support.

## Overview

The study materials system provides:
- **Versioned Storage**: All generated content is versioned, allowing users to regenerate and maintain history
- **Instance-Agnostic**: Works with any instance type (PDF, text, code, annotate)
- **Spaced Repetition**: Full SM-2 algorithm support for flashcard learning
- **Quiz Analytics**: Detailed tracking of quiz attempts, scores, and weak areas
- **Content Hash Detection**: Prevents duplicate generation for unchanged content

## Database Schema

The system uses 9 PostgreSQL tables:

### Core Tables

1. **study_materials** - Parent table linking all study content to instances
2. **summaries** - AI-generated summaries with word counts
3. **flashcard_sets** - Collections of flashcards
4. **flashcards** - Individual flashcard items
5. **flashcard_reviews** - Spaced repetition tracking (SM-2 algorithm)
6. **quizzes** - Quiz metadata and settings
7. **quiz_questions** - Individual quiz questions
8. **quiz_attempts** - User quiz attempt tracking
9. **quiz_answers** - Individual question answers

See `supabase/migrations/004_study_materials_system.sql` for the complete schema.

## Installation

### 1. Apply the Database Migration

The migration file is located at `supabase/migrations/004_study_materials_system.sql`.

**Option A: Using Supabase CLI (Recommended)**

```bash
# From the project root
supabase db push
```

**Option B: Manual Application**

1. Navigate to your Supabase project dashboard
2. Go to the SQL Editor
3. Copy and paste the contents of `004_study_materials_system.sql`
4. Execute the query

**Option C: Using the Migration Script**

```bash
# From the project root
node apply-migration-simple.mjs
```

### 2. Verify Installation

After applying the migration, verify the tables were created:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE '%study%' 
OR table_name LIKE '%flashcard%' 
OR table_name LIKE '%quiz%' 
OR table_name LIKE '%summar%';
```

You should see all 9 tables listed.

## API Usage

### Generating and Saving Study Materials

#### Flashcards

```typescript
// Generate and save flashcards
const response = await fetch('/api/study-materials/flashcards', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    pdfText: 'Your document content...',
    instanceId: 'uuid-of-instance',
  }),
});

const { flashcardSet } = await response.json();
```

#### Quiz

```typescript
// Generate and save quiz
const response = await fetch('/api/study-materials/quiz', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    pdfText: 'Your document content...',
    instanceId: 'uuid-of-instance',
  }),
});

const { quiz } = await response.json();
```

#### Summary

```typescript
// Generate and save summary
const response = await fetch('/api/study-materials/summary', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    pdfText: 'Your document content...',
    instanceId: 'uuid-of-instance',
  }),
});

const { summary } = await response.json();
```

### Retrieving Study Materials

```typescript
// Get latest flashcard set
const flashcards = await fetch(
  `/api/study-materials/flashcards?instanceId=${instanceId}`
);

// Get latest quiz
const quiz = await fetch(`/api/study-materials/quiz?instanceId=${instanceId}`);

// Get latest summary
const summary = await fetch(
  `/api/study-materials/summary?instanceId=${instanceId}`
);

// Get all study materials for an instance
const overview = await fetch(
  `/api/study-materials/overview?instanceId=${instanceId}`
);
```

### Quiz Attempts

```typescript
// Start a quiz attempt
const startResponse = await fetch('/api/study-materials/quiz-attempt', {
  method: 'POST',
  body: JSON.stringify({
    action: 'start',
    quizId: 'quiz-uuid',
  }),
});

const { attempt } = await startResponse.json();

// Submit an answer
await fetch('/api/study-materials/quiz-attempt', {
  method: 'POST',
  body: JSON.stringify({
    action: 'answer',
    attemptId: attempt.id,
    questionId: 'question-uuid',
    selectedOptionIndex: 2,
    timeTakenSeconds: 15,
  }),
});

// Complete the quiz
const completeResponse = await fetch('/api/study-materials/quiz-attempt', {
  method: 'POST',
  body: JSON.stringify({
    action: 'complete',
    attemptId: attempt.id,
  }),
});

const { attempt: completedAttempt } = await completeResponse.json();
console.log(`Score: ${completedAttempt.score}/${completedAttempt.totalQuestions}`);
```

### Flashcard Reviews (Spaced Repetition)

```typescript
// Record a flashcard review
// qualityRating: 0-5 (0=complete blackout, 5=perfect recall)
const response = await fetch('/api/study-materials/flashcard-review', {
  method: 'POST',
  body: JSON.stringify({
    flashcardId: 'flashcard-uuid',
    qualityRating: 4, // Good recall
  }),
});

const { review } = await response.json();
console.log(`Next review: ${review.nextReviewDate}`);
console.log(`Interval: ${review.intervalDays} days`);

// Get flashcard statistics
const statsResponse = await fetch(
  `/api/study-materials/flashcard-review?flashcardSetId=${flashcardSetId}`
);

const { stats } = await statsResponse.json();
console.log(`Mastered: ${stats.masteredCards}/${stats.totalCards}`);
console.log(`Due for review: ${stats.dueForReview}`);
```

## Direct Database Access

For advanced use cases, import the database functions directly:

```typescript
import {
  saveFlashcardSet,
  getLatestFlashcardSet,
  recordFlashcardReview,
  saveQuiz,
  startQuizAttempt,
  submitQuizAnswer,
  completeQuizAttempt,
  saveSummary,
  getStudyMaterialsOverview,
  getFlashcardStats,
  getQuizStats,
} from '@/lib/db/studyMaterials';

// Example: Save flashcards
const flashcardSet = await saveFlashcardSet(
  instanceId,
  [
    { front: 'What is React?', back: 'A JavaScript library for building UIs' },
    { front: 'What is JSX?', back: 'A syntax extension for JavaScript' },
  ],
  'React Basics',
  'Flashcards about React fundamentals'
);

// Example: Get quiz statistics
const stats = await getQuizStats(quizId);
console.log(`Average score: ${stats.averageScore}%`);
console.log(`Pass rate: ${stats.passRate}%`);
console.log('Weak questions:', stats.weakQuestions);
```

## Spaced Repetition Algorithm (SM-2)

The system implements the SM-2 spaced repetition algorithm for flashcards:

- **Quality Rating**: 0-5 scale
  - 0: Complete blackout
  - 1: Incorrect but recognized
  - 2: Incorrect but easy to recall
  - 3: Correct with serious difficulty
  - 4: Correct after hesitation
  - 5: Perfect recall

- **Ease Factor**: Adjusts based on performance (minimum 1.3)
- **Interval**: Days until next review (increases with successful recalls)
- **Repetitions**: Number of successful consecutive recalls

## Versioning

All study materials support versioning:

- When regenerating content, a new version is created
- Old versions are preserved (soft deletion via `is_archived`)
- Content hashes detect when regeneration is unnecessary
- Users can view historical versions

```typescript
import { getStudyMaterialVersions } from '@/lib/db/studyMaterials';

// Get all versions of flashcard sets
const versions = await getStudyMaterialVersions(instanceId, 'flashcard_set');
console.log(`Total versions: ${versions.length}`);
```

## Analytics

### Flashcard Statistics

- Total cards in set
- Number of reviewed cards
- Cards due for review today
- Average ease factor
- Mastered cards (ease factor > 2.5)

### Quiz Statistics

- Total attempts
- Average score percentage
- Best score
- Pass rate
- Average time taken
- Weak questions (>50% incorrect rate)

## Performance Considerations

The schema is optimized for common queries:

- **Indexes**: All foreign keys and common query patterns are indexed
- **Denormalization**: Counter fields (`card_count`, `question_count`) avoid counting queries
- **RLS Policies**: Ensure users only access their own data
- **Triggers**: Automatically maintain counts and calculate values

## Security

All tables have Row Level Security (RLS) policies:

- Users can only view/modify their own study materials
- Study material access cascades through relationships
- Policies are enforced at the database level

## Future Enhancements

Potential improvements:

1. **Collaboration**: Share study materials between users
2. **Export**: Export flashcards to Anki, Quizlet formats
3. **Scheduling**: Send notifications for due reviews
4. **Advanced Analytics**: Learning curves, time-to-mastery predictions
5. **Adaptive Difficulty**: Adjust question difficulty based on performance
6. **Multimedia**: Support images and audio in flashcards

## Troubleshooting

### Migration fails

- Ensure all previous migrations (001-003) are applied
- Check for existing tables with conflicting names
- Verify RLS is enabled on your Supabase project

### RLS policies blocking access

- Ensure user is authenticated (`supabase.auth.getUser()`)
- Check that `user_id` matches the authenticated user
- Verify policies are created correctly

### Performance issues

- Check if indexes are created (use `EXPLAIN ANALYZE`)
- Consider pagination for large result sets
- Use specific queries instead of fetching all data

## Support

For issues or questions:
1. Check the migration file for table structure
2. Review TypeScript types in `frontend/lib/types.ts`
3. Examine helper functions in `frontend/lib/db/studyMaterials.ts`
4. Test API endpoints using the examples above

