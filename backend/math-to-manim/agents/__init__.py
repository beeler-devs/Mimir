"""Agent package exports and pipeline helpers."""

from __future__ import annotations

# Import core agents using relative imports
from .prerequisite_explorer_claude import ConceptAnalyzer, PrerequisiteExplorer, KnowledgeNode
from .mathematical_enricher import MathematicalEnricher, MathematicalContent
from .visual_designer import VisualDesigner, VisualSpec
from .narrative_composer import NarrativeComposer, Narrative
from .nomic_atlas_client import AtlasClient, AtlasConcept, NomicNotInstalledError
from .orchestrator import ReverseKnowledgeTreeOrchestrator, AnimationResult

# Optional imports - may fail if dependencies are missing
try:
    from .video_review_agent import VideoReviewAgent, VideoReviewResult
except ImportError:
    VideoReviewAgent = None  # type: ignore[assignment]
    VideoReviewResult = None  # type: ignore[assignment]

__all__ = [
    # Core agents
    "ConceptAnalyzer",
    "PrerequisiteExplorer",
    "MathematicalEnricher",
    "VisualDesigner",
    "NarrativeComposer",

    # Orchestrator (optional)
    "ReverseKnowledgeTreeOrchestrator",

    # Data structures
    "KnowledgeNode",
    "MathematicalContent",
    "VisualSpec",
    "Narrative",
    "AnimationResult",

    # Video review
    "VideoReviewAgent",
    "VideoReviewResult",

    # Atlas integration
    "AtlasClient",
    "AtlasConcept",
    "NomicNotInstalledError",
]

