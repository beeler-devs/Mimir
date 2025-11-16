/**
 * Core type definitions for Mimir
 */

// Animation types
export interface AnimationSuggestion {
  description: string;
  topic: string;
}

// Chat types
export interface ChatNode {
  id: string;
  parentId: string | null;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  suggestedAnimation?: AnimationSuggestion;
  attachments?: Attachment[];
  // Backwards compatibility - computed from attachments
  pdfAttachments?: PdfAttachment[];
}

export interface Chat {
  id: string;
  userId: string;
  rootMessageId: string;
  createdAt: string;
}

// Document types
export type DocumentType = 'text' | 'code' | 'pdf';

export interface Document {
  id: string;
  userId: string;
  type: DocumentType;
  storagePath: string | null;
  createdAt: string;
}

// Job types
export type JobType = 'manim' | 'pdf_export';
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  payload: Record<string, unknown>;
  resultUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// Learning Mode types
export type LearningMode = 'socratic' | 'direct' | 'guided' | 'exploratory' | 'conceptual';

export interface LearningModeConfig {
  id: LearningMode;
  name: string;
  description: string;
  systemPrompt: string;
}

// API types
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Mention types
export interface Mention {
  type: 'instance' | 'folder';
  id: string;
  name: string;
}

export interface MentionableItem {
  type: 'instance' | 'folder';
  id: string;
  name: string;
  icon?: string;
}

// Attachment types - unified for PDFs, images, and future types
export interface PdfAttachment {
  type: 'pdf';
  id: string;
  filename: string;
  url?: string;
  extractedText?: string;
  pageCount?: number;
  status: 'uploading' | 'ready' | 'error';
}

export interface ImageAttachment {
  type: 'image';
  id: string;
  filename: string;
  url: string;
  width?: number;
  height?: number;
  mimeType: string;
}

export type Attachment = PdfAttachment | ImageAttachment;

// Workspace context types
export interface WorkspaceContextInstance {
  id: string;
  title: string;
  type: InstanceType;
  folderId: string | null;
  content?: string; // For text instances
  code?: string; // For code instances
  language?: CodeLanguage; // For code instances
  fullText?: string; // For PDF and lecture instances
}

export interface WorkspaceContextFolder {
  id: string;
  name: string;
  parentFolderId: string | null;
}

export interface WorkspaceContext {
  instances: WorkspaceContextInstance[];
  folders: WorkspaceContextFolder[];
  annotationImages: Record<string, string>; // instanceId -> base64 PNG
  pdfAttachments?: PdfAttachment[]; // PDF files attached to chat (backwards compatibility)
  attachments?: Attachment[]; // Unified attachments array
  pdfContext?: string; // Full text of PDF for context
  currentPageImage?: string; // Base64 image of current PDF page
}

export interface ChatRequest {
  messages: ChatMessage[];
  branchPath: string[];
  workspaceContext?: WorkspaceContext;
  learningMode?: LearningMode;
}

export interface ChatResponse {
  message: ChatMessage;
  nodeId: string;
  suggestedAnimation?: AnimationSuggestion;
}

// Code editor types
export type CodeLanguage = 'python' | 'javascript' | 'typescript' | 'java' | 'cpp';

export interface CodeEditorState {
  language: CodeLanguage;
  code: string;
}

// Multi-file code editor types
export interface CodeFile {
  id: string;
  name: string;
  path: string;
  content: string;
  language: CodeLanguage;
}

export interface FileTreeNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  parentId: string | null;
  children?: FileTreeNode[];
  // For files only
  language?: CodeLanguage;
  path?: string;
}

export interface CodeExecutionResult {
  status: 'success' | 'error';
  output?: string;
  error?: string;
  executionTime?: number;
}

// Folder types
export interface Folder {
  id: string;
  userId: string;
  name: string;
  parentFolderId: string | null;
  createdAt: string;
  updatedAt: string;
}

// Workspace / instance types
export type InstanceType = 'text' | 'code' | 'annotate' | 'pdf' | 'lecture';

interface BaseInstance {
  id: string;
  title: string;
  folderId: string | null;
}

export interface TextInstance extends BaseInstance {
  type: 'text';
  data: {
    content: string;
  };
}

export interface CodeInstance extends BaseInstance {
  type: 'code';
  data: {
    files: CodeFile[];
    activeFilePath: string | null;
    openFiles: string[]; // Paths of files that are open in tabs
    fileTree: FileTreeNode[];
  };
}

export interface AnnotateInstance extends BaseInstance {
  type: 'annotate';
  data: {
    excalidrawState?: {
      elements: any[];
      appState: any;
      files: any;
    };
  };
}

export interface PDFInstance extends BaseInstance {
  type: 'pdf';
  data: {
    pdfUrl?: string;
    fileName?: string;
    fileSize?: number;
    pageCount?: number;
    summary?: string;
    storagePath?: string; // Path in Supabase Storage
    metadata?: {
      title?: string;
      author?: string;
      subject?: string;
      keywords?: string;
      creationDate?: string;
      modificationDate?: string;
    };
    fullText?: string; // Extracted text for search
  };
}

