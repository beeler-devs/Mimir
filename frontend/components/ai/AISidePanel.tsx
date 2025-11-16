'use client';

import React, { useState, useEffect, RefObject } from 'react';
import { ChatNode, AnimationSuggestion, WorkspaceInstance, Folder, LearningMode, PdfAttachment } from '@/lib/types';
import { addMessage, getActiveBranch, buildBranchPath } from '@/lib/chatState';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput, ChatInputRef } from './ChatInput';
import { VoiceButton } from './VoiceButton';
import { ChatTabBar } from './ChatTabBar';
import { PanelsLeftRight, MessageSquare, Code, Zap } from 'lucide-react';
import {
  loadUserChats,
  createChat,
  loadChatMessages,
  saveChatMessage,
  updateChatTitle,
  generateChatTitle,
  generateAIChatTitle,
  Chat,
} from '@/lib/db/chats';
import { parseMentions, resolveMentions, removeMentionsFromText } from '@/lib/mentions';
import { buildWorkspaceContext } from '@/lib/workspaceContext';
import { AnnotateCanvasRef } from '@/components/tabs/AnnotateCanvas';
import { useActiveLearningMode } from '@/lib/learningMode';

type StudyMode = 'chat' | 'code' | 'flappy-bird';

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
 * Manages chat state and switches between chat and other modes
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
  const [studyMode, setStudyMode] = useState<StudyMode>('chat');
  const [loading, setLoading] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [initializing, setInitializing] = useState(true);
  const [activeLearningMode] = useActiveLearningMode();
  
  // Chat tab management state
  const [openChatTabs, setOpenChatTabs] = useState<{ id: string; title: string }[]>([]);

  const chatInputRef = React.useRef<ChatInputRef>(null);
  const activeBranch = activeNodeId ? getActiveBranch(nodes, activeNodeId) : [];

  // Empty state view component
  const EmptyStateView = () => {
    const studyModes = [
      {
        id: 'chat' as StudyMode,
        label: 'Chat',
        icon: MessageSquare,
        action: () => handleNewChat()
      },
      {
        id: 'code' as StudyMode,
        label: 'Code',
        icon: Code,
        action: () => setStudyMode('code'),
        disabled: true
      },
      {
        id: 'flappy-bird' as StudyMode,
        label: 'Flappy Bird',
        icon: Zap,
        action: () => setStudyMode('flappy-bird'),
        disabled: true
      },
    ];

    return (
      <>
        <div className="flex-1 flex flex-col items-center p-8 pt-24 gap-8">
          <div className="text-center">
            <h2 className="text-2xl font-semibold mb-2">Start Working</h2>
          </div>

          {/* Study Mode Buttons - horizontal layout */}
          <div className="flex gap-2.5 items-center">
            {studyModes.map(({ id, label, icon: Icon, action, disabled }) => (
              <button
                key={id}
                onClick={action}
                disabled={disabled}
                className={`
                  flex items-center justify-center gap-2.5 px-4 py-2 rounded-md border transition-all text-sm font-medium
                  ${disabled
                    ? 'border-border bg-muted/30 opacity-50 cursor-not-allowed'
                    : 'border-border bg-background hover:border-primary/50 hover:bg-muted/50'
                  }
                `}
              >
                <Icon className={`h-4 w-4 ${disabled ? 'text-muted-foreground' : 'text-primary'}`} />
                <span>{label}</span>
              </button>
            ))}
          </div>
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
      </>
    );
  };

  // Load and persist open tabs
  useEffect(() => {
    const storedTabs = localStorage.getItem('mimir.openChatTabs');
    if (storedTabs) {
      try {
        const parsed = JSON.parse(storedTabs);
        setOpenChatTabs(parsed);
      } catch (error) {
        console.error('Failed to parse stored chat tabs:', error);
      }
    }
  }, []);

  useEffect(() => {
    if (openChatTabs.length > 0) {
      localStorage.setItem('mimir.openChatTabs', JSON.stringify(openChatTabs));
    } else {
      localStorage.removeItem('mimir.openChatTabs');
    }
  }, [openChatTabs]);

  // Keep open tabs synced with current chat and chats list
  useEffect(() => {
    if (chatId && chats.length > 0) {
      const currentChat = chats.find(c => c.id === chatId);
      if (currentChat) {
        setOpenChatTabs(prev => {
          const tabExists = prev.some(tab => tab.id === chatId);
          if (!tabExists) {
            // Add current chat to tabs
            return [...prev, {
              id: currentChat.id,
              title: currentChat.title || 'New Chat'
            }];
          } else {
            // Update title if it changed
            return prev.map(tab =>
              tab.id === chatId
                ? { ...tab, title: currentChat.title || 'New Chat' }
                : tab
            );
          }
        });
      }
    }
  }, [chatId, chats]); // Removed openChatTabs from deps to prevent infinite loop

  React.useImperativeHandle(ref, () => ({
    addToChat: (message: string) => {
      if (chatInputRef.current) {
        chatInputRef.current.setMessage(message);
        setStudyMode('chat'); // Switch to chat view
      }
    },
    createNewChat: async () => {
      await handleNewChat();
    },
  }));

  // Handler for creating a new chat
  const handleNewChat = async () => {
    try {
      const newChat = await createChat();
      setNodes([]);
      setActiveNodeId(null);
      setChatId(newChat.id);
      localStorage.setItem('mimir.activeChatId', newChat.id);
      setStudyMode('chat');
      
      // Add new chat to tabs
      setOpenChatTabs(prev => [...prev, {
        id: newChat.id,
        title: 'New Chat'
      }]);
      
      // Reload chats list
      const userChats = await loadUserChats();
      setChats(userChats);
    } catch (error) {
      console.error('Failed to create new chat:', error);
    }
  };

  // Handler for switching to a different chat tab
  const handleSelectTab = async (selectedChatId: string) => {
    try {
      // Load messages for the selected chat
      const messages = await loadChatMessages(selectedChatId);
      setNodes(messages);
      setChatId(selectedChatId);
      localStorage.setItem('mimir.activeChatId', selectedChatId);
      
      // Set active node to last message
      if (messages.length > 0) {
        setActiveNodeId(messages[messages.length - 1].id);
      } else {
        setActiveNodeId(null);
      }
      
      // Ensure tab is in open tabs
      const selectedChat = chats.find(c => c.id === selectedChatId);
      if (selectedChat) {
        const tabExists = openChatTabs.some(tab => tab.id === selectedChatId);
        if (!tabExists) {
          setOpenChatTabs(prev => [...prev, {
            id: selectedChat.id,
            title: selectedChat.title || 'New Chat'
          }]);
        }
      }
    } catch (error) {
      console.error('Failed to switch chat:', error);
    }
  };

  // Handler for closing a chat tab
  const handleCloseTab = (closedChatId: string) => {
    setOpenChatTabs(prev => {
      const newTabs = prev.filter(tab => tab.id !== closedChatId);

      // If closing the active chat, switch to another tab
      if (closedChatId === chatId) {
        if (newTabs.length > 0) {
          // Switch to the last remaining tab
          const nextTab = newTabs[newTabs.length - 1];
          handleSelectTab(nextTab.id);
        } else {
          // No tabs left, clear state instead of creating new chat
          setNodes([]);
          setActiveNodeId(null);
          setChatId(null);
          localStorage.removeItem('mimir.activeChatId');
        }
      }

      return newTabs;
    });
  };

  // Handler for renaming a chat tab
  const handleRenameTab = async (renamedChatId: string, newTitle: string) => {
    try {
      await updateChatTitle(renamedChatId, newTitle);
      
      // Update local state
      setOpenChatTabs(prev => prev.map(tab =>
        tab.id === renamedChatId ? { ...tab, title: newTitle } : tab
      ));
      
      // Reload chats list
      const userChats = await loadUserChats();
      setChats(userChats);
    } catch (error) {
      console.error('Failed to rename chat:', error);
    }
  };

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

      // Generate AI title after first exchange
      if (nodes.length === 0) {
        // Use simple title initially
        const simpleTitle = generateChatTitle(content);
        await updateChatTitle(chatId, simpleTitle);
        
        // Update tab title immediately
        setOpenChatTabs(prev => prev.map(tab =>
          tab.id === chatId ? { ...tab, title: simpleTitle } : tab
        ));
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
                
                // Generate AI title after first assistant response
                if (updatedNodes.length <= 1) {
                  // Get the conversation messages for title generation
                  const titleMessages = [
                    { role: 'user', content: savedUserMessage.content || '' },
                    { role: 'assistant', content: fullContent }
                  ];
                  
                  // Generate AI title asynchronously (don't block UI)
                  generateAIChatTitle(titleMessages).then(async (aiTitle) => {
                    await updateChatTitle(chatId, aiTitle);
                    
                    // Update tab title
                    setOpenChatTabs(prev => prev.map(tab =>
                      tab.id === chatId ? { ...tab, title: aiTitle } : tab
                    ));
                    
                    // Reload chats list
                    const userChats = await loadUserChats();
                    setChats(userChats);
                  }).catch(error => {
                    console.error('Failed to generate AI title:', error);
                  });
                }
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
      console.error('Error type:', typeof error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      
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
        console.error('Database error details:', JSON.stringify(dbError, null, 2));
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

  const renderContent = () => {
    switch (studyMode) {
      case 'chat':
        // Show empty state when no tabs are open
        if (openChatTabs.length === 0) {
          return <EmptyStateView />;
        }
        return (
          <>
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
          </>
        );
      case 'code':
        return (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Code className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">Code Mode</h3>
              <p className="text-sm text-muted-foreground">
                Interactive code exercises will be available here.
              </p>
            </div>
          </div>
        );
      case 'flappy-bird':
        return (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Zap className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">Flappy Bird</h3>
              <p className="text-sm text-muted-foreground">
                Coming soon!
              </p>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Mode Tabs */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center rounded-lg border border-border bg-background px-2 py-1">
          {/* Scrollable Tabs Section */}
          <div className="flex items-center gap-2 flex-1 overflow-x-auto scrollbar-hide-show">
            {[
              { id: 'chat' as StudyMode, label: 'Chat', icon: MessageSquare },
              { id: 'code' as StudyMode, label: 'Code', icon: Code },
              { id: 'flappy-bird' as StudyMode, label: 'Flappy Bird', icon: Zap },
            ].map(({ id, label, icon: Icon }) => {
              const active = studyMode === id;
              return (
                <button
                  key={id}
                  onClick={() => setStudyMode(id)}
                  className={`
                    flex-shrink-0 group rounded-[0.75rem] h-8 px-3 text-sm transition-all
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
                    <span className="font-medium whitespace-nowrap">{label}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Fixed Action Buttons Section */}
          {(studyMode === 'chat' || collapseSidebar) && (
            <div className="flex items-center gap-1 flex-shrink-0 pl-2 border-l border-border">
              {studyMode === 'chat' && <VoiceButton size="sm" />}

              {collapseSidebar && (
                <button
                  onClick={collapseSidebar}
                  className="h-8 w-8 rounded-lg hover:bg-muted/40 transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label="Collapse panel"
                >
                  <PanelsLeftRight className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Chat Tab Bar (only visible in chat mode) */}
      {studyMode === 'chat' && openChatTabs.length > 0 && (
        <ChatTabBar
          openTabs={openChatTabs}
          activeTabId={chatId}
          allChats={chats}
          onSelectTab={handleSelectTab}
          onCloseTab={handleCloseTab}
          onNewChat={handleNewChat}
          onRenameTab={handleRenameTab}
        />
      )}
      
      {renderContent()}
    </div>
  );
});

AISidePanel.displayName = 'AISidePanel';
