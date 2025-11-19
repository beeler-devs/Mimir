'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { editor as MonacoEditor } from 'monaco-editor';
import { CodeFile } from '@/lib/types';

interface MultiFileEditorProps {
  files: CodeFile[];
  activeFilePath: string | null;
  onCodeChange: (path: string, content: string) => void;
}

/**
 * Multi-file Monaco Editor with model management
 * Handles multiple files, model switching, and view state preservation
 */
export const MultiFileEditor: React.FC<MultiFileEditorProps> = ({
  files,
  activeFilePath,
  onCodeChange,
}) => {
  const [theme, setTheme] = useState<'vs' | 'vs-dark'>('vs-dark');
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const viewStates = useRef<Map<string, MonacoEditor.ICodeEditorViewState | null>>(new Map());
  const modelsRef = useRef<Map<string, MonacoEditor.ITextModel>>(new Map());

  // Detect theme changes
  useEffect(() => {
    const updateTheme = () => {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'vs-dark' : 'vs');
    };

    updateTheme();

    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  // Get active file
  const activeFile = files.find((f) => f.path === activeFilePath);

  // Handle editor mount
  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Create models for all files
    files.forEach((file) => {
      const uri = monaco.Uri.parse(`file:///${file.path}`);
      let model = monaco.editor.getModel(uri);

      if (!model) {
        model = monaco.editor.createModel(file.content, file.language, uri);
        modelsRef.current.set(file.path, model);

        // Listen to content changes
        model.onDidChangeContent(() => {
          if (model) {
            onCodeChange(file.path, model.getValue());
          }
        });
      }
    });

    // Set initial model
    if (activeFile) {
      const uri = monaco.Uri.parse(`file:///${activeFile.path}`);
      const model = monaco.editor.getModel(uri);
      if (model) {
        editor.setModel(model);
      }
    }
  }, [files, activeFile, onCodeChange]);

  // Switch files when activeFilePath changes
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current || !activeFile) return;

    const editor = editorRef.current;
    const monaco = monacoRef.current;

    // Save current view state
    const currentModel = editor.getModel();
    if (currentModel) {
      const currentUri = currentModel.uri.toString();
      viewStates.current.set(currentUri, editor.saveViewState());
    }

    // Switch to new model
    const uri = monaco.Uri.parse(`file:///${activeFile.path}`);
    let model = monaco.editor.getModel(uri);

    // Create model if it doesn't exist
    if (!model) {
      model = monaco.editor.createModel(activeFile.content, activeFile.language, uri);
      modelsRef.current.set(activeFile.path, model);

      // Listen to content changes
      model.onDidChangeContent(() => {
        onCodeChange(activeFile.path, model!.getValue());
      });
    }

    // Update model content if it's out of sync
    if (model.getValue() !== activeFile.content) {
      model.setValue(activeFile.content);
    }

    // Set the model
    editor.setModel(model);

    // Restore view state
    const savedViewState = viewStates.current.get(uri.toString());
    if (savedViewState) {
      editor.restoreViewState(savedViewState);
    }

    editor.focus();
  }, [activeFilePath, activeFile, onCodeChange]);

  // Cleanup models on unmount
  useEffect(() => {
    return () => {
      modelsRef.current.forEach((model) => model.dispose());
      modelsRef.current.clear();
    };
  }, []);

  if (!activeFile) {
    return (
      <div className="h-full flex items-center justify-center bg-background text-muted-foreground">
        <div className="text-center">
          <p className="text-lg font-medium mb-2">No file selected</p>
          <p className="text-sm">
            Select a file from the explorer or create a new one to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Editor
      height="100%"
      defaultLanguage={activeFile.language}
      defaultValue={activeFile.content}
      theme={theme}
      onMount={handleEditorMount}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        lineNumbers: 'on',
        roundedSelection: true,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        wordWrap: 'on',
        padding: { top: 16, bottom: 16 },
        suggestOnTriggerCharacters: true,
        quickSuggestions: {
          other: true,
          comments: false,
          strings: false,
        },
        parameterHints: {
          enabled: true,
        },
        formatOnPaste: true,
        formatOnType: true,
      }}
    />
  );
};
