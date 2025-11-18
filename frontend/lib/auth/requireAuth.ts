import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client for auth validation
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Create server-side client if keys are available
const supabaseAuth = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

export interface AuthenticatedUser {
  id: string;
  email?: string;
  role?: string;
}

export interface AuthResult {
  user: AuthenticatedUser | null;
  error: NextResponse | null;
}

/**
 * Validates authentication token from request headers
 * Returns user info if valid, or an error response if invalid
 */
export async function requireAuth(request: NextRequest): Promise<AuthResult> {
  // Check if Supabase is configured
  if (!supabaseAuth) {
    console.error('Supabase service role not configured for authentication');
    return {
      user: null,
      error: NextResponse.json(
        { error: 'Authentication service not configured' },
        { status: 503 }
      ),
    };
  }

  // Get authorization header
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      user: null,
      error: NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      ),
    };
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    // Verify the JWT token
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);

    if (error || !user) {
      return {
        user: null,
        error: NextResponse.json(
          { error: 'Invalid or expired token' },
          { status: 401 }
        ),
      };
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      error: null,
    };
  } catch (err) {
    console.error('Auth verification error:', err);
    return {
      user: null,
      error: NextResponse.json(
        { error: 'Authentication verification failed' },
        { status: 500 }
      ),
    };
  }
}

/**
 * Check if user has permission to access a specific resource
 */
export function checkResourceOwnership(
  user: AuthenticatedUser,
  resourceUserId: string
): NextResponse | null {
  if (user.id !== resourceUserId) {
    return NextResponse.json(
      { error: 'Access denied: You do not own this resource' },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Validate that a URL is safe (not pointing to internal resources)
 * Prevents SSRF attacks
 */
export function validateExternalUrl(urlString: string): { valid: boolean; error?: string } {
  try {
    const url = new URL(urlString);

    // Only allow https in production
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
      return { valid: false, error: 'Only HTTPS URLs are allowed' };
    }

    // Allow http only for localhost in development
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return { valid: false, error: 'Invalid URL protocol' };
    }

    // Block private IP ranges (SSRF protection)
    const hostname = url.hostname.toLowerCase();

    // Block localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return { valid: false, error: 'Access to localhost is not allowed' };
    }

    // Block private IP ranges
    const privateIpPatterns = [
      /^10\./,                          // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,  // 172.16.0.0/12
      /^192\.168\./,                     // 192.168.0.0/16
      /^169\.254\./,                     // 169.254.0.0/16 (link-local)
      /^0\./,                            // 0.0.0.0/8
    ];

    for (const pattern of privateIpPatterns) {
      if (pattern.test(hostname)) {
        return { valid: false, error: 'Access to private IP addresses is not allowed' };
      }
    }

    // Block AWS metadata endpoint
    if (hostname === '169.254.169.254') {
      return { valid: false, error: 'Access to metadata endpoints is not allowed' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Sanitize error message for client response
 * Prevents information disclosure
 */
export function sanitizeError(error: unknown): string {
  // Log the full error server-side
  console.error('Error:', error);

  // Return generic message to client
  return 'An error occurred processing your request';
}

/**
 * Rate limiting check (basic in-memory implementation)
 * For production, use Redis or a proper rate limiting service
 */
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(
  identifier: string,
  maxRequests: number = 100,
  windowMs: number = 60000
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  if (!record || now > record.resetTime) {
    // Create new window
    const resetTime = now + windowMs;
    rateLimitMap.set(identifier, { count: 1, resetTime });
    return { allowed: true, remaining: maxRequests - 1, resetTime };
  }

  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetTime: record.resetTime };
  }

  record.count++;
  return { allowed: true, remaining: maxRequests - record.count, resetTime: record.resetTime };
}

/**
 * Validate file type by checking magic bytes (file signature)
 * More secure than checking MIME type which can be spoofed
 */
export async function validateFileSignature(
  file: File,
  allowedTypes: { extension: string; signatures: number[][] }[]
): Promise<{ valid: boolean; detectedType?: string; error?: string }> {
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer).slice(0, 12);

    for (const type of allowedTypes) {
      for (const signature of type.signatures) {
        if (signature.every((byte, index) => bytes[index] === byte)) {
          return { valid: true, detectedType: type.extension };
        }
      }
    }

    return { valid: false, error: 'File type not allowed or file is corrupted' };
  } catch {
    return { valid: false, error: 'Failed to validate file' };
  }
}

// Common file signatures
export const FILE_SIGNATURES = {
  PDF: {
    extension: 'pdf',
    signatures: [[0x25, 0x50, 0x44, 0x46]], // %PDF
  },
  PNG: {
    extension: 'png',
    signatures: [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
  },
  JPEG: {
    extension: 'jpg',
    signatures: [[0xFF, 0xD8, 0xFF]],
  },
  MP4: {
    extension: 'mp4',
    signatures: [
      [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70],
      [0x00, 0x00, 0x00, 0x1C, 0x66, 0x74, 0x79, 0x70],
      [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70],
    ],
  },
  WEBM: {
    extension: 'webm',
    signatures: [[0x1A, 0x45, 0xDF, 0xA3]],
  },
  MP3: {
    extension: 'mp3',
    signatures: [
      [0x49, 0x44, 0x33], // ID3
      [0xFF, 0xFB],       // MPEG audio
    ],
  },
  WAV: {
    extension: 'wav',
    signatures: [[0x52, 0x49, 0x46, 0x46]], // RIFF
  },
};

/**
 * Validate and sanitize filename to prevent path traversal
 */
export function sanitizeFilename(filename: string): string {
  // Remove path components
  const basename = filename.split(/[/\\]/).pop() || '';

  // Remove null bytes and other dangerous characters
  const sanitized = basename
    .replace(/\0/g, '')
    .replace(/[<>:"|?*]/g, '')
    .trim();

  // Prevent hidden files
  const finalName = sanitized.startsWith('.') ? sanitized.substring(1) : sanitized;

  return finalName || 'unnamed';
}

/**
 * Get safe file extension from filename
 */
export function getSafeExtension(
  filename: string,
  allowedExtensions: string[]
): string | null {
  const ext = filename.split('.').pop()?.toLowerCase();

  if (!ext || !allowedExtensions.includes(ext)) {
    return null;
  }

  return ext;
}

/**
 * Create secure response headers
 */
export function getSecurityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'",
  };
}

/**
 * Create error response with security headers
 */
export function errorResponse(
  message: string,
  status: number = 500
): NextResponse {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: getSecurityHeaders(),
    }
  );
}

/**
 * Create success response with security headers
 */
export function successResponse(
  data: unknown,
  status: number = 200
): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: getSecurityHeaders(),
  });
}
