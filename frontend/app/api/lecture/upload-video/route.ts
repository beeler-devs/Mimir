import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { nanoid } from 'nanoid';
import {
  requireAuth,
  validateFileSignature,
  FILE_SIGNATURES,
  sanitizeFilename,
  errorResponse,
  successResponse,
  checkRateLimit,
} from '@/lib/auth/requireAuth';

export const runtime = 'nodejs';
export const maxDuration = 600; // 10 minutes for large video files

/**
 * POST /api/lecture/upload-video
 * Uploads video file to Supabase Storage and extracts transcript
 *
 * Request: multipart/form-data with 'video' field
 * Authorization: Bearer token required
 * Response: { videoUrl: string, transcript: string, segments: Array, duration: number }
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const { user, error: authError } = await requireAuth(request);
    if (authError) return authError;

    // Rate limiting - 5 video uploads per minute per user (videos are expensive)
    const rateLimit = checkRateLimit(`video-upload:${user!.id}`, 5, 60000);
    if (!rateLimit.allowed) {
      return errorResponse('Rate limit exceeded. Please try again later.', 429);
    }

    if (!supabaseServer) {
      return errorResponse('Storage service not configured', 503);
    }

    const formData = await request.formData();
    const videoFile = formData.get('video') as File;

    if (!videoFile) {
      return errorResponse('No video file provided', 400);
    }

    // Use authenticated user's ID
    const userId = user!.id;

    // Validate file type by magic bytes
    const signatureValidation = await validateFileSignature(videoFile, [
      FILE_SIGNATURES.MP4,
      FILE_SIGNATURES.WEBM,
    ]);
    if (!signatureValidation.valid) {
      return errorResponse('Invalid file: Only MP4 and WebM video files are allowed', 400);
    }

    // Validate file size (max 500MB for video)
    const MAX_SIZE = 500 * 1024 * 1024; // 500MB
    if (videoFile.size > MAX_SIZE) {
      return errorResponse('Video file size exceeds 500MB limit', 400);
    }

    // Sanitize filename and use detected extension
    const sanitizedName = sanitizeFilename(videoFile.name);
    const safeExtension = signatureValidation.detectedType || 'mp4';
    const uniqueFileName = `${nanoid()}.${safeExtension}`;
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
      return errorResponse('Failed to upload video file', 500);
    }

    // Get signed URL for better security
    const { data: signedUrlData, error: signedUrlError } = await supabaseServer.storage
      .from('documents')
      .createSignedUrl(filePath, 7200); // 2 hour expiry for videos

    let videoUrl: string;
    if (signedUrlError) {
      // Fallback to public URL
      const { data: urlData } = supabaseServer.storage
        .from('documents')
        .getPublicUrl(filePath);
      videoUrl = urlData.publicUrl;
    } else {
      videoUrl = signedUrlData.signedUrl;
    }

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
    return successResponse({
      success: true,
      videoUrl,
      transcript: 'This is a mock transcription from video. Replace this with actual video transcription.',
      segments: [
        { text: 'This is a mock transcription from video.', timestamp: 0, duration: 4 },
        { text: 'Replace this with actual video transcription.', timestamp: 4, duration: 5 },
      ],
      duration: 9,
    });

  } catch (error) {
    console.error('Error processing video:', error);
    return errorResponse('Failed to process video', 500);
  }
}
