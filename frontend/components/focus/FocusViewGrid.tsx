'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GridComponent, GridPosition, GRID_POSITION_CLASSES, ComponentType, getSuggestedPositions, isPositionOccupied } from '@/lib/focusView';
import { FocusViewProvider } from '@/lib/FocusViewContext';
import { Plus, Settings, Save, Layout } from 'lucide-react';
import { Button } from '@/components/common';
import { ComponentPlacementModal } from './ComponentPlacementModal';
import { ConfigurationPanel } from './ConfigurationPanel';
import { FocusViewGridCell } from './FocusViewGridCell';
import { ClearAllConfirmModal } from './ClearAllConfirmModal';
import { ComponentPalette } from './ComponentPalette';
import { SaveLayoutModal } from './SaveLayoutModal';

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
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [isToolbarVisible, setIsToolbarVisible] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [draggingComponentId, setDraggingComponentId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [highlightedPosition, setHighlightedPosition] = useState<GridPosition | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const hoverZoneRef = useRef<HTMLDivElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Detect grid position from mouse coordinates
   * Prioritizes larger positions (halves, thirds, quarters) over smaller ones
   */
  const detectGridPosition = useCallback((x: number, y: number): GridPosition | null => {
    if (!gridContainerRef.current) return null;

    const rect = gridContainerRef.current.getBoundingClientRect();
    const relativeX = x - rect.left;
    const relativeY = y - rect.top;
    
    const gridWidth = rect.width;
    const gridHeight = rect.height;
    
    const colPercent = relativeX / gridWidth;
    const rowPercent = relativeY / gridHeight;

    // Smart detection: prioritize larger positions
    // Check if clearly in a half (within 20% of center line)
    const halfThreshold = 0.2;
    
    // Check vertical halves (left/right)
    if (colPercent < 0.5 - halfThreshold) {
      return 'left-half';
    } else if (colPercent > 0.5 + halfThreshold) {
      return 'right-half';
    }
    
    // Check horizontal halves (top/bottom) if not clearly in vertical half
    if (rowPercent < 0.5 - halfThreshold) {
      return 'top-half';
    } else if (rowPercent > 0.5 + halfThreshold) {
      return 'bottom-half';
    }
    
    // Default to quarters for center area
    const isLeftHalf = colPercent < 0.5;
    const isTopHalf = rowPercent < 0.5;
    
    if (isTopHalf && isLeftHalf) {
      return 'top-left-quarter';
    } else if (isTopHalf && !isLeftHalf) {
      return 'top-right-quarter';
    } else if (!isTopHalf && isLeftHalf) {
      return 'bottom-left-quarter';
    } else {
      return 'bottom-right-quarter';
    }
  }, []);

  /**
   * Find an available position for a component type
   * Tries center positions first, then falls back to others
   */
  const findAvailablePosition = useCallback((type: ComponentType): GridPosition => {
    const suggested = getSuggestedPositions(type, components);
    if (suggested.length === 0) {
      // Fallback to top-left-quarter if nothing available
      return 'top-left-quarter';
    }
    
    // Prefer center positions
    const preferred = ['center-third', 'top-left-quarter', 'top-right-quarter', 'left-half', 'right-half'];
    for (const pos of preferred) {
      if (suggested.includes(pos as GridPosition)) {
        return pos as GridPosition;
      }
    }
    
    return suggested[0];
  }, [components]);

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

  /**
   * Immediately add component and start dragging
   */
  const handleSelectComponent = useCallback((type: ComponentType) => {
    const position = findAvailablePosition(type);
    const newComponent: GridComponent = {
      id: `${type}-${Date.now()}`,
      type,
      position,
      config: {},
      zIndex: components.length,
    };

    const updatedComponents = [...components, newComponent];
    onComponentsChange(updatedComponents);
    
    // Start dragging immediately
    setDraggingComponentId(newComponent.id);
    setSelectedComponentId(newComponent.id);
  }, [components, onComponentsChange, findAvailablePosition]);

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
    // If dropdown is open, don't hide toolbar based on mouse position
    if (isDropdownOpen) return;

    const y = e.clientY;
    // Show toolbar when cursor is within top 80px of screen
    if (y <= 80) {
      if (!isToolbarVisible && !hoverTimeoutRef.current) {
        hoverTimeoutRef.current = setTimeout(() => {
          setIsToolbarVisible(true);
          hoverTimeoutRef.current = null;
        }, 1000);
      }
    } else {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      if (isToolbarVisible) {
        setIsToolbarVisible(false);
      }
    }
  }, [isDropdownOpen, isToolbarVisible]);

  const handleToolbarMouseEnter = useCallback(() => {
    setIsToolbarVisible(true);
  }, []);

  const handleToolbarMouseLeave = useCallback((e: React.MouseEvent) => {
    // Don't hide toolbar if dropdown is open or if mouse is moving to dropdown
    const relatedTarget = e.relatedTarget;
    const isMovingToDropdown = relatedTarget instanceof HTMLElement && relatedTarget.closest('[data-dropdown]');
    
    if (!isDropdownOpen && !isMovingToDropdown) {
      setIsToolbarVisible(false);
    }
  }, [isDropdownOpen]);

  /**
   * Handle mouse move during drag
   */
  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!draggingComponentId || !gridContainerRef.current) return;

    const position = detectGridPosition(e.clientX, e.clientY);
    setHighlightedPosition(position);
    setDragPosition({ x: e.clientX, y: e.clientY });
  }, [draggingComponentId, detectGridPosition]);

  /**
   * Handle mouse up to finalize drag
   */
  const handleDragEnd = useCallback((e: MouseEvent) => {
    if (!draggingComponentId) return;

    const component = components.find(c => c.id === draggingComponentId);
    if (component) {
      // Get the final position from mouse coordinates
      const finalPosition = detectGridPosition(e.clientX, e.clientY);
      
      if (finalPosition) {
        // Check if position is available (excluding the component being dragged)
        const otherComponents = components.filter(c => c.id !== draggingComponentId);
        if (!isPositionOccupied(finalPosition, otherComponents)) {
          handleMoveComponent(draggingComponentId, finalPosition);
        } else {
          // Try to find nearest available position
          const suggested = getSuggestedPositions(component.type, otherComponents);
          if (suggested.length > 0) {
            handleMoveComponent(draggingComponentId, suggested[0]);
          }
        }
      }
    }

    setDraggingComponentId(null);
    setDragPosition(null);
    setHighlightedPosition(null);
  }, [draggingComponentId, components, detectGridPosition, handleMoveComponent]);

  // Set up global mouse event listeners for dragging
  useEffect(() => {
    if (draggingComponentId) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      return () => {
        window.removeEventListener('mousemove', handleDragMove);
        window.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [draggingComponentId, handleDragMove, handleDragEnd]);

  /**
   * Start dragging a component
   */
  const handleStartDrag = useCallback((componentId: string) => {
    setDraggingComponentId(componentId);
    setSelectedComponentId(componentId);
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

          <ComponentPalette 
            onSelectComponent={handleSelectComponent}
            onDropdownStateChange={setIsDropdownOpen}
          />

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsSaveModalOpen(true)}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            Save Layout
          </Button>

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
                <ComponentPalette 
                  onSelectComponent={handleSelectComponent}
                  variant="outline"
                  size="md"
                  dropdownClassName="max-h-64"
                />
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
            <div 
              ref={gridContainerRef}
              className="grid grid-cols-12 grid-rows-12 gap-2 h-full relative"
            >
              {components.map((component) => (
                <FocusViewGridCell
                  key={component.id}
                  component={component}
                  isSelected={selectedComponentId === component.id}
                  isDragging={draggingComponentId === component.id}
                  onSelect={() => setSelectedComponentId(component.id)}
                  onRemove={() => handleRemoveComponent(component.id)}
                  onMove={(newPosition) => handleMoveComponent(component.id, newPosition)}
                  onUpdate={(updates) => handleUpdateComponent(component.id, updates)}
                  onStartDrag={handleStartDrag}
                  allComponents={components}
                />
              ))}

              {/* Visual Highlight Overlay */}
              {highlightedPosition && draggingComponentId && (
                <div
                  className={`
                    absolute pointer-events-none z-50
                    ${GRID_POSITION_CLASSES[highlightedPosition]}
                    border-2 border-primary bg-primary/10 rounded-lg
                    transition-all duration-150
                  `}
                />
              )}
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

      {/* Save Layout Modal */}
      <SaveLayoutModal
        open={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        currentComponents={components}
      />

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
