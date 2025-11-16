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
  Search,
  X,
  Loader2,
  Info,
} from 'lucide-react';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

interface PDFMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creationDate?: string;
  modificationDate?: string;
}

interface PDFViewerProps {
  pdfUrl?: string;
  fileName?: string;
  metadata?: PDFMetadata;
  fullText?: string;
  onUpload: (file: File, url: string, metadata: { size: number; pageCount: number; summary: string; metadata: PDFMetadata; fullText: string }) => void;
  onSummaryReady?: (summary: string) => void;
  onAddToChat?: (text: string) => void;
}

export interface PDFViewerRef {
  getCurrentPageImage: () => Promise<string | null>;
  getCurrentPage: () => number;
}

/**
 * Enhanced PDF Viewer Component
 * Features:
 * - File upload with Supabase Storage integration
 * - AI-powered analysis and summarization
 * - Enhanced metadata extraction
 * - Full-text search with highlighting
 * - Page navigation, zoom, fullscreen
 * - Text selection with "Add to chat"
 * - Page capture for AI context
 */
export const PDFViewer = React.forwardRef<PDFViewerRef, PDFViewerProps>(({
  pdfUrl,
  fileName,
  metadata,
  fullText,
  onUpload,
  onSummaryReady,
  onAddToChat,
}, ref) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedText, setSelectedText] = useState<string>('');
  const [showPopup, setShowPopup] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const pageRef = React.useRef<HTMLDivElement>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);

  // Metadata panel
  const [showMetadata, setShowMetadata] = useState(false);

  // Expose methods via ref
  React.useImperativeHandle(ref, () => ({
    getCurrentPageImage: async () => {
      if (!pageRef.current) return null;

      try {
        // Import html2canvas dynamically
        const html2canvas = (await import('html2canvas')).default;

        // Capture the PDF page
        const canvas = await html2canvas(pageRef.current, {
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
        });

        // Convert to base64
        return canvas.toDataURL('image/png');
      } catch (error) {
        console.error('Failed to capture page image:', error);
        return null;
      }
    },
    getCurrentPage: () => currentPage,
  }));

  const onDocumentLoadSuccess = useCallback(({ numPages: pages }: { numPages: number }) => {
    setNumPages(pages);
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || file.type !== 'application/pdf') return;

    setUploading(true);
    setAnalyzing(true);

    try {
      // Create blob URL for immediate display
      const blobUrl = URL.createObjectURL(file);

      // Analyze PDF with Claude
      const analyzeFormData = new FormData();
      analyzeFormData.append('file', file);

      const analyzeResponse = await fetch('/api/pdf/analyze', {
        method: 'POST',
        body: analyzeFormData,
      });

      if (!analyzeResponse.ok) {
        throw new Error('Failed to analyze PDF');
      }

      const analyzeData = await analyzeResponse.json();

      // Call onUpload with all the extracted data
      onUpload(file, blobUrl, {
        size: file.size,
        pageCount: analyzeData.metadata.pages,
        summary: analyzeData.summary,
        metadata: {
          title: analyzeData.metadata.title,
          author: analyzeData.metadata.author,
          subject: analyzeData.metadata.subject,
          keywords: analyzeData.metadata.keywords,
          creationDate: analyzeData.metadata.creationDate,
          modificationDate: analyzeData.metadata.modificationDate,
        },
        fullText: analyzeData.fullText,
      });

      if (onSummaryReady) {
        onSummaryReady(analyzeData.summary);
      }
    } catch (error) {
      console.error('Error uploading/analyzing PDF:', error);
      alert('Failed to process PDF. Please try again.');
    } finally {
      setUploading(false);
      setAnalyzing(false);
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

  // Text selection for chat
  const handleTextSelection = () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();

    if (text && text.length > 0) {
      setSelectedText(text);
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

  // Search functionality
  const handleSearch = useCallback(() => {
    if (!searchQuery || !fullText) {
      setSearchResults([]);
      return;
    }

    const query = searchQuery.toLowerCase();
    const text = fullText.toLowerCase();
    const matches: number[] = [];

    let index = text.indexOf(query);
    while (index !== -1) {
      matches.push(index);
      index = text.indexOf(query, index + 1);
    }

    setSearchResults(matches);
    setCurrentSearchIndex(0);
  }, [searchQuery, fullText]);

  const handleNextSearchResult = () => {
    if (searchResults.length > 0) {
      setCurrentSearchIndex((prev) => (prev + 1) % searchResults.length);
    }
  };

  const handlePrevSearchResult = () => {
    if (searchResults.length > 0) {
      setCurrentSearchIndex((prev) => (prev - 1 + searchResults.length) % searchResults.length);
    }
  };

  useEffect(() => {
    document.addEventListener('mouseup', handleTextSelection);
    return () => {
      document.removeEventListener('mouseup', handleTextSelection);
    };
  }, []);

  useEffect(() => {
    handleSearch();
  }, [handleSearch]);

  if (!pdfUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 bg-background">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <FileText className="w-16 h-16" />
          <h3 className="text-lg font-medium">No PDF loaded</h3>
          <p className="text-sm">Upload a PDF to get started with AI-powered analysis</p>
        </div>
        <label htmlFor="pdf-upload" className="inline-block">
          <span className="inline-flex items-center justify-center font-medium rounded-lg transition-colors focus-visible:outline-none bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 cursor-pointer disabled:opacity-50">
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {analyzing ? 'Analyzing...' : 'Uploading...'}
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload PDF
              </>
            )}
          </span>
          <input
            id="pdf-upload"
            type="file"
            accept="application/pdf"
            onChange={handleFileUpload}
            className="hidden"
            disabled={uploading}
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
            {metadata?.title || fileName || 'document.pdf'}
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

          {/* Search */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSearch(!showSearch)}
            className={showSearch ? 'bg-accent' : ''}
          >
            <Search className="w-4 h-4" />
          </Button>

          {/* Metadata */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowMetadata(!showMetadata)}
            className={showMetadata ? 'bg-accent' : ''}
          >
            <Info className="w-4 h-4" />
          </Button>

          {/* Download */}
          <Button variant="ghost" size="sm" onClick={handleDownload}>
            <Download className="w-4 h-4" />
          </Button>

          {/* Fullscreen */}
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
              disabled={uploading}
            />
          </label>
        </div>
      </div>

      {/* Search Bar */}
      {showSearch && (
        <div className="flex items-center gap-2 p-3 border-b bg-muted/30">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search in PDF..."
            className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {searchResults.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {currentSearchIndex + 1} / {searchResults.length}
              </span>
              <Button variant="ghost" size="sm" onClick={handlePrevSearchResult}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleNextSearchResult}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={() => setShowSearch(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Metadata Panel */}
      {showMetadata && metadata && (
        <div className="p-4 border-b bg-muted/30 text-sm space-y-2">
          <h4 className="font-semibold">Document Information</h4>
          <div className="grid grid-cols-2 gap-2">
            {metadata.title && (
              <div>
                <span className="text-muted-foreground">Title:</span>
                <p className="font-medium">{metadata.title}</p>
              </div>
            )}
            {metadata.author && (
              <div>
                <span className="text-muted-foreground">Author:</span>
                <p>{metadata.author}</p>
              </div>
            )}
            {metadata.subject && (
              <div>
                <span className="text-muted-foreground">Subject:</span>
                <p>{metadata.subject}</p>
              </div>
            )}
            {metadata.keywords && (
              <div>
                <span className="text-muted-foreground">Keywords:</span>
                <p>{metadata.keywords}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PDF Display */}
      <div className="flex-1 overflow-auto bg-muted/30 flex items-start justify-center p-8">
        <div className="shadow-2xl" ref={pageRef}>
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
});

PDFViewer.displayName = 'PDFViewer';
