import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

// Pre-computed embeddings for help request examples
// These would ideally be computed once and cached
const HELP_EXAMPLES = [
  "I need help with this",
  "I'm stuck on this problem",
  "I don't understand this step",
  "Can you explain this?",
  "What am I doing wrong?",
  "I'm confused about this part",
  "How do I solve this?",
  "I'm not sure what to do next",
];

/**
 * Lightweight semantic help detection using embeddings
 * Compares user text to known help request patterns
 */
export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    // Get embedding for user text
    const userEmbeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small', // Fast and cheap
      input: text,
    });

    const userEmbedding = userEmbeddingResponse.data[0].embedding;

    // Get embeddings for help examples (in production, cache these)
    const helpEmbeddingsResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: HELP_EXAMPLES,
    });

    const helpEmbeddings = helpEmbeddingsResponse.data.map((d) => d.embedding);

    // Compute cosine similarity with each help example
    const similarities = helpEmbeddings.map((helpEmb) =>
      cosineSimilarity(userEmbedding, helpEmb)
    );

    // Get max similarity
    const maxSimilarity = Math.max(...similarities);

    // Threshold for help detection
    const HELP_THRESHOLD = 0.75;

    const needsHelp = maxSimilarity >= HELP_THRESHOLD;
    const confidence = maxSimilarity;

    console.log('🔍 Semantic help detection:', {
      text,
      maxSimilarity: maxSimilarity.toFixed(3),
      needsHelp,
    });

    return NextResponse.json({
      needsHelp,
      confidence,
      maxSimilarity,
    });
  } catch (error) {
    console.error('Error in semantic help detection:', error);
    return NextResponse.json(
      {
        error: 'Semantic analysis failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}
