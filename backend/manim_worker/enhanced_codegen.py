"""
Enhanced Manim code generation using Math-To-Manim's Reverse Knowledge Tree orchestrator.

This module wraps the Math-To-Manim orchestrator to provide educational animations
that build from foundational concepts up to the target topic.
"""

import os
import sys
import re
import logging
from pathlib import Path
from typing import Optional, Callable

# Add Math-To-Manim to Python path
# Path from backend/manim_worker to manim-to-code/Math-To-Manim (root, not src)
_current_file = Path(__file__).resolve()
_math_to_manim_path = _current_file.parent.parent.parent / "manim-to-code" / "Math-To-Manim"
if str(_math_to_manim_path) not in sys.path:
    sys.path.insert(0, str(_math_to_manim_path))

logger = logging.getLogger(__name__)

# Import validation functions from original codegen
# Import these after the module is set up to avoid circular imports
def _import_codegen_functions():
    """Import functions from codegen module."""
    from manim_worker.codegen import (
        check_python_compiles,
        check_manim_runs,
        write_code_to_file,
        call_claude_to_fix_manim_code,
        MAX_REPAIR_ATTEMPTS,
        MANIM_TEST_TIMEOUT,
    )
    return {
        'check_python_compiles': check_python_compiles,
        'check_manim_runs': check_manim_runs,
        'write_code_to_file': write_code_to_file,
        'call_claude_to_fix_manim_code': call_claude_to_fix_manim_code,
        'MAX_REPAIR_ATTEMPTS': MAX_REPAIR_ATTEMPTS,
        'MANIM_TEST_TIMEOUT': MANIM_TEST_TIMEOUT,
    }

# Lazy import to avoid issues
_codegen_funcs = None

def _get_codegen_funcs():
    """Get codegen functions, importing them if needed."""
    global _codegen_funcs
    if _codegen_funcs is None:
        _codegen_funcs = _import_codegen_functions()
    return _codegen_funcs
import tempfile
import importlib.util
from uuid import uuid4
from manim_worker.layout_validator import validate_layout, suggest_layout_fixes

# Try to import orchestrator
try:
    from src.agents.orchestrator import ReverseKnowledgeTreeOrchestrator, AnimationResult
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
    logger.error("  This means videos will use simple codegen (shorter, less educational)")
    logger.error("  To fix: Ensure Math-To-Manim is cloned and claude-agent-sdk is installed")
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


