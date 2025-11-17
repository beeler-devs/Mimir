import { NextRequest, NextResponse } from 'next/server';
import { YoutubeTranscript } from 'youtube-transcript';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/lecture/youtube-transcript
 * Fetches YouTube video transcript
 *
 * Request body: { youtubeId: string }
 * Response: { transcript: string, segments: Array<{text, timestamp, duration}>, duration: number, title: string, publishedAt: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { youtubeId } = await request.json();

    if (!youtubeId) {
      return NextResponse.json(
        { error: 'YouTube ID is required' },
        { status: 400 }
      );
    }

    // Fetch transcript from YouTube
    const transcriptData = await YoutubeTranscript.fetchTranscript(youtubeId);
    
    if (!transcriptData || transcriptData.length === 0) {
      return NextResponse.json(
        { error: 'No transcript available for this video' },
        { status: 404 }
      );
    }

    // Convert transcript data to our format
    const segments = transcriptData.map(item => ({
      text: item.text,
      timestamp: item.offset / 1000, // Convert ms to seconds
      duration: item.duration / 1000
    }));

    // Combine all text for full transcript
    const transcript = segments.map(s => s.text).join(' ');

    // Calculate total duration from last segment
    const lastSegment = segments[segments.length - 1];
    const duration = lastSegment.timestamp + lastSegment.duration;

    // Fetch video metadata using oEmbed API (no API key required)
    let title = 'YouTube Video';
    let publishedAt = new Date().toISOString();
    
    try {
      const oembedResponse = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtubeId}&format=json`
      );
      
      if (oembedResponse.ok) {
        const metadata = await oembedResponse.json();
        title = metadata.title || title;
      }
    } catch (metadataError) {
      console.warn('Failed to fetch video metadata, using defaults:', metadataError);
    }

    return NextResponse.json({
      success: true,
      transcript,
      segments,
      duration,
      title,
      publishedAt,
    });

  } catch (error) {
    console.error('Error fetching YouTube transcript:', error);
    
    // Provide more specific error messages
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isTranscriptDisabled = errorMessage.toLowerCase().includes('transcript') || 
                                  errorMessage.toLowerCase().includes('disabled');
    
    return NextResponse.json(
      {
        error: isTranscriptDisabled 
          ? 'Transcripts are disabled for this video or no transcript is available'
          : 'Failed to fetch YouTube transcript',
        details: errorMessage
      },
      { status: 500 }
    );
  }
}
