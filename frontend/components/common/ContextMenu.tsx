'use client';

import React, { RefObject, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ContextMenuProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  children: React.ReactNode;
  align?: 'left' | 'right';
  position?: { top: number; left: number };
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  isOpen,
  onClose,
  triggerRef,
  children,
  align = 'right',
  position: positionProp,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  // Ensure we only render on client side
  useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate position when menu opens or trigger moves
  useEffect(() => {
    if (!isOpen || !triggerRef.current || positionProp) return;

    const calculatePosition = () => {
      if (!triggerRef.current) return;

      const rect = triggerRef.current.getBoundingClientRect();
      const menuWidth = 176; // w-44 = 11rem = 176px

      setPosition({
        top: rect.bottom + 4, // mt-1 = 4px
        left: align === 'right' ? rect.right - menuWidth : rect.left,
      });
    };

    calculatePosition();

    // Recalculate on scroll or resize
    window.addEventListener('scroll', calculatePosition, true);
    window.addEventListener('resize', calculatePosition);

    return () => {
      window.removeEventListener('scroll', calculatePosition, true);
      window.removeEventListener('resize', calculatePosition);
    };
  }, [isOpen, triggerRef, align, positionProp]);

  // Click outside detection
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      // Check if click is outside menu and not on trigger button
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        onClose();
      }
    };

    // Use capture phase to handle before other handlers
    document.addEventListener('mousedown', handleClickOutside, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [isOpen, onClose, triggerRef]);

  // Don't render on server or when closed
  if (!mounted || !isOpen) return null;

  return createPortal(
    <div
      ref={menuRef}
      data-menu-interactive
      className="fixed w-44 bg-background border border-border rounded-lg shadow-lg py-1 z-[9999]"
      style={{
        top: `${(positionProp || position).top}px`,
        left: `${(positionProp || position).left}px`,
      }}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
};
