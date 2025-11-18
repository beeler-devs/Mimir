// Supabase Edge Function: Chat
// Handles AI chat requests using Claude API

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const CLAUDE_API_KEY = Deno.env.get("CLAUDE_API_KEY");
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

// Allowed origins for CORS (configure based on your deployment)
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://mimir.app", // Replace with your production domain
];

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  branchPath: string[];
}

// Rate limiting map (in-memory, resets on function cold start)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(userId: string, maxRequests: number = 30, windowMs: number = 60000): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(userId);

  if (!record || now > record.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (record.count >= maxRequests) {
    return false;
  }

  record.count++;
  return true;
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  // Check if origin is allowed
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function getSecurityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Content-Type": "application/json",
  };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST method
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, ...getSecurityHeaders(), "Allow": "POST, OPTIONS" },
    });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid authorization" }), {
        status: 401,
        headers: { ...corsHeaders, ...getSecurityHeaders() },
      });
    }

    const token = authHeader.substring(7);

    // Verify JWT with Supabase
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error("Supabase configuration missing");
      return new Response(JSON.stringify({ error: "Service configuration error" }), {
        status: 503,
        headers: { ...corsHeaders, ...getSecurityHeaders() },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, ...getSecurityHeaders() },
      });
    }

    // Rate limiting - 30 requests per minute per user
    if (!checkRateLimit(user.id)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
        status: 429,
        headers: { ...corsHeaders, ...getSecurityHeaders() },
      });
    }

    // Parse and validate request body
    let requestBody: ChatRequest;
    try {
      requestBody = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, ...getSecurityHeaders() },
      });
    }

    const { messages, branchPath } = requestBody;

    // Validate messages array
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Messages array is required" }), {
        status: 400,
        headers: { ...corsHeaders, ...getSecurityHeaders() },
      });
    }

    // Validate message count (prevent abuse)
    if (messages.length > 100) {
      return new Response(JSON.stringify({ error: "Too many messages in request" }), {
        status: 400,
        headers: { ...corsHeaders, ...getSecurityHeaders() },
      });
    }

    // Validate each message
    for (const msg of messages) {
      if (!msg.role || !["user", "assistant"].includes(msg.role)) {
        return new Response(JSON.stringify({ error: "Invalid message role" }), {
          status: 400,
          headers: { ...corsHeaders, ...getSecurityHeaders() },
        });
      }
      if (typeof msg.content !== "string") {
        return new Response(JSON.stringify({ error: "Message content must be a string" }), {
          status: 400,
          headers: { ...corsHeaders, ...getSecurityHeaders() },
        });
      }
      // Limit message content length (prevent abuse)
      if (msg.content.length > 50000) {
        return new Response(JSON.stringify({ error: "Message content too long" }), {
          status: 400,
          headers: { ...corsHeaders, ...getSecurityHeaders() },
        });
      }
    }

    // Validate branchPath
    if (!Array.isArray(branchPath)) {
      return new Response(JSON.stringify({ error: "branchPath must be an array" }), {
        status: 400,
        headers: { ...corsHeaders, ...getSecurityHeaders() },
      });
    }

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
        content: `[Supabase Edge Function Stub]\n\nI received your message.\n\nThis will connect to Claude API in production.\nBranch depth: ${branchPath.length}`,
      },
      suggestedAnimation,
      nodeId: `node-${Date.now()}`,
    };

    return new Response(JSON.stringify(stubResponse), {
      headers: { ...corsHeaders, ...getSecurityHeaders() },
    });
  } catch (error) {
    // Log error server-side but don't expose details to client
    console.error("Chat function error:", error);
    return new Response(JSON.stringify({ error: "An error occurred processing your request" }), {
      status: 500,
      headers: { ...corsHeaders, ...getSecurityHeaders() },
    });
  }
});
