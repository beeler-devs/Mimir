import { NextRequest, NextResponse } from 'next/server';
import { recordFlashcardReview, getFlashcardStats } from '@/lib/db/studyMaterials';

export const runtime = 'nodejs';

/**
 * Record a flashcard review (spaced repetition)
 * POST /api/study-materials/flashcard-review
 */
export async function POST(request: NextRequest) {
  try {
    const { flashcardId, qualityRating } = await request.json();

    if (!flashcardId || qualityRating === undefined) {
      return NextResponse.json(
        { error: 'flashcardId and qualityRating are required' },
        { status: 400 }
      );
    }

    if (qualityRating < 0 || qualityRating > 5) {
      return NextResponse.json(
        { error: 'qualityRating must be between 0 and 5' },
        { status: 400 }
      );
    }

    const review = await recordFlashcardReview(flashcardId, qualityRating);

    return NextResponse.json({
      success: true,
      review,
    });
  } catch (error) {
    console.error('Error recording flashcard review:', error);
    return NextResponse.json(
      {
        error: 'Failed to record flashcard review',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Get flashcard statistics
 * GET /api/study-materials/flashcard-review?flashcardSetId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const flashcardSetId = searchParams.get('flashcardSetId');

    if (!flashcardSetId) {
      return NextResponse.json(
        { error: 'flashcardSetId is required' },
        { status: 400 }
      );
    }

    const stats = await getFlashcardStats(flashcardSetId);

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Error fetching flashcard stats:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch flashcard stats',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}



