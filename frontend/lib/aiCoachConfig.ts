/**
 * Unified AI Coach Configuration
 *
 * Central location for all AI coaching system parameters.
 * Tweak these values to change system behavior without code spelunking.
 */

export const AI_COACH_CONFIG = {
  // ===== TIMING PARAMETERS =====

  /** How long the student must be idle before AI offers proactive help (ms) */
  idleThresholdMs: 15_000, // 15 seconds

  /** Debounce period for canvas change detection (ms) */
  canvasDebounceMs: 3_000, // 3 seconds

  /** Minimum time between proactive AI interventions (ms) */
  minInterventionIntervalMs: 30_000, // 30 seconds

  /** How long to wait before retrying after intervention failure (ms) */
  interventionRetryDelayMs: 5_000, // 5 seconds

  // ===== VOICE ACTIVITY DETECTION (VAD) =====

  /** Silence threshold: how long before we consider user finished speaking (ms) */
  vadSilenceThresholdMs: 1_500, // 1.5 seconds

  /** Delay before restarting speech recognition after network error (ms) */
  speechRecognitionRetryDelayMs: 1_000, // 1 second

  // ===== HELP DETECTION THRESHOLDS =====

  help: {
    /**
     * Keyword confidence threshold.
     * If keyword matching reaches this confidence, skip semantic analysis (faster).
     */
    keywordConfidenceThreshold: 0.8,

    /**
     * Semantic similarity threshold.
     * Minimum cosine similarity to help examples to trigger help (uses embeddings).
     */
    semanticConfidenceThreshold: 0.7,

    /**
     * API-level threshold for semantic help detection endpoint.
     * Used in /api/semantic-help for cosine similarity comparison.
     */
    apiHelpThreshold: 0.75,
  },

  // ===== CONVERSATION STATE =====

  /** Maximum number of conversation turns to keep in history */
  historyMaxTurns: 50,

  /** Number of recent turns to send to Claude API for context */
  apiContextTurns: 5,

  // ===== VOICE SYNTHESIS =====

  /** Estimated words per minute for TTS progress tracking */
  estimatedWordsPerMinute: 150,

  /** Progress update interval for TTS (ms) */
  progressUpdateIntervalMs: 100,

  /** Default laser pointer duration multiplier (seconds per sentence) */
  laserDurationPerSentenceMs: 3_000,

  // ===== SCREENSHOT OPTIMIZATION =====

  /** Screenshot scale factor (1.0 = full resolution, 0.5 = half) */
  screenshotScale: 1.0,

  /** Maximum screenshot width in pixels (downscale if larger) */
  maxScreenshotWidth: 1920,

  /** Maximum screenshot height in pixels (downscale if larger) */
  maxScreenshotHeight: 1080,

  // ===== INTERRUPT HANDLING =====

  /** Maximum number of outstanding intervention requests (throttling) */
  maxConcurrentInterventions: 1,

  /** Maximum number of rapid interrupts to tolerate before cooling down */
  maxRapidInterrupts: 3,

  /** Cool-down period after too many rapid interrupts (ms) */
  interruptCooldownMs: 10_000, // 10 seconds

  // ===== API CONFIGURATION =====

  api: {
    /** Claude model to use for AI coaching */
    claudeModel: 'claude-sonnet-4-5-20250929' as const,

    /** Max tokens for Claude coaching responses */
    claudeMaxTokens: 2048,

    /** OpenAI embedding model for semantic help detection */
    embeddingModel: 'text-embedding-3-small' as const,

    /** Timeout for API requests (ms) */
    requestTimeoutMs: 30_000, // 30 seconds
  },

  // ===== UI / UX =====

  /** Coaching modes */
  modes: {
    /** AI only responds when explicitly asked */
    OBSERVE_ONLY: 'observe' as const,

    /** AI offers hints but doesn't explain fully */
    HINTS: 'hints' as const,

    /** Full proactive tutoring with explanations */
    FULL_TUTOR: 'full' as const,
  },

  /** Default coaching mode on startup */
  defaultMode: 'full' as const,

} as const;

/** Type-safe coaching mode */
export type CoachingMode = typeof AI_COACH_CONFIG.modes[keyof typeof AI_COACH_CONFIG.modes];

/**
 * Get coaching mode behavior flags
 */
export function getCoachingModeBehavior(mode: CoachingMode) {
  switch (mode) {
    case 'observe':
      return {
        allowProactiveHelp: false,
        allowIdleIntervention: false,
        provideFullExplanations: false,
        label: 'Observe Only',
        description: 'AI only responds when you ask for help',
      };
    case 'hints':
      return {
        allowProactiveHelp: true,
        allowIdleIntervention: true,
        provideFullExplanations: false,
        label: 'Hints Mode',
        description: 'AI offers hints but lets you solve it',
      };
    case 'full':
      return {
        allowProactiveHelp: true,
        allowIdleIntervention: true,
        provideFullExplanations: true,
        label: 'Full Tutor',
        description: 'AI provides complete explanations and guidance',
      };
    default:
      // Fallback to observe mode for safety
      return {
        allowProactiveHelp: false,
        allowIdleIntervention: false,
        provideFullExplanations: false,
        label: 'Observe Only',
        description: 'AI only responds when you ask for help',
      };
  }
}
