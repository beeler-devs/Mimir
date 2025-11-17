/**
 * Conversation State Manager
 *
 * Tracks the ongoing conversation between AI coach and student:
 * - What AI is currently saying
 * - What AI was planning to say next
 * - Conversation history
 * - Canvas context
 *
 * Used for interrupt handling and re-evaluation
 */

export interface ConversationTurn {
  speaker: 'user' | 'ai';
  text: string;
  timestamp: number;
  isInterruption?: boolean;
}

export interface AIUtteranceState {
  text: string;
  startedAt: number;
  completedAt?: number;
  wasInterrupted: boolean;
  progressWhenInterrupted?: number; // 0-1, how far through the utterance
}

export interface ConversationState {
  history: ConversationTurn[];
  currentAIUtterance: AIUtteranceState | null;
  canvasContext: {
    lastSnapshot?: string; // Base64 screenshot
    currentTopic?: string;
    detectedConcepts: string[];
  };
  lastInterventionTime: number;
}

export class ConversationStateManager {
  private state: ConversationState;
  private readonly MAX_HISTORY_LENGTH = 50; // Prevent unbounded growth

  constructor() {
    this.state = {
      history: [],
      currentAIUtterance: null,
      canvasContext: {
        detectedConcepts: [],
      },
      lastInterventionTime: 0,
    };
  }

  /**
   * Get current conversation state (deep copy)
   */
  getState(): ConversationState {
    return {
      ...this.state,
      history: [...this.state.history],
      canvasContext: {
        ...this.state.canvasContext,
        detectedConcepts: [...this.state.canvasContext.detectedConcepts],
      },
      currentAIUtterance: this.state.currentAIUtterance
        ? { ...this.state.currentAIUtterance }
        : null,
    };
  }

  /**
   * Add user speech to history
   */
  addUserSpeech(text: string, isInterruption: boolean = false): void {
    const turn: ConversationTurn = {
      speaker: 'user',
      text,
      timestamp: Date.now(),
      isInterruption,
    };

    this.state.history.push(turn);
    this.trimHistory();

    // Mark current AI utterance as interrupted if applicable
    if (isInterruption && this.state.currentAIUtterance && !this.state.currentAIUtterance.wasInterrupted) {
      this.markAIUtteranceInterrupted();
    }

    console.log('💬 User said:', text.substring(0, 50) + (text.length > 50 ? '...' : ''), isInterruption ? '(interrupted AI)' : '');
  }

  /**
   * Start a new AI utterance
   */
  startAIUtterance(text: string): void {
    // If there was a previous utterance that wasn't completed, complete it
    if (this.state.currentAIUtterance && !this.state.currentAIUtterance.completedAt) {
      this.completeAIUtterance();
    }

    this.state.currentAIUtterance = {
      text,
      startedAt: Date.now(),
      wasInterrupted: false,
    };

    console.log('🤖 AI started saying:', text.substring(0, 50) + (text.length > 50 ? '...' : ''));
  }

  /**
   * Complete current AI utterance
   */
  completeAIUtterance(): void {
    if (!this.state.currentAIUtterance) return;

    this.state.currentAIUtterance.completedAt = Date.now();

    // Only add to history if it wasn't interrupted or was finished speaking
    const turn: ConversationTurn = {
      speaker: 'ai',
      text: this.state.currentAIUtterance.text,
      timestamp: this.state.currentAIUtterance.startedAt,
    };

    this.state.history.push(turn);
    this.trimHistory();

    this.state.currentAIUtterance = null;

    console.log('✅ AI completed utterance');
  }

  /**
   * Mark current AI utterance as interrupted
   */
  markAIUtteranceInterrupted(progress: number = 0.5): void {
    if (!this.state.currentAIUtterance) return;

    // Don't re-interrupt if already interrupted
    if (this.state.currentAIUtterance.wasInterrupted) return;

    this.state.currentAIUtterance.wasInterrupted = true;
    this.state.currentAIUtterance.progressWhenInterrupted = Math.max(0, Math.min(1, progress));

    console.log('⚠️ AI utterance interrupted at', (progress * 100).toFixed(0) + '%');
  }

  /**
   * Update canvas context
   */
  updateCanvasContext(snapshot?: string, topic?: string, concepts?: string[]): void {
    if (snapshot !== undefined) {
      this.state.canvasContext.lastSnapshot = snapshot;
    }
    if (topic !== undefined) {
      this.state.canvasContext.currentTopic = topic;
    }
    if (concepts !== undefined) {
      this.state.canvasContext.detectedConcepts = [...concepts];
    }
  }

  /**
   * Record intervention time
   */
  recordIntervention(): void {
    this.state.lastInterventionTime = Date.now();
  }

  /**
   * Get recent conversation history (last N turns)
   */
  getRecentHistory(count: number = 5): ConversationTurn[] {
    const safeCount = Math.max(0, Math.min(count, this.state.history.length));
    return this.state.history.slice(-safeCount).map(turn => ({ ...turn }));
  }

  /**
   * Get current AI utterance if active
   */
  getCurrentAIUtterance(): AIUtteranceState | null {
    return this.state.currentAIUtterance ? { ...this.state.currentAIUtterance } : null;
  }

  /**
   * Check if AI was interrupted
   */
  wasInterrupted(): boolean {
    return this.state.currentAIUtterance?.wasInterrupted ?? false;
  }

  /**
   * Get what AI was saying when interrupted
   */
  getInterruptedContent(): string | null {
    if (!this.state.currentAIUtterance?.wasInterrupted) return null;
    return this.state.currentAIUtterance.text;
  }

  /**
   * Clear conversation history (reset)
   */
  clearHistory(): void {
    this.state.history = [];
    this.state.currentAIUtterance = null;
    this.state.canvasContext = {
      detectedConcepts: [],
    };
    this.state.lastInterventionTime = 0;
    console.log('🧹 Conversation state cleared');
  }

  /**
   * Trim history to prevent unbounded growth
   */
  private trimHistory(): void {
    if (this.state.history.length > this.MAX_HISTORY_LENGTH) {
      const excess = this.state.history.length - this.MAX_HISTORY_LENGTH;
      this.state.history = this.state.history.slice(excess);
      console.log(`🗑️ Trimmed ${excess} old conversation turns`);
    }
  }

  /**
   * Get conversation summary for API context
   */
  getSummaryForAPI(): {
    recentHistory: ConversationTurn[];
    currentAIUtterance: string | null;
    wasInterrupted: boolean;
    canvasContext: {
      currentTopic?: string;
      detectedConcepts: string[];
      lastSnapshot?: string;
    };
  } {
    return {
      recentHistory: this.getRecentHistory(5),
      currentAIUtterance: this.state.currentAIUtterance?.text ?? null,
      wasInterrupted: this.wasInterrupted(),
      canvasContext: {
        currentTopic: this.state.canvasContext.currentTopic,
        detectedConcepts: [...this.state.canvasContext.detectedConcepts],
        lastSnapshot: this.state.canvasContext.lastSnapshot,
      },
    };
  }
}

// Singleton instance
let conversationStateManager: ConversationStateManager | null = null;

/**
 * Get the singleton conversation state manager
 * Note: In development with hot reload, this persists across reloads
 */
export function getConversationStateManager(): ConversationStateManager {
  if (!conversationStateManager) {
    conversationStateManager = new ConversationStateManager();
  }
  return conversationStateManager;
}

/**
 * Reset the conversation state manager (useful for testing or cleanup)
 */
export function resetConversationStateManager(): void {
  if (conversationStateManager) {
    conversationStateManager.clearHistory();
  }
  conversationStateManager = null;
}
