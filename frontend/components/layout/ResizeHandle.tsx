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

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
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

  // Handle keyboard accessibility
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (position === 'left') {
        toggleLeftCollapsed();
      } else {
        toggleRightCollapsed();
      }
    }
  }, [position, toggleLeftCollapsed, toggleRightCollapsed]);

  return (
    <div
      onPointerDown={handlePointerDown}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      className={`
        absolute top-0 bottom-0
        w-1 cursor-col-resize
        group select-none touch-none
        ${position === 'left' ? 'right-0' : 'left-0'}
        z-10
        focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1
        ${className}
      `}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${position} panel. Double-click or press Enter to collapse.`}
      aria-valuenow={undefined}
    >
      {/* Wider hit area for easier grabbing - covers the actual clickable region */}
      <div
        className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-4 cursor-col-resize"
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
