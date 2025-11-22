'use client';

import React, { forwardRef } from 'react';
import { AnnotateCanvas } from '@/components/tabs';
import { AnnotateCanvasRef } from '@/components/tabs/AnnotateCanvas';
import type { AnnotateInstance } from '@/lib/types';

interface AnnotationState {
  elements: unknown[];
  appState: unknown;
  files: unknown;
}

interface AnnotateInstanceRendererProps {
  instance: AnnotateInstance;
  onStateChange: (state: AnnotationState) => void;
}

export const AnnotateInstanceRenderer = forwardRef<AnnotateCanvasRef, AnnotateInstanceRendererProps>(
  ({ instance, onStateChange }, ref) => {
    return (
      <AnnotateCanvas
        key={instance.id}
        ref={ref}
        initialData={instance.data.excalidrawState}
        onStateChange={onStateChange}
      />
    );
  }
);

AnnotateInstanceRenderer.displayName = 'AnnotateInstanceRenderer';
