'use client';

import React, { useState, useRef, useImperativeHandle, forwardRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import '@excalidraw/excalidraw/index.css';

// Dynamically import Excalidraw to avoid SSR issues
const Excalidraw = dynamic(
  async () => (await import('@excalidraw/excalidraw')).Excalidraw,
  { ssr: false }
);

// We'll dynamically import exportToCanvas when needed

export interface AnnotateCanvasRef {
  exportCanvasAsImage: () => Promise<string>;
  exportCanvasFromState: (state: { elements: any[]; appState: any; files: any }) => Promise<string>;
  openPdfUpload: () => void;
  exportAnnotatedPdf: () => void;
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
 * Annotation canvas using Excalidraw for PDF annotations and drawing
 */
export const AnnotateCanvas = forwardRef<AnnotateCanvasRef, AnnotateCanvasProps>((props, ref) => {
  const { initialData, onStateChange } = props;
  const excalidrawRef = useRef<any>(null);
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

  const handleUploadPDF = () => {
    // Stub - will be implemented with file upload
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        console.log('PDF uploaded:', file.name);
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

  // Load initial data when it changes (e.g., when switching instances)
  useEffect(() => {
    if (initialData) {
      try {
        // Validate state structure
        if (initialData.elements && !Array.isArray(initialData.elements)) {
          console.warn('Invalid excalidrawState: elements must be an array');
          setElements([]);
        } else {
          setElements(initialData.elements || []);
        }
        
        // Sanitize appState to ensure collaborators is always an array
        // Always ensure appState is an object (never null) with collaborators array
        const sanitizedAppState = initialData.appState ? {
          ...initialData.appState,
          collaborators: Array.isArray(initialData.appState.collaborators)
            ? initialData.appState.collaborators
            : [],
        } : { collaborators: [] };
        setAppState(sanitizedAppState);
        setFiles(initialData.files || {});
        
        // Update Excalidraw with initial state if API is available
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
        // Reset to empty state on error
        setElements([]);
        setAppState(null);
        setFiles({});
      }
    } else {
      // Reset to empty state if no initial data
      setElements([]);
      setAppState(null);
      setFiles({});
    }
  }, [initialData]);

  // Helper function to export canvas from state
  const exportCanvasFromState = async (state: { elements: any[]; appState: any; files: any }): Promise<string> => {
    try {
      // Dynamically import Excalidraw utilities
      const excalidrawModule = await import('@excalidraw/excalidraw');
      const { exportToCanvas } = excalidrawModule;
      
      if (!exportToCanvas) {
        throw new Error('exportToCanvas not available');
      }
      
      if (!state.elements || state.elements.length === 0) {
        // Return empty canvas if no elements (with padding)
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
      
      // Filter out deleted elements before exporting
      // Excalidraw marks deleted elements with isDeleted: true
      const visibleElements = state.elements.filter((element: any) => !element.isDeleted);
      const deletedCount = state.elements.length - visibleElements.length;
      
      if (deletedCount > 0) {
        console.log(`🗑️ Filtered out ${deletedCount} deleted element(s) before export`);
      }
      
      if (visibleElements.length === 0) {
        // Return empty canvas if all elements are deleted (with padding)
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
      
      // Export to canvas at native resolution
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

      // Add padding around the canvas
      const padding = 40; // pixels on each side
      const paddedCanvas = document.createElement('canvas');
      paddedCanvas.width = canvas.width + (padding * 2);
      paddedCanvas.height = canvas.height + (padding * 2);
      
      const ctx = paddedCanvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }
      
      // Fill with white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, paddedCanvas.width, paddedCanvas.height);
      
      // Draw the original canvas with padding offset
      ctx.drawImage(canvas, padding, padding);

      // Convert padded canvas to base64 PNG
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
              
              // Debug: Log image info
              console.log('📸 Exported Canvas Image:', {
                size: base64.length,
                sizeKB: Math.round(base64.length / 1024),
                originalDimensions: `${canvas.width}x${canvas.height}`,
                paddedDimensions: `${paddedCanvas.width}x${paddedCanvas.height}`,
                padding: padding,
                scale: scale,
              });
              
              // Debug: Store full image in global variable for easy access
              (window as any).__lastExportedCanvasImage = base64;
              
              // Debug: Log image data URL for viewing
              console.log('🔗 Image Data URL preview:', base64.substring(0, 100) + '...');
              console.log('💡 To view the image, run in console:');
              console.log('   const img = document.createElement("img"); img.src = window.__lastExportedCanvasImage; img.style.maxWidth = "100%"; document.body.appendChild(img);');
              console.log('   Or copy window.__lastExportedCanvasImage and paste in browser address bar');
              
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

  // Expose export functions via ref
  useImperativeHandle(ref, () => ({
    exportCanvasAsImage,
    exportCanvasFromState,
    openPdfUpload: handleUploadPDF,
    exportAnnotatedPdf: handleExportPDF,
  }));

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Excalidraw Canvas */}
      <div className="flex-1 overflow-hidden">
        <Excalidraw
          ref={excalidrawRef}
          onChange={(newElements: any[], newAppState: any, newFiles: any) => {
            // Sanitize appState to ensure collaborators is always an array
            // Always ensure appState is an object (never null) with collaborators array
            const sanitizedAppState = newAppState ? {
              ...newAppState,
              collaborators: Array.isArray(newAppState.collaborators)
                ? newAppState.collaborators
                : [],
            } : { collaborators: [] };
            
            // Only update if state actually changed (performance optimization)
            const elementsChanged = JSON.stringify(newElements) !== JSON.stringify(elements);
            const appStateChanged = JSON.stringify(sanitizedAppState) !== JSON.stringify(appState);
            const filesChanged = JSON.stringify(newFiles) !== JSON.stringify(files);
            
            if (elementsChanged || appStateChanged || filesChanged) {
              setElements(newElements);
              setAppState(sanitizedAppState);
              setFiles(newFiles || {});
              
              // Notify parent of state change for saving
              if (onStateChange) {
                onStateChange({
                  elements: newElements,
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
    </div>
  );
});

AnnotateCanvas.displayName = 'AnnotateCanvas';
