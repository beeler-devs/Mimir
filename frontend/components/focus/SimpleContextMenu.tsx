'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface MenuItem {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

interface SimpleContextMenuProps {
  position: { x: number; y: number };
  onClose: () => void;
  items: MenuItem[];
}

/**
 * Simple context menu for right-click actions
 */
export const SimpleContextMenu: React.FC<SimpleContextMenuProps> = ({
  position,
  onClose,
  items,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = React.useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Click outside detection
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Close on escape
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="fixed bg-background border border-border rounded-lg shadow-lg py-1 z-[9999] min-w-[180px]"
      style={{
        top: `${position.y}px`,
        left: `${position.x}px`,
      }}
    >
      {items.map((item, index) => (
        <button
          key={index}
          onClick={() => {
            if (!item.disabled && item.onClick) {
              item.onClick();
            }
          }}
          disabled={item.disabled}
          className={`
            w-full px-3 py-2 text-left text-sm transition-colors
            ${item.disabled
              ? 'text-muted-foreground cursor-not-allowed'
              : 'text-foreground hover:bg-muted/50 cursor-pointer'
            }
          `}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  );
};
