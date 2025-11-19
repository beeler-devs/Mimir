'use client';

import React, { useEffect, useState } from 'react';
import { InstanceSidebar, InstanceCreationModal, SearchInstancesModal, SettingsModal } from '@/components/workspace';
import { WorkspaceProvider, useWorkspace } from './WorkspaceProvider';

function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const {
    instances,
    folders,
    activeInstanceId,
    loading,
    themePreference,
    setThemePreference,
    settingsOpen,
    setSettingsOpen,
    newInstanceOpen,
    setNewInstanceOpen,
    selectInstance,
    renameInstance,
    deleteInstance,
    createInstance,
    createFolder,
    renameFolder,
    deleteFolder,
    moveFolder,
    moveInstanceToFolder,
  } = useWorkspace();
  const [instanceSearchOpen, setInstanceSearchOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (cmdOrCtrl && e.key.toLowerCase() === 'k' && !e.shiftKey) {
        e.preventDefault();
        setInstanceSearchOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Keep the chrome rendered even while individual pages change
  return (
    <div className="flex h-screen bg-background">
      <InstanceSidebar
        instances={instances}
        folders={folders}
        activeInstanceId={activeInstanceId}
        onSelect={selectInstance}
        onCreateInstance={() => setNewInstanceOpen(true)}
        onRename={renameInstance}
        onDelete={deleteInstance}
        onOpenSettings={() => setSettingsOpen(true)}
        onCreateFolder={createFolder}
        onRenameFolder={renameFolder}
        onDeleteFolder={deleteFolder}
        onMoveToFolder={moveInstanceToFolder}
        onMoveFolder={moveFolder}
      />

      <div className="flex-1 h-full overflow-hidden">
        {loading ? (
          <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="text-center">
              <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">Loading workspace...</p>
            </div>
          </div>
        ) : (
          children
        )}
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={themePreference}
        onThemeChange={setThemePreference}
      />

      <SearchInstancesModal
        open={instanceSearchOpen}
        instances={instances}
        onClose={() => setInstanceSearchOpen(false)}
        onSelect={selectInstance}
      />

      <InstanceCreationModal
        open={newInstanceOpen}
        onClose={() => setNewInstanceOpen(false)}
        onCreate={createInstance}
      />
    </div>
  );
}

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <WorkspaceShell>{children}</WorkspaceShell>
    </WorkspaceProvider>
  );
}
