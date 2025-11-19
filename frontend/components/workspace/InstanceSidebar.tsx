'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Button, Input, Modal, ContextMenu } from '@/components/common';
import {
  FileText,
  Code2,
  PenTool,
  File,
  Plus,
  Settings2,
  MoreVertical,
  PanelsLeftRight,
  Folder as FolderIcon,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Search,
  Video
} from 'lucide-react';
import type { WorkspaceInstance, Folder } from '@/lib/types';
import { useResize } from '@/contexts/ResizeContext';

const typeMeta = {
  text: { label: 'Text', icon: FileText },
  code: { label: 'Code', icon: Code2 },
  annotate: { label: 'Annotate', icon: PenTool },
  pdf: { label: 'PDF', icon: File },
  lecture: { label: 'Lecture', icon: Video },
} as const;

interface InstanceSidebarProps {
  instances: WorkspaceInstance[];
  folders?: Folder[];
  activeInstanceId: string | null;
  onSelect: (id: string) => void;
  onCreateInstance: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
  onCreateFolder?: (name: string, parentId?: string) => void;
  onRenameFolder?: (id: string, name: string) => void;
  onDeleteFolder?: (id: string) => void;
  onMoveToFolder?: (instanceId: string, folderId: string | null) => void;
  onMoveFolder?: (folderId: string, parentId: string | null) => void;
}

/**
 * Left rail that lists workspace instances and folders with tree structure
 */
