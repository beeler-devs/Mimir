'use client';

import React from 'react';
import { ChatNode, WorkspaceContext } from '@/lib/types';
import { AnimationPanel } from './AnimationPanel';
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer';

interface ChatMessageListProps {
  messages: ChatNode[];
  workspaceContext?: WorkspaceContext;
}

/**
 * Displays a list of chat messages in the active branch
 */
export const ChatMessageList: React.FC<ChatMessageListProps> = ({ messages, workspaceContext }) => {
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
    <div className="flex flex-col space-y-4 p-4 overflow-y-auto bg-transparent">
      {messages.map((message) => (
        <div key={message.id}>
          <div
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
          <div
            className={`max-w-[85%] ${
              message.role === 'user'
                ? 'rounded-lg px-4 py-2 text-white whitespace-pre-wrap break-words text-sm leading-relaxed'
                : 'text-foreground py-1.5'
            }`}
            style={message.role === 'user' ? { backgroundColor: '#C5ADFC' } : undefined}
          >
            {message.role === 'user' ? (
              // User messages: plain text with whitespace preservation
              <div className="text-sm whitespace-pre-wrap break-words">
                {message.content}
              </div>
            ) : (
              // AI assistant messages: markdown rendered
              <MarkdownRenderer content={message.content} />
            )}
          </div>
          </div>

          {/* Show animation panel if message has a suggestion */}
          {message.role === 'assistant' && message.suggestedAnimation && (
            <div className="mt-2 max-w-[85%]">
              <AnimationPanel suggestion={message.suggestedAnimation} workspaceContext={workspaceContext} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
