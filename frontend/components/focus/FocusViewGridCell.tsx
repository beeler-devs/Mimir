'use client';

import React, { useState } from 'react';
import {
  GridComponent,
  GridPosition,
  GRID_POSITION_CLASSES,
  COMPONENT_REGISTRY,
  getAvailablePositions,
} from '@/lib/focusView';
import { X, Move, MoreVertical } from 'lucide-react';
import { SimpleContextMenu } from './SimpleContextMenu';
import { FocusViewComponentRenderer } from './FocusViewComponentRenderer';

interface FocusViewGridCellProps {
  component: GridComponent;
  isSelected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onMove: (newPosition: GridPosition) => void;
  onUpdate: (updates: Partial<GridComponent>) => void;
  allComponents: GridComponent[];
}

/**
 * Individual grid cell that renders a component
 *
 * Features:
 * - Bordered with rounded corners
 * - Component header with title and controls
 * - Context menu for repositioning
 * - Selection state
 */
export const FocusViewGridCell: React.FC<FocusViewGridCellProps> = ({
  component,
  isSelected,
  onSelect,
  onRemove,
  onMove,
  onUpdate,
  allComponents,
}) => {
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });

  const metadata = COMPONENT_REGISTRY[component.type];
  const positionClasses = GRID_POSITION_CLASSES[component.position];

  const availablePositions = getAvailablePositions(component.type);
  const occupiedPositions = allComponents
    .filter(c => c.id !== component.id)
    .map(c => c.position);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  const handleMoveToPosition = (position: GridPosition) => {
    onMove(position);
    setShowContextMenu(false);
  };

  // Build context menu items for repositioning
  const contextMenuItems = availablePositions
    .filter(pos => !occupiedPositions.includes(pos))
    .map(position => ({
      label: formatPositionName(position),
      onClick: () => handleMoveToPosition(position),
      disabled: position === component.position,
    }));

  return (
    <>
      <div
        className={`
          ${positionClasses}
          relative rounded-2xl border-2 overflow-hidden
          transition-all duration-200
          ${isSelected
            ? 'border-primary shadow-lg ring-2 ring-primary/20'
            : 'border-border hover:border-primary/50'
          }
          bg-background
        `}
        onClick={onSelect}
        onContextMenu={handleContextMenu}
        style={{ zIndex: isSelected ? 10 : 1 }}
      >
        {/* Component Header */}
        <div className="h-10 px-3 border-b border-border bg-card/50 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Move className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 cursor-move" />
            <span className="text-sm font-medium truncate">
              {metadata.title}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleContextMenu(e);
              }}
              className="h-7 w-7 rounded-lg hover:bg-muted/40 transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label="More options"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="h-7 w-7 rounded-lg hover:bg-destructive/10 transition-colors flex items-center justify-center text-muted-foreground hover:text-destructive"
              aria-label="Remove component"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Component Content */}
        <div className="h-[calc(100%-2.5rem)] overflow-auto">
          <FocusViewComponentRenderer
            component={component}
            onUpdate={onUpdate}
          />
        </div>
      </div>

      {/* Context Menu */}
      {showContextMenu && (
        <SimpleContextMenu
          position={contextMenuPosition}
          onClose={() => setShowContextMenu(false)}
          items={[
            {
              label: 'Move to...',
              disabled: true,
            },
            ...contextMenuItems.slice(0, 10), // Limit to 10 positions to avoid overflow
            ...(contextMenuItems.length > 10
              ? [{
                  label: `+${contextMenuItems.length - 10} more positions`,
                  disabled: true,
                }]
              : []
            ),
          ]}
        />
      )}
    </>
  );
};

/**
 * Format position name for display
 */
function formatPositionName(position: GridPosition): string {
  return position
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
