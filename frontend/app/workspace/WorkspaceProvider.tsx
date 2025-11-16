'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type {
  InstanceType,
  ThemePreference,
  WorkspaceInstance,
  Folder,
  CodeFile,
  FileTreeNode,
} from '@/lib/types';
import {
  createInstance as createInstanceDB,
  deleteInstance as deleteInstanceDB,
  loadUserFolders,
  loadUserInstances,
  updateInstance as updateInstanceDB,
  createFolder as createFolderDB,
  deleteFolder as deleteFolderDB,
  updateFolder as updateFolderDB,
} from '@/lib/db/instances';
import { nanoid } from 'nanoid';

interface WorkspaceContextValue {
  instances: WorkspaceInstance[];
  setInstances: React.Dispatch<React.SetStateAction<WorkspaceInstance[]>>;
  folders: Folder[];
  setFolders: React.Dispatch<React.SetStateAction<Folder[]>>;
  loading: boolean;
  error: string | null;
  themePreference: ThemePreference;
  setThemePreference: React.Dispatch<React.SetStateAction<ThemePreference>>;
  settingsOpen: boolean;
  setSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  newInstanceOpen: boolean;
  setNewInstanceOpen: React.Dispatch<React.SetStateAction<boolean>>;
  activeInstanceId: string | null;
  activeInstance: WorkspaceInstance | null;
  setActiveInstance: React.Dispatch<React.SetStateAction<WorkspaceInstance | null>>;
  selectInstance: (id: string) => void;
  createInstance: (title: string, type: InstanceType, additionalData?: any) => Promise<void>;
  renameInstance: (id: string, title: string) => Promise<void>;
  deleteInstance: (id: string) => Promise<void>;
  createFolder: (name: string, parentId?: string) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  moveFolder: (folderId: string, parentId: string | null) => Promise<void>;
  moveInstanceToFolder: (instanceId: string, folderId: string | null) => Promise<void>;
}

