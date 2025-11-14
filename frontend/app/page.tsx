'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { WorkspaceLayout } from '@/components/layout';
import { AISidePanel } from '@/components/ai/AISidePanel';
import { TextEditor, CodeEditor, AnnotateCanvas } from '@/components/tabs';
import { InstanceSidebar, SettingsModal, NewInstanceModal } from '@/components/workspace';
import { Button } from '@/components/common';
import type {
  WorkspaceInstance,
  InstanceType,
  ThemePreference,
  CodeLanguage,
} from '@/lib/types';

const STORAGE_KEYS = {
  instances: 'mimir.instances',
  active: 'mimir.activeInstance',
  theme: 'mimir.themePreference',
};

const defaultInstances: WorkspaceInstance[] = [
  {
    id: 'default-text',
    title: 'Linear algebra notes',
    type: 'text',
    data: { content: '' },
  },
  {
    id: 'default-code',
    title: 'Numerical methods code',
    type: 'code',
    data: {
      language: 'python',
      code: '# Experiment with code here\n',
    },
  },
  {
    id: 'default-annotate',
    title: 'Whiteboard sketches',
    type: 'annotate',
    data: {},
  },
];

const generateId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const createInstance = (title: string, type: InstanceType): WorkspaceInstance => {
  const id = generateId();
  if (type === 'text') {
    return { id, title, type, data: { content: '' } };
  }
  if (type === 'code') {
    return {
      id,
      title,
      type,
      data: {
        language: 'python',
        code: '# Write your code here\n',
      },
    };
  }
  return { id, title, type, data: {} };
};

const EmptyState = ({ onCreate }: { onCreate: () => void }) => (
  <div className="h-full flex flex-col items-center justify-center text-center px-8">
    <p className="text-lg font-semibold mb-2">No instance selected</p>
    <p className="text-sm text-muted-foreground mb-6">
      Create a new workspace instance or select one from the left panel to get started.
    </p>
    <Button onClick={onCreate}>Create instance</Button>
  </div>
);

const applyThemePreference = (preference: ThemePreference) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (preference === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  } else {
    root.classList.toggle('dark', preference === 'dark');
  }
};

export default function Home() {
  const [instances, setInstances] = useState<WorkspaceInstance[]>(defaultInstances);
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(defaultInstances[0]?.id ?? null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newInstanceOpen, setNewInstanceOpen] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>('system');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const storedInstancesRaw = localStorage.getItem(STORAGE_KEYS.instances);
      const storedActive = localStorage.getItem(STORAGE_KEYS.active);
      const storedTheme = localStorage.getItem(STORAGE_KEYS.theme) as ThemePreference | null;

      let nextInstances = defaultInstances;
      if (storedInstancesRaw) {
        const parsed = JSON.parse(storedInstancesRaw) as WorkspaceInstance[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          nextInstances = parsed;
        }
      }
      setInstances(nextInstances);

      const validActive =
        storedActive && nextInstances.some((instance) => instance.id === storedActive)
          ? storedActive
          : nextInstances[0]?.id ?? null;
      setActiveInstanceId(validActive);

      if (storedTheme) {
        setThemePreference(storedTheme);
        applyThemePreference(storedTheme);
      } else {
        applyThemePreference('system');
      }
    } catch (error) {
      console.error('Failed to hydrate workspace state:', error);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEYS.instances, JSON.stringify(instances));
  }, [instances, hydrated]);

  useEffect(() => {
    if (!hydrated || !activeInstanceId) return;
    localStorage.setItem(STORAGE_KEYS.active, activeInstanceId);
  }, [activeInstanceId, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEYS.theme, themePreference);
    applyThemePreference(themePreference);
  }, [themePreference, hydrated]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMedia = () => {
      if (themePreference === 'system') {
        applyThemePreference('system');
      }
    };
    media.addEventListener('change', handleMedia);
    return () => media.removeEventListener('change', handleMedia);
  }, [themePreference]);

  const activeInstance = useMemo(
    () => instances.find((instance) => instance.id === activeInstanceId) ?? null,
    [instances, activeInstanceId]
  );

  const handleRename = (id: string, title: string) => {
    const nextTitle = title.trim();
    setInstances((prev) =>
      prev.map((instance) =>
        instance.id === id && nextTitle.length > 0 ? { ...instance, title: nextTitle } : instance
      )
    );
  };

  const handleDelete = (id: string) => {
    setInstances((prev) => {
      const filtered = prev.filter((instance) => instance.id !== id);
      if (activeInstanceId === id) {
        setActiveInstanceId(filtered[0]?.id ?? null);
      }
      return filtered;
    });
  };

  const handleCreateInstance = (title: string, type: InstanceType) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const newInstance = createInstance(trimmed, type);
    setInstances((prev) => [...prev, newInstance]);
    setActiveInstanceId(newInstance.id);
  };

  const updateTextContent = (value: string) => {
    if (!activeInstanceId) return;
    setInstances((prev) =>
      prev.map((instance) =>
        instance.id === activeInstanceId && instance.type === 'text'
          ? { ...instance, data: { content: value } }
          : instance
      )
    );
  };

  const updateCode = (value: string) => {
    if (!activeInstanceId) return;
    setInstances((prev) =>
      prev.map((instance) =>
        instance.id === activeInstanceId && instance.type === 'code'
          ? { ...instance, data: { ...instance.data, code: value } }
          : instance
      )
    );
  };

  const updateLanguage = (language: CodeLanguage) => {
    if (!activeInstanceId) return;
    setInstances((prev) =>
      prev.map((instance) =>
        instance.id === activeInstanceId && instance.type === 'code'
          ? { ...instance, data: { ...instance.data, language } }
          : instance
      )
    );
  };

  const renderActiveContent = () => {
    if (!activeInstance) {
      return <EmptyState onCreate={() => setNewInstanceOpen(true)} />;
    }
    switch (activeInstance.type) {
      case 'text':
        return (
          <TextEditor
            content={activeInstance.data.content}
            onChange={updateTextContent}
          />
        );
      case 'code':
        return (
          <CodeEditor
            language={activeInstance.data.language}
            code={activeInstance.data.code}
            onCodeChange={updateCode}
            onLanguageChange={updateLanguage}
          />
        );
      case 'annotate':
      default:
        return <AnnotateCanvas key={activeInstance.id} />;
    }
  };

  return (
    <div className="flex h-screen bg-background">
      <InstanceSidebar
        instances={instances}
        activeInstanceId={activeInstanceId}
        onSelect={(id) => setActiveInstanceId(id)}
        onCreateInstance={() => setNewInstanceOpen(true)}
        onRename={handleRename}
        onDelete={handleDelete}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="flex-1 h-full overflow-hidden">
        <WorkspaceLayout sidebar={<AISidePanel />}>{renderActiveContent()}</WorkspaceLayout>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={themePreference}
        onThemeChange={setThemePreference}
      />

      <NewInstanceModal
        open={newInstanceOpen}
        onClose={() => setNewInstanceOpen(false)}
        onCreate={handleCreateInstance}
      />
    </div>
  );
}