export const InstanceSidebar: React.FC<InstanceSidebarProps> = ({
  instances,
  folders = [],
  activeInstanceId,
  onSelect,
  onCreateInstance,
  onRename,
  onDelete,
  onOpenSettings,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveToFolder,
  onMoveFolder,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<'instance' | 'folder' | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [moveModalInstance, setMoveModalInstance] = useState<WorkspaceInstance | null>(null);
  const [draggingInstanceId, setDraggingInstanceId] = useState<string | null>(null);
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);
  const [rootDragOver, setRootDragOver] = useState(false);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [creatingNewFolder, setCreatingNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('Untitled');

  // Store refs for menu buttons - using useRef to hold a Map of refs
  const menuButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Use resize context for collapsed state
  const { leftCollapsed: collapsed, toggleLeftCollapsed } = useResize();

  const toggleCollapsed = () => {
    toggleLeftCollapsed();
    if (!collapsed) {
      // When collapsing, clear editing state
      setEditingId(null);
      setEditingType(null);
      setDraftTitle('');
      setMenuOpenId(null);
    }
  };


  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const startEditing = (id: string, title: string, type: 'instance' | 'folder') => {
    setEditingId(id);
    setEditingType(type);
    setDraftTitle(title);
    setMenuOpenId(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingType(null);
    setDraftTitle('');
  };

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpenId(null);
        cancelEditing();
      }
    };
    const handleClick = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest('[data-menu-interactive]')) {
        return;
      }
      setMenuOpenId(null);
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('click', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('click', handleClick);
    };
  }, []);

  const commitEditing = () => {
    if (!editingId || !editingType) return;
    const trimmed = draftTitle.trim();
    if (trimmed.length > 0) {
      if (editingType === 'instance') {
        onRename(editingId, trimmed);
      } else if (editingType === 'folder' && onRenameFolder) {
        onRenameFolder(editingId, trimmed);
      }
    }
    cancelEditing();
  };

  const handleStartCreateFolder = () => {
    setCreatingNewFolder(true);
    setNewFolderName('Untitled');
  };

  const handleCancelNewFolder = () => {
    setCreatingNewFolder(false);
    setNewFolderName('Untitled');
  };

  const handleCommitNewFolder = () => {
    const trimmed = newFolderName.trim();
    if (trimmed.length > 0 && onCreateFolder) {
      onCreateFolder(trimmed);
    }
    setCreatingNewFolder(false);
    setNewFolderName('Untitled');
  };

  const handleNewFolderKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleCommitNewFolder();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      handleCancelNewFolder();
    }
  };

  const handleMoveSubmit = (folderId: string | null) => {
    if (moveModalInstance && onMoveToFolder) {
      onMoveToFolder(moveModalInstance.id, folderId);
    }
    setMoveModalInstance(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEditing();
    } else if (event.key === 'Escape') {
      cancelEditing();
    }
  };

  // Organize instances and folders into tree structure
  const { rootInstances, rootFolders } = useMemo(() => {
    const rootInstances = instances.filter(i => !i.folderId);
    const rootFolders = folders.filter(f => !f.parentFolderId);
    return { rootInstances, rootFolders };
  }, [instances, folders]);

  const getFolderInstances = (folderId: string) => {
    return instances.filter(i => i.folderId === folderId);
  };

  const getFolderChildren = (folderId: string) => {
    return folders.filter(f => f.parentFolderId === folderId);
  };

  const renderInstance = (instance: WorkspaceInstance, depth: number = 0) => {
    const meta = typeMeta[instance.type];
    const Icon = meta.icon;
    const isActive = instance.id === activeInstanceId;
    const isEditing = editingId === instance.id && editingType === 'instance';
    const isMenuOpen = menuOpenId === instance.id;

    return (
      <div
        key={instance.id}
        className="group relative"
        style={{ paddingLeft: `${depth * 12}px` }}
        draggable
        onDragStart={(event) => {
          event.stopPropagation();
          event.dataTransfer.setData('application/mimir-instance', instance.id);
          setDraggingInstanceId(instance.id);
        }}
        onDragEnd={() => setDraggingInstanceId(null)}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => onSelect(instance.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(instance.id);
            }
          }}
          className={`
            w-full px-2.5 py-2 flex items-center gap-2.5 text-left rounded-lg text-sm transition-colors cursor-pointer
            ${isActive ? 'bg-muted text-foreground' : 'hover:bg-muted/70'}
          `}
        >
          <span
            className={`
              h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0
              ${isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}
            `}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>

          <div className="flex-1 min-w-0 pr-6">
            {isEditing ? (
              <input
                className="w-full bg-transparent border-b border-dashed border-border pb-0.5 text-sm focus:outline-none"
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                onBlur={commitEditing}
                onKeyDown={handleKeyDown}
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <p className="font-medium truncate">{instance.title}</p>
            )}
          </div>
        </div>

        {!isEditing && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <button
              ref={(el) => {
                if (el) {
                  menuButtonRefs.current.set(instance.id, el);
                } else {
                  menuButtonRefs.current.delete(instance.id);
                }
              }}
              type="button"
              data-menu-interactive
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpenId(isMenuOpen ? null : instance.id);
              }}
              className={`
                p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-background/80
                transition-opacity duration-150
                ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
              `}
              aria-label="Options"
            >
              <MoreVertical className="h-4 w-4" />
            </button>

            <ContextMenu
              isOpen={isMenuOpen}
              onClose={() => setMenuOpenId(null)}
              triggerRef={{ current: menuButtonRefs.current.get(instance.id) || null }}
              align="right"
            >
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  startEditing(instance.id, instance.title, 'instance');
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
              >
                Rename
              </button>
              {onMoveToFolder && (
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    setMoveModalInstance(instance);
                    setMenuOpenId(null);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                >
                  Move
                </button>
              )}
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(instance.id);
                  setMenuOpenId(null);
                }}
                className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-muted transition-colors"
              >
                Delete
              </button>
            </ContextMenu>
          </div>
        )}
      </div>
    );
  };

  const renderFolder = (folder: Folder, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedFolders.has(folder.id);
    const isEditing = editingId === folder.id && editingType === 'folder';
    const isMenuOpen = menuOpenId === folder.id;
    const folderInstances = getFolderInstances(folder.id);
    const childFolders = getFolderChildren(folder.id);

    return (
      <div
        key={folder.id}
        draggable
        onDragStart={(event) => {
          event.stopPropagation();
          event.dataTransfer.setData('application/mimir-folder', folder.id);
          setDraggingFolderId(folder.id);
        }}
        onDragEnd={() => setDraggingFolderId(null)}
        onDragOver={(event) => {
          if (draggingInstanceId || draggingFolderId) {
            event.preventDefault();
          }
        }}
        onDrop={(event) => {
          if (!onMoveToFolder || !onMoveFolder) return;
          event.preventDefault();
          event.stopPropagation();
          const instanceId = event.dataTransfer.getData('application/mimir-instance');
          const folderId = event.dataTransfer.getData('application/mimir-folder');

          if (instanceId) {
            onMoveToFolder(instanceId, folder.id);
          } else if (folderId) {
            onMoveFolder(folderId, folder.id);
          }

          setDraggingInstanceId(null);
          setDraggingFolderId(null);
          setRootDragOver(false);
        }}
      >
        <div
          className="group relative"
          style={{ paddingLeft: `${depth * 12}px` }}
        >
          <div
            role="button"
            tabIndex={0}
            onClick={() => toggleFolder(folder.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleFolder(folder.id);
              }
            }}
            className={`w-full px-2.5 py-2 flex items-center gap-2.5 text-left rounded-lg text-sm transition-colors cursor-pointer hover:bg-muted/70 ${
              dragOverFolderId === folder.id ? 'bg-primary/10 ring-2 ring-primary ring-inset' : ''
            }`}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            ) : (
              <FolderIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            )}

            <div className="flex-1 min-w-0 pr-6">
              {isEditing ? (
                <input
                  className="w-full bg-transparent border-b border-dashed border-border pb-0.5 text-sm focus:outline-none"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onBlur={commitEditing}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <p className="font-medium truncate">{folder.name}</p>
              )}
            </div>
          </div>

          {!isEditing && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <button
                ref={(el) => {
                  if (el) {
                    menuButtonRefs.current.set(folder.id, el);
                  } else {
                    menuButtonRefs.current.delete(folder.id);
                  }
                }}
                type="button"
                data-menu-interactive
                onClick={(event) => {
                  event.stopPropagation();
                  setMenuOpenId(isMenuOpen ? null : folder.id);
                }}
                className={`
                  p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-background/80
                  transition-opacity duration-150
                  ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                `}
                aria-label="Options"
              >
                <MoreVertical className="h-4 w-4" />
              </button>

              <ContextMenu
                isOpen={isMenuOpen}
                onClose={() => setMenuOpenId(null)}
                triggerRef={{ current: menuButtonRefs.current.get(folder.id) || null }}
                align="right"
              >
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    startEditing(folder.id, folder.name, 'folder');
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                >
                  Rename
                </button>
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    if (onDeleteFolder) {
                      onDeleteFolder(folder.id);
                    }
                    setMenuOpenId(null);
                  }}
                  className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-muted transition-colors"
                >
                  Delete
                </button>
              </ContextMenu>
            </div>
          )}
        </div>

        {isExpanded && (
          <div className="ml-2">
            {childFolders.map(childFolder => renderFolder(childFolder, depth + 1))}
            {folderInstances.map(instance => renderInstance(instance, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (collapsed) {
    return (
      <>
        <aside className="w-full h-full border-r border-border bg-card/80 backdrop-blur-xl flex flex-col">
          <div className="px-2 pt-5 pb-4 flex items-center justify-center">
            <button
              onClick={toggleCollapsed}
              className="group h-10 w-10 rounded-lg border border-border bg-background hover:bg-muted transition-colors flex items-center justify-center text-xl font-semibold tracking-tight"
              aria-label="Expand sidebar"
            >
              <span className="group-hover:hidden">M</span>
              <PanelsLeftRight className="h-4 w-4 hidden group-hover:block text-muted-foreground" />
            </button>
          </div>
          <div className="flex-1" />
          <div className="p-3 border-t border-border flex items-center justify-center">
            <button
              onClick={onOpenSettings}
              className="h-10 w-10 rounded-lg border border-border bg-background hover:bg-muted transition-colors flex items-center justify-center"
              aria-label="Open settings"
            >
              <Settings2 className="h-4 w-4" />
            </button>
          </div>
        </aside>

        <MoveInstanceModal
          open={!!moveModalInstance}
          folders={folders}
          currentFolderId={moveModalInstance?.folderId ?? null}
          instanceTitle={moveModalInstance?.title ?? ''}
          onClose={() => setMoveModalInstance(null)}
          onMove={handleMoveSubmit}
        />
      </>
    );
  }

  return (
    <>
    <aside className="w-full h-full border-r border-border bg-[var(--sidebar-bg)] dark:bg-card/80 backdrop-blur-xl flex flex-col overflow-hidden">
      <div className="px-4 pt-5 pb-4 flex items-center justify-between gap-3">
        <div className="flex-1 text-xl font-semibold tracking-tight pl-3">Mimir</div>
        <button
          onClick={toggleCollapsed}
          className="p-2 rounded-lg border border-border bg-background hover:bg-muted transition-colors"
          aria-label="Collapse sidebar"
        >
          <PanelsLeftRight className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 pt-4 space-y-2">
        <button 
          className="w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg text-sm transition-colors hover:bg-[var(--sidebar-hover)] dark:hover:bg-muted/70"
          onClick={onCreateInstance}
        >
          <Plus className="h-4 w-4" />
          <span>Add instance</span>
        </button>
        {onCreateFolder && (
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg text-sm transition-colors hover:bg-[var(--sidebar-hover)] dark:hover:bg-muted/70"
            onClick={handleStartCreateFolder}
          >
            <FolderIcon className="h-4 w-4" />
            <span>Add folder</span>
          </button>
        )}
        <button
          className="w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg text-sm transition-colors hover:bg-[var(--sidebar-hover)] dark:hover:bg-muted/70"
          onClick={() => setSearchModalOpen(true)}
        >
          <Search className="h-4 w-4" />
          <span>Search</span>
        </button>
      </div>

      <div
        className="flex-1 overflow-y-auto px-4 py-3 space-y-1"
        onDragOver={(event) => {
          if (!draggingInstanceId) return;
          event.preventDefault();
          if (event.target === event.currentTarget) {
            setRootDragOver(true);
          }
        }}
        onDragLeave={(event) => {
          if (event.target === event.currentTarget) {
            setRootDragOver(false);
          }
        }}
        onDrop={(event) => {
          if (!onMoveToFolder || !onMoveFolder) return;
          event.preventDefault();
          if (event.target !== event.currentTarget) return;
          const instanceId = event.dataTransfer.getData('application/mimir-instance');
          const folderId = event.dataTransfer.getData('application/mimir-folder');

          if (instanceId) {
            onMoveToFolder(instanceId, null);
          } else if (folderId) {
            onMoveFolder(folderId, null);
          }
          
          setDraggingInstanceId(null);
          setDraggingFolderId(null);
          setRootDragOver(false);
        }}
      >
        {draggingInstanceId && onMoveToFolder && (
          <div
            className={`
              px-3 py-2 mb-2 text-xs rounded-lg border-2 border-dashed
              ${rootDragOver ? 'border-primary text-primary' : 'border-muted-foreground/40 text-muted-foreground'}
            `}
          >
            Drop here to remove from folders
          </div>
        )}
        {instances.length === 0 && folders.length === 0 && !creatingNewFolder && (
          <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            Create your first instance to get started.
          </div>
        )}

        {creatingNewFolder && (
          <div className="group relative">
            <button
              className="w-full px-2.5 py-2 flex items-center gap-2.5 text-left rounded-lg text-sm transition-colors hover:bg-muted/70"
            >
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <FolderIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />

              <div className="flex-1 min-w-0 pr-6">
                <input
                  className="w-full bg-transparent border-b border-dashed border-border pb-0.5 text-sm focus:outline-none selection:bg-primary selection:text-primary-foreground"
                  value={newFolderName}
                  onChange={(event) => setNewFolderName(event.target.value)}
                  onBlur={handleCommitNewFolder}
                  onKeyDown={handleNewFolderKeyDown}
                  autoFocus
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </button>
          </div>
        )}

        {rootFolders.map(folder => renderFolder(folder))}
        {rootInstances.map(instance => renderInstance(instance))}
      </div>

      <div className="p-4 border-t border-border">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-muted/40 hover:bg-muted transition"
        >
          <div className="flex items-center gap-3">
            <span className="h-9 w-9 rounded-lg bg-background flex items-center justify-center border border-border">
              <Settings2 className="h-4 w-4" />
            </span>
            <div className="text-left">
              <p className="font-medium text-sm">Settings</p>
              <p className="text-xs text-muted-foreground">Theme & preferences</p>
            </div>
          </div>
        </button>
      </div>
    </aside>

    <MoveInstanceModal
      open={!!moveModalInstance}
      folders={folders}
      currentFolderId={moveModalInstance?.folderId ?? null}
      instanceTitle={moveModalInstance?.title ?? ''}
      onClose={() => setMoveModalInstance(null)}
      onMove={handleMoveSubmit}
    />
    <SearchInstancesModal
      open={searchModalOpen}
      instances={instances}
      onClose={() => setSearchModalOpen(false)}
      onSelect={(id) => {
        onSelect(id);
        setSearchModalOpen(false);
      }}
    />
    </>
  );
};

interface MoveInstanceModalProps {
  open: boolean;
  folders: Folder[];
  currentFolderId: string | null;
  instanceTitle: string;
  onClose: () => void;
  onMove: (folderId: string | null) => void;
}

const buildFolderOptions = (
  folders: Folder[],
  parentId: string | null = null,
  depth = 0
): { id: string; label: string }[] => {
  return folders
    .filter((folder) => folder.parentFolderId === parentId)
    .flatMap((folder) => [
      { id: folder.id, label: `${'— '.repeat(depth)}${folder.name}` },
      ...buildFolderOptions(folders, folder.id, depth + 1),
    ]);
};

const MoveInstanceModal: React.FC<MoveInstanceModalProps> = ({
  open,
  folders,
  currentFolderId,
  instanceTitle,
  onClose,
  onMove,
}) => {
  const [selected, setSelected] = useState<string>(currentFolderId || 'root');

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => setSelected(currentFolderId || 'root'));
    return () => cancelAnimationFrame(frame);
  }, [open, currentFolderId]);

  if (!open) return null;

  const folderOptions = buildFolderOptions(folders);

  const handleSubmit = () => {
    onMove(selected === 'root' ? null : selected);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold">
            Move &quot;{instanceTitle}&quot;
          </h2>
          <p className="text-sm text-muted-foreground">Choose a folder for this instance.</p>
        </div>
        <label className="text-sm font-medium">Destination</label>
        <select
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="root">No folder</option>
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

interface SearchInstancesModalProps {
  open: boolean;
  instances: WorkspaceInstance[];
  onClose: () => void;
  onSelect: (id: string) => void;
}

const SearchInstancesModal: React.FC<SearchInstancesModalProps> = ({
  open,
  instances,
  onClose,
  onSelect,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => setQuery(''));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  if (!open) return null;

  const filteredInstances = instances.filter(instance =>
    instance.title.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <Modal open={open} onClose={onClose} className="max-w-xl">
      <div className="flex flex-col max-h-[70vh] bg-[#F5F5F5]">
        <Input
          value={query}
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search instances..."
          className="rounded-t-lg rounded-b-none border-0 border-b border-border px-5 py-6 text-base bg-[#F5F5F5]"
        />
        <div className="flex-1 overflow-y-auto p-2">
          {filteredInstances.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {query ? 'No instances found' : 'Start typing to search'}
            </div>
          ) : (
            filteredInstances.map((instance) => {
              const meta = typeMeta[instance.type];
              const Icon = meta.icon;
              return (
                <button
                  key={instance.id}
                  onClick={() => onSelect(instance.id)}
                  className="w-full px-3 py-2.5 flex items-center gap-3 text-left rounded-lg text-sm transition-colors hover:bg-[#FAFAFA]"
                >
                  <span className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{instance.title}</p>
                    <p className="text-xs text-muted-foreground">{meta.label}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
};
