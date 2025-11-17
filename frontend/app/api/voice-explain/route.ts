/**
 * @deprecated This endpoint is deprecated.
 * Use /api/ai-coach-conversational instead for live coaching with conversation context.
 *
 * This was the original "playback" system with pre-planned segments.
 * The new system supports real-time conversation, interrupts, and context awareness.
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

// DEPRECATED: This endpoint is no longer maintained
// Redirect to new endpoint

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY || '',
});

interface ExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
}

interface VoiceExplainRequest {
  screenshot: string; // Base64 PNG
  elements: ExcalidrawElement[];
  userQuestion?: string;
  focusArea?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface VoiceExplanationSegment {
  id: string;
  text: string;
  position: {
    x: number;
    y: number;
    elementId?: string;
    offset?: { x: number; y: number };
  };
  duration: number;
  pointerStyle?: 'point' | 'circle' | 'highlight' | 'ripple';
  emphasis?: number;
}

interface VoiceExplanationResponse {
  segments: VoiceExplanationSegment[];
  totalDuration: number;
}

export async function POST(request: NextRequest) {
  // Return 410 Gone to indicate this endpoint is deprecated
  return NextResponse.json(
    {
      error: 'This endpoint is deprecated',
      message: 'Please use /api/ai-coach-conversational for live AI coaching with conversation support',
      migration: {
        newEndpoint: '/api/ai-coach-conversational',
        documentation: 'See VOICE_CONVERSATION_SYSTEM.md for details',
      },
    },
    { status: 410 } // 410 Gone = permanently removed
  );

  // Old implementation kept for reference (disabled)
  /* try {
    const body: VoiceExplainRequest = await request.json();
    const { screenshot, elements, userQuestion, focusArea } = body;

    if (!screenshot) {
      return NextResponse.json(
        { error: 'Screenshot is required' },
        { status: 400 }
      );
    }

    // Prepare element metadata for the prompt
    const elementDescriptions = elements.map((el, idx) =>
      `Element ${idx + 1} (ID: ${el.id}): ${el.type} at (${Math.round(el.x)}, ${Math.round(el.y)}), size ${Math.round(el.width)}x${Math.round(el.height)}${el.text ? `, text: "${el.text}"` : ''}`
    ).join('\n');

    // Construct the prompt for Claude
    const prompt = `You are an AI tutor creating a synchronized voice explanation with visual pointer guidance.

**Task**: Analyze this Excalidraw canvas and create a step-by-step explanation that will be narrated with a laser pointer showing where to look.

**Canvas Elements**:
${elementDescriptions}

${userQuestion ? `**Student's Question**: ${userQuestion}` : ''}

${focusArea ? `**Focus Area**: x=${focusArea.x}, y=${focusArea.y}, width=${focusArea.width}, height=${focusArea.height}` : ''}

**Instructions**:
1. Analyze the visual content and mathematical/conceptual relationships
2. Break down your explanation into 4-8 digestible segments
3. For each segment:
   - Write clear, concise narration text (1-3 sentences)
   - Specify exact (x, y) coordinates where the laser pointer should point
   - Choose an appropriate pointer style (point/circle/highlight/ripple)
   - Estimate duration in milliseconds (typically 3000-8000ms per segment)

**Coordinate System**:
- Origin (0, 0) is top-left
- Positive X goes right, positive Y goes down
- Use element positions as reference points

**Response Format** (JSON only, no markdown):
{
  "segments": [
    {
      "id": "seg-1",
      "text": "Let's start by examining this function definition...",
      "position": {
        "x": 150,
        "y": 200,
        "elementId": "element-abc123",
        "offset": {"x": 0, "y": 0}
      },
      "duration": 5000,
      "pointerStyle": "circle",
      "emphasis": 0.8
    }
  ]
}

**Pointer Style Guidelines**:
- "point": For specific locations, small details
- "circle": For highlighting an entire object or region
- "highlight": For broad areas or background emphasis
- "ripple": For drawing attention to key moments or "aha" points

Now analyze the canvas and create the explanation:`;

    // Call Claude API with vision
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: screenshot.replace(/^data:image\/png;base64,/, ''),
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    });

    // Extract the response
    const responseText = message.content[0].type === 'text'
      ? message.content[0].text
      : '';

    // Parse JSON response (remove markdown code blocks if present)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from Claude response');
    }

    const explanationData: VoiceExplanationResponse = JSON.parse(jsonMatch[0]);

    // Calculate total duration
    const totalDuration = explanationData.segments.reduce(
      (sum, seg) => sum + seg.duration,
      0
    );

    return NextResponse.json({
      segments: explanationData.segments,
      totalDuration,
    });

  } catch (error) {
    console.error('Error in voice-explain API:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate voice explanation',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
  */
}