const STORAGE_KEYS = {
  theme: 'mimir.themePreference',
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

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

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const params = useParams();
  const activeInstanceId = (params?.id as string) || null;

  const [instances, setInstances] = useState<WorkspaceInstance[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [themePreference, setThemePreference] = useState<ThemePreference>('light');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newInstanceOpen, setNewInstanceOpen] = useState(false);
  const [activeInstance, setActiveInstance] = useState<WorkspaceInstance | null>(null);

  // Load instances/folders once
  useEffect(() => {
    const loadData = async () => {
      try {
        const [loadedInstances, loadedFolders] = await Promise.all([
          loadUserInstances(),
          loadUserFolders(),
        ]);
        setInstances(loadedInstances);
        setFolders(loadedFolders);
        setError(null);
      } catch (err) {
        console.error('Failed to load workspace data:', err);
        setError('Failed to load workspace data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Keep active instance in sync with route + state
  useEffect(() => {
    if (!activeInstanceId) {
      setActiveInstance(null);
      return;
    }
    const instance = instances.find((i) => i.id === activeInstanceId) || null;
    setActiveInstance(instance);
  }, [activeInstanceId, instances]);

  // Load theme preference
  useEffect(() => {
    const storedTheme = localStorage.getItem(STORAGE_KEYS.theme) as ThemePreference | null;
    if (storedTheme) {
      setThemePreference(storedTheme);
      applyThemePreference(storedTheme);
    } else {
      setThemePreference('light');
      applyThemePreference('light');
    }
  }, []);

  // Persist theme preference
  useEffect(() => {
    if (!loading) {
      localStorage.setItem(STORAGE_KEYS.theme, themePreference);
      applyThemePreference(themePreference);
    }
  }, [themePreference, loading]);

  // React to system theme changes when in system mode
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

  const selectInstance = (id: string) => {
    const instance = instances.find((i) => i.id === id);
    if (instance) {
      router.push(`/workspace/${instance.type}/${id}`);
    }
  };

  const createInstance = async (title: string, type: InstanceType, additionalData?: any) => {
    const trimmed = title.trim();
    if (!trimmed) return;

    const instanceData = createInstanceData(type);
    const finalData = additionalData ? { ...instanceData, ...additionalData } : instanceData;
    const payload = { title: trimmed, type, folderId: null, data: finalData };

    try {
      const newInstance = await createInstanceDB(payload);
      setInstances((prev) => [...prev, newInstance]);
      router.push(`/workspace/${newInstance.type}/${newInstance.id}`);
    } catch (err) {
      console.error('Failed to create instance:', err);
      throw err;
    }
  };

  const renameInstance = async (id: string, title: string) => {
    const nextTitle = title.trim();
    if (!nextTitle) return;

    setInstances((prev) =>
      prev.map((instance) => (instance.id === id ? { ...instance, title: nextTitle } : instance))
    );
    if (id === activeInstanceId) {
      setActiveInstance((prev) => (prev ? { ...prev, title: nextTitle } : null));
    }

    try {
      await updateInstanceDB(id, { title: nextTitle });
    } catch (err) {
      console.error('Failed to rename instance:', err);
    }
  };

  const deleteInstance = async (id: string) => {
    setInstances((prev) => prev.filter((instance) => instance.id !== id));

    if (id === activeInstanceId) {
      router.push('/workspace');
    }

    try {
      await deleteInstanceDB(id);
    } catch (err) {
      console.error('Failed to delete instance:', err);
    }
  };

  const createFolder = async (name: string, parentId?: string) => {
    try {
      const newFolder = await createFolderDB(name, parentId || null);
      setFolders((prev) => [...prev, newFolder]);
    } catch (err) {
      console.error('Failed to create folder:', err);
    }
  };

  const renameFolder = async (id: string, name: string) => {
    const nextName = name.trim();
    if (!nextName) return;

    setFolders((prev) => prev.map((folder) => (folder.id === id ? { ...folder, name: nextName } : folder)));
    try {
      await updateFolderDB(id, nextName);
    } catch (err) {
      console.error('Failed to rename folder:', err);
    }
  };

  const deleteFolder = async (id: string) => {
    setFolders((prev) => prev.filter((folder) => folder.id !== id));
    try {
      await deleteFolderDB(id);
    } catch (err) {
      console.error('Failed to delete folder:', err);
    }
  };

  const moveFolder = async (folderId: string, parentId: string | null) => {
    setFolders((prev) =>
      prev.map((folder) => (folder.id === folderId ? { ...folder, parentFolderId: parentId } : folder))
    );
    try {
      await updateFolderDB(folderId, undefined, parentId);
    } catch (err) {
      console.error('Failed to move folder:', err);
    }
  };

  const moveInstanceToFolder = async (instanceId: string, folderId: string | null) => {
    setInstances((prev) =>
      prev.map((instance) => (instance.id === instanceId ? { ...instance, folderId } : instance))
    );
    if (instanceId === activeInstanceId) {
      setActiveInstance((prev) => (prev ? { ...prev, folderId } : null));
    }
    try {
      await updateInstanceDB(instanceId, { folderId });
    } catch (err) {
      console.error('Failed to move instance:', err);
    }
  };

  const value = useMemo(
    (): WorkspaceContextValue => ({
      instances,
      setInstances,
      folders,
      setFolders,
      loading,
      error,
      themePreference,
      setThemePreference,
      settingsOpen,
      setSettingsOpen,
      newInstanceOpen,
      setNewInstanceOpen,
      activeInstanceId,
      activeInstance,
      setActiveInstance,
      selectInstance,
      createInstance,
      renameInstance,
      deleteInstance,
      createFolder,
      renameFolder,
      deleteFolder,
      moveFolder,
      moveInstanceToFolder,
    }),
    [
      instances,
      folders,
      loading,
      error,
      themePreference,
      settingsOpen,
      newInstanceOpen,
      activeInstanceId,
      activeInstance,
    ]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export const useWorkspace = (): WorkspaceContextValue => {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return ctx;
};
