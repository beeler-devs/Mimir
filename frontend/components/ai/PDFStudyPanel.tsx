'use client';

import React, { useState, useEffect, RefObject, useCallback } from 'react';
import { ChatNode, AnimationSuggestion, WorkspaceInstance, Folder, LearningMode, PdfAttachment } from '@/lib/types';
import { addMessage, getActiveBranch, buildBranchPath } from '@/lib/chatState';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput, ChatInputRef } from './ChatInput';
import { VoiceButton } from './VoiceButton';
import { PanelsLeftRight, MessageSquare, BookOpen, FileQuestion, FileText, Podcast, MessageSquarePlus } from 'lucide-react';
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer';
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

type StudyMode = 'chat' | 'flashcards' | 'quiz' | 'summary' | 'podcast';

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

const buildHintFromCard = (front: string, back: string) => {
  const fallback = 'Think about the key concept the question is pointing to, not the exact wording.';
  if (!back) return fallback;

  const sentences = back.split(/[.!?]/).map(s => s.trim()).filter(Boolean);
  const source = sentences[0] || back;
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 0) return fallback;

  const visibleCount = Math.max(4, Math.ceil(words.length * 0.35));
  const hintSnippet = words.slice(0, visibleCount).join(' ');
  return `Hint: it involves ${hintSnippet}... Reflect on how that connects to "${front}".`;
};

