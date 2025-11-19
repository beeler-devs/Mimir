'use client';

import React from 'react';
import { CodeWorkspace } from '@/components/code/CodeWorkspace';
import type { CodeInstance, CodeFile, FileTreeNode } from '@/lib/types';

interface CodeSaveData {
  files: CodeFile[];
  fileTree: FileTreeNode[];
  activeFilePath: string | null;
  openFiles: string[];
}

interface CodeInstanceRendererProps {
  instance: CodeInstance;
  onSave: (data: CodeSaveData) => void;
}

export const CodeInstanceRenderer: React.FC<CodeInstanceRendererProps> = ({
  instance,
  onSave,
}) => {
  return (
    <CodeWorkspace
      initialFiles={instance.data.files}
      initialFileTree={instance.data.fileTree}
      onSave={onSave}
    />
  );
};
