/**
 * Retry utility for fetch with exponential backoff
 *
 * Handles transient network errors gracefully with configurable retry logic.
 */

import { AI_COACH_CONFIG } from './aiCoachConfig';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  shouldRetry?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Fetch with automatic retry and exponential backoff
 */
export async function retryFetch(
  url: string,
  options: RequestInit,
  retryOptions: RetryOptions = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    timeoutMs = AI_COACH_CONFIG.api.requestTimeoutMs,
    shouldRetry = defaultShouldRetry,
    onRetry,
  } = retryOptions;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // If response is ok, return it
      if (response.ok) {
        return response;
      }

      // Non-ok response - check if we should retry
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);

      if (!shouldRetry(error) || attempt === maxRetries) {
        throw error;
      }

      lastError = error;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // If this was the last attempt or we shouldn't retry, throw
      if (attempt === maxRetries || !shouldRetry(lastError)) {
        throw lastError;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(initialDelayMs * Math.pow(2, attempt), maxDelayMs);

      console.warn(
        `⚠️ Request failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`,
        lastError.message
      );

      // Call onRetry callback if provided
      onRetry?.(attempt + 1, lastError);

      // Wait before retrying
      await sleep(delay);
    }
  }

  // Should never reach here, but TypeScript doesn't know that
  throw lastError || new Error('Retry failed with unknown error');
}

/**
 * Default retry logic: retry on network errors and 5xx server errors
 */
function defaultShouldRetry(error: Error): boolean {
  // Network errors (timeout, connection refused, etc.)
  if (error.name === 'AbortError' || error.message.includes('fetch')) {
    return true;
  }

  // 5xx server errors (temporary server issues)
  if (error.message.includes('HTTP 5')) {
    return true;
  }

  // 429 Too Many Requests
  if (error.message.includes('HTTP 429')) {
    return true;
  }

  // Don't retry client errors (4xx except 429)
  if (error.message.includes('HTTP 4')) {
    return false;
  }

  // Default: retry unknown errors
  return true;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Specialized retry for AI coaching endpoint
 */
export async function retryAICoachingRequest(
  screenshot: string,
  elements: any[],
  conversationContext: any,
  options: RetryOptions = {}
): Promise<any> {
  const response = await retryFetch(
    '/api/ai-coach-conversational',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        screenshot,
        elements,
        conversationContext,
      }),
    },
    {
      maxRetries: 2, // Lower for AI calls to avoid long waits
      initialDelayMs: 2000,
      onRetry: (attempt, error) => {
        console.log(`🔄 Retrying AI coaching request (attempt ${attempt}):`, error.message);
      },
      ...options,
    }
  );

  return response.json();
}
