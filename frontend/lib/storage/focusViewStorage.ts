/**
 * Storage adapter abstraction for Focus View configuration persistence
 *
 * This provides a clean interface for storing/retrieving configurations,
 * making it easy to migrate from localStorage to a database in the future.
 */

import { GridComponent, FocusViewConfiguration } from '@/lib/focusView';
import { z } from 'zod';

// Zod schemas for runtime validation
const GridComponentSchema = z.object({
  id: z.string(),
  type: z.enum([
    'chat',
    'code-editor',
    'text-editor',
    'pdf-viewer',
    'voice-input',
    'annotate-canvas',
    'lecture-viewer',
    'flashcard',
    'calendar',
    'pomodoro',
    'terminal',
    'whiteboard',
  ]),
  position: z.string(),
  instanceId: z.string().optional(),
  config: z.record(z.any()).optional(),
  customSize: z.object({
    width: z.number().optional(),
    height: z.number().optional(),
    minWidth: z.number().optional(),
    minHeight: z.number().optional(),
    maxWidth: z.number().optional(),
    maxHeight: z.number().optional(),
    aspectRatio: z.number().optional(),
    fixedSize: z.boolean().optional(),
  }).optional(),
  zIndex: z.number().optional(),
});

const FocusViewConfigurationSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  components: z.array(GridComponentSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const ActiveConfigSchema = z.object({
  components: z.array(GridComponentSchema),
  updatedAt: z.string(),
});

export interface IFocusViewStorage {
  /**
   * Check if Focus View is enabled
   */
  isEnabled(): Promise<boolean>;

  /**
   * Enable or disable Focus View
   */
  setEnabled(enabled: boolean): Promise<void>;

  /**
   * Get the active configuration (current workspace state)
   */
  getActiveConfig(): Promise<{ components: GridComponent[]; updatedAt: string } | null>;

  /**
   * Save the active configuration
   */
  saveActiveConfig(components: GridComponent[]): Promise<void>;

  /**
   * Get all saved configurations (user-created templates)
   */
  getSavedConfigurations(): Promise<FocusViewConfiguration[]>;

  /**
   * Save a new configuration
   */
  saveConfiguration(config: FocusViewConfiguration): Promise<void>;

  /**
   * Delete a saved configuration
   */
  deleteConfiguration(id: string): Promise<void>;
}

/**
 * LocalStorage implementation of the storage adapter
 */
export class LocalStorageFocusViewStorage implements IFocusViewStorage {
  private readonly ENABLED_KEY = 'mimir.focusView.enabled';
  private readonly ACTIVE_CONFIG_KEY = 'mimir.focusView.activeConfig';
  private readonly CONFIGS_KEY = 'mimir.focusView.configurations';

  async isEnabled(): Promise<boolean> {
    try {
      return localStorage.getItem(this.ENABLED_KEY) === 'true';
    } catch (error) {
      console.error('Failed to check if Focus View is enabled:', error);
      return false;
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    try {
      localStorage.setItem(this.ENABLED_KEY, String(enabled));
    } catch (error) {
      console.error('Failed to set Focus View enabled state:', error);
      throw error;
    }
  }

  async getActiveConfig(): Promise<{ components: GridComponent[]; updatedAt: string } | null> {
    try {
      const stored = localStorage.getItem(this.ACTIVE_CONFIG_KEY);
      if (!stored) {
        return null;
      }

      const parsed = JSON.parse(stored);

      // Validate with Zod
      const validated = ActiveConfigSchema.parse(parsed);

      return {
        components: validated.components as GridComponent[],
        updatedAt: validated.updatedAt,
      };
    } catch (error) {
      console.error('Failed to load active configuration:', error);

      // Remove corrupted data
      try {
        localStorage.removeItem(this.ACTIVE_CONFIG_KEY);
      } catch (e) {
        // Ignore
      }

      return null;
    }
  }

  async saveActiveConfig(components: GridComponent[]): Promise<void> {
    try {
      const config = {
        components,
        updatedAt: new Date().toISOString(),
      };

      localStorage.setItem(this.ACTIVE_CONFIG_KEY, JSON.stringify(config));
    } catch (error) {
      console.error('Failed to save active configuration:', error);
      throw error;
    }
  }

  async getSavedConfigurations(): Promise<FocusViewConfiguration[]> {
    try {
      const stored = localStorage.getItem(this.CONFIGS_KEY);
      if (!stored) {
        return [];
      }

      const parsed = JSON.parse(stored);

      // Validate array
      if (!Array.isArray(parsed)) {
        throw new Error('Saved configurations is not an array');
      }

      // Validate each configuration
      const validated = z.array(FocusViewConfigurationSchema).parse(parsed);

      return validated as FocusViewConfiguration[];
    } catch (error) {
      console.error('Failed to load saved configurations:', error);

      // Remove corrupted data
      try {
        localStorage.removeItem(this.CONFIGS_KEY);
      } catch (e) {
        // Ignore
      }

      return [];
    }
  }

  async saveConfiguration(config: FocusViewConfiguration): Promise<void> {
    try {
      // Validate the configuration
      FocusViewConfigurationSchema.parse(config);

      const existing = await this.getSavedConfigurations();
      const updated = [...existing, config];

      localStorage.setItem(this.CONFIGS_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to save configuration:', error);
      throw error;
    }
  }

  async deleteConfiguration(id: string): Promise<void> {
    try {
      const existing = await this.getSavedConfigurations();
      const filtered = existing.filter(c => c.id !== id);

      localStorage.setItem(this.CONFIGS_KEY, JSON.stringify(filtered));
    } catch (error) {
      console.error('Failed to delete configuration:', error);
      throw error;
    }
  }
}

/**
 * Create the storage adapter instance
 *
 * In the future, this can be swapped for a Supabase adapter or other implementation
 */
export function createFocusViewStorage(): IFocusViewStorage {
  return new LocalStorageFocusViewStorage();
}
