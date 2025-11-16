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
      className="fixed z-50 bg-background border border-border rounded-lg shadow-lg p-2 flex gap-2"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      <Button
        size="sm"
        variant="secondary"
        onClick={onAddToChat}
        className="flex items-center gap-2"
      >
        <MessageSquare className="h-4 w-4" />
        Add to chat
      </Button>
    </div>
  );
};
