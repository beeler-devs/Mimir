"""
Shared validation utilities for Manim code generation.

This module provides common validation functions used by both simple and
enhanced code generation pipelines to avoid code duplication.
"""

import os
import re
import subprocess
import logging
from pathlib import Path
from typing import Tuple

from anthropic import Anthropic
from dotenv import load_dotenv

# Load environment variables
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path, override=True)

logger = logging.getLogger(__name__)

# Maximum number of repair attempts
MAX_REPAIR_ATTEMPTS = 3

# Timeout for Manim test renders (seconds)
MANIM_TEST_TIMEOUT = 30


def write_code_to_file(code: str, path: Path) -> None:
    """
    Write code to a file.
    
    Args:
        code: Python code string
        path: Path to write to
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(code)


def check_python_compiles(path: Path) -> Tuple[bool, str]:
    """
    Check if Python code compiles without syntax errors.
    
    Args:
        path: Path to Python file
    
    Returns:
        Tuple of (success, error_output)
    """
    try:
        result = subprocess.run(
            ["python", "-m", "py_compile", str(path)],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0:
            return True, ""
        else:
            error_output = result.stderr + result.stdout
            return False, error_output
            
    except subprocess.TimeoutExpired:
        return False, "Compilation timeout"
    except Exception as e:
        return False, f"Compilation error: {str(e)}"


def check_manim_runs(path: Path, scene_class: str = "GeneratedScene") -> Tuple[bool, str]:
    """
    Check if Manim scene runs successfully in low quality mode.
    
    Args:
        path: Path to Python file containing the scene
        scene_class: Name of the scene class to render
    
    Returns:
        Tuple of (success, error_output)
    """
    try:
        result = subprocess.run(
            ["manim", str(path), scene_class, "-ql", "--disable_caching"],
            capture_output=True,
            text=True,
            timeout=MANIM_TEST_TIMEOUT
        )
        
        if result.returncode == 0:
            return True, ""
        else:
            error_output = result.stderr + result.stdout
            return False, error_output
            
    except subprocess.TimeoutExpired:
        return False, f"Manim render timeout (>{MANIM_TEST_TIMEOUT}s)"
    except Exception as e:
        return False, f"Manim execution error: {str(e)}"


def ensure_scene_class(code: str, class_name: str = "GeneratedScene") -> str:
    """
    Ensure the generated code contains the specified scene class.
    
    If a different scene class name is found, rename it to the target class name.
    If no scene class is found, add one.
    
    Args:
        code: The generated Python code
        class_name: The target scene class name (default: "GeneratedScene")
    
    Returns:
        Code with the target scene class name
    """
    # Check if target class already exists
    if f'class {class_name}' in code:
        return code
    
    # Look for other scene class patterns
    # Pattern: class SomeName(Scene):
    scene_class_pattern = r'class\s+(\w+)\s*\([^)]*Scene[^)]*\)\s*:'
    match = re.search(scene_class_pattern, code)
    
    if match:
        old_class_name = match.group(1)
        logger.info(f"Found scene class '{old_class_name}', renaming to '{class_name}'")
        
        # Replace class definition
        code = re.sub(
            rf'class\s+{re.escape(old_class_name)}\s*\([^)]*Scene[^)]*\)\s*:',
            f'class {class_name}(Scene):',
            code
        )
        
        # Replace any references to the old class name in the code
        # But be careful not to replace it in strings or comments
        # Simple approach: replace standalone occurrences
        code = re.sub(rf'\b{re.escape(old_class_name)}\b', class_name, code)
        
        logger.info(f"Renamed scene class to {class_name}")
    else:
        # No scene class found, add one
        logger.warning(f"No scene class found in generated code, attempting to add {class_name}")
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
            
            # Insert scene class
            scene_code = f"""
class {class_name}(Scene):
    def construct(self):
        # Animation code here
        pass
"""
            lines.insert(import_end, scene_code)
            code = '\n'.join(lines)
        else:
            # Fallback: prepend basic structure
            code = f"""from manim import *

class {class_name}(Scene):
    def construct(self):
        # Animation code here
        pass
""" + code
    
    return code


def repair_code_with_claude(previous_code: str, error_output: str) -> str:
    """
    Call Claude to fix Manim code that failed to compile or run.
    
    Always uses Sonnet for repairs as it's more reliable at error fixing.
    
    Args:
        previous_code: The code that failed
        error_output: The error message from compilation or execution
    
    Returns:
        Corrected Python code string
    
    Raises:
        RuntimeError: If code repair fails with all available models
    """
    claude_api_key = os.getenv("CLAUDE_API_KEY")
    if not claude_api_key:
        raise RuntimeError("CLAUDE_API_KEY not set in environment")
    
    client = Anthropic(api_key=claude_api_key)
    
    # Try to use Sonnet for repairs (better at error fixing), but fall back to Haiku if Sonnet isn't available
    repair_model = os.getenv("MANIM_REPAIR_MODEL", "claude-haiku-4-5")
    fallback_model = "claude-haiku-4-5"  # Known working model
    
    system_prompt = """You are an expert Manim animator and math teacher specializing in debugging and fixing Manim code.

Your task is to fix a Manim scene that failed to compile or run, while maintaining the original educational intent.

