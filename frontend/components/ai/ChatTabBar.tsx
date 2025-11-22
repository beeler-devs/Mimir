'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Plus, Clock, X, Edit2, Check } from 'lucide-react';
import { Chat } from '@/lib/db/chats';
import { ChatHistoryDropdown } from './ChatHistoryDropdown';

interface ChatTab {
  id: string;
  title: string;
}

interface ChatTabBarProps {
  openTabs: ChatTab[];
  activeTabId: string | null;
  allChats: Chat[];
  onSelectTab: (chatId: string) => void;
  onCloseTab: (chatId: string) => void;
  onNewChat: () => void;
  onRenameTab: (chatId: string, newTitle: string) => void;
  isDropdown?: boolean;
}

/**
 * Horizontal tab bar for managing chat sessions
 * Shows open chat tabs with close buttons, new chat button, and history button
 */
export const ChatTabBar: React.FC<ChatTabBarProps> = ({
  openTabs,
  activeTabId,
  allChats,
  onSelectTab,
  onCloseTab,
  onNewChat,
  onRenameTab,
  isDropdown = false,
}) => {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const historyButtonRef = useRef<HTMLButtonElement>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingTabId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTabId]);

  const handleSelectChat = (chatId: string) => {
    onSelectTab(chatId);
  };

  const handleStartEdit = (tab: ChatTab) => {
    setEditingTabId(tab.id);
    setEditTitle(tab.title);
  };

  const handleSaveEdit = () => {
    if (editingTabId && editTitle.trim()) {
      onRenameTab(editingTabId, editTitle.trim());
    }
    setEditingTabId(null);
    setEditTitle('');
  };

  const handleCancelEdit = () => {
    setEditingTabId(null);
    setEditTitle('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  return (
    <div className={isDropdown ? "p-2" : "px-4 pb-2 border-b border-border"}>
      <div className={`flex items-center gap-1 ${isDropdown ? 'flex-col' : ''}`}>
        {/* Open Chat Tabs */}
        <div
          ref={tabsContainerRef}
          className={`flex items-center gap-1 ${isDropdown ? 'flex-col w-full' : 'flex-1 overflow-x-auto'}`}
          style={!isDropdown ? { scrollbarWidth: 'thin', scrollBehavior: 'smooth' } : {}}
        >
          {openTabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            const isEditing = editingTabId === tab.id;

            return (
              <div
                key={tab.id}
                className={`
                  group relative flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium
                  transition-all w-full
                  ${
                    isActive
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  }
                `}
              >
                {isEditing ? (
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onBlur={handleSaveEdit}
                      className="flex-1 min-w-0 px-1 py-0.5 text-sm bg-background border border-primary rounded focus:outline-none"
                    />
                    <button
                      onClick={handleSaveEdit}
                      className="p-0.5 hover:bg-muted rounded"
                      title="Save"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => onSelectTab(tab.id)}
                      className="flex-1 min-w-0 text-left truncate"
                      title={tab.title}
                    >
                      {tab.title}
                    </button>
                    <button
                      onClick={() => handleStartEdit(tab)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-muted rounded transition-opacity"
                      title="Rename"
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseTab(tab.id);
                      }}
                      className="p-0.5 hover:bg-muted rounded transition-colors"
                      title="Close tab"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className={`flex items-center gap-1 ${isDropdown ? 'pt-2 border-t border-border w-full' : 'flex-shrink-0 pl-2 border-l border-border'}`}>
          <button
            onClick={onNewChat}
            className="p-1.5 rounded-md hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
            title="New chat"
          >
            <Plus className="h-4 w-4" />
          </button>

          <div className="relative">
            <button
              ref={historyButtonRef}
              onClick={() => setHistoryOpen(!historyOpen)}
              className={`p-1.5 rounded-md transition-colors ${
                historyOpen
                  ? 'bg-muted text-foreground'
                  : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
              }`}
              title="Chat history"
            >
              <Clock className="h-4 w-4" />
            </button>

            <ChatHistoryDropdown
              isOpen={historyOpen}
              onClose={() => setHistoryOpen(false)}
              chats={allChats}
              onSelectChat={handleSelectChat}
              buttonRef={historyButtonRef}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

