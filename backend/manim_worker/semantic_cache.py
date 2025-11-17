"""
Semantic caching for Manim animations using sentence embeddings

This module provides semantic similarity-based caching that can match
similar descriptions even if they're not exactly identical.
"""

import logging
import numpy as np
from typing import Optional, Dict, Tuple, List
import os

logger = logging.getLogger(__name__)

# Try to import sentence transformers
try:
    from sentence_transformers import SentenceTransformer
    EMBEDDINGS_AVAILABLE = True
    logger.info("✓ sentence-transformers available for semantic caching")
except ImportError:
    EMBEDDINGS_AVAILABLE = False
    logger.warning("⚠️  sentence-transformers not available - semantic caching disabled")
    logger.warning("   Install with: pip install sentence-transformers")


class SemanticCache:
    """
    Semantic cache that uses embeddings to find similar animation requests
    """

    def __init__(self, similarity_threshold: float = 0.85):
        """
        Initialize semantic cache

        Args:
            similarity_threshold: Minimum cosine similarity to consider a match (0-1)
        """
        self.similarity_threshold = similarity_threshold
        self.cache: Dict[str, Tuple[np.ndarray, str]] = {}  # cache_key -> (embedding, video_url)
        self.enabled = EMBEDDINGS_AVAILABLE and os.getenv("SEMANTIC_CACHE_ENABLED", "true").lower() == "true"

        if not self.enabled:
            logger.info("Semantic caching disabled")
            return

        # Initialize embedding model (lightweight, fast model)
        model_name = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
        try:
            logger.info(f"Loading embedding model: {model_name}")
            self.model = SentenceTransformer(model_name)
            logger.info(f"✓ Embedding model loaded successfully")
            logger.info(f"  Similarity threshold: {similarity_threshold}")
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            self.enabled = False

    def _normalize_text(self, text: str) -> str:
        """Normalize text for consistent embeddings"""
        return text.lower().strip()

    def _get_embedding(self, text: str) -> np.ndarray:
        """
        Generate embedding for text

        Args:
            text: Text to embed

        Returns:
            Embedding vector
        """
        if not self.enabled:
            return np.array([])

        normalized = self._normalize_text(text)
        embedding = self.model.encode(normalized, convert_to_numpy=True)
        return embedding

    def _cosine_similarity(self, emb1: np.ndarray, emb2: np.ndarray) -> float:
        """
        Compute cosine similarity between two embeddings

        Args:
            emb1: First embedding
            emb2: Second embedding

        Returns:
            Similarity score (0-1)
        """
        # Normalize vectors
        norm1 = np.linalg.norm(emb1)
        norm2 = np.linalg.norm(emb2)

        if norm1 == 0 or norm2 == 0:
            return 0.0

        # Cosine similarity
        similarity = np.dot(emb1, emb2) / (norm1 * norm2)
        return float(similarity)

    def find_similar(
        self,
        description: str,
        student_context: Optional[str] = None
    ) -> Optional[Tuple[str, float, str]]:
        """
        Find cached animation with similar description

        Args:
            description: Animation description
            student_context: Optional student context

        Returns:
            Tuple of (cache_key, similarity_score, video_url) if match found, else None
        """
        if not self.enabled or len(self.cache) == 0:
            return None

        # Create query text
        query_text = description
        if student_context:
            query_text += " | " + student_context

        # Get query embedding
        query_emb = self._get_embedding(query_text)

        # Find most similar cached entry
        best_match = None
        best_similarity = 0.0
        best_key = None

        for cache_key, (cached_emb, video_url) in self.cache.items():
            similarity = self._cosine_similarity(query_emb, cached_emb)

            if similarity > best_similarity:
                best_similarity = similarity
                best_match = video_url
                best_key = cache_key

        # Check if similarity meets threshold
        if best_similarity >= self.similarity_threshold:
            logger.info(f"Semantic cache HIT: similarity={best_similarity:.3f}")
            logger.info(f"  Query: {description[:60]}...")
            logger.info(f"  Cached: {best_key[:60]}...")
            return (best_key, best_similarity, best_match)

        logger.debug(f"Semantic cache MISS: best similarity={best_similarity:.3f} < threshold={self.similarity_threshold}")
        return None

    def add(
        self,
        description: str,
        video_url: str,
        student_context: Optional[str] = None
    ) -> None:
        """
        Add entry to semantic cache

        Args:
            description: Animation description
            video_url: URL of rendered video
            student_context: Optional student context
        """
        if not self.enabled:
            return

        # Create cache key
        cache_key = description
        if student_context:
            cache_key += " | " + student_context

        # Generate embedding
        embedding = self._get_embedding(cache_key)

        # Store in cache
        self.cache[cache_key] = (embedding, video_url)
        logger.debug(f"Added to semantic cache: {description[:60]}... (total: {len(self.cache)})")

    def get_stats(self) -> Dict:
        """Get cache statistics"""
        return {
            "enabled": self.enabled,
            "size": len(self.cache),
            "threshold": self.similarity_threshold,
            "model": getattr(self, 'model', None).__class__.__name__ if hasattr(self, 'model') else None
        }

    def clear(self) -> None:
        """Clear the cache"""
        self.cache.clear()
        logger.info("Semantic cache cleared")


# Global semantic cache instance
semantic_cache = SemanticCache(
    similarity_threshold=float(os.getenv("SEMANTIC_CACHE_THRESHOLD", "0.85"))
)
