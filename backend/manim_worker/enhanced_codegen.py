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
# Path from backend/manim_worker to manim-to-code/Math-To-Manim/src
_current_file = Path(__file__).resolve()
_math_to_manim_path = _current_file.parent.parent.parent / "manim-to-code" / "Math-To-Manim" / "src"
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
    logger.error("  This means videos will use simple codegen (shorter, less educational)")
    logger.error("  To fix: Ensure claude-agent-sdk is installed: pip install claude-agent-sdk")
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
        temp_output_dir = Path(tempfile.gettempdir()) / "manim_orchestrator_output"
        temp_output_dir.mkdir(exist_ok=True)
        
        report_progress("code_generation", "Processing through orchestrator pipeline...", 30)
        result: AnimationResult = orchestrator.process(user_prompt, output_dir=str(temp_output_dir))
        
        report_progress("code_generation", "Code generation complete, validating...", 40)
        
        # Extract Manim code
        if not result.manim_code:
            raise ValueError("Orchestrator did not generate Manim code")
        
        code = result.manim_code
        
        # Ensure GeneratedScene class name
        code = _ensure_generated_scene_class(code)

        logger.info("=" * 70)
        logger.info(f"✓ Orchestrator generated code ({len(code)} characters)")
        logger.info("  Full 6-agent pipeline completed successfully!")
        logger.info("=" * 70)

        # Validate layout before testing execution
        is_layout_valid, layout_warnings, layout_metrics = validate_layout(code)
        if layout_warnings:
            logger.warning(f"Layout validation found {len(layout_warnings)} potential issues")
            suggestions = suggest_layout_fixes(code, layout_warnings)
            if suggestions:
                logger.info(suggestions)

        # Validate the code using the same validation pipeline as simple codegen
        attempt = 0
        last_error = ""
        
        # Create a temporary directory for validation
        temp_dir = Path(tempfile.gettempdir()) / "manim_validation"
        temp_dir.mkdir(exist_ok=True)
        
        funcs = _get_codegen_funcs()
        max_attempts = funcs['MAX_REPAIR_ATTEMPTS']
        
        while attempt <= max_attempts:
            attempt += 1
            logger.info(f"Validation attempt {attempt}/{max_attempts + 1}")
            
            # Write to a temp file
            funcs = _get_codegen_funcs()
            tmp_path = temp_dir / f"generated_{uuid4().hex}.py"
            funcs['write_code_to_file'](code, tmp_path)
            
            # Check Python compilation
            ok_py, py_err = funcs['check_python_compiles'](tmp_path)
            if not ok_py:
                last_error = f"Python compilation error: {py_err}"
                logger.warning(f"Attempt {attempt}: {last_error}")
                
                if attempt > max_attempts:
                    try:
                        tmp_path.unlink()
                    except:
                        pass
                    break
                
                # Fall back to simple codegen for repair
                logger.info("Falling back to simple codegen for code repair...")
                funcs = _get_codegen_funcs()
                code = funcs['call_claude_to_fix_manim_code'](code, last_error)
                code = _ensure_generated_scene_class(code)
                continue
            
            # Verify GeneratedScene class exists in code
            if 'class GeneratedScene' not in code:
                last_error = "Generated code does not contain 'class GeneratedScene' definition"
                logger.warning(f"Attempt {attempt}: {last_error}")
                
                if attempt > max_attempts:
                    try:
                        tmp_path.unlink()
                    except:
                        pass
                    break
                
                # Try to fix class name again
                code = _ensure_generated_scene_class(code)
                continue
            
            # Check Manim execution
            funcs = _get_codegen_funcs()
            ok_manim, manim_err = funcs['check_manim_runs'](tmp_path, scene_class="GeneratedScene")
            if not ok_manim:
                last_error = f"Manim execution error: {manim_err}"
                logger.warning(f"Attempt {attempt}: {last_error}")
                
                if attempt > max_attempts:
                    try:
                        tmp_path.unlink()
                    except:
                        pass
                    break
                
                # Fall back to simple codegen for repair
                logger.info("Falling back to simple codegen for code repair...")
                funcs = _get_codegen_funcs()
                code = funcs['call_claude_to_fix_manim_code'](code, last_error)
                code = _ensure_generated_scene_class(code)
                continue
            
            # Additional validation: Try to import and verify class exists
            try:
                spec = importlib.util.spec_from_file_location("temp_scene", tmp_path)
                if spec and spec.loader:
                    temp_module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(temp_module)
                    if not hasattr(temp_module, 'GeneratedScene'):
                        last_error = "GeneratedScene class not found after import (class may be defined incorrectly)"
                        logger.warning(f"Attempt {attempt}: {last_error}")
                        
                        funcs = _get_codegen_funcs()
                        if attempt > max_attempts:
                            try:
                                tmp_path.unlink()
                            except:
                                pass
                            break
                        
                        code = _ensure_generated_scene_class(code)
                        continue
            except Exception as import_err:
                last_error = f"Import validation error: {import_err}"
                logger.warning(f"Attempt {attempt}: {last_error}")
                
                funcs = _get_codegen_funcs()
                if attempt > max_attempts:
                    try:
                        tmp_path.unlink()
                    except:
                        pass
                    break
                
                code = funcs['call_claude_to_fix_manim_code'](code, last_error)
                code = _ensure_generated_scene_class(code)
                continue
            
            # Success!
            logger.info(f"Code validation successful after {attempt} attempt(s)")
            
            # Clean up temp file
            try:
                tmp_path.unlink()
            except:
                pass
            
            return code
        
        # If we get here, validation failed - fall back to simple codegen
        funcs = _get_codegen_funcs()
        logger.warning(f"Orchestrator code validation failed after {funcs['MAX_REPAIR_ATTEMPTS']} attempts. "
                      f"Falling back to simple codegen. Last error: {last_error}")
        from manim_worker.codegen import generate_and_validate_manim_scene as simple_generate
        return simple_generate(concept, student_context)
        
    except Exception as e:
        logger.error(f"Error in Math-To-Manim orchestrator: {e}", exc_info=True)
        logger.warning("Falling back to simple codegen")
        # Fallback to simple codegen
        from manim_worker.codegen import generate_and_validate_manim_scene as simple_generate
        return simple_generate(concept, student_context)

