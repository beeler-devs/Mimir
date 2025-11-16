'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { WorkspaceLayout } from '@/components/layout';
import { AISidePanel, AISidePanelRef } from '@/components/ai/AISidePanel';
import { PDFStudyPanel, PDFStudyPanelRef } from '@/components/ai/PDFStudyPanel';
import { TextEditor, AnnotateCanvas } from '@/components/tabs';
import { CodeWorkspace } from '@/components/code/CodeWorkspace';
import { AnnotateCanvasRef } from '@/components/tabs/AnnotateCanvas';
import { PDFViewerRef } from '@/components/tabs/PDFViewer';
import { Button } from '@/components/common';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Upload, Download } from 'lucide-react';
import { useWorkspace } from '../../WorkspaceProvider';

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

// Dynamically import LectureViewer with SSR disabled
const LectureViewer = dynamic(
  () => import('@/components/tabs/LectureViewer').then((mod) => ({ default: mod.LectureViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
);

import type { InstanceType, CodeLanguage } from '@/lib/types';
import {
  updateInstance as updateInstanceDB,
} from '@/lib/db/instances';

function InstancePageContent() {
  const params = useParams();
  const router = useRouter();
  const routeInstanceId = params?.id as string;
  const routeInstanceType = params?.type as InstanceType;

  const {
    instances,
    setInstances,
    folders,
    activeInstance,
    setActiveInstance,
    activeInstanceId,
    loading,
    renameInstance,
    deleteInstance,
    selectInstance,
    createFolder,
    renameFolder,
    deleteFolder,
    moveFolder,
    moveInstanceToFolder,
  } = useWorkspace();

  const [localError, setLocalError] = useState<string | null>(null);
  const [saveTimeout, setSaveTimeout] = useState<NodeJS.Timeout | null>(null);
  const [contextText, setContextText] = useState<string | null>(null);

  // Refs for panel components
  const aiSidePanelRef = useRef<AISidePanelRef>(null);
  const pdfStudyPanelRef = useRef<PDFStudyPanelRef>(null);
  const annotationCanvasRef = useRef<AnnotateCanvasRef>(null);
  const pdfViewerRef = useRef<PDFViewerRef>(null);

  const effectiveInstanceId = activeInstanceId || routeInstanceId || null;

  useEffect(() => {
    if (loading) return;
    if (routeInstanceId && !activeInstance) {
      setLocalError('Instance not found');
      return;
    }
    if (routeInstanceType && activeInstance && activeInstance.type !== routeInstanceType) {
      setLocalError('Instance type mismatch');
      return;
    }
    setLocalError(null);
  }, [loading, activeInstance, routeInstanceId, routeInstanceType]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Command+Shift+O: New chat
      if (cmdOrCtrl && e.key === 'O' && e.shiftKey) {
        e.preventDefault();
        handleCreateNewChat();
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeInstance]);

  const handleRename = async (id: string, title: string) => {
    await renameInstance(id, title);
  };

  const handleDelete = async (id: string) => {
    await deleteInstance(id);
  };

  const handleSelect = (id: string) => {
    selectInstance(id);
  };

  // Debounced save function
  const debouncedSave = useCallback(
    (instanceId: string, data: Record<string, unknown>) => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }

      const timeout = setTimeout(async () => {
        try {
          await updateInstanceDB(instanceId, { data });
        } catch (error) {
          console.error('Failed to save instance:', error);
        }
      }, 2000); // 2 second debounce

      setSaveTimeout(timeout);
    },
    [saveTimeout]
  );

  const updateTextContent = (value: string) => {
    if (!activeInstance || activeInstance.type !== 'text' || !effectiveInstanceId) return;
    
    // Update UI immediately
    const updatedInstance = { ...activeInstance, data: { content: value } };
    setActiveInstance(updatedInstance);
    setInstances((prev) =>
      prev.map((instance) =>
        instance.id === effectiveInstanceId ? updatedInstance : instance
      )
    );

    // Debounced save to database
    debouncedSave(effectiveInstanceId, { content: value });
  };

  const updateCode = (value: string) => {
    if (!activeInstance || activeInstance.type !== 'code' || !effectiveInstanceId) return;

    // Update UI immediately
    const updatedInstance = { 
      ...activeInstance, 
      data: { ...activeInstance.data, code: value } 
    };
    setActiveInstance(updatedInstance);
    setInstances((prev) =>
      prev.map((instance) =>
        instance.id === effectiveInstanceId ? updatedInstance : instance
      )
    );

    // Debounced save to database
    debouncedSave(effectiveInstanceId, { 
      language: activeInstance.data.language, 
      code: value 
    });
  };

  const updateLanguage = async (language: CodeLanguage) => {
    if (!activeInstance || activeInstance.type !== 'code' || !effectiveInstanceId) return;

    // Update UI immediately
    const updatedInstance = {
      ...activeInstance,
      data: { ...activeInstance.data, language }
    };
    setActiveInstance(updatedInstance);
    setInstances((prev) =>
      prev.map((instance) =>
        instance.id === effectiveInstanceId ? updatedInstance : instance
      )
    );

    // Save immediately (no debounce for language changes)
    try {
      await updateInstanceDB(effectiveInstanceId, {
        data: { language, code: activeInstance.data.code },
      });
    } catch (error) {
      console.error('Failed to update language:', error);
    }
  };

  const updateAnnotationState = (state: { elements: any[]; appState: any; files: any }) => {
    if (!activeInstance || activeInstance.type !== 'annotate' || !effectiveInstanceId) return;

    // Update UI immediately
    const updatedInstance = {
      ...activeInstance,
      data: { excalidrawState: state }
    };
    setActiveInstance(updatedInstance);
    setInstances((prev) =>
      prev.map((instance) =>
        instance.id === effectiveInstanceId ? updatedInstance : instance
      )
    );

    // Debounced save to database
    debouncedSave(effectiveInstanceId, { excalidrawState: state });
  };

  const triggerAnnotationUpload = () => {
    annotationCanvasRef.current?.openPdfUpload();
  };

  const triggerAnnotationExport = () => {
    annotationCanvasRef.current?.exportAnnotatedPdf();
  };

  const handlePDFUpload = async (
    file: File,
    url: string,
    metadata: {
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
  ) => {
    if (!activeInstance || activeInstance.type !== 'pdf' || !effectiveInstanceId) return;

    // Update UI immediately with PDF data
    const updatedInstance = {
      ...activeInstance,
      data: {
        ...activeInstance.data,
        pdfUrl: url,
        fileName: file.name,
        fileSize: file.size,
        pageCount: metadata.pageCount,
        summary: metadata.summary,
        metadata: metadata.metadata,
        fullText: metadata.fullText,
        storagePath: metadata.storagePath,
      },
    };
    setActiveInstance(updatedInstance);
    setInstances((prev) =>
      prev.map((instance) =>
        instance.id === effectiveInstanceId ? updatedInstance : instance
      )
    );

    // Save to database
    try {
      await updateInstanceDB(effectiveInstanceId, {
        data: updatedInstance.data,
      });
    } catch (error) {
      console.error('Failed to save PDF upload:', error);
    }
  };

  const handlePDFSummaryReady = async (summary: string) => {
    if (!activeInstance || activeInstance.type !== 'pdf' || !effectiveInstanceId) return;

    // Update UI immediately
    const updatedInstance = {
      ...activeInstance,
      data: { ...activeInstance.data, summary }
    };
    setActiveInstance(updatedInstance);
    setInstances((prev) =>
      prev.map((instance) =>
        instance.id === effectiveInstanceId ? updatedInstance : instance
      )
    );

    // Save to database
    try {
      await updateInstanceDB(effectiveInstanceId, {
        data: updatedInstance.data,
      });
    } catch (error) {
      console.error('Failed to save PDF summary:', error);
    }
  };

  const handleLectureUpload = async (data: {
    sourceType: string;
    videoUrl?: string;
    youtubeId?: string;
    transcript?: string;
    transcriptSegments?: any[];
    slidesUrl?: string;
    slidesFileName?: string;
    slidesPageCount?: number;
    slidesFullText?: string;
    audioUrl?: string;
    duration?: number;
    metadata?: any;
  }) => {
    if (!activeInstance || activeInstance.type !== 'lecture' || !effectiveInstanceId) return;

    // Update UI immediately with lecture data
    const updatedInstance = {
      ...activeInstance,
      data: {
        ...activeInstance.data,
        ...data,
        processingStatus: 'ready',
      },
    };
    setActiveInstance(updatedInstance);
    setInstances((prev) =>
      prev.map((instance) =>
        instance.id === effectiveInstanceId ? updatedInstance : instance
      )
    );

    // Save to database
    try {
      await updateInstanceDB(effectiveInstanceId, {
        data: updatedInstance.data,
      });
    } catch (error) {
      console.error('Failed to save lecture upload:', error);
    }
  };

  const handleAddToChat = (text: string) => {
    setContextText(text);
  };

  const getCurrentPageImage = async (): Promise<string | null> => {
    if (pdfViewerRef.current) {
      return await pdfViewerRef.current.getCurrentPageImage();
    }
    return null;
  };

  const handleCreateNewChat = async () => {
    try {
      // Use the ref to create a new chat without reloading the page
      if ((activeInstance?.type === 'pdf' || activeInstance?.type === 'lecture') && pdfStudyPanelRef.current) {
        await pdfStudyPanelRef.current.createNewChat();
      } else if (aiSidePanelRef.current) {
        await aiSidePanelRef.current.createNewChat();
      }
    } catch (error) {
      console.error('Failed to create new chat:', error);
    }
  };

  const handleCreateFolder = async (name: string, parentId?: string) => {
    await createFolder(name, parentId);
  };

  const handleRenameFolder = async (id: string, name: string) => {
    await renameFolder(id, name);
  };

  const handleDeleteFolder = async (id: string) => {
    await deleteFolder(id);
  };

  const handleMoveFolder = async (folderId: string, parentFolderId: string | null) => {
    await moveFolder(folderId, parentFolderId);
  };

  const handleMoveToFolder = async (instanceId: string, folderId: string | null) => {
    await moveInstanceToFolder(instanceId, folderId);
  };

  const renderActiveContent = () => {
    if (!activeInstance) return null;
    
    switch (activeInstance.type) {
      case 'text':
        return (
          <TextEditor
            content={activeInstance.data.content}
            onChange={updateTextContent}
          />
        );
      case 'code':
        return (
          <CodeWorkspace
            initialFiles={activeInstance.data.files}
            initialFileTree={activeInstance.data.fileTree}
            onSave={({ files, fileTree, activeFilePath, openFiles }) => {
              if (!activeInstance || !effectiveInstanceId) return;

              // Update UI immediately
              const updatedInstance = {
                ...activeInstance,
                data: {
                  ...activeInstance.data,
                  files,
                  fileTree,
                  activeFilePath,
                  openFiles,
                },
              };
              setActiveInstance(updatedInstance);
              setInstances((prev) =>
                prev.map((instance) =>
                  instance.id === effectiveInstanceId ? updatedInstance : instance
                )
              );

              // Debounced save to database
              debouncedSave(effectiveInstanceId, {
                files,
                fileTree,
                activeFilePath,
                openFiles,
              });
            }}
          />
        );
      case 'pdf':
        return (
          <div className="h-full flex flex-col">
            <div className="flex-shrink-0 border-b border-border px-4 py-2 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight">{activeInstance.title}</h2>
              <div className="text-sm font-medium text-muted-foreground">PDF</div>
            </div>
            <div className="flex-1 overflow-hidden">
              <PDFViewer
                ref={pdfViewerRef}
                pdfUrl={activeInstance.data.pdfUrl}
                fileName={activeInstance.data.fileName}
                metadata={activeInstance.data.metadata}
                fullText={activeInstance.data.fullText}
                onUpload={handlePDFUpload}
                onSummaryReady={handlePDFSummaryReady}
                onAddToChat={handleAddToChat}
              />
            </div>
          </div>
        );
      case 'lecture':
        return (
          <div className="h-full flex flex-col">
            <div className="flex-shrink-0 border-b border-border px-4 py-2 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight">{activeInstance.title}</h2>
            </div>
            <div className="flex-1 overflow-hidden">
              <LectureViewer
                sourceType={activeInstance.data.sourceType}
                videoUrl={activeInstance.data.videoUrl}
                youtubeId={activeInstance.data.youtubeId}
                transcript={activeInstance.data.transcript}
                transcriptSegments={activeInstance.data.transcriptSegments}
                slidesUrl={activeInstance.data.slidesUrl}
                slidesFileName={activeInstance.data.slidesFileName}
                slidesPageCount={activeInstance.data.slidesPageCount}
                audioUrl={activeInstance.data.audioUrl}
                metadata={activeInstance.data.metadata}
                onUpload={handleLectureUpload}
                onAddToChat={handleAddToChat}
              />
            </div>
          </div>
        );
      case 'annotate':
      default:
        return (
          <AnnotateCanvas
            key={activeInstance.id}
            ref={annotationCanvasRef}
            initialData={activeInstance.data.excalidrawState}
            onStateChange={updateAnnotationState}
          />
        );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading instance...</p>
        </div>
      </div>
    );
  }

  if (localError || !activeInstance || !effectiveInstanceId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-semibold mb-2">{localError || 'Instance not found'}</p>
          <Button onClick={() => router.push('/workspace')}>Go to Dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full">
      <WorkspaceLayout
        showSidebar={true}
        sidebar={
          (activeInstance.type === 'pdf' || activeInstance.type === 'lecture') ? (
            <PDFStudyPanel
              ref={pdfStudyPanelRef}
              activeInstance={activeInstance}
              instances={instances}
              folders={folders}
              contextText={contextText}
              onContextRemoved={() => setContextText(null)}
              getCurrentPageImage={getCurrentPageImage}
            />
          ) : (
            <AISidePanel
              ref={aiSidePanelRef}
              activeInstance={activeInstance}
              instances={instances}
              folders={folders}
              annotationCanvasRef={activeInstance.type === 'annotate' ? annotationCanvasRef : undefined}
              contextText={contextText}
              onContextRemoved={() => setContextText(null)}
            />
          )
        }
      >
        <div className="h-full p-4 flex flex-col gap-4">
          {(activeInstance.type === 'annotate' || activeInstance.type === 'text') && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold tracking-tight">{activeInstance.title}</h2>
              {activeInstance.type === 'annotate' && (
                <div className="flex items-center gap-2 border border-border rounded-lg px-2 py-1 bg-background">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={triggerAnnotationUpload}
                    className="text-sm font-medium"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload PDF
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={triggerAnnotationExport}
                    className="text-sm font-medium"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
              )}
            </div>
          )}
          <div className="flex-1 rounded-2xl border border-border bg-background overflow-hidden">
            {renderActiveContent()}
          </div>
        </div>
      </WorkspaceLayout>
    </div>
  );
}

export default function InstancePage() {
  return (
    <ProtectedRoute>
      <InstancePageContent />
    </ProtectedRoute>
  );
}
