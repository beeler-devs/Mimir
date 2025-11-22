'use client';

import React, { useState, useEffect } from 'react';
import { Modal, Button, Input } from '@/components/common';
import {
  FocusViewConfiguration,
  GridComponent,
  DEFAULT_CONFIGURATIONS,
  FOCUS_VIEW_CONFIGS_KEY,
} from '@/lib/focusView';
import { Layout, Trash2, Plus, Save } from 'lucide-react';
import { nanoid } from 'nanoid';

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
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newConfigName, setNewConfigName] = useState('');
  const [newConfigDescription, setNewConfigDescription] = useState('');

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

  const handleSaveConfiguration = () => {
    if (!newConfigName.trim()) return;

    const newConfig: FocusViewConfiguration = {
      id: nanoid(),
      name: newConfigName.trim(),
      description: newConfigDescription.trim() || undefined,
      components: currentComponents,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedConfigs = [...savedConfigs, newConfig];
    setSavedConfigs(updatedConfigs);
    localStorage.setItem(FOCUS_VIEW_CONFIGS_KEY, JSON.stringify(updatedConfigs));

    setShowSaveDialog(false);
    setNewConfigName('');
    setNewConfigDescription('');
  };

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
    <Modal open={open} onClose={onClose}>
      <div className="w-full max-w-[700px] max-h-[80vh] overflow-y-auto scrollbar-hide-show mx-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold">Layouts & Templates</h2>
            {currentComponents.length > 0 && (
              <Button
                onClick={() => setShowSaveDialog(true)}
                size="sm"
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                Save Current Layout
              </Button>
            )}
          </div>

          {/* Save Dialog */}
          {showSaveDialog && (
            <div className="mb-6 p-4 rounded-xl border border-border bg-muted/20">
              <h3 className="font-semibold mb-3">Save Current Layout</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    Layout Name
                  </label>
                  <Input
                    type="text"
                    value={newConfigName}
                    onChange={(e) => setNewConfigName(e.target.value)}
                    placeholder="My Custom Layout"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">
                    Description (optional)
                  </label>
                  <Input
                    type="text"
                    value={newConfigDescription}
                    onChange={(e) => setNewConfigDescription(e.target.value)}
                    placeholder="Describe your layout..."
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setShowSaveDialog(false);
                      setNewConfigName('');
                      setNewConfigDescription('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveConfiguration}
                    disabled={!newConfigName.trim()}
                  >
                    Save Layout
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Default Templates */}
          <div className="mb-8">
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
              Template Layouts
            </h3>
            <div className="grid gap-3">
              {DEFAULT_CONFIGURATIONS.map((template, index) => (
                <div
                  key={index}
                  onClick={() => handleLoadTemplate(template)}
                  className="p-4 rounded-xl border border-border hover:border-primary/50 transition-all text-left bg-card hover:bg-muted/20 cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleLoadTemplate(template);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Layout className="h-4 w-4 text-primary" />
                        <p className="font-semibold">{template.name}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {template.description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {template.components.length} component{template.components.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="pointer-events-none">
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
              <div className="grid gap-3">
                {savedConfigs.map((config) => (
                  <div
                    key={config.id}
                    className="p-4 rounded-xl border border-border bg-card"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Layout className="h-4 w-4 text-primary" />
                          <p className="font-semibold">{config.name}</p>
                        </div>
                        {config.description && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {config.description}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {config.components.length} component{config.components.length !== 1 ? 's' : ''} •
                          Saved {new Date(config.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onLoadConfiguration(config)}
                        >
                          Load
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteConfiguration(config.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {savedConfigs.length === 0 && !showSaveDialog && (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                No saved layouts yet. Create a layout and save it for later!
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-6 border-t border-border mt-6">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
