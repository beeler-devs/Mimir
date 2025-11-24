import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { AI_COACH_CONFIG } from '@/lib/aiCoachConfig';
import { safeParseIntervention } from '@/lib/interventionValidator';

if (!process.env.CLAUDE_API_KEY) {
  console.error('⚠️ CLAUDE_API_KEY is not set');
}

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY || '',
});

interface ConversationTurn {
  speaker: 'user' | 'ai';
  text: string;
  timestamp: number;
  isInterruption?: boolean;
}

interface ConversationalCoachRequest {
  screenshot: string;
  elements: any[];
  conversationContext: {
    recentHistory: ConversationTurn[];
    currentAIUtterance: string | null;
    wasInterrupted: boolean;
    canvasContext: {
      lastSnapshot?: string;
      currentTopic?: string;
      detectedConcepts: string[];
    };
    trigger: 'idle' | 'help_request' | 'interrupt';
    userSpeech?: string;
    coachingMode?: string; // 'observe' | 'hints' | 'full'
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
    text: string;
    position: { x: number; y: number };
    type: 'hint' | 'explanation' | 'correction';
  };
}

export async function POST(request: NextRequest) {
  try {
    // Check API key
    if (!process.env.CLAUDE_API_KEY) {
      return NextResponse.json(
        { error: 'Claude API key not configured' },
        { status: 500 }
      );
    }

    const body: ConversationalCoachRequest = await request.json();
    const { screenshot, elements, conversationContext } = body;

    // Input validation
    if (!screenshot) {
      return NextResponse.json({ error: 'Screenshot is required' }, { status: 400 });
    }

    if (!elements || !Array.isArray(elements)) {
      return NextResponse.json({ error: 'Elements array is required' }, { status: 400 });
    }

    if (!conversationContext || !conversationContext.trigger) {
      return NextResponse.json({ error: 'Conversation context is required' }, { status: 400 });
    }

    // Build conversation history for context
    const conversationHistory = conversationContext.recentHistory
      .map((turn) => {
        const speaker = turn.speaker === 'user' ? 'Student' : 'AI Coach';
        const marker = turn.isInterruption ? ' [INTERRUPTED AI]' : '';
        return `${speaker}: ${turn.text}${marker}`;
      })
      .join('\n');

    // Build element descriptions
    const elementDescriptions = elements
      .map(
        (el, idx) =>
          `${idx + 1}. ${el.type} at (${Math.round(el.x)}, ${Math.round(el.y)})${
            el.text ? ` - text: "${el.text}"` : ''
          }`
      )
      .join('\n');

    // Get coaching mode behavior
    const coachingMode = conversationContext.coachingMode || 'full';
    let modeBehavior = '';

    if (coachingMode === 'observe') {
      modeBehavior = `**COACHING MODE: Observe Only**
- Only respond when the student explicitly asks for help
- Keep responses brief and minimal
- DO NOT provide proactive guidance
- Point to resources rather than explaining directly`;
    } else if (coachingMode === 'hints') {
      modeBehavior = `**COACHING MODE: Hints Only**
- Provide hints and guiding questions, NOT full solutions
- Ask Socratic questions to lead student to discovery
- Use laser pointer to draw attention, but let them figure it out
- Avoid giving away answers directly`;
    } else {
      // 'full' mode
      modeBehavior = `**COACHING MODE: Full Tutor**
- Provide complete explanations and step-by-step guidance
- Use all tools (voice, laser, annotations) to help student learn
- Be proactive in offering assistance
- Explain concepts thoroughly when asked`;
    }

    // Build context-aware prompt based on trigger type
    let situationDescription = '';
    let behaviorGuidelines = '';

    if (conversationContext.trigger === 'interrupt') {
      situationDescription = `**INTERRUPTION SCENARIO**

The student just interrupted you while you were speaking.

What you were saying: "${conversationContext.currentAIUtterance}"

Student just said: "${conversationContext.userSpeech}"

**Your task**: Decide how to respond:
- If the student's question is related to what you were explaining, acknowledge and continue or adjust
- If it's a new topic, smoothly pivot to address their concern
- If they're affirming understanding, acknowledge and wrap up
- Be natural and conversational - this is a live dialogue`;

      behaviorGuidelines = `**Interrupt Response Guidelines**:
1. Acknowledge the interruption naturally ("Oh, good question..." or "Let me address that...")
2. Decide: CONTINUE with original topic or PIVOT to new topic
3. If continuing, reference what you were saying: "As I was explaining..."
4. If pivoting, make it smooth: "That's actually related to..." or "Let's focus on that first..."
5. Keep it brief - the student interrupted for a reason
${coachingMode === 'hints' ? '6. Remember: hints only, not full solutions' : ''}`;
    } else if (conversationContext.trigger === 'help_request') {
      situationDescription = `**HELP REQUEST**

The student explicitly asked for help via voice.

Student said: "${conversationContext.userSpeech}"

**Your task**: Provide targeted assistance for what they asked about.`;

      behaviorGuidelines = `**Help Response Guidelines**:
1. Address their specific question directly
2. Be clear and concise
3. Use voice + laser + annotation as needed
${coachingMode === 'hints'
  ? '4. Provide hints and guiding questions, NOT full solutions\n5. Ask Socratic questions to lead them to discovery'
  : '4. Provide explanations appropriate to their question'}`;
    } else {
      // idle trigger
      situationDescription = `**PROACTIVE GUIDANCE**

The student has been idle for 15+ seconds. They may be stuck or thinking.

**Your task**: Offer gentle, encouraging guidance.`;

      behaviorGuidelines = `**Proactive Guidance Guidelines**:
1. Be encouraging and supportive
2. Ask guiding questions or offer hints
3. Don't be intrusive - keep it brief
4. Use voice for encouragement, laser to point to next steps
${coachingMode === 'hints' ? '5. Remember: guide with questions, not direct answers' : ''}`;
    }

    // Construct full prompt
    const prompt = `You are a live AI tutor having a **real-time voice conversation** with a student working on a math problem in Excalidraw.

${modeBehavior}

${situationDescription}

**Recent Conversation**:
${conversationHistory || '(No previous conversation)'}

**Canvas Elements**:
${elementDescriptions}

**Current Topic**: ${conversationContext.canvasContext.currentTopic || 'Unknown'}
**Detected Concepts**: ${conversationContext.canvasContext.detectedConcepts.join(', ') || 'None'}

${behaviorGuidelines}

**Response Format (JSON only)**:
{
  "type": "voice" | "annotation" | "both",
  "voiceText": "What you'll say out loud (natural, conversational)",
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

**Examples**:

1. Interrupt - Student asks "What's the power rule again?" while you're explaining derivatives:
{
  "type": "both",
  "voiceText": "Good question! The power rule says: bring down the exponent as a coefficient, then subtract one from the exponent.",
  "laserPosition": {"x": 180, "y": 120, "style": "circle"},
  "annotation": {
    "text": "$$\\frac{d}{dx}x^n = nx^{n-1}$$",
    "position": {"x": 200, "y": 250},
    "type": "hint"
  }
}

2. Help request - Student says "I'm stuck on this integral":
{
  "type": "both",
  "voiceText": "Let's look at this together. Do you see a substitution that might work here?",
  "laserPosition": {"x": 220, "y": 180, "style": "highlight"}
}

3. Idle - Student paused while working on trig:
{
  "type": "voice",
  "voiceText": "I see you're working with sine and cosine. Would it help to visualize this on the unit circle?"
}

Now analyze the situation and provide your intervention:`;

    // Call Claude API
    const message = await anthropic.messages.create({
      model: AI_COACH_CONFIG.api.claudeModel,
      max_tokens: AI_COACH_CONFIG.api.claudeMaxTokens,
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
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    if (!responseText) {
      throw new Error('No text response from Claude');
    }

    // Parse and validate JSON response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Failed to extract JSON from response:', responseText);
      throw new Error('Failed to extract JSON from Claude response');
    }

    let rawIntervention: unknown;
    try {
      rawIntervention = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.error('Attempted to parse:', jsonMatch[0]);
      throw new Error('Invalid JSON in Claude response');
    }

    // Validate intervention with runtime checks
    const intervention = safeParseIntervention(rawIntervention, {
      allowFallback: true, // Use fallback if validation fails
      onWarning: (warning) => console.warn('⚠️ Intervention warning:', warning),
      onError: (error) => console.error('❌ Intervention error:', error),
    });

    console.log('🤖 AI Intervention:', {
      trigger: conversationContext.trigger,
      wasInterrupted: conversationContext.wasInterrupted,
      response: intervention.voiceText,
    });

    return NextResponse.json(intervention);
  } catch (error) {
    console.error('Error in conversational AI coach:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate AI coaching response',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
