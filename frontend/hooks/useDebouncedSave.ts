'use client';

import { useRef, useCallback, useEffect } from 'react';
import { updateInstance as updateInstanceDB } from '@/lib/db/instances';

interface UseDebouncedSaveOptions {
  delay?: number;
  onError?: (error: Error) => void;
}

interface UseDebouncedSaveReturn {
  debouncedSave: (instanceId: string, data: Record<string, unknown>) => void;
  flush: () => Promise<void>;
  cancel: () => void;
  isPending: boolean;
}

export function useDebouncedSave(options: UseDebouncedSaveOptions = {}): UseDebouncedSaveReturn {
  const { delay = 2000, onError } = options;

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingRef = useRef<{ instanceId: string; data: Record<string, unknown> } | null>(null);
  const isPendingRef = useRef(false);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const executeSave = useCallback(async () => {
    if (!pendingRef.current) return;

    const { instanceId, data } = pendingRef.current;
    pendingRef.current = null;
    isPendingRef.current = false;

    try {
      await updateInstanceDB(instanceId, { data });
    } catch (error) {
      console.error('Failed to save instance:', error);
      if (onError && error instanceof Error) {
        onError(error);
      }
    }
  }, [onError]);

  const debouncedSave = useCallback(
    (instanceId: string, data: Record<string, unknown>) => {
      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Store pending data
      pendingRef.current = { instanceId, data };
      isPendingRef.current = true;

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        executeSave();
      }, delay);
    },
    [delay, executeSave]
  );

  const flush = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    await executeSave();
  }, [executeSave]);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    pendingRef.current = null;
    isPendingRef.current = false;
  }, []);

  return {
    debouncedSave,
    flush,
    cancel,
    get isPending() {
      return isPendingRef.current;
    },
  };
}
