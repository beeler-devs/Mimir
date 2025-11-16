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

    // TODO: Implement audio transcription
    // Options:
    // 1. OpenAI Whisper API
    // 2. AssemblyAI
    // 3. Deepgram
    // 4. Google Speech-to-Text
    //
    // Example with OpenAI Whisper:
    // const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    // const transcription = await openai.audio.transcriptions.create({
    //   file: audioFile,
    //   model: 'whisper-1',
    //   response_format: 'verbose_json', // Get timestamps
    //   timestamp_granularities: ['segment']
    // });
    //
    // const segments = transcription.segments.map(seg => ({
    //   text: seg.text,
    //   timestamp: seg.start,
    //   duration: seg.end - seg.start
    // }));
    //
    // return NextResponse.json({
    //   success: true,
    //   audioUrl: urlData.publicUrl,
    //   transcript: transcription.text,
    //   segments,
    //   duration: transcription.duration,
    // });

    // TEMPORARY: Return mock data for testing
    return NextResponse.json({
      success: true,
      audioUrl: urlData.publicUrl,
      transcript: 'This is a mock transcription. Replace this with actual audio transcription.',
      segments: [
        { text: 'This is a mock transcription.', timestamp: 0, duration: 3 },
        { text: 'Replace this with actual audio transcription.', timestamp: 3, duration: 5 },
      ],
      duration: 8,
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
