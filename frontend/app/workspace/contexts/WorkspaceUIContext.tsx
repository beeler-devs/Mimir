'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ThemePreference } from '@/lib/types';

interface WorkspaceUIContextValue {
  themePreference: ThemePreference;
  setThemePreference: React.Dispatch<React.SetStateAction<ThemePreference>>;
  settingsOpen: boolean;
  setSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  newInstanceOpen: boolean;
  setNewInstanceOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const STORAGE_KEYS = {
  theme: 'mimir.themePreference',
};

const WorkspaceUIContext = createContext<WorkspaceUIContextValue | null>(null);

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

export const WorkspaceUIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themePreference, setThemePreference] = useState<ThemePreference>('light');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newInstanceOpen, setNewInstanceOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Load theme preference
  useEffect(() => {
    const storedTheme = localStorage.getItem(STORAGE_KEYS.theme) as ThemePreference | null;
    if (storedTheme) {
      setThemePreference(storedTheme);
      applyThemePreference(storedTheme);
    } else {
      setThemePreference('light');
      applyThemePreference('light');
    }
    setInitialized(true);
  }, []);

  // Persist theme preference
  useEffect(() => {
    if (initialized) {
      localStorage.setItem(STORAGE_KEYS.theme, themePreference);
      applyThemePreference(themePreference);
    }
  }, [themePreference, initialized]);

  // React to system theme changes when in system mode
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

  const value: WorkspaceUIContextValue = {
    themePreference,
    setThemePreference,
    settingsOpen,
    setSettingsOpen,
    newInstanceOpen,
    setNewInstanceOpen,
  };

  return (
    <WorkspaceUIContext.Provider value={value}>
      {children}
    </WorkspaceUIContext.Provider>
  );
};

export const useWorkspaceUI = (): WorkspaceUIContextValue => {
  const ctx = useContext(WorkspaceUIContext);
  if (!ctx) {
    throw new Error('useWorkspaceUI must be used within a WorkspaceUIProvider');
  }
  return ctx;
};
