'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { WorkspaceLayout } from '@/components/layout';
import { AISidePanel, AISidePanelRef } from '@/components/ai/AISidePanel';
import { PDFStudyPanel, PDFStudyPanelRef } from '@/components/ai/PDFStudyPanel';
import { TextEditor, AnnotateCanvas } from '@/components/tabs';
import { CodeEditorEnhanced } from '@/components/tabs/CodeEditorEnhanced';
import { AnnotateCanvasRef } from '@/components/tabs/AnnotateCanvas';
import { PDFViewerRef } from '@/components/tabs/PDFViewer';
import { InstanceSidebar, SettingsModal, NewInstanceModal } from '@/components/workspace';
import { Button } from '@/components/common';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Upload, Download } from 'lucide-react';

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
import type {
  WorkspaceInstance,
  InstanceType,
  ThemePreference,
  CodeLanguage,
  Folder,
} from '@/lib/types';
import {
  loadUserFolders,
  loadUserInstances,
  createInstance as createInstanceDB,
  updateInstance as updateInstanceDB,
  deleteInstance as deleteInstanceDB,
  createFolder as createFolderDB,
  updateFolder as updateFolderDB,
  deleteFolder as deleteFolderDB,
} from '@/lib/db/instances';

const STORAGE_KEYS = {
  active: 'mimir.activeInstance',
  theme: 'mimir.themePreference',
};

const createInstanceData = (type: InstanceType): WorkspaceInstance['data'] => {
  if (type === 'text') {
    return { content: '' };
  }
  if (type === 'code') {
    return {
      language: 'python' as CodeLanguage,
      code: '# Write your code here\n',
    };
  }
  if (type === 'pdf') {
    return {
      pdfUrl: undefined,
      fileName: undefined,
      fileSize: undefined,
      pageCount: undefined,
      summary: undefined,
      storagePath: undefined,
      metadata: undefined,
      fullText: undefined,
    };
  }
  return {};
};

const EmptyState = ({ onCreate }: { onCreate: () => void }) => (
  <div className="h-full flex flex-col items-center justify-center text-center px-8">
    <p className="text-lg font-semibold mb-2">No instance selected</p>
    <p className="text-sm text-muted-foreground mb-6">
      Create a new instance or select one from the left panel to get started.
    </p>
    <Button onClick={onCreate}>Create instance</Button>
  </div>
);

const applyThemePreference = (preference: ThemePreference) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (preference === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  } else {
    root.classList.toggle('dark', preference === 'dark');
  }
};

