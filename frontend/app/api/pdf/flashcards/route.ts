import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY || '',
});

export const runtime = 'nodejs';
export const maxDuration = 120; // allow even longer for flashcard generation

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    console.log('pdf-flashcards: received file', {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    const loadingTask = pdfjsLib.getDocument({
      data,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    } as any);

    const pdf = await loadingTask.promise;
    console.log('pdf-flashcards: document loaded', { pages: pdf.numPages });

    let combinedText = '';
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => (item && item.str ? item.str : ''))
        .join(' ');
      combinedText += pageText + '\n';
    }

    const textLength = combinedText.length;
    console.log('pdf-flashcards: text extracted', { textLength });

    const cleanText = combinedText
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    await pdf.cleanup();

    let flashcards: { front: string; back: string }[] = [];
    if (process.env.CLAUDE_API_KEY) {
      try {
        console.log('pdf-flashcards: generating flashcards with Claude...');
        const message = await anthropic.messages.create({
          model: 'claude-3-opus-20240229',
          max_tokens: 4096,
          system:
            "You are an expert in creating educational materials. Your task is to generate flashcards from the provided text. Each flashcard should have a 'front' (a question or term) and a 'back' (the answer or definition). Output the flashcards as a valid JSON array of objects.",
          messages: [
            {
              role: 'user',
              content: `Please generate flashcards from the following text. The flashcards should cover the most important concepts, definitions, and key facts in the document.

Return the output as a valid JSON array where each object has a "front" and a "back" key. For example:
[
  { "front": "What is the capital of France?", "back": "Paris" },
  { "front": "What is the formula for water?", "back": "H2O" }
]

Here is the text:
${cleanText.slice(0, 30000)}`, // Use a larger slice of text
            },
          ],
        });

        const content = message.content[0];
        if (content.type === 'text') {
          const jsonString = content.text
            .trim()
            .replace(/^```json\n/, '')
            .replace(/\n```$/, '');
          try {
            flashcards = JSON.parse(jsonString);
            console.log('pdf-flashcards: successfully parsed flashcards');
          } catch (jsonError) {
            console.error('Error parsing flashcards JSON:', jsonError);
            throw new Error('Failed to parse flashcards from LLM response.');
          }
        }
      } catch (err) {
        console.error('Error generating flashcards with Claude:', err);
        return NextResponse.json(
          {
            error: 'Failed to generate flashcards',
            details: err instanceof Error ? err.message : 'Unknown error',
          },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Flashcard generation is not configured. CLAUDE_API_KEY is missing.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      flashcards,
    });
  } catch (error) {
    console.error('Error processing PDF for flashcards:', error);
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
    }

    return NextResponse.json(
      {
        error: 'Failed to process PDF for flashcards',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack:
          process.env.NODE_ENV === 'development' && error instanceof Error
            ? error.stack
            : undefined,
      },
      { status: 500 }
    );
  }
}
