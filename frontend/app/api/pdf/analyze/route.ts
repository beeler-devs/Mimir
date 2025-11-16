import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY || '',
});

export const runtime = 'nodejs';
export const maxDuration = 60; // allow longer parsing for big PDFs

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Log basic file info up front
    console.log('pdf-analyze: received file', {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    // Read data
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    // Configure pdfjs for Node.js environment
    // Disable worker and browser-specific features
    const loadingTask = pdfjsLib.getDocument({
      data,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    } as any);

    const pdf = await loadingTask.promise;
    console.log('pdf-analyze: document loaded', { pages: pdf.numPages });

    // Extract text page by page
    let combinedText = '';
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((item: any) => (item && item.str ? item.str : ''))
        .join(' ');
      combinedText += pageText + '\n';
    }

    const textLength = combinedText.length;
    console.log('pdf-analyze: text extracted', { textLength });

    const fullText = combinedText.slice(0, 50000);
    const cleanText = fullText
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Metadata
    let infoResult: any = {};
    try {
      infoResult = await pdf.getMetadata();
      console.log('pdf-analyze: metadata extracted', {
        keys: Object.keys(infoResult.info || {}),
      });
    } catch (err) {
      console.warn('pdf-analyze: getMetadata failed', err);
    }

    await pdf.cleanup();

    const metadata = {
      pages: pdf.numPages,
      info: infoResult.info || {},
      title: (infoResult.info as any)?.Title || file.name,
      author: (infoResult.info as any)?.Author || 'Unknown',
      subject: (infoResult.info as any)?.Subject || '',
      keywords: (infoResult.info as any)?.Keywords || '',
      creationDate: (infoResult.info as any)?.CreationDate || '',
      modificationDate:
        (infoResult.info as any)?.ModDate ||
        (infoResult.info as any)?.ModificationDate ||
        '',
    };

    // Generate summary (if configured)
    let summary = '';
    if (process.env.CLAUDE_API_KEY) {
      try {
        const message = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: `Please analyze this PDF document and provide a comprehensive summary. Include:
1. Main topic/subject
2. Key points and findings
3. Document structure (if applicable)
4. Any notable conclusions or takeaways

PDF Title: ${metadata.title}
Author: ${metadata.author}
Pages: ${metadata.pages}

Content:
${cleanText.slice(0, 20000)}

Provide a clear, structured summary in 3-5 paragraphs.`,
            },
          ],
        });

        const content = message.content[0];
        if (content.type === 'text') {
          summary = content.text;
        }
      } catch (err) {
        console.error('Error generating summary with Claude:', err);
        summary = `Failed to generate AI summary. Document contains ${metadata.pages} pages about: ${metadata.subject || metadata.title}`;
      }
    } else {
      summary = `PDF uploaded successfully. This document has ${metadata.pages} pages. Title: ${metadata.title}. To enable AI-powered analysis, configure the CLAUDE_API_KEY environment variable.`;
    }

    return NextResponse.json({
      success: true,
      summary,
      metadata,
      fullText: cleanText.slice(0, 5000), // Return first 5000 chars for reference
      textLength,
    });
  } catch (error) {
    console.error('Error analyzing PDF:', error);
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
    }

    return NextResponse.json(
      {
        error: 'Failed to analyze PDF',
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