export type LectureSourceType = 'youtube' | 'recording' | 'slides' | 'upload' | 'slides-recording';

export interface LectureInstance extends BaseInstance {
  type: 'lecture';
  data: {
    sourceType?: LectureSourceType;
    // Video/YouTube
    videoUrl?: string;
    youtubeId?: string;
    // Transcript
    transcript?: string;
    transcriptSegments?: Array<{
      text: string;
      timestamp: number;
      duration?: number;
    }>;
    // Slides (PDF)
    slidesUrl?: string;
    slidesFileName?: string;
    slidesPageCount?: number;
    slidesFullText?: string;
    // Audio recording
    audioUrl?: string;
    audioDuration?: number;
    // General metadata
    fileName?: string;
    fileSize?: number;
    duration?: number; // in seconds
    summary?: string;
    metadata?: {
      title?: string;
      speaker?: string;
      date?: string;
      subject?: string;
      keywords?: string;
    };
    // Processing status
    processingStatus?: 'pending' | 'processing' | 'ready' | 'error';
    processingError?: string;
  };
}

export type WorkspaceInstance = TextInstance | CodeInstance | AnnotateInstance | PDFInstance | LectureInstance;

export type ThemePreference = 'light' | 'dark' | 'system';

// Manim types
export interface ManimRenderRequest {
  sceneCode: string;
  sceneClass: string;
  quality: 'low' | 'medium' | 'high';
}

export interface ManimRenderResponse {
  jobId: string;
  status: JobStatus;
  videoUrl?: string;
  error?: string;
}

// Study Materials types
export type StudyMaterialType = 'quiz' | 'flashcard_set' | 'summary';

export interface StudyMaterial {
  id: string;
  userId: string;
  instanceId: string;
  type: StudyMaterialType;
  version: number;
  generatedAt: string;
  sourceContentHash: string | null;
  metadata: Record<string, any> | null;
  isArchived: boolean;
}

// Summary types
export interface Summary {
  id: string;
  studyMaterialId: string;
  content: string;
  wordCount: number | null;
  createdAt: string;
}

export interface SummaryWithMaterial extends Summary {
  studyMaterial: StudyMaterial;
}

// Flashcard types
export interface FlashcardSet {
  id: string;
  studyMaterialId: string;
  title: string | null;
  description: string | null;
  cardCount: number;
  createdAt: string;
}

export interface Flashcard {
  id: string;
  flashcardSetId: string;
  front: string;
  back: string;
  position: number;
  difficultyRating: number | null;
  createdAt: string;
}

export interface FlashcardReview {
  id: string;
  flashcardId: string;
  userId: string;
  qualityRating: number; // 0-5: SM-2 algorithm
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReviewDate: string;
  reviewedAt: string;
}

export interface FlashcardSetWithCards extends FlashcardSet {
  flashcards: Flashcard[];
  studyMaterial?: StudyMaterial;
}

export interface FlashcardWithReviews extends Flashcard {
  reviews: FlashcardReview[];
  latestReview?: FlashcardReview;
}

// Quiz types
export interface Quiz {
  id: string;
  studyMaterialId: string;
  title: string | null;
  description: string | null;
  questionCount: number;
  timeLimitSeconds: number | null;
  passingScorePercent: number;
  createdAt: string;
}

export interface QuizQuestion {
  id: string;
  quizId: string;
  question: string;
  options: string[]; // JSONB array
  correctOptionIndex: number;
  explanation: string | null;
  position: number;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  createdAt: string;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  userId: string;
  startedAt: string;
  completedAt: string | null;
  score: number | null;
  totalQuestions: number | null;
  timeTakenSeconds: number | null;
  passed: boolean | null;
  attemptNumber: number;
}

export interface QuizAnswer {
  id: string;
  quizAttemptId: string;
  quizQuestionId: string;
  selectedOptionIndex: number;
  isCorrect: boolean;
  timeTakenSeconds: number | null;
  answeredAt: string;
}

export interface QuizWithQuestions extends Quiz {
  questions: QuizQuestion[];
  studyMaterial?: StudyMaterial;
}

export interface QuizAttemptWithAnswers extends QuizAttempt {
  answers: QuizAnswer[];
  quiz?: Quiz;
}

// Analytics types
export interface FlashcardStats {
  totalCards: number;
  reviewedCards: number;
  dueForReview: number;
  averageEaseFactor: number;
  masteredCards: number; // Cards with ease factor > 2.5
}

export interface QuizStats {
  totalAttempts: number;
  averageScore: number;
  bestScore: number;
  passRate: number;
  averageTimeSeconds: number;
  weakQuestions: Array<{
    questionId: string;
    question: string;
    incorrectCount: number;
  }>;
}

export interface StudyMaterialsOverview {
  instanceId: string;
  summaries: SummaryWithMaterial[];
  flashcardSets: FlashcardSetWithCards[];
  quizzes: QuizWithQuestions[];
}
