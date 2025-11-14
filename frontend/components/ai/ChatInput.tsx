'use client';

import React, { useState, KeyboardEvent } from 'react';
import { Send, Loader2, Paperclip } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  loading?: boolean;
}

/**
 * Input component for sending chat messages
 * Redesigned with bottom action bar separated by a line
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
    <div className="p-4 bg-background">
      {/* Main input container with border */}
      <div className="border border-input rounded-xl overflow-hidden bg-background">
        {/* Textarea area */}
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask your AI professor anything..."
          disabled={disabled || loading}
          className="
            w-full px-4 py-3 min-h-[80px] max-h-[200px]
            bg-transparent text-foreground text-sm
            resize-none border-0
            focus:outline-none
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        />
        
        {/* Separator line */}
        <div className="border-t border-border" />
        
        {/* Bottom action bar */}
        <div className="flex items-center justify-between px-3 py-2 bg-background">
          <div className="flex items-center space-x-2">
            {/* Upload button placeholder */}
            <button
              type="button"
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              aria-label="Attach file"
            >
              <Paperclip className="h-4 w-4 text-muted-foreground" />
            </button>
            
            <p className="text-xs text-muted-foreground">
              Press Enter to send
            </p>
          </div>
          
          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={disabled || loading || !message.trim()}
            className="
              p-2 rounded-lg
              bg-primary text-primary-foreground
              hover:bg-primary/90
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors
            "
            aria-label="Send message"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

