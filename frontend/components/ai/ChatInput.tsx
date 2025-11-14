'use client';

import React, { useState, KeyboardEvent } from 'react';
import { Button } from '@/components/common';
import { Send, Loader2 } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  loading?: boolean;
}

/**
 * Input component for sending chat messages
 */
export const ChatInput: React.FC<ChatInputProps> = ({ onSend, disabled = false, loading = false }) => {
  const [message, setMessage] = useState('');

  const handleSend = () => {
    if (message.trim() && !loading) {
      onSend(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="p-4 border-t border-border bg-background">
      <div className="flex space-x-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask your AI professor anything..."
          disabled={disabled || loading}
          className="
            flex-1 px-3 py-2 min-h-[80px] max-h-[200px]
            rounded-lg border border-input
            bg-background text-foreground text-sm
            resize-none
            focus:outline-none focus:ring-2 focus:ring-ring
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        />
        <Button
          onClick={handleSend}
          disabled={disabled || loading || !message.trim()}
          size="sm"
          className="self-end"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  );
};

