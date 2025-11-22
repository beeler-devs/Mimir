'use client';

import React from 'react';
import {
  ComponentType,
  COMPONENT_REGISTRY,
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
  ChevronDown,
} from 'lucide-react';

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

interface ComponentPaletteProps {
  onSelectComponent: (type: ComponentType) => void;
}

/**
 * Component palette dropdown for selecting component types
 */
export const ComponentPalette: React.FC<ComponentPaletteProps> = ({ onSelectComponent }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const availableComponents = Object.values(COMPONENT_REGISTRY);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        buttonRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleSelect = (type: ComponentType) => {
    onSelectComponent(type);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted transition-colors text-sm"
      >
        <span>Add Component</span>
        <ChevronDown className="h-4 w-4" />
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 mt-2 w-64 bg-card border border-border rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto"
        >
          <div className="p-2">
            {availableComponents.map((component) => {
              const Icon = COMPONENT_ICONS[component.type];
              return (
                <button
                  key={component.type}
                  onClick={() => handleSelect(component.type)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left"
                >
                  <Icon className="h-5 w-5 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{component.title}</p>
                    {component.description && (
                      <p className="text-xs text-muted-foreground truncate">
                        {component.description}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

