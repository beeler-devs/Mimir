'use client';

import React, { useState, KeyboardEvent, useRef, useEffect } from 'react';
import { Send, Loader2, Paperclip, FileText, Code2, PenTool, Folder as FolderIcon, ChevronDown } from 'lucide-react';
import { WorkspaceInstance, Folder, MentionableItem, LearningMode } from '@/lib/types';
import { findMentionableItems } from '@/lib/mentions';
import { useActiveLearningMode, getAllLearningModes, getLearningModeConfig } from '@/lib/learningMode';

interface ChatInputProps {
  onSend: (message: string, learningMode?: LearningMode) => void;
  disabled?: boolean;
  loading?: boolean;
  instances?: WorkspaceInstance[];
  folders?: Folder[];
  initialMessage?: string;
  onMessageSet?: () => void;
}

export interface ChatInputRef {
  setMessage: (message: string) => void;
  focus: () => void;
}

/**
 * Input component for sending chat messages
 * Redesigned with bottom action bar separated by a line
 * Supports @ mentions for instances and folders
 */
export const ChatInput = React.forwardRef<ChatInputRef, ChatInputProps>(({
  onSend,
  disabled = false,
  loading = false,
  instances = [],
  folders = [],
  initialMessage,
  onMessageSet,
}, ref) => {
  const [message, setMessage] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [autocompleteItems, setAutocompleteItems] = useState<MentionableItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);
  
  // Learning mode state
  const [activeMode, overrideMode, setOverrideMode] = useActiveLearningMode();
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const modeDropdownRef = useRef<HTMLDivElement>(null);
  const modeButtonRef = useRef<HTMLButtonElement>(null);
  const allModes = getAllLearningModes();

  // Expose methods via ref
  React.useImperativeHandle(ref, () => ({
    setMessage: (msg: string) => {
      setMessage(msg);
      if (onMessageSet) onMessageSet();
      // Focus the textarea after setting message
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    },
    focus: () => {
      textareaRef.current?.focus();
    },
  }));

  // Handle initial message
  useEffect(() => {
    if (initialMessage) {
      setMessage(initialMessage);
      if (onMessageSet) onMessageSet();
    }
  }, [initialMessage, onMessageSet]);

  const adjustTextareaHeight = () => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(200, textarea.scrollHeight)}px`;
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [message]);

  // Update autocomplete when query changes
  useEffect(() => {
    if (autocompleteQuery && showAutocomplete) {
      const items = findMentionableItems(instances, folders, autocompleteQuery);
      setAutocompleteItems(items);
      setSelectedIndex(0);
    } else {
      setAutocompleteItems([]);
    }
  }, [autocompleteQuery, showAutocomplete, instances, folders]);

  const handleSend = () => {
    if (message.trim() && !loading) {
      onSend(message.trim(), activeMode);
      setMessage('');
      setShowAutocomplete(false);
      setMentionStart(null);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    setMessage(value);

    // Check for @ mention
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      // Check if there's a space after @ (meaning mention ended)
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
        // We're in a mention
        setMentionStart(lastAtIndex);
        const query = textAfterAt.toLowerCase();
        setAutocompleteQuery(query);
        setShowAutocomplete(true);
        return;
      }
    }
    
    // Not in a mention
    setShowAutocomplete(false);
    setMentionStart(null);
  };

  const insertMention = (item: MentionableItem) => {
    if (mentionStart === null || !textareaRef.current) return;

    const beforeMention = message.substring(0, mentionStart);
    const afterCursor = message.substring(textareaRef.current.selectionStart);
    const newMessage = `${beforeMention}@${item.name} ${afterCursor}`;
    
    setMessage(newMessage);
    setShowAutocomplete(false);
    setMentionStart(null);
    
    // Set cursor after the mention
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = mentionStart + item.name.length + 2; // +2 for @ and space
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        textareaRef.current.focus();
      }
    }, 0);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showAutocomplete && autocompleteItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => 
          prev < autocompleteItems.length - 1 ? prev + 1 : prev
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(autocompleteItems[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowAutocomplete(false);
        setMentionStart(null);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !showAutocomplete) {
      e.preventDefault();
      handleSend();
    }
  };

  const getIcon = (iconName?: string) => {
    switch (iconName) {
      case 'FileText':
        return <FileText className="h-4 w-4" />;
      case 'Code2':
        return <Code2 className="h-4 w-4" />;
      case 'PenTool':
        return <PenTool className="h-4 w-4" />;
      case 'Folder':
        return <FolderIcon className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  // Click outside handler for mode dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const isClickInsideDropdown = modeDropdownRef.current?.contains(event.target as Node);
      const isClickOnButton = modeButtonRef.current?.contains(event.target as Node);
      
      if (!isClickInsideDropdown && !isClickOnButton) {
        setShowModeDropdown(false);
      }
    };

    if (showModeDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showModeDropdown]);

  return (
    <div className="p-4 bg-background relative">
      {/* Autocomplete dropdown */}
      {showAutocomplete && autocompleteItems.length > 0 && (
        <div
          ref={autocompleteRef}
          className="absolute bottom-full left-4 right-4 mb-2 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto z-50"
        >
          {autocompleteItems.map((item, index) => (
            <button
              key={`${item.type}-${item.id}`}
              type="button"
              onClick={() => insertMention(item)}
              className={`
                w-full px-3 py-2 text-left flex items-center gap-2 text-sm
                hover:bg-muted transition-colors
                ${index === selectedIndex ? 'bg-muted' : ''}
              `}
            >
              <span className="text-muted-foreground">
                {getIcon(item.icon)}
              </span>
              <span className="font-medium">{item.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {item.type}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Learning mode dropdown - positioned outside overflow container */}
      {showModeDropdown && (
        <div 
          ref={modeDropdownRef}
          className="absolute bottom-full left-4 mb-2 w-64 bg-background border border-border rounded-xl shadow-lg py-1 z-50"
        >
          {allModes.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => {
                setOverrideMode(mode.id);
                setShowModeDropdown(false);
              }}
              className={`
                w-full px-3 py-2 text-left hover:bg-muted transition-colors
                ${activeMode === mode.id ? 'bg-primary/10' : ''}
              `}
            >
              <div className="font-medium text-sm">{mode.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {mode.description}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Main input container with border */}
      <div className="border border-input rounded-lg overflow-hidden bg-background">
        {/* Textarea area */}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Learning starts now"
          disabled={disabled || loading}
          rows={1}
          className="
            w-full px-4 pt-2 pb-0.5 max-h-[200px]
            bg-transparent text-foreground text-sm
            resize-none border-0
            focus:outline-none
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        />
        
        {/* Bottom action bar */}
        <div className="flex items-center justify-between px-3 py-1 bg-background">
          <div className="flex items-center space-x-2">
            {/* Upload button placeholder */}
            <button
              type="button"
              className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              aria-label="Attach file"
            >
              <Paperclip className="h-4 w-4 text-muted-foreground" />
            </button>

            {/* Learning mode selector */}
            <button
              ref={modeButtonRef}
              type="button"
              onClick={() => setShowModeDropdown(!showModeDropdown)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm"
              aria-label="Select learning mode"
            >
              <span>{getLearningModeConfig(activeMode).name}</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
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
});

ChatInput.displayName = 'ChatInput';
