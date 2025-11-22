'use client';

import React, { useState } from 'react';
import { Modal, Button } from '@/components/common';
import {
  ComponentType,
  GridPosition,
  GridComponent,
  COMPONENT_REGISTRY,
  getSuggestedPositions,
  GRID_POSITION_CLASSES,
} from '@/lib/focusView';
import {
  MessageSquare,
  Code,
  FileText,
  FileImage,
  Mic,
  PenTool,
  Video,
  Layers,
  Calendar,
  Timer,
  Terminal,
  Paintbrush,
  CheckCircle2,
} from 'lucide-react';

interface ComponentPlacementModalProps {
  open: boolean;
  onClose: () => void;
  onAddComponent: (type: ComponentType, position: GridPosition, config?: any) => void;
  existingComponents: GridComponent[];
}

const COMPONENT_ICONS: Record<ComponentType, React.ComponentType<{ className?: string }>> = {
  'chat': MessageSquare,
  'code-editor': Code,
  'text-editor': FileText,
  'pdf-viewer': FileImage,
  'voice-input': Mic,
  'annotate-canvas': PenTool,
  'lecture-viewer': Video,
  'flashcard': Layers,
  'calendar': Calendar,
  'pomodoro': Timer,
  'terminal': Terminal,
  'whiteboard': Paintbrush,
};

/**
 * Modal for selecting and placing components in the grid
 */
export const ComponentPlacementModal: React.FC<ComponentPlacementModalProps> = ({
  open,
  onClose,
  onAddComponent,
  existingComponents,
}) => {
  const [selectedType, setSelectedType] = useState<ComponentType | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<GridPosition | null>(null);
  const [enableHighlightForAsk, setEnableHighlightForAsk] = useState(false);

  const availableComponents = Object.values(COMPONENT_REGISTRY);
  const suggestedPositions = selectedType
    ? getSuggestedPositions(selectedType, existingComponents)
    : [];

  const handleAdd = () => {
    if (!selectedType || !selectedPosition) return;

    const config: any = {};
    const metadata = COMPONENT_REGISTRY[selectedType];

    // Add highlight for ask config if supported and enabled
    if (metadata.supportsHighlightForAsk && enableHighlightForAsk) {
      config.enableHighlightForAsk = true;
    }

    onAddComponent(selectedType, selectedPosition, config);
    onClose();
  };

  const selectedMetadata = selectedType ? COMPONENT_REGISTRY[selectedType] : null;

  return (
    <Modal open={open} onClose={onClose}>
      <div className="w-full max-h-[80vh] overflow-y-auto scrollbar-hide-show">
        <div className="p-6">
          <h2 className="text-2xl font-semibold mb-6">Add Component</h2>

          {/* Step 1: Select Component Type */}
          <div className="mb-8">
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
              1. Choose Component Type
            </h3>
            <div className="grid grid-cols-3 gap-3">
              {availableComponents.map((component) => {
                const Icon = COMPONENT_ICONS[component.type];
                const isSelected = selectedType === component.type;

                return (
                  <button
                    key={component.type}
                    onClick={() => {
                      setSelectedType(component.type);
                      setSelectedPosition(null); // Reset position when changing type
                    }}
                    className={`
                      relative p-4 rounded-xl border-2 transition-all text-left
                      ${isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                      }
                    `}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2">
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <Icon className="h-6 w-6 mb-2 text-primary" />
                    <div>
                      <p className="font-semibold text-sm">{component.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {component.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Select Position */}
          {selectedType && (
            <div className="mb-8">
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
                2. Choose Position
              </h3>
              {suggestedPositions.length === 0 ? (
                <div className="p-4 rounded-xl border border-border bg-muted/20 text-center">
                  <p className="text-sm text-muted-foreground">
                    No available positions for this component type. Try removing some components first.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {suggestedPositions.slice(0, 12).map((position) => {
                    const isSelected = selectedPosition === position;

                    return (
                      <button
                        key={position}
                        onClick={() => setSelectedPosition(position)}
                        className={`
                          p-3 rounded-lg border-2 transition-all text-left
                          ${isSelected
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                          }
                        `}
                      >
                        <p className="text-xs font-medium">
                          {formatPositionName(position)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Additional Options */}
          {selectedType && selectedMetadata?.supportsHighlightForAsk && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
                3. Options
              </h3>
              <label className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/20 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableHighlightForAsk}
                  onChange={(e) => setEnableHighlightForAsk(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary"
                />
                <div>
                  <p className="text-sm font-medium">Enable "Ask Mimir" on Highlight</p>
                  <p className="text-xs text-muted-foreground">
                    Selected text can be sent to chat automatically
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-4 border-t border-border">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={!selectedType || !selectedPosition}
            >
              Add Component
            </Button>
          </div>
        </div>
      </div>
    </Modal>
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
