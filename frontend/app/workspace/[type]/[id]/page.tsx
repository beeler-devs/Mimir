'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { WorkspaceLayout } from '@/components/layout';
import { AISidePanel, AISidePanelRef } from '@/components/ai/AISidePanel';
import { PDFStudyPanel, PDFStudyPanelRef } from '@/components/ai/PDFStudyPanel';
import { AnnotateCanvasRef } from '@/components/tabs/AnnotateCanvas';
import { PDFViewerRef } from '@/components/tabs/PDFViewer';
import { Button } from '@/components/common';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Upload, Download } from 'lucide-react';
import { useWorkspace } from '../../WorkspaceProvider';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { useInstanceUpdate } from '@/hooks/useInstanceUpdate';
import {
  TextInstanceRenderer,
  CodeInstanceRenderer,
  PDFInstanceRenderer,
  LectureInstanceRenderer,
  AnnotateInstanceRenderer,
} from '@/components/instance-renderers';
import {
  updateInstance as updateInstanceDB,
} from '@/lib/db/instances';

import type { InstanceType, CodeFile, FileTreeNode, TextInstance, CodeInstance, PDFInstance, LectureInstance, AnnotateInstance, LectureSourceType } from '@/lib/types';
import type { LectureMetadata } from '@/components/tabs/LectureViewer';

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
  } = useWorkspace();

  const [localError, setLocalError] = useState<string | null>(null);
  const [contextText, setContextText] = useState<string | null>(null);

  // Refs for panel components
  const aiSidePanelRef = useRef<AISidePanelRef>(null);
  const pdfStudyPanelRef = useRef<PDFStudyPanelRef>(null);
  const annotationCanvasRef = useRef<AnnotateCanvasRef>(null);
  const pdfViewerRef = useRef<PDFViewerRef>(null);

  const effectiveInstanceId = activeInstanceId || routeInstanceId || null;

  // Use the new debounced save hook
  const { debouncedSave } = useDebouncedSave();

  // Use the new instance update hook
  const { updateField, updateFields } = useInstanceUpdate({
    activeInstance,
    effectiveInstanceId,
    setActiveInstance,
    setInstances,
    debouncedSave,
  });

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

  // Handler for text content
  const handleTextContentChange = useCallback((value: string) => {
    updateField('content', value);
  }, [updateField]);

  // Handler for code workspace
  const handleCodeSave = useCallback(({ files, fileTree, activeFilePath, openFiles }: {
    files: CodeFile[];
    fileTree: FileTreeNode[];
    activeFilePath: string | null;
    openFiles: string[];
  }) => {
    updateFields({ files, fileTree, activeFilePath, openFiles });
  }, [updateFields]);

  // Handler for annotation state
  const handleAnnotationStateChange = useCallback((state: { elements: unknown[]; appState: unknown; files: unknown }) => {
    updateField('excalidrawState', state);
  }, [updateField]);

  // Handler for PDF upload
  const handlePDFUpload = useCallback(async (
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

    const updatedData = {
      ...activeInstance.data,
      pdfUrl: url,
      fileName: file.name,
      fileSize: file.size,
      pageCount: metadata.pageCount,
      summary: metadata.summary,
      metadata: metadata.metadata,
      fullText: metadata.fullText,
      storagePath: metadata.storagePath,
    };

    const updatedInstance = { ...activeInstance, data: updatedData };
    setActiveInstance(updatedInstance);
    setInstances((prev) =>
      prev.map((instance) =>
        instance.id === effectiveInstanceId ? updatedInstance : instance
      )
    );

    try {
      await updateInstanceDB(effectiveInstanceId, { data: updatedData });
    } catch (error) {
      console.error('Failed to save PDF upload:', error);
    }
  }, [activeInstance, effectiveInstanceId, setActiveInstance, setInstances]);

  // Handler for PDF summary
  const handlePDFSummaryReady = useCallback(async (summary: string) => {
    if (!activeInstance || activeInstance.type !== 'pdf' || !effectiveInstanceId) return;

    const updatedData = { ...activeInstance.data, summary };
    const updatedInstance = { ...activeInstance, data: updatedData };
    setActiveInstance(updatedInstance);
    setInstances((prev) =>
      prev.map((instance) =>
        instance.id === effectiveInstanceId ? updatedInstance : instance
      )
    );

    try {
      await updateInstanceDB(effectiveInstanceId, { data: updatedData });
    } catch (error) {
      console.error('Failed to save PDF summary:', error);
    }
  }, [activeInstance, effectiveInstanceId, setActiveInstance, setInstances]);

  // Handler for lecture upload
  const handleLectureUpload = useCallback(async (data: {
    sourceType: LectureSourceType;
    videoUrl?: string;
    youtubeId?: string;
    transcript?: string;
    transcriptSegments?: Array<{ text: string; timestamp: number; duration?: number }>;
    slidesUrl?: string;
    slidesFileName?: string;
    slidesPageCount?: number;
    slidesFullText?: string;
    audioUrl?: string;
    duration?: number;
    metadata?: LectureMetadata;
  }) => {
    if (!activeInstance || activeInstance.type !== 'lecture' || !effectiveInstanceId) return;

    const updatedData = {
      ...activeInstance.data,
      ...data,
      processingStatus: 'ready' as const,
    };

    const updatedInstance = { ...activeInstance, data: updatedData };
    setActiveInstance(updatedInstance);
    setInstances((prev) =>
      prev.map((instance) =>
        instance.id === effectiveInstanceId ? updatedInstance : instance
      )
    );

    try {
      await updateInstanceDB(effectiveInstanceId, { data: updatedData });
    } catch (error) {
      console.error('Failed to save lecture upload:', error);
    }
  }, [activeInstance, effectiveInstanceId, setActiveInstance, setInstances]);

  const handleAddToChat = useCallback((text: string) => {
    setContextText(text);
  }, []);

  const getCurrentPageImage = useCallback(async (): Promise<string | null> => {
    if (pdfViewerRef.current) {
      return await pdfViewerRef.current.getCurrentPageImage();
    }
    return null;
  }, []);

  const handleCreateNewChat = useCallback(async () => {
    try {
      if ((activeInstance?.type === 'pdf' || activeInstance?.type === 'lecture') && pdfStudyPanelRef.current) {
        await pdfStudyPanelRef.current.createNewChat();
      } else if (aiSidePanelRef.current) {
        await aiSidePanelRef.current.createNewChat();
      }
    } catch (error) {
      console.error('Failed to create new chat:', error);
    }
  }, [activeInstance?.type]);

  const triggerAnnotationUpload = useCallback(() => {
    annotationCanvasRef.current?.openPdfUpload();
  }, []);

  const triggerAnnotationExport = useCallback(() => {
    annotationCanvasRef.current?.exportAnnotatedPdf();
  }, []);

  const renderActiveContent = () => {
    if (!activeInstance) return null;

    switch (activeInstance.type) {
      case 'text':
        return (
          <TextInstanceRenderer
            instance={activeInstance as TextInstance}
            onContentChange={handleTextContentChange}
          />
        );
      case 'code':
        return (
          <CodeInstanceRenderer
            instance={activeInstance as CodeInstance}
            onSave={handleCodeSave}
          />
        );
      case 'pdf':
        return (
          <PDFInstanceRenderer
            ref={pdfViewerRef}
            instance={activeInstance as PDFInstance}
            onUpload={handlePDFUpload}
            onSummaryReady={handlePDFSummaryReady}
            onAddToChat={handleAddToChat}
          />
        );
      case 'lecture':
        return (
          <LectureInstanceRenderer
            instance={activeInstance as LectureInstance}
            onUpload={handleLectureUpload}
            onAddToChat={handleAddToChat}
          />
        );
      case 'annotate':
      default:
        return (
          <AnnotateInstanceRenderer
            ref={annotationCanvasRef}
            instance={activeInstance as AnnotateInstance}
            onStateChange={handleAnnotationStateChange}
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
