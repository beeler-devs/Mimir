'use client';

import React from 'react';
import { Modal, Button } from '@/components/common';
import { AlertTriangle } from 'lucide-react';

interface ClearAllConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation modal for clearing all components
 */
export const ClearAllConfirmModal: React.FC<ClearAllConfirmModalProps> = ({
  open,
  onClose,
  onConfirm,
}) => {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="w-full max-w-md">
        <div className="p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="rounded-full bg-destructive/10 p-3 flex-shrink-0">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold mb-2">Clear All Components</h2>
              <p className="text-sm text-muted-foreground">
                Are you sure you want to remove all components? This action cannot be undone.
              </p>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-border">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirm}>
              Clear All
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

