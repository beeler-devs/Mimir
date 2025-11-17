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
export type StudyMaterialType = 'quiz' | 'flashcard_set' | 'summary' | 'mind_map';

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
  mindMaps?: MindMapWithNodes[];
}

// Mind Map types
export interface MindMap {
  id: string;
  studyMaterialId: string;
  title: string | null;
  description: string | null;
  rootNodeId: string | null;
  layoutAlgorithm: 'dagre' | 'elk' | 'manual';
  nodeCount: number;
  edgeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MindMapNode {
  id: string;
  mindMapId: string;
  label: string;
  description: string | null;
  nodeType: 'concept' | 'topic' | 'subtopic' | 'detail';
  level: number;
  positionX: number | null;
  positionY: number | null;
  width: number;
  height: number;
  style: {
    backgroundColor?: string;
    borderColor?: string;
    fontSize?: number;
    textColor?: string;
  } | null;
  metadata: {
    sourceContentRef?: string;
    importance?: number;
    keywords?: string[];
  } | null;
  createdAt: string;
}

export interface MindMapEdge {
  id: string;
  mindMapId: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string | null;
  edgeType: 'child' | 'related' | 'prerequisite' | 'example';
  style: {
    strokeColor?: string;
    strokeWidth?: number;
    dashed?: boolean;
  } | null;
  metadata: Record<string, any> | null;
  createdAt: string;
}

export interface MindMapWithNodes extends MindMap {
  nodes: MindMapNode[];
  edges: MindMapEdge[];
  studyMaterial?: StudyMaterial;
}

export interface MindMapInteraction {
  id: string;
  mindMapId: string;
  userId: string;
  nodeId: string | null;
  interactionType: 'view' | 'expand' | 'collapse' | 'ask_question';
  interactionData: Record<string, any> | null;
  createdAt: string;
}

// React Flow types for frontend rendering
export interface ReactFlowNode {
  id: string;
  type: 'mindMapNode';
  position: { x: number; y: number };
  data: {
    label: string;
    description?: string;
    nodeType: 'concept' | 'topic' | 'subtopic' | 'detail';
    level: number;
    isExpanded: boolean;
    onExpand?: () => void;
    onAskQuestion?: () => void;
  };
  style?: Record<string, any>;
}

export interface ReactFlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
  style?: Record<string, any>;
  animated?: boolean;
}

// Calendar and Task Management types
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'todo' | 'in_progress' | 'completed' | 'cancelled';
export type SessionType = 'work' | 'pomodoro' | 'break';
export type PomodoroSessionType = 'work' | 'short_break' | 'long_break';

export interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string;
  estimatedDurationMinutes?: number;
  actualDurationMinutes?: number;
  dueDate?: string;
  priority: TaskPriority;
  status: TaskStatus;
  taskCategory?: string;
  tags?: string[];
  instanceId?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledBlock {
  id: string;
  userId: string;
  taskId: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  isCompleted: boolean;
  isAutoScheduled: boolean;
  sessionNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimeTracking {
  id: string;
  userId: string;
  taskId: string;
  scheduledBlockId?: string;
  startTime: string;
  endTime?: string;
  durationMinutes?: number;
  sessionType: SessionType;
  interruptionCount: number;
  focusRating?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PomodoroSession {
  id: string;
  userId: string;
  taskId?: string;
  timeTrackingId?: string;
  workDurationMinutes: number;
  breakDurationMinutes: number;
  longBreakDurationMinutes: number;
  sessionsUntilLongBreak: number;
  sessionNumber: number;
  sessionType: PomodoroSessionType;
  startedAt: string;
  completedAt?: string;
  pausedAt?: string;
  totalPauseDurationMinutes: number;
  isCompleted: boolean;
  wasInterrupted: boolean;
  createdAt: string;
}

export interface TaskDurationPattern {
  id: string;
  userId: string;
  taskCategory: string;
  tags?: string[];
  keywords?: string[];
  sampleCount: number;
  avgEstimatedDurationMinutes?: number;
  avgActualDurationMinutes?: number;
  stdDevMinutes?: number;
  avgEstimationErrorPercent?: number;
  lastUpdated: string;
  createdAt: string;
}

export interface CalendarPreferences {
  id: string;
  userId: string;
  workHoursStart: string;
  workHoursEnd: string;
  workDays: number[];
  preferredSessionDurationMinutes: number;
  minSessionDurationMinutes: number;
  maxSessionDurationMinutes: number;
  breakDurationMinutes: number;
  preferMorning: boolean;
  preferAfternoon: boolean;
  preferEvening: boolean;
  defaultPomodoroWorkMinutes: number;
  defaultPomodoroBreakMinutes: number;
  defaultPomodoroLongBreakMinutes: number;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

// Extended types with related data
export interface TaskWithBlocks extends Task {
  scheduledBlocks?: ScheduledBlock[];
  timeTracking?: TimeTracking[];
}

export interface ScheduledBlockWithTask extends ScheduledBlock {
  task?: Task;
}

// Calendar event types for UI
export interface CalendarEvent {
  id: string;
  taskId: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  isCompleted: boolean;
  isAutoScheduled: boolean;
  priority: TaskPriority;
  color?: string;
}

// AI Scheduling request/response types
export interface ScheduleTaskRequest {
  task: Task;
  preferences: CalendarPreferences;
  existingBlocks: ScheduledBlock[];
  availabilityHints?: {
    preferredDates?: string[];
    blockedTimes?: { start: string; end: string }[];
  };
}

export interface ScheduleTaskResponse {
  scheduledBlocks: Omit<ScheduledBlock, 'id' | 'createdAt' | 'updatedAt'>[];
  reasoning?: string;
  confidence?: number;
}
