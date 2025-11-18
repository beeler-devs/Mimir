import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { nanoid } from 'nanoid';
import {
  requireAuth,
  checkResourceOwnership,
  validateFileSignature,
  FILE_SIGNATURES,
  sanitizeFilename,
  errorResponse,
  successResponse,
  checkRateLimit,
  getSecurityHeaders,
} from '@/lib/auth/requireAuth';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/pdf/upload
 * Uploads a PDF file to Supabase Storage and returns the public URL
 *
 * Request: multipart/form-data with 'file' field
 * Authorization: Bearer token required
 * Response: { url: string, path: string, size: number }
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const { user, error: authError } = await requireAuth(request);
    if (authError) return authError;

    // Rate limiting - 20 uploads per minute per user
    const rateLimit = checkRateLimit(`pdf-upload:${user!.id}`, 20, 60000);
    if (!rateLimit.allowed) {
      return errorResponse('Rate limit exceeded. Please try again later.', 429);
    }

    if (!supabaseServer) {
      return errorResponse('Storage service not configured', 503);
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return errorResponse('No file provided', 400);
    }

    // Use authenticated user's ID instead of client-provided userId
    const userId = user!.id;

    // Validate file type by magic bytes (not just MIME type which can be spoofed)
    const signatureValidation = await validateFileSignature(file, [FILE_SIGNATURES.PDF]);
    if (!signatureValidation.valid) {
      return errorResponse('Invalid file: Only PDF files are allowed', 400);
    }

    // Validate file size (max 50MB)
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB
    if (file.size > MAX_SIZE) {
      return errorResponse('File size exceeds 50MB limit', 400);
    }

    // Sanitize filename and generate unique file path
    // Use only .pdf extension to prevent path traversal via extension manipulation
    const sanitizedName = sanitizeFilename(file.name);
    const uniqueFileName = `${nanoid()}.pdf`;
    const filePath = `${userId}/pdfs/${uniqueFileName}`;

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { data, error } = await supabaseServer.storage
      .from('documents') // Make sure this bucket exists in Supabase
      .upload(filePath, buffer, {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      console.error('Error uploading to Supabase Storage:', error);
      return errorResponse('Failed to upload file', 500);
    }

    // Get signed URL instead of public URL for better access control
    // The signed URL expires and provides better security than public URLs
    const { data: signedUrlData, error: signedUrlError } = await supabaseServer.storage
      .from('documents')
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (signedUrlError) {
      console.error('Error creating signed URL:', signedUrlError);
      // Fallback to public URL if signed URL fails
      const { data: urlData } = supabaseServer.storage
        .from('documents')
        .getPublicUrl(filePath);

      return successResponse({
        success: true,
        url: urlData.publicUrl,
        size: file.size,
        fileName: sanitizedName,
      });
    }

    return successResponse({
      success: true,
      url: signedUrlData.signedUrl,
      size: file.size,
      fileName: sanitizedName,
    });
  } catch (error) {
    console.error('Error in PDF upload:', error);
    // Don't expose internal error details to client
    return errorResponse('Failed to upload PDF', 500);
  }
}

/**
 * DELETE /api/pdf/upload
 * Deletes a PDF file from Supabase Storage
 *
 * Request body: { path: string }
 * Authorization: Bearer token required
 */
export async function DELETE(request: NextRequest) {
  try {
    // Verify authentication
    const { user, error: authError } = await requireAuth(request);
    if (authError) return authError;

    if (!supabaseServer) {
      return errorResponse('Storage service not configured', 503);
    }

    const { path } = await request.json();

    if (!path || typeof path !== 'string') {
      return errorResponse('File path required', 400);
    }

    // Security: Verify user owns this file by checking path prefix
    // Path format should be: {userId}/pdfs/{filename}
    const userId = user!.id;
    const expectedPrefix = `${userId}/`;

    if (!path.startsWith(expectedPrefix)) {
      return errorResponse('Access denied: You do not own this file', 403);
    }

    // Additional path traversal protection
    if (path.includes('..') || path.includes('//')) {
      return errorResponse('Invalid file path', 400);
    }

    const { error } = await supabaseServer.storage
      .from('documents')
      .remove([path]);

    if (error) {
      console.error('Error deleting from Supabase Storage:', error);
      return errorResponse('Failed to delete file', 500);
    }

    return successResponse({
      success: true,
      message: 'File deleted successfully',
    });
  } catch (error) {
    console.error('Error in PDF deletion:', error);
    return errorResponse('Failed to delete PDF', 500);
  }
}
