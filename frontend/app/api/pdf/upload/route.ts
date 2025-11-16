import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { nanoid } from 'nanoid';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/pdf/upload
 * Uploads a PDF file to Supabase Storage and returns the public URL
 *
 * Request: multipart/form-data with 'file' field
 * Response: { url: string, path: string, size: number }
 */
export async function POST(request: NextRequest) {
  try {
    if (!supabaseServer) {
      return NextResponse.json(
        {
          error: 'Storage not configured',
          details: 'Supabase service role key is missing. Set SUPABASE_SERVICE_ROLE_KEY environment variable.'
        },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const userId = formData.get('userId') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 400 }
      );
    }

    // Validate file type
    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Only PDF files are allowed' },
        { status: 400 }
      );
    }

    // Validate file size (max 50MB)
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds 50MB limit' },
        { status: 400 }
      );
    }

    // Generate unique file path
    const fileExtension = file.name.split('.').pop();
    const uniqueFileName = `${nanoid()}.${fileExtension}`;
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
      return NextResponse.json(
        {
          error: 'Failed to upload file',
          details: error.message
        },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabaseServer.storage
      .from('documents')
      .getPublicUrl(filePath);

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      path: filePath,
      size: file.size,
      fileName: file.name,
    });
  } catch (error) {
    console.error('Error in PDF upload:', error);
    return NextResponse.json(
      {
        error: 'Failed to upload PDF',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/pdf/upload
 * Deletes a PDF file from Supabase Storage
 *
 * Request body: { path: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    if (!supabaseServer) {
      return NextResponse.json(
        { error: 'Storage not configured' },
        { status: 500 }
      );
    }

    const { path } = await request.json();

    if (!path) {
      return NextResponse.json(
        { error: 'File path required' },
        { status: 400 }
      );
    }

    const { error } = await supabaseServer.storage
      .from('documents')
      .remove([path]);

    if (error) {
      console.error('Error deleting from Supabase Storage:', error);
      return NextResponse.json(
        {
          error: 'Failed to delete file',
          details: error.message
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'File deleted successfully',
    });
  } catch (error) {
    console.error('Error in PDF deletion:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete PDF',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
