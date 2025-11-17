'use client';

import React, { useState, useCallback, Suspense, lazy } from 'react';
import { GridComponent } from '@/lib/focusView';
import { useFocusViewContext } from '@/lib/FocusViewContext';
import { VoiceButton } from '@/components/ai/VoiceButton';
import { MessageSquare, Loader2 } from 'lucide-react';
import { ChatPanelWrapper } from './ChatPanelWrapper';
import { ComponentErrorBoundary } from './ComponentErrorBoundary';

// Lazy load heavy components to reduce initial bundle size
const LazyCodeWorkspace = lazy(() => import('@/components/code/CodeWorkspace').then(mod => ({ default: mod.CodeWorkspace })));
const LazyTextEditor = lazy(() => import('@/components/tabs/TextEditor').then(mod => ({ default: mod.TextEditor })));
const LazyPDFViewer = lazy(() => import('@/components/tabs/PDFViewer').then(mod => ({ default: mod.PDFViewer })));
const LazyAnnotateCanvas = lazy(() => import('@/components/tabs/AnnotateCanvas').then(mod => ({ default: mod.AnnotateCanvas })));

interface FocusViewComponentRendererProps {
  component: GridComponent;
  onUpdate: (updates: Partial<GridComponent>) => void;
}

/**
 * Loading fallback for lazy-loaded components
 */
const ComponentLoadingFallback: React.FC = () => (
  <div className="h-full flex items-center justify-center">
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Loading component...</p>
    </div>
  </div>
);

/**
 * Renders the actual component content based on type
 *
 * This component acts as a wrapper that:
 * - Selects the appropriate component to render
 * - Handles component-specific configurations
 * - Manages "highlight for ask" functionality via event bus
 * - Provides data persistence
 * - Lazy loads components to optimize bundle size
 * - Wraps components in error boundaries for isolation
 */
