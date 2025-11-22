'use client';

import React, { useState, useCallback, useRef } from 'react';
import { GridComponent, GridPosition, GRID_POSITION_CLASSES, ComponentType } from '@/lib/focusView';
import { FocusViewProvider } from '@/lib/FocusViewContext';
import { Plus, Settings, Save, Layout } from 'lucide-react';
import { Button } from '@/components/common';
import { ComponentPlacementModal } from './ComponentPlacementModal';
import { ConfigurationPanel } from './ConfigurationPanel';
import { FocusViewGridCell } from './FocusViewGridCell';
import { ClearAllConfirmModal } from './ClearAllConfirmModal';

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
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [isToolbarVisible, setIsToolbarVisible] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const hoverZoneRef = useRef<HTMLDivElement>(null);

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
    setIsClearAllModalOpen(true);
  }, []);

  const handleConfirmClearAll = useCallback(() => {
    onComponentsChange([]);
    setSelectedComponentId(null);
  }, [onComponentsChange]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const y = e.clientY;
    // Show toolbar when cursor is within top 80px of screen
    if (y <= 80) {
      setIsToolbarVisible(true);
    } else {
      setIsToolbarVisible(false);
    }
  }, []);

  const handleToolbarMouseEnter = useCallback(() => {
    setIsToolbarVisible(true);
  }, []);

  const handleToolbarMouseLeave = useCallback(() => {
    setIsToolbarVisible(false);
  }, []);

  return (
    <FocusViewProvider>
      <div 
        className="h-screen flex flex-col bg-background relative"
        onMouseMove={handleMouseMove}
      >
      {/* Hover Detection Zone */}
      <div 
        ref={hoverZoneRef}
        className="fixed top-0 left-0 right-0 h-20 z-30 pointer-events-none"
      />

      {/* Toolbar */}
      <div 
        className={`
          fixed top-0 left-0 right-0 z-40
          h-14 mx-4 mt-2
          rounded-xl
          border border-border bg-card/95 backdrop-blur-sm
          flex items-center justify-between px-4 gap-4
          transition-all duration-300 ease-in-out
          ${isToolbarVisible 
            ? 'opacity-100 translate-y-0 pointer-events-auto' 
            : 'opacity-0 -translate-y-full pointer-events-none'
          }
        `}
        onMouseEnter={handleToolbarMouseEnter}
        onMouseLeave={handleToolbarMouseLeave}
      >
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
      <div ref={gridRef} className="flex-1 overflow-auto p-4 bg-grid-pattern pt-4">
        {components.length === 0 ? (
          // Empty State
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
            <div className="rounded-full bg-primary/10 p-6">
              <Layout className="h-12 w-12 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold mb-2">Your Focus Workspace</h2>

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

      {/* Clear All Confirmation Modal */}
      <ClearAllConfirmModal
        open={isClearAllModalOpen}
        onClose={() => setIsClearAllModalOpen(false)}
        onConfirm={handleConfirmClearAll}
      />
      </div>
    </FocusViewProvider>
  );
};
