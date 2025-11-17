'use client';

import React, { useState, useCallback, useRef } from 'react';
import { GridComponent, GridPosition, GRID_POSITION_CLASSES, ComponentType } from '@/lib/focusView';
import { FocusViewProvider } from '@/lib/FocusViewContext';
import { Plus, Settings, Save, Layout } from 'lucide-react';
import { Button } from '@/components/common';
import { ComponentPlacementModal } from './ComponentPlacementModal';
import { ConfigurationPanel } from './ConfigurationPanel';
import { FocusViewGridCell } from './FocusViewGridCell';

interface FocusViewGridProps {
  components: GridComponent[];
  onComponentsChange: (components: GridComponent[]) => void;
  onSaveConfiguration?: () => void;
}

/**
 * Main Focus View Grid Layout
 *
 * Features:
 * - 12x12 grid system for flexible layouts
 * - Snap positions (thirds, quarters, halves, etc.)
 * - Component placement and removal
 * - Configuration management
 */
export const FocusViewGrid: React.FC<FocusViewGridProps> = ({
  components,
  onComponentsChange,
  onSaveConfiguration,
}) => {
  const [isPlacementModalOpen, setIsPlacementModalOpen] = useState(false);
  const [isConfigPanelOpen, setIsConfigPanelOpen] = useState(false);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const handleAddComponent = useCallback((
    type: ComponentType,
    position: GridPosition,
    config?: any
  ) => {
    const newComponent: GridComponent = {
      id: `${type}-${Date.now()}`,
      type,
      position,
      config,
      zIndex: components.length,
    };

    onComponentsChange([...components, newComponent]);
    setIsPlacementModalOpen(false);
  }, [components, onComponentsChange]);

  const handleRemoveComponent = useCallback((id: string) => {
    onComponentsChange(components.filter(c => c.id !== id));
    if (selectedComponentId === id) {
      setSelectedComponentId(null);
    }
  }, [components, onComponentsChange, selectedComponentId]);

  const handleUpdateComponent = useCallback((id: string, updates: Partial<GridComponent>) => {
    onComponentsChange(
      components.map(c => c.id === id ? { ...c, ...updates } : c)
    );
  }, [components, onComponentsChange]);

  const handleMoveComponent = useCallback((id: string, newPosition: GridPosition) => {
    handleUpdateComponent(id, { position: newPosition });
  }, [handleUpdateComponent]);

  const handleClearAll = useCallback(() => {
    if (confirm('Are you sure you want to remove all components?')) {
      onComponentsChange([]);
      setSelectedComponentId(null);
    }
  }, [onComponentsChange]);

  return (
    <FocusViewProvider>
      <div className="h-screen flex flex-col bg-background">
      {/* Toolbar */}
      <div className="h-14 border-b border-border bg-card/30 flex items-center justify-between px-4 gap-4">
        <div className="flex items-center gap-2">
          <Layout className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Focus View</h1>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsConfigPanelOpen(true)}
            className="gap-2"
          >
            <Layout className="h-4 w-4" />
            Templates
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsPlacementModalOpen(true)}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Component
          </Button>

          {onSaveConfiguration && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSaveConfiguration}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              Save Layout
            </Button>
          )}

          {components.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="text-destructive hover:text-destructive"
            >
              Clear All
            </Button>
          )}
        </div>
      </div>

      {/* Grid Container */}
      <div ref={gridRef} className="flex-1 overflow-auto p-4 bg-muted/20">
        {components.length === 0 ? (
          // Empty State
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
            <div className="rounded-full bg-primary/10 p-6">
              <Layout className="h-12 w-12 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold mb-2">Your Focus Workspace</h2>
              <p className="text-muted-foreground max-w-md mb-6">
                Create a custom layout by adding components like code editors, PDF viewers, chat panels, and more.
                Arrange them in a grid to build your perfect study or work environment.
              </p>
              <div className="flex gap-3 justify-center">
                <Button
                  onClick={() => setIsPlacementModalOpen(true)}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Your First Component
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsConfigPanelOpen(true)}
                  className="gap-2"
                >
                  <Layout className="h-4 w-4" />
                  Browse Templates
                </Button>
              </div>
            </div>
          </div>
        ) : (
          // Grid with Components
          <div className="h-full max-w-[1920px] mx-auto">
            <div className="grid grid-cols-12 grid-rows-12 gap-2 h-full relative">
              {components.map((component) => (
                <FocusViewGridCell
                  key={component.id}
                  component={component}
                  isSelected={selectedComponentId === component.id}
                  onSelect={() => setSelectedComponentId(component.id)}
                  onRemove={() => handleRemoveComponent(component.id)}
                  onMove={(newPosition) => handleMoveComponent(component.id, newPosition)}
                  onUpdate={(updates) => handleUpdateComponent(component.id, updates)}
                  allComponents={components}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Component Placement Modal */}
      {isPlacementModalOpen && (
        <ComponentPlacementModal
          open={isPlacementModalOpen}
          onClose={() => setIsPlacementModalOpen(false)}
          onAddComponent={handleAddComponent}
          existingComponents={components}
        />
      )}

      {/* Configuration Panel */}
      {isConfigPanelOpen && (
        <ConfigurationPanel
          open={isConfigPanelOpen}
          onClose={() => setIsConfigPanelOpen(false)}
          onLoadConfiguration={(config) => {
            onComponentsChange(config.components);
            setIsConfigPanelOpen(false);
          }}
          currentComponents={components}
        />
      )}
      </div>
    </FocusViewProvider>
  );
};
