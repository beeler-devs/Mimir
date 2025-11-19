'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, MessageSquare, X } from 'lucide-react';
import { Chat } from '@/lib/db/chats';

interface ChatHistoryDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  chats: Chat[];
  onSelectChat: (chatId: string) => void;
  buttonRef?: React.RefObject<HTMLElement | null>;
}

/**
 * Dropdown panel showing searchable chat history grouped by date
 */
export const ChatHistoryDropdown: React.FC<ChatHistoryDropdownProps> = ({
  isOpen,
  onClose,
  chats,
  onSelectChat,
  buttonRef,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef?.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, buttonRef]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Filter chats by search query (searches titles only)
  const filteredChats = chats.filter((chat) => {
    const title = chat.title || 'New Chat';
    return title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Group chats by date
  const groupChatsByDate = (chats: Chat[]) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    const groups: { [key: string]: Chat[] } = {
      Today: [],
      Yesterday: [],
      'Last 7 Days': [],
      Older: [],
    };

    chats.forEach((chat) => {
      const chatDate = new Date(chat.created_at);
      const chatDay = new Date(chatDate.getFullYear(), chatDate.getMonth(), chatDate.getDate());

      if (chatDay.getTime() === today.getTime()) {
        groups.Today.push(chat);
      } else if (chatDay.getTime() === yesterday.getTime()) {
        groups.Yesterday.push(chat);
      } else if (chatDay >= lastWeek) {
        groups['Last 7 Days'].push(chat);
      } else {
        groups.Older.push(chat);
      }
    });

    return groups;
  };

  const groupedChats = groupChatsByDate(filteredChats);

  const handleSelectChat = (chatId: string) => {
    onSelectChat(chatId);
    onClose();
  };

  return (
    <div
      ref={dropdownRef}
      className="absolute top-full right-0 mt-1 w-80 bg-background border border-border rounded-lg shadow-lg z-50 overflow-hidden"
      style={{ maxHeight: '400px' }}
    >
      {/* Search Header */}
      <div className="p-3 border-b border-border bg-background sticky top-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats..."
            className="w-full pl-10 pr-8 py-2 text-sm bg-muted/50 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Chat List */}
      <div className="overflow-y-auto" style={{ maxHeight: '340px' }}>
        {filteredChats.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {searchQuery ? 'No chats found' : 'No chats yet'}
          </div>
        ) : (
          Object.entries(groupedChats).map(([groupName, groupChats]) => {
            if (groupChats.length === 0) return null;

            return (
              <div key={groupName} className="py-2">
                <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {groupName}
                </div>
                <div className="space-y-1 px-2">
                  {groupChats.map((chat) => {
                    const displayTitle = chat.title || 'New Chat';
                    const formattedDate = new Date(chat.created_at).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    });

                    return (
                      <button
                        key={chat.id}
                        onClick={() => handleSelectChat(chat.id)}
                        className="w-full px-3 py-2 flex items-start gap-3 text-left rounded-lg text-sm transition-colors hover:bg-muted group"
                      >
                        <span className="h-6 w-6 rounded-md bg-muted flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-muted-foreground/10">
                          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{displayTitle}</p>
                          <p className="text-xs text-muted-foreground">{formattedDate}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

