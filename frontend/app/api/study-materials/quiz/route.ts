import { NextRequest, NextResponse } from 'next/server';
import { saveQuiz, getLatestQuiz } from '@/lib/db/studyMaterials';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Generate and save quiz from PDF text
 * POST /api/study-materials/quiz
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

    // Call backend to generate quiz
    const backendUrl =
      process.env.NEXT_PUBLIC_MANIM_WORKER_URL ||
      process.env.MANIM_WORKER_URL ||
      'http://localhost:8001';

    const response = await fetch(`${backendUrl}/study-tools/quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfText }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Failed to generate quiz');
    }

    const data = await response.json();
    const questions = data.questions || [];

    // Map to our format
    const mappedQuestions = questions.map((q: any) => ({
      question: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation || undefined,
      difficulty: q.difficulty || undefined,
    }));

    // Save to database
    const savedQuiz = await saveQuiz(
      instanceId,
      mappedQuestions,
      'Generated Quiz',
      'AI-generated quiz from document content',
      {
        generatedBy: 'claude',
        sourceType: 'pdf',
        questionCount: mappedQuestions.length,
      }
    );

    return NextResponse.json({
      success: true,
      quiz: savedQuiz,
    });
  } catch (error) {
    console.error('Error generating/saving quiz:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate quiz',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Get saved quiz for an instance
 * GET /api/study-materials/quiz?instanceId=xxx
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

    const quiz = await getLatestQuiz(instanceId);

    if (!quiz) {
      return NextResponse.json(
        { error: 'No quiz found for this instance' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      quiz,
    });
  } catch (error) {
    console.error('Error fetching quiz:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch quiz',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

