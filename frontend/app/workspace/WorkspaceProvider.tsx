'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type {
  InstanceType,
  ThemePreference,
  WorkspaceInstance,
  Folder,
} from '@/lib/types';
import {
  WorkspaceInstanceProvider,
  useWorkspaceInstances,
  WorkspaceUIProvider,
  useWorkspaceUI,
  WorkspaceActiveProvider,
  useWorkspaceActive,
} from './contexts';

// Legacy interface for backward compatibility
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
  createInstance: (title: string, type: InstanceType, additionalData?: Record<string, unknown>) => Promise<void>;
  renameInstance: (id: string, title: string) => Promise<void>;
  deleteInstance: (id: string) => Promise<void>;
  createFolder: (name: string, parentId?: string) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  moveFolder: (folderId: string, parentId: string | null) => Promise<void>;
  moveInstanceToFolder: (instanceId: string, folderId: string | null) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

// Inner component that has access to all split contexts
const WorkspaceContextBridge: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const instanceCtx = useWorkspaceInstances();
  const uiCtx = useWorkspaceUI();
  const activeCtx = useWorkspaceActive();

  // Wrap createInstance to match legacy signature (void return instead of instance)
  const createInstanceLegacy = async (
    title: string,
    type: InstanceType,
    additionalData?: Record<string, unknown>
  ): Promise<void> => {
    const newInstance = await instanceCtx.createInstance(title, type, additionalData);
    if (newInstance) {
      router.push(`/workspace/${newInstance.type}/${newInstance.id}`);
    }
  };

  // Wrap deleteInstance to handle navigation
  const deleteInstanceWithNavigation = async (id: string): Promise<void> => {
    if (id === activeCtx.activeInstanceId) {
      router.push('/workspace');
    }
    await instanceCtx.deleteInstance(id);
  };

  // Wrap renameInstance to update active instance
  const renameInstanceWithSync = async (id: string, title: string): Promise<void> => {
    await instanceCtx.renameInstance(id, title);
    if (id === activeCtx.activeInstanceId) {
      activeCtx.setActiveInstance((prev) => (prev ? { ...prev, title: title.trim() } : null));
    }
  };

  // Wrap moveInstanceToFolder to update active instance
  const moveInstanceToFolderWithSync = async (instanceId: string, folderId: string | null): Promise<void> => {
    await instanceCtx.moveInstanceToFolder(instanceId, folderId);
    if (instanceId === activeCtx.activeInstanceId) {
      activeCtx.setActiveInstance((prev) => (prev ? { ...prev, folderId } : null));
    }
  };

  // Compose the legacy context value from split contexts
  const value = useMemo(
    (): WorkspaceContextValue => ({
      // From WorkspaceInstanceContext
      instances: instanceCtx.instances,
      setInstances: instanceCtx.setInstances,
      folders: instanceCtx.folders,
      setFolders: instanceCtx.setFolders,
      loading: instanceCtx.loading,
      error: instanceCtx.error,
      createInstance: createInstanceLegacy,
      renameInstance: renameInstanceWithSync,
      deleteInstance: deleteInstanceWithNavigation,
      createFolder: instanceCtx.createFolder,
      renameFolder: instanceCtx.renameFolder,
      deleteFolder: instanceCtx.deleteFolder,
      moveFolder: instanceCtx.moveFolder,
      moveInstanceToFolder: moveInstanceToFolderWithSync,
      // From WorkspaceUIContext
      themePreference: uiCtx.themePreference,
      setThemePreference: uiCtx.setThemePreference,
      settingsOpen: uiCtx.settingsOpen,
      setSettingsOpen: uiCtx.setSettingsOpen,
      newInstanceOpen: uiCtx.newInstanceOpen,
      setNewInstanceOpen: uiCtx.setNewInstanceOpen,
      // From WorkspaceActiveContext
      activeInstanceId: activeCtx.activeInstanceId,
      activeInstance: activeCtx.activeInstance,
      setActiveInstance: activeCtx.setActiveInstance,
      selectInstance: activeCtx.selectInstance,
    }),
    [
      instanceCtx.instances,
      instanceCtx.folders,
      instanceCtx.loading,
      instanceCtx.error,
      instanceCtx.createFolder,
      instanceCtx.renameFolder,
      instanceCtx.deleteFolder,
      instanceCtx.moveFolder,
      uiCtx.themePreference,
      uiCtx.settingsOpen,
      uiCtx.newInstanceOpen,
      activeCtx.activeInstanceId,
      activeCtx.activeInstance,
      activeCtx.selectInstance,
      router,
    ]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <WorkspaceInstanceProvider>
      <WorkspaceUIProvider>
        <WorkspaceActiveProvider>
          <WorkspaceContextBridge>{children}</WorkspaceContextBridge>
        </WorkspaceActiveProvider>
      </WorkspaceUIProvider>
    </WorkspaceInstanceProvider>
  );
};

// Legacy hook - still works but components can now use the specific hooks
export const useWorkspace = (): WorkspaceContextValue => {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return ctx;
};

// Re-export split context hooks for gradual migration
export { useWorkspaceInstances, useWorkspaceUI, useWorkspaceActive } from './contexts';