export const FocusViewComponentRenderer: React.FC<FocusViewComponentRendererProps> = ({
  component,
  onUpdate,
}) => {
  const { dispatch } = useFocusViewContext();
  const [highlightedText, setHighlightedText] = useState<string | null>(null);

  // Handle text selection for "Ask Mimir" feature
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();

    if (text && text.length > 0 && component.config?.enableHighlightForAsk) {
      setHighlightedText(text);

      // Dispatch event to any listening chat components
      dispatch('ASK_MIMIR', { text });
    }
  }, [component.config?.enableHighlightForAsk, dispatch]);

  // Render based on component type
  switch (component.type) {
    case 'chat':
      return (
        <ComponentErrorBoundary componentType="Chat">
          <Suspense fallback={<ComponentLoadingFallback />}>
            <div className="h-full">
              <ChatPanelWrapper />
            </div>
          </Suspense>
        </ComponentErrorBoundary>
      );

    case 'code-editor':
      return (
        <ComponentErrorBoundary componentType="Code Editor">
          <Suspense fallback={<ComponentLoadingFallback />}>
            <div
              className="h-full"
              onMouseUp={handleTextSelection}
            >
              <LazyCodeWorkspace
                initialFiles={component.config?.files}
                initialFileTree={component.config?.fileTree}
                onSave={(payload) => {
                  onUpdate({
                    config: {
                      ...component.config,
                      files: payload.files,
                      fileTree: payload.fileTree,
                      activeFilePath: payload.activeFilePath,
                      openFiles: payload.openFiles,
                    },
                  });
                }}
              />
            </div>
          </Suspense>
        </ComponentErrorBoundary>
      );

    case 'text-editor':
      return (
        <ComponentErrorBoundary componentType="Text Editor">
          <Suspense fallback={<ComponentLoadingFallback />}>
            <div
              className="h-full"
              onMouseUp={handleTextSelection}
            >
              <LazyTextEditor
                content={component.config?.content || ''}
                onChange={(newContent) => {
                  onUpdate({
                    config: {
                      ...component.config,
                      content: newContent,
                    },
                  });
                }}
              />
            </div>
          </Suspense>
        </ComponentErrorBoundary>
      );

    case 'pdf-viewer':
      return (
        <ComponentErrorBoundary componentType="PDF Viewer">
          <Suspense fallback={<ComponentLoadingFallback />}>
            <div
              className="h-full"
              onMouseUp={handleTextSelection}
            >
              <LazyPDFViewer
                pdfUrl={component.config?.pdfUrl}
                fileName={component.config?.fileName}
                metadata={component.config?.metadata}
                fullText={component.config?.fullText}
                onUpload={(file, url, metadata) => {
                  onUpdate({
                    config: {
                      ...component.config,
                      pdfUrl: url,
                      fileName: file.name,
                      metadata: metadata.metadata,
                      fullText: metadata.fullText,
                    },
                  });
                }}
                onAddToChat={(text) => {
                  if (component.config?.enableHighlightForAsk) {
                    dispatch('ASK_MIMIR', { text });
                  }
                }}
              />
            </div>
          </Suspense>
        </ComponentErrorBoundary>
      );

    case 'voice-input':
      return (
        <div className="h-full flex flex-col items-center justify-center gap-4 p-8">
          <VoiceButton size="md" />
          <p className="text-sm text-muted-foreground text-center">
            Click to start voice interaction
          </p>
        </div>
      );

    case 'annotate-canvas':
      return (
        <ComponentErrorBoundary componentType="Annotation Canvas">
          <Suspense fallback={<ComponentLoadingFallback />}>
            <div className="h-full">
              <LazyAnnotateCanvas
                initialData={component.config?.excalidrawState}
                onStateChange={(state: { elements: any[]; appState: any; files: any }) => {
                  onUpdate({
                    config: {
                      ...component.config,
                      excalidrawState: state,
                    },
                  });
                }}
              />
            </div>
          </Suspense>
        </ComponentErrorBoundary>
      );

    case 'lecture-viewer':
      return (
        <div className="h-full flex items-center justify-center p-8 text-center">
          <div>
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Lecture Viewer</h3>
            <p className="text-sm text-muted-foreground">
              This component will display lecture content with transcripts and video playback.
            </p>
          </div>
        </div>
      );

    case 'flashcard':
      return (
        <div className="h-full flex items-center justify-center p-8 text-center">
          <div>
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Flashcard Viewer</h3>
            <p className="text-sm text-muted-foreground">
              Study with AI-generated flashcards from your course materials.
            </p>
          </div>
        </div>
      );

    case 'calendar':
      return (
        <div className="h-full flex items-center justify-center p-8 text-center">
          <div>
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Calendar</h3>
            <p className="text-sm text-muted-foreground">
              Track your schedule, deadlines, and study sessions.
            </p>
          </div>
        </div>
      );

    case 'pomodoro':
      return (
        <div className="h-full flex items-center justify-center p-8 text-center">
          <div>
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Pomodoro Timer</h3>
            <p className="text-sm text-muted-foreground">
              Stay focused with timed work sessions and breaks.
            </p>
          </div>
        </div>
      );

    case 'terminal':
      return (
        <div className="h-full flex items-center justify-center p-8 text-center">
          <div>
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Terminal</h3>
            <p className="text-sm text-muted-foreground">
              Run commands and scripts directly in your workspace.
            </p>
          </div>
        </div>
      );

    case 'whiteboard':
      return (
        <div className="h-full flex items-center justify-center p-8 text-center">
          <div>
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Whiteboard</h3>
            <p className="text-sm text-muted-foreground">
              Brainstorm and sketch ideas with a freeform canvas.
            </p>
          </div>
        </div>
      );

    default:
      return (
        <div className="h-full flex items-center justify-center p-8 text-center">
          <div>
            <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Unknown Component</h3>
            <p className="text-sm text-muted-foreground">
              This component type is not yet implemented.
            </p>
          </div>
        </div>
      );
  }
};
