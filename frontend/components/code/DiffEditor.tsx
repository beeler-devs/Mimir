'use client';

import React, { useEffect, useRef, useState } from 'react';
import { editor as MonacoEditor } from 'monaco-editor';
import { Button } from '@/components/common';
import { Check, X } from 'lucide-react';

interface DiffEditorProps {
  originalCode: string;
  modifiedCode: string;
  language: string;
  onAccept: () => void;
  onReject: () => void;
  theme?: 'vs' | 'vs-dark';
}

/**
 * Monaco Diff Editor for showing AI-suggested code changes
 * Allows user to accept or reject the changes
 */
export const DiffEditor: React.FC<DiffEditorProps> = ({
  originalCode,
  modifiedCode,
  language,
  onAccept,
  onReject,
  theme = 'vs',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const diffEditorRef = useRef<MonacoEditor.IStandaloneDiffEditor | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Dynamically import monaco to avoid SSR issues
    import('monaco-editor').then((monaco) => {
      if (!containerRef.current) return;

      // Create diff editor
      const diffEditor = monaco.editor.createDiffEditor(containerRef.current, {
        renderSideBySide: true,
        originalEditable: false,
        readOnly: true,
        renderIndicators: true,
        ignoreTrimWhitespace: false,
        renderOverviewRuler: true,
        theme: theme,
      });

      // Create models
      const originalModel = monaco.editor.createModel(originalCode, language);
      const modifiedModel = monaco.editor.createModel(modifiedCode, language);

      // Set models
      diffEditor.setModel({
        original: originalModel,
        modified: modifiedModel,
      });

      diffEditorRef.current = diffEditor;

      // Cleanup
      return () => {
        originalModel.dispose();
        modifiedModel.dispose();
        diffEditor.dispose();
      };
    });
  }, [originalCode, modifiedCode, language, theme]);

  // Update theme when it changes
  useEffect(() => {
    if (diffEditorRef.current) {
      import('monaco-editor').then((monaco) => {
        monaco.editor.setTheme(theme);
      });
    }
  }, [theme]);

  return (
    <div className="flex flex-col h-full">
      {/* Header with actions */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-sm font-medium">AI Suggestion</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={onReject}
            className="flex items-center gap-2"
          >
            <X className="h-4 w-4" />
            Reject
          </Button>
          <Button
            size="sm"
            onClick={onAccept}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
          >
            <Check className="h-4 w-4" />
            Accept
          </Button>
        </div>
      </div>

      {/* Diff editor container */}
      <div ref={containerRef} className="flex-1" />
    </div>
  );
};
