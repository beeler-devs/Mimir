'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Button, Input } from '@/components/common';
import { 
  GridComponent, 
  FocusViewConfiguration, 
  DEFAULT_CONFIGURATIONS,
  FOCUS_VIEW_CONFIGS_KEY,
} from '@/lib/focusView';
import { Layout, Trash2, Plus, Save } from 'lucide-react';
import { nanoid } from 'nanoid';
import { LayoutPreview } from './LayoutPreview';

interface ConfigurationPanelProps {
  open: boolean;
  onClose: () => void;
  onLoadConfiguration: (config: FocusViewConfiguration) => void;
  currentComponents: GridComponent[];
}

/**
 * Panel for managing saved configurations and templates
 */
export const ConfigurationPanel: React.FC<ConfigurationPanelProps> = ({
  open,
  onClose,
  onLoadConfiguration,
  currentComponents,
}) => {
  const [savedConfigs, setSavedConfigs] = useState<FocusViewConfiguration[]>([]);

  // Load saved configurations from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(FOCUS_VIEW_CONFIGS_KEY);
      if (stored) {
        try {
          const configs = JSON.parse(stored);
          setSavedConfigs(configs);
        } catch (error) {
          console.error('Failed to parse saved configurations:', error);
        }
      }
    }
  }, [open]);

  const handleDeleteConfiguration = (id: string) => {
    if (!confirm('Are you sure you want to delete this configuration?')) return;

    const updatedConfigs = savedConfigs.filter(c => c.id !== id);
    setSavedConfigs(updatedConfigs);
    localStorage.setItem(FOCUS_VIEW_CONFIGS_KEY, JSON.stringify(updatedConfigs));
  };

  const handleLoadTemplate = (template: typeof DEFAULT_CONFIGURATIONS[0]) => {
    const config: FocusViewConfiguration = {
      id: nanoid(),
      name: template.name,
      description: template.description,
      components: template.components,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onLoadConfiguration(config);
  };

  return (
    <Modal 
      open={open} 
      onClose={onClose}
      containerClassName="items-center pt-0"
    >
      <div className="w-[700px] max-w-full max-h-[85vh] overflow-y-auto scrollbar-hide-show mx-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold">Layouts & Templates</h2>
          </div>

          {/* Default Templates */}
          <div className="mb-8">
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
              Template Layouts
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {DEFAULT_CONFIGURATIONS.map((template, index) => (
                <div
                  key={index}
                  onClick={() => handleLoadTemplate(template)}
                  className="group relative p-4 rounded-xl border border-border hover:border-primary/50 transition-all text-left bg-card hover:bg-muted/20 cursor-pointer flex flex-col gap-3"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleLoadTemplate(template);
                    }
                  }}
                >
                  <LayoutPreview components={template.components} className="h-32 w-full" />
                  
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Layout className="h-4 w-4 text-primary" />
                      <p className="font-semibold">{template.name}</p>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {template.description}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {template.components.length} component{template.components.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="sm" variant="secondary">
                      Load
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Saved Configurations */}
          {savedConfigs.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
                Your Saved Layouts
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {savedConfigs.map((config) => (
                  <div
                    key={config.id}
                    className="group relative p-4 rounded-xl border border-border bg-card hover:border-primary/50 transition-all flex flex-col gap-3"
                  >
                    <LayoutPreview components={config.components} className="h-32 w-full" />
                    
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Layout className="h-4 w-4 text-primary" />
                        <p className="font-semibold">{config.name}</p>
                      </div>
                      {config.description && (
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                          {config.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {config.components.length} component{config.components.length !== 1 ? 's' : ''} •
                        Saved {new Date(config.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex gap-2 mt-auto pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => onLoadConfiguration(config)}
                      >
                        Load
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteConfiguration(config.id)}
                        className="text-destructive hover:text-destructive px-2"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