=== CODE STRUCTURE ===
You MUST use exactly this structure:
```python
from manim import *
import numpy as np

class GeneratedScene(Scene):
    def construct(self):
        # Your animation code here
```

=== TECHNICAL CONSTRAINTS ===
1. Imports: You may use `from manim import *` and `import numpy as np` - no other imports
2. Class name: Must be exactly `GeneratedScene(Scene)`
3. No external dependencies: Do not use file I/O, networking, input(), or infinite loops
4. Render time: Keep total animation under 15 seconds for reasonable render times
5. Output format: Return ONLY the corrected Python code, no markdown fences, no explanations
6. NumPy usage: Use numpy for mathematical calculations, random number generation, and array operations

=== AVAILABLE MANIM FEATURES ===

Mobjects (visual elements):
- Text, MathTex, Tex (for text and equations)
  IMPORTANT: MathTex already puts content in math mode - NEVER use $ signs inside MathTex!
  ✓ Correct: MathTex(r"a"), MathTex(r"\\vec{v}"), MathTex(r"\\frac{1}{2}")
  ✗ Wrong: MathTex(r"$a$"), MathTex(r"$\\vec{v}$") - These will cause LaTeX errors!
- Dot, Circle, Square, Rectangle, Polygon, Line, Arrow
- NumberPlane, Axes (for coordinate systems)
- VGroup (for grouping objects)
- Colors: RED, BLUE, GREEN, YELLOW, ORANGE, PURPLE, PINK, WHITE, BLACK, GRAY

Animations:
- Create, Write, FadeIn, FadeOut, Transform
- Rotate, Scale, Shift, MoveAlongPath
- Succession (chain animations), AnimationGroup (parallel animations)

Layout methods:
- to_edge(UP/DOWN/LEFT/RIGHT), next_to(), move_to(), arrange()
- Positioning: ORIGIN, UP, DOWN, LEFT, RIGHT, UL, UR, DL, DR

=== COMMON ERRORS TO FIX ===
- Syntax errors: Missing colons, incorrect indentation, typos
- Import errors: Using unavailable modules or functions
- Attribute errors: Incorrect method names or properties
- Type errors: Passing wrong types to functions
- Runtime errors: Logic errors, infinite loops, missing waits
- LaTeX errors with MathTex: If you see "LaTeX compilation error" with MathTex, check for:
  * Dollar signs ($) inside MathTex - REMOVE THEM! MathTex is already in math mode.
  * Example: Change MathTex(r"$a$") to MathTex(r"a")
  * Example: Change MathTex(r"$\\frac{1}{2}$") to MathTex(r"\\frac{1}{2}")
- Layout errors: Elements positioned outside visible bounds or overlapping
  * Keep all content within: x ∈ [-6, 6], y ∈ [-3.5, 3.5]
  * Space elements at least 0.5 units apart
  * Use to_edge(), next_to(), and move_to() properly

=== FIXING STRATEGY ===
1. Read the error message carefully - it tells you what went wrong
2. Identify the specific line or operation causing the issue
3. Fix the error while preserving the original animation intent
4. Ensure the fixed code follows all constraints (including layout bounds)
5. Test your mental model: would this code compile and run?
6. Check that all elements stay within visible screen bounds

Remember: Fix the error, but keep the same teaching concept and visual approach. **Ensure proper layout and spacing.**"""
    
    user_prompt = f"""=== ERROR OUTPUT ===
{error_output}

=== PREVIOUS CODE (WITH ERROR) ===
{previous_code}

=== YOUR TASK ===
Fix the error(s) in the code above while maintaining the same educational intent and animation concept.

Steps:
1. Analyze the error message to understand what went wrong
2. Identify the problematic code section
3. Fix the error using correct Manim syntax and available features
4. Ensure the corrected code:
   - Uses only `from manim import *` and optionally `import numpy as np`
   - Has class name `GeneratedScene(Scene)`
   - Follows all technical constraints
   - Maintains the original teaching concept

Return ONLY the corrected Python source code - no markdown, no explanations, just the fixed code."""
    
    # Try the primary repair model, fall back to Haiku if it fails
    models_to_try = [repair_model]
    if repair_model != fallback_model:
        models_to_try.append(fallback_model)
    
    last_error = None
    for model in models_to_try:
        try:
            logger.info(f"Attempting code repair with {model}")
            response = client.messages.create(
                model=model,
                max_tokens=4096,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}]
            )
            
            code = response.content[0].text
            
            # Strip markdown code fences if present
            code = re.sub(r'^```python\s*\n', '', code, flags=re.MULTILINE)
            code = re.sub(r'^```\s*\n', '', code, flags=re.MULTILINE)
            code = re.sub(r'\n```\s*$', '', code, flags=re.MULTILINE)
            code = code.strip()
            
            logger.info(f"Successfully repaired code using {model}")
            return code
            
        except Exception as e:
            last_error = e
            if "not_found_error" in str(e) or "404" in str(e):
                logger.warning(f"Model {model} not found, trying fallback...")
                continue
            else:
                # For other errors, log and try next model
                logger.warning(f"Error with model {model}: {e}, trying fallback...")
                continue
    
    # If all models failed, raise the last error
    logger.error(f"All repair models failed. Last error: {last_error}", exc_info=True)
    raise RuntimeError(f"Failed to repair Manim code with any available model: {last_error}")

