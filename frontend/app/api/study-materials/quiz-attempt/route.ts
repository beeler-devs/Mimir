import { NextRequest, NextResponse } from 'next/server';
import {
  startQuizAttempt,
  submitQuizAnswer,
  completeQuizAttempt,
  getQuizStats,
} from '@/lib/db/studyMaterials';

export const runtime = 'nodejs';

/**
 * Start a quiz attempt
 * POST /api/study-materials/quiz-attempt
 */
export async function POST(request: NextRequest) {
  try {
    const { quizId, action, attemptId, questionId, selectedOptionIndex, timeTakenSeconds } =
      await request.json();

    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 });
    }

    if (action === 'start') {
      if (!quizId) {
        return NextResponse.json({ error: 'quizId is required' }, { status: 400 });
      }

      const attempt = await startQuizAttempt(quizId);
      return NextResponse.json({
        success: true,
        attempt,
      });
    } else if (action === 'answer') {
      if (!attemptId || !questionId || selectedOptionIndex === undefined) {
        return NextResponse.json(
          { error: 'attemptId, questionId, and selectedOptionIndex are required' },
          { status: 400 }
        );
      }

      const answer = await submitQuizAnswer(
        attemptId,
        questionId,
        selectedOptionIndex,
        timeTakenSeconds
      );
      return NextResponse.json({
        success: true,
        answer,
      });
    } else if (action === 'complete') {
      if (!attemptId) {
        return NextResponse.json({ error: 'attemptId is required' }, { status: 400 });
      }

      const completedAttempt = await completeQuizAttempt(attemptId);
      return NextResponse.json({
        success: true,
        attempt: completedAttempt,
      });
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error with quiz attempt:', error);
    return NextResponse.json(
      {
        error: 'Failed to process quiz attempt',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Get quiz statistics
 * GET /api/study-materials/quiz-attempt?quizId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const quizId = searchParams.get('quizId');

    if (!quizId) {
      return NextResponse.json({ error: 'quizId is required' }, { status: 400 });
    }

    const stats = await getQuizStats(quizId);

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Error fetching quiz stats:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch quiz stats',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}



