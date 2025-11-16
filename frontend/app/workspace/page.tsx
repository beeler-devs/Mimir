'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { WorkspaceLayout } from '@/components/layout';
import { AISidePanel, AISidePanelRef } from '@/components/ai/AISidePanel';
import { PDFStudyPanel, PDFStudyPanelRef } from '@/components/ai/PDFStudyPanel';
import { TextEditor, AnnotateCanvas, FlashcardTab } from '@/components/tabs';
import { CodeWorkspace } from '@/components/code/CodeWorkspace';
import { AnnotateCanvasRef } from '@/components/tabs/AnnotateCanvas';
import { PDFViewerRef } from '@/components/tabs/PDFViewer';
import { InstanceSidebar, SettingsModal, NewInstanceModal } from '@/components/workspace';
import { Button } from '@/components/common';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Upload, Download, MessageSquare, File, FileText, Code2, PenTool } from 'lucide-react';

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
  CodeFile,
  FileTreeNode,
  Folder,
} from '@/lib/types';
import { nanoid } from 'nanoid';
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
    const fileId = nanoid();
    const defaultFile: CodeFile = {
      id: fileId,
      name: 'main.py',
      path: 'main.py',
      content: '# Write your code here\nprint("Hello, Mimir!")\n',
      language: 'python',
    };

    const defaultTreeNode: FileTreeNode = {
      id: fileId,
      name: 'main.py',
      type: 'file',
      parentId: null,
      language: 'python',
      path: 'main.py',
    };

    return {
      files: [defaultFile],
      activeFilePath: 'main.py',
      openFiles: ['main.py'],
      fileTree: [defaultTreeNode],
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
  const [instanceSearchOpen, setInstanceSearchOpen] = useState(false);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [activePdfTab, setActivePdfTab] = useState<'pdf' | 'flashcards'>('pdf');

  // Refs for panel components
  const aiSidePanelRef = useRef<AISidePanelRef>(null);
  const pdfStudyPanelRef = useRef<PDFStudyPanelRef>(null);
  const annotationCanvasRef = useRef<AnnotateCanvasRef>(null);
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

  // Compute active instance before using it in effects
  const activeInstance = useMemo(
    () => instances.find((instance) => instance.id === activeInstanceId) ?? null,
    [instances, activeInstanceId]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Command+K: Search instances and folders
      if (cmdOrCtrl && e.key === 'k' && !e.shiftKey) {
        e.preventDefault();
        setInstanceSearchOpen(true);
        return;
      }

      // Command+Shift+K: Search chats (only when chat panel is open)
      if (cmdOrCtrl && e.key === 'K' && e.shiftKey) {
        e.preventDefault();
        // Only open if we're NOT in PDF mode (PDF has its own panel)
        if (activeInstance?.type !== 'pdf') {
          setChatSearchOpen(true);
        }
        return;
      }

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
    if (!trimmed) {
      console.warn('[handleCreateInstance] Empty title provided, aborting');
      return;
    }

    console.log('[handleCreateInstance] ========================================');
    console.log('[handleCreateInstance] Creating new instance...');
    console.log('[handleCreateInstance] Title:', trimmed);
    console.log('[handleCreateInstance] Type:', type);

    const instanceData = createInstanceData(type);
    console.log('[handleCreateInstance] Generated data:', JSON.stringify(instanceData, null, 2));

    const instancePayload = {
      title: trimmed,
      type,
      folderId: null,
      data: instanceData,
    } as Omit<WorkspaceInstance, 'id'>;

    console.log('[handleCreateInstance] Full payload:', JSON.stringify(instancePayload, null, 2));

    try {
      console.log('[handleCreateInstance] Calling createInstanceDB...');
      const newInstance = await createInstanceDB(instancePayload);

      console.log('[handleCreateInstance] ✅ Instance created successfully!');
      console.log('[handleCreateInstance] New instance ID:', newInstance.id);
      console.log('[handleCreateInstance] New instance:', JSON.stringify(newInstance, null, 2));

      setInstances((prev) => [...prev, newInstance]);
      setActiveInstanceId(newInstance.id);
      console.log('[handleCreateInstance] UI state updated');
      console.log('[handleCreateInstance] ========================================');
    } catch (error) {
      console.error('[handleCreateInstance] ========================================');
      console.error('[handleCreateInstance] ❌ FAILED to create instance');
      console.error('[handleCreateInstance] Error type:', typeof error);
      console.error('[handleCreateInstance] Error:', error);
      
      if (error instanceof Error) {
        console.error('[handleCreateInstance] Error name:', error.name);
        console.error('[handleCreateInstance] Error message:', error.message);
        console.error('[handleCreateInstance] Error stack:', error.stack);
      }
      
      // Try to extract Supabase-specific error details
      if (error && typeof error === 'object') {
        console.error('[handleCreateInstance] Error keys:', Object.keys(error));
        console.error('[handleCreateInstance] Error code:', (error as any).code);
        console.error('[handleCreateInstance] Error message:', (error as any).message);
        console.error('[handleCreateInstance] Error details:', (error as any).details);
        console.error('[handleCreateInstance] Error hint:', (error as any).hint);
      }
      
      console.error('[handleCreateInstance] Full error JSON:', JSON.stringify(error, null, 2));
      console.error('[handleCreateInstance] ========================================');
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
      storagePath: string;
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
                storagePath: metadata.storagePath,
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
          storagePath: metadata.storagePath,
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

  const handleCreateNewChat = async () => {
    try {
      // Use the ref to create a new chat without reloading the page
      if (activeInstance?.type === 'pdf' && pdfStudyPanelRef.current) {
        await pdfStudyPanelRef.current.createNewChat();
      } else if (aiSidePanelRef.current) {
        await aiSidePanelRef.current.createNewChat();
      }
    } catch (error) {
      console.error('Failed to create new chat:', error);
    }
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
          <CodeWorkspace
            initialFiles={activeInstance.data.files}
            initialFileTree={activeInstance.data.fileTree}
            onSave={(files, fileTree) => {
              if (!activeInstanceId) return;

              // Update UI immediately
              setInstances((prev) =>
                prev.map((instance) =>
                  instance.id === activeInstanceId && instance.type === 'code'
                    ? {
                        ...instance,
                        data: {
                          ...instance.data,
                          files,
                          fileTree,
                        },
                      }
                    : instance
                )
              );

              // Debounced save to database
              debouncedSave(activeInstanceId, {
                files,
                fileTree,
                activeFilePath: activeInstance.data.activeFilePath,
                openFiles: activeInstance.data.openFiles,
              });
            }}
          />
        );
      case 'pdf':
        return (
          <div className="h-full flex flex-col">
            <div className="flex-shrink-0 border-b border-border px-4 py-2 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight">{activeInstance.title}</h2>
              <div className="flex items-center gap-2">
                <Button
                  variant={activePdfTab === 'pdf' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setActivePdfTab('pdf')}
                >
                  PDF
                </Button>
                <Button
                  variant={activePdfTab === 'flashcards' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setActivePdfTab('flashcards')}
                >
                  Flashcards
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              {activePdfTab === 'pdf' ? (
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
              ) : (
                <FlashcardTab />
              )}
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
          <div className={`h-full ${activeInstance?.type === 'code' ? '' : 'p-4'} flex flex-col gap-4`}>
            {(activeInstance?.type === 'annotate' || activeInstance?.type === 'text') && (
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
            <div className={`flex-1 ${activeInstance?.type === 'code' ? '' : 'rounded-2xl border border-border bg-background'} overflow-hidden`}>
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

      {/* Search Modals */}
      <SearchInstancesModal
        open={instanceSearchOpen}
        instances={instances}
        onClose={() => setInstanceSearchOpen(false)}
        onSelect={(id) => {
          setActiveInstanceId(id);
          setInstanceSearchOpen(false);
        }}
      />

      <ChatSearchModal
        open={chatSearchOpen}
        onClose={() => setChatSearchOpen(false)}
      />
    </div>
  );
}

// Search Instances Modal (reused from InstanceSidebar)
const typeMeta = {
  text: { label: 'Text', icon: FileText },
  code: { label: 'Code', icon: Code2 },
  annotate: { label: 'Annotate', icon: PenTool },
  pdf: { label: 'PDF', icon: File },
} as const;

interface SearchInstancesModalProps {
  open: boolean;
  instances: WorkspaceInstance[];
  onClose: () => void;
  onSelect: (id: string) => void;
}

const SearchInstancesModal: React.FC<SearchInstancesModalProps> = ({
  open,
  instances,
  onClose,
  onSelect,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => setQuery(''));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  if (!open) return null;

  const filteredInstances = instances.filter(instance =>
    instance.title.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-10">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-xl bg-card border border-border rounded-3xl shadow-2xl overflow-hidden">
        <div className="flex flex-col max-h-[70vh] bg-[#F5F5F5]">
          <input
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search instances..."
            className="rounded-t-lg rounded-b-none border-0 border-b border-border px-5 py-6 text-base bg-[#F5F5F5] focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                onClose();
              } else if (e.key === 'Enter' && filteredInstances.length > 0) {
                onSelect(filteredInstances[0].id);
              }
            }}
          />
          <div className="flex-1 overflow-y-auto p-2">
            {filteredInstances.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {query ? 'No instances found' : 'Start typing to search'}
              </div>
            ) : (
              filteredInstances.map((instance) => {
                const meta = typeMeta[instance.type];
                const Icon = meta.icon;
                return (
                  <button
                    key={instance.id}
                    onClick={() => onSelect(instance.id)}
                    className="w-full px-3 py-2.5 flex items-center gap-3 text-left rounded-lg text-sm transition-colors hover:bg-[#FAFAFA]"
                  >
                    <span className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{instance.title}</p>
                      <p className="text-xs text-muted-foreground">{meta.label}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Chat Search Modal
interface ChatSearchModalProps {
  open: boolean;
  onClose: () => void;
}

const ChatSearchModal: React.FC<ChatSearchModalProps> = ({ open, onClose }) => {
  const [query, setQuery] = useState('');
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    loadChats();
  }, [open]);

  const loadChats = async () => {
    setLoading(true);
    try {
      const { loadUserChats } = await import('@/lib/db/chats');
      const userChats = await loadUserChats();
      setChats(userChats);
    } catch (error) {
      console.error('Failed to load chats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const filteredChats = chats.filter(chat =>
    (chat.title || 'New Chat').toLowerCase().includes(query.toLowerCase())
  );

  const handleSelectChat = (chatId: string) => {
    localStorage.setItem('mimir.activeChatId', chatId);
    window.location.reload();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-10">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-xl bg-card border border-border rounded-3xl shadow-2xl overflow-hidden">
        <div className="flex flex-col max-h-[70vh] bg-[#F5F5F5]">
          <input
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats..."
            className="rounded-t-lg rounded-b-none border-0 border-b border-border px-5 py-6 text-base bg-[#F5F5F5] focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                onClose();
              } else if (e.key === 'Enter' && filteredChats.length > 0) {
                handleSelectChat(filteredChats[0].id);
              }
            }}
          />
          <div className="flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="text-center py-8">
                <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            ) : filteredChats.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {query ? 'No chats found' : chats.length === 0 ? 'No chats yet' : 'Start typing to search'}
              </div>
            ) : (
              filteredChats.map((chat) => {
                const displayTitle = chat.title || 'New Chat';
                const createdDate = new Date(chat.created_at).toLocaleDateString();
                return (
                  <button
                    key={chat.id}
                    onClick={() => handleSelectChat(chat.id)}
                    className="w-full px-3 py-2.5 flex items-center gap-3 text-left rounded-lg text-sm transition-colors hover:bg-[#FAFAFA]"
                  >
                    <span className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <MessageSquare className="h-3.5 w-3.5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{displayTitle}</p>
                      <p className="text-xs text-muted-foreground">{createdDate}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default function WorkspacePage() {
  return (
    <ProtectedRoute>
      <WorkspaceContent />
    </ProtectedRoute>
  );
}
