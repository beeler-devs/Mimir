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
      // Find the node being renamed
      const node = fileTree.find((n) => n.id === id);
      if (!node) return;

      // Calculate new path if it's a file
      const newPath = node.type === 'file' ? buildPath(node.parentId, newName) : undefined;
      const oldPath = node.type === 'file' ? node.path! : undefined;

      // Update file tree (including path for files)
      setFileTree((prev) =>
        prev.map((n) => {
          if (n.id === id) {
            return {
              ...n,
              name: newName,
              ...(newPath ? { path: newPath } : {}),
            };
          }
          return n;
        })
      );

      // Update files array if it's a file
      if (node.type === 'file' && oldPath && newPath) {
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

  const handleMoveNode = useCallback(
    (nodeId: string, newParentId: string | null) => {
      // Find the node being moved
      const node = fileTree.find((n) => n.id === nodeId);
      if (!node) return;

      // Prevent moving to the same location
      if (node.parentId === newParentId) return;

      // Prevent moving a folder into itself or its descendants
      if (newParentId) {
        const isDescendant = (parentId: string, targetId: string): boolean => {
          if (parentId === targetId) return true;
          const parent = fileTree.find((n) => n.id === parentId);
          if (!parent || !parent.parentId) return false;
          return isDescendant(parent.parentId, targetId);
        };

        if (node.type === 'folder' && isDescendant(newParentId, nodeId)) {
          return; // Can't move a folder into its own descendants
        }
      }

      // Helper to get full path of a folder by traversing up the tree
      const getFolderPath = (folderId: string | null): string => {
        if (!folderId) return '';
        const folder = fileTree.find((n) => n.id === folderId);
        if (!folder) return '';
        const parentPath = getFolderPath(folder.parentId);
        return parentPath ? `${parentPath}/${folder.name}` : folder.name;
      };

      // Calculate the new base path for the moved node
      const newBasePath = newParentId ? getFolderPath(newParentId) : '';

      // Collect all descendant file IDs and their path updates
      const nodesToUpdate = new Map<string, { oldPath: string; newPath: string }>();

      // Helper to get relative path from moved node to a descendant
      const getRelativePath = (descendantId: string, fromId: string): string => {
        const descendant = fileTree.find((n) => n.id === descendantId);
        if (!descendant) return '';
        if (descendant.parentId === fromId) {
          return descendant.name;
        }
        if (descendant.parentId) {
          const parentRelative = getRelativePath(descendant.parentId, fromId);
          return parentRelative ? `${parentRelative}/${descendant.name}` : descendant.name;
        }
        return descendant.name;
      };

      // Collect all descendants (including the moved node if it's a file)
      const collectDescendants = (targetId: string) => {
        const targetNode = fileTree.find((n) => n.id === targetId);
        if (!targetNode) return;

        if (targetNode.type === 'file' && targetNode.path) {
          // Calculate new path
          let newPath: string;
          if (targetId === nodeId) {
            // This is the moved node itself
            newPath = newBasePath ? `${newBasePath}/${targetNode.name}` : targetNode.name;
          } else {
            // This is a descendant - get relative path from moved folder
            const relativePath = getRelativePath(targetId, nodeId);
            const movedFolderNewPath = newBasePath ? `${newBasePath}/${node.name}` : node.name;
            newPath = `${movedFolderNewPath}/${relativePath}`;
          }
          nodesToUpdate.set(targetId, { oldPath: targetNode.path, newPath });
        }

        // Process children
        fileTree.forEach((child) => {
          if (child.parentId === targetId) {
            collectDescendants(child.id);
          }
        });
      };

      collectDescendants(nodeId);

      // Update file tree - change the parent of the moved node
      setFileTree((prev) =>
        prev.map((n) => {
          if (n.id === nodeId) {
            const update = nodesToUpdate.get(n.id);
            return {
              ...n,
              parentId: newParentId,
              path: update ? update.newPath : n.path,
            };
          }
          // Update paths for descendants
          const update = nodesToUpdate.get(n.id);
          if (update) {
            return { ...n, path: update.newPath };
          }
          return n;
        })
      );

      // Update files array with new paths
      setFiles((prev) =>
        prev.map((file) => {
          const update = Array.from(nodesToUpdate.entries()).find(
            ([, paths]) => paths.oldPath === file.path
          );
          if (update) {
            return { ...file, path: update[1].newPath };
          }
          return file;
        })
      );

      // Update open files with new paths
      setOpenFiles((prev) =>
        prev.map((path) => {
          const update = Array.from(nodesToUpdate.entries()).find(
            ([, paths]) => paths.oldPath === path
          );
          return update ? update[1].newPath : path;
        })
      );

      // Update active file path if it was moved
      if (activeFilePath) {
        const update = Array.from(nodesToUpdate.entries()).find(
          ([, paths]) => paths.oldPath === activeFilePath
        );
        if (update) {
          setActiveFilePath(update[1].newPath);
        }
      }
    },
    [fileTree, activeFilePath]
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
              onMove={handleMoveNode}
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
