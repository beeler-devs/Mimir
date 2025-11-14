'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Button, Input } from '@/components/common';
import { InstanceType } from '@/lib/types';
import { FileText, Code2, PenTool, type LucideIcon } from 'lucide-react';

const typeOptions: { id: InstanceType; label: string; description: string; icon: LucideIcon }[] = [
  { id: 'text', label: 'Text', description: 'Perfect for essays, notes, and solutions.', icon: FileText },
  { id: 'code', label: 'Code', description: 'Run and iterate on programming exercises.', icon: Code2 },
  { id: 'annotate', label: 'Annotate', description: 'Draw and mark up PDFs or whiteboards.', icon: PenTool },
];

interface NewInstanceModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (title: string, type: InstanceType) => void;
}

/**
 * Modal for creating a new workspace instance with title and type selection
 */
export const NewInstanceModal: React.FC<NewInstanceModalProps> = ({ open, onClose, onCreate }) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<InstanceType>('text');

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        setTitle('');
        setType('text');
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [open]);

  const handleCreate = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onCreate(trimmed, type);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} className="!max-w-xl">
      <div className="p-6 space-y-5">
        <div>
          <h2 className="text-xl font-semibold">Create instance</h2>
          <p className="text-sm text-muted-foreground mt-1">Choose a type and name to spin up a fresh canvas.</p>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-medium text-muted-foreground">Title</label>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="ex. Linear algebra notes"
            className="w-full"
          />
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Type</p>
          <div className="flex flex-col gap-2">
            {typeOptions.map((option) => {
              const Icon = option.icon;
              const selected = type === option.id;
              return (
                <button
                  key={option.id}
                  onClick={() => setType(option.id)}
                  type="button"
                  className={`
                    border rounded-xl p-3 text-left transition-colors flex items-center gap-3
                    ${selected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/60 hover:bg-muted/40'}
                  `}
                >
                  <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0 ${selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{option.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{option.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-border">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!title.trim()}>
            Create
          </Button>
        </div>
      </div>
    </Modal>
  );
};
