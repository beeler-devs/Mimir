import { NextRequest, NextResponse } from 'next/server';
import { ChatRequest, ChatResponse } from '@/lib/types';

/**
 * Chat API endpoint (stub)
 * TODO: Migrate this logic to Supabase Edge Function in future
 * 
 * This endpoint receives messages and returns AI responses
 * Currently echoes back a simple response for testing
 */
export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const { messages, branchPath } = body;

    // Stub response - just echo back with a friendly message
    const lastUserMessage = messages[messages.length - 1];
    
    // Simulate AI processing delay
    await new Promise(resolve => setTimeout(resolve, 500));

    const response: ChatResponse = {
      message: {
        role: 'assistant',
        content: `I received your message: "${lastUserMessage.content}"\n\nThis is a stub response. In the future, this will connect to Claude API (claude-haiku-4-5-20251001) to provide actual AI tutoring.\n\nBranch path depth: ${branchPath.length}`,
      },
      nodeId: `node-${Date.now()}`,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to process chat request' },
      { status: 500 }
    );
  }
}

