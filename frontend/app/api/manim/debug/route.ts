import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, errorResponse, successResponse } from '@/lib/auth/requireAuth';

/**
 * GET /api/manim/debug
 * Debug endpoint for checking Manim worker configuration
 *
 * SECURITY: This endpoint is disabled in production
 * Authorization: Bearer token required even in development
 */
export async function GET(request: NextRequest) {
  // CRITICAL: Never expose debug info in production
  if (process.env.NODE_ENV === 'production') {
    return errorResponse('Debug endpoint is disabled in production', 403);
  }

  // Require authentication even in development
  const { user, error: authError } = await requireAuth(request);
  if (authError) return authError;

  // Only return safe, non-sensitive information
  return successResponse({
    manim_worker_configured: !!process.env.MANIM_WORKER_URL,
    node_env: process.env.NODE_ENV,
    user_id: user!.id,
  });
}

