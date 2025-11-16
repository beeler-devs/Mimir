'use client';

import React, { useState, useEffect, RefObject } from 'react';
import { ChatNode, AnimationSuggestion, WorkspaceInstance, Folder, LearningMode, PdfAttachment } from '@/lib/types';
import { addMessage, getActiveBranch, buildBranchPath } from '@/lib/chatState';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput, ChatInputRef } from './ChatInput';
import { VoiceButton } from './VoiceButton';
import { ChatTabBar } from './ChatTabBar';
import { PanelsLeftRight, MessageSquare, BookOpen, FileQuestion, FileText, Podcast } from 'lucide-react';
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

type StudyMode = 'chat' | 'flashcards' | 'quiz' | 'summary' | 'podcast';

interface PDFStudyPanelProps {
  collapseSidebar?: () => void;
  activeInstance?: WorkspaceInstance | null;
  instances?: WorkspaceInstance[];
  folders?: Folder[];
  pendingChatText?: string | null;
  onChatTextAdded?: () => void;
  getCurrentPageImage?: () => Promise<string | null>;
}

export interface PDFStudyPanelRef {
  addToChat: (message: string) => void;
  createNewChat: () => Promise<void>;
}

/**
 * PDF Study Tools Panel
 * Provides chat, flashcards, quizzes, summary, and podcast features for PDF viewing
 */
