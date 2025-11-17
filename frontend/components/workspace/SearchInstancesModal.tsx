'use client';

import React, { useEffect, useState } from 'react';
import { FileText, Code2, PenTool, File as FileIcon, Video } from 'lucide-react';
import { Modal, Input } from '@/components/common';
import type { InstanceType, WorkspaceInstance } from '@/lib/types';

const typeMeta: Record<
  InstanceType,
  {
    label: string;
    icon: typeof FileText;
  }
> = {
  text: { label: 'Text', icon: FileText },
  code: { label: 'Code', icon: Code2 },
  annotate: { label: 'Annotate', icon: PenTool },
  pdf: { label: 'PDF', icon: FileIcon },
  lecture: { label: 'Lecture', icon: Video },
};

interface SearchInstancesModalProps {
  open: boolean;
  instances: WorkspaceInstance[];
  onClose: () => void;
  onSelect: (id: string) => void;
}

export const SearchInstancesModal: React.FC<SearchInstancesModalProps> = ({
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

  const filteredInstances = instances.filter((instance) =>
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
