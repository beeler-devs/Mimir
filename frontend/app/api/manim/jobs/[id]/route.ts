import { NextRequest, NextResponse } from 'next/server';

// Force localhost for now - TODO: use env var in production
const MANIM_WORKER_URL = 'http://localhost:8001';

/**
 * GET /api/manim/jobs/[id]
 * Get the status of a Manim animation job
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const jobId = params.id;
    
    const response = await fetch(`${MANIM_WORKER_URL}/jobs/${jobId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
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
    console.error('Error fetching Manim job status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch job status' },
      { status: 500 }
    );
  }
}


