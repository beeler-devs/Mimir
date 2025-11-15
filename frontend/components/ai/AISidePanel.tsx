'use client';

import React, { useState, useEffect } from 'react';
import { ChatNode, AnimationSuggestion } from '@/lib/types';
import { addMessage, getActiveBranch, buildBranchPath } from '@/lib/chatState';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';
import { ChatTreeView } from './ChatTreeView';
import { VoiceButton } from './VoiceButton';
import { MessageSquare, GitBranch, PanelsLeftRight } from 'lucide-react';
import {
  loadUserChats,
  createChat,
  loadChatMessages,
  saveChatMessage,
  updateChatTitle,
  generateChatTitle,
  Chat,
} from '@/lib/db/chats';

type ViewMode = 'chat' | 'tree';

interface AISidePanelProps {
  collapseSidebar?: () => void;
}

/**
 * Main AI sidepanel component
 * Manages chat state and switches between chat and tree views
 */
export const AISidePanel: React.FC<AISidePanelProps> = ({ collapseSidebar }) => {
  const [nodes, setNodes] = useState<ChatNode[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [loading, setLoading] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [initializing, setInitializing] = useState(true);

  const activeBranch = activeNodeId ? getActiveBranch(nodes, activeNodeId) : [];

  // Load or create chat on mount
  useEffect(() => {
    const initializeChat = async () => {
      try {
        // Try to load stored chat ID from localStorage
        const storedChatId = localStorage.getItem('mimir.activeChatId');
        
        if (storedChatId) {
          // Load messages for the stored chat
          const messages = await loadChatMessages(storedChatId);
          setNodes(messages);
          setChatId(storedChatId);
          
          // Set active node to the last message
          if (messages.length > 0) {
            setActiveNodeId(messages[messages.length - 1].id);
          }
        } else {
          // Create a new chat
          const newChat = await createChat();
          setChatId(newChat.id);
          localStorage.setItem('mimir.activeChatId', newChat.id);
        }

        // Load all chats for the user
        const userChats = await loadUserChats();
        setChats(userChats);
      } catch (error) {
        console.error('Error initializing chat:', error);
      } finally {
        setInitializing(false);
      }
    };

    initializeChat();
  }, []);

  // Save chatId to localStorage when it changes
  useEffect(() => {
    if (chatId) {
      localStorage.setItem('mimir.activeChatId', chatId);
    }
  }, [chatId]);

  const handleSendMessage = async (content: string) => {
    if (!chatId) {
      console.error('No active chat');
      return;
    }

    setLoading(true);
    let savedUserMessage: ChatNode | null = null;

    try {
      // Save user message to database
      savedUserMessage = await saveChatMessage(chatId, {
        parentId: activeNodeId,
        role: 'user',
        content,
      });

      // Update local state
      const updatedNodes = [...nodes, savedUserMessage];
      setNodes(updatedNodes);
      setActiveNodeId(savedUserMessage.id);

      // If this is the first user message, generate a title
      if (nodes.length === 0) {
        const title = generateChatTitle(content);
        await updateChatTitle(chatId, title);
      }

      // Call backend API to get streaming AI response
      if (!savedUserMessage) {
        throw new Error('Failed to save user message');
      }
      
      const branchPath = buildBranchPath(updatedNodes, savedUserMessage.id);
      const backendUrl = process.env.NEXT_PUBLIC_MANIM_WORKER_URL || process.env.MANIM_WORKER_URL || 'http://localhost:8001';
      
      // Create a temporary streaming message node
      const streamingMessageId = `streaming-${Date.now()}`;
      const streamingMessage: ChatNode = {
        id: streamingMessageId,
        parentId: savedUserMessage.id,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
      };
      
      // Add streaming message to state
      const nodesWithStreaming = [...updatedNodes, streamingMessage];
      setNodes(nodesWithStreaming);
      setActiveNodeId(streamingMessageId);
      
      // Stream the response
      const response = await fetch(`${backendUrl}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: getActiveBranch(updatedNodes, savedUserMessage.id).map(n => ({
            role: n.role,
            content: n.content,
          })),
          branchPath,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let suggestedAnimation: AnimationSuggestion | undefined = undefined;

      if (!reader) {
        throw new Error('Response body is not readable');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'chunk') {
                // Update streaming message with new chunk
                fullContent += data.content;
                setNodes(prev => prev.map(node => 
                  node.id === streamingMessageId
                    ? { ...node, content: fullContent }
                    : node
                ));
              } else if (data.type === 'done') {
                // Streaming complete, save final message
                fullContent = data.content;
                suggestedAnimation = data.suggestedAnimation;
                
                // Save AI response to database
                const savedAIMessage = await saveChatMessage(chatId, {
                  parentId: savedUserMessage.id,
                  role: 'assistant',
                  content: fullContent,
                  suggestedAnimation,
                });

                // Replace streaming message with saved message
                setNodes(prev => prev.map(node => 
                  node.id === streamingMessageId
                    ? savedAIMessage
                    : node
                ));
                setActiveNodeId(savedAIMessage.id);
              } else if (data.type === 'error') {
                throw new Error(data.content);
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Remove streaming message if it exists
      setNodes(prev => prev.filter(node => !node.id.startsWith('streaming-')));
      
      // Try to save error message to database
      try {
        const errorMessage = await saveChatMessage(chatId, {
          parentId: savedUserMessage?.id || activeNodeId,
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
        });
        setNodes(prev => [...prev, errorMessage]);
        setActiveNodeId(errorMessage.id);
      } catch (dbError) {
        console.error('Failed to save error message:', dbError);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleNodeClick = (nodeId: string) => {
    setActiveNodeId(nodeId);
    setViewMode('chat');
  };

  if (initializing) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-muted-foreground">Loading chat...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header Actions */}
      <div className="flex items-center border-b border-border px-4 py-3 gap-2">
        {collapseSidebar && (
          <button
            onClick={collapseSidebar}
            className="h-10 w-10 rounded-xl border border-border bg-background hover:bg-muted transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="Collapse AI panel"
          >
            <PanelsLeftRight className="h-4 w-4" />
          </button>
        )}

        {[
          { id: 'chat' as ViewMode, label: 'Chat', icon: MessageSquare },
          { id: 'tree' as ViewMode, label: 'Tree', icon: GitBranch },
        ].map(({ id, label, icon: Icon }) => {
          const active = viewMode === id;
          return (
            <button
              key={id}
              onClick={() => setViewMode(id)}
              className={`
                flex-1 group rounded-2xl border h-10 px-3 text-sm transition-all
                focus-visible:outline-none focus-visible:ring-2
                ${active ? 'border-primary/70 bg-primary/5 text-foreground focus-visible:ring-primary/60' : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted/40 focus-visible:ring-primary/30'}
              `}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`
                    h-7 w-7 rounded-xl flex items-center justify-center
                    ${active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground group-hover:text-foreground'}
                  `}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="font-medium">{label}</span>
              </div>
            </button>
          );
        })}

        <VoiceButton size="sm" className="shrink-0" />
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {viewMode === 'chat' ? (
          <ChatMessageList messages={activeBranch} />
        ) : (
          <ChatTreeView
            nodes={nodes}
            activeNodeId={activeNodeId || ''}
            onNodeClick={handleNodeClick}
          />
        )}
      </div>

      {/* Chat Input (only in chat mode) */}
      {viewMode === 'chat' && (
        <ChatInput
          onSend={handleSendMessage}
          loading={loading}
        />
      )}
    </div>
  );
};
