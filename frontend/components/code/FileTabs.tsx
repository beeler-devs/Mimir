'use client';

import React from 'react';
import { X, FileCode } from 'lucide-react';
import { CodeFile } from '@/lib/types';

interface FileTabsProps {
  openFiles: CodeFile[];
  activeFilePath: string | null;
  onSelectFile: (path: string) => void;
  onCloseFile: (path: string) => void;
}

/**
 * Horizontal tab bar for open code files
 * Similar to browser tabs or VSCode tabs
 */
export const FileTabs: React.FC<FileTabsProps> = ({
  openFiles,
  activeFilePath,
  onSelectFile,
  onCloseFile,
}) => {
  // Get file extension icon color
  const getLanguageColor = (language: string) => {
    switch (language) {
      case 'python':
        return 'text-blue-500';
      case 'javascript':
        return 'text-yellow-500';
      case 'typescript':
        return 'text-blue-600';
      case 'java':
        return 'text-red-500';
      case 'cpp':
        return 'text-primary';
      default:
        return 'text-gray-500';
    }
  };

  if (openFiles.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border bg-card/30 overflow-x-auto">
      {openFiles.map((file) => {
        const isActive = file.path === activeFilePath;

        return (
          <div
            key={file.path}
            className={`
              group flex items-center gap-2 px-3 py-1.5 rounded-t-md text-sm
              transition-all flex-shrink-0 max-w-[200px] border-b-2
              ${
                isActive
                  ? 'bg-background border-primary text-foreground'
                  : 'bg-transparent border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }
            `}
          >
            <button
              onClick={() => onSelectFile(file.path)}
              className="flex items-center gap-2 flex-1 min-w-0"
            >
              <FileCode className={`h-3.5 w-3.5 flex-shrink-0 ${getLanguageColor(file.language)}`} />
              <span className="truncate">{file.name}</span>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onCloseFile(file.path);
              }}
              className="p-0.5 rounded hover:bg-muted transition-colors"
              title={`Close ${file.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
