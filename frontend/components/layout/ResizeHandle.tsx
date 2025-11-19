'use client';

import React, { useCallback } from 'react';
import { useResize } from '@/contexts/ResizeContext';

interface ResizeHandleProps {
  position: 'left' | 'right';
  className?: string;
}

/**
 * Draggable resize handle for panel boundaries
 *
 * - position='left': Handle between left sidebar and main panel
 * - position='right': Handle between main panel and right sidebar
 */
export function ResizeHandle({ position, className = '' }: ResizeHandleProps) {
  const {
    startDrag,
    isDragging,
    leftCollapsed,
    rightCollapsed,
    toggleLeftCollapsed,
    toggleRightCollapsed,
  } = useResize();

  // Don't show handle if the panel is collapsed
  const isCollapsed = position === 'left' ? leftCollapsed : rightCollapsed;
  if (isCollapsed) {
    return null;
  }

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startDrag(position);
  }, [startDrag, position]);

  const handleDoubleClick = useCallback(() => {
    // Double-click to collapse the panel
    if (position === 'left') {
      toggleLeftCollapsed();
    } else {
      toggleRightCollapsed();
    }
  }, [position, toggleLeftCollapsed, toggleRightCollapsed]);

  return (
    <div
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      className={`
        absolute top-0 bottom-0
        w-1 cursor-col-resize
        group
        ${position === 'left' ? 'right-0' : 'left-0'}
        ${isDragging ? 'bg-primary' : 'hover:bg-primary/50'}
        transition-colors duration-150
        z-10
        ${className}
      `}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${position} panel`}
    >
      {/* Wider hit area for easier grabbing */}
      <div
        className={`
          absolute top-0 bottom-0
          w-3 -translate-x-1/2
          cursor-col-resize
        `}
      />

      {/* Visual indicator on hover */}
      <div
        className={`
          absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2
          w-1 h-8 rounded-full
          ${isDragging ? 'bg-primary' : 'bg-transparent group-hover:bg-primary/30'}
          transition-colors duration-150
        `}
      />
    </div>
  );
}

/**
 * Transparent overlay to capture mouse events during drag
 * Prevents iframes and heavy components from eating events
 */
export function DragOverlay() {
  const { isDragging } = useResize();

  if (!isDragging) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[9999] cursor-col-resize"
      style={{ background: 'transparent' }}
    />
  );
}
