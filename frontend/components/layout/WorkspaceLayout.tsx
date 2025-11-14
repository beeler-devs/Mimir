'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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
    <div className="flex h-full overflow-hidden">
      {/* Main Content Area */}
      <div className={`flex-1 overflow-auto transition-all duration-300 ${sidebarOpen ? 'mr-0' : 'mr-0'}`}>
        {children}
      </div>
      
      {/* AI Sidepanel */}
      <div
        className={`
          relative border-l border-border bg-card
          transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'w-96' : 'w-0'}
          overflow-hidden
        `}
      >
        {/* Collapse/Expand Button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={`
            absolute left-0 top-4 -translate-x-1/2
            p-1.5 rounded-full
            bg-background border border-border
            hover:bg-muted transition-colors
            z-10
          `}
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
        
        {/* Sidebar Content */}
        <div className="h-full w-96">
          {sidebar}
        </div>
      </div>
    </div>
  );
};

