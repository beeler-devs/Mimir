'use client';

import React, { useState } from 'react';
import { PanelsLeftRight } from 'lucide-react';
import { VoiceButton } from '@/components/ai/VoiceButton';

interface WorkspaceLayoutProps {
  children: React.ReactNode;
  sidebar: React.ReactNode;
}

/**
 * Split layout with main content area and collapsible AI sidepanel
 */
export const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = ({ children, sidebar }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  return (
    <div className="flex h-full overflow-hidden relative">
      {/* Main Content Area */}
      <div className="flex-1 overflow-auto transition-all duration-300">
        {children}
      </div>
      
      {/* AI Sidepanel */}
      <div
        className={`
          relative border-l border-border bg-card
          transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'w-96' : 'w-14'}
          overflow-hidden
        `}
      >
        <div className={`${sidebarOpen ? 'block' : 'hidden'} h-full w-96 pt-12`}>
          {sidebar}
        </div>

        {sidebarOpen ? (
          <button
            onClick={() => setSidebarOpen(false)}
            className="
              absolute top-3 left-3
              p-2 rounded-xl border border-border
              bg-background hover:bg-muted transition-colors
              text-muted-foreground hover:text-foreground
            "
            aria-label="Collapse sidebar"
          >
            <PanelsLeftRight className="h-4 w-4" />
          </button>
        ) : (
          <div className="h-full flex flex-col items-center justify-between py-5">
            <VoiceButton size="sm" />
            <button
              onClick={() => setSidebarOpen(true)}
              className="
                p-2 rounded-xl border border-border
                bg-background hover:bg-muted transition-colors
                text-muted-foreground hover:text-foreground
              "
              aria-label="Expand sidebar"
            >
              <PanelsLeftRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
