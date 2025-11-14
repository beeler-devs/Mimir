'use client';

import React from 'react';
import { ChatNode } from '@/lib/types';
import { Card } from '@/components/common';

interface ChatMessageListProps {
  messages: ChatNode[];
}

/**
 * Displays a list of chat messages in the active branch
 */
export const ChatMessageList: React.FC<ChatMessageListProps> = ({ messages }) => {
  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center text-muted-foreground">
          <p className="text-lg mb-2">No messages yet</p>
          <p className="text-sm">Start a conversation with your AI professor</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-4 p-4 overflow-y-auto">
      {messages.map((message) => (
        <div
          key={message.id}
          className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <Card
            padding="sm"
            className={`max-w-[85%] ${
              message.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card'
            }`}
          >
            <div className="text-sm whitespace-pre-wrap break-words">
              {message.content}
            </div>
            <div
              className={`text-xs mt-2 ${
                message.role === 'user'
                  ? 'text-primary-foreground/70'
                  : 'text-muted-foreground'
              }`}
            >
              {new Date(message.createdAt).toLocaleTimeString()}
            </div>
          </Card>
        </div>
      ))}
    </div>
  );
};

