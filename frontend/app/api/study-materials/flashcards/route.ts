import { NextRequest, NextResponse } from 'next/server';
import { saveFlashcardSet, getLatestFlashcardSet } from '@/lib/db/studyMaterials';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Generate and save flashcards from PDF text
 * POST /api/study-materials/flashcards
 */
export async function POST(request: NextRequest) {
  try {
    const { pdfText, instanceId } = await request.json();

    if (!pdfText || !instanceId) {
      return NextResponse.json(
        { error: 'pdfText and instanceId are required' },
        { status: 400 }
      );
    }

    // Call backend to generate flashcards
    const backendUrl =
      process.env.NEXT_PUBLIC_MANIM_WORKER_URL ||
      process.env.MANIM_WORKER_URL ||
      'http://localhost:8001';

    const response = await fetch(`${backendUrl}/study-tools/flashcards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfText }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Failed to generate flashcards');
    }

    const data = await response.json();
    const flashcards = data.flashcards || [];

    // Save to database
    const savedFlashcardSet = await saveFlashcardSet(
      instanceId,
      flashcards,
      'Generated Flashcards',
      'AI-generated flashcards from document content',
      {
        generatedBy: 'claude',
        sourceType: 'pdf',
        cardCount: flashcards.length,
      }
    );

    return NextResponse.json({
      success: true,
      flashcardSet: savedFlashcardSet,
    });
  } catch (error) {
    console.error('Error generating/saving flashcards:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate flashcards',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Get saved flashcards for an instance
 * GET /api/study-materials/flashcards?instanceId=xxx
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

    const flashcardSet = await getLatestFlashcardSet(instanceId);

    if (!flashcardSet) {
      return NextResponse.json(
        { error: 'No flashcard set found for this instance' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      flashcardSet,
    });
  } catch (error) {
    console.error('Error fetching flashcards:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch flashcards',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}





