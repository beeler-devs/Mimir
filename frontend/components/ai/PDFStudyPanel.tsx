'use client';

import React, { useState, useEffect, RefObject, useCallback } from 'react';
import { ChatNode, AnimationSuggestion, WorkspaceInstance, Folder, LearningMode, PdfAttachment, MindMapWithNodes, QuizWithStats, FlashcardSetWithStats } from '@/lib/types';
import { addMessage, getActiveBranch, buildBranchPath } from '@/lib/chatState';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput, ChatInputRef } from './ChatInput';
import { VoiceButton } from './VoiceButton';
import { ChatTabBar } from './ChatTabBar';
import MindMapViewer from './MindMapViewer';
import { PanelsLeftRight, MessageSquare, BookOpen, FileQuestion, FileText, Podcast, MessageSquarePlus, Network, RotateCw, Loader2, Calendar, Trophy, Clock } from 'lucide-react';
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer';
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
import { useActiveLearningMode } from '@/lib/learningMode';
import {
  saveSummary,
  getLatestSummary,
  saveFlashcardSet,
  getLatestFlashcardSet,
  getAllFlashcardSets,
  getFlashcardSetWithStats,
  saveQuiz,
  getLatestQuiz,
  getAllQuizzes,
  getQuizWithStats,
  startQuizAttempt,
  submitQuizAnswer,
  completeQuizAttempt,
  updateQuizAttemptPosition,
  getIncompleteQuizAttempt,
} from '@/lib/db/studyMaterials';
import { supabase } from '@/lib/supabaseClient';

type StudyMode = 'chat' | 'flashcards' | 'quiz' | 'summary' | 'podcast' | 'mindmap';

interface PDFStudyPanelProps {
  collapseSidebar?: () => void;
  activeInstance?: WorkspaceInstance | null;
  instances?: WorkspaceInstance[];
  folders?: Folder[];
  contextText?: string | null;
  onContextRemoved?: () => void;
  getCurrentPageImage?: () => Promise<string | null>;
}

export interface PDFStudyPanelRef {
  addToChat: (message: string) => void;
  createNewChat: () => Promise<void>;
}

const THINKING_STATEMENTS = [
  'Dusting off some neurons…',
  'One moment, consulting my imaginary whiteboard...',
  'Spinning up the tiny hamster that powers my brain…',
  'Running the numbers. Then arguing with them.',
  'Hold on—my thoughts are buffering...',
  'Performing a quick sanity check. Results may vary.',
  'Cross-referencing with Section 7 of “Things I Should Know.”',
  'Running a Bayesian update on my confidence levels…',
  'Evaluating edge cases and their feelings.',
  'Simulating 10,000 parallel universes. Picking the least chaotic answer.',
];

