'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChatNode, WorkspaceContext } from '@/lib/types';
import { AnimationPanel } from './AnimationPanel';
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer';
import { File, MessageSquarePlus } from 'lucide-react';

interface ChatMessageListProps {
  messages: ChatNode[];
  workspaceContext?: WorkspaceContext;
  onAddToChat?: (text: string) => void;
}

/**
 * Displays a list of chat messages in the active branch
 * Automatically scrolls to the bottom as new messages stream in
 */
export const ChatMessageList: React.FC<ChatMessageListProps> = ({ messages, workspaceContext, onAddToChat }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedText, setSelectedText] = useState<string>('');
  const [showPopup, setShowPopup] = useState(false);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  
  // Auto-scroll to bottom when messages change
  useEffect(() => {
    // Use a small timeout to ensure DOM has updated
    const scrollToBottom = () => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };
    
    // Scroll immediately
    scrollToBottom();
    
    // Also scroll after a brief delay to catch any layout changes
    const timeoutId = setTimeout(scrollToBottom, 100);
    
    return () => clearTimeout(timeoutId);
  }, [messages]);

  // Text selection handler (only for assistant messages)
  const handleTextSelection = (event: MouseEvent) => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();

    if (text && text.length > 0) {
      // Check if the selection is within an assistant message
      const target = event.target as HTMLElement;
      const assistantMessage = target.closest('[data-role="assistant"]');
      
      if (assistantMessage) {
        setSelectedText(text);
        const range = selection?.getRangeAt(0);
        const rect = range?.getBoundingClientRect();

        if (rect) {
          setPopupPosition({
            x: rect.left + rect.width / 2,
            y: rect.top - 10,
          });
          setShowPopup(true);
        }
      } else {
        setShowPopup(false);
      }
    } else {
      setShowPopup(false);
    }
  };

  const handleAddToChatClick = () => {
    if (selectedText && onAddToChat) {
      onAddToChat(selectedText);
      setShowPopup(false);
      setSelectedText('');
      window.getSelection()?.removeAllRanges();
    }
  };

  useEffect(() => {
    document.addEventListener('mouseup', handleTextSelection);
    return () => {
      document.removeEventListener('mouseup', handleTextSelection);
    };
  }, []);
  
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
    <div ref={containerRef} className="flex flex-col space-y-4 p-4 overflow-y-auto bg-transparent">
      {messages.map((message) => (
        <div key={message.id}>
          <div
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[85%] ${message.role === 'user' ? 'flex flex-col items-end' : ''}`}>
              {/* PDF attachments for user messages */}
              {message.role === 'user' && message.pdfAttachments && message.pdfAttachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2 justify-end">
                  {message.pdfAttachments.map((pdf) => (
                    <div
                      key={pdf.id}
                      className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg"
                    >
                      <div className="p-1.5 rounded bg-red-500/20">
                        <File className="h-4 w-4 text-red-500" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">{pdf.filename}</span>
                        <span className="text-xs text-muted-foreground">PDF</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Message content */}
              <div
                data-role={message.role}
                className={`${
                  message.role === 'user'
                    ? 'rounded-lg px-4 py-2 text-black whitespace-pre-wrap break-words text-sm leading-relaxed'
                    : 'text-foreground py-1.5'
                }`}
                style={message.role === 'user' ? { backgroundColor: '#E7DEFE' } : undefined}
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
          </div>

          {/* Show animation panel if message has a suggestion */}
          {message.role === 'assistant' && message.suggestedAnimation && (
            <div className="mt-2 max-w-[85%]">
              <AnimationPanel suggestion={message.suggestedAnimation} workspaceContext={workspaceContext} />
            </div>
          )}
        </div>
      ))}
      
      {/* Invisible element at the end for scrolling */}
      <div ref={messagesEndRef} />

      {/* Text Selection Popup */}
      {showPopup && (
        <div
          className="fixed z-50 px-3 py-2 border rounded-lg shadow-lg animate-in fade-in zoom-in-95"
          style={{
            left: `${popupPosition.x}px`,
            top: `${popupPosition.y}px`,
            transform: 'translate(-50%, -100%)',
            backgroundColor: '#F5F5F5',
            borderRadius: '0.85rem',
            borderColor: 'var(--border)',
          }}
        >
          <button
            onClick={handleAddToChatClick}
            className="flex items-center gap-2 text-sm font-medium text-foreground hover:opacity-80 transition-opacity"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Ask Mimir
          </button>
        </div>
      )}
    </div>
  );
};
