"""
Enhanced Manim code generation using Math-To-Manim's Reverse Knowledge Tree orchestrator.

This module wraps the Math-To-Manim orchestrator to provide educational animations
that build from foundational concepts up to the target topic.
"""

from manim_worker.layout_validator import validate_layout, suggest_layout_fixes
from manim_worker.validation import (
    check_python_compiles,
    check_manim_runs,
    write_code_to_file,
    repair_code_with_claude,
    ensure_scene_class,
    MAX_REPAIR_ATTEMPTS,
    MANIM_TEST_TIMEOUT,
)
import os
import sys
import logging
from pathlib import Path
from typing import Optional, Callable
import tempfile
import importlib.util
from uuid import uuid4

# Add Math-To-Manim to Python path
# Path from backend/manim_worker to backend/math-to-manim
_current_file = Path(__file__).resolve()
_math_to_manim_path = _current_file.parent.parent / "math-to-manim"
if str(_math_to_manim_path) not in sys.path:
    sys.path.insert(0, str(_math_to_manim_path))

logger = logging.getLogger(__name__)

# Import shared validation utilities

# Try to import orchestrator
try:
    from agents.orchestrator import ReverseKnowledgeTreeOrchestrator, AnimationResult
    ORCHESTRATOR_AVAILABLE = True
    logger.info("=" * 70)
    logger.info("✓ Math-To-Manim orchestrator successfully imported")
    logger.info("  - ReverseKnowledgeTreeOrchestrator: Available")
    logger.info("  - AnimationResult: Available")
    logger.info("=" * 70)
except ImportError as e:
    logger.error("=" * 70)
    logger.error("✗ Math-To-Manim orchestrator import failed")
    logger.error(f"  Error: {e}")
    logger.error(
        "  This means videos will use simple codegen (shorter, less educational)")
    logger.error(
        "  To fix: Ensure math-to-manim is properly installed in backend/math-to-manim")
    logger.error("=" * 70)
    ORCHESTRATOR_AVAILABLE = False
    ReverseKnowledgeTreeOrchestrator = None
    AnimationResult = None


def _ensure_api_key():
    """Ensure ANTHROPIC_API_KEY is set for the orchestrator."""
    # Check for both ANTHROPIC_API_KEY and CLAUDE_API_KEY
    api_key = os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY or CLAUDE_API_KEY environment variable not set. "
            "Required for Math-To-Manim orchestrator."
        )
    # Set ANTHROPIC_API_KEY if only CLAUDE_API_KEY is available
    if not os.getenv("ANTHROPIC_API_KEY") and os.getenv("CLAUDE_API_KEY"):
        os.environ["ANTHROPIC_API_KEY"] = os.getenv("CLAUDE_API_KEY")
    return api_key


# Use ensure_scene_class from validation module instead of local function


