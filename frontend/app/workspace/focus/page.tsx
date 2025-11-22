'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { FocusViewGrid } from '@/components/focus/FocusViewGrid';
import { GridComponent } from '@/lib/focusView';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { createFocusViewStorage } from '@/lib/storage/focusViewStorage';

// Create storage adapter instance
const storage = createFocusViewStorage();

/**
 * Focus View Page
 *
 * A freeform grid workspace where users can place and arrange
 * components like code editors, PDF viewers, chat panels, etc.
 *
 * This page is only accessible when Focus View is enabled in settings.
 *
 * Features:
 * - Auto-save with debouncing (1s delay)
 * - Schema validation with Zod
 * - Error boundaries for component isolation
 * - Lazy loading for performance
 */
export default function FocusViewPage() {
  const router = useRouter();
  const [components, setComponents] = useState<GridComponent[]>([]);
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastEscapePressRef = useRef<number | null>(null);

  // Check if focus view is enabled and load configuration
  useEffect(() => {
    const initialize = async () => {
      try {
        const enabled = await storage.isEnabled();
        setIsEnabled(enabled);

        if (!enabled) {
          // Redirect to main workspace if not enabled
          router.push('/workspace');
          return;
        }

        // Load saved configuration
        const config = await storage.getActiveConfig();
        if (config && config.components) {
          setComponents(config.components);
        }
      } catch (err) {
        console.error('Failed to initialize Focus View:', err);
        setError('Failed to load workspace. Please try refreshing the page.');
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
  }, [router]);

  // Debounce components to prevent thrashing localStorage on every keystroke
  const debouncedComponents = useDebounce(components, 1000);

  // Auto-save configuration when components change (debounced)
  useEffect(() => {
    if (!isLoading && isEnabled && debouncedComponents.length >= 0) {
      storage.saveActiveConfig(debouncedComponents).catch((err) => {
        console.error('Failed to auto-save configuration:', err);
        // Don't show error to user for auto-save failures
      });
    }
  }, [debouncedComponents, isLoading, isEnabled]);

  // Double escape to exit focus view
  useEffect(() => {
    if (!isEnabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const now = Date.now();
        const lastPress = lastEscapePressRef.current;

        if (lastPress && now - lastPress < 500) {
          // Double escape detected - disable focus view and exit
          storage.setEnabled(false).then(() => {
            router.push('/workspace');
          }).catch((err) => {
            console.error('Failed to disable Focus View:', err);
            router.push('/workspace');
          });
          lastEscapePressRef.current = null;
        } else {
          // First escape - record timestamp
          lastEscapePressRef.current = now;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEnabled, router]);

  const handleSaveConfiguration = async () => {
    try {
      await storage.saveActiveConfig(components);
      // Could show toast notification here
      alert('Layout saved successfully!');
    } catch (err) {
      console.error('Failed to save configuration:', err);
      alert('Failed to save layout. Please try again.');
    }
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

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="max-w-md text-center space-y-4">
          <h2 className="text-2xl font-semibold text-destructive">Error</h2>
          <p className="text-muted-foreground">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            Reload Page
          </button>
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
