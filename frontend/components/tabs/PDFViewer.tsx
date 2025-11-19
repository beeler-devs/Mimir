'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button } from '@/components/common';
import { supabase } from '@/lib/supabaseClient';
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
  
  // Suppress AbortException warnings from text layer cancellation
  // This is expected behavior when navigating/unmounting
  const originalConsoleWarn = console.warn;
  console.warn = (...args) => {
    // Filter out the specific TextLayer cancellation warning
    if (
      typeof args[0] === 'string' && 
      (args[0].includes('TextLayer task cancelled') || 
       args[0].includes('AbortException'))
    ) {
      return;
    }
    originalConsoleWarn.apply(console, args);
  };
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
  onUpload: (file: File, url: string, metadata: { size: number; pageCount: number; summary: string; metadata: PDFMetadata; fullText: string; storagePath: string }) => void;
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
  
  // Refs for scroll tracking
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);

  // Metadata panel
  const [showMetadata, setShowMetadata] = useState(false);

  // Memoize PDF.js options to prevent unnecessary reloads
  const pdfOptions = useMemo(
    () => ({
      cMapUrl: `//unpkg.com/pdfjs-dist@${pdfjs.version}/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `//unpkg.com/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
    }),
    [] // Empty deps - these values never change
  );

  // Expose methods via ref
  React.useImperativeHandle(ref, () => ({
    getCurrentPageImage: async () => {
      const currentPageEl = pageRefs.current[currentPage - 1];
      if (!currentPageEl) return null;

      try {
        // Import html2canvas dynamically
        // @ts-ignore - html2canvas is a runtime dependency
        const html2canvasModule = await import('html2canvas');
        const html2canvas = html2canvasModule.default as (element: HTMLElement, options?: any) => Promise<HTMLCanvasElement>;

        // Capture the PDF page
        const canvas = await html2canvas(currentPageEl, {
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

  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);
  
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const onDocumentLoadSuccess = useCallback(({ numPages: pages }: { numPages: number }) => {
    if (!isMountedRef.current) return;
    setNumPages(pages);
    setCurrentPage(1); // Reset to page 1 on new document load
    // Initialize pageRefs array
    pageRefs.current = new Array(pages).fill(null);
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || file.type !== 'application/pdf') return;

    setUploading(true);
    setAnalyzing(true);

    try {
      // 1. Get user ID from Supabase auth
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated. Please log in to upload PDFs.');
      }

      // 2. Upload PDF to Supabase Storage
      console.log('[PDFViewer] Starting upload to Supabase Storage...');
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);
      uploadFormData.append('userId', user.id);

      const uploadResponse = await fetch('/api/pdf/upload', {
        method: 'POST',
        body: uploadFormData,
      });

      console.log('[PDFViewer] Upload response status:', uploadResponse.status);

      if (!uploadResponse.ok) {
        const uploadError = await uploadResponse.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[PDFViewer] Upload failed:', uploadError);
        throw new Error(uploadError.error || uploadError.details || `Upload failed with status ${uploadResponse.status}`);
      }

      const uploadData = await uploadResponse.json();
      console.log('[PDFViewer] Upload successful:', { url: uploadData.url, path: uploadData.path });
      const supabaseUrl = uploadData.url; // Permanent Supabase Storage URL
      const storagePath = uploadData.path;

      // 3. Analyze PDF with Claude
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

      // 4. Call onUpload with Supabase URL and storage path
      onUpload(file, supabaseUrl, {
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
        storagePath: storagePath,
      });

      if (onSummaryReady) {
        onSummaryReady(analyzeData.summary);
      }
    } catch (error) {
      console.error('Error uploading/analyzing PDF:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to process PDF. Please try again.';
      alert(errorMessage);
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

  // IntersectionObserver to track visible page
  useEffect(() => {
    if (!containerRef.current || numPages === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the page with the largest intersection ratio
        let maxRatio = 0;
        let visiblePage = currentPage;

        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            const pageNum = parseInt(
              entry.target.getAttribute('data-page-number') || '1',
              10
            );
            visiblePage = pageNum;
          }
        });

        if (maxRatio > 0) {
          setCurrentPage(visiblePage);
        }
      },
      {
        root: containerRef.current,
        threshold: [0, 0.25, 0.5, 0.75, 1.0],
      }
    );

    // Observe all page elements
    pageRefs.current.forEach((pageEl) => {
      if (pageEl) {
        observer.observe(pageEl);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [numPages, currentPage]);

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const pdfFile = files.find(file => file.type === 'application/pdf');

    if (pdfFile) {
      // Create a mock event to reuse the handleFileUpload logic
      const mockEvent = {
        target: {
          files: [pdfFile]
        }
      } as unknown as React.ChangeEvent<HTMLInputElement>;

      await handleFileUpload(mockEvent);
    }
  };

  if (!pdfUrl) {
    return (
      <div
        className={`flex flex-col items-center justify-center h-full gap-4 p-8 bg-background transition-colors ${
          isDragging ? 'bg-muted/50 border-2 border-dashed border-primary' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <FileText className="w-16 h-16" />
          <h3 className="text-lg font-medium">
            {isDragging ? 'Drop PDF here' : 'No PDF loaded'}
          </h3>
          <p className="text-sm">
            {isDragging
              ? 'Release to upload'
              : 'Upload a PDF or drag and drop to get started with AI-powered analysis'}
          </p>
        </div>
        {!isDragging && (
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
        )}
      </div>
    );
  }

  // Check for blob URLs (old instances)
  if (pdfUrl && pdfUrl.startsWith('blob:')) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 bg-background">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <FileText className="w-16 h-16 text-yellow-500" />
          <h3 className="text-lg font-medium">PDF No Longer Available</h3>
          <p className="text-sm text-center max-w-md">
            This PDF was uploaded using a temporary link that has expired.<br/>
            Please upload the PDF again to view it.
          </p>
        </div>
        <label htmlFor="pdf-upload-replace" className="inline-block">
          <span className="inline-flex items-center justify-center font-medium rounded-lg transition-colors focus-visible:outline-none bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 cursor-pointer disabled:opacity-50">
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {analyzing ? 'Analyzing...' : 'Uploading...'}
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Upload New PDF
              </>
            )}
          </span>
          <input
            id="pdf-upload-replace"
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
          {/* Page Indicator */}
          <span className="text-sm px-2 font-medium">
            Page {currentPage} of {numPages}
          </span>

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

      {/* PDF Display - Continuous Scroll */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-muted/30 flex items-start justify-center p-8 scrollbar-hide-show"
      >
        <div className="flex flex-col gap-4">
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={(error) => {
              // Silently handle abort errors
              if (error?.message?.includes('AbortException') || error?.message?.includes('cancelled')) {
                return;
              }
              console.error('PDF load error:', error);
            }}
            className="pdf-document"
            options={pdfOptions}
          >
            {Array.from({ length: numPages }, (_, index) => index + 1).map((pageNumber) => (
              <div
                key={`page-${pageNumber}`}
                ref={(el) => {
                  pageRefs.current[pageNumber - 1] = el;
                }}
                className="relative shadow-2xl mb-4 bg-white"
                data-page-number={pageNumber}
              >
                <Page
                  pageNumber={pageNumber}
                  scale={scale}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                  onRenderError={(error) => {
                    // Silently handle abort errors during rendering
                    if (error?.message?.includes('AbortException') || error?.message?.includes('cancelled')) {
                      return;
                    }
                    console.error('Page render error:', error);
                  }}
                />
                {/* Page number overlay */}
                <div className="absolute top-2 right-2 px-2 py-1 bg-black/70 text-white text-xs rounded">
                  {pageNumber}
                </div>
              </div>
            ))}
          </Document>
        </div>
      </div>

      {/* Text Selection Popup */}
      {showPopup && (
        <div
          className="fixed z-50 px-3 py-2 border rounded-lg shadow-lg animate-in fade-in zoom-in-95"
          style={{
            left: `${popupPosition.x}px`,
            top: `${popupPosition.y}px`,
            transform: 'translate(-50%, -100%)',
            backgroundColor: '#F5F5F5',
            borderRadius: '0.85rem',
            borderColor: 'var(--border)',
          }}
        >
          <button
            onClick={handleAddToChat}
            className="flex items-center gap-2 text-sm font-medium text-foreground hover:opacity-80 transition-opacity"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Ask Mimir
          </button>
        </div>
      )}
    </div>
  );
});

PDFViewer.displayName = 'PDFViewer';
