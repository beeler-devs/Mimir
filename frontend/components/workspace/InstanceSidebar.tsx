'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal } from '@/components/common';
import { 
  FileText, 
  Code2, 
  PenTool, 
  Plus, 
  Settings2, 
  MoreVertical, 
  PanelsLeftRight,
  Folder as FolderIcon,
  FolderOpen,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import type { WorkspaceInstance, Folder } from '@/lib/types';

const typeMeta = {
  text: { label: 'Text', icon: FileText },
  code: { label: 'Code', icon: Code2 },
  annotate: { label: 'Annotate', icon: PenTool },
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
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<'instance' | 'folder' | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [moveModalInstance, setMoveModalInstance] = useState<WorkspaceInstance | null>(null);
  const [draggingInstanceId, setDraggingInstanceId] = useState<string | null>(null);
  const [rootDragOver, setRootDragOver] = useState(false);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      if (next) {
        setEditingId(null);
        setEditingType(null);
        setDraftTitle('');
        setMenuOpenId(null);
      }
      return next;
    });
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
    const handleClick = () => {
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

  const handleFolderModalSubmit = (name: string) => {
    if (onCreateFolder) {
      onCreateFolder(name);
    }
    setFolderModalOpen(false);
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
        <button
          onClick={() => onSelect(instance.id)}
          className={`
            w-full px-2.5 py-2 flex items-center gap-2.5 text-left rounded-lg text-sm transition-colors
            ${isActive ? 'bg-muted text-foreground' : 'hover:bg-muted/70'}
          `}
        >
          <span
            className={`
              h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0
              ${isActive ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'}
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
        </button>

        {!isEditing && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">
            <button
              type="button"
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

              {isMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 w-44 bg-card border border-border rounded-lg shadow-lg py-1 z-50"
                  onClick={(event) => event.stopPropagation()}
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
                </div>
              )}
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
        onDragOver={(event) => {
          if (draggingInstanceId) {
            event.preventDefault();
          }
        }}
        onDrop={(event) => {
          if (!onMoveToFolder || !draggingInstanceId) return;
          event.preventDefault();
          event.stopPropagation();
          const instanceId =
            draggingInstanceId || event.dataTransfer.getData('application/mimir-instance');
          if (instanceId) {
            onMoveToFolder(instanceId, folder.id);
          }
          setDraggingInstanceId(null);
          setRootDragOver(false);
        }}
      >
        <div
          className="group relative"
          style={{ paddingLeft: `${depth * 12}px` }}
        >
          <button
            onClick={() => toggleFolder(folder.id)}
            className="w-full px-2.5 py-2 flex items-center gap-2.5 text-left rounded-lg text-sm transition-colors hover:bg-muted/70"
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
          </button>

          {!isEditing && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <button
                type="button"
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

              {isMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 w-44 bg-card border border-border rounded-lg shadow-lg py-1 z-50"
                  onClick={(event) => event.stopPropagation()}
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
                </div>
              )}
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
        <aside className="w-16 border-r border-border bg-card/80 backdrop-blur-xl flex flex-col transition-all duration-300">
          <div className="px-2 pt-5 pb-4 border-b border-border flex items-center justify-center">
            <button
              onClick={toggleCollapsed}
              className="group h-10 w-10 rounded-xl border border-border bg-background hover:bg-muted transition-colors flex items-center justify-center text-xl font-semibold tracking-tight"
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
              className="h-10 w-10 rounded-xl border border-border bg-background hover:bg-muted transition-colors flex items-center justify-center"
              aria-label="Open settings"
            >
              <Settings2 className="h-4 w-4" />
            </button>
          </div>
        </aside>

        <CreateFolderModal
          open={folderModalOpen}
          onClose={() => setFolderModalOpen(false)}
          onSubmit={handleFolderModalSubmit}
        />
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
    <aside className="w-64 border-r border-border bg-card/80 backdrop-blur-xl flex flex-col transition-all duration-300">
      <div className="px-4 pt-5 pb-4 border-b border-border flex items-center justify-between">
        <div className="text-xl font-semibold tracking-tight">Mimir</div>
        <button
          onClick={toggleCollapsed}
          className="p-2 rounded-xl border border-border bg-background hover:bg-muted transition-colors"
          aria-label="Collapse sidebar"
        >
          <PanelsLeftRight className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 pt-4 flex gap-2">
        <Button className="flex-1 gap-2" size="sm" variant="secondary" onClick={onCreateInstance}>
          <Plus className="h-4 w-4" />
          Instance
        </Button>
        {onCreateFolder && (
          <Button
            className="flex-1 gap-2 whitespace-nowrap"
            size="sm"
            variant="secondary"
            onClick={() => setFolderModalOpen(true)}
          >
            <FolderIcon className="h-4 w-4 shrink-0" />
            <span>New folder</span>
          </Button>
        )}
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
          if (!draggingInstanceId || !onMoveToFolder) return;
          event.preventDefault();
          if (event.target !== event.currentTarget) return;
          const instanceId =
            draggingInstanceId || event.dataTransfer.getData('application/mimir-instance');
          onMoveToFolder(instanceId, null);
          setDraggingInstanceId(null);
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
        {instances.length === 0 && folders.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            Create your first instance to get started.
          </div>
        )}
        
        {rootFolders.map(folder => renderFolder(folder))}
        {rootInstances.map(instance => renderInstance(instance))}
      </div>

      <div className="p-4 border-t border-border">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-muted/40 hover:bg-muted transition"
        >
          <div className="flex items-center gap-3">
            <span className="h-9 w-9 rounded-xl bg-background flex items-center justify-center border border-border">
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

    <CreateFolderModal
      open={folderModalOpen}
      onClose={() => setFolderModalOpen(false)}
      onSubmit={handleFolderModalSubmit}
    />
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
};

interface CreateFolderModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}

const CreateFolderModal: React.FC<CreateFolderModalProps> = ({ open, onClose, onSubmit }) => {
  const [name, setName] = useState('');

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => setName(''));
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    onClose();
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold">New folder</h2>
          <p className="text-sm text-muted-foreground">Organize your instances into folders.</p>
        </div>
        <Input
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
          placeholder="Folder name"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim()}>
            Create
          </Button>
        </div>
      </div>
    </Modal>
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
