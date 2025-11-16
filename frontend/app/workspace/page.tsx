'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CentralDashboard } from '@/components/dashboard/CentralDashboard';
import { InstanceSidebar, NewInstanceModal, SettingsModal } from '@/components/workspace';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import type { InstanceType, ThemePreference, WorkspaceInstance, Folder } from '@/lib/types';
import { 
  createInstance as createInstanceDB,
  loadUserInstances,
  loadUserFolders,
  updateInstance as updateInstanceDB,
  deleteInstance as deleteInstanceDB,
  createFolder as createFolderDB,
  updateFolder as updateFolderDB,
  deleteFolder as deleteFolderDB,
} from '@/lib/db/instances';
import { nanoid } from 'nanoid';
import type { CodeFile, FileTreeNode } from '@/lib/types';

const STORAGE_KEYS = {
  theme: 'mimir.themePreference',
};

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

const createInstanceData = (type: InstanceType): any => {
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
  if (type === 'lecture') {
    return {
      sourceType: undefined,
      videoUrl: undefined,
      youtubeId: undefined,
      transcript: undefined,
      transcriptSegments: undefined,
      slidesUrl: undefined,
      slidesFileName: undefined,
      slidesPageCount: undefined,
      slidesFullText: undefined,
      audioUrl: undefined,
      audioDuration: undefined,
      fileName: undefined,
      fileSize: undefined,
      duration: undefined,
      summary: undefined,
      metadata: undefined,
      processingStatus: undefined,
      processingError: undefined,
    };
  }
  return {};
};

function WorkspaceDashboardContent() {
  const router = useRouter();
  const [instances, setInstances] = useState<WorkspaceInstance[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [newInstanceOpen, setNewInstanceOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [instanceSearchOpen, setInstanceSearchOpen] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>('light');
  const [loading, setLoading] = useState(true);

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
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

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
    }
  };

  const handleDelete = async (id: string) => {
    // Optimistically update UI
    setInstances((prev) => prev.filter((instance) => instance.id !== id));

    // Delete from database
    try {
      await deleteInstanceDB(id);
    } catch (error) {
      console.error('Failed to delete instance:', error);
    }
  };

  const handleSelect = (id: string) => {
    const instance = instances.find((i) => i.id === id);
    if (instance) {
      router.push(`/workspace/${instance.type}/${id}`);
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

  const handleMoveFolder = async (folderId: string, parentFolderId: string | null) => {
    // Optimistically update UI
    setFolders((prev) =>
      prev.map((folder) =>
        folder.id === folderId ? { ...folder, parentFolderId } : folder
      )
    );

    // Save to database
    try {
      await updateFolderDB(folderId, undefined, parentFolderId);
    } catch (error) {
      console.error('Failed to move folder:', error);
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

  const handleCreateInstance = async (title: string, type: InstanceType, additionalData?: any) => {
    const trimmed = title.trim();
    if (!trimmed) {
      console.warn('[handleCreateInstance] Empty title provided, aborting');
      return;
    }

    console.log('[handleCreateInstance] ========================================');
    console.log('[handleCreateInstance] Creating new instance...');
    console.log('[handleCreateInstance] Title:', trimmed);
    console.log('[handleCreateInstance] Type:', type);
    console.log('[handleCreateInstance] Additional data:', additionalData);

    const instanceData = createInstanceData(type);

    // Merge additional data with default instance data
    const finalData = additionalData ? { ...instanceData, ...additionalData } : instanceData;
    console.log('[handleCreateInstance] Generated data:', JSON.stringify(finalData, null, 2));

    const instancePayload = {
      title: trimmed,
      type,
      folderId: null,
      data: finalData,
    };

    console.log('[handleCreateInstance] Full payload:', JSON.stringify(instancePayload, null, 2));

    try {
      console.log('[handleCreateInstance] Calling createInstanceDB...');
      const newInstance = await createInstanceDB(instancePayload);

      console.log('[handleCreateInstance] ✅ Instance created successfully!');
      console.log('[handleCreateInstance] New instance ID:', newInstance.id);
      console.log('[handleCreateInstance] New instance:', JSON.stringify(newInstance, null, 2));

      // Navigate to the new instance
      router.push(`/workspace/${newInstance.type}/${newInstance.id}`);
      
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <InstanceSidebar
        instances={instances}
        folders={folders}
        activeInstanceId={null}
        onSelect={handleSelect}
        onCreateInstance={() => setNewInstanceOpen(true)}
        onRename={handleRename}
        onDelete={handleDelete}
        onOpenSettings={() => setSettingsOpen(true)}
        onCreateFolder={handleCreateFolder}
        onRenameFolder={handleRenameFolder}
        onDeleteFolder={handleDeleteFolder}
        onMoveToFolder={handleMoveToFolder}
        onMoveFolder={handleMoveFolder}
      />

      <CentralDashboard onCreateInstance={handleCreateInstance} />

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
      <WorkspaceDashboardContent />
    </ProtectedRoute>
  );
}
