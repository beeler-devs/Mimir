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
import { ContextMenu, Modal, Button } from '@/components/common';

interface FileTreeProps {
  nodes: FileTreeNode[];
  activeFilePath: string | null;
  onSelectFile: (path: string) => void;
  onCreateFile: (parentId: string | null, name: string, language: CodeLanguage) => void;
  onCreateFolder: (parentId: string | null, name: string) => void;
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
  onMove?: (nodeId: string, newParentId: string | null) => void;
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
  onMove,
}) => {
  const [menuState, setMenuState] = useState<{
    id: string;
    position: { top: number; left: number };
  } | null>(null);
  const [moveModalState, setMoveModalState] = useState<{
    nodeId: string;
    nodeName: string;
  } | null>(null);
  const menuButtonRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Handle drag and drop move from react-arborist
  const handleMove = (args: {
    dragIds: string[];
    parentId: string | null;
    index: number;
  }) => {
    if (!onMove) return;
    // Move each dragged node to the new parent
    args.dragIds.forEach((dragId) => {
      onMove(dragId, args.parentId);
    });
  };

  // Build folder options for move modal
  const buildFolderOptions = (
    parentId: string | null = null,
    depth = 0
  ): { id: string; label: string }[] => {
    return nodes
      .filter((node) => node.type === 'folder' && node.parentId === parentId)
      .flatMap((folder) => [
        { id: folder.id, label: `${'— '.repeat(depth)}${folder.name}` },
        ...buildFolderOptions(folder.id, depth + 1),
      ]);
  };

  // Get file icon based on language
  const getFileIcon = (language?: CodeLanguage) => {
    return FileCode;
  };

  // Node renderer for custom styling
  const Node = ({ node, style, dragHandle }: NodeRendererProps<FileTreeNode>) => {
    const isFolder = node.data.type === 'folder';
    const isActive = !isFolder && node.data.path === activeFilePath;
    const isMenuOpen = menuState?.id === node.data.id;

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
          ${isActive ? 'bg-muted text-foreground ring-1 ring-border' : 'hover:bg-muted/50'}
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
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const menuWidth = 176; // w-44
            setMenuState((prev) =>
              prev?.id === node.data.id
                ? null
                : {
                    id: node.data.id,
                    position: {
                      top: rect.bottom + 4,
                      left: rect.right - menuWidth,
                    },
                  }
            );
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
          onClose={() => setMenuState(null)}
          triggerRef={{ current: menuButtonRefs.current.get(node.data.id) || null }}
          position={menuState?.id === node.data.id ? menuState.position : undefined}
          align="right"
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              node.edit();
              setMenuState(null);
            }}
            className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
          >
            Rename
          </button>
          {onMove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMoveModalState({
                  nodeId: node.data.id,
                  nodeName: node.data.name,
                });
                setMenuState(null);
              }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
            >
              Move
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.data.id);
              setMenuState(null);
            }}
            className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-muted transition-colors"
          >
            Delete
          </button>
        </ContextMenu>
      </div>
    );
  };

  const folderOptions = buildFolderOptions();

  const handleMoveSubmit = (targetFolderId: string | null) => {
    if (moveModalState && onMove) {
      onMove(moveModalState.nodeId, targetFolderId);
    }
    setMoveModalState(null);
  };

  return (
    <>
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
              onMove={onMove ? handleMove : undefined}
              disableDrag={!onMove}
              disableDrop={!onMove}
            >
              {Node}
            </Tree>
          )}
        </div>
      </div>

      {/* Move Modal */}
      {moveModalState && (
        <MoveFileModal
          open={!!moveModalState}
          nodeName={moveModalState.nodeName}
          nodeId={moveModalState.nodeId}
          folderOptions={folderOptions}
          nodes={nodes}
          onClose={() => setMoveModalState(null)}
          onMove={handleMoveSubmit}
        />
      )}
    </>
  );
};

interface MoveFileModalProps {
  open: boolean;
  nodeName: string;
  nodeId: string;
  folderOptions: { id: string; label: string }[];
  nodes: FileTreeNode[];
  onClose: () => void;
  onMove: (folderId: string | null) => void;
}

const MoveFileModal: React.FC<MoveFileModalProps> = ({
  open,
  nodeName,
  nodeId,
  folderOptions,
  nodes,
  onClose,
  onMove,
}) => {
  // Find the current parent of the node
  const currentNode = nodes.find((n) => n.id === nodeId);
  const currentParentId = currentNode?.parentId || 'root';

  const [selected, setSelected] = useState<string>(currentParentId);

  // Reset selection when modal opens
  React.useEffect(() => {
    if (open) {
      setSelected(currentParentId);
    }
  }, [open, currentParentId]);

  if (!open) return null;

  const handleSubmit = () => {
    onMove(selected === 'root' ? null : selected);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold">
            Move &quot;{nodeName}&quot;
          </h2>
          <p className="text-sm text-muted-foreground">
            Choose a destination folder for this item.
          </p>
        </div>
        <label className="text-sm font-medium">Destination</label>
        <select
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="root">Root (no folder)</option>
          {folderOptions.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.label}
            </option>
          ))}
        </select>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>Move</Button>
        </div>
      </div>
    </Modal>
  );
};