def generate_and_validate_manim_scene(
    concept: str,
    student_context: str | None = None,
    progress_callback: Optional[Callable[[str, str, int], None]] = None,
) -> str:
    """
    Generate Manim code using Math-To-Manim's Reverse Knowledge Tree pipeline.

    This function uses the full 6-agent pipeline:
    1. ConceptAnalyzer - Parses user input
    2. PrerequisiteExplorer - Builds knowledge tree recursively
    3. MathematicalEnricher - Adds LaTeX equations
    4. VisualDesigner - Designs visual specifications
    5. NarrativeComposer - Generates verbose prompt
    6. CodeGenerator - Creates Manim code

    Falls back to simple codegen if orchestrator is unavailable or fails.

    Args:
        concept: The concept to visualize (e.g., "explain quantum mechanics")
        student_context: Optional context about the student's current work
        progress_callback: Optional callback function(phase, message, percentage) for progress updates

    Returns:
        Validated Python code string for Manim

    Raises:
        RuntimeError: If code generation/validation fails after max attempts
    """
    # Helper to call progress callback if provided
    def report_progress(phase: str, message: str, percentage: int):
        if progress_callback:
            try:
                progress_callback(phase, message, percentage)
            except Exception as e:
                logger.warning(f"Progress callback error: {e}")

    # Check if orchestrator should be used
    use_advanced = os.getenv("USE_MATH_TO_MANIM", "true").lower() == "true"
    max_depth = int(os.getenv("MATH_TO_MANIM_MAX_DEPTH", "3"))

    # Fallback to simple codegen if orchestrator not available or disabled
    if not use_advanced or not ORCHESTRATOR_AVAILABLE:
        if not use_advanced:
            logger.info("⚠️  Using simple codegen (USE_MATH_TO_MANIM=false)")
        else:
            logger.info("⚠️  Using simple codegen (orchestrator unavailable)")
        from manim_worker.codegen import generate_and_validate_manim_scene as simple_generate
        return simple_generate(concept, student_context)

    try:
        # Ensure API key is available
        _ensure_api_key()

        report_progress("code_generation", "Initializing orchestrator...", 5)

        logger.info("=" * 70)
        logger.info("🚀 USING MATH-TO-MANIM ORCHESTRATOR (Full Pipeline)")
        logger.info(f"   Concept: {concept}")
        logger.info(f"   Max tree depth: {max_depth}")
        logger.info("=" * 70)

        # Build full prompt with student context
        user_prompt = concept
        if student_context:
            user_prompt = f"{concept}\n\nStudent context: {student_context}"

        # Initialize orchestrator
        report_progress("code_generation", "Initializing orchestrator...", 10)
        # Use the same model as the orchestrator agents (claude-sonnet-4-5)
        # Allow override via CLAUDE_MODEL env var
        model_name = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-5")
        logger.info(f"Using Claude model: {model_name}")
        orchestrator = ReverseKnowledgeTreeOrchestrator(
            model=model_name,
            max_tree_depth=max_depth,
            enable_code_generation=True,
            enable_atlas=False
        )

        report_progress("code_generation", "Building knowledge tree...", 20)

        # Process through the full pipeline
        # Use a temporary output directory
        temp_output_dir = Path(tempfile.gettempdir()) / \
            "manim_orchestrator_output"
        temp_output_dir.mkdir(exist_ok=True)

        report_progress("code_generation",
                        "Processing through orchestrator pipeline...", 30)
        result: AnimationResult = orchestrator.process(
            user_prompt, output_dir=str(temp_output_dir))

        report_progress("code_generation",
                        "Code generation complete, validating...", 40)

        # Extract Manim code
        if not result.manim_code:
            raise ValueError("Orchestrator did not generate Manim code")

        code = result.manim_code

        # Ensure GeneratedScene class name
        code = ensure_scene_class(code)

        logger.info("=" * 70)
        logger.info(f"✓ Orchestrator generated code ({len(code)} characters)")
        logger.info("  Full 6-agent pipeline completed successfully!")
        logger.info("=" * 70)

        # Validate layout before testing execution
        is_layout_valid, layout_warnings, layout_metrics = validate_layout(
            code)
        if layout_warnings:
            logger.warning(
                f"Layout validation found {len(layout_warnings)} potential issues")
            suggestions = suggest_layout_fixes(code, layout_warnings)
            if suggestions:
                logger.info(suggestions)

        # Validate the code using the same validation pipeline as simple codegen
        attempt = 0
        last_error = ""

        # Create a temporary directory for validation
        temp_dir = Path(tempfile.gettempdir()) / "manim_validation"
        temp_dir.mkdir(exist_ok=True)

        while attempt <= MAX_REPAIR_ATTEMPTS:
            attempt += 1
            logger.info(
                f"Validation attempt {attempt}/{MAX_REPAIR_ATTEMPTS + 1}")

            # Write to a temp file
            tmp_path = temp_dir / f"generated_{uuid4().hex}.py"
            write_code_to_file(code, tmp_path)

            # Check Python compilation
            ok_py, py_err = check_python_compiles(tmp_path)
            if not ok_py:
                last_error = f"Python compilation error: {py_err}"
                logger.warning(f"Attempt {attempt}: {last_error}")

                if attempt > MAX_REPAIR_ATTEMPTS:
                    try:
                        tmp_path.unlink()
                    except:
                        pass
                    break

                # Fall back to simple codegen for repair
                logger.info(
                    "Falling back to simple codegen for code repair...")
                code = repair_code_with_claude(code, last_error)
                code = ensure_scene_class(code)
                continue

            # Ensure GeneratedScene class exists
            code = ensure_scene_class(code)
            # Re-write after ensuring class name
            write_code_to_file(code, tmp_path)

            # Check Manim execution
            ok_manim, manim_err = check_manim_runs(
                tmp_path, scene_class="GeneratedScene")
            if not ok_manim:
                last_error = f"Manim execution error: {manim_err}"
                logger.warning(f"Attempt {attempt}: {last_error}")

                if attempt > MAX_REPAIR_ATTEMPTS:
                    try:
                        tmp_path.unlink()
                    except:
                        pass
                    break

                # Fall back to simple codegen for repair
                logger.info(
                    "Falling back to simple codegen for code repair...")
                code = repair_code_with_claude(code, last_error)
                code = ensure_scene_class(code)
                continue

            # Additional validation: Try to import and verify class exists
            try:
                spec = importlib.util.spec_from_file_location(
                    "temp_scene", tmp_path)
                if spec and spec.loader:
                    temp_module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(temp_module)
                    if not hasattr(temp_module, 'GeneratedScene'):
                        last_error = "GeneratedScene class not found after import (class may be defined incorrectly)"
                        logger.warning(f"Attempt {attempt}: {last_error}")

                        if attempt > MAX_REPAIR_ATTEMPTS:
                            try:
                                tmp_path.unlink()
                            except:
                                pass
                            break

                        code = ensure_scene_class(code)
                        continue
            except Exception as import_err:
                last_error = f"Import validation error: {import_err}"
                logger.warning(f"Attempt {attempt}: {last_error}")

                if attempt > MAX_REPAIR_ATTEMPTS:
                    try:
                        tmp_path.unlink()
                    except:
                        pass
                    break

                code = repair_code_with_claude(code, last_error)
                code = ensure_scene_class(code)
                continue

            # Success!
            logger.info(
                f"Code validation successful after {attempt} attempt(s)")

            # Clean up temp file
            try:
                tmp_path.unlink()
            except:
                pass

            return code

        # If we get here, validation failed - fall back to simple codegen
        logger.warning(f"Orchestrator code validation failed after {MAX_REPAIR_ATTEMPTS} attempts. "
                       f"Falling back to simple codegen. Last error: {last_error}")
        from manim_worker.codegen import generate_and_validate_manim_scene as simple_generate
        return simple_generate(concept, student_context)

    except Exception as e:
        logger.error(
            f"Error in Math-To-Manim orchestrator: {e}", exc_info=True)
        logger.warning("Falling back to simple codegen")
        # Fallback to simple codegen
        from manim_worker.codegen import generate_and_validate_manim_scene as simple_generate
        return simple_generate(concept, student_context)
