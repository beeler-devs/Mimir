'use client';

import React from 'react';

export interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

/**
 * Navigation tabs component for switching between different views
 * Shadcn-style: clean, rounded, with active state indicators
 */
export const Tabs: React.FC<TabsProps> = ({ tabs, activeTab, onTabChange, className = '' }) => {
  return (
    <div className={`flex space-x-1 border-b border-border ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`
            flex items-center space-x-2 px-4 py-2.5
            text-sm font-medium rounded-t-lg
            transition-all duration-200
            ${
              activeTab === tab.id
                ? 'bg-background text-foreground border-b-2 border-primary -mb-[1px]'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }
          `}
        >
          {tab.icon && <span>{tab.icon}</span>}
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
};

