'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/common';
import { FileText, Code2, PenTool, Plus, Settings2, MoreVertical, PanelsLeftRight } from 'lucide-react';
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
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      if (next) {
        setEditingId(null);
        setDraftTitle('');
        setMenuOpenId(null);
      }
      return next;
    });
  };

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

  if (collapsed) {
    return (
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
    );
  }

  return (
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

      <div className="px-4 pt-4">
        <Button className="w-full gap-2" size="sm" variant="secondary" onClick={onCreateInstance}>
          <Plus className="h-4 w-4" />
          New instance
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {instances.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            Create your first instance to get started.
          </div>
        )}
        {instances.map((instance) => {
          const meta = typeMeta[instance.type];
          const Icon = meta.icon;
          const isActive = instance.id === activeInstanceId;
          const isEditing = editingId === instance.id;
          const isMenuOpen = menuOpenId === instance.id;

          return (
            <div
              key={instance.id}
              className="group relative"
            >
              <button
                onClick={() => onSelect(instance.id)}
                className={`
                  w-full px-2.5 py-2 flex items-center gap-2.5 text-left rounded-lg text-sm transition-colors
                  ${isActive ? 'bg-muted' : 'hover:bg-muted/60'}
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
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setMenuOpenId(null)}
                      />
                      <div className="absolute right-0 top-full mt-1 w-40 bg-card border border-border rounded-lg shadow-lg py-1 z-20">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            startEditing(instance.id, instance.title);
                            setMenuOpenId(null);
                          }}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                        >
                          Rename
                        </button>
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
                    </>
                  )}
                </div>
              )}
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
  );
};
