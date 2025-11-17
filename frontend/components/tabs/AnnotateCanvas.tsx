'use client';

import React, { useState, useRef, useImperativeHandle, forwardRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import '@excalidraw/excalidraw/index.css';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { LaserPointerOverlay, PointerPosition } from '../ai/LaserPointerOverlay';
import { LiveAICoachingSystem } from '../ai/LiveAICoachingSystem';
import { LiveVoiceSynthesis } from '../ai/LiveVoiceSynthesis';
import { Bot, BotOff } from 'lucide-react';

// Dynamically import Excalidraw to avoid SSR issues
const Excalidraw = dynamic(
  async () => (await import('@excalidraw/excalidraw')).Excalidraw,
  { ssr: false }
);

export interface AnnotateCanvasRef {
  exportCanvasAsImage: () => Promise<string>;
  exportCanvasFromState: (state: { elements: any[]; appState: any; files: any }) => Promise<string>;
  openPdfUpload: () => void;
  exportAnnotatedPdf: () => void;
  setPdfFileUrl: (url: string | null) => void;
  setPdfPageNum: (pageNum: number) => void;
}

interface AnnotateCanvasProps {
  initialData?: {
    elements?: any[];
    appState?: any;
    files?: any;
  };
  onStateChange?: (state: { elements: any[]; appState: any; files: any }) => void;
}

/**
 * Enhanced Excalidraw canvas with live AI coaching
 * - Real-time monitoring of user activity
 * - Proactive AI assistance via voice, laser pointer, and canvas annotations
 * - AI can write LaTeX and markdown directly on the canvas
 */
export const AnnotateCanvas = forwardRef<AnnotateCanvasRef, AnnotateCanvasProps>((props, ref) => {
  const { initialData, onStateChange } = props;
  const excalidrawRef = useRef<any>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [elements, setElements] = useState<any[]>(initialData?.elements || []);
  const [appState, setAppState] = useState<any>(
    initialData?.appState
      ? {
          ...initialData.appState,
          collaborators: Array.isArray(initialData.appState.collaborators)
            ? initialData.appState.collaborators
            : [],
        }
      : { collaborators: [] }
  );
  const [files, setFiles] = useState<any>(initialData?.files || {});

  // PDF state
  const [pdfFileUrl, setPdfFileUrl] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pdfPageNum, setPdfPageNum] = useState(1);
  const [pdfPageCount, setPdfPageCount] = useState(0);

  // Live AI Coach state
  const [isAICoachEnabled, setIsAICoachEnabled] = useState(true);
  const [laserPosition, setLaserPosition] = useState<PointerPosition | null>(null);
  const [voiceText, setVoiceText] = useState<string | null>(null);

  // Function to load PDF document
  const loadPdfDocument = useCallback(async (url: string) => {
    try {
      const loadingTask = pdfjsLib.getDocument(url);
      const doc = await loadingTask.promise;
      setPdfDoc(doc);
      setPdfPageCount(doc.numPages);
      setPdfPageNum(1);
    } catch (error) {
      console.error("Error loading PDF:", error);
      setPdfDoc(null);
      setPdfPageCount(0);
      setPdfPageNum(1);
    }
  }, []);

  // Function to render PDF page to Excalidraw
  const renderPdfPageToExcalidraw = useCallback(async () => {
    if (!pdfDoc || !excalidrawRef.current) return;

    try {
      const page = await pdfDoc.getPage(pdfPageNum);
      const viewport = page.getViewport({ scale: 1.5 });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Could not get 2D context for canvas');
      }

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext as any).promise;

      const imageDataUrl = canvas.toDataURL('image/png');

      const excalidrawAPI = excalidrawRef.current;
      const { elements: currentElements } = excalidrawAPI.getSceneElements();

      const newElements = currentElements.filter(
        (el: any) => !(el.type === 'image' && el.customData?.isPdfBackground)
      );

      const newImageElement = {
        type: 'image',
        x: 0,
        y: 0,
        width: viewport.width,
        height: viewport.height,
        fileId: null,
        customData: { isPdfBackground: true, pageNum: pdfPageNum },
      };

      const newFiles = {
        ...files,
        [`pdf-page-${pdfPageNum}`]: {
          id: `pdf-page-${pdfPageNum}`,
          mimeType: 'image/png',
          dataURL: imageDataUrl,
          created: Date.now(),
          is(id: string) { return id === `pdf-page-${pdfPageNum}`; }
        }
      };

      excalidrawAPI.updateScene({
        elements: [...newElements, newImageElement],
        files: newFiles,
      });

      setElements([...newElements, newImageElement]);
      setFiles(newFiles);

      if (onStateChange) {
        onStateChange({
          elements: [...newElements, newImageElement],
          appState: excalidrawAPI.getAppState(),
          files: newFiles,
        });
      }

    } catch (error) {
      console.error("Failed to render PDF page to Excalidraw:", error);
    }
  }, [pdfDoc, pdfPageNum, excalidrawRef, files, onStateChange]);

  const handleUploadPDF = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const url = URL.createObjectURL(file);
        setPdfFileUrl(url);
        setPdfPageNum(1);
        console.log('PDF uploaded:', file.name);
      }
    };
    input.click();
  };

  const handleExportPDF = () => {
    console.log('Exporting annotated PDF');
    alert('PDF export will be implemented in a future update!');
  };

  // Load initial data when it changes
  useEffect(() => {
    if (initialData) {
      try {
        if (initialData.elements && !Array.isArray(initialData.elements)) {
          console.warn('Invalid excalidrawState: elements must be an array');
          setElements([]);
        } else {
          setElements(initialData.elements || []);
        }

        const sanitizedAppState = initialData.appState ? {
          ...initialData.appState,
          collaborators: Array.isArray(initialData.appState.collaborators)
            ? initialData.appState.collaborators
            : [],
        } : { collaborators: [] };
        setAppState(sanitizedAppState);
        setFiles(initialData.files || {});

        if (excalidrawRef.current?.updateScene) {
          try {
            const safeAppState = initialData.appState ? {
              ...initialData.appState,
              collaborators: Array.isArray(initialData.appState.collaborators)
                ? initialData.appState.collaborators
                : [],
            } : {
              collaborators: [],
            };

            excalidrawRef.current.updateScene({
              elements: initialData.elements || [],
              appState: safeAppState,
            });
          } catch (error) {
            console.error('Failed to update Excalidraw scene:', error);
          }
        }
      } catch (error) {
        console.error('Error loading excalidrawState:', error);
        setElements([]);
        setAppState(null);
        setFiles({});
      }
    } else {
      setElements([]);
      setAppState(null);
      setFiles({});
    }
  }, [initialData]);

  // Effect to load PDF document
  useEffect(() => {
    if (pdfFileUrl) {
      loadPdfDocument(pdfFileUrl);
    } else {
      setPdfDoc(null);
      setPdfPageCount(0);
      setPdfPageNum(1);
    }
  }, [pdfFileUrl, loadPdfDocument]);

  // Effect to render PDF page
  useEffect(() => {
    if (pdfDoc) {
      renderPdfPageToExcalidraw();
    }
  }, [pdfDoc, pdfPageNum, renderPdfPageToExcalidraw]);

  // Helper to export canvas from state
  const exportCanvasFromState = async (state: { elements: any[]; appState: any; files: any }): Promise<string> => {
    try {
      const excalidrawModule = await import('@excalidraw/excalidraw');
      const { exportToCanvas } = excalidrawModule;

      if (!exportToCanvas) {
        throw new Error('exportToCanvas not available');
      }

      if (!state.elements || state.elements.length === 0) {
        const padding = 40;
        const canvas = document.createElement('canvas');
        canvas.width = 800 + (padding * 2);
        canvas.height = 600 + (padding * 2);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        return canvas.toDataURL('image/png');
      }

      const visibleElements = state.elements.filter((element: any) => !element.isDeleted);
      const deletedCount = state.elements.length - visibleElements.length;

      if (deletedCount > 0) {
        console.log(`🗑️ Filtered out ${deletedCount} deleted element(s) before export`);
      }

      if (visibleElements.length === 0) {
        const padding = 40;
        const canvas = document.createElement('canvas');
        canvas.width = 800 + (padding * 2);
        canvas.height = 600 + (padding * 2);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        return canvas.toDataURL('image/png');
      }

      const scale = 1;
      const canvas = await exportToCanvas({
        elements: visibleElements,
        appState: state.appState || {},
        files: state.files || {},
        getDimensions: (width: number, height: number) => ({
          width: width * scale,
          height: height * scale
        }),
      });

      const padding = 40;
      const paddedCanvas = document.createElement('canvas');
      paddedCanvas.width = canvas.width + (padding * 2);
      paddedCanvas.height = canvas.height + (padding * 2);

      const ctx = paddedCanvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, paddedCanvas.width, paddedCanvas.height);
      ctx.drawImage(canvas, padding, padding);

      return new Promise((resolve, reject) => {
        paddedCanvas.toBlob(
          (blob: Blob | null) => {
            if (!blob) {
              reject(new Error('Failed to export canvas'));
              return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = reader.result as string;
              console.log('📸 Exported Canvas Image:', {
                size: base64.length,
                sizeKB: Math.round(base64.length / 1024),
                paddedDimensions: `${paddedCanvas.width}x${paddedCanvas.height}`,
              });
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          },
          'image/png',
          1.0
        );
      });
    } catch (error) {
      console.error('Error exporting canvas from state:', error);
      throw error;
    }
  };

  const exportCanvasAsImage = async (): Promise<string> => {
    return exportCanvasFromState({ elements, appState, files });
  };

  // AI Coach callback: Add annotation to canvas
  const handleAddAnnotation = useCallback((annotation: {
    text: string;
    x: number;
    y: number;
    type: string;
  }) => {
    if (!excalidrawRef.current) return;

    const api = excalidrawRef.current;

    // Create a text element for the annotation
    // Excalidraw supports LaTeX rendering for text elements
    const textElement = {
      type: 'text',
      x: annotation.x,
      y: annotation.y,
      text: annotation.text,
      fontSize: 16,
      fontFamily: 1,
      textAlign: 'left',
      verticalAlign: 'top',
      strokeColor: annotation.type === 'hint' ? '#10b981' : '#3b82f6', // Green for hints, blue for explanations
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 1,
      roughness: 0,
      opacity: 100,
      width: 400,
      height: 40,
      seed: Math.floor(Math.random() * 1000000),
      version: 1,
      versionNonce: Math.floor(Math.random() * 1000000),
      isDeleted: false,
      customData: {
        isAIGenerated: true,
        annotationType: annotation.type,
      },
    };

    // Add to canvas
    const currentElements = api.getSceneElements?.() || elements;
    api.updateScene({
      elements: [...currentElements, textElement],
    });

    console.log('✍️ AI annotation added to canvas:', annotation.text);
  }, [excalidrawRef, elements]);

  // AI Coach callback: Speak text
  const handleSpeakText = useCallback((text: string) => {
    setVoiceText(text);
    console.log('🗣️ AI speaking:', text);
  }, []);

  // AI Coach callback: Update laser position
  const handleLaserPositionChange = useCallback((position: PointerPosition | null) => {
    setLaserPosition(position);
  }, []);

  // Expose functions via ref
  useImperativeHandle(ref, () => ({
    exportCanvasAsImage,
    exportCanvasFromState,
    openPdfUpload: handleUploadPDF,
    exportAnnotatedPdf: handleExportPDF,
    setPdfFileUrl,
    setPdfPageNum,
  }));

  return (
    <div className="h-full flex flex-col bg-background relative">
      {/* AI Coach Toggle */}
      <div className="absolute top-4 right-4 z-40 flex items-center gap-2">
        <button
          onClick={() => setIsAICoachEnabled(!isAICoachEnabled)}
          className={`p-3 rounded-full shadow-lg transition-all ${
            isAICoachEnabled
              ? 'bg-green-500 text-white hover:bg-green-600'
              : 'bg-gray-300 text-gray-600 hover:bg-gray-400'
          }`}
          title={isAICoachEnabled ? 'AI Coach: ON (will help proactively)' : 'AI Coach: OFF'}
        >
          {isAICoachEnabled ? <Bot className="w-6 h-6" /> : <BotOff className="w-6 h-6" />}
        </button>
        {isAICoachEnabled && (
          <div className="bg-green-500 text-white text-xs px-2 py-1 rounded-full shadow-md">
            AI Watching
          </div>
        )}
      </div>

      {/* PDF Navigation */}
      {pdfDoc && (
        <div className="flex items-center justify-center gap-4 p-2 border-b border-border">
          <button
            onClick={() => setPdfPageNum((prev) => Math.max(1, prev - 1))}
            disabled={pdfPageNum <= 1}
            className="px-3 py-1 rounded-md bg-muted hover:bg-muted-foreground/20 text-sm disabled:opacity-50"
          >
            &larr; Previous
          </button>
          <span className="text-sm font-medium">
            Page {pdfPageNum} of {pdfPageCount}
          </span>
          <button
            onClick={() => setPdfPageNum((prev) => Math.min(pdfPageCount, prev + 1))}
            disabled={pdfPageNum >= pdfPageCount}
            className="px-3 py-1 rounded-md bg-muted hover:bg-muted-foreground/20 text-sm disabled:opacity-50"
          >
            Next &rarr;
          </button>
        </div>
      )}

      {/* Excalidraw Canvas */}
      <div ref={canvasContainerRef} className="flex-1 overflow-hidden relative">
        {/* Laser Pointer Overlay */}
        <LaserPointerOverlay
          position={laserPosition}
          isActive={laserPosition !== null}
          canvasRef={canvasContainerRef}
        />

        <Excalidraw
          excalidrawAPI={(api) => {
            excalidrawRef.current = api;
          }}
          onChange={(newElements: readonly any[], newAppState: any, newFiles: any) => {
            const sanitizedAppState = newAppState ? {
              ...newAppState,
              collaborators: Array.isArray(newAppState.collaborators)
                ? newAppState.collaborators
                : [],
            } : { collaborators: [] };

            const elementsChanged = JSON.stringify(newElements) !== JSON.stringify(elements);
            const appStateChanged = JSON.stringify(sanitizedAppState) !== JSON.stringify(appState);
            const filesChanged = JSON.stringify(newFiles) !== JSON.stringify(files);

            if (elementsChanged || appStateChanged || filesChanged) {
              setElements([...newElements]);
              setAppState(sanitizedAppState);
              setFiles(newFiles || {});

              if (onStateChange) {
                onStateChange({
                  elements: [...newElements],
                  appState: sanitizedAppState,
                  files: newFiles || {},
                });
              }
            }
          }}
          initialData={{
            elements: initialData?.elements || [],
            appState: initialData?.appState ? {
              ...initialData.appState,
              collaborators: Array.isArray(initialData.appState.collaborators)
                ? initialData.appState.collaborators
                : [],
            } : {
              collaborators: [],
            },
          }}
          theme="light"
          UIOptions={{
            canvasActions: {
              loadScene: false,
            },
          }}
        />
      </div>

      {/* Live AI Coaching System (background component) */}
      <LiveAICoachingSystem
        excalidrawRef={excalidrawRef}
        elements={elements}
        onLaserPositionChange={handleLaserPositionChange}
        onAddAnnotation={handleAddAnnotation}
        onSpeakText={handleSpeakText}
        isEnabled={isAICoachEnabled}
      />

      {/* Live Voice Synthesis (background component) */}
      <LiveVoiceSynthesis
        text={voiceText}
        onComplete={() => setVoiceText(null)}
      />
    </div>
  );
});

AnnotateCanvas.displayName = 'AnnotateCanvas';
