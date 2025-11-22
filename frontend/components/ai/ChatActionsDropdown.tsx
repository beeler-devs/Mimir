"use client";

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { ChatTabBar } from './ChatTabBar';
import { Chat } from '@/lib/db/chats';

interface ChatActionsDropdownProps {
  openTabs: { id: string; title: string }[];
  activeTabId: string | null;
  allChats: Chat[];
  onSelectTab: (chatId: string) => void;
  onCloseTab: (chatId: string) => void;
  onNewChat: () => void;
  onRenameTab: (chatId: string, newTitle: string) => void;
}

export const ChatActionsDropdown: React.FC<ChatActionsDropdownProps> = ({
  openTabs,
  activeTabId,
  allChats,
  onSelectTab,
  onCloseTab,
  onNewChat,
  onRenameTab,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const toggleDropdown = () => setIsOpen(!isOpen);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={toggleDropdown}
        className="h-8 w-8 rounded-lg hover:bg-muted/40 transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
        aria-label="Chat Actions"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-background border border-border rounded-lg shadow-lg z-10">
          <ChatTabBar
            openTabs={openTabs}
            activeTabId={activeTabId}
            allChats={allChats}
            onSelectTab={onSelectTab}
            onCloseTab={onCloseTab}
            onNewChat={onNewChat}
            onRenameTab={onRenameTab}
            isDropdown={true}
          />
        </div>
      )}
    </div>
  );
};
