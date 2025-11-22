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
import { Button } from '@/components/common';

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
  variant?: 'ghost' | 'outline' | 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  onDropdownStateChange?: (isOpen: boolean) => void;
  dropdownClassName?: string;
}

/**
 * Component palette dropdown for selecting component types
 */
export const ComponentPalette: React.FC<ComponentPaletteProps> = ({ 
  onSelectComponent,
  variant = 'ghost',
  size = 'sm',
  onDropdownStateChange,
  dropdownClassName,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [dropdownPosition, setDropdownPosition] = React.useState<'bottom' | 'top'>('bottom');
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const availableComponents = Object.values(COMPONENT_REGISTRY);

  // Notify parent of dropdown state changes
  React.useEffect(() => {
    onDropdownStateChange?.(isOpen);
  }, [isOpen, onDropdownStateChange]);

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
      // Calculate if dropdown should appear above or below
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const estimatedDropdownHeight = 400; // Approximate height
        
        if (spaceBelow < estimatedDropdownHeight && spaceAbove > spaceBelow) {
          setDropdownPosition('top');
        } else {
          setDropdownPosition('bottom');
        }
      }
      
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
      <Button
        ref={buttonRef}
        variant={variant}
        size={size}
        onClick={() => setIsOpen(!isOpen)}
        className="gap-2"
      >
        <span>Add Component</span>
        <ChevronDown className="h-4 w-4" />
      </Button>

      {isOpen && (
        <div
          ref={dropdownRef}
          data-dropdown
          onMouseEnter={() => setIsOpen(true)}
          onMouseLeave={() => setIsOpen(false)}
          className={`absolute left-0 w-64 bg-card border border-border rounded-lg shadow-lg z-50 overflow-y-auto scrollbar-hide-show ${
            dropdownPosition === 'top' 
              ? 'bottom-full mb-2' 
              : 'top-full mt-2'
          } ${dropdownClassName || ''}`}
          style={{ maxHeight: dropdownClassName?.includes('max-h-') ? undefined : 'calc(100vh - 200px)' }}
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

