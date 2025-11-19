import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { nanoid } from 'nanoid';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for longer audio files

/**
 * POST /api/lecture/transcribe-audio
 * Uploads audio file to Supabase Storage and transcribes it
 *
 * Request: multipart/form-data with 'audio' and 'userId' fields
 * Response: { audioUrl: string, transcript: string, segments: Array, duration: number }
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
    const audioFile = formData.get('audio') as File;
    const userId = formData.get('userId') as string;

    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 400 }
      );
    }

    // Validate file size (max 100MB for audio)
    const MAX_SIZE = 100 * 1024 * 1024; // 100MB
    if (audioFile.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'Audio file size exceeds 100MB limit' },
        { status: 400 }
      );
    }

    // Generate unique file path
    const fileExtension = audioFile.name.split('.').pop() || 'webm';
    const uniqueFileName = `${nanoid()}.${fileExtension}`;
    const filePath = `${userId}/lectures/audio/${uniqueFileName}`;

    // Convert file to buffer
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { data, error: uploadError } = await supabaseServer.storage
      .from('documents')
      .upload(filePath, buffer, {
        contentType: audioFile.type || 'audio/webm',
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('Error uploading audio to Supabase Storage:', uploadError);
      return NextResponse.json(
        {
          error: 'Failed to upload audio file',
          details: uploadError.message
        },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabaseServer.storage
      .from('documents')
      .getPublicUrl(filePath);

    // Transcribe using Deepgram
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

    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      buffer,
      {
        model: 'nova-2',
        smart_format: true,
        punctuate: true,
        paragraphs: true,
        utterances: true,
      }
    );

    if (error) {
      console.error('Deepgram transcription error:', error);
      return NextResponse.json(
        { error: 'Failed to transcribe audio', details: error.message },
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

    // Calculate total duration from the last segment (since Channel type doesn't have duration)
    const totalDuration = segments.length > 0
      ? segments[segments.length - 1].timestamp + segments[segments.length - 1].duration
      : 0;

    return NextResponse.json({
      success: true,
      audioUrl: urlData.publicUrl,
      transcript: alternatives.transcript,
      segments,
      duration: totalDuration,
    });

  } catch (error) {
    console.error('Error transcribing audio:', error);
    return NextResponse.json(
      {
        error: 'Failed to transcribe audio',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
