'use client';

import React from 'react';
import { PanelsLeftRight } from 'lucide-react';
import { VoiceButton } from '@/components/ai/VoiceButton';
import { useResize } from '@/contexts/ResizeContext';
import { ResizeHandle } from './ResizeHandle';
import { useAuth } from '@/lib/auth/AuthContext';

interface SidebarControlProps {
  collapseSidebar?: () => void;
  sidebarOpen?: boolean;
  setSidebarOpen?: (open: boolean) => void;
}

interface WorkspaceLayoutProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  showSidebar?: boolean; // Control whether to show the AI panel
}

/**
 * Split layout with main content area and collapsible AI sidepanel
 */
export const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = ({ children, sidebar, showSidebar = true }) => {
  const {
    rightWidth,
    rightCollapsed,
    toggleRightCollapsed,
    setRightCollapsed,
    isDragging,
  } = useResize();

  const { user } = useAuth();

  const sidebarOpen = !rightCollapsed;
  const setSidebarOpen = (open: boolean) => setRightCollapsed(!open);

  const canControlSidebar = React.isValidElement(sidebar);
  const sidebarContent = canControlSidebar
    ? React.cloneElement(sidebar as React.ReactElement<SidebarControlProps>, {
      collapseSidebar: () => setSidebarOpen(false),
      sidebarOpen,
      setSidebarOpen,
    })
    : sidebar;

  return (
    <div className="flex h-full overflow-hidden relative">
      {/* Main Content Area */}
      <div className="flex-1 overflow-auto bg-[var(--main-bg)] dark:bg-background min-w-0">
        {children}
      </div>

      {/* AI Sidepanel - only render when showSidebar is true and sidebar content exists */}
      {showSidebar && sidebar && (
        <div
          className={`
            relative bg-transparent flex-shrink-0
            ${isDragging ? '' : 'transition-[width] duration-300 ease-in-out'}
            overflow-hidden
            border-l border-border
          `}
          style={{ width: `${rightWidth}px` }}
        >
          {/* Resize handle on left edge */}
          {!rightCollapsed && <ResizeHandle position="right" />}

          <div className={`${sidebarOpen ? 'block' : 'hidden'} h-full w-full overflow-hidden`}>
            {sidebarContent}
          </div>

          {sidebarOpen ? (
            !canControlSidebar && (
              <button
                onClick={() => toggleRightCollapsed()}
                className="
                  absolute top-3 left-3
                  p-2 rounded-lg border border-border
                  bg-background hover:bg-muted transition-colors
                  text-muted-foreground hover:text-foreground
                "
                aria-label="Collapse sidebar"
              >
                <PanelsLeftRight className="h-4 w-4" />
              </button>
            )
          ) : (
            <div className="h-full flex flex-col items-center py-4 space-y-4">
              <button
                onClick={() => toggleRightCollapsed()}
                className="
                  p-2 rounded-lg border border-border
                  bg-background hover:bg-muted transition-colors
                  text-muted-foreground hover:text-foreground
                "
                aria-label="Expand sidebar"
              >
                <PanelsLeftRight className="h-4 w-4" />
              </button>
              <VoiceButton
                size="sm"
                userId={user?.id || 'guest-user'}
                instanceId="default"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
