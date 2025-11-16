import { NextRequest, NextResponse } from 'next/server';

/**
 * API route to generate chat titles using AI
 * Proxies requests to the backend Manim worker
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'Messages array is required' },
        { status: 400 }
      );
    }

    // Get backend URL from environment
    const backendUrl = 
      process.env.NEXT_PUBLIC_MANIM_WORKER_URL || 
      process.env.MANIM_WORKER_URL || 
      'http://localhost:8001';

    // Call backend title generation endpoint
    const response = await fetch(`${backendUrl}/chat/generate-title`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Backend title generation failed:', errorText);
      return NextResponse.json(
        { error: 'Failed to generate title' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in generate-title API route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

