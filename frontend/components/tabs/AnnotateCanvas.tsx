'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/common';
import { Upload, Download } from 'lucide-react';
import '@excalidraw/excalidraw/index.css';

// Dynamically import Excalidraw to avoid SSR issues
const Excalidraw = dynamic(
  async () => (await import('@excalidraw/excalidraw')).Excalidraw,
  { ssr: false }
);

/**
 * Annotation canvas using Excalidraw for PDF annotations and drawing
 */
export const AnnotateCanvas: React.FC = () => {
  const [pdfUploaded, setPdfUploaded] = useState(false);

  const handleUploadPDF = () => {
    // Stub - will be implemented with file upload
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        console.log('PDF uploaded:', file.name);
        setPdfUploaded(true);
        // TODO: Process PDF and add as background to Excalidraw
      }
    };
    input.click();
  };

  const handleExportPDF = () => {
    // Stub - will be implemented with export functionality
    console.log('Exporting annotated PDF');
    alert('PDF export will be implemented in a future update!');
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold">Annotate</h2>
          <p className="text-sm text-muted-foreground">
            {pdfUploaded 
              ? 'Draw and annotate on your canvas' 
              : 'Upload a PDF or start drawing'}
          </p>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button onClick={handleUploadPDF} size="sm" variant="secondary">
            <Upload className="h-4 w-4 mr-2" />
            Upload PDF
          </Button>
          <Button onClick={handleExportPDF} size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>
      
      {/* Excalidraw Canvas */}
      <div className="flex-1 overflow-hidden">
        <Excalidraw
          theme="light"
          UIOptions={{
            canvasActions: {
              loadScene: false,
            },
          }}
        />
      </div>
    </div>
  );
};

