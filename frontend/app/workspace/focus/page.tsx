'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FocusViewGrid } from '@/components/focus/FocusViewGrid';
import { GridComponent, FOCUS_VIEW_ENABLED_KEY, FOCUS_VIEW_ACTIVE_CONFIG_KEY } from '@/lib/focusView';

/**
 * Focus View Page
 *
 * A freeform grid workspace where users can place and arrange
 * components like code editors, PDF viewers, chat panels, etc.
 *
 * This page is only accessible when Focus View is enabled in settings.
 */
export default function FocusViewPage() {
  const router = useRouter();
  const [components, setComponents] = useState<GridComponent[]>([]);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check if focus view is enabled
  useEffect(() => {
    const enabled = localStorage.getItem(FOCUS_VIEW_ENABLED_KEY) === 'true';
    setIsEnabled(enabled);

    if (!enabled) {
      // Redirect to main workspace if not enabled
      router.push('/workspace');
    } else {
      // Load saved configuration
      const savedConfig = localStorage.getItem(FOCUS_VIEW_ACTIVE_CONFIG_KEY);
      if (savedConfig) {
        try {
          const config = JSON.parse(savedConfig);
          setComponents(config.components || []);
        } catch (error) {
          console.error('Failed to parse saved configuration:', error);
        }
      }
      setIsLoading(false);
    }
  }, [router]);

  // Auto-save configuration when components change
  useEffect(() => {
    if (!isLoading && isEnabled) {
      const config = {
        components,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(FOCUS_VIEW_ACTIVE_CONFIG_KEY, JSON.stringify(config));
    }
  }, [components, isLoading, isEnabled]);

  const handleSaveConfiguration = () => {
    // Show success message
    const config = {
      components,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(FOCUS_VIEW_ACTIVE_CONFIG_KEY, JSON.stringify(config));
    alert('Layout saved successfully!');
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Loading Focus View...</p>
        </div>
      </div>
    );
  }

  if (!isEnabled) {
    return null; // Will redirect
  }

  return (
    <FocusViewGrid
      components={components}
      onComponentsChange={setComponents}
      onSaveConfiguration={handleSaveConfiguration}
    />
  );
}
