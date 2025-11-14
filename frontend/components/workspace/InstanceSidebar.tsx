'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/common';
import { FileText, Code2, PenTool, Plus, Settings2, Pencil, Trash2 } from 'lucide-react';
import type { WorkspaceInstance } from '@/lib/types';

const typeMeta = {
  text: { label: 'Text', icon: FileText },
  code: { label: 'Code', icon: Code2 },
  annotate: { label: 'Annotate', icon: PenTool },
} as const;

interface InstanceSidebarProps {
  instances: WorkspaceInstance[];
  activeInstanceId: string | null;
  onSelect: (id: string) => void;
  onCreateInstance: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
}

/**
 * Left rail that lists workspace instances and handles creation/rename/delete
 */
export const InstanceSidebar: React.FC<InstanceSidebarProps> = ({
  instances,
  activeInstanceId,
  onSelect,
  onCreateInstance,
  onRename,
  onDelete,
  onOpenSettings,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

  const editingInstance = useMemo(
    () => instances.find((instance) => instance.id === editingId),
    [instances, editingId]
  );

  const startEditing = (instanceId: string, title: string) => {
    setEditingId(instanceId);
    setDraftTitle(title);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setDraftTitle('');
  };

  const commitEditing = () => {
    if (!editingId) return;
    const trimmed = draftTitle.trim();
    if (trimmed.length > 0) {
      onRename(editingId, trimmed);
    } else if (editingInstance) {
      setDraftTitle(editingInstance.title);
      onRename(editingId, editingInstance.title);
    }
    cancelEditing();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitEditing();
    } else if (event.key === 'Escape') {
      cancelEditing();
    }
  };

  return (
    <aside className="w-72 border-r border-border bg-card/80 backdrop-blur-xl flex flex-col">
      <div className="px-6 pt-6 pb-4 border-b border-border">
        <p className="text-[11px] tracking-[0.5em] text-muted-foreground uppercase">Mimir</p>
        <p className="text-2xl font-semibold text-foreground mt-2">Workspace</p>
        <Button className="w-full mt-4 gap-2" variant="secondary" onClick={onCreateInstance}>
          <Plus className="h-4 w-4" />
          New instance
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {instances.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            Create your first instance to get started.
          </div>
        )}
        {instances.map((instance) => {
          const meta = typeMeta[instance.type];
          const Icon = meta.icon;
          const isActive = instance.id === activeInstanceId;
          const isEditing = editingId === instance.id;

          return (
            <div
              key={instance.id}
              className={`
                group relative rounded-2xl border
                ${isActive ? 'border-primary/70 bg-primary/5' : 'border-transparent hover:border-border hover:bg-muted/30'}
              `}
            >
              <button
                onClick={() => onSelect(instance.id)}
                className="w-full px-4 py-3 flex items-start gap-3 text-left"
              >
                <span
                  className={`
                    h-10 w-10 rounded-xl flex items-center justify-center
                    ${isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}
                  `}
                >
                  <Icon className="h-5 w-5" />
                </span>

                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <input
                      className="w-full bg-transparent border-b border-dashed border-border pb-1 text-sm focus:outline-none"
                      value={draftTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      onBlur={commitEditing}
                      onKeyDown={handleKeyDown}
                      autoFocus
                    />
                  ) : (
                    <>
                      <p className="font-medium truncate">{instance.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{meta.label}</p>
                    </>
                  )}
                </div>
              </button>

              <div
                className={`
                  absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1
                  transition-opacity duration-200
                  ${isEditing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                `}
              >
                {isEditing ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3 text-xs"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={commitEditing}
                  >
                    Save
                  </Button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        startEditing(instance.id, instance.title);
                      }}
                      className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
                      aria-label="Rename"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(instance.id);
                      }}
                      className="p-2 rounded-full text-muted-foreground hover:text-red-500 hover:bg-muted"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-4 border-t border-border">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-muted/40 hover:bg-muted transition"
        >
          <div className="flex items-center gap-3">
            <span className="h-10 w-10 rounded-xl bg-background flex items-center justify-center border border-border">
              <Settings2 className="h-5 w-5" />
            </span>
            <div className="text-left">
              <p className="font-medium">Settings</p>
              <p className="text-xs text-muted-foreground">Theme & preferences</p>
            </div>
          </div>
        </button>
      </div>
    </aside>
  );
};
