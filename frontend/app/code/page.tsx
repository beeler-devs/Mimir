'use client';

import React from 'react';
import { WorkspaceLayout } from '@/components/layout';
import { CodeEditor } from '@/components/tabs/CodeEditor';
import { AISidePanel } from '@/components/ai/AISidePanel';

/**
 * Code tab page - code editor with AI assistance
 */
export default function CodePage() {
  return (
    <WorkspaceLayout sidebar={<AISidePanel />}>
      <CodeEditor />
    </WorkspaceLayout>
  );
}

