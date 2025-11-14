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

// API types
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  branchPath: string[];
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

// Workspace / instance types
export type InstanceType = 'text' | 'code' | 'annotate';

interface BaseInstance {
  id: string;
  title: string;
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
  data: Record<string, never>;
}

export type WorkspaceInstance = TextInstance | CodeInstance | AnnotateInstance;

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
