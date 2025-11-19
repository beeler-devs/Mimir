'use client';

import React, { useEffect } from 'react';
import { Modal } from '@/components/common';
import { InstanceType } from '@/lib/types';
import { InstanceCreationForm } from '@/components/dashboard/InstanceCreationForm';

interface InstanceCreationModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (title: string, type: InstanceType, additionalData?: any) => Promise<void>;
}

/**
 * Modal for creating a new workspace instance with full creation UI
 * including file upload, mode selection, and auto-classification
 */
export const InstanceCreationModal: React.FC<InstanceCreationModalProps> = ({
  open,
  onClose,
  onCreate
}) => {
  const handleCreateInstance = async (
    title: string,
    type: InstanceType,
    additionalData?: any
  ) => {
    await onCreate(title, type, additionalData);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} className="!max-w-2xl">
      <div className="p-6 space-y-4">
        <div>
          <h2 className="text-xl font-semibold">Create instance</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Upload files, select a mode, and start learning.
          </p>
        </div>

        <InstanceCreationForm
          onCreateInstance={handleCreateInstance}
          onCancel={onClose}
          compact
        />
      </div>
    </Modal>
  );
};
