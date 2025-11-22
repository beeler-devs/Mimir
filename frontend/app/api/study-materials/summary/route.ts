import { NextRequest, NextResponse } from 'next/server';
import { saveSummary, getLatestSummary } from '@/lib/db/studyMaterials';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Generate and save summary from PDF text (streaming)
 * POST /api/study-materials/summary
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

    // Call backend to generate summary (streaming)
    const backendUrl =
      process.env.NEXT_PUBLIC_MANIM_WORKER_URL ||
      process.env.MANIM_WORKER_URL ||
      'http://localhost:8001';

    const response = await fetch(`${backendUrl}/study-tools/summary/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfText }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Failed to generate summary');
    }

    // Read the streaming response
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';

    if (!reader) {
      throw new Error('Response body is not readable');
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'chunk') {
              fullContent += data.content;
            } else if (data.type === 'done') {
              fullContent = data.content;
            } else if (data.type === 'error') {
              throw new Error(data.content);
            }
          } catch (e) {
            console.error('Error parsing SSE data:', e);
          }
        }
      }
    }

    // Save to database
    const savedSummary = await saveSummary(instanceId, fullContent, {
      generatedBy: 'claude',
      sourceType: 'pdf',
      contentLength: fullContent.length,
    });

    return NextResponse.json({
      success: true,
      summary: savedSummary,
    });
  } catch (error) {
    console.error('Error generating/saving summary:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate summary',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Get saved summary for an instance
 * GET /api/study-materials/summary?instanceId=xxx
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

    const summary = await getLatestSummary(instanceId);

    if (!summary) {
      return NextResponse.json(
        { error: 'No summary found for this instance' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error('Error fetching summary:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch summary',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}





