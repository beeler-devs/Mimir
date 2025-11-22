import React, { useState } from 'react';
import { Modal, Button, Input } from '@/components/common';
import { GridComponent, FocusViewConfiguration, FOCUS_VIEW_CONFIGS_KEY } from '@/lib/focusView';
import { nanoid } from 'nanoid';
import { Layout } from 'lucide-react';

interface SaveLayoutModalProps {
  open: boolean;
  onClose: () => void;
  currentComponents: GridComponent[];
  onSave?: (config: FocusViewConfiguration) => void;
}

export const SaveLayoutModal: React.FC<SaveLayoutModalProps> = ({
  open,
  onClose,
  currentComponents,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSave = () => {
    if (!name.trim()) return;

    const newConfig: FocusViewConfiguration = {
      id: nanoid(),
      name: name.trim(),
      description: description.trim() || undefined,
      components: currentComponents,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Save to localStorage
    try {
      const stored = localStorage.getItem(FOCUS_VIEW_CONFIGS_KEY);
      const configs: FocusViewConfiguration[] = stored ? JSON.parse(stored) : [];
      const updatedConfigs = [...configs, newConfig];
      localStorage.setItem(FOCUS_VIEW_CONFIGS_KEY, JSON.stringify(updatedConfigs));
      
      if (onSave) {
        onSave(newConfig);
      }
      
      onClose();
      setName('');
      setDescription('');
    } catch (error) {
      console.error('Failed to save configuration:', error);
    }
  };

  return (
    <Modal open={open} onClose={onClose} containerClassName="items-center pt-0">
      <div className="w-[400px] max-w-full bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <Layout className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">Save Layout</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Layout Name
            </label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Coding Setup"
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Description <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description..."
            />
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!name.trim()}>
              Save Layout
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
