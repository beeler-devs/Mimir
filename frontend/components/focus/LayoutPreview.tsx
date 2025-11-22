import React from 'react';
import { GridComponent, GRID_POSITION_CLASSES, COMPONENT_REGISTRY } from '@/lib/focusView';

interface LayoutPreviewProps {
  components: GridComponent[];
  className?: string;
}

export const LayoutPreview: React.FC<LayoutPreviewProps> = ({ components, className }) => {
  return (
    <div className={`aspect-square w-full bg-muted/30 rounded-lg border border-border p-1 ${className || ''}`}>
      <div className="grid grid-cols-12 grid-rows-12 gap-0.5 h-full w-full">
        {components.map((component) => {
          const positionClass = GRID_POSITION_CLASSES[component.position];
          const metadata = COMPONENT_REGISTRY[component.type];
          
          return (
            <div
              key={component.id}
              className={`${positionClass} bg-primary/20 border border-primary/30 rounded-sm flex items-center justify-center overflow-hidden`}
              title={metadata.title}
            >
              {/* Optional: Show icon if space permits, or just a block */}
              <div className="w-full h-full bg-primary/10" />
            </div>
          );
        })}
      </div>
    </div>
  );
};
