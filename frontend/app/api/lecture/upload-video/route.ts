import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { nanoid } from 'nanoid';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes (max for Vercel hobby plan)

/**
 * POST /api/lecture/upload-video
 * Uploads video file to Supabase Storage and extracts transcript
 *
 * Request: multipart/form-data with 'video' and 'userId' fields
 * Response: { videoUrl: string, transcript: string, segments: Array, duration: number }
 */
export async function POST(request: NextRequest) {
  try {
    if (!supabaseServer) {
      return NextResponse.json(
        { error: 'Storage not configured' },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const videoFile = formData.get('video') as File;
    const userId = formData.get('userId') as string;

    if (!videoFile) {
      return NextResponse.json(
        { error: 'No video file provided' },
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
    const validVideoTypes = ['video/mp4', 'video/quicktime', 'video/x-m4v'];
    if (!validVideoTypes.includes(videoFile.type)) {
      return NextResponse.json(
        { error: 'Only MP4 and MOV video files are allowed' },
        { status: 400 }
      );
    }

    // Validate file size (max 500MB for video)
    const MAX_SIZE = 500 * 1024 * 1024; // 500MB
    if (videoFile.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'Video file size exceeds 500MB limit' },
        { status: 400 }
      );
    }

    // Generate unique file path
    const fileExtension = videoFile.name.split('.').pop() || 'mp4';
    const uniqueFileName = `${nanoid()}.${fileExtension}`;
    const filePath = `${userId}/lectures/videos/${uniqueFileName}`;

    // Convert file to buffer
    const arrayBuffer = await videoFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { data, error: uploadError } = await supabaseServer.storage
      .from('documents')
      .upload(filePath, buffer, {
        contentType: videoFile.type,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('Error uploading video to Supabase Storage:', uploadError);
      return NextResponse.json(
        {
          error: 'Failed to upload video file',
          details: uploadError.message
        },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabaseServer.storage
      .from('documents')
      .getPublicUrl(filePath);

    // Transcribe using Deepgram (supports video files directly)
    const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramApiKey) {
      console.error('Deepgram API key not configured');
      return NextResponse.json(
        { error: 'Transcription service not configured' },
        { status: 500 }
      );
    }

    const { createClient } = await import('@deepgram/sdk');
    const deepgram = createClient(deepgramApiKey);

    // Deepgram can transcribe video files directly
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      buffer,
      {
        model: 'nova-2',
        smart_format: true,
        punctuate: true,
        paragraphs: true,
        utterances: true,
        video: true, // Enable video processing
      }
    );

    if (error) {
      console.error('Deepgram transcription error:', error);
      return NextResponse.json(
        { error: 'Failed to transcribe video', details: error.message },
        { status: 500 }
      );
    }

    const channel = result?.results?.channels?.[0];
    const alternatives = channel?.alternatives?.[0];

    if (!alternatives || !alternatives.words) {
      return NextResponse.json(
        { error: 'No transcription results available' },
        { status: 500 }
      );
    }

    // Group words into segments
    const segments: Array<{ text: string; timestamp: number; duration: number }> = [];
    let currentSegment = { text: '', timestamp: 0, words: [] as any[] };
    const SEGMENT_DURATION = 10;

    for (const word of alternatives.words) {
      if (!currentSegment.text) {
        currentSegment.timestamp = word.start;
      }
      
      currentSegment.text += (currentSegment.text ? ' ' : '') + word.word;
      currentSegment.words.push(word);

      const shouldBreak = 
        word.word.match(/[.!?]$/) || 
        (word.end - currentSegment.timestamp > SEGMENT_DURATION);

      if (shouldBreak && currentSegment.words.length > 0) {
        const lastWord = currentSegment.words[currentSegment.words.length - 1];
        segments.push({
          text: currentSegment.text.trim(),
          timestamp: currentSegment.timestamp,
          duration: lastWord.end - currentSegment.timestamp
        });
        currentSegment = { text: '', timestamp: 0, words: [] };
      }
    }

    if (currentSegment.words.length > 0) {
      const lastWord = currentSegment.words[currentSegment.words.length - 1];
      segments.push({
        text: currentSegment.text.trim(),
        timestamp: currentSegment.timestamp,
        duration: lastWord.end - currentSegment.timestamp
      });
    }

    // Calculate duration from the last word's end time
    const duration = alternatives.words && alternatives.words.length > 0
      ? alternatives.words[alternatives.words.length - 1].end
      : 0;

    return NextResponse.json({
      success: true,
      videoUrl: urlData.publicUrl,
      transcript: alternatives.transcript,
      segments,
      duration: duration,
    });

  } catch (error) {
    console.error('Error processing video:', error);
    return NextResponse.json(
      {
        error: 'Failed to process video',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
