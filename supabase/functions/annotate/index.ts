// Supabase Edge Function: Annotate
// Handles annotation export and PDF generation

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

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
];

// Type definitions for Excalidraw elements
interface ExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  [key: string]: unknown;
}

interface AnnotateRequest {
  pdfUrl: string;
  annotations: ExcalidrawElement[];
}

// Rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(userId: string, maxRequests: number = 20, windowMs: number = 60000): boolean {
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

    const hostname = url.hostname.toLowerCase();

    // Block localhost and private IPs
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return { valid: false, error: "Access to localhost is not allowed" };
    }

    const privateIpPatterns = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^169\.254\./,
    ];

    for (const pattern of privateIpPatterns) {
      if (pattern.test(hostname)) {
        return { valid: false, error: "Access to private IP addresses is not allowed" };
      }
    }

    // Check if domain is in allowlist
    const isAllowedDomain = ALLOWED_PDF_DOMAINS.some(domain =>
      hostname === domain || hostname.endsWith(`.${domain}`)
    );

    if (!isAllowedDomain) {
      return { valid: false, error: "PDF URL domain is not in the allowed list" };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

/**
 * Validate annotation element structure
 */
function validateAnnotation(element: unknown): element is ExcalidrawElement {
  if (!element || typeof element !== "object") return false;
  const obj = element as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.type === "string" &&
    typeof obj.x === "number" &&
    typeof obj.y === "number"
  );
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

    // Rate limiting
    if (!checkRateLimit(user.id)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
        status: 429,
        headers: { ...corsHeaders, ...getSecurityHeaders() },
      });
    }

    // Parse and validate request body
    let requestBody: AnnotateRequest;
    try {
      requestBody = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, ...getSecurityHeaders() },
      });
    }

    const { pdfUrl, annotations } = requestBody;

    // Validate pdfUrl
    if (!pdfUrl || typeof pdfUrl !== "string") {
      return new Response(JSON.stringify({ error: "PDF URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, ...getSecurityHeaders() },
      });
    }

    // SSRF protection
    const urlValidation = validatePdfUrl(pdfUrl);
    if (!urlValidation.valid) {
      return new Response(JSON.stringify({ error: urlValidation.error }), {
        status: 400,
        headers: { ...corsHeaders, ...getSecurityHeaders() },
      });
    }

    // Validate annotations
    if (!Array.isArray(annotations)) {
      return new Response(JSON.stringify({ error: "Annotations must be an array" }), {
        status: 400,
        headers: { ...corsHeaders, ...getSecurityHeaders() },
      });
    }

    // Limit number of annotations
    if (annotations.length > 1000) {
      return new Response(JSON.stringify({ error: "Too many annotations (max 1000)" }), {
        status: 400,
        headers: { ...corsHeaders, ...getSecurityHeaders() },
      });
    }

    // Validate each annotation
    for (const annotation of annotations) {
      if (!validateAnnotation(annotation)) {
        return new Response(JSON.stringify({ error: "Invalid annotation format" }), {
          status: 400,
          headers: { ...corsHeaders, ...getSecurityHeaders() },
        });
      }
    }

    // TODO: Implement annotation export
    // 1. Load original PDF
    // 2. Render Excalidraw annotations to canvas
    // 3. Merge annotations with PDF pages
    // 4. Save to Supabase Storage
    // 5. Return URL to annotated PDF

    const stubResponse = {
      success: true,
      annotatedPdfUrl: "/storage/annotated/stub-annotated.pdf",
      jobId: `job-${Date.now()}`,
    };

    return new Response(JSON.stringify(stubResponse), {
      headers: { ...corsHeaders, ...getSecurityHeaders() },
    });
  } catch (error) {
    console.error("Annotate function error:", error);
    return new Response(JSON.stringify({ error: "An error occurred processing your request" }), {
      status: 500,
      headers: { ...corsHeaders, ...getSecurityHeaders() },
    });
  }
});
