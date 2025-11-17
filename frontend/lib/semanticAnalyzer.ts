/**
 * Semantic Analyzer for Help Detection
 *
 * Uses a hybrid approach:
 * 1. Fast keyword matching for obvious help requests
 * 2. Semantic similarity check for nuanced expressions
 *
 * This is lightweight and doesn't require calling Claude for every utterance.
 */

interface HelpDetectionResult {
  needsHelp: boolean;
  confidence: number; // 0-1
  reason: 'keyword' | 'semantic' | 'none';
  matchedKeywords?: string[];
}

// Explicit help keywords
const HELP_KEYWORDS = [
  'help',
  'stuck',
  'confused',
  'lost',
  'don\'t understand',
  'what do i do',
  'how do i',
  'can you explain',
  'i don\'t get',
  'i\'m lost',
  'hint',
  'clue',
  'why',
  'what does this mean',
  'what\'s this',
  'what is',
  'how does',
  'show me',
];

// Question patterns (indicate user needs guidance)
const QUESTION_PATTERNS = [
  /^what/i,
  /^how/i,
  /^why/i,
  /^when/i,
  /^where/i,
  /^can you/i,
  /^could you/i,
  /^would you/i,
  /\?$/,
];

// Struggle indicators
const STRUGGLE_PHRASES = [
  'i can\'t',
  'i cannot',
  'doesn\'t work',
  'not working',
  'wrong',
  'incorrect',
  'mistake',
  'error',
  'confused',
  'frustrat',
];

/**
 * Fast keyword-based help detection
 */
function detectHelpByKeywords(text: string): HelpDetectionResult {
  const lowerText = text.toLowerCase().trim();

  // Check explicit help keywords
  const matchedKeywords = HELP_KEYWORDS.filter((keyword) =>
    lowerText.includes(keyword)
  );

  if (matchedKeywords.length > 0) {
    return {
      needsHelp: true,
      confidence: 0.95,
      reason: 'keyword',
      matchedKeywords,
    };
  }

  // Check question patterns
  const isQuestion = QUESTION_PATTERNS.some((pattern) => pattern.test(lowerText));
  if (isQuestion) {
    return {
      needsHelp: true,
      confidence: 0.7,
      reason: 'keyword',
      matchedKeywords: ['question pattern'],
    };
  }

  // Check struggle indicators
  const strugglingKeywords = STRUGGLE_PHRASES.filter((phrase) =>
    lowerText.includes(phrase)
  );

  if (strugglingKeywords.length > 0) {
    return {
      needsHelp: true,
      confidence: 0.8,
      reason: 'keyword',
      matchedKeywords: strugglingKeywords,
    };
  }

  return {
    needsHelp: false,
    confidence: 0,
    reason: 'none',
  };
}

/**
 * Semantic similarity-based help detection
 * Uses OpenAI embeddings API for nuanced detection
 */
async function detectHelpBySemantic(text: string): Promise<HelpDetectionResult> {
  try {
    // Call embeddings API
    const response = await fetch('/api/semantic-help', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error('Semantic analysis failed');
    }

    const result = await response.json();
    return {
      needsHelp: result.needsHelp,
      confidence: result.confidence,
      reason: 'semantic',
    };
  } catch (error) {
    console.error('Semantic help detection failed:', error);
    // Fallback to keyword-based
    return {
      needsHelp: false,
      confidence: 0,
      reason: 'none',
    };
  }
}

/**
 * Main help detection function
 * Uses fast keyword matching first, semantic analysis if needed
 */
export async function detectHelpRequest(text: string): Promise<HelpDetectionResult> {
  // Fast path: keyword matching
  const keywordResult = detectHelpByKeywords(text);

  // If high confidence from keywords, return immediately
  if (keywordResult.confidence >= 0.8) {
    console.log('🚨 Help detected (keyword):', keywordResult);
    return keywordResult;
  }

  // If medium confidence, still accept it
  if (keywordResult.confidence >= 0.6) {
    console.log('⚠️ Help detected (keyword, medium confidence):', keywordResult);
    return keywordResult;
  }

  // Low confidence from keywords - check semantic similarity
  // This catches nuanced expressions like "I'm not sure about this step"
  const semanticResult = await detectHelpBySemantic(text);

  if (semanticResult.confidence >= 0.7) {
    console.log('🔍 Help detected (semantic):', semanticResult);
    return semanticResult;
  }

  // No help needed
  return {
    needsHelp: false,
    confidence: 0,
    reason: 'none',
  };
}

/**
 * Extract intent from user speech
 * Determines what the user is asking about
 */
export function extractIntent(text: string): {
  intent: 'help' | 'question' | 'statement' | 'affirmation';
  subject?: string;
} {
  const lowerText = text.toLowerCase().trim();

  // Check for affirmations (user acknowledging AI)
  const affirmations = ['yes', 'yeah', 'ok', 'okay', 'got it', 'thanks', 'thank you', 'understood', 'makes sense'];
  if (affirmations.some((aff) => lowerText === aff || lowerText.startsWith(aff + ' '))) {
    return { intent: 'affirmation' };
  }

  // Check for help requests
  if (detectHelpByKeywords(text).needsHelp) {
    return {
      intent: 'help',
      subject: extractSubject(text),
    };
  }

  // Check for questions
  const isQuestion = QUESTION_PATTERNS.some((pattern) => pattern.test(lowerText));
  if (isQuestion) {
    return {
      intent: 'question',
      subject: extractSubject(text),
    };
  }

  // Default to statement
  return {
    intent: 'statement',
    subject: extractSubject(text),
  };
}

/**
 * Extract the main subject/topic from user speech
 */
function extractSubject(text: string): string | undefined {
  const lowerText = text.toLowerCase();

  // Math topics
  const mathTopics = [
    'derivative', 'integral', 'limit', 'function', 'equation',
    'trigonometry', 'algebra', 'calculus', 'geometry',
    'matrix', 'vector', 'proof', 'theorem',
  ];

  for (const topic of mathTopics) {
    if (lowerText.includes(topic)) {
      return topic;
    }
  }

  // Extract from question words
  const match = lowerText.match(/(?:what|how|why|when|where) (?:is|are|does|do) (?:the |a |an )?(\w+)/);
  if (match) {
    return match[1];
  }

  return undefined;
}
