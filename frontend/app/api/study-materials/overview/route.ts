import { NextRequest, NextResponse } from 'next/server';
import { getStudyMaterialsOverview } from '@/lib/db/studyMaterials';

export const runtime = 'nodejs';

/**
 * Get all study materials for an instance (summaries, quizzes, flashcards)
 * GET /api/study-materials/overview?instanceId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get('instanceId');

    if (!instanceId) {
      return NextResponse.json(
        { error: 'instanceId is required' },
        { status: 400 }
      );
    }

    const overview = await getStudyMaterialsOverview(instanceId);

    return NextResponse.json({
      success: true,
      overview,
    });
  } catch (error) {
    console.error('Error fetching study materials overview:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch study materials overview',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