/**
 * PDF Study Tools Panel
 * Provides chat, flashcards, quizzes, summary, and podcast features for PDF viewing
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
  const [flashcardHint, setFlashcardHint] = useState<string>('');
  const [hintLoading, setHintLoading] = useState(false);

  // Text selection state for summary
  const [selectedSummaryText, setSelectedSummaryText] = useState<string>('');
  const [showSummaryPopup, setShowSummaryPopup] = useState(false);
  const [summaryPopupPosition, setSummaryPopupPosition] = useState({ x: 0, y: 0 });

  const chatInputRef = React.useRef<ChatInputRef>(null);
  const activeBranch = activeNodeId ? getActiveBranch(nodes, activeNodeId) : [];
  const flashcardThinkingMessage = useThinkingMessage(generatingFlashcards);
  const quizThinkingMessage = useThinkingMessage(generatingQuiz);
  const summaryThinkingMessage = useThinkingMessage(generatingSummary);

  // Expose methods via ref
  React.useImperativeHandle(ref, () => ({
    addToChat: (message: string) => {
      if (chatInputRef.current) {
        chatInputRef.current.setContext(message);
        setStudyMode('chat'); // Switch to chat view
      }
    },
    createNewChat: async () => {
      try {
        // Create a new chat
        const newChat = await createChat();

        // Clear current messages and switch to new chat
        setNodes([]);
        setActiveNodeId(null);
        setChatId(newChat.id);
        localStorage.setItem('mimir.activeChatId', newChat.id);
        setStudyMode('chat'); // Switch to chat view

        // Reload chats list to include the new chat
        const userChats = await loadUserChats();
        setChats(userChats);
      } catch (error) {
        console.error('Failed to create new chat:', error);
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

  const generateFlashcards = async () => {
    setGeneratingFlashcards(true);
    setFlashcardHint('');
    try {
      const pdfContext = getPDFContext();
      
      if (!pdfContext || pdfContext.trim().length === 0) {
        alert('No PDF content available. Please open a PDF document first.');
        return;
      }

      const backendUrl = process.env.NEXT_PUBLIC_MANIM_WORKER_URL || process.env.MANIM_WORKER_URL || 'http://localhost:8001';

      const response = await fetch(`${backendUrl}/study-tools/flashcards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfText: pdfContext }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to generate flashcards');
      }

      const data = await response.json();
      setFlashcards(data.flashcards || []);
      setCurrentFlashcardIndex(0);
      setShowFlashcardAnswer(false);
    } catch (error) {
      console.error('Error generating flashcards:', error);
      alert(error instanceof Error ? error.message : 'Failed to generate flashcards. Please ensure the backend server is running.');
    } finally {
      setGeneratingFlashcards(false);
    }
  };

  const handleAskFlashcardHint = () => {
    if (!flashcards.length) return;
    setHintLoading(true);
    try {
      const currentCard = flashcards[currentFlashcardIndex];
      const hint = buildHintFromCard(currentCard.front, currentCard.back);
      setFlashcardHint(hint);
      setShowFlashcardAnswer(false);
    } finally {
      setHintLoading(false);
    }
  };

  const generateQuiz = async () => {
    setGeneratingQuiz(true);
    try {
      const pdfContext = getPDFContext();
      
      if (!pdfContext || pdfContext.trim().length === 0) {
        alert('No PDF content available. Please open a PDF document first.');
        return;
      }

      const backendUrl = process.env.NEXT_PUBLIC_MANIM_WORKER_URL || process.env.MANIM_WORKER_URL || 'http://localhost:8001';

      const response = await fetch(`${backendUrl}/study-tools/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfText: pdfContext }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to generate quiz');
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
      alert(error instanceof Error ? error.message : 'Failed to generate quiz. Please ensure the backend server is running.');
    } finally {
      setGeneratingQuiz(false);
    }
  };

  const generateSummary = async () => {
    setGeneratingSummary(true);
    setSummary(''); // Clear previous summary
    try {
      const pdfContext = getPDFContext();
      
      if (!pdfContext || pdfContext.trim().length === 0) {
        alert('No PDF content available. Please open a PDF document first.');
        return;
      }

      const backendUrl = process.env.NEXT_PUBLIC_MANIM_WORKER_URL || process.env.MANIM_WORKER_URL || 'http://localhost:8001';

      const response = await fetch(`${backendUrl}/study-tools/summary/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfText: pdfContext }),
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
    } catch (error) {
      console.error('Error generating summary:', error);
      alert(error instanceof Error ? error.message : 'Failed to generate summary. Please ensure the backend server is running.');
      setSummary('');
    } finally {
      setGeneratingSummary(false);
    }
  };

  // Remove automatic generation - user should click generate button instead

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

        if (flashcards.length === 0) {
          return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
              <BookOpen className="w-16 h-16 text-muted-foreground" />
              <button
                onClick={generateFlashcards}
                className="px-4 py-2 bg-[#F5F5F5] text-foreground rounded-lg hover:opacity-80 text-sm font-medium transition-all"
              >
                Generate Flashcards
              </button>
            </div>
          );
        }

        const currentCard = flashcards[currentFlashcardIndex];
        return (
          <div className="flex-1 flex flex-col p-4 gap-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Flashcard {currentFlashcardIndex + 1} of {flashcards.length}</span>
              <div className="flex items-center gap-4">
                <button
                  onClick={generateFlashcards}
                  className="text-primary hover:underline"
                >
                  Regenerate
                </button>
              </div>
            </div>
            <div className="flex flex-col items-center gap-4 flex-1">
              <div
                className="relative w-full max-w-4xl aspect-[16/9] flex items-center justify-center p-8 bg-muted/30 rounded-2xl cursor-pointer border-2 border-border hover:border-primary transition-colors shadow-sm"
                onClick={() => setShowFlashcardAnswer(!showFlashcardAnswer)}
              >
                <div className="text-center mx-auto max-w-3xl">
                  <p className="text-xl font-semibold mb-4">
                    {showFlashcardAnswer ? currentCard.back : currentCard.front}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Click to {showFlashcardAnswer ? 'hide' : 'reveal'} answer
                  </p>
                </div>
              </div>
              <div className="flex gap-2 w-full max-w-3xl">
                <button
                  onClick={() => {
                    setCurrentFlashcardIndex(Math.max(0, currentFlashcardIndex - 1));
                    setShowFlashcardAnswer(false);
                    setFlashcardHint('');
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
                    setFlashcardHint('');
                  }}
                  disabled={currentFlashcardIndex === flashcards.length - 1}
                  className="flex-1 px-4 py-2 bg-background border border-border rounded-lg hover:bg-muted disabled:opacity-50"
                >
                  Next
                </button>
              </div>
              <div className="w-full max-w-3xl border-t border-border pt-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Need a nudge? Ask for a hint without revealing the answer.</p>
                  <button
                    onClick={handleAskFlashcardHint}
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium transition-colors disabled:opacity-60"
                    disabled={hintLoading}
                  >
                    {hintLoading ? 'Thinking...' : 'Ask AI for a hint'}
                  </button>
                </div>
                {flashcardHint && (
                  <div className="p-3 bg-muted/40 border border-border rounded-lg text-sm text-muted-foreground">
                    {flashcardHint}
                  </div>
                )}
              </div>
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

        if (quizQuestions.length === 0) {
          return (
            <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
              <FileQuestion className="w-16 h-16 text-muted-foreground" />
              <button
                onClick={generateQuiz}
                className="px-4 py-2 bg-[#F5F5F5] text-foreground rounded-lg hover:opacity-80 text-sm font-medium transition-all"
              >
                Generate Quiz
              </button>
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
          <div className="flex-1 flex flex-col p-4 gap-3 overflow-y-auto text-sm">
            {/* Header with score and progress */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
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
                <p className="text-sm font-medium leading-relaxed">{currentQuestion.question}</p>
              </div>

              {/* Answer options */}
              <div className="space-y-2">
                {currentQuestion.options.map((option, idx) => {
                  const isSelected = currentUserAnswer === idx;
                  const isCorrect = idx === currentQuestion.correctIndex;
                  const showResult = isAnswered;

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
                      <div className="flex items-center gap-2.5">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                          showResult
                            ? (isCorrect ? 'bg-green-600 text-white' : isSelected ? 'bg-red-600 text-white' : 'bg-muted text-muted-foreground')
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
                <div className={`p-3 rounded-lg ${
                  currentUserAnswer === currentQuestion.correctIndex
                    ? 'bg-[#D9F4E4] border border-green-300'
                    : 'bg-[#F9A0A0] border border-red-300'
                }`}>
                  <p className={`text-sm font-medium ${
                    currentUserAnswer === currentQuestion.correctIndex
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
                onClick={() => {
                  setCurrentQuizIndex(Math.max(0, currentQuizIndex - 1));
                  setSelectedAnswer(userAnswers[currentQuizIndex - 1]);
                }}
                disabled={currentQuizIndex === 0}
                className="flex-1 px-3 py-2 bg-background border-2 border-border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-all"
              >
                ← Previous
              </button>

              {currentQuizIndex < quizQuestions.length - 1 ? (
                <button
                  onClick={() => {
                    setCurrentQuizIndex(currentQuizIndex + 1);
                    setSelectedAnswer(userAnswers[currentQuizIndex + 1]);
                  }}
                  className="flex-1 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium transition-all shadow-sm"
                >
                  Next →
                </button>
              ) : (
                <button
                  onClick={() => setQuizCompleted(true)}
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
            <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
              <FileText className="w-16 h-16 text-muted-foreground" />
              <button
                onClick={generateSummary}
                className="px-4 py-2 bg-[#F5F5F5] text-foreground rounded-lg hover:opacity-80 text-sm font-medium transition-all"
              >
                Generate Summary
              </button>
            </div>
          );
        }

        return (
          <div className="flex-1 flex flex-col p-4 gap-3 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Document Summary</h3>
              <button
                onClick={generateSummary}
                className="text-xs text-primary hover:underline"
              >
                Regenerate
              </button>
            </div>
            <div className="flex-1 prose prose-sm max-w-none dark:prose-invert" data-summary-content="true">
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

      {/* Content Area */}
      {renderContent()}

      {/* Summary Text Selection Popup */}
      {showSummaryPopup && (
        <div
          className="fixed z-50 px-3 py-2 border rounded-lg shadow-lg animate-in fade-in zoom-in-95"
          style={{
            left: `${summaryPopupPosition.x}px`,
            top: `${summaryPopupPosition.y}px`,
            transform: 'translate(-50%, -100%)',
            backgroundColor: '#F5F5F5',
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
