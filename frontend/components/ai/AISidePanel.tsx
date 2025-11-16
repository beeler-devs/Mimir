'use client';

import React, { useState, useEffect, RefObject } from 'react';
import { ChatNode, AnimationSuggestion, WorkspaceInstance, Folder, LearningMode } from '@/lib/types';
import { addMessage, getActiveBranch, buildBranchPath } from '@/lib/chatState';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput, ChatInputRef } from './ChatInput';
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
import { parseMentions, resolveMentions, removeMentionsFromText } from '@/lib/mentions';
import { buildWorkspaceContext } from '@/lib/workspaceContext';
import { AnnotateCanvasRef } from '@/components/tabs/AnnotateCanvas';

type ViewMode = 'chat' | 'tree';

interface AISidePanelProps {
  collapseSidebar?: () => void;
  activeInstance?: WorkspaceInstance | null;
  instances?: WorkspaceInstance[];
  folders?: Folder[];
  annotationCanvasRef?: RefObject<AnnotateCanvasRef>;
}

/**
 * Main AI sidepanel component
 * Manages chat state and switches between chat and tree views
 */
export interface AISidePanelRef {
  addToChat: (message: string) => void;
}

export const AISidePanel = React.forwardRef<AISidePanelRef, AISidePanelProps>(({
  collapseSidebar,
  activeInstance = null,
  instances = [],
  folders = [],
  annotationCanvasRef,
}, ref) => {
  const [nodes, setNodes] = useState<ChatNode[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [loading, setLoading] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [initializing, setInitializing] = useState(true);

  const chatInputRef = React.useRef<ChatInputRef>(null);
  const activeBranch = activeNodeId ? getActiveBranch(nodes, activeNodeId) : [];

  // Expose methods via ref
  React.useImperativeHandle(ref, () => ({
    addToChat: (message: string) => {
      if (chatInputRef.current) {
        chatInputRef.current.setMessage(message);
        setViewMode('chat'); // Switch to chat view
      }
    },
  }));

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

  const handleSendMessage = async (content: string, learningMode?: LearningMode) => {
    if (!chatId) {
      console.error('No active chat');
      return;
    }

    setLoading(true);
    let savedUserMessage: ChatNode | null = null;

    try {
      // Parse mentions from message
      const rawMentions = parseMentions(content);
      const resolvedMentions = resolveMentions(rawMentions, instances, folders);
      
      // Export annotation canvas if active instance is annotation type
      const annotationExports: Record<string, string> = {};
      if (activeInstance?.type === 'annotate' && annotationCanvasRef?.current) {
        try {
          const imageBase64 = await annotationCanvasRef.current.exportCanvasAsImage();
          annotationExports[activeInstance.id] = imageBase64;
        } catch (error) {
          console.error('Failed to export active annotation canvas:', error);
          // Continue without image - don't block message sending
        }
      }
      
      // Also export mentioned annotation instances using saved state
      for (const mention of resolvedMentions) {
        if (mention.type === 'instance' && mention.id) {
          const mentionedInstance = instances.find((i) => i.id === mention.id);
          if (mentionedInstance?.type === 'annotate') {
            // Skip if already exported as active instance
            if (mentionedInstance.id === activeInstance?.id) {
              continue;
            }
            
            // Try to export from saved state
            if (mentionedInstance.data.excalidrawState) {
              // Validate state structure before attempting export
              const state = mentionedInstance.data.excalidrawState;
              if (!state.elements || !Array.isArray(state.elements)) {
                console.warn(`Invalid excalidrawState for instance ${mentionedInstance.id}: missing or invalid elements`);
              } else if (annotationCanvasRef?.current) {
                try {
                  const imageBase64 = await annotationCanvasRef.current.exportCanvasFromState(state);
                  annotationExports[mentionedInstance.id] = imageBase64;
                } catch (error) {
                  console.error(`Failed to export annotation canvas for instance ${mentionedInstance.id}:`, error);
                  // Continue without image - don't block message sending
                }
              } else {
                console.warn(`Cannot export canvas: annotationCanvasRef not available`);
              }
            } else {
              // No saved state - skip silently (this is expected for new/empty canvases)
            }
          }
        }
      }

      // Build workspace context
      const workspaceContext = buildWorkspaceContext(
        activeInstance,
        instances,
        folders,
        resolvedMentions,
        annotationExports
      );

      // Save user message to database (keep mentions visible in chat)
      savedUserMessage = await saveChatMessage(chatId, {
        parentId: activeNodeId,
        role: 'user',
        content: content, // Keep original content with mentions
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
      // Filter out empty messages before sending to backend
      const branchMessages = getActiveBranch(updatedNodes, savedUserMessage.id)
        .map(n => ({
          role: n.role,
          content: n.content || '',
        }))
        .filter((msg, idx, arr) => {
          // Allow empty content only for the final assistant message
          const isFinalAssistant = idx === arr.length - 1 && msg.role === 'assistant';
          const hasContent = msg.content && msg.content.trim().length > 0;
          return hasContent || isFinalAssistant;
        });

      const response = await fetch(`${backendUrl}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: branchMessages,
          branchPath,
          workspaceContext,
          learningMode,
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
      {/* Header Actions - Single Rounded Card */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1">
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
                  flex-1 group rounded-lg h-8 px-3 text-sm transition-all
                  focus-visible:outline-none focus-visible:ring-2
                  ${active ? 'text-foreground focus-visible:ring-primary/60' : 'text-muted-foreground focus-visible:ring-primary/30'}
                `}
                style={active ? { backgroundColor: '#F5F5F5' } : undefined}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.backgroundColor = '#F5F5F5';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.backgroundColor = '';
                  }
                }}
              >
                <div className="flex items-center gap-2 justify-center">
                  <Icon className="h-3.5 w-3.5" />
                  <span className="font-medium">{label}</span>
                </div>
              </button>
            );
          })}

          <VoiceButton size="sm" className="shrink-0" />

          {collapseSidebar && (
            <button
              onClick={collapseSidebar}
              className="h-8 w-8 rounded-lg hover:bg-muted/40 transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
              aria-label="Collapse AI panel"
            >
              <PanelsLeftRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {viewMode === 'chat' ? (
          <ChatMessageList 
            messages={activeBranch} 
            workspaceContext={buildWorkspaceContext(
              activeInstance,
              instances,
              folders,
              [],
              {}
            )}
          />
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
          ref={chatInputRef}
          onSend={handleSendMessage}
          loading={loading}
          instances={instances}
          folders={folders}
        />
      )}
    </div>
  );
});

AISidePanel.displayName = 'AISidePanel';
