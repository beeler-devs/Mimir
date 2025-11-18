/**
 * API client for server-side code execution
 * Used for compiled languages (C, C++, Java, Rust)
 */

import { CodeLanguage, ExecuteRequest, ExecuteResponse } from '@/lib/types';

// Get backend URL from environment
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8001';

/**
 * Execute code on the backend server
 * Used for compiled languages that require server-side compilation
 */
export async function executeCode(request: ExecuteRequest): Promise<ExecuteResponse> {
  const response = await fetch(`${BACKEND_URL}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Execution failed: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Execute code with Server-Sent Events for streaming output
 * Provides real-time output as the program runs
 */
export async function executeCodeStreaming(
  request: ExecuteRequest,
  onOutput: (data: { type: string; content: string }) => void,
  onComplete: (result: ExecuteResponse) => void,
  onError: (error: string) => void
): Promise<void> {
  try {
    const response = await fetch(`${BACKEND_URL}/execute/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      onError(`Execution failed: ${response.status} - ${errorText}`);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onError('Failed to get response stream');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process SSE events
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'output' || data.type === 'chunk') {
              onOutput(data);
            } else if (data.type === 'done') {
              onComplete(data);
            } else if (data.type === 'error') {
              onError(data.content || data.error || 'Unknown error');
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }
  } catch (error) {
    onError(error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Check if a language requires server-side execution
 */
export function requiresServerExecution(language: CodeLanguage): boolean {
  return ['c', 'cpp', 'java', 'rust'].includes(language);
}

/**
 * Check if a language is supported for execution
 */
export function isExecutionSupported(language: CodeLanguage): boolean {
  return ['python', 'c', 'cpp', 'java', 'rust'].includes(language);
}

/**
 * Get file extension for a language
 */
export function getFileExtension(language: CodeLanguage): string {
  const extensions: Record<CodeLanguage, string> = {
    python: 'py',
    javascript: 'js',
    typescript: 'ts',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    rust: 'rs',
  };
  return extensions[language] || 'txt';
}

/**
 * Get default entry point filename for a language
 */
export function getDefaultEntryPoint(language: CodeLanguage): string {
  const entryPoints: Record<CodeLanguage, string> = {
    python: 'main.py',
    javascript: 'index.js',
    typescript: 'index.ts',
    java: 'Main.java',
    cpp: 'main.cpp',
    c: 'main.c',
    rust: 'main.rs',
  };
  return entryPoints[language] || 'main.txt';
}
