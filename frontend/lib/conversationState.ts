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
   * Get current conversation state
   */
  getState(): ConversationState {
    return { ...this.state };
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

    // Mark current AI utterance as interrupted if applicable
    if (isInterruption && this.state.currentAIUtterance && !this.state.currentAIUtterance.wasInterrupted) {
      this.markAIUtteranceInterrupted();
    }

    console.log('💬 User said:', text, isInterruption ? '(interrupted AI)' : '');
  }

  /**
   * Start a new AI utterance
   */
  startAIUtterance(text: string): void {
    this.state.currentAIUtterance = {
      text,
      startedAt: Date.now(),
      wasInterrupted: false,
    };

    console.log('🤖 AI started saying:', text);
  }

  /**
   * Complete current AI utterance
   */
  completeAIUtterance(): void {
    if (!this.state.currentAIUtterance) return;

    this.state.currentAIUtterance.completedAt = Date.now();

    // Add to history
    const turn: ConversationTurn = {
      speaker: 'ai',
      text: this.state.currentAIUtterance.text,
      timestamp: this.state.currentAIUtterance.startedAt,
    };

    this.state.history.push(turn);
    this.state.currentAIUtterance = null;

    console.log('✅ AI completed utterance');
  }

  /**
   * Mark current AI utterance as interrupted
   */
  markAIUtteranceInterrupted(progress: number = 0.5): void {
    if (!this.state.currentAIUtterance) return;

    this.state.currentAIUtterance.wasInterrupted = true;
    this.state.currentAIUtterance.progressWhenInterrupted = progress;

    console.log('⚠️ AI utterance interrupted at', (progress * 100).toFixed(0) + '%');
  }

  /**
   * Update canvas context
   */
  updateCanvasContext(snapshot?: string, topic?: string, concepts?: string[]): void {
    if (snapshot) {
      this.state.canvasContext.lastSnapshot = snapshot;
    }
    if (topic) {
      this.state.canvasContext.currentTopic = topic;
    }
    if (concepts) {
      this.state.canvasContext.detectedConcepts = concepts;
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
    return this.state.history.slice(-count);
  }

  /**
   * Get current AI utterance if active
   */
  getCurrentAIUtterance(): AIUtteranceState | null {
    return this.state.currentAIUtterance;
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
    console.log('🧹 Conversation history cleared');
  }

  /**
   * Get conversation summary for API context
   */
  getSummaryForAPI(): {
    recentHistory: ConversationTurn[];
    currentAIUtterance: string | null;
    wasInterrupted: boolean;
    canvasContext: ConversationState['canvasContext'];
  } {
    return {
      recentHistory: this.getRecentHistory(5),
      currentAIUtterance: this.state.currentAIUtterance?.text ?? null,
      wasInterrupted: this.wasInterrupted(),
      canvasContext: this.state.canvasContext,
    };
  }
}

// Singleton instance
let conversationStateManager: ConversationStateManager | null = null;

export function getConversationStateManager(): ConversationStateManager {
  if (!conversationStateManager) {
    conversationStateManager = new ConversationStateManager();
  }
  return conversationStateManager;
}
