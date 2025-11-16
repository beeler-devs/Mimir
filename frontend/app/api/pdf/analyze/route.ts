import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createRequire } from 'module';

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY || '',
});

export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds for longer PDFs

/**
 * POST /api/pdf/analyze
 * Extracts text from a PDF and generates a comprehensive summary using Claude
 *
 * Request body:
 * - pdfData: ArrayBuffer of the PDF file
 * - fileName: string (optional)
 *
 * Response:
 * - summary: string - AI-generated summary
 * - metadata: object - PDF metadata (pages, title, author, etc.)
 * - fullText: string - Complete extracted text (first 50,000 chars)
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Prevent pdf.js from attempting to spawn a worker in the API route
    // (Turbopack was failing to locate the worker chunk). This forces
    // pdf.js to run in "no worker" mode.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).PDFJS_DISABLE_WORKER = true;
    process.env.PDFJS_DISABLE_WORKER = 'true';

    // Dynamically import pdf-parse with multiple fallbacks, and log what we got.
    const importErrors: unknown[] = [];
    const importTraces: string[] = [];
    let PDFParse: typeof import('pdf-parse')['PDFParse'] | undefined;

    // Helper to record what we tried
    const note = (label: string, mod: any) => {
      try {
        importTraces.push(`${label}: keys=${Object.keys(mod || {})}`);
      } catch {
        importTraces.push(`${label}: keys=<unavailable>`);
      }
    };

    // Attempt ESM default entry
    try {
      const mod = await import('pdf-parse');
      note('import pdf-parse', mod);
      PDFParse = (mod as any).PDFParse || (mod as any).default?.PDFParse || (mod as any).default;
    } catch (err) {
      importErrors.push(err);
    }

    // Attempt documented node export
    if (!PDFParse) {
      try {
        const mod = await import('pdf-parse/node');
        note('import pdf-parse/node', mod);
        PDFParse = (mod as any).PDFParse || (mod as any).default?.PDFParse || (mod as any).default;
      } catch (err) {
        importErrors.push(err);
      }
    }

    // Attempt deep CJS path
    if (!PDFParse) {
      try {
        const mod = await import('pdf-parse/dist/pdf-parse/cjs/index.cjs');
        note('import pdf-parse/dist/pdf-parse/cjs/index.cjs', mod);
        PDFParse = (mod as any).PDFParse || (mod as any).default?.PDFParse || (mod as any).default;
      } catch (err) {
        importErrors.push(err);
      }
    }

    // Attempt require() as last resort
    if (!PDFParse) {
      try {
        const require = createRequire(import.meta.url);
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require('pdf-parse');
        note('require pdf-parse', mod);
        PDFParse = (mod as any).PDFParse || (mod as any).default?.PDFParse || (mod as any).default;
      } catch (err) {
        importErrors.push(err);
      }
    }

    if (!PDFParse) {
      console.error('pdf-parse import attempts failed', { importTraces, importErrors });
      throw new Error('Failed to load pdf-parse (no PDFParse export found)');
    } else {
      console.log('pdf-parse import succeeded', { importTraces });
    }

    console.log('pdf-analyze: received file', {
      name: file.name,
      type: file.type,
      size: buffer.byteLength,
    });

    // Extract text and metadata from PDF using new pdf-parse v2 API
    const parser = new PDFParse({ data: buffer });
    
    // Get text content
    const textResult = await parser.getText();
    console.log('pdf-analyze: text extracted', { textLength: textResult.text?.length });
    const fullText = textResult.text.slice(0, 50000);
    
    // Get metadata
    const infoResult = await parser.getInfo();
    console.log('pdf-analyze: metadata extracted', {
      numPages: infoResult.numPages,
      info: infoResult.info,
    });
    
    // Clean up parser
    await parser.destroy();

    const metadata = {
      pages: infoResult.numPages,
      info: infoResult.info || {},
      title: infoResult.info?.Title || file.name,
      author: infoResult.info?.Author || 'Unknown',
      subject: infoResult.info?.Subject || '',
      keywords: infoResult.info?.Keywords || '',
      creationDate: infoResult.info?.CreationDate || '',
      modificationDate: infoResult.info?.ModDate || '',
    };

    // Clean up text (remove excessive whitespace, normalize line breaks)
    const cleanText = fullText
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Generate summary using Claude
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
      } catch (error) {
        console.error('Error generating summary with Claude:', error);
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
      textLength: textResult.text.length,
    });
  } catch (error) {
    console.error('Error analyzing PDF:', error);
    
    // Log full error stack for debugging
    if (error instanceof Error) {
      console.error('Error stack:', error.stack);
    }
    
    return NextResponse.json(
      {
        error: 'Failed to analyze PDF',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: process.env.NODE_ENV === 'development' && error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
