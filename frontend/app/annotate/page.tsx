'use client';

import React from 'react';
import { WorkspaceLayout } from '@/components/layout';
import { AnnotateCanvas } from '@/components/tabs/AnnotateCanvas';
import { AISidePanel } from '@/components/ai/AISidePanel';

/**
 * Annotate tab page - PDF annotation with Excalidraw
 */
export default function AnnotatePage() {
  return (
    <WorkspaceLayout sidebar={<AISidePanel />}>
      <AnnotateCanvas />
    </WorkspaceLayout>
  );
}