function WorkspaceContent() {
  const [instances, setInstances] = useState<WorkspaceInstance[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newInstanceOpen, setNewInstanceOpen] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>('light');
  const [loading, setLoading] = useState(true);
  const [saveTimeout, setSaveTimeout] = useState<NodeJS.Timeout | null>(null);
  const [pendingChatText, setPendingChatText] = useState<string | null>(null);
  const annotationCanvasRef = useRef<AnnotateCanvasRef>(null);
  const aiSidePanelRef = useRef<AISidePanelRef>(null);
  const pdfStudyPanelRef = useRef<PDFStudyPanelRef>(null);
  const pdfViewerRef = useRef<PDFViewerRef>(null);

  // Load instances and folders from database on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [loadedInstances, loadedFolders] = await Promise.all([
          loadUserInstances(),
          loadUserFolders(),
        ]);

        setInstances(loadedInstances);
        setFolders(loadedFolders);

        // Restore active instance from localStorage
        const storedActive = localStorage.getItem(STORAGE_KEYS.active);
        const validActive =
          storedActive && loadedInstances.some((instance) => instance.id === storedActive)
            ? storedActive
            : loadedInstances[0]?.id ?? null;
        setActiveInstanceId(validActive);

        // Restore theme preference
        const storedTheme = localStorage.getItem(STORAGE_KEYS.theme) as ThemePreference | null;
        if (storedTheme) {
          setThemePreference(storedTheme);
          applyThemePreference(storedTheme);
        } else {
          setThemePreference('light');
          applyThemePreference('light');
        }
      } catch (error) {
        console.error('Failed to load workspace data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Save active instance to localStorage
  useEffect(() => {
    if (activeInstanceId) {
      localStorage.setItem(STORAGE_KEYS.active, activeInstanceId);
    }
  }, [activeInstanceId]);

  // Save theme preference
  useEffect(() => {
    if (!loading) {
      localStorage.setItem(STORAGE_KEYS.theme, themePreference);
      applyThemePreference(themePreference);
    }
  }, [themePreference, loading]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMedia = () => {
      if (themePreference === 'system') {
        applyThemePreference('system');
      }
    };
    media.addEventListener('change', handleMedia);
    return () => media.removeEventListener('change', handleMedia);
  }, [themePreference]);

  const activeInstance = useMemo(
    () => instances.find((instance) => instance.id === activeInstanceId) ?? null,
    [instances, activeInstanceId]
  );

  const handleRename = async (id: string, title: string) => {
    const nextTitle = title.trim();
    if (nextTitle.length === 0) return;

    // Optimistically update UI
    setInstances((prev) =>
      prev.map((instance) =>
        instance.id === id ? { ...instance, title: nextTitle } : instance
      )
    );

    // Save to database
    try {
      await updateInstanceDB(id, { title: nextTitle });
    } catch (error) {
      console.error('Failed to rename instance:', error);
      // Could revert UI change here if needed
    }
  };

  const handleDelete = async (id: string) => {
    // Optimistically update UI
    setInstances((prev) => {
      const filtered = prev.filter((instance) => instance.id !== id);
      if (activeInstanceId === id) {
        setActiveInstanceId(filtered[0]?.id ?? null);
      }
      return filtered;
    });

    // Delete from database
    try {
      await deleteInstanceDB(id);
    } catch (error) {
      console.error('Failed to delete instance:', error);
      // Could revert UI change here if needed
    }
  };

  const handleCreateInstance = async (title: string, type: InstanceType) => {
    const trimmed = title.trim();
    if (!trimmed) return;

    try {
      const newInstance = await createInstanceDB({
        title: trimmed,
        type,
        folderId: null,
        data: createInstanceData(type),
      } as Omit<WorkspaceInstance, 'id'>);

      setInstances((prev) => [...prev, newInstance]);
      setActiveInstanceId(newInstance.id);
    } catch (error) {
      console.error('Failed to create instance:', error);
    }
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
    if (!activeInstanceId) return;
    
    // Update UI immediately
    setInstances((prev) =>
      prev.map((instance) =>
        instance.id === activeInstanceId && instance.type === 'text'
          ? { ...instance, data: { content: value } }
          : instance
      )
    );

    // Debounced save to database
    debouncedSave(activeInstanceId, { content: value });
  };

  const updateCode = (value: string) => {
    if (!activeInstanceId) return;
    
    // Find current instance to preserve language
    const currentInstance = instances.find(i => i.id === activeInstanceId);
    if (!currentInstance || currentInstance.type !== 'code') return;

    // Update UI immediately
    setInstances((prev) =>
      prev.map((instance) =>
        instance.id === activeInstanceId && instance.type === 'code'
          ? { ...instance, data: { ...instance.data, code: value } }
          : instance
      )
    );

    // Debounced save to database
    debouncedSave(activeInstanceId, { 
      language: currentInstance.data.language, 
      code: value 
    });
  };

  const updateLanguage = async (language: CodeLanguage) => {
    if (!activeInstanceId) return;
    
    // Find current instance to preserve code
    const currentInstance = instances.find(i => i.id === activeInstanceId);
    if (!currentInstance || currentInstance.type !== 'code') return;

    // Update UI immediately
    setInstances((prev) =>
      prev.map((instance) =>
        instance.id === activeInstanceId && instance.type === 'code'
          ? { ...instance, data: { ...instance.data, language } }
          : instance
      )
    );

    // Save immediately (no debounce for language changes)
    try {
      await updateInstanceDB(activeInstanceId, {
        data: { language, code: currentInstance.data.code },
      });
    } catch (error) {
      console.error('Failed to update language:', error);
    }
  };

  const updateAnnotationState = (state: { elements: any[]; appState: any; files: any }) => {
    if (!activeInstanceId) return;
    
    // Find current instance
    const currentInstance = instances.find(i => i.id === activeInstanceId);
    if (!currentInstance || currentInstance.type !== 'annotate') return;

    // Update UI immediately
    setInstances((prev) =>
      prev.map((instance) =>
        instance.id === activeInstanceId && instance.type === 'annotate'
          ? { ...instance, data: { excalidrawState: state } }
          : instance
      )
    );

    // Debounced save to database
    debouncedSave(activeInstanceId, { excalidrawState: state });
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
    }
  ) => {
    if (!activeInstanceId) return;

    const currentInstance = instances.find((i) => i.id === activeInstanceId);
    if (!currentInstance || currentInstance.type !== 'pdf') return;

    // Update UI immediately with PDF data
    setInstances((prev) =>
      prev.map((instance) =>
        instance.id === activeInstanceId && instance.type === 'pdf'
          ? {
              ...instance,
              data: {
                ...instance.data,
                pdfUrl: url,
                fileName: file.name,
                fileSize: file.size,
                pageCount: metadata.pageCount,
                summary: metadata.summary,
                metadata: metadata.metadata,
                fullText: metadata.fullText,
              },
            }
          : instance
      )
    );

    // Save to database
    try {
      await updateInstanceDB(activeInstanceId, {
        data: {
          pdfUrl: url,
          fileName: file.name,
          fileSize: file.size,
          pageCount: metadata.pageCount,
          summary: metadata.summary,
          metadata: metadata.metadata,
          fullText: metadata.fullText,
        },
      });
    } catch (error) {
      console.error('Failed to save PDF upload:', error);
    }
  };

  const handlePDFSummaryReady = async (summary: string) => {
    if (!activeInstanceId) return;

    const currentInstance = instances.find(i => i.id === activeInstanceId);
    if (!currentInstance || currentInstance.type !== 'pdf') return;

    // Update UI immediately
    setInstances((prev) =>
      prev.map((instance) =>
        instance.id === activeInstanceId && instance.type === 'pdf'
          ? { ...instance, data: { ...instance.data, summary } }
          : instance
      )
    );

    // Save to database
    try {
      await updateInstanceDB(activeInstanceId, {
        data: { ...currentInstance.data, summary },
      });
    } catch (error) {
      console.error('Failed to save PDF summary:', error);
    }
  };

  const handleAddToChat = (text: string) => {
    setPendingChatText(text);
  };

  const getCurrentPageImage = async (): Promise<string | null> => {
    if (pdfViewerRef.current) {
      return await pdfViewerRef.current.getCurrentPageImage();
    }
    return null;
  };

  const renderActiveContent = () => {
    if (loading) {
      return (
        <div className="h-full flex flex-col items-center justify-center">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-muted-foreground">Loading workspace...</p>
        </div>
      );
    }

    if (!activeInstance) {
      return <EmptyState onCreate={() => setNewInstanceOpen(true)} />;
    }
    
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
          <CodeEditorEnhanced
            language={activeInstance.data.language}
            code={activeInstance.data.code}
            onCodeChange={updateCode}
            onLanguageChange={updateLanguage}
            onAddToChat={(message) => {
              if (activeInstance?.type === 'pdf' && pdfStudyPanelRef.current) {
                pdfStudyPanelRef.current.addToChat(message);
              } else if (aiSidePanelRef.current) {
                aiSidePanelRef.current.addToChat(message);
              }
            }}
          />
        );
      case 'pdf':
        return (
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

  const handleCreateFolder = async (name: string, parentId?: string) => {
    try {
      const newFolder = await createFolderDB(name, parentId || null);
      setFolders((prev) => [...prev, newFolder]);
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const handleRenameFolder = async (id: string, name: string) => {
    const nextName = name.trim();
    if (nextName.length === 0) return;

    // Optimistically update UI
    setFolders((prev) =>
      prev.map((folder) =>
        folder.id === id ? { ...folder, name: nextName } : folder
      )
    );

    // Save to database
    try {
      await updateFolderDB(id, nextName);
    } catch (error) {
      console.error('Failed to rename folder:', error);
    }
  };

  const handleDeleteFolder = async (id: string) => {
    // Optimistically update UI
    setFolders((prev) => prev.filter((folder) => folder.id !== id));

    // Delete from database
    try {
      await deleteFolderDB(id);
    } catch (error) {
      console.error('Failed to delete folder:', error);
    }
  };

  const handleMoveToFolder = async (instanceId: string, folderId: string | null) => {
    // Optimistically update UI
    setInstances((prev) =>
      prev.map((instance) =>
        instance.id === instanceId ? { ...instance, folderId } : instance
      )
    );

    // Save to database
    try {
      await updateInstanceDB(instanceId, { folderId });
    } catch (error) {
      console.error('Failed to move instance:', error);
    }
  };

  return (
    <div className="flex h-screen bg-background">
      <InstanceSidebar
        instances={instances}
        folders={folders}
        activeInstanceId={activeInstanceId}
        onSelect={(id) => setActiveInstanceId(id)}
        onCreateInstance={() => setNewInstanceOpen(true)}
        onRename={handleRename}
        onDelete={handleDelete}
        onOpenSettings={() => setSettingsOpen(true)}
        onCreateFolder={handleCreateFolder}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
        onMoveToFolder={handleMoveToFolder}
      />

      <div className="flex-1 h-full overflow-hidden">
        <WorkspaceLayout sidebar={
          activeInstance?.type === 'pdf' ? (
            <PDFStudyPanel
              ref={pdfStudyPanelRef}
              activeInstance={activeInstance}
              instances={instances}
              folders={folders}
              pendingChatText={pendingChatText}
              onChatTextAdded={() => setPendingChatText(null)}
              getCurrentPageImage={getCurrentPageImage}
            />
          ) : (
            <AISidePanel
              ref={aiSidePanelRef}
              activeInstance={activeInstance}
              instances={instances}
              folders={folders}
              annotationCanvasRef={activeInstance?.type === 'annotate' ? annotationCanvasRef : undefined}
              pendingChatText={pendingChatText}
              onChatTextAdded={() => setPendingChatText(null)}
            />
          )
        }>
          <div className="h-full p-4 flex flex-col gap-4">
            {(activeInstance?.type === 'annotate' || activeInstance?.type === 'text' || activeInstance?.type === 'code') && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold tracking-tight">{activeInstance.title}</h2>
                {activeInstance?.type === 'annotate' && (
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

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={themePreference}
        onThemeChange={setThemePreference}
      />

      <NewInstanceModal
        open={newInstanceOpen}
        onClose={() => setNewInstanceOpen(false)}
        onCreate={handleCreateInstance}
      />
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <ProtectedRoute>
      <WorkspaceContent />
    </ProtectedRoute>
  );
}