// Provides a rotating thinking message while async work is in progress
const useThinkingMessage = (active: boolean) => {
  const [message, setMessage] = React.useState(THINKING_STATEMENTS[0]);

  React.useEffect(() => {
    if (!active) return undefined;

    const interval = setInterval(() => {
      setMessage(prev => {
        let next = prev;
        while (next === prev) {
          next = THINKING_STATEMENTS[Math.floor(Math.random() * THINKING_STATEMENTS.length)];
        }
        return next;
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [active]);

  return active ? message : '';
};


/**
 * Study Tools Panel
 * Provides chat, flashcards, quizzes, summary, and podcast features for PDF and Lecture instances
 */
export const PDFStudyPanel = React.forwardRef<PDFStudyPanelRef, PDFStudyPanelProps>(({
  collapseSidebar,
  activeInstance = null,
  instances = [],
  folders = [],
  contextText,
  onContextRemoved,
  getCurrentPageImage,
}, ref) => {
  const [nodes, setNodes] = useState<ChatNode[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [studyMode, setStudyMode] = useState<StudyMode>('chat');
  const [loading, setLoading] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [initializing, setInitializing] = useState(true);

  // Chat tab management state
  const [openChatTabs, setOpenChatTabs] = useState<{ id: string; title: string }[]>([]);

  // Study tools state
  const [flashcards, setFlashcards] = useState<{ front: string; back: string }[]>([]);
  const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
  const [showFlashcardAnswer, setShowFlashcardAnswer] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<{ id?: string; question: string; options: string[]; correctIndex: number; optionExplanations?: string[] }[]>([]);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [userAnswers, setUserAnswers] = useState<(number | null)[]>([]);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [summary, setSummary] = useState<string>('');
  const [generatingFlashcards, setGeneratingFlashcards] = useState(false);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  
  // Study materials persistence state
  const [currentQuizAttemptId, setCurrentQuizAttemptId] = useState<string | null>(null);
  const [quizId, setQuizId] = useState<string | null>(null);
  const [loadedFlashcardSetId, setLoadedFlashcardSetId] = useState<string | null>(null);
  
  // History state
  const [quizHistory, setQuizHistory] = useState<QuizWithStats[]>([]);
  const [flashcardHistory, setFlashcardHistory] = useState<FlashcardSetWithStats[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const [selectedFlashcardSetId, setSelectedFlashcardSetId] = useState<string | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Flashcard chat state (separate from main chat)
  const [flashcardChatNodes, setFlashcardChatNodes] = useState<ChatNode[]>([]);
  const [flashcardChatActiveNodeId, setFlashcardChatActiveNodeId] = useState<string | null>(null);
  const [flashcardChatLoading, setFlashcardChatLoading] = useState(false);

  // Text selection state for summary
  const [selectedSummaryText, setSelectedSummaryText] = useState<string>('');
  const [showSummaryPopup, setShowSummaryPopup] = useState(false);
  const [summaryPopupPosition, setSummaryPopupPosition] = useState({ x: 0, y: 0 });

  // Study mode customization options
  const [studyModeFocus, setStudyModeFocus] = useState<string>('');

  // Ref for summary container to enable auto-scroll
  const summaryContainerRef = React.useRef<HTMLDivElement>(null);
  
  // Mind map state
  const [mindMap, setMindMap] = useState<MindMapWithNodes | null>(null);
  const [generatingMindMap, setGeneratingMindMap] = useState(false);
  const [mindMapScopeType, setMindMapScopeType] = useState<'full' | 'custom'>('full');
  const mindMapThinkingMessage = useThinkingMessage(generatingMindMap);

  const chatInputRef = React.useRef<ChatInputRef>(null);
  const flashcardChatInputRef = React.useRef<ChatInputRef>(null);
  const activeBranch = activeNodeId ? getActiveBranch(nodes, activeNodeId) : [];
  const flashcardChatActiveBranch = flashcardChatActiveNodeId ? getActiveBranch(flashcardChatNodes, flashcardChatActiveNodeId) : [];
  const flashcardThinkingMessage = useThinkingMessage(generatingFlashcards);
  const quizThinkingMessage = useThinkingMessage(generatingQuiz);
  const summaryThinkingMessage = useThinkingMessage(generatingSummary);
  const [activeLearningMode] = useActiveLearningMode();

  // Empty state view component
  const EmptyStateView = () => {
    const contentType = activeInstance?.type === 'lecture' ? 'Lecture' : 'PDF';
    const studyModes = [
      {
        id: 'chat' as StudyMode,
        label: 'Chat',
        icon: MessageSquare,
        description: `Ask questions about your ${contentType.toLowerCase()}`,
        action: () => handleNewChat()
      },
      {
        id: 'flashcards' as StudyMode,
        label: 'Flashcards',
        icon: BookOpen,
        description: 'Generate flashcards for studying',
        action: () => setStudyMode('flashcards')
      },
      {
        id: 'quiz' as StudyMode,
        label: 'Quiz',
        icon: FileQuestion,
        description: 'Test your knowledge',
        action: () => setStudyMode('quiz')
      },
      {
        id: 'summary' as StudyMode,
        label: 'Summary',
        icon: FileText,
        description: 'Get a quick overview',
        action: () => setStudyMode('summary')
      },
      {
        id: 'podcast' as StudyMode,
        label: 'Podcast',
        icon: Podcast,
        description: 'Listen to AI summary (coming soon)',
        action: () => setStudyMode('podcast'),
        disabled: true
      },
      {
        id: 'mindmap' as StudyMode,
        label: 'Mind Map',
        icon: Network,
        description: 'Visual concept map',
        action: () => setStudyMode('mindmap')
      },
    ];

    return (
      <>
        <div className="flex-1 flex flex-col items-center p-8 pt-24 gap-8">
          {/* Header */}
          <div className="text-center">
            <h2 className="text-2xl font-semibold mb-2 pt-30">Study Your {contentType}</h2>
          </div>

          {/* Study Mode Grid - 3-2 layout */}
          <div className="flex flex-col gap-2.5 items-center">
            {/* Top row - 3 buttons */}
            <div className="flex gap-2.5">
              {studyModes.slice(0, 3).map(({ id, label, icon: Icon, action, disabled }) => (
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

            {/* Bottom row - 2 buttons */}
            <div className="flex gap-2.5">
              {studyModes.slice(3).map(({ id, label, icon: Icon, action, disabled }) => (
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
        </div>

        {/* Normal Chat Input */}
        <ChatInput
          ref={chatInputRef}
          onSend={handleSendMessage}
          loading={loading}
          instances={instances}
          folders={folders}
          contextText={contextText}
          onContextRemoved={onContextRemoved}
        />
      </>
    );
  };

  // Load and persist open tabs
  useEffect(() => {
    const storedTabs = localStorage.getItem('mimir.openChatTabs.pdf');
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
      localStorage.setItem('mimir.openChatTabs.pdf', JSON.stringify(openChatTabs));
    } else {
      localStorage.removeItem('mimir.openChatTabs.pdf');
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

  // Expose methods via ref
  React.useImperativeHandle(ref, () => ({
    addToChat: (message: string) => {
      if (chatInputRef.current) {
        chatInputRef.current.setContext(message);
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
      const messages = await loadChatMessages(selectedChatId);
      setNodes(messages);
      setChatId(selectedChatId);
      localStorage.setItem('mimir.activeChatId', selectedChatId);

      if (messages.length > 0) {
        setActiveNodeId(messages[messages.length - 1].id);
      } else {
        setActiveNodeId(null);
      }

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

      if (closedChatId === chatId) {
        if (newTabs.length > 0) {
          const nextTab = newTabs[newTabs.length - 1];
          handleSelectTab(nextTab.id);
        } else {
          // Clear state instead of creating new chat
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

      setOpenChatTabs(prev => prev.map(tab =>
        tab.id === renamedChatId ? { ...tab, title: newTitle } : tab
      ));

      const userChats = await loadUserChats();
      setChats(userChats);
    } catch (error) {
      console.error('Failed to rename chat:', error);
    }
  };

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

  // Load saved study materials when instance opens
  useEffect(() => {
    const loadStudyMaterials = async () => {
      if (!activeInstance || (activeInstance.type !== 'pdf' && activeInstance.type !== 'lecture')) {
        return;
      }
      
      setLoadingHistory(true);
      
      try {
        // Load latest summary
        const savedSummary = await getLatestSummary(activeInstance.id);
        if (savedSummary) {
          setSummary(savedSummary.content);
        }
        
        // Load all flashcard sets with stats
        const allFlashcardSets = await getAllFlashcardSets(activeInstance.id);
        if (allFlashcardSets.length > 0) {
          // Get stats for each set
          const setsWithStats = await Promise.all(
            allFlashcardSets.map(set => getFlashcardSetWithStats(set.id))
          );
          setFlashcardHistory(setsWithStats);
        }
        
        // Load all quizzes with stats
        const allQuizzes = await getAllQuizzes(activeInstance.id);
        if (allQuizzes.length > 0) {
          // Get stats for each quiz
          const quizzesWithStats = await Promise.all(
            allQuizzes.map(quiz => getQuizWithStats(quiz.id))
          );
          setQuizHistory(quizzesWithStats);
        }
      } catch (error) {
        console.error('Error loading study materials:', error);
      } finally {
        setLoadingHistory(false);
      }
    };
    
    loadStudyMaterials();
  }, [activeInstance]);

  // Get content text for context (supports both PDF and Lecture instances)
  const getContentContext = (): string => {
    if (activeInstance?.type === 'pdf' && activeInstance.data.fullText) {
      return activeInstance.data.fullText;
    }
    if (activeInstance?.type === 'lecture') {
      // For lectures, combine transcript with slides text if available
      let content = '';
      if (activeInstance.data.transcript) {
        content += activeInstance.data.transcript;
      }
      if (activeInstance.data.slidesFullText) {
        if (content) content += '\n\n--- Lecture Slides ---\n\n';
        content += activeInstance.data.slidesFullText;
      }
      return content;
    }
    return '';
  };

  const handleSendMessage = async (content: string, learningMode?: LearningMode, pdfAttachments?: PdfAttachment[]) => {
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

      // Build workspace context
      const workspaceContext = buildWorkspaceContext(
        activeInstance,
        instances,
        folders,
        resolvedMentions,
        {}
      );

      // Add content text to context (PDF or Lecture)
      const contentContext = getContentContext();
      if (contentContext) {
        workspaceContext.pdfContext = contentContext;
      }

      // Capture current page image if available
      if (getCurrentPageImage) {
        try {
          const pageImage = await getCurrentPageImage();
          if (pageImage) {
            workspaceContext.currentPageImage = pageImage;
          }
        } catch (error) {
          console.error('Failed to capture page image:', error);
        }
      }

      // Save user message to database
      savedUserMessage = await saveChatMessage(chatId, {
        parentId: activeNodeId,
        role: 'user',
        content: content,
        pdfAttachments: pdfAttachments && pdfAttachments.length > 0 ? pdfAttachments : undefined,
      });

      // Update local state
      const updatedNodes = [...nodes, savedUserMessage];
      setNodes(updatedNodes);
      setActiveNodeId(savedUserMessage.id);

      // Generate AI title after first exchange
      if (nodes.length === 0) {
        const simpleTitle = generateChatTitle(content);
        await updateChatTitle(chatId, simpleTitle);

        setOpenChatTabs(prev => prev.map(tab =>
          tab.id === chatId ? { ...tab, title: simpleTitle } : tab
        ));
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

      // Log request payload for debugging
      const requestPayload = {
        messages: branchMessages,
        branchPath,
        workspaceContext,
        learningMode,
      };
      console.log('='.repeat(80));
      console.log('📤 SENDING CHAT REQUEST');
      console.log('Request keys:', Object.keys(requestPayload));
      console.log('Messages count:', requestPayload.messages.length);
      console.log('Branch path:', requestPayload.branchPath);
      console.log('Learning mode:', requestPayload.learningMode);
      if (requestPayload.workspaceContext) {
        console.log('WorkspaceContext keys:', Object.keys(requestPayload.workspaceContext));
        console.log('  - instances:', requestPayload.workspaceContext.instances?.length || 0);
        console.log('  - folders:', requestPayload.workspaceContext.folders?.length || 0);
        console.log('  - annotationImages:', Object.keys(requestPayload.workspaceContext.annotationImages || {}).length);
        console.log('  - pdfAttachments:', requestPayload.workspaceContext.pdfAttachments?.length || 0);
        console.log('  - attachments:', requestPayload.workspaceContext.attachments || 'NOT_PRESENT');
        console.log('  - pdfContext:', requestPayload.workspaceContext.pdfContext ? 'PRESENT' : 'NOT_PRESENT');
        console.log('  - currentPageImage:', requestPayload.workspaceContext.currentPageImage ? 'PRESENT' : 'NOT_PRESENT');
      }
      console.log('Full payload:', JSON.stringify(requestPayload, null, 2));
      console.log('='.repeat(80));

      const response = await fetch(`${backendUrl}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
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

                // Generate AI title after first assistant response
                if (updatedNodes.length <= 1) {
                  const titleMessages = [
                    { role: 'user', content: savedUserMessage.content || '' },
                    { role: 'assistant', content: fullContent }
                  ];

                  generateAIChatTitle(titleMessages).then(async (aiTitle) => {
                    await updateChatTitle(chatId, aiTitle);

                    setOpenChatTabs(prev => prev.map(tab =>
                      tab.id === chatId ? { ...tab, title: aiTitle } : tab
                    ));

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
        console.error('Database error details:', JSON.stringify(dbError, null, 2));
      }
    } finally {
      setLoading(false);
    }
  };

  const generateFlashcards = async () => {
    setGeneratingFlashcards(true);
    // Clear flashcard chat when generating new flashcards
    setFlashcardChatNodes([]);
    setFlashcardChatActiveNodeId(null);
    try {
      const contentContext = getContentContext();

      if (!contentContext || contentContext.trim().length === 0) {
        alert('No content available. Please upload a PDF or lecture first.');
        return;
      }

      const backendUrl = process.env.NEXT_PUBLIC_MANIM_WORKER_URL || process.env.MANIM_WORKER_URL || 'http://localhost:8001';

      // Build request body based on focus input
      const requestBody: { pdfText: string; scope: string; focus?: string } = {
        pdfText: contentContext,
        scope: studyModeFocus.trim().length === 0 ? 'entire' : 'custom',
      };
      if (studyModeFocus.trim().length > 0) {
        requestBody.focus = studyModeFocus;
      }

      const response = await fetch(`${backendUrl}/study-tools/flashcards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to generate flashcards');
      }

      const data = await response.json();
      setFlashcards(data.flashcards || []);
      setCurrentFlashcardIndex(0);
      setShowFlashcardAnswer(false);
      
      // Save flashcards to database
      if (activeInstance?.id && data.flashcards && data.flashcards.length > 0) {
        try {
          const savedFlashcardSet = await saveFlashcardSet(
            activeInstance.id,
            data.flashcards,
            'Flashcards',
            undefined,
            { focus: studyModeFocus || undefined }
          );
          setLoadedFlashcardSetId(savedFlashcardSet.id);
          setSelectedFlashcardSetId(savedFlashcardSet.id);
          
          // Reload flashcard history
          const allFlashcardSets = await getAllFlashcardSets(activeInstance.id);
          if (allFlashcardSets.length > 0) {
            const setsWithStats = await Promise.all(
              allFlashcardSets.map(set => getFlashcardSetWithStats(set.id))
            );
            setFlashcardHistory(setsWithStats);
          }
        } catch (error) {
          console.error('Error saving flashcards:', error);
        }
      }
      
      // Reset customization options for next generation
      setStudyModeFocus('');
    } catch (error) {
      console.error('Error generating flashcards:', error);
      alert(error instanceof Error ? error.message : 'Failed to generate flashcards. Please ensure the backend server is running.');
    } finally {
      setGeneratingFlashcards(false);
    }
  };

  // Handler for flashcard chat messages
  const handleFlashcardChatMessage = async (content: string, learningMode?: LearningMode, pdfAttachments?: PdfAttachment[]) => {
    if (!flashcards.length) {
      console.error('No flashcards available');
      return;
    }

    setFlashcardChatLoading(true);
    let savedUserMessage: ChatNode | null = null;

    try {
      const currentCard = flashcards[currentFlashcardIndex];

      // Build flashcard context message
      const flashcardContext = `Context: You are helping the user with a flashcard from their PDF study session.

Current Flashcard:
Front: ${currentCard.front}
Back: ${currentCard.back}

The user is studying this flashcard and may ask questions about it, need help understanding the concept, or want guidance on how to remember it.`;

      // Combine context with user's question
      const fullMessage = `${flashcardContext}\n\n${content}`;

      // Parse mentions from message
      const rawMentions = parseMentions(fullMessage);
      const resolvedMentions = resolveMentions(rawMentions, instances, folders);

      // Build workspace context
      const workspaceContext = buildWorkspaceContext(
        activeInstance,
        instances,
        folders,
        resolvedMentions,
        {}
      );

      // Add PDF full text to context
      const contentContext = getContentContext();
      if (contentContext) {
        workspaceContext.pdfContext = contentContext;
      }

      // Capture current page image if available
      if (getCurrentPageImage) {
        try {
          const pageImage = await getCurrentPageImage();
          if (pageImage) {
            workspaceContext.currentPageImage = pageImage;
          }
        } catch (error) {
          console.error('Failed to capture page image:', error);
        }
      }

      // Create a temporary user message node (we don't save flashcard chat to database)
      const userMessageId = `flashcard-user-${Date.now()}`;
      const userMessage: ChatNode = {
        id: userMessageId,
        parentId: flashcardChatActiveNodeId,
        role: 'user',
        content: content, // Store only the user's question, not the context
        createdAt: new Date().toISOString(),
      };

      // Update local state
      const updatedNodes = [...flashcardChatNodes, userMessage];
      setFlashcardChatNodes(updatedNodes);
      setFlashcardChatActiveNodeId(userMessageId);

      // Create a temporary streaming message node
      const streamingMessageId = `flashcard-streaming-${Date.now()}`;
      const streamingMessage: ChatNode = {
        id: streamingMessageId,
        parentId: userMessageId,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
      };

      // Add streaming message to state
      const nodesWithStreaming = [...updatedNodes, streamingMessage];
      setFlashcardChatNodes(nodesWithStreaming);
      setFlashcardChatActiveNodeId(streamingMessageId);

      // Stream the response
      const branchMessages = getActiveBranch(updatedNodes, userMessageId)
        .map(n => ({
          role: n.role,
          content: n.role === 'user' ? fullMessage : (n.content || ''), // Include context for user messages
        }))
        .filter((msg, idx, arr) => {
          const isFinalAssistant = idx === arr.length - 1 && msg.role === 'assistant';
          const hasContent = msg.content && msg.content.trim().length > 0;
          return hasContent || isFinalAssistant;
        });

      const branchPath = buildBranchPath(updatedNodes, userMessageId);
      const backendUrl = process.env.NEXT_PUBLIC_MANIM_WORKER_URL || process.env.MANIM_WORKER_URL || 'http://localhost:8001';

      const response = await fetch(`${backendUrl}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: branchMessages,
          branchPath,
          workspaceContext,
          learningMode: learningMode || activeLearningMode,
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
                setFlashcardChatNodes(prev => prev.map(node =>
                  node.id === streamingMessageId
                    ? { ...node, content: fullContent }
                    : node
                ));
              } else if (data.type === 'done') {
                fullContent = data.content;
                suggestedAnimation = data.suggestedAnimation;

                // Replace streaming message with final message
                const finalMessage: ChatNode = {
                  id: streamingMessageId,
                  parentId: userMessageId,
                  role: 'assistant',
                  content: fullContent,
                  suggestedAnimation,
                  createdAt: new Date().toISOString(),
                };

                setFlashcardChatNodes(prev => prev.map(node =>
                  node.id === streamingMessageId
                    ? finalMessage
                    : node
                ));
                setFlashcardChatActiveNodeId(streamingMessageId);
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
      console.error('Error sending flashcard chat message:', error);

      // Remove streaming message if it exists
      setFlashcardChatNodes(prev => prev.filter(node => !node.id.startsWith('flashcard-streaming-')));

      // Add error message
      const errorMessage: ChatNode = {
        id: `flashcard-error-${Date.now()}`,
        parentId: flashcardChatActiveNodeId,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        createdAt: new Date().toISOString(),
      };
      setFlashcardChatNodes(prev => [...prev, errorMessage]);
      setFlashcardChatActiveNodeId(errorMessage.id);
    } finally {
      setFlashcardChatLoading(false);
    }
  };

  const generateQuiz = async () => {
    setGeneratingQuiz(true);
    try {
      const contentContext = getContentContext();

      if (!contentContext || contentContext.trim().length === 0) {
        alert('No content available. Please upload a PDF or lecture first.');
        return;
      }

      const backendUrl = process.env.NEXT_PUBLIC_MANIM_WORKER_URL || process.env.MANIM_WORKER_URL || 'http://localhost:8001';

      // Build request body based on focus input
      const requestBody: { pdfText: string; scope: string; focus?: string } = {
        pdfText: contentContext,
        scope: studyModeFocus.trim().length === 0 ? 'entire' : 'custom',
      };
      if (studyModeFocus.trim().length > 0) {
        requestBody.focus = studyModeFocus;
      }

      const response = await fetch(`${backendUrl}/study-tools/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to generate quiz');
      }

      const data = await response.json();
      const questions = data.questions || [];
      
      // Save quiz to database and start attempt
      if (activeInstance?.id && questions.length > 0) {
        try {
          const savedQuiz = await saveQuiz(
            activeInstance.id,
            questions.map((q: any) => ({
              question: q.question,
              options: q.options,
              correctIndex: q.correctIndex,
              optionExplanations: q.optionExplanations,
            })),
            'Quiz',
            undefined,
            { focus: studyModeFocus || undefined }
          );
          
          // Update quiz questions with IDs from saved quiz
          setQuizQuestions(savedQuiz.questions.map(q => ({
            id: q.id,
            question: q.question,
            options: q.options,
            correctIndex: q.correctOptionIndex,
            optionExplanations: q.optionExplanations
          })));
          setQuizId(savedQuiz.id);
          setSelectedQuizId(savedQuiz.id);
          
          // Start a quiz attempt
          const attempt = await startQuizAttempt(savedQuiz.id);
          setCurrentQuizAttemptId(attempt.id);
          
          // Reload quiz history
          const allQuizzes = await getAllQuizzes(activeInstance.id);
          if (allQuizzes.length > 0) {
            const quizzesWithStats = await Promise.all(
              allQuizzes.map(quiz => getQuizWithStats(quiz.id))
            );
            setQuizHistory(quizzesWithStats);
          }
        } catch (error) {
          console.error('Error saving quiz:', error);
          // Still set the questions even if save fails
          setQuizQuestions(questions);
        }
      } else {
        setQuizQuestions(questions);
      }
      
      setCurrentQuizIndex(0);
      setSelectedAnswer(null);
      setUserAnswers(new Array(questions.length).fill(null));
      setQuizCompleted(false);
      // Reset customization options for next generation
      setStudyModeFocus('');
    } catch (error) {
      console.error('Error generating quiz:', error);
      alert(error instanceof Error ? error.message : 'Failed to generate quiz. Please ensure the backend server is running.');
    } finally {
      setGeneratingQuiz(false);
    }
  };

  const generateSummary = async () => {
    setGeneratingSummary(true);
    setSummary(''); // Clear previous summary
    try {
      const contentContext = getContentContext();

      if (!contentContext || contentContext.trim().length === 0) {
        alert('No content available. Please upload a PDF or lecture first.');
        return;
      }

      const backendUrl = process.env.NEXT_PUBLIC_MANIM_WORKER_URL || process.env.MANIM_WORKER_URL || 'http://localhost:8001';

      // Build request body based on focus input
      const requestBody: { pdfText: string; scope: string; focus?: string } = {
        pdfText: contentContext,
        scope: studyModeFocus.trim().length === 0 ? 'entire' : 'custom',
      };
      if (studyModeFocus.trim().length > 0) {
        requestBody.focus = studyModeFocus;
      }

      const response = await fetch(`${backendUrl}/study-tools/summary/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to generate summary');
      }

      // Stream the response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

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
                setSummary(fullContent);
              } else if (data.type === 'done') {
                fullContent = data.content;
                setSummary(fullContent);
              } else if (data.type === 'error') {
                throw new Error(data.content);
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }

      // Save summary to database
      if (activeInstance?.id && fullContent) {
        try {
          await saveSummary(
            activeInstance.id,
            fullContent,
            { focus: studyModeFocus || undefined }
          );
        } catch (error) {
          console.error('Error saving summary:', error);
        }
      }

      // Reset customization options for next generation
      setStudyModeFocus('');
    } catch (error) {
      console.error('Error generating summary:', error);
      alert(error instanceof Error ? error.message : 'Failed to generate summary. Please ensure the backend server is running.');
      setSummary('');
    } finally {
      setGeneratingSummary(false);
    }
  };

  // Generate mind map from content
  const generateMindMap = async () => {
    setGeneratingMindMap(true);
    setMindMap(null); // Clear previous mind map
    try {
      const contentContext = getContentContext();

      if (!contentContext || contentContext.trim().length === 0) {
        alert('No content available. Please upload a PDF or lecture first.');
        return;
      }

      // Call the frontend API endpoint
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch('/api/study-materials/mindmap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify({
          pdfText: contentContext,
          instanceId: activeInstance?.id,
          scope: mindMapScopeType === 'custom' && studyModeFocus.trim()
            ? studyModeFocus.trim()
            : 'full document'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate mind map');
      }

      const data = await response.json();
      setMindMap(data.mindMap);

      // Reset customization options for next generation
      setStudyModeFocus('');
    } catch (error) {
      console.error('Error generating mind map:', error);
      alert(error instanceof Error ? error.message : 'Failed to generate mind map. Please ensure the backend server is running.');
      setMindMap(null);
    } finally {
      setGeneratingMindMap(false);
    }
  };

  // Text selection handler for summary (only when in summary mode)
  const handleSummaryTextSelection = useCallback((event: MouseEvent) => {
    if (studyMode !== 'summary') return;

    const selection = window.getSelection();
    const text = selection?.toString().trim();

    if (text && text.length > 0) {
      // Check if the selection is within the summary content
      const target = event.target as HTMLElement;
      const summaryContent = target.closest('[data-summary-content="true"]');

      if (summaryContent) {
        setSelectedSummaryText(text);
        const range = selection?.getRangeAt(0);
        const rect = range?.getBoundingClientRect();

        if (rect) {
          setSummaryPopupPosition({
            x: rect.left + rect.width / 2,
            y: rect.top - 10,
          });
          setShowSummaryPopup(true);
        }
      } else {
        setShowSummaryPopup(false);
      }
    } else {
      setShowSummaryPopup(false);
    }
  }, [studyMode]);

  const handleAddSummaryToChat = useCallback(() => {
    if (selectedSummaryText && chatInputRef.current) {
      chatInputRef.current.setContext(selectedSummaryText);
      setShowSummaryPopup(false);
      setSelectedSummaryText('');
      window.getSelection()?.removeAllRanges();
      setStudyMode('chat'); // Switch to chat view
    }
  }, [selectedSummaryText]);

  useEffect(() => {
    document.addEventListener('mouseup', handleSummaryTextSelection);
    return () => {
      document.removeEventListener('mouseup', handleSummaryTextSelection);
    };
  }, [handleSummaryTextSelection]);

  // Auto-scroll summary as it's being generated
  useEffect(() => {
    if (studyMode === 'summary' && summary && generatingSummary) {
      const container = summaryContainerRef.current;
      if (container) {
        // Scroll to bottom smoothly as content is generated
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth'
        });
      }
    }
  }, [summary, studyMode, generatingSummary]);

  if (initializing) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-muted-foreground">Loading...</p>
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

        // Normal chat view
        return (
          <>
            <div className="flex-1 overflow-y-auto sidebar-scrollbar">
              <ChatMessageList
                messages={activeBranch}
                workspaceContext={buildWorkspaceContext(
                  activeInstance,
                  instances,
                  folders,
                  [],
                  {}
                )}
                onAddToChat={(text) => {
                  if (chatInputRef.current) {
                    chatInputRef.current.setContext(text);
                  }
                }}
              />
            </div>
            <ChatInput
              ref={chatInputRef}
              onSend={handleSendMessage}
              loading={loading}
              instances={instances}
              folders={folders}
              contextText={contextText}
              onContextRemoved={onContextRemoved}
            />
          </>
        );

      case 'flashcards':
        if (generatingFlashcards) {
          return (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-sm text-muted-foreground">{flashcardThinkingMessage || 'Thinking...'}</div>
              </div>
            </div>
          );
        }

        // Show history grid if no flashcard set is selected and history exists
        if (!selectedFlashcardSetId && flashcardHistory.length > 0 && flashcards.length === 0) {
          return (
            <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto sidebar-scrollbar">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Flashcard Sets</h3>
                <button
                  onClick={generateFlashcards}
                  disabled={generatingFlashcards}
                  className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm font-medium transition-colors"
                >
                  Generate New Set
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-1 gap-3">
                {flashcardHistory.map((set) => {
                  const progressPercent = set.cardCount > 0 
                    ? Math.round((set.stats.reviewedCount / set.cardCount) * 100)
                    : 0;
                  
                  return (
                    <div
                      key={set.id}
                      className="border border-border rounded-lg p-4 hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer bg-background"
                      onClick={() => {
                        // Load this flashcard set
                        setSelectedFlashcardSetId(set.id);
                        setFlashcards(set.flashcards.map(card => ({
                          front: card.front,
                          back: card.back
                        })));
                        setLoadedFlashcardSetId(set.id);
                        setCurrentFlashcardIndex(0);
                        setShowFlashcardAnswer(false);
                      }}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm mb-1">
                            {set.title || `Flashcard Set ${set.studyMaterial?.version || ''}`}
                          </h4>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span>{new Date(set.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="px-2 py-1 bg-primary/10 text-primary rounded text-xs font-medium">
                          {set.cardCount} Cards
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            Progress: {set.stats.reviewedCount}/{set.cardCount} reviewed
                          </span>
                          <span className="font-medium">{progressPercent}%</span>
                        </div>

                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>

                        {set.stats.dueForReview > 0 && (
                          <div className="flex items-center gap-1 text-xs text-orange-600">
                            <Clock className="h-3 w-3" />
                            <span>{set.stats.dueForReview} due for review</span>
                          </div>
                        )}

                        <button
                          className="w-full px-3 py-1.5 rounded-md text-xs font-medium transition-colors bg-primary/10 text-primary hover:bg-primary/20"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Handle will be done by parent div
                          }}
                        >
                          Study
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        if (flashcards.length === 0) {
          return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
              <div className="text-center">
                <BookOpen className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="text-lg font-semibold mb-2">Generate Flashcards</h3>
              </div>

              <div className="w-full max-w-md space-y-4">
                {/* Focus Area Input */}
                <div>
                  <label className="block text-sm font-medium mb-2">Focus Area (optional)</label>
                  <textarea
                    value={studyModeFocus}
                    onChange={(e) => setStudyModeFocus(e.target.value)}
                    placeholder="e.g. focus on key definitions, formulas, or specific concepts..."
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[80px]"
                  />
                </div>

                {/* Generate Button */}
                <button
                  onClick={generateFlashcards}
                  disabled={generatingFlashcards}
                  className="w-full px-4 py-3 bg-muted text-foreground rounded-md hover:opacity-80 disabled:opacity-50 font-medium text-sm"
                >
                  {generatingFlashcards ? 'Generating...' : 'Generate Flashcards'}
                </button>
              </div>
            </div>
          );
        }

        const currentCard = flashcards[currentFlashcardIndex];
        return (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto sidebar-scrollbar">
              <div className="p-4 pb-0">
                <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
                  <div className="flex items-center gap-3">
                    {flashcardHistory.length > 0 && (
                      <button
                        onClick={() => {
                          setSelectedFlashcardSetId(null);
                          setFlashcards([]);
                          setLoadedFlashcardSetId(null);
                          setCurrentFlashcardIndex(0);
                          setShowFlashcardAnswer(false);
                          setFlashcardChatNodes([]);
                          setFlashcardChatActiveNodeId(null);
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        ← Back
                      </button>
                    )}
                    <span>Flashcard {currentFlashcardIndex + 1} of {flashcards.length}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={generateFlashcards}
                      className="text-primary hover:underline"
                    >
                      Regenerate
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center gap-4 px-4">
                <div className="w-full max-w-3xl mx-auto space-y-4">
                  <div
                    className="relative w-full h-[300px] flex items-center justify-center p-8 bg-muted/30 rounded-2xl cursor-pointer border-2 border-border hover:border-primary transition-colors shadow-sm overflow-y-auto"
                    onClick={() => setShowFlashcardAnswer(!showFlashcardAnswer)}
                  >
                    <div className="text-center mx-auto max-w-full">
                      <div className="text-xl font-semibold mb-4 break-words">
                        <MarkdownRenderer content={showFlashcardAnswer ? currentCard.back : currentCard.front} />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Click to {showFlashcardAnswer ? 'hide' : 'reveal'} answer
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 w-full">
                    <button
                      onClick={() => {
                        setCurrentFlashcardIndex(Math.max(0, currentFlashcardIndex - 1));
                        setShowFlashcardAnswer(false);
                        // Keep flashcard chat when navigating - it's context-aware
                      }}
                      disabled={currentFlashcardIndex === 0}
                      className="flex-1 px-4 py-2 bg-background border border-border rounded-lg hover:bg-muted disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => {
                        setCurrentFlashcardIndex(Math.min(flashcards.length - 1, currentFlashcardIndex + 1));
                        setShowFlashcardAnswer(false);
                        // Keep flashcard chat when navigating - it's context-aware
                      }}
                      disabled={currentFlashcardIndex === flashcards.length - 1}
                      className="flex-1 px-4 py-2 bg-background border border-border rounded-lg hover:bg-muted disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                  
                  {/* Flashcard Chat Interface */}
                  <div className="w-full flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">Ask questions about this flashcard</p>
                    </div>
                    <div className="min-h-[200px] overflow-y-auto sidebar-scrollbar border border-border rounded-lg bg-background">
                      <ChatMessageList
                        messages={flashcardChatActiveBranch}
                        workspaceContext={buildWorkspaceContext(
                          activeInstance,
                          instances,
                          folders,
                          [],
                          {}
                        )}
                        onAddToChat={(text) => {
                          if (flashcardChatInputRef.current) {
                            flashcardChatInputRef.current.setContext(text);
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Chat Input - Full Width at Bottom */}
            <div className="flex-shrink-0">
              <ChatInput
                ref={flashcardChatInputRef}
                onSend={handleFlashcardChatMessage}
                loading={flashcardChatLoading}
                instances={instances}
                folders={folders}
              />
            </div>
          </div>
        );

      case 'quiz':
        if (generatingQuiz) {
          return (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-sm text-muted-foreground">{quizThinkingMessage || 'Thinking...'}</div>
              </div>
            </div>
          );
        }

        // Show history grid if no quiz is selected and history exists
        if (!selectedQuizId && quizHistory.length > 0 && quizQuestions.length === 0) {
          return (
            <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto sidebar-scrollbar">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Quiz History</h3>
                <button
                  onClick={generateQuiz}
                  disabled={generatingQuiz}
                  className="px-3 py-1.5 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/90 text-sm font-medium transition-colors"
                >
                  Generate New Quiz
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-1 gap-3">
                {quizHistory.map((quiz) => {
                  const percentage = quiz.stats.bestScore !== null ? Math.round(quiz.stats.bestScore) : 0;
                  const hasIncomplete = quiz.stats.hasIncompleteAttempt;
                  
                  return (
                    <div
                      key={quiz.id}
                      className="border border-border rounded-lg p-4 hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer bg-background"
                      onClick={async () => {
                        // Load this quiz
                        setSelectedQuizId(quiz.id);
                        setQuizQuestions(quiz.questions.map(q => ({
                          id: q.id,
                          question: q.question,
                          options: q.options,
                          correctIndex: q.correctOptionIndex,
                          optionExplanations: q.optionExplanations
                        })));
                        setQuizId(quiz.id);
                        
                        // Check for incomplete attempt
                        if (hasIncomplete && quiz.stats.incompleteAttemptId) {
                          setCurrentQuizAttemptId(quiz.stats.incompleteAttemptId);
                          const savedIndex = quiz.stats.currentQuestionIndex || 0;
                          setCurrentQuizIndex(savedIndex);
                          setUserAnswers(new Array(quiz.questions.length).fill(null));
                          setQuizCompleted(false);
                          setSelectedAnswer(null);
                        } else {
                          // Start fresh
                          setCurrentQuizIndex(0);
                          setSelectedAnswer(null);
                          setUserAnswers(new Array(quiz.questions.length).fill(null));
                          setQuizCompleted(false);
                          setCurrentQuizAttemptId(null);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm mb-1">
                            {quiz.title || `Quiz ${quiz.studyMaterial?.version || ''}`}
                          </h4>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span>{new Date(quiz.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="px-2 py-1 bg-primary/10 text-primary rounded text-xs font-medium">
                          {quiz.questionCount} Q's
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Attempts: {quiz.stats.completedAttempts}/{quiz.stats.totalAttempts}</span>
                          {quiz.stats.bestScore !== null && (
                            <div className="flex items-center gap-1">
                              <Trophy className="h-3 w-3 text-yellow-500" />
                              <span className="font-medium">{percentage}%</span>
                            </div>
                          )}
                        </div>

                        {quiz.stats.bestScore !== null && (
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        )}

                        <button
                          className={`w-full px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            hasIncomplete
                              ? 'bg-orange-500 text-white hover:bg-orange-600'
                              : 'bg-primary/10 text-primary hover:bg-primary/20'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Handle will be done by parent div
                          }}
                        >
                          {hasIncomplete ? '▶ Resume' : 'Retake'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        if (quizQuestions.length === 0) {
          return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
              <div className="text-center">
                <FileQuestion className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="text-lg font-semibold mb-2">Generate Quiz</h3>
              </div>

              <div className="w-full max-w-md space-y-4">
                {/* Focus Area Input */}
                <div>
                  <label className="block text-sm font-medium mb-2">Focus Area (optional)</label>
                  <textarea
                    value={studyModeFocus}
                    onChange={(e) => setStudyModeFocus(e.target.value)}
                    placeholder="e.g. focus on key definitions, formulas, or specific concepts..."
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[80px]"
                  />
                </div>

                {/* Generate Button */}
                <button
                  onClick={generateQuiz}
                  disabled={generatingQuiz}
                  className="w-full px-4 py-3 bg-muted text-foreground rounded-md hover:opacity-80 disabled:opacity-50 font-medium text-sm"
                >
                  {generatingQuiz ? 'Generating...' : 'Generate Quiz'}
                </button>
              </div>
            </div>
          );
        }

        // Calculate score
        const score = userAnswers.reduce((acc: number, answer, idx) => {
          if (answer === quizQuestions[idx]?.correctIndex) {
            return acc + 1;
          }
          return acc;
        }, 0);

        // Check if all questions answered
        const allAnswered = userAnswers.every(answer => answer !== null);

        // Show results screen if quiz completed
        if (quizCompleted) {
          const percentage = Math.round((score / quizQuestions.length) * 100);
          const passed = percentage >= 70;

          return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
              <div className="text-center">
                <div className={`text-6xl font-bold mb-2 ${passed ? 'text-green-500' : 'text-orange-500'}`}>
                  {percentage}%
                </div>
                <p className="text-2xl font-semibold mb-2">
                  {passed ? 'Great Job!' : 'Keep Practicing!'}
                </p>
                <p className="text-muted-foreground">
                  You got {score} out of {quizQuestions.length} questions correct
                </p>
              </div>

              <div className="w-full max-w-md space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Correct Answers</span>
                  <span className="font-medium text-green-500">{score}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Incorrect Answers</span>
                  <span className="font-medium text-red-500">{quizQuestions.length - score}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden mt-4">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-1000"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setCurrentQuizIndex(0);
                    setSelectedAnswer(null);
                    setUserAnswers(new Array(quizQuestions.length).fill(null));
                    setQuizCompleted(false);
                  }}
                  className="px-6 py-2.5 bg-background border border-border rounded-lg hover:bg-muted font-medium transition-colors"
                >
                  Retake Quiz
                </button>
                <button
                  onClick={() => {
                    setQuizCompleted(false);
                    setCurrentQuizIndex(0);
                    setSelectedAnswer(userAnswers[0]);
                  }}
                  className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium transition-colors"
                >
                  Review Answers
                </button>
              </div>
            </div>
          );
        }

        const currentQuestion = quizQuestions[currentQuizIndex];
        const currentUserAnswer = userAnswers[currentQuizIndex];
        const isAnswered = currentUserAnswer !== null;

        return (
          <div className="flex-1 flex flex-col p-4 gap-3 overflow-y-auto sidebar-scrollbar text-sm">
            {/* Header with score and progress */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {quizHistory.length > 0 && (
                  <button
                    onClick={() => {
                      setSelectedQuizId(null);
                      setQuizQuestions([]);
                      setQuizId(null);
                      setCurrentQuizIndex(0);
                      setUserAnswers([]);
                      setQuizCompleted(false);
                      setCurrentQuizAttemptId(null);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    ← Back
                  </button>
                )}
                <div className="text-sm font-medium">
                  <span className="text-muted-foreground">Question </span>
                  <span className="text-primary">{currentQuizIndex + 1}</span>
                  <span className="text-muted-foreground"> / {quizQuestions.length}</span>
                </div>
                <div className="px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium">
                  Score: {score}/{quizQuestions.length}
                </div>
              </div>
              <button
                onClick={generateQuiz}
                className="text-xs text-primary hover:underline"
              >
                New Quiz
              </button>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${((currentQuizIndex + 1) / quizQuestions.length) * 100}%` }}
              />
            </div>

            {/* Question card */}
            <div className="flex-1 flex flex-col gap-3">
              <div className="bg-gradient-to-br from-primary/5 to-primary/10 p-4 rounded-lg border border-primary/20">
                <div className="text-sm font-medium leading-relaxed">
                  <MarkdownRenderer content={currentQuestion.question} />
                </div>
              </div>

              {/* Answer options */}
              <div className="space-y-2">
                {currentQuestion.options.map((option, idx) => {
                  const isSelected = currentUserAnswer === idx;
                  const isCorrect = idx === currentQuestion.correctIndex;
                  const showResult = isAnswered;
                  const explanation = currentQuestion.optionExplanations?.[idx];
                  // Show explanation for selected option, OR for correct option if user was wrong
                  const showExplanation = showResult && (isSelected || (isCorrect && currentUserAnswer !== currentQuestion.correctIndex));

                  let className = 'w-full text-left p-3 rounded-lg border-2 transition-all text-sm ';
                  let icon = '';

                  if (showResult) {
                    if (isCorrect) {
                      className += 'border-[#D9F4E4] bg-[#D9F4E4] text-green-900';
                      icon = '✓';
                    } else if (isSelected) {
                      className += 'border-[#F9A0A0] bg-[#F9A0A0] text-red-900';
                      icon = '✗';
                    } else {
                      className += 'border-border bg-background/50 opacity-60';
                    }
                  } else {
                    className += isSelected
                      ? 'border-primary bg-primary/10 shadow-sm scale-[1.01]'
                      : 'border-border bg-background hover:bg-muted hover:border-primary/50 hover:shadow-sm';
                  }

                  return (
                    <div key={idx} className="space-y-1.5">
                      <button
                        onClick={async () => {
                          if (!isAnswered) {
                            const newAnswers = [...userAnswers];
                            newAnswers[currentQuizIndex] = idx;
                            setUserAnswers(newAnswers);
                            setSelectedAnswer(idx);
                            
                            // Create attempt if it doesn't exist yet
                            let attemptId = currentQuizAttemptId;
                            if (!attemptId && quizId) {
                              try {
                                const newAttempt = await startQuizAttempt(quizId);
                                attemptId = newAttempt.id;
                                setCurrentQuizAttemptId(newAttempt.id);
                              } catch (error) {
                                console.error('Error creating quiz attempt:', error);
                              }
                            }
                            
                            // Save answer to database immediately
                            if (attemptId && quizQuestions[currentQuizIndex].id) {
                              try {
                                await submitQuizAnswer(
                                  attemptId,
                                  quizQuestions[currentQuizIndex].id!,
                                  idx
                                );
                              } catch (error) {
                                console.error('Error saving quiz answer:', error);
                              }
                            }
                          }
                        }}
                        disabled={isAnswered}
                        className={className}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${showResult
                              ? (isCorrect ? 'bg-green-600 text-white' : isSelected ? 'bg-red-600 text-white' : 'bg-muted text-muted-foreground')
                              : isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                            }`}>
                            {icon || String.fromCharCode(65 + idx)}
                          </div>
                          <div className="flex-1 text-left">
                            <MarkdownRenderer content={option} />
                          </div>
                        </div>
                      </button>
                      {/* Show explanation for selected option or correct option (if user was wrong) */}
                      {showExplanation && explanation && (
                        <div className={`ml-9 p-2.5 rounded-md text-xs ${
                          isCorrect
                            ? 'bg-green-50 text-green-800 border border-green-200'
                            : isSelected
                            ? 'bg-red-50 text-red-800 border border-red-200'
                            : 'bg-green-50 text-green-800 border border-green-200'
                        }`}>
                          <MarkdownRenderer content={explanation} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Feedback message */}
              {isAnswered && (
                <div className={`p-3 rounded-lg ${currentUserAnswer === currentQuestion.correctIndex
                    ? 'bg-[#D9F4E4] border border-green-300'
                    : 'bg-[#F9A0A0] border border-red-300'
                  }`}>
                  <p className={`text-sm font-medium ${currentUserAnswer === currentQuestion.correctIndex
                      ? 'text-green-900'
                      : 'text-red-900'
                    }`}>
                    {currentUserAnswer === currentQuestion.correctIndex
                      ? '🎉 Correct! Well done!'
                      : `The correct answer is: ${currentQuestion.options[currentQuestion.correctIndex]}`}
                  </p>
                </div>
              )}
            </div>

            {/* Navigation buttons */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={async () => {
                  const newIndex = Math.max(0, currentQuizIndex - 1);
                  setCurrentQuizIndex(newIndex);
                  setSelectedAnswer(userAnswers[newIndex]);
                  
                  // Update position in database
                  if (currentQuizAttemptId) {
                    try {
                      await updateQuizAttemptPosition(currentQuizAttemptId, newIndex);
                    } catch (error) {
                      console.error('Error updating quiz position:', error);
                    }
                  }
                }}
                disabled={currentQuizIndex === 0}
                className="flex-1 px-3 py-2 bg-background border-2 border-border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-all"
              >
                ← Previous
              </button>

              {currentQuizIndex < quizQuestions.length - 1 ? (
                <button
                  onClick={async () => {
                    const newIndex = currentQuizIndex + 1;
                    setCurrentQuizIndex(newIndex);
                    setSelectedAnswer(userAnswers[newIndex]);
                    
                    // Update position in database
                    if (currentQuizAttemptId) {
                      try {
                        await updateQuizAttemptPosition(currentQuizAttemptId, newIndex);
                      } catch (error) {
                        console.error('Error updating quiz position:', error);
                      }
                    }
                  }}
                  className="flex-1 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium transition-all shadow-sm"
                >
                  Next →
                </button>
              ) : (
                <button
                  onClick={async () => {
                    setQuizCompleted(true);
                    
                    // Complete the quiz attempt in database
                    if (currentQuizAttemptId) {
                      try {
                        await completeQuizAttempt(currentQuizAttemptId);
                      } catch (error) {
                        console.error('Error completing quiz attempt:', error);
                      }
                    }
                  }}
                  disabled={!allAnswered}
                  className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-all shadow-sm"
                >
                  {allAnswered ? 'Finish Quiz ✓' : 'Answer All Questions'}
                </button>
              )}
            </div>
          </div>
        );

      case 'summary':
        if (generatingSummary && !summary) {
          return (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-sm text-muted-foreground">{summaryThinkingMessage || 'Thinking...'}</div>
              </div>
            </div>
          );
        }

        if (!summary && !generatingSummary) {
          return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
              <div className="text-center">
                <FileText className="h-12 w-12 mx-auto mb-4 text-primary" />
                <h3 className="text-lg font-semibold mb-2">Generate Summary</h3>
              </div>

              <div className="w-full max-w-md space-y-4">
                {/* Focus Area Input */}
                <div>
                  <label className="block text-sm font-medium mb-2">Focus Area (optional)</label>
                  <textarea
                    value={studyModeFocus}
                    onChange={(e) => setStudyModeFocus(e.target.value)}
                    placeholder="e.g. focus on key definitions, formulas, or specific concepts..."
                    className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[80px]"
                  />
                </div>

                {/* Generate Button */}
                <button
                  onClick={generateSummary}
                  disabled={generatingSummary}
                  className="w-full px-4 py-3 bg-muted text-foreground rounded-md hover:opacity-80 disabled:opacity-50 font-medium text-sm"
                >
                  {generatingSummary ? 'Generating...' : 'Generate Summary'}
                </button>
              </div>
            </div>
          );
        }

        return (
          <div className="flex-1 flex flex-col p-4 gap-3 overflow-hidden">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Document Summary</h3>
              <button
                onClick={generateSummary}
                className="text-xs text-primary hover:underline"
              >
                Regenerate
              </button>
            </div>
            <div 
              ref={summaryContainerRef}
              className="flex-1 prose prose-sm max-w-none dark:prose-invert overflow-y-auto sidebar-scrollbar" 
              data-summary-content="true"
            >
              <MarkdownRenderer content={summary} />
            </div>
          </div>
        );

      case 'podcast':
        return (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center">
              <Podcast className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">Podcast Coming Soon</h3>
              <p className="text-sm text-muted-foreground">
                AI-generated podcast summaries will be available in a future update.
              </p>
            </div>
          </div>
        );

      case 'mindmap':
        if (generatingMindMap) {
          return (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="h-12 w-12 animate-spin text-purple-500 mx-auto mb-4" />
                <div className="text-sm text-muted-foreground">{mindMapThinkingMessage || 'Generating mind map...'}</div>
              </div>
            </div>
          );
        }

        if (!mindMap) {
          return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
              <div className="text-center">
                <Network className="h-12 w-12 mx-auto mb-4 text-purple-500" />
                <h3 className="text-lg font-semibold mb-2">Generate Mind Map</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Create an interactive concept map to visualize key ideas and their relationships
                </p>
              </div>

              <div className="w-full max-w-md space-y-4">
                {/* Scope Type Selection */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setMindMapScopeType('full')}
                    className={`flex-1 px-4 py-2.5 rounded-lg border-2 transition-all text-sm font-medium ${
                      mindMapScopeType === 'full'
                        ? 'bg-purple-500/10 text-purple-600 border-purple-500 shadow-sm'
                        : 'bg-background border-border text-foreground hover:border-primary/50 hover:bg-muted/50'
                    }`}
                  >
                    Full Document
                  </button>
                  <button
                    onClick={() => setMindMapScopeType('custom')}
                    className={`flex-1 px-4 py-2.5 rounded-lg border-2 transition-all text-sm font-medium ${
                      mindMapScopeType === 'custom'
                        ? 'bg-purple-500/10 text-purple-600 border-purple-500 shadow-sm'
                        : 'bg-background border-border text-foreground hover:border-primary/50 hover:bg-muted/50'
                    }`}
                  >
                    Custom Scope
                  </button>
                </div>

                {/* Focus Area Input (only for custom scope) */}
                {mindMapScopeType === 'custom' && (
                  <div>
                    <label className="block text-sm font-medium mb-2">Focus Area</label>
                    <textarea
                      value={studyModeFocus}
                      onChange={(e) => setStudyModeFocus(e.target.value)}
                      placeholder="e.g., 'Chapter 3' or 'Recursion concepts'"
                      className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500/50 min-h-[80px]"
                    />
                  </div>
                )}

                {/* Generate Button */}
                <button
                  onClick={generateMindMap}
                  disabled={generatingMindMap}
                  className="w-full px-4 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none font-medium transition-all"
                >
                  {generatingMindMap ? 'Generating...' : 'Generate Mind Map'}
                </button>
              </div>
            </div>
          );
        }

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Header with info and regenerate button */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-3">
                <Network className="h-5 w-5 text-purple-500" />
                <div>
                  <h3 className="font-semibold text-sm">{mindMap.title || 'Concept Map'}</h3>
                  <p className="text-xs text-muted-foreground">
                    {mindMap.nodeCount} nodes · {mindMap.edgeCount} connections
                  </p>
                </div>
              </div>

              <button
                onClick={generateMindMap}
                className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted/50 transition-colors flex items-center gap-2"
              >
                <RotateCw className="h-3.5 w-3.5" />
                Regenerate
              </button>
            </div>

            {/* Mind Map Viewer */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <MindMapViewer
                mindMap={mindMap}
                onAskAboutNode={(nodeId, label, description) => {
                  // Switch to chat mode and add context
                  setStudyMode('chat');
                  // Add the node info as context for the chat
                  const contextMessage = `Tell me more about: **${label}**${description ? `\n\nContext: ${description}` : ''
                    }`;
                  // Set in chat input if available
                  if (chatInputRef.current) {
                    chatInputRef.current.setMessage(contextMessage);
                  }
                }}
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with Study Mode Tabs */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center rounded-lg border border-border bg-background px-2 py-1">
          {/* Scrollable Tabs Section */}
          <div className="flex items-center gap-2 flex-1 overflow-x-auto scrollbar-hide-show">
            {[
              { id: 'chat' as StudyMode, label: 'Chat', icon: MessageSquare },
              { id: 'flashcards' as StudyMode, label: 'Flashcards', icon: BookOpen },
              { id: 'quiz' as StudyMode, label: 'Quiz', icon: FileQuestion },
              { id: 'summary' as StudyMode, label: 'Summary', icon: FileText },
              { id: 'mindmap' as StudyMode, label: 'Mind Map', icon: Network },
              { id: 'podcast' as StudyMode, label: 'Podcast', icon: Podcast },
            ].map(({ id, label, icon: Icon }) => {
              const active = studyMode === id;
              return (
                <button
                  key={id}
                  onClick={() => setStudyMode(id)}
                  className={`
                    flex-shrink-0 group rounded-[0.75rem] h-8 px-3 text-sm transition-all
                    focus-visible:outline-none focus-visible:ring-2
                    ${active 
                      ? 'bg-muted text-foreground focus-visible:ring-primary/60' 
                      : 'text-muted-foreground hover:bg-muted focus-visible:ring-primary/30'
                    }
                  `}
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

      {/* Content Area */}
      {renderContent()}

      {/* Summary Text Selection Popup */}
      {showSummaryPopup && (
        <div
          className="fixed z-50 px-3 py-2 border rounded-lg shadow-lg animate-in fade-in zoom-in-95 bg-muted"
          style={{
            left: `${summaryPopupPosition.x}px`,
            top: `${summaryPopupPosition.y}px`,
            transform: 'translate(-50%, -100%)',
            borderRadius: '0.85rem',
            borderColor: 'var(--border)',
          }}
        >
          <button
            onClick={handleAddSummaryToChat}
            className="flex items-center gap-2 text-sm font-medium text-foreground hover:opacity-80 transition-opacity"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            Ask Mimir
          </button>
        </div>
      )}
    </div>
  );
});

PDFStudyPanel.displayName = 'PDFStudyPanel';