def _ensure_generated_scene_class(code: str) -> str:
    """
    Ensure the generated code contains 'class GeneratedScene(Scene)'.
    
    If a different scene class name is found, rename it to GeneratedScene.
    
    Args:
        code: The generated Python code
        
    Returns:
        Code with GeneratedScene class name
    """
    # Check if GeneratedScene already exists
    if 'class GeneratedScene' in code:
        return code
    
    # Look for other scene class patterns
    # Pattern: class SomeName(Scene):
    scene_class_pattern = r'class\s+(\w+)\s*\([^)]*Scene[^)]*\)\s*:'
    match = re.search(scene_class_pattern, code)
    
    if match:
        old_class_name = match.group(1)
        logger.info(f"Found scene class '{old_class_name}', renaming to 'GeneratedScene'")
        
        # Replace class definition
        code = re.sub(
            rf'class\s+{re.escape(old_class_name)}\s*\([^)]*Scene[^)]*\)\s*:',
            'class GeneratedScene(Scene):',
            code
        )
        
        # Replace any references to the old class name in the code
        # But be careful not to replace it in strings or comments
        # Simple approach: replace standalone occurrences
        code = re.sub(rf'\b{re.escape(old_class_name)}\b', 'GeneratedScene', code)
        
        logger.info("Renamed scene class to GeneratedScene")
    else:
        # No scene class found, add one
        logger.warning("No scene class found in generated code, attempting to add GeneratedScene")
        # Try to add after imports
        if 'from manim import' in code or 'import manim' in code:
            # Find the end of imports
            lines = code.split('\n')
            import_end = 0
            for i, line in enumerate(lines):
                if line.strip() and not (line.strip().startswith('#') or 
                                         line.strip().startswith('import') or 
                                         line.strip().startswith('from')):
                    import_end = i
                    break
            
            # Insert GeneratedScene class
            scene_code = """
class GeneratedScene(Scene):
    def construct(self):
        # Animation code here
        pass
"""
            lines.insert(import_end, scene_code)
            code = '\n'.join(lines)
        else:
            # Fallback: prepend basic structure
            code = """from manim import *

class GeneratedScene(Scene):
    def construct(self):
        # Animation code here
        pass
""" + code
    
    return code


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
    # Default to 4 to match Math-To-Manim's default (more comprehensive trees)
    max_depth = int(os.getenv("MATH_TO_MANIM_MAX_DEPTH", "4"))
    
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

        logger.info("")
        logger.info("🎬" + "=" * 68 + "🎬")
        logger.info("║" + " " * 68 + "║")
        logger.info("║" + " MATH-TO-MANIM ORCHESTRATOR - FULL 6-AGENT PIPELINE ".center(68) + "║")
        logger.info("║" + " " * 68 + "║")
        logger.info("🎬" + "=" * 68 + "🎬")
        logger.info("")
        logger.info("📋 INPUT:")
        logger.info(f"   • Concept: {concept}")
        logger.info(f"   • Max tree depth: {max_depth}")
        logger.info(f"   • Student context: {'Yes (' + str(len(student_context)) + ' chars)' if student_context else 'No'}")
        logger.info("")

        # Build full prompt with student context
        user_prompt = concept
        if student_context:
            user_prompt = f"{concept}\n\nStudent context: {student_context}"
            logger.info("📝 User prompt with context:")
            logger.info(f"   {user_prompt[:200]}{'...' if len(user_prompt) > 200 else ''}")

        # Initialize orchestrator
        report_progress("code_generation", "Initializing orchestrator...", 10)
        model_name = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-5")

        logger.info("")
        logger.info("⚙️  ORCHESTRATOR INITIALIZATION:")
        logger.info(f"   • Model: {model_name}")
        logger.info(f"   • Max tree depth: {max_depth}")
        logger.info(f"   • Code generation: ENABLED")
        logger.info(f"   • Nomic Atlas: DISABLED")
        logger.info("")

        orchestrator = ReverseKnowledgeTreeOrchestrator(
            model=model_name,
            max_tree_depth=max_depth,
            enable_code_generation=True,
            enable_atlas=False
        )

        logger.info("✅ Orchestrator initialized successfully")
        logger.info("")
        logger.info("🚀 STARTING 6-AGENT PIPELINE...")
        logger.info("   This will execute:")
        logger.info("   1️⃣  ConceptAnalyzer - Parse user input")
        logger.info("   2️⃣  PrerequisiteExplorer - Build knowledge tree recursively")
        logger.info("   3️⃣  MathematicalEnricher - Add LaTeX equations")
        logger.info("   4️⃣  VisualDesigner - Design visuals/colors/animations")
        logger.info("   5️⃣  NarrativeComposer - Generate verbose prompt (2000+ tokens)")
        logger.info("   6️⃣  CodeGenerator - Convert verbose prompt to Manim code")
        logger.info("")

        report_progress("code_generation", "Building knowledge tree...", 20)

        # Process through the full pipeline
        temp_output_dir = Path(tempfile.gettempdir()) / "manim_orchestrator_output"
        temp_output_dir.mkdir(exist_ok=True)

        logger.info("📂 Output directory: " + str(temp_output_dir))
        logger.info("")
        logger.info("⏳ Running orchestrator.process()...")
        logger.info("   (This may take 30-60 seconds for the full pipeline)")
        logger.info("")

        report_progress("code_generation", "Processing through orchestrator pipeline...", 30)

        import time
        start_time = time.time()
        result: AnimationResult = orchestrator.process(user_prompt, output_dir=str(temp_output_dir))
        elapsed_time = time.time() - start_time

        logger.info("")
        logger.info("✅ ORCHESTRATOR COMPLETED!")
        logger.info(f"   Execution time: {elapsed_time:.1f} seconds")
        logger.info("")
        
        report_progress("code_generation", "Code generation complete, validating...", 40)

        # Extract Manim code
        if not result.manim_code:
            logger.error("❌ CRITICAL: Orchestrator did not generate Manim code!")
            raise ValueError("Orchestrator did not generate Manim code")

        code = result.manim_code

        logger.info("📊 ORCHESTRATOR RESULTS:")
        logger.info("=" * 70)
        logger.info(f"✅ Target Concept: {result.target_concept}")
        logger.info(f"✅ Scene Count: {result.scene_count}")
        logger.info(f"✅ Total Duration: {result.total_duration} seconds")
        logger.info(f"✅ Concepts Covered: {len(result.concept_order)}")
        logger.info("")
        logger.info("📚 Concept Progression (Foundation → Target):")
        for i, concept in enumerate(result.concept_order, 1):
            marker = "🎯" if i == len(result.concept_order) else f"{i}."
            logger.info(f"   {marker} {concept}")
        logger.info("")
        logger.info("📝 Verbose Prompt Generated:")
        logger.info(f"   • Length: {len(result.verbose_prompt)} characters")
        logger.info(f"   • Preview (first 300 chars):")
        preview = result.verbose_prompt[:300].replace('\n', ' ')
        logger.info(f"     \"{preview}...\"")
        logger.info("")
        logger.info("💻 Manim Code Generated:")
        logger.info(f"   • Length: {len(code)} characters")
        logger.info(f"   • Lines: {len(code.splitlines())}")
        code_preview = '\n'.join(code.splitlines()[:15])
        logger.info(f"   • Preview (first 15 lines):")
        for line in code_preview.splitlines():
            logger.info(f"     {line}")
        if len(code.splitlines()) > 15:
            logger.info(f"     ... ({len(code.splitlines()) - 15} more lines)")
        logger.info("")
        logger.info("=" * 70)
        logger.info("✅ FULL 6-AGENT PIPELINE COMPLETED SUCCESSFULLY!")
        logger.info("=" * 70)
        logger.info("")
        logger.info("🔍 PROOF OF ORCHESTRATOR USAGE:")
        logger.info(f"   ✓ Orchestrator initialized with max_depth={max_depth}")
        logger.info(f"   ✓ orchestrator.process() called and completed")
        logger.info(f"   ✓ Knowledge tree built with {len(result.concept_order)} concepts")
        logger.info(f"   ✓ Verbose prompt generated ({len(result.verbose_prompt)} chars)")
        logger.info(f"   ✓ Manim code generated from verbose prompt ({len(code)} chars)")
        logger.info(f"   ✓ This code is now being used for rendering")
        logger.info("")

        # Validate layout (non-blocking, just warnings)
        logger.info("🔍 VALIDATION PHASE:")
        logger.info("   • Checking layout constraints...")
        is_layout_valid, layout_warnings, layout_metrics = validate_layout(code)
        if layout_warnings:
            logger.warning(f"   ⚠️  Layout validation found {len(layout_warnings)} potential issues")
            suggestions = suggest_layout_fixes(code, layout_warnings)
            if suggestions:
                logger.info(f"   💡 Layout suggestions: {suggestions}")
        else:
            logger.info("   ✅ Layout validation passed")

        # For orchestrator-generated code, use lightweight validation
        # Only check Python syntax, don't try to run it or force scene names
        logger.info("   • Checking Python syntax...")
        temp_dir = Path(tempfile.gettempdir()) / "manim_validation"
        temp_dir.mkdir(exist_ok=True)

        funcs = _get_codegen_funcs()
        tmp_path = temp_dir / f"generated_{uuid4().hex}.py"
        funcs['write_code_to_file'](code, tmp_path)

        # Check Python compilation only
        ok_py, py_err = funcs['check_python_compiles'](tmp_path)

        if not ok_py:
            logger.warning(f"   ⚠️  Python syntax error detected: {py_err}")
            logger.warning("   🔧 Attempting automatic repair...")

            # Try to repair with simple codegen's repair function
            funcs = _get_codegen_funcs()
            code = funcs['call_claude_to_fix_manim_code'](code, py_err)

            # Re-check compilation
            funcs['write_code_to_file'](code, tmp_path)
            ok_py, py_err = funcs['check_python_compiles'](tmp_path)

            if not ok_py:
                logger.error(f"   ❌ Repair failed: {py_err}")
                logger.error("   ⚠️  FALLING BACK TO SIMPLE CODEGEN")
                logger.error("   (Orchestrator code had unfixable syntax errors)")
                from manim_worker.codegen import generate_and_validate_manim_scene as simple_generate
                try:
                    tmp_path.unlink()
                except:
                    pass
                return simple_generate(concept, student_context)
            else:
                logger.info("   ✅ Code repaired successfully")
        else:
            logger.info("   ✅ Python syntax validation passed")

        # Clean up temp file
        try:
            tmp_path.unlink()
        except:
            pass

        logger.info("")
        logger.info("=" * 70)
        logger.info("✅ ORCHESTRATOR CODE VALIDATED AND READY FOR RENDERING")
        logger.info("=" * 70)
        logger.info("")
        logger.info("📤 RETURNING ORCHESTRATOR-GENERATED CODE:")
        logger.info(f"   • {len(code)} characters")
        logger.info(f"   • {len(code.splitlines())} lines")
        logger.info(f"   • {result.scene_count} scenes/concepts")
        logger.info(f"   • {result.total_duration}s estimated duration")
        logger.info("")
        logger.info("🎬 This code will now be rendered by Manim...")
        logger.info("")

        # Return the orchestrator code as-is (don't force GeneratedScene rename)
        return code

    except Exception as e:
        logger.error(f"Error in Math-To-Manim orchestrator: {e}", exc_info=True)
        logger.warning("Falling back to simple codegen")
        # Fallback to simple codegen
        from manim_worker.codegen import generate_and_validate_manim_scene as simple_generate
        return simple_generate(concept, student_context)

