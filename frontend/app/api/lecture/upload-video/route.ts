import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { nanoid } from 'nanoid';

export const runtime = 'nodejs';
export const maxDuration = 600; // 10 minutes for large video files

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

    // TODO: Implement video transcription
    // Options:
    // 1. Extract audio from video using ffmpeg, then use OpenAI Whisper
    // 2. Use AssemblyAI (supports video directly)
    // 3. Use Deepgram (supports video)
    // 4. Use Google Speech-to-Text with video
    //
    // Example workflow with ffmpeg + Whisper:
    // 1. Extract audio track from video
    //    const audioBuffer = await extractAudioFromVideo(buffer);
    //
    // 2. Transcribe audio with OpenAI Whisper
    //    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    //    const audioFile = new File([audioBuffer], 'audio.mp3', { type: 'audio/mpeg' });
    //    const transcription = await openai.audio.transcriptions.create({
    //      file: audioFile,
    //      model: 'whisper-1',
    //      response_format: 'verbose_json',
    //      timestamp_granularities: ['segment']
    //    });
    //
    // 3. Get video duration (using ffprobe or similar)
    //    const videoDuration = await getVideoDuration(buffer);
    //
    //    const segments = transcription.segments.map(seg => ({
    //      text: seg.text,
    //      timestamp: seg.start,
    //      duration: seg.end - seg.start
    //    }));
    //
    //    return NextResponse.json({
    //      success: true,
    //      videoUrl: urlData.publicUrl,
    //      transcript: transcription.text,
    //      segments,
    //      duration: videoDuration,
    //    });

    // TEMPORARY: Return mock data for testing
    return NextResponse.json({
      success: true,
      videoUrl: urlData.publicUrl,
      transcript: 'This is a mock transcription from video. Replace this with actual video transcription.',
      segments: [
        { text: 'This is a mock transcription from video.', timestamp: 0, duration: 4 },
        { text: 'Replace this with actual video transcription.', timestamp: 4, duration: 5 },
      ],
      duration: 9,
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
