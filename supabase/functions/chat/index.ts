// Supabase Edge Function: Chat
// Handles AI chat requests using Claude API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CLAUDE_API_KEY = Deno.env.get("CLAUDE_API_KEY");
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  branchPath: string[];
}

serve(async (req) => {
  // CORS headers
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const { messages, branchPath }: ChatRequest = await req.json();

    // TODO: Implement actual Claude API call
    // const response = await fetch("https://api.anthropic.com/v1/messages", {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //     "x-api-key": CLAUDE_API_KEY,
    //     "anthropic-version": "2023-06-01",
    //   },
    //   body: JSON.stringify({
    //     model: CLAUDE_MODEL,
    //     messages: messages,
    //     max_tokens: 1024,
    //   }),
    // });

    // Stub response for now
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
    let suggestedAnimation = null;
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
    
    const stubResponse = {
      message: {
        role: "assistant",
        content: `[Supabase Edge Function Stub]\n\nI received: "${lastUserMessage.content}"\n\nThis will connect to Claude API (${CLAUDE_MODEL}) in production.\nBranch depth: ${branchPath.length}`,
      },
      suggestedAnimation,
      nodeId: `node-${Date.now()}`,
    };

    return new Response(JSON.stringify(stubResponse), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});

