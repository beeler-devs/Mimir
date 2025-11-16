import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

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

    // Dynamically import pdf-parse to avoid build-time issues with pdfjs-dist
    const pdfParseModule = await import('pdf-parse') as any;
    const pdfParse = pdfParseModule.default || pdfParseModule;
    
    // Extract text and metadata from PDF
    const pdfData = await pdfParse(buffer);

    const metadata = {
      pages: pdfData.numpages,
      info: pdfData.info || {},
      title: pdfData.info?.Title || file.name,
      author: pdfData.info?.Author || 'Unknown',
      subject: pdfData.info?.Subject || '',
      keywords: pdfData.info?.Keywords || '',
      creationDate: pdfData.info?.CreationDate || '',
      modificationDate: pdfData.info?.ModDate || '',
    };

    // Get full text (limit to 50,000 characters for processing)
    const fullText = pdfData.text.slice(0, 50000);

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
      textLength: pdfData.text.length,
    });
  } catch (error) {
    console.error('Error analyzing PDF:', error);
    return NextResponse.json(
      {
        error: 'Failed to analyze PDF',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
