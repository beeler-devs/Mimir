'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Button, Input } from '@/components/common';
import { InstanceType } from '@/lib/types';
import { FileText, Code2, PenTool } from 'lucide-react';

const typeOptions: { id: InstanceType; label: string; description: string; icon: React.FC<{ className?: string }> }[] = [
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
      setTitle('');
      setType('text');
    }
  }, [open]);

  const handleCreate = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onCreate(trimmed, type);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-8 space-y-6">
        <div>
          <h2 className="text-2xl font-semibold">Create instance</h2>
          <p className="text-sm text-muted-foreground">Choose a type and name to spin up a fresh workspace.</p>
        </div>

        <div className="space-y-4">
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
          <div className="grid grid-cols-3 gap-3">
            {typeOptions.map((option) => {
              const Icon = option.icon;
              const selected = type === option.id;
              return (
                <button
                  key={option.id}
                  onClick={() => setType(option.id)}
                  type="button"
                  className={`
                    border rounded-2xl p-4 h-full text-left transition-colors
                    ${selected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/60'}
                  `}
                >
                  <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <p className="mt-3 font-medium">{option.label}</p>
                  <p className="text-sm text-muted-foreground mt-1">{option.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
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
