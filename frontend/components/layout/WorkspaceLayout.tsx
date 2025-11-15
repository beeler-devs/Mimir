'use client';

import React, { useState } from 'react';
import { PanelsLeftRight } from 'lucide-react';
import { VoiceButton } from '@/components/ai/VoiceButton';

interface SidebarControlProps {
  collapseSidebar?: () => void;
  sidebarOpen?: boolean;
  setSidebarOpen?: (open: boolean) => void;
}

interface WorkspaceLayoutProps {
  children: React.ReactNode;
  sidebar: React.ReactNode;
}

/**
 * Split layout with main content area and collapsible AI sidepanel
 */
export const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = ({ children, sidebar }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
      <div className="flex-1 overflow-auto transition-all duration-300 bg-[var(--main-bg)] dark:bg-background">
        {children}
      </div>
      
      {/* AI Sidepanel */}
      <div
        className={`
          relative bg-transparent
          transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'w-96' : 'w-14'}
          overflow-hidden
        `}
      >
        <div className={`${sidebarOpen ? 'block' : 'hidden'} h-full w-96`}>
          {sidebarContent}
        </div>

        {sidebarOpen ? (
          !canControlSidebar && (
            <button
              onClick={() => setSidebarOpen(false)}
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
              onClick={() => setSidebarOpen(true)}
              className="
                p-2 rounded-lg border border-border
                bg-background hover:bg-muted transition-colors
                text-muted-foreground hover:text-foreground
              "
              aria-label="Expand sidebar"
            >
              <PanelsLeftRight className="h-4 w-4" />
            </button>
            <VoiceButton size="sm" />
          </div>
        )}
      </div>
    </div>
  );
};
