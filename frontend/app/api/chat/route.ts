import { NextRequest, NextResponse } from 'next/server';
import { ChatRequest, ChatResponse } from '@/lib/types';
import { getLearningModeConfig } from '@/lib/learningMode';

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
    const { messages, branchPath, learningMode = 'guided' } = body;
    
    // Get the learning mode configuration
    const modeConfig = getLearningModeConfig(learningMode);
    const systemPrompt = modeConfig.systemPrompt;

    // Stub response - just echo back with a friendly message
    const lastUserMessage = messages[messages.length - 1];
    const userContent = lastUserMessage.content.toLowerCase();
    
    // Check if user is asking for a visualization/animation
    const animationKeywords = [
      "visualize",
      "animate",
      "show me",
      "draw",
      "illustrate",
      "brownian",
      "random walk",
      "plot",
      "graph",
      "demonstrate"
    ];
    
    const shouldSuggestAnimation = animationKeywords.some(keyword => 
      userContent.includes(keyword)
    );
    
    // Determine animation topic and description
    let suggestedAnimation = undefined;
    if (shouldSuggestAnimation) {
      let description = lastUserMessage.content;
      let topic = "math"; // default
      
      if (userContent.includes("brownian")) {
        description = "Visualize Brownian motion";
        topic = "math";
      } else if (userContent.includes("random walk")) {
        description = "Visualize random walk";
        topic = "math";
      } else if (userContent.includes("matrix") || userContent.includes("transform")) {
        description = "Visualize matrix transformation";
        topic = "math";
      }
      
      suggestedAnimation = {
        description,
        topic
      };
    }
    
    // Simulate AI processing delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Generate response based on learning mode
    let responseContent = `I received your message: "${lastUserMessage.content}"\n\n`;
    
    // Add mode-specific response flavor
    switch (learningMode) {
      case 'socratic':
        responseContent += `🤔 Let me guide you with some questions:\n\n- What do you already know about this topic?\n- What are you trying to achieve?\n- Have you considered approaching it from a different angle?\n\n`;
        break;
      case 'direct':
        responseContent += `Here's the answer: [Direct solution would go here]\n\n`;
        break;
      case 'guided':
        responseContent += `Let me break this down step by step:\n\n1. First, let's understand the fundamentals...\n2. Next, we'll build on that...\n3. Finally, we'll apply it to your question...\n\n`;
        break;
      case 'exploratory':
        responseContent += `💡 Here are some hints to explore:\n\n- Try experimenting with...\n- Consider looking into...\n- What happens if you...\n\n`;
        break;
      case 'conceptual':
        responseContent += `Let's dive deep into the theory:\n\nThe fundamental principle here is... [Rigorous explanation would follow]\n\n`;
        break;
    }
    
    responseContent += `**Mode**: ${modeConfig.name}\n**System Prompt**: "${systemPrompt.substring(0, 100)}..."\n\nThis is a stub response. In production, this will connect to Claude API with the system prompt to provide actual AI tutoring.\n\nBranch path depth: ${branchPath.length}`;

    const response: ChatResponse = {
      message: {
        role: 'assistant',
        content: responseContent,
      },
      suggestedAnimation,
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

