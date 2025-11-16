import { NextRequest, NextResponse } from 'next/server';

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

    // TODO: Implement YouTube transcript fetching
    // Options:
    // 1. Use youtube-transcript npm package
    // 2. Use YouTube Data API v3 with captions
    // 3. Use a third-party service like AssemblyAI or Deepgram

    // Example using youtube-transcript package:
    // const { YoutubeTranscript } = require('youtube-transcript');
    // const transcriptData = await YoutubeTranscript.fetchTranscript(youtubeId);
    //
    // const segments = transcriptData.map(item => ({
    //   text: item.text,
    //   timestamp: item.offset / 1000, // Convert ms to seconds
    //   duration: item.duration / 1000
    // }));
    //
    // const transcript = segments.map(s => s.text).join(' ');
    //
    // // Optionally fetch video metadata
    // const videoInfo = await fetchYouTubeMetadata(youtubeId);
    //
    // return NextResponse.json({
    //   success: true,
    //   transcript,
    //   segments,
    //   duration: videoInfo.duration,
    //   title: videoInfo.title,
    //   publishedAt: videoInfo.publishedAt,
    // });

    // TEMPORARY: Return mock data for testing
    return NextResponse.json({
      success: true,
      transcript: 'This is a mock transcript. Replace this with actual YouTube transcript fetching.',
      segments: [
        { text: 'This is a mock transcript.', timestamp: 0, duration: 3 },
        { text: 'Replace this with actual YouTube transcript fetching.', timestamp: 3, duration: 5 },
      ],
      duration: 8,
      title: 'Mock Video Title',
      publishedAt: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error fetching YouTube transcript:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch YouTube transcript',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
