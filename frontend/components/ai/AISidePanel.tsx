'use client';

import React, { useState, useEffect, RefObject } from 'react';
import { ChatNode, AnimationSuggestion, WorkspaceInstance, Folder, LearningMode, PdfAttachment } from '@/lib/types';
import { addMessage, getActiveBranch, buildBranchPath } from '@/lib/chatState';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput, ChatInputRef } from './ChatInput';
import { VoiceButton } from './VoiceButton';
import { PanelsLeftRight, MessageSquare } from 'lucide-react';
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
import { useActiveLearningMode } from '@/lib/learningMode';

interface AISidePanelProps {
  collapseSidebar?: () => void;
  activeInstance?: WorkspaceInstance | null;
  instances?: WorkspaceInstance[];
  folders?: Folder[];
  annotationCanvasRef?: RefObject<AnnotateCanvasRef | null>;
  pendingChatText?: string | null;
  onChatTextAdded?: () => void;
}

export interface AISidePanelRef {
  addToChat: (message: string) => void;
  createNewChat: () => Promise<void>;
}

/**
 * Main AI sidepanel component
 * Manages chat state and conversation branching
 */
export const AISidePanel = React.forwardRef<AISidePanelRef, AISidePanelProps>(({
  collapseSidebar,
  activeInstance = null,
  instances = [],
  folders = [],
  annotationCanvasRef,
  pendingChatText,
  onChatTextAdded,
}, ref) => {
  const [nodes, setNodes] = useState<ChatNode[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [initializing, setInitializing] = useState(true);
  const [activeLearningMode] = useActiveLearningMode();

  const chatInputRef = React.useRef<ChatInputRef>(null);
  const activeBranch = activeNodeId ? getActiveBranch(nodes, activeNodeId) : [];

  React.useImperativeHandle(ref, () => ({
    addToChat: (message: string) => {
      if (chatInputRef.current) {
        chatInputRef.current.setMessage(message);
      }
    },
    createNewChat: async () => {
      try {
        const newChat = await createChat();
        setNodes([]);
        setActiveNodeId(null);
        setChatId(newChat.id);
        localStorage.setItem('mimir.activeChatId', newChat.id);
        const userChats = await loadUserChats();
        setChats(userChats);
      } catch (error) {
        console.error('Failed to create new chat:', error);
      }
    },
  }));

  useEffect(() => {
    const initializeChat = async () => {
      try {
        const storedChatId = localStorage.getItem('mimir.activeChatId');
        if (storedChatId) {
          const messages = await loadChatMessages(storedChatId);
          setNodes(messages);
          setChatId(storedChatId);
          if (messages.length > 0) {
            setActiveNodeId(messages[messages.length - 1].id);
          }
        } else {
          const newChat = await createChat();
          setChatId(newChat.id);
          localStorage.setItem('mimir.activeChatId', newChat.id);
        }
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

  useEffect(() => {
    if (chatId) {
      localStorage.setItem('mimir.activeChatId', chatId);
    }
  }, [chatId]);

  const handleSendMessage = async (content: string, learningMode?: LearningMode, pdfAttachments?: PdfAttachment[]) => {
    if (!chatId) {
      console.error('No active chat');
      return;
    }

    setLoading(true);
    let savedUserMessage: ChatNode | null = null;

    try {
      const rawMentions = parseMentions(content);
      const resolvedMentions = resolveMentions(rawMentions, instances, folders);
      
      const annotationExports: Record<string, string> = {};
      if (activeInstance?.type === 'annotate' && annotationCanvasRef?.current) {
        try {
          const imageBase64 = await annotationCanvasRef.current.exportCanvasAsImage();
          annotationExports[activeInstance.id] = imageBase64;
        } catch (error) {
          console.error('Failed to export active annotation canvas:', error);
        }
      }
      
      for (const mention of resolvedMentions) {
        if (mention.type === 'instance' && mention.id) {
          const mentionedInstance = instances.find((i) => i.id === mention.id);
          if (mentionedInstance?.type === 'annotate') {
            if (mentionedInstance.id === activeInstance?.id) {
              continue;
            }
            if (mentionedInstance.data.excalidrawState) {
              const state = mentionedInstance.data.excalidrawState;
              if (!state.elements || !Array.isArray(state.elements)) {
                console.warn(`Invalid excalidrawState for instance ${mentionedInstance.id}: missing or invalid elements`);
              } else if (annotationCanvasRef?.current) {
                try {
                  const imageBase64 = await annotationCanvasRef.current.exportCanvasFromState(state);
                  annotationExports[mentionedInstance.id] = imageBase64;
                } catch (error) {
                  console.error(`Failed to export annotation canvas for instance ${mentionedInstance.id}:`, error);
                }
              } else {
                console.warn(`Cannot export canvas: annotationCanvasRef not available`);
              }
            }
          }
        }
      }

      const workspaceContext = buildWorkspaceContext(
        activeInstance,
        instances,
        folders,
        resolvedMentions,
        annotationExports
      );
      
      if (pdfAttachments && pdfAttachments.length > 0) {
        const readyPdfs = pdfAttachments.filter(pdf => pdf.status === 'ready');
        if (readyPdfs.length > 0) {
          workspaceContext.pdfAttachments = readyPdfs;
        }
      }

      savedUserMessage = await saveChatMessage(chatId, {
        parentId: activeNodeId,
        role: 'user',
        content: content,
        pdfAttachments: pdfAttachments && pdfAttachments.length > 0 ? pdfAttachments : undefined,
      });

      const updatedNodes = [...nodes, savedUserMessage];
      setNodes(updatedNodes);
      setActiveNodeId(savedUserMessage.id);

      if (nodes.length === 0) {
        const title = generateChatTitle(content);
        await updateChatTitle(chatId, title);
      }

      if (!savedUserMessage) {
        throw new Error('Failed to save user message');
      }
      
      const branchPath = buildBranchPath(updatedNodes, savedUserMessage.id);
      const backendUrl = process.env.NEXT_PUBLIC_MANIM_WORKER_URL || process.env.MANIM_WORKER_URL || 'http://localhost:8001';
      
      const streamingMessageId = `streaming-${Date.now()}`;
      const streamingMessage: ChatNode = {
        id: streamingMessageId,
        parentId: savedUserMessage.id,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
      };
      
      const nodesWithStreaming = [...updatedNodes, streamingMessage];
      setNodes(nodesWithStreaming);
      setActiveNodeId(streamingMessageId);
      
      const branchMessages = getActiveBranch(updatedNodes, savedUserMessage.id)
        .map(n => ({
          role: n.role,
          content: n.content || '',
        }))
        .filter((msg, idx, arr) => {
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
                fullContent += data.content;
                setNodes(prev => prev.map(node => 
                  node.id === streamingMessageId
                    ? { ...node, content: fullContent }
                    : node
                ));
              } else if (data.type === 'done') {
                fullContent = data.content;
                suggestedAnimation = data.suggestedAnimation;
                
                const savedAIMessage = await saveChatMessage(chatId, {
                  parentId: savedUserMessage.id,
                  role: 'assistant',
                  content: fullContent,
                  suggestedAnimation,
                });

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
      
      setNodes(prev => prev.filter(node => !node.id.startsWith('streaming-')));
      
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
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1">
          <div className="flex items-center gap-2 px-3 h-8">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium text-sm">Chat</span>
          </div>

          <VoiceButton size="sm" className="shrink-0 ml-auto" />

          {collapseSidebar && (
            <button
              onClick={collapseSidebar}
              className="h-8 w-8 rounded-lg hover:bg-muted/40 transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
              aria-label="Collapse panel"
            >
              <PanelsLeftRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
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
      </div>
      <ChatInput
        ref={chatInputRef}
        onSend={handleSendMessage}
        loading={loading}
        instances={instances}
        folders={folders}
        pendingText={pendingChatText}
        onTextAdded={onChatTextAdded}
        learningMode={activeLearningMode}
      />
    </div>
  );
});

AISidePanel.displayName = 'AISidePanel';
