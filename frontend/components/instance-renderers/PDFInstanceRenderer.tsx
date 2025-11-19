'use client';

import React, { forwardRef } from 'react';
import dynamic from 'next/dynamic';
import type { PDFInstance } from '@/lib/types';
import { PDFViewerRef } from '@/components/tabs/PDFViewer';

// Dynamically import PDFViewer with SSR disabled to avoid DOMMatrix issues
const PDFViewer = dynamic(
  () => import('@/components/tabs/PDFViewer').then((mod) => ({ default: mod.PDFViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
);

interface PDFUploadMetadata {
  size: number;
  pageCount: number;
  summary: string;
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
    creationDate?: string;
    modificationDate?: string;
  };
  fullText: string;
  storagePath: string;
}

interface PDFInstanceRendererProps {
  instance: PDFInstance;
  onUpload: (file: File, url: string, metadata: PDFUploadMetadata) => void;
  onSummaryReady: (summary: string) => void;
  onAddToChat: (text: string) => void;
}

export const PDFInstanceRenderer = forwardRef<PDFViewerRef, PDFInstanceRendererProps>(
  ({ instance, onUpload, onSummaryReady, onAddToChat }, ref) => {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-shrink-0 border-b border-border px-4 py-2 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight">{instance.title}</h2>
          <div className="text-sm font-medium text-muted-foreground">PDF</div>
        </div>
        <div className="flex-1 overflow-hidden">
          <PDFViewer
            ref={ref}
            pdfUrl={instance.data.pdfUrl}
            fileName={instance.data.fileName}
            metadata={instance.data.metadata}
            fullText={instance.data.fullText}
            onUpload={onUpload}
            onSummaryReady={onSummaryReady}
            onAddToChat={onAddToChat}
          />
        </div>
      </div>
    );
  }
);

PDFInstanceRenderer.displayName = 'PDFInstanceRenderer';
