import { NextRequest, NextResponse } from 'next/server';

/**
 * API endpoint to provide Deepgram credentials for client-side live streaming
 * Returns a temporary API key or configuration for the client to establish
 * a direct WebSocket connection to Deepgram
 */
export async function GET(request: NextRequest) {
  try {
    const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
    
    if (!deepgramApiKey) {
      return NextResponse.json(
        { error: 'Deepgram API key not configured' },
        { status: 500 }
      );
    }

    // Return the API key for client-side use
    // In production, you might want to use Deepgram's temporary key API instead
    return NextResponse.json({
      apiKey: deepgramApiKey,
      wsUrl: 'wss://api.deepgram.com/v1/listen',
      options: {
        model: 'nova-2',
        smart_format: true,
        punctuate: true,
        interim_results: true,
        language: 'en',
      },
    });
  } catch (error) {
    console.error('Error providing Deepgram config:', error);
    return NextResponse.json(
      { error: 'Failed to get transcription config' },
      { status: 500 }
    );
  }
}

