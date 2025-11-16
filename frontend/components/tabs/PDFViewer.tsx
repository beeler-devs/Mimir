'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button } from '@/components/common';
import {
  Upload,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  FileText,
  MessageSquarePlus,
} from 'lucide-react';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

interface PDFViewerProps {
  pdfUrl?: string;
  fileName?: string;
  onUpload: (file: File, url: string, metadata: { size: number; pageCount: number }) => void;
  onSummaryReady?: (summary: string) => void;
  onAddToChat?: (text: string) => void;
}

/**
 * PDF Viewer Component
 * Allows users to upload, view, navigate, zoom, and interact with PDF documents.
 * Features:
 * - File upload
 * - Page navigation
 * - Zoom controls (50% to 300%)
 * - Fullscreen mode
 * - Download PDF
 * - Text selection with "Add to chat" popup
 * - Automatic PDF summarization (stubbed)
 */
export const PDFViewer: React.FC<PDFViewerProps> = ({
  pdfUrl,
  fileName,
  onUpload,
  onSummaryReady,
  onAddToChat,
}) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedText, setSelectedText] = useState<string>('');
  const [showPopup, setShowPopup] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });

  const onDocumentLoadSuccess = useCallback(({ numPages: pages }: { numPages: number }) => {
    setNumPages(pages);

    // TODO: Extract text from PDF and send for summarization
    // This would call an API endpoint to analyze the PDF with Claude
    if (onSummaryReady) {
      // Placeholder for actual PDF analysis
      setTimeout(() => {
        onSummaryReady(`PDF uploaded: ${fileName || 'document.pdf'} with ${pages} pages.`);
      }, 1000);
    }
  }, [fileName, onSummaryReady]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      const url = URL.createObjectURL(file);

      // We'll get the page count in onDocumentLoadSuccess
      // For now, pass basic metadata
      onUpload(file, url, {
        size: file.size,
        pageCount: 0, // Will be updated when PDF loads
      });
    }
  };

  const handleDownload = () => {
    if (pdfUrl) {
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = fileName || 'document.pdf';
      link.click();
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.25, 3.0));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.25, 0.5));
  };

  const handleNextPage = () => {
    setCurrentPage(prev => Math.min(prev + 1, numPages));
  };

  const handlePrevPage = () => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  };

  // Handle text selection
  const handleTextSelection = () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();

    if (text && text.length > 0) {
      setSelectedText(text);

      // Get selection position for popup
      const range = selection?.getRangeAt(0);
      const rect = range?.getBoundingClientRect();

      if (rect) {
        setPopupPosition({
          x: rect.left + rect.width / 2,
          y: rect.top - 10,
        });
        setShowPopup(true);
      }
    } else {
      setShowPopup(false);
    }
  };

  const handleAddToChat = () => {
    if (selectedText && onAddToChat) {
      onAddToChat(selectedText);
      setShowPopup(false);
      setSelectedText('');
      window.getSelection()?.removeAllRanges();
    }
  };

  // Listen for text selection changes
  useEffect(() => {
    document.addEventListener('mouseup', handleTextSelection);
    return () => {
      document.removeEventListener('mouseup', handleTextSelection);
    };
  }, []);

  if (!pdfUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 bg-background">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <FileText className="w-16 h-16" />
          <h3 className="text-lg font-medium">No PDF loaded</h3>
          <p className="text-sm">Upload a PDF to get started</p>
        </div>
        <label htmlFor="pdf-upload" className="inline-block">
          <span className="inline-flex items-center justify-center font-medium rounded-lg transition-colors focus-visible:outline-none bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 cursor-pointer">
            <Upload className="w-4 h-4 mr-2" />
            Upload PDF
          </span>
          <input
            id="pdf-upload"
            type="file"
            accept="application/pdf"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col h-full ${
        isFullscreen ? 'fixed inset-0 z-50 bg-background' : ''
      }`}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 p-3 border-b bg-background/95 backdrop-blur">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium truncate max-w-[200px]">
            {fileName || 'document.pdf'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Page Navigation */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrevPage}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm px-2">
            {currentPage} / {numPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNextPage}
            disabled={currentPage >= numPages}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          {/* Zoom Controls */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomOut}
            disabled={scale <= 0.5}
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-sm px-2 min-w-[4rem] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomIn}
            disabled={scale >= 3.0}
          >
            <ZoomIn className="w-4 h-4" />
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          {/* Action Buttons */}
          <Button variant="ghost" size="sm" onClick={handleDownload}>
            <Download className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={toggleFullscreen}>
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          {/* Change PDF */}
          <label htmlFor="pdf-upload-change" className="inline-block">
            <span className="inline-flex items-center justify-center font-medium rounded-lg transition-colors focus-visible:outline-none hover:bg-accent hover:text-accent-foreground h-8 px-3 text-sm cursor-pointer">
              <Upload className="w-4 h-4" />
            </span>
            <input
              id="pdf-upload-change"
              type="file"
              accept="application/pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* PDF Display */}
      <div className="flex-1 overflow-auto bg-muted/30 flex items-start justify-center p-8">
        <div className="shadow-2xl">
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            className="pdf-document"
          >
            <Page
              pageNumber={currentPage}
              scale={scale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
            />
          </Document>
        </div>
      </div>

      {/* Text Selection Popup */}
      {showPopup && (
        <div
          className="fixed z-50 px-3 py-2 bg-popover border rounded-lg shadow-lg animate-in fade-in zoom-in-95"
          style={{
            left: `${popupPosition.x}px`,
            top: `${popupPosition.y}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <Button
            size="sm"
            onClick={handleAddToChat}
            className="gap-2"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Add to chat
          </Button>
        </div>
      )}
    </div>
  );
};
