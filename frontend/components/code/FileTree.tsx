'use client';

import React, { useState, useRef } from 'react';
import { Tree, NodeRendererProps } from 'react-arborist';
import {
  File,
  Folder as FolderIcon,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Plus,
  MoreVertical,
  FileCode,
} from 'lucide-react';
import { FileTreeNode, CodeLanguage } from '@/lib/types';
import { ContextMenu } from '@/components/common';

interface FileTreeProps {
  nodes: FileTreeNode[];
  activeFilePath: string | null;
  onSelectFile: (path: string) => void;
  onCreateFile: (parentId: string | null, name: string, language: CodeLanguage) => void;
  onCreateFolder: (parentId: string | null, name: string) => void;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
}

/**
 * File tree explorer component using react-arborist
 * Displays files and folders in a VSCode-like tree structure
 */
export const FileTree: React.FC<FileTreeProps> = ({
  nodes,
  activeFilePath,
  onSelectFile,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
}) => {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuButtonRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Get file icon based on language
  const getFileIcon = (language?: CodeLanguage) => {
    return FileCode;
  };

  // Node renderer for custom styling
  const Node = ({ node, style, dragHandle }: NodeRendererProps<FileTreeNode>) => {
    const isFolder = node.data.type === 'folder';
    const isActive = !isFolder && node.data.path === activeFilePath;
    const isMenuOpen = menuOpenId === node.data.id;

    const Icon = isFolder
      ? node.isOpen
        ? FolderOpen
        : FolderIcon
      : getFileIcon(node.data.language);

    const Chevron = node.isOpen ? ChevronDown : ChevronRight;

    return (
      <div
        ref={dragHandle}
        style={style}
        className={`
          group flex items-center gap-1.5 px-2 py-1 text-sm cursor-pointer rounded-md
          ${isActive ? 'bg-[#F5F5F5] text-foreground' : 'hover:bg-muted/50'}
        `}
        onClick={() => {
          if (isFolder) {
            node.toggle();
          } else if (node.data.path) {
            onSelectFile(node.data.path);
          }
        }}
      >
        {/* Chevron for folders */}
        {isFolder && (
          <Chevron className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        )}

        {/* Icon */}
        <Icon
          className={`h-3.5 w-3.5 flex-shrink-0 ${
            isFolder ? 'text-muted-foreground' : 'text-blue-500'
          }`}
        />

        {/* Name */}
        {node.isEditing ? (
          <input
            autoFocus
            type="text"
            defaultValue={node.data.name}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={() => node.submit(node.data.name)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') node.reset();
              if (e.key === 'Enter') {
                const newName = e.currentTarget.value.trim();
                if (newName) {
                  onRename(node.data.id, newName);
                  node.submit(newName);
                }
              }
            }}
            className="flex-1 px-1 py-0.5 text-sm bg-background border border-primary rounded focus:outline-none"
          />
        ) : (
          <span className="flex-1 truncate">{node.data.name}</span>
        )}

        {/* Context menu button */}
        <button
          ref={(el) => {
            if (el) {
              menuButtonRefs.current.set(node.data.id, el);
            } else {
              menuButtonRefs.current.delete(node.data.id);
            }
          }}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpenId(isMenuOpen ? null : node.data.id);
          }}
          className={`
            p-1 rounded hover:bg-background/80 transition-opacity
            ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
          `}
        >
          <MoreVertical className="h-3 w-3 text-muted-foreground" />
        </button>

        {/* Context menu */}
        <ContextMenu
          isOpen={isMenuOpen}
          onClose={() => setMenuOpenId(null)}
          triggerRef={{ current: menuButtonRefs.current.get(node.data.id) || null }}
          align="right"
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              node.edit();
              setMenuOpenId(null);
            }}
            className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
          >
            Rename
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.data.id);
              setMenuOpenId(null);
            }}
            className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-muted transition-colors"
          >
            Delete
          </button>
        </ContextMenu>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-card/50">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-xs font-medium uppercase text-muted-foreground">
          Files
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onCreateFile(null, 'untitled.py', 'python')}
            className="p-1 rounded hover:bg-muted transition-colors"
            title="New file"
          >
            <FileCode className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={() => onCreateFolder(null, 'New Folder')}
            className="p-1 rounded hover:bg-muted transition-colors"
            title="New folder"
          >
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-auto px-2 py-2">
        {nodes.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No files yet. Create your first file to get started.
          </div>
        ) : (
          <Tree
            data={nodes}
            openByDefault={false}
            width="100%"
            height={400}
            indent={12}
            rowHeight={28}
            overscanCount={1}
            paddingTop={4}
            paddingBottom={4}
          >
            {Node}
          </Tree>
        )}
      </div>
    </div>
  );
};
