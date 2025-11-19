import { NextRequest, NextResponse } from 'next/server';
import { saveMindMap, getLatestMindMap } from '@/lib/db/mindmaps';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Generate and save mind map from PDF text (streaming)
 * POST /api/study-materials/mindmap
 */
export async function POST(request: NextRequest) {
  try {
    const { pdfText, instanceId, scope } = await request.json();

    if (!pdfText || !instanceId) {
      return NextResponse.json(
        { error: 'pdfText and instanceId are required' },
        { status: 400 }
      );
    }

    // Call backend to generate mind map (streaming)
    const backendUrl =
      process.env.NEXT_PUBLIC_MANIM_WORKER_URL ||
      process.env.MANIM_WORKER_URL ||
      'http://localhost:8001';

    const response = await fetch(`${backendUrl}/study-tools/mindmap/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfText, scope }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Failed to generate mind map');
    }

    // Read the streaming response
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let mindMapData: any = null;

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
            if (data.type === 'done') {
              mindMapData = data.content;
            } else if (data.type === 'error') {
              throw new Error(data.content);
            }
          } catch (e) {
            console.error('Error parsing SSE data:', e);
          }
        }
      }
    }

    if (!mindMapData) {
      throw new Error('No mind map data received from backend');
    }

    // Save to database
    const savedMindMap = await saveMindMap(
      instanceId,
      mindMapData.nodes,
      mindMapData.edges,
      mindMapData.title || 'Concept Map',
      mindMapData.description || null,
      'dagre',
      {
        generatedBy: 'claude',
        sourceType: 'pdf',
        scope: scope || 'full',
      }
    );

    return NextResponse.json({
      success: true,
      mindMap: savedMindMap,
    });
  } catch (error) {
    console.error('Error generating/saving mind map:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate mind map',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Get saved mind map for an instance
 * GET /api/study-materials/mindmap?instanceId=xxx
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

    const mindMap = await getLatestMindMap(instanceId);

    if (!mindMap) {
      return NextResponse.json(
        { error: 'No mind map found for this instance' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      mindMap,
    });
  } catch (error) {
    console.error('Error fetching mind map:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch mind map',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
