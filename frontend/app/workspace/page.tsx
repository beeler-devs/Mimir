'use client';

import React, { useEffect, useState } from 'react';
import { CentralDashboard } from '@/components/dashboard/CentralDashboard';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Modal, Input } from '@/components/common';
import { FileText, Code2, PenTool, File as FileIcon, Video } from 'lucide-react';
import type { InstanceType, WorkspaceInstance } from '@/lib/types';
import { useWorkspace } from './WorkspaceProvider';

function WorkspaceDashboardContent() {
  const { instances, createInstance, selectInstance } = useWorkspace();
  const [instanceSearchOpen, setInstanceSearchOpen] = useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Command+K: Search instances and folders
      if (cmdOrCtrl && e.key === 'k' && !e.shiftKey) {
        e.preventDefault();
        setInstanceSearchOpen(true);
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelect = (id: string) => {
    selectInstance(id);
  };

  const handleCreateInstance = async (title: string, type: InstanceType, additionalData?: any) => {
    const trimmed = title.trim();
    if (!trimmed) {
      console.warn('[handleCreateInstance] Empty title provided, aborting');
      return;
    }

    console.log('[handleCreateInstance] ========================================');
    console.log('[handleCreateInstance] Creating new instance...');
    console.log('[handleCreateInstance] Title:', trimmed);
    console.log('[handleCreateInstance] Type:', type);
    console.log('[handleCreateInstance] Additional data:', additionalData);

    const instancePayload = {
      title: trimmed,
      type,
      folderId: null,
      data: additionalData,
    };

    console.log('[handleCreateInstance] Full payload:', JSON.stringify(instancePayload, null, 2));

    try {
      console.log('[handleCreateInstance] Calling createInstance...');
      await createInstance(trimmed, type, additionalData);
      console.log('[handleCreateInstance] ✅ Instance created successfully!');
      console.log('[handleCreateInstance] ========================================');
    } catch (error) {
      console.error('[handleCreateInstance] ========================================');
      console.error('[handleCreateInstance] ❌ FAILED to create instance');
      console.error('[handleCreateInstance] Error type:', typeof error);
      console.error('[handleCreateInstance] Error:', error);

      if (error instanceof Error) {
        console.error('[handleCreateInstance] Error name:', error.name);
        console.error('[handleCreateInstance] Error message:', error.message);
        console.error('[handleCreateInstance] Error stack:', error.stack);
      }

      // Try to extract Supabase-specific error details
      if (error && typeof error === 'object') {
        console.error('[handleCreateInstance] Error keys:', Object.keys(error));
        console.error('[handleCreateInstance] Error code:', (error as any).code);
        console.error('[handleCreateInstance] Error message:', (error as any).message);
        console.error('[handleCreateInstance] Error details:', (error as any).details);
        console.error('[handleCreateInstance] Error hint:', (error as any).hint);
      }

      console.error('[handleCreateInstance] Full error JSON:', JSON.stringify(error, null, 2));
      console.error('[handleCreateInstance] ========================================');
    }
  };

  return (
    <div className="h-full overflow-auto">
      <CentralDashboard onCreateInstance={handleCreateInstance} />
      <SearchInstancesModal
        open={instanceSearchOpen}
        instances={instances}
        onClose={() => setInstanceSearchOpen(false)}
        onSelect={handleSelect}
      />
    </div>
  );
}

// Search Instances Modal
const typeMeta = {
  text: { label: 'Text', icon: FileText },
  code: { label: 'Code', icon: Code2 },
  annotate: { label: 'Annotate', icon: PenTool },
  pdf: { label: 'PDF', icon: FileIcon },
  lecture: { label: 'Lecture', icon: Video },
} as const;

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
      <div className="flex flex-col max-h-[70vh] bg-card">
        <Input
          value={query}
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search instances..."
          className="rounded-t-lg rounded-b-none border-0 border-b border-border px-5 py-6 text-base bg-card"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
        />

        <div className="overflow-y-auto custom-scrollbar p-2 space-y-1">
          {filteredInstances.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              No instances match your search
            </div>
          ) : (
            filteredInstances.map((instance) => {
              const meta = typeMeta[instance.type];
              const Icon = meta.icon;
              return (
                <button
                  key={instance.id}
                  onClick={() => {
                    onSelect(instance.id);
                    onClose();
                  }}
                  className="flex items-center gap-3 w-full px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left"
                >
                  <span className="p-2 rounded-lg bg-muted text-foreground">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{instance.title}</div>
                    <div className="text-xs text-muted-foreground">{meta.label}</div>
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

export default function WorkspacePage() {
  return (
    <ProtectedRoute>
      <WorkspaceDashboardContent />
    </ProtectedRoute>
  );
}
