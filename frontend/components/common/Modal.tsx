'use client';

import React, { useEffect } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
}

/**
 * Generic modal overlay with basic escape/overlay handling
 */
export const Modal: React.FC<ModalProps> = ({ open, onClose, children, className = '', containerClassName }) => {
  useEffect(() => {
    if (!open) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className={`fixed inset-0 z-50 flex justify-center px-4 ${containerClassName ?? 'items-start pt-60'}`}>
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`
          relative z-10 w-auto max-w-4xl
          bg-card border border-border rounded-3xl
          shadow-2xl overflow-hidden
          ${className}
        `}
      >
        {children}
      </div>
    </div>
  );
};
