'use client';

import { useState, useEffect } from 'react';

export type AccentColor = 'violet' | 'emerald' | 'sky' | 'rose' | 'amber';

const STORAGE_KEY = 'mimir-accent-color';
const DEFAULT_ACCENT: AccentColor = 'violet';

export function useAccentColor() {
  const [accent, setAccent] = useState<AccentColor>(DEFAULT_ACCENT);

  useEffect(() => {
    // Load from storage on mount
    const stored = localStorage.getItem(STORAGE_KEY) as AccentColor;
    if (stored) {
      setAccent(stored);
      document.documentElement.dataset.accent = stored;
    }
  }, []);

  const updateAccent = (newAccent: AccentColor) => {
    setAccent(newAccent);
    localStorage.setItem(STORAGE_KEY, newAccent);
    document.documentElement.dataset.accent = newAccent;
  };

  return { accent, setAccent: updateAccent };
}
