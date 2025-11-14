'use client';

import React from 'react';
import { WorkspaceLayout } from '@/components/layout';
import { TextEditor } from '@/components/tabs/TextEditor';
import { AISidePanel } from '@/components/ai/AISidePanel';

/**
 * Text tab page - rich text editor for notes and problem sets
 */
export default function TextPage() {
  return (
    <WorkspaceLayout sidebar={<AISidePanel />}>
      <TextEditor />
    </WorkspaceLayout>
  );
}

