import { NextRequest, NextResponse } from 'next/server';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for longer audio streams

/**
 * POST /api/lecture/transcribe-audio-stream
 * Streams real-time transcription of audio chunks using Deepgram
 *
 * This endpoint accepts audio data and returns streaming transcription results
 * via Server-Sent Events (SSE)
 *
 * Request body: FormData with 'audio' blob
 * Response: text/event-stream with transcription segments
 */
export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  
  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Check for Deepgram API key
        const apiKey = process.env.DEEPGRAM_API_KEY;
        if (!apiKey) {
          const errorData = JSON.stringify({
            type: 'error',
            content: 'Deepgram API key not configured'
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
          return;
        }

        // Get audio file from form data
        const formData = await request.formData();
        const audioFile = formData.get('audio') as File;

        if (!audioFile) {
          const errorData = JSON.stringify({
            type: 'error',
            content: 'No audio file provided'
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
          return;
        }

        // Convert audio file to buffer
        const arrayBuffer = await audioFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Initialize Deepgram client
        const deepgram = createClient(apiKey);

        // Use Deepgram's prerecorded API with smart_format for better transcript quality
        const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
          buffer,
          {
            model: 'nova-2',
            smart_format: true,
            punctuate: true,
            paragraphs: true,
            utterances: true,
            diarize: false, // Set to true if you want speaker detection
          }
        );

        if (error) {
          throw error;
        }

        // Extract and stream transcript segments
        const channel = result?.results?.channels?.[0];
        const alternatives = channel?.alternatives?.[0];
        
        if (!alternatives || !alternatives.words) {
          const errorData = JSON.stringify({
            type: 'error',
            content: 'No transcription results available'
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
          controller.close();
          return;
        }

        // Group words into segments (every ~10 seconds or at sentence boundaries)
        const segments: Array<{ text: string; timestamp: number; duration: number }> = [];
        let currentSegment = { text: '', timestamp: 0, words: [] as any[] };
        const SEGMENT_DURATION = 10; // seconds

        for (const word of alternatives.words) {
          if (!currentSegment.text) {
            currentSegment.timestamp = word.start;
          }
          
          currentSegment.text += (currentSegment.text ? ' ' : '') + word.word;
          currentSegment.words.push(word);

          // Create new segment at sentence boundaries or time threshold
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

            // Send segment as SSE
            const segmentData = JSON.stringify({
              type: 'segment',
              segment: {
                text: currentSegment.text.trim(),
                timestamp: currentSegment.timestamp,
                duration: lastWord.end - currentSegment.timestamp
              }
            });
            controller.enqueue(encoder.encode(`data: ${segmentData}\n\n`));

            currentSegment = { text: '', timestamp: 0, words: [] };
          }
        }

        // Add final segment if any remaining
        if (currentSegment.words.length > 0) {
          const lastWord = currentSegment.words[currentSegment.words.length - 1];
          segments.push({
            text: currentSegment.text.trim(),
            timestamp: currentSegment.timestamp,
            duration: lastWord.end - currentSegment.timestamp
          });

          const segmentData = JSON.stringify({
            type: 'segment',
            segment: {
              text: currentSegment.text.trim(),
              timestamp: currentSegment.timestamp,
              duration: lastWord.end - currentSegment.timestamp
            }
          });
          controller.enqueue(encoder.encode(`data: ${segmentData}\n\n`));
        }

        // Send completion message
        // Calculate total duration from the last segment (since Channel type doesn't have duration)
        const totalDuration = segments.length > 0
          ? segments[segments.length - 1].timestamp + segments[segments.length - 1].duration
          : 0;
        const doneData = JSON.stringify({
          type: 'done',
          transcript: alternatives.transcript,
          segments: segments,
          duration: totalDuration
        });
        controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));

      } catch (error) {
        console.error('Error in real-time transcription:', error);
        const errorData = JSON.stringify({
          type: 'error',
          content: error instanceof Error ? error.message : 'Transcription failed'
        });
        controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
      } finally {
        controller.close();
      }
    }
  });

  // Return SSE response
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

