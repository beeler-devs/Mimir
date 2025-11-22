'use client';

import React, { useEffect, useState } from 'react';
import { InstanceSidebar, NewInstanceModal, SearchInstancesModal, SettingsModal } from '@/components/workspace';
import { OnboardingModal } from '@/components/onboarding';
import { WorkspaceProvider, useWorkspace } from './WorkspaceProvider';
import { ResizeProvider, useResize } from '@/contexts/ResizeContext';
import { ResizeHandle, DragOverlay } from '@/components/layout/ResizeHandle';
import { useAuth } from '@/lib/auth';
import { getOrCreateUserPreferences, markOnboardingComplete } from '@/lib/userPreferences';

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

  const {
    leftWidth,
    rightWidth,
    leftCollapsed,
    rightCollapsed,
    isDragging,
  } = useResize();

  const { user } = useAuth();
  const [instanceSearchOpen, setInstanceSearchOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const lastCheckedUserId = React.useRef<string | null>(null);

  // Check if user has completed onboarding
  useEffect(() => {
    const checkOnboarding = async () => {
      if (!user?.id) {
        // User logged out, reset the ref
        lastCheckedUserId.current = null;
        setOnboardingOpen(false);
        return;
      }

      // Prevent duplicate checks for the same user (when user object reference changes)
      if (lastCheckedUserId.current === user.id) {
        return;
      }

      lastCheckedUserId.current = user.id;

      try {
        const preferences = await getOrCreateUserPreferences(user.id);
        if (!preferences.hasCompletedOnboarding) {
          setOnboardingOpen(true);
        }
        setOnboardingError(null);
      } catch (error) {
        console.error('Error checking onboarding status:', error);
        // Show onboarding anyway if we can't check - better to show it than not
        setOnboardingOpen(true);
        setOnboardingError('Could not load preferences. You can still complete the onboarding.');
      }
    };

    checkOnboarding();
  }, [user?.id]);

  // Handle keyboard shortcuts
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

  // Handle onboarding completion
  const handleOnboardingComplete = async () => {
    if (!user?.id) {
      // If no user, just close the modal
      setOnboardingOpen(false);
      return;
    }

    try {
      await markOnboardingComplete(user.id);
      setOnboardingOpen(false);
      setOnboardingError(null);
    } catch (error) {
      console.error('Error marking onboarding as complete:', error);
      // If marking complete fails, close anyway - user has seen the onboarding
      // Better UX than keeping them stuck
      setOnboardingOpen(false);
      setOnboardingError(null);
    }
  };

  // Keep the chrome rendered even while individual pages change
  return (
    <>
      {/* Drag overlay to capture mouse events during resize */}
      <DragOverlay />

      <div
        className="flex h-screen bg-background overflow-hidden"
        style={{
          '--left-width': `${leftWidth}px`,
          '--right-width': `${rightWidth}px`,
        } as React.CSSProperties}
      >
        {/* Left Sidebar with resize handle */}
        <div
          className={`
            relative flex-shrink-0
            ${isDragging ? '' : 'transition-[width] duration-300'}
          `}
          style={{ width: `${leftWidth}px` }}
        >
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
          {!leftCollapsed && <ResizeHandle position="left" />}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 h-full overflow-hidden min-w-0">
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

        <NewInstanceModal
          open={newInstanceOpen}
          onClose={() => setNewInstanceOpen(false)}
          onCreate={createInstance}
        />

        <OnboardingModal
          open={onboardingOpen}
          onComplete={handleOnboardingComplete}
        />
      </div>
    </>
  );
}

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <ResizeProvider>
      <WorkspaceProvider>
        <WorkspaceShell>{children}</WorkspaceShell>
      </WorkspaceProvider>
    </ResizeProvider>
  );
}
