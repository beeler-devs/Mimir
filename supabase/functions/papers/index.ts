// Supabase Edge Function: Papers
// Handles PDF upload, text extraction, and lecture/paper synthesis

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const CLAUDE_API_KEY = Deno.env.get("CLAUDE_API_KEY");
const MANIM_WORKER_URL = Deno.env.get("MANIM_WORKER_URL");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://mimir.app",
];

// Allowed domains for PDF URLs (SSRF protection)
const ALLOWED_PDF_DOMAINS = [
  "storage.googleapis.com",
  "s3.amazonaws.com",
  "supabase.co",
  "arxiv.org",
  "pdf.sciencedirectassets.com",
];

interface PaperRequest {
  pdfUrl: string;
  type: "lecture" | "paper";
}

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(userId: string, maxRequests: number = 10, windowMs: number = 60000): boolean {
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

/**
 * Validates URL to prevent SSRF attacks
 */
function validatePdfUrl(urlString: string): { valid: boolean; error?: string } {
  try {
    const url = new URL(urlString);

    // Only allow HTTPS
    if (url.protocol !== "https:") {
      return { valid: false, error: "Only HTTPS URLs are allowed" };
    }

    // Block private IP ranges
    const hostname = url.hostname.toLowerCase();

    // Block localhost
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return { valid: false, error: "Access to localhost is not allowed" };
    }

    // Block private IP ranges
    const privateIpPatterns = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^169\.254\./,
      /^0\./,
    ];

    for (const pattern of privateIpPatterns) {
      if (pattern.test(hostname)) {
        return { valid: false, error: "Access to private IP addresses is not allowed" };
      }
    }

    // Block AWS metadata endpoint
    if (hostname === "169.254.169.254") {
      return { valid: false, error: "Access to metadata endpoints is not allowed" };
    }

    // Check if domain is in allowlist
    const isAllowedDomain = ALLOWED_PDF_DOMAINS.some(domain =>
      hostname === domain || hostname.endsWith(`.${domain}`)
    );

    if (!isAllowedDomain) {
      return { valid: false, error: "PDF URL domain is not in the allowed list" };
    }

    // Validate URL length
    if (urlString.length > 2000) {
      return { valid: false, error: "URL is too long" };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
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

    // Rate limiting - 10 requests per minute per user (paper processing is expensive)
    if (!checkRateLimit(user.id)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
        status: 429,
        headers: { ...corsHeaders, ...getSecurityHeaders() },
      });
    }

    // Parse and validate request body
    let requestBody: PaperRequest;
    try {
      requestBody = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, ...getSecurityHeaders() },
      });
    }

    const { pdfUrl, type } = requestBody;

    // Validate pdfUrl
    if (!pdfUrl || typeof pdfUrl !== "string") {
      return new Response(JSON.stringify({ error: "PDF URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, ...getSecurityHeaders() },
      });
    }

    // SSRF protection - validate URL
    const urlValidation = validatePdfUrl(pdfUrl);
    if (!urlValidation.valid) {
      return new Response(JSON.stringify({ error: urlValidation.error }), {
        status: 400,
        headers: { ...corsHeaders, ...getSecurityHeaders() },
      });
    }

    // Validate type
    if (!type || !["lecture", "paper"].includes(type)) {
      return new Response(JSON.stringify({ error: "Type must be 'lecture' or 'paper'" }), {
        status: 400,
        headers: { ...corsHeaders, ...getSecurityHeaders() },
      });
    }

    // TODO: Implement paper processing
    // 1. Extract text from PDF
    // 2. Segment the content
    // 3. Call Claude to generate:
    //    - Outline
    //    - Section-by-section explanation
    //    - Animation suggestions
    // 4. Optionally call Manim worker for animations

    const stubResponse = {
      outline: [
        "Introduction to the topic",
        "Main concepts and definitions",
        "Key theorems and proofs",
        "Applications and examples",
        "Conclusion",
      ],
      sections: [
        {
          title: "Introduction",
          content: "This is a stub explanation of the introduction section.",
          animationSuggestion: "Visual representation of the main concept",
        },
      ],
      animationJobs: [],
    };

    return new Response(JSON.stringify(stubResponse), {
      headers: { ...corsHeaders, ...getSecurityHeaders() },
    });
  } catch (error) {
    console.error("Papers function error:", error);
    return new Response(JSON.stringify({ error: "An error occurred processing your request" }), {
      status: 500,
      headers: { ...corsHeaders, ...getSecurityHeaders() },
    });
  }
});
