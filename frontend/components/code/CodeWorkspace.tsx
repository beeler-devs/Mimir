'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/common';
import { Play, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { FileTree } from './FileTree';
import { FileTabs } from './FileTabs';
import { MultiFileEditor } from './MultiFileEditor';
import { OutputConsole } from './OutputConsole';
import { CodeFile, FileTreeNode, CodeLanguage, CodeExecutionResult } from '@/lib/types';
import { nanoid } from 'nanoid';

interface CodeWorkspaceProps {
  initialFiles?: CodeFile[];
  initialFileTree?: FileTreeNode[];
  onSave?: (payload: {
    files: CodeFile[];
    fileTree: FileTreeNode[];
    activeFilePath: string | null;
    openFiles: string[];
  }) => void;
}

/**
 * Main code workspace component
 * Combines file tree, editor, tabs, and console with Python execution
 */
export const CodeWorkspace: React.FC<CodeWorkspaceProps> = ({
  initialFiles = [],
  initialFileTree = [],
  onSave,
}) => {
  // State
  const [files, setFiles] = useState<CodeFile[]>(
    initialFiles.length > 0
      ? initialFiles
      : [
          {
            id: nanoid(),
            name: 'main.py',
            path: 'main.py',
            content: '# Welcome to Mimir Code Editor\nprint("Hello, World!")\n',
            language: 'python',
          },
        ]
  );

  const [fileTree, setFileTree] = useState<FileTreeNode[]>(
    initialFileTree.length > 0
      ? initialFileTree
      : [
          {
            id: nanoid(),
            name: 'main.py',
            type: 'file',
            parentId: null,
            language: 'python',
            path: 'main.py',
          },
        ]
  );

  const [activeFilePath, setActiveFilePath] = useState<string | null>(
    files.length > 0 ? files[0].path : null
  );

  const [openFiles, setOpenFiles] = useState<string[]>(
    files.length > 0 ? [files[0].path] : []
  );

  const [executionResult, setExecutionResult] = useState<CodeExecutionResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isFileTreeCollapsed, setIsFileTreeCollapsed] = useState(false);
  const [isConsoleCollapsed, setIsConsoleCollapsed] = useState(false);

  const workerRef = useRef<Worker | null>(null);

  // Initialize Pyodide worker
  useEffect(() => {
    // Only initialize worker in browser environment
    if (typeof window === 'undefined') return;

    workerRef.current = new Worker(
      new URL('../../workers/python.worker.ts', import.meta.url)
    );

    workerRef.current.onmessage = (event: MessageEvent) => {
      const { type, output, error, executionTime } = event.data;

      switch (type) {
        case 'ready':
          console.log('Pyodide initialized and ready');
          break;

        case 'success':
          setExecutionResult({
            status: 'success',
            output,
            executionTime,
          });
          setIsRunning(false);
          break;

        case 'error':
          setExecutionResult({
            status: 'error',
            output,
            error,
            executionTime,
          });
          setIsRunning(false);
          break;
      }
    };

    workerRef.current.postMessage({ type: 'init' });

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // Auto-save when files or structure changes
  useEffect(() => {
    if (onSave) {
      const timeoutId = setTimeout(() => {
        onSave({ files, fileTree, activeFilePath, openFiles });
      }, 1000);

      return () => clearTimeout(timeoutId);
    }
  }, [files, fileTree, activeFilePath, openFiles, onSave]);

  // Get language from file extension
  const getLanguageFromExtension = (filename: string): CodeLanguage => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'py':
        return 'python';
      case 'js':
        return 'javascript';
      case 'ts':
        return 'typescript';
      case 'java':
        return 'java';
      case 'cpp':
      case 'cc':
      case 'cxx':
        return 'cpp';
      default:
        return 'python';
    }
  };

  // Build full path for a node
  const buildPath = (parentId: string | null, name: string): string => {
    if (!parentId) return name;

    const parent = fileTree.find((n) => n.id === parentId);
    if (!parent || parent.type === 'file') return name;

    return buildPath(parent.parentId, `${parent.name}/${name}`);
  };

  // File operations
  const handleCreateFile = useCallback(
    (parentId: string | null, name: string, language: CodeLanguage) => {
      const id = nanoid();
      const path = buildPath(parentId, name);

      const newFile: CodeFile = {
        id,
        name,
        path,
        content: '',
        language,
      };

      const newTreeNode: FileTreeNode = {
        id,
        name,
        type: 'file',
        parentId,
        language,
        path,
      };

      setFiles((prev) => [...prev, newFile]);
      setFileTree((prev) => [...prev, newTreeNode]);
      setActiveFilePath(path);
      setOpenFiles((prev) => [...prev, path]);
    },
    [fileTree]
  );

  const handleCreateFolder = useCallback((parentId: string | null, name: string) => {
    const id = nanoid();

    const newTreeNode: FileTreeNode = {
      id,
      name,
      type: 'folder',
      parentId,
      children: [],
    };

    setFileTree((prev) => [...prev, newTreeNode]);
  }, []);

  const handleRenameNode = useCallback(
    (id: string, newName: string) => {
      // Update file tree
      setFileTree((prev) =>
        prev.map((node) => (node.id === id ? { ...node, name: newName } : node))
      );

      // Update file if it's a file
      const node = fileTree.find((n) => n.id === id);
      if (node && node.type === 'file') {
        const oldPath = node.path!;
        const newPath = buildPath(node.parentId, newName);

        setFiles((prev) =>
          prev.map((file) =>
            file.path === oldPath
              ? {
                  ...file,
                  name: newName,
                  path: newPath,
                  language: getLanguageFromExtension(newName),
                }
              : file
          )
        );

        // Update active file path
        if (activeFilePath === oldPath) {
          setActiveFilePath(newPath);
        }

        // Update open files
        setOpenFiles((prev) => prev.map((path) => (path === oldPath ? newPath : path)));
      }
    },
    [fileTree, activeFilePath]
  );

  const handleDeleteNode = useCallback(
    (id: string) => {
      const node = fileTree.find((n) => n.id === id);
      if (!node) return;

      // Collect all descendant ids (including this node)
      const idsToDelete = new Set<string>();
      const filePathsToDelete = new Set<string>();

      const collectDescendants = (targetId: string) => {
        idsToDelete.add(targetId);
        fileTree.forEach((child) => {
          if (child.parentId === targetId) {
            collectDescendants(child.id);
          }
        });
      };

      collectDescendants(id);

      fileTree.forEach((n) => {
        if (idsToDelete.has(n.id) && n.type === 'file' && n.path) {
          filePathsToDelete.add(n.path);
        }
      });

      // Remove from tree and files
      setFileTree((prev) => prev.filter((n) => !idsToDelete.has(n.id)));
      setFiles((prev) => prev.filter((f) => !filePathsToDelete.has(f.path)));
      setOpenFiles((prev) => prev.filter((p) => !filePathsToDelete.has(p)));

      // Switch to another file if active file was deleted
      if (activeFilePath && filePathsToDelete.has(activeFilePath)) {
        const remainingFiles = files.filter((f) => !filePathsToDelete.has(f.path));
        setActiveFilePath(remainingFiles.length > 0 ? remainingFiles[0].path : null);
      }
    },
    [fileTree, files, activeFilePath]
  );

  const handleSelectFile = useCallback(
    (path: string) => {
      setActiveFilePath(path);

      // Add to open files if not already open
      if (!openFiles.includes(path)) {
        setOpenFiles((prev) => [...prev, path]);
      }
    },
    [openFiles]
  );

  const handleCloseFile = useCallback(
    (path: string) => {
      const newOpenFiles = openFiles.filter((p) => p !== path);
      setOpenFiles(newOpenFiles);

      // If closing active file, switch to another
      if (activeFilePath === path) {
        if (newOpenFiles.length > 0) {
          setActiveFilePath(newOpenFiles[newOpenFiles.length - 1]);
        } else {
          setActiveFilePath(null);
        }
      }
    },
    [openFiles, activeFilePath]
  );

  const handleCodeChange = useCallback((path: string, content: string) => {
    setFiles((prev) =>
      prev.map((file) => (file.path === path ? { ...file, content } : file))
    );
  }, []);

  const handleRunCode = useCallback(() => {
    if (!activeFilePath) return;

    const activeFile = files.find((f) => f.path === activeFilePath);
    if (!activeFile) return;

    // Only support Python for now
    if (activeFile.language !== 'python') {
      setExecutionResult({
        status: 'error',
        error: `Code execution for ${activeFile.language} is not yet supported. Only Python is currently available.`,
      });
      return;
    }

    setIsRunning(true);
    setExecutionResult(null);
    setIsConsoleCollapsed(false); // Open console when running

    workerRef.current?.postMessage({
      type: 'run',
      code: activeFile.content,
      timeout: 30000,
    });
  }, [activeFilePath, files]);

  const handleClearOutput = useCallback(() => {
    setExecutionResult(null);
  }, []);

  // Get open file objects
  const openFileObjects = files.filter((f) => openFiles.includes(f.path));

  // Keyboard shortcut for running code (Cmd/Ctrl + Enter)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRunCode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRunCode]);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/30">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsFileTreeCollapsed(!isFileTreeCollapsed)}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            title={isFileTreeCollapsed ? 'Show file tree' : 'Hide file tree'}
          >
            {isFileTreeCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>

          <div className="h-4 w-px bg-border" />

          <span className="text-sm text-muted-foreground">
            {activeFilePath || 'No file selected'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={handleRunCode}
            disabled={!activeFilePath || isRunning}
            size="sm"
            variant="secondary"
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            {isRunning ? 'Running...' : 'Run'}
          </Button>

          <span className="text-xs text-muted-foreground">⌘⏎</span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* File tree */}
        {!isFileTreeCollapsed && (
          <div className="w-64 border-r border-border flex-shrink-0">
            <FileTree
              nodes={fileTree}
              activeFilePath={activeFilePath}
              onSelectFile={handleSelectFile}
              onCreateFile={handleCreateFile}
              onCreateFolder={handleCreateFolder}
              onRename={handleRenameNode}
              onDelete={handleDeleteNode}
            />
          </div>
        )}

        {/* Editor area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* File tabs */}
          <FileTabs
            openFiles={openFileObjects}
            activeFilePath={activeFilePath}
            onSelectFile={handleSelectFile}
            onCloseFile={handleCloseFile}
          />

          {/* Editor and console */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Editor */}
            <div className={isConsoleCollapsed ? 'flex-1' : 'flex-[2]'}>
              <MultiFileEditor
                files={files}
                activeFilePath={activeFilePath}
                onCodeChange={handleCodeChange}
              />
            </div>

            {/* Console */}
            {!isConsoleCollapsed && (
              <div className="flex-1 border-t border-border">
                <OutputConsole
                  result={executionResult}
                  isRunning={isRunning}
                  onClear={handleClearOutput}
                />
              </div>
            )}

            {/* Console toggle */}
            <button
              onClick={() => setIsConsoleCollapsed(!isConsoleCollapsed)}
              className="h-6 w-full border-t border-border hover:bg-muted/50 transition-colors flex items-center justify-center"
              title={isConsoleCollapsed ? 'Show console' : 'Hide console'}
            >
              <div className="h-0.5 w-12 bg-border rounded-full" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
