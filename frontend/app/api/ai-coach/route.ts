/**
 * @deprecated This endpoint is deprecated.
 * Use /api/ai-coach-conversational instead for live coaching with conversation context.
 *
 * This was the original AI coach without conversation history or interrupt handling.
 * The new system supports real-time conversation, interrupts, and context-aware responses.
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

// DEPRECATED: This endpoint is no longer maintained

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

interface AICoachRequest {
  screenshot: string;
  elements: ExcalidrawElement[];
  context: {
    isUserIdle: boolean;
    userAskedForHelp: boolean;
    previousTopic: string | null;
    detectedConcepts: string[];
  };
}

interface AIIntervention {
  type: 'voice' | 'annotation' | 'both';
  voiceText?: string;
  laserPosition?: {
    x: number;
    y: number;
    style?: 'point' | 'circle' | 'highlight' | 'ripple';
  };
  annotation?: {
    text: string; // LaTeX wrapped in $$...$$
    position: { x: number; y: number };
    type: 'hint' | 'explanation' | 'correction';
  };
}

export async function POST(request: NextRequest) {
  // Return 410 Gone to indicate this endpoint is deprecated
  return NextResponse.json(
    {
      error: 'This endpoint is deprecated',
      message: 'Please use /api/ai-coach-conversational for live AI coaching with full conversation support',
      migration: {
        newEndpoint: '/api/ai-coach-conversational',
        documentation: 'See VOICE_CONVERSATION_SYSTEM.md for details',
        changes: [
          'Supports conversation history and context',
          'Handles user interrupts intelligently',
          'Tracks AI utterance state for smooth re-evaluation',
          'Better prompt engineering for tutoring scenarios',
        ],
      },
    },
    { status: 410 } // 410 Gone = permanently removed
  );

  // Old implementation kept for reference (disabled)
  /* try {
    const body: AICoachRequest = await request.json();
    const { screenshot, elements, context } = body;

    if (!screenshot) {
      return NextResponse.json(
        { error: 'Screenshot is required' },
        { status: 400 }
      );
    }

    // Prepare element metadata
    const elementDescriptions = elements
      .map(
        (el, idx) =>
          `${idx + 1}. ${el.type} at (${Math.round(el.x)}, ${Math.round(el.y)})${
            el.text ? ` - text: "${el.text}"` : ''
          }`
      )
      .join('\n');

    // Construct coaching prompt
    const prompt = `You are a live AI tutor monitoring a student's Excalidraw canvas in real-time. You provide proactive, helpful coaching.

**Current Situation:**
- User idle: ${context.isUserIdle ? 'Yes (15+ seconds)' : 'No'}
- User asked for help: ${context.userAskedForHelp ? 'Yes' : 'No'}
- Previous topic: ${context.previousTopic || 'None'}
- Detected concepts: ${context.detectedConcepts.join(', ') || 'None'}

**Canvas Elements:**
${elementDescriptions}

**Your Role:**
You are a helpful AI coach. Based on what you see:
1. Identify what the student is working on
2. Determine if they need help
3. Provide ONE brief intervention

**Intervention Types:**
- **Voice only**: Short encouraging comment or hint
- **Voice + Laser**: Point to specific area while speaking
- **Voice + Annotation**: Speak and write LaTeX/markdown on canvas
- **All three**: Speak, point, and annotate

**Guidelines:**
- Be brief and encouraging (1-2 sentences for voice)
- Use LaTeX for math formulas: wrap in $$...$$ for inline or $$$...$$$ for block
- Point to specific coordinates that need attention
- If user asked for help, be more direct
- If user is idle, offer gentle guidance or encouragement
- Don't over-explain - give hints, not full solutions

**Response Format (JSON only):**
{
  "type": "voice" | "annotation" | "both",
  "voiceText": "What you'll say out loud",
  "laserPosition": {
    "x": 150,
    "y": 200,
    "style": "point" | "circle" | "highlight" | "ripple"
  },
  "annotation": {
    "text": "Can include $$LaTeX$$ formulas",
    "position": {"x": 100, "y": 150},
    "type": "hint" | "explanation" | "correction"
  }
}

**Examples:**

1. User stuck on derivative:
{
  "type": "both",
  "voiceText": "Remember the power rule: bring down the exponent and subtract one.",
  "laserPosition": {"x": 180, "y": 120, "style": "circle"},
  "annotation": {
    "text": "Power rule: $$\\frac{d}{dx}x^n = nx^{n-1}$$",
    "position": {"x": 200, "y": 250},
    "type": "hint"
  }
}

2. User idle, exploring trigonometry:
{
  "type": "voice",
  "voiceText": "I see you're working with sine and cosine. Would you like to explore the unit circle connection?"
}

3. User asked for help with integration:
{
  "type": "both",
  "voiceText": "Let me show you a helpful substitution here.",
  "laserPosition": {"x": 220, "y": 180, "style": "highlight"},
  "annotation": {
    "text": "Try: $$u = x^2 + 1$$",
    "position": {"x": 240, "y": 320},
    "type": "hint"
  }
}

Now analyze the canvas and provide your intervention:`;

    // Call Claude API
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
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

    // Extract response
    const responseText =
      message.content[0].type === 'text' ? message.content[0].text : '';

    // Parse JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from Claude response');
    }

    const intervention: AIIntervention = JSON.parse(jsonMatch[0]);

    return NextResponse.json(intervention);
  } catch (error) {
    console.error('Error in AI coach API:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate AI coaching response',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
  */
}
