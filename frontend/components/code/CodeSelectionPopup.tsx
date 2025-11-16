'use client';

import React from 'react';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/common';

interface CodeSelectionPopupProps {
  position: { top: number; left: number } | null;
  onAddToChat: () => void;
}

/**
 * Popup that appears when code is selected
 * Allows user to add selection to chat
 */
export const CodeSelectionPopup: React.FC<CodeSelectionPopupProps> = ({
  position,
  onAddToChat,
}) => {
  if (!position) return null;

  return (
    <div
      className="fixed z-50 px-3 py-2 border rounded-lg shadow-lg animate-in fade-in zoom-in-95"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        backgroundColor: '#F5F5F5',
        borderRadius: '0.85rem',
        borderColor: 'var(--border)',
      }}
    >
      <button
        onClick={onAddToChat}
        className="flex items-center gap-2 text-sm font-medium text-foreground hover:opacity-80 transition-opacity"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Ask Mimir
      </button>
    </div>
  );
};
