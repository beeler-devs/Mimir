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
export type InstanceType = 'text' | 'code' | 'annotate' | 'pdf';

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
    language: CodeLanguage;
    code: string;
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

export type WorkspaceInstance = TextInstance | CodeInstance | AnnotateInstance | PDFInstance;

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
