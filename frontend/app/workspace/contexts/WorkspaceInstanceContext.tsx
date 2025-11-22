'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type {
  InstanceType,
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

interface WorkspaceInstanceContextValue {
  instances: WorkspaceInstance[];
  setInstances: React.Dispatch<React.SetStateAction<WorkspaceInstance[]>>;
  folders: Folder[];
  setFolders: React.Dispatch<React.SetStateAction<Folder[]>>;
  loading: boolean;
  error: string | null;
  createInstance: (title: string, type: InstanceType, additionalData?: Record<string, unknown>) => Promise<WorkspaceInstance | null>;
  renameInstance: (id: string, title: string) => Promise<void>;
  deleteInstance: (id: string) => Promise<void>;
  createFolder: (name: string, parentId?: string) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  moveFolder: (folderId: string, parentId: string | null) => Promise<void>;
  moveInstanceToFolder: (instanceId: string, folderId: string | null) => Promise<void>;
}

const WorkspaceInstanceContext = createContext<WorkspaceInstanceContextValue | null>(null);

const createInstanceData = (type: InstanceType): Record<string, unknown> => {
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

export const WorkspaceInstanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [instances, setInstances] = useState<WorkspaceInstance[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const createInstance = useCallback(async (
    title: string,
    type: InstanceType,
    additionalData?: Record<string, unknown>
  ): Promise<WorkspaceInstance | null> => {
    const trimmed = title.trim();
    if (!trimmed) return null;

    const instanceData = createInstanceData(type);
    const finalData = additionalData ? { ...instanceData, ...additionalData } : instanceData;
    const payload = { title: trimmed, type, folderId: null, data: finalData };

    try {
      const newInstance = await createInstanceDB(payload);
      setInstances((prev) => [...prev, newInstance]);
      return newInstance;
    } catch (err) {
      console.error('Failed to create instance:', err);
      throw err;
    }
  }, []);

  const renameInstance = useCallback(async (id: string, title: string) => {
    const nextTitle = title.trim();
    if (!nextTitle) return;

    setInstances((prev) =>
      prev.map((instance) => (instance.id === id ? { ...instance, title: nextTitle } : instance))
    );

    try {
      await updateInstanceDB(id, { title: nextTitle });
    } catch (err) {
      console.error('Failed to rename instance:', err);
    }
  }, []);

  const deleteInstance = useCallback(async (id: string) => {
    setInstances((prev) => prev.filter((instance) => instance.id !== id));

    try {
      await deleteInstanceDB(id);
    } catch (err) {
      console.error('Failed to delete instance:', err);
    }
  }, []);

  const createFolder = useCallback(async (name: string, parentId?: string) => {
    try {
      const newFolder = await createFolderDB(name, parentId || null);
      setFolders((prev) => [...prev, newFolder]);
    } catch (err) {
      console.error('Failed to create folder:', err);
    }
  }, []);

  const renameFolder = useCallback(async (id: string, name: string) => {
    const nextName = name.trim();
    if (!nextName) return;

    setFolders((prev) => prev.map((folder) => (folder.id === id ? { ...folder, name: nextName } : folder)));
    try {
      await updateFolderDB(id, nextName);
    } catch (err) {
      console.error('Failed to rename folder:', err);
    }
  }, []);

  const deleteFolder = useCallback(async (id: string) => {
    setFolders((prev) => prev.filter((folder) => folder.id !== id));
    try {
      await deleteFolderDB(id);
    } catch (err) {
      console.error('Failed to delete folder:', err);
    }
  }, []);

  const moveFolder = useCallback(async (folderId: string, parentId: string | null) => {
    setFolders((prev) =>
      prev.map((folder) => (folder.id === folderId ? { ...folder, parentFolderId: parentId } : folder))
    );
    try {
      await updateFolderDB(folderId, undefined, parentId);
    } catch (err) {
      console.error('Failed to move folder:', err);
    }
  }, []);

  const moveInstanceToFolder = useCallback(async (instanceId: string, folderId: string | null) => {
    setInstances((prev) =>
      prev.map((instance) => (instance.id === instanceId ? { ...instance, folderId } : instance))
    );
    try {
      await updateInstanceDB(instanceId, { folderId });
    } catch (err) {
      console.error('Failed to move instance:', err);
    }
  }, []);

  const value: WorkspaceInstanceContextValue = {
    instances,
    setInstances,
    folders,
    setFolders,
    loading,
    error,
    createInstance,
    renameInstance,
    deleteInstance,
    createFolder,
    renameFolder,
    deleteFolder,
    moveFolder,
    moveInstanceToFolder,
  };

  return (
    <WorkspaceInstanceContext.Provider value={value}>
      {children}
    </WorkspaceInstanceContext.Provider>
  );
};

export const useWorkspaceInstances = (): WorkspaceInstanceContextValue => {
  const ctx = useContext(WorkspaceInstanceContext);
  if (!ctx) {
    throw new Error('useWorkspaceInstances must be used within a WorkspaceInstanceProvider');
  }
  return ctx;
};
