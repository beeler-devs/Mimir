'use client';

import { useCallback } from 'react';
import type { WorkspaceInstance, InstanceType } from '@/lib/types';

interface UseInstanceUpdateOptions {
  activeInstance: WorkspaceInstance | null;
  effectiveInstanceId: string | null;
  setActiveInstance: React.Dispatch<React.SetStateAction<WorkspaceInstance | null>>;
  setInstances: React.Dispatch<React.SetStateAction<WorkspaceInstance[]>>;
  debouncedSave: (instanceId: string, data: Record<string, unknown>) => void;
}

interface UseInstanceUpdateReturn {
  updateField: <T>(field: string, value: T) => void;
  updateFields: (fields: Record<string, unknown>) => void;
  updateNestedField: <T>(path: string[], value: T) => void;
}

export function useInstanceUpdate(options: UseInstanceUpdateOptions): UseInstanceUpdateReturn {
  const {
    activeInstance,
    effectiveInstanceId,
    setActiveInstance,
    setInstances,
    debouncedSave,
  } = options;

  const updateField = useCallback(
    <T>(field: string, value: T) => {
      if (!activeInstance || !effectiveInstanceId) return;

      const updatedData = { ...activeInstance.data, [field]: value };
      const updatedInstance = { ...activeInstance, data: updatedData } as WorkspaceInstance;

      setActiveInstance(updatedInstance);
      setInstances((prev) =>
        prev.map((instance) =>
          instance.id === effectiveInstanceId ? updatedInstance : instance
        )
      );
      debouncedSave(effectiveInstanceId, updatedData);
    },
    [activeInstance, effectiveInstanceId, setActiveInstance, setInstances, debouncedSave]
  );

  const updateFields = useCallback(
    (fields: Record<string, unknown>) => {
      if (!activeInstance || !effectiveInstanceId) return;

      const updatedData = { ...activeInstance.data, ...fields };
      const updatedInstance = { ...activeInstance, data: updatedData } as WorkspaceInstance;

      setActiveInstance(updatedInstance);
      setInstances((prev) =>
        prev.map((instance) =>
          instance.id === effectiveInstanceId ? updatedInstance : instance
        )
      );
      debouncedSave(effectiveInstanceId, updatedData);
    },
    [activeInstance, effectiveInstanceId, setActiveInstance, setInstances, debouncedSave]
  );

  const updateNestedField = useCallback(
    <T>(path: string[], value: T) => {
      if (!activeInstance || !effectiveInstanceId || path.length === 0) return;

      // Deep clone the data
      const updatedData = JSON.parse(JSON.stringify(activeInstance.data));

      // Navigate to the nested field
      let current: Record<string, unknown> = updatedData;
      for (let i = 0; i < path.length - 1; i++) {
        if (!(path[i] in current)) {
          current[path[i]] = {};
        }
        current = current[path[i]] as Record<string, unknown>;
      }
      current[path[path.length - 1]] = value;

      const updatedInstance = { ...activeInstance, data: updatedData } as WorkspaceInstance;

      setActiveInstance(updatedInstance);
      setInstances((prev) =>
        prev.map((instance) =>
          instance.id === effectiveInstanceId ? updatedInstance : instance
        )
      );
      debouncedSave(effectiveInstanceId, updatedData);
    },
    [activeInstance, effectiveInstanceId, setActiveInstance, setInstances, debouncedSave]
  );

  return {
    updateField,
    updateFields,
    updateNestedField,
  };
}