export const PDFStudyPanel = React.forwardRef<PDFStudyPanelRef, PDFStudyPanelProps>(({
  collapseSidebar,
  activeInstance = null,
  instances = [],
  folders = [],
  pendingChatText,
  onChatTextAdded,
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
  const [quizQuestions, setQuizQuestions] = useState<{ question: string; options: string[]; correctIndex: number }[]>([]);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [userAnswers, setUserAnswers] = useState<(number | null)[]>([]);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [summary, setSummary] = useState<string>('');
  const [generatingFlashcards, setGeneratingFlashcards] = useState(false);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  const chatInputRef = React.useRef<ChatInputRef>(null);
  const activeBranch = activeNodeId ? getActiveBranch(nodes, activeNodeId) : [];

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
          handleNewChat();
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

  // Get full PDF text for context
  const getPDFContext = (): string => {
    if (activeInstance?.type === 'pdf' && activeInstance.data.fullText) {
      return activeInstance.data.fullText;
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

      // Add PDF full text to context
      const pdfContext = getPDFContext();
      if (pdfContext) {
        workspaceContext.pdfContext = pdfContext;
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
    try {
      const pdfContext = getPDFContext();
      const backendUrl = process.env.NEXT_PUBLIC_MANIM_WORKER_URL || process.env.MANIM_WORKER_URL || 'http://localhost:8001';

      const response = await fetch(`${backendUrl}/study-tools/flashcards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfText: pdfContext }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate flashcards');
      }

      const data = await response.json();
      setFlashcards(data.flashcards || []);
      setCurrentFlashcardIndex(0);
      setShowFlashcardAnswer(false);
    } catch (error) {
      console.error('Error generating flashcards:', error);
    } finally {
      setGeneratingFlashcards(false);
    }
  };

  const generateQuiz = async () => {
    setGeneratingQuiz(true);
    try {
      const pdfContext = getPDFContext();
      const backendUrl = process.env.NEXT_PUBLIC_MANIM_WORKER_URL || process.env.MANIM_WORKER_URL || 'http://localhost:8001';

      const response = await fetch(`${backendUrl}/study-tools/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfText: pdfContext }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate quiz');
      }

      const data = await response.json();
      const questions = data.questions || [];
      setQuizQuestions(questions);
      setCurrentQuizIndex(0);
      setSelectedAnswer(null);
      setUserAnswers(new Array(questions.length).fill(null));
      setQuizCompleted(false);
    } catch (error) {
      console.error('Error generating quiz:', error);
    } finally {
      setGeneratingQuiz(false);
    }
  };

  const generateSummary = async () => {
    setGeneratingSummary(true);
    try {
      const pdfContext = getPDFContext();
      const backendUrl = process.env.NEXT_PUBLIC_MANIM_WORKER_URL || process.env.MANIM_WORKER_URL || 'http://localhost:8001';

      const response = await fetch(`${backendUrl}/study-tools/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfText: pdfContext }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate summary');
      }

      const data = await response.json();
      setSummary(data.summary || '');
    } catch (error) {
      console.error('Error generating summary:', error);
    } finally {
      setGeneratingSummary(false);
    }
  };

  // Load study tools when mode changes
  useEffect(() => {
    if (studyMode === 'flashcards' && flashcards.length === 0) {
      generateFlashcards();
    } else if (studyMode === 'quiz' && quizQuestions.length === 0) {
      generateQuiz();
    } else if (studyMode === 'summary' && !summary) {
      generateSummary();
    }
  }, [studyMode]);

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
            />
          </>
        );

      case 'flashcards':
        if (generatingFlashcards) {
          return (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4 mx-auto" />
                <p className="text-sm text-muted-foreground">Generating flashcards...</p>
              </div>
            </div>
          );
        }

        if (flashcards.length === 0) {
          return (
            <div className="flex-1 flex items-center justify-center p-4">
              <p className="text-sm text-muted-foreground">No flashcards available</p>
            </div>
          );
        }

        const currentCard = flashcards[currentFlashcardIndex];
        return (
          <div className="flex-1 flex flex-col p-4 gap-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Flashcard {currentFlashcardIndex + 1} of {flashcards.length}</span>
              <button
                onClick={generateFlashcards}
                className="text-primary hover:underline"
              >
                Regenerate
              </button>
            </div>
            <div
              className="flex-1 flex items-center justify-center p-8 bg-muted/30 rounded-lg cursor-pointer border-2 border-border hover:border-primary transition-colors"
              onClick={() => setShowFlashcardAnswer(!showFlashcardAnswer)}
            >
              <div className="text-center">
                <p className="text-lg font-medium mb-4">
                  {showFlashcardAnswer ? currentCard.back : currentCard.front}
                </p>
                <p className="text-sm text-muted-foreground">
                  Click to {showFlashcardAnswer ? 'hide' : 'reveal'} answer
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setCurrentFlashcardIndex(Math.max(0, currentFlashcardIndex - 1));
                  setShowFlashcardAnswer(false);
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
                }}
                disabled={currentFlashcardIndex === flashcards.length - 1}
                className="flex-1 px-4 py-2 bg-background border border-border rounded-lg hover:bg-muted disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        );

      case 'quiz':
        if (generatingQuiz) {
          return (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4 mx-auto" />
                <p className="text-sm text-muted-foreground">Generating quiz...</p>
              </div>
            </div>
          );
        }

        if (quizQuestions.length === 0) {
          return (
            <div className="flex-1 flex items-center justify-center p-4">
              <p className="text-sm text-muted-foreground">No quiz questions available</p>
            </div>
          );
        }

        // Calculate score
        const score = userAnswers.reduce((acc, answer, idx) => {
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
          <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
            {/* Header with score and progress */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="text-sm font-medium">
                  <span className="text-muted-foreground">Question </span>
                  <span className="text-primary">{currentQuizIndex + 1}</span>
                  <span className="text-muted-foreground"> / {quizQuestions.length}</span>
                </div>
                <div className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
                  Score: {score}/{quizQuestions.length}
                </div>
              </div>
              <button
                onClick={generateQuiz}
                className="text-sm text-primary hover:underline"
              >
                New Quiz
              </button>
            </div>

            {/* Progress bar */}
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${((currentQuizIndex + 1) / quizQuestions.length) * 100}%` }}
              />
            </div>

            {/* Question card */}
            <div className="flex-1 flex flex-col gap-4">
              <div className="bg-gradient-to-br from-primary/5 to-primary/10 p-6 rounded-xl border border-primary/20">
                <p className="text-lg font-semibold leading-relaxed">{currentQuestion.question}</p>
              </div>

              {/* Answer options */}
              <div className="space-y-3">
                {currentQuestion.options.map((option, idx) => {
                  const isSelected = currentUserAnswer === idx;
                  const isCorrect = idx === currentQuestion.correctIndex;
                  const showResult = isAnswered;

                  let className = 'w-full text-left p-4 rounded-xl border-2 transition-all font-medium ';
                  let icon = '';

                  if (showResult) {
                    if (isCorrect) {
                      className += 'border-green-500 bg-green-50 dark:bg-green-950/30 text-green-900 dark:text-green-100';
                      icon = '✓';
                    } else if (isSelected) {
                      className += 'border-red-500 bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-100';
                      icon = '✗';
                    } else {
                      className += 'border-border bg-background/50 opacity-60';
                    }
                  } else {
                    className += isSelected
                      ? 'border-primary bg-primary/10 shadow-sm scale-[1.02]'
                      : 'border-border bg-background hover:bg-muted hover:border-primary/50 hover:shadow-sm';
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        if (!isAnswered) {
                          const newAnswers = [...userAnswers];
                          newAnswers[currentQuizIndex] = idx;
                          setUserAnswers(newAnswers);
                          setSelectedAnswer(idx);
                        }
                      }}
                      disabled={isAnswered}
                      className={className}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                          showResult
                            ? (isCorrect ? 'bg-green-500 text-white' : isSelected ? 'bg-red-500 text-white' : 'bg-muted text-muted-foreground')
                            : isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        }`}>
                          {icon || String.fromCharCode(65 + idx)}
                        </div>
                        <span className="flex-1">{option}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Feedback message */}
              {isAnswered && (
                <div className={`p-4 rounded-lg ${
                  currentUserAnswer === currentQuestion.correctIndex
                    ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800'
                    : 'bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800'
                }`}>
                  <p className={`text-sm font-medium ${
                    currentUserAnswer === currentQuestion.correctIndex
                      ? 'text-green-900 dark:text-green-100'
                      : 'text-orange-900 dark:text-orange-100'
                  }`}>
                    {currentUserAnswer === currentQuestion.correctIndex
                      ? '🎉 Correct! Well done!'
                      : `The correct answer is: ${currentQuestion.options[currentQuestion.correctIndex]}`}
                  </p>
                </div>
              )}
            </div>

            {/* Navigation buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setCurrentQuizIndex(Math.max(0, currentQuizIndex - 1));
                  setSelectedAnswer(userAnswers[currentQuizIndex - 1]);
                }}
                disabled={currentQuizIndex === 0}
                className="flex-1 px-4 py-3 bg-background border-2 border-border rounded-xl hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all"
              >
                ← Previous
              </button>

              {currentQuizIndex < quizQuestions.length - 1 ? (
                <button
                  onClick={() => {
                    setCurrentQuizIndex(currentQuizIndex + 1);
                    setSelectedAnswer(userAnswers[currentQuizIndex + 1]);
                  }}
                  className="flex-1 px-4 py-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 font-medium transition-all shadow-sm"
                >
                  Next →
                </button>
              ) : (
                <button
                  onClick={() => setQuizCompleted(true)}
                  disabled={!allAnswered}
                  className="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all shadow-sm"
                >
                  {allAnswered ? 'Finish Quiz ✓' : 'Answer All Questions'}
                </button>
              )}
            </div>
          </div>
        );

      case 'summary':
        if (generatingSummary) {
          return (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4 mx-auto" />
                <p className="text-sm text-muted-foreground">Generating summary...</p>
              </div>
            </div>
          );
        }

        return (
          <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Document Summary</h3>
              <button
                onClick={generateSummary}
                className="text-sm text-primary hover:underline"
              >
                Regenerate
              </button>
            </div>
            <div className="flex-1 bg-muted/30 p-4 rounded-lg">
              <p className="text-sm whitespace-pre-wrap">{summary || 'No summary available'}</p>
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

      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with Study Mode Tabs */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1 overflow-x-auto">
          {[
            { id: 'chat' as StudyMode, label: 'Chat', icon: MessageSquare },
            { id: 'flashcards' as StudyMode, label: 'Flashcards', icon: BookOpen },
            { id: 'quiz' as StudyMode, label: 'Quiz', icon: FileQuestion },
            { id: 'summary' as StudyMode, label: 'Summary', icon: FileText },
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

          {studyMode === 'chat' && <VoiceButton size="sm" className="shrink-0 ml-auto" />}

          {collapseSidebar && (
            <button
              onClick={collapseSidebar}
              className="h-8 w-8 rounded-lg hover:bg-muted/40 transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0 ml-auto"
              aria-label="Collapse panel"
            >
              <PanelsLeftRight className="h-4 w-4" />
            </button>
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
    </div>
  );
});

PDFStudyPanel.displayName = 'PDFStudyPanel';
