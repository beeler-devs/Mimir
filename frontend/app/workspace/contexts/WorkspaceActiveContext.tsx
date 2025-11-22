'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { WorkspaceInstance } from '@/lib/types';
import { useWorkspaceInstances } from './WorkspaceInstanceContext';

interface WorkspaceActiveContextValue {
  activeInstanceId: string | null;
  activeInstance: WorkspaceInstance | null;
  setActiveInstance: React.Dispatch<React.SetStateAction<WorkspaceInstance | null>>;
  selectInstance: (id: string) => void;
}

const WorkspaceActiveContext = createContext<WorkspaceActiveContextValue | null>(null);

export const WorkspaceActiveProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const params = useParams();
  const activeInstanceId = (params?.id as string) || null;

  const { instances } = useWorkspaceInstances();
  const [activeInstance, setActiveInstance] = useState<WorkspaceInstance | null>(null);

  // Keep active instance in sync with route + state
  useEffect(() => {
    if (!activeInstanceId) {
      setActiveInstance(null);
      return;
    }
    const instance = instances.find((i) => i.id === activeInstanceId) || null;
    setActiveInstance(instance);
  }, [activeInstanceId, instances]);

  const selectInstance = useCallback((id: string) => {
    const instance = instances.find((i) => i.id === id);
    if (instance) {
      router.push(`/workspace/${instance.type}/${id}`);
    }
  }, [instances, router]);

  const value: WorkspaceActiveContextValue = useMemo(() => ({
    activeInstanceId,
    activeInstance,
    setActiveInstance,
    selectInstance,
  }), [activeInstanceId, activeInstance, selectInstance]);

  return (
    <WorkspaceActiveContext.Provider value={value}>
      {children}
    </WorkspaceActiveContext.Provider>
  );
};

export const useWorkspaceActive = (): WorkspaceActiveContextValue => {
  const ctx = useContext(WorkspaceActiveContext);
  if (!ctx) {
    throw new Error('useWorkspaceActive must be used within a WorkspaceActiveProvider');
  }
  return ctx;
};
