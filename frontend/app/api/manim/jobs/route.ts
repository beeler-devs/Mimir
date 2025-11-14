import { NextRequest, NextResponse } from 'next/server';

// Force localhost for now - TODO: use env var in production
const MANIM_WORKER_URL = 'http://localhost:8001';

/**
 * POST /api/manim/jobs
 * Create a new Manim animation job
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const response = await fetch(`${MANIM_WORKER_URL}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: `Manim worker error: ${error}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Error creating Manim job:', error);
    return NextResponse.json(
      { error: 'Failed to create animation job' },
      { status: 500 }
    );
  }
}


