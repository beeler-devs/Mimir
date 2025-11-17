'use client';

import React, { useRef, useState, useCallback } from 'react';
import { GridComponent } from '@/lib/focusView';
import { CodeWorkspace } from '@/components/code/CodeWorkspace';
import { TextEditor } from '@/components/tabs/TextEditor';
import { PDFViewer } from '@/components/tabs/PDFViewer';
import { VoiceButton } from '@/components/ai/VoiceButton';
import { AnnotateCanvas } from '@/components/tabs/AnnotateCanvas';
import { AISidePanel, AISidePanelRef } from '@/components/ai/AISidePanel';
import { MessageSquare } from 'lucide-react';

interface FocusViewComponentRendererProps {
  component: GridComponent;
  onUpdate: (updates: Partial<GridComponent>) => void;
}

/**
 * Renders the actual component content based on type
 *
 * This component acts as a wrapper that:
 * - Selects the appropriate component to render
 * - Handles component-specific configurations
 * - Manages "highlight for ask" functionality
 * - Provides data persistence
 */
export const FocusViewComponentRenderer: React.FC<FocusViewComponentRendererProps> = ({
  component,
  onUpdate,
}) => {
  const chatPanelRef = useRef<AISidePanelRef>(null);
  const [highlightedText, setHighlightedText] = useState<string | null>(null);

  // Handle text selection for "Ask Mimir" feature
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();

    if (text && text.length > 0 && component.config?.enableHighlightForAsk) {
      setHighlightedText(text);

      // Add to chat if chat is enabled
      if (chatPanelRef.current) {
        chatPanelRef.current.addToChat(text);
      }
    }
  }, [component.config?.enableHighlightForAsk]);

  // Render based on component type
  switch (component.type) {
    case 'chat':
      return (
        <div className="h-full">
          <AISidePanel
            ref={chatPanelRef}
            instances={[]}
            folders={[]}
          />
        </div>
      );

    case 'code-editor':
      return (
        <div
          className="h-full"
          onMouseUp={handleTextSelection}
        >
          <CodeWorkspace
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
      );

    case 'text-editor':
      return (
        <div
          className="h-full"
          onMouseUp={handleTextSelection}
        >
          <TextEditor
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
      );

    case 'pdf-viewer':
      return (
        <div
          className="h-full"
          onMouseUp={handleTextSelection}
        >
          <PDFViewer
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
              if (component.config?.enableHighlightForAsk && chatPanelRef.current) {
                chatPanelRef.current.addToChat(text);
              }
            }}
          />
        </div>
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
        <div className="h-full">
          <AnnotateCanvas
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
