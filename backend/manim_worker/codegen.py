"""
Manim code generation and validation using Claude AI
"""

import os
import re
import subprocess
import logging
import tempfile
from pathlib import Path
from uuid import uuid4
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


def call_claude_for_manim_code(concept: str, student_context: str | None = None) -> str:
    """
    Call Claude to generate initial Manim code for a concept
    
    Args:
        concept: The concept to visualize
        student_context: Optional context about the student's current work
    
    Returns:
        Raw Python code string for the Manim scene
    """
    claude_api_key = os.getenv("CLAUDE_API_KEY")
    if not claude_api_key:
        raise RuntimeError("CLAUDE_API_KEY not set in environment")
    
    client = Anthropic(api_key=claude_api_key)
    
    system_prompt = """You are an expert Manim animator and math teacher specializing in creating clear, educational visualizations.

Your task is to generate a single Manim scene as Python code that effectively explains mathematical, scientific, or computational concepts to students.

=== CODE STRUCTURE ===
You MUST use exactly this structure:
```python
from manim import *

class GeneratedScene(Scene):
    def construct(self):
        # Your animation code here
```

=== TECHNICAL CONSTRAINTS ===
1. Import: Only use `from manim import *` - no other imports
2. Class name: Must be exactly `GeneratedScene(Scene)`
3. No external dependencies: Do not use file I/O, networking, input(), or infinite loops
4. Render time: Keep total animation under 15 seconds for reasonable render times
5. Output format: Return ONLY the Python code, no markdown fences, no explanations

=== AVAILABLE MANIM FEATURES ===

Mobjects (visual elements):
- Text, MathTex, Tex (for text and equations)
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

=== ANIMATION BEST PRACTICES ===

1. STRUCTURE YOUR SCENE IN PHASES:
   Phase 1: Title/Introduction (1-2 seconds)
   - Show a clear title that identifies the concept
   - Fade in or write the title, then move it to top edge
   
   Phase 2: Setup (2-3 seconds)
   - Create axes, labels, or initial objects
   - Use Create() for axes, Write() for labels
   - Establish the visual context
   
   Phase 3: Main Animation (5-10 seconds)
   - This is the core explanation
   - Use progressive reveals - build understanding step by step
   - Animate smoothly with appropriate timing
   - Use MoveAlongPath for curves, Transform for shape changes
   
   Phase 4: Conclusion (1-2 seconds)
   - Add a key insight, label, or summary
   - Use Write() or FadeIn() for final text
   - End with a brief wait so viewers can process

2. PACE APPROPRIATELY:
   - Use self.wait() between major steps (0.5-1 second)
   - Longer animations (run_time=3-5) for complex movements
   - Shorter animations (run_time=0.5-1) for quick reveals
   - Don't rush - give viewers time to understand

3. USE VISUAL HIERARCHY:
   - Titles at top (to_edge(UP))
   - Main content centered (move_to(ORIGIN))
   - Labels/insights at bottom (to_edge(DOWN))
   - Use size differences: titles larger (font_size=48), labels smaller (font_size=24-36)

4. COLOR MEANINGFULLY:
   - RED: Important points, errors, or emphasis
   - BLUE: Axes, background elements, standard objects
   - YELLOW/GREEN: Highlights, positive indicators
   - Use consistent colors throughout the scene

5. PROGRESSIVE REVEALS:
   - Don't show everything at once
   - Build concepts step by step
   - Use FadeIn for new elements, Transform for changes
   - Show relationships before showing results

6. CLARITY OVER COMPLEXITY:
   - One main concept per scene
   - Keep it focused and understandable
   - Match animation complexity to concept complexity
   - Simple concepts = simpler animations

=== EXAMPLE STRUCTURE ===
```python
from manim import *

class GeneratedScene(Scene):
    def construct(self):
        # Phase 1: Title
        title = Text("Concept Name", font_size=48)
        self.play(Write(title))
        self.wait(0.5)
        self.play(title.animate.to_edge(UP).scale(0.7))
        
        # Phase 2: Setup
        axes = Axes(x_range=[-5, 5], y_range=[-5, 5], x_length=10, y_length=7)
        axes_labels = axes.get_axis_labels(x_label="x", y_label="y")
        self.play(Create(axes), Write(axes_labels))
        self.wait(0.5)
        
        # Phase 3: Main animation
        dot = Dot(axes.c2p(0, 0), color=RED)
        self.play(Create(dot))
        # ... main animation logic ...
        
        # Phase 4: Conclusion
        insight = Text("Key Insight", font_size=36).to_edge(DOWN)
        self.play(Write(insight))
        self.wait(2)
```

Remember: Your goal is to create an animation that a student can watch and understand the concept clearly. Prioritize clarity, pacing, and educational value."""
    
    user_prompt = f"""=== CONCEPT TO VISUALIZE ===
{concept}

=== STUDENT CONTEXT ===
{student_context if student_context else "No specific student context provided."}

=== YOUR TASK ===
Design a clear, intuitive animation that explains this concept to a student.

Consider:
- What is the core idea that needs to be visualized?
- What visual elements will best convey this concept?
- How can you build understanding progressively?
- What pacing will help the student follow along?

Follow all the system constraints and best practices.
Return ONLY the complete Python source code for the scene - no markdown, no explanations, just the code."""
    
    try:
        response = client.messages.create(
            model="claude-3-5-haiku-20241022",
            max_tokens=2048,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}]
        )
        
        code = response.content[0].text
        
        # Strip markdown code fences if present
        code = re.sub(r'^```python\s*\n', '', code, flags=re.MULTILINE)
        code = re.sub(r'^```\s*\n', '', code, flags=re.MULTILINE)
        code = re.sub(r'\n```\s*$', '', code, flags=re.MULTILINE)
        code = code.strip()
        
        return code
        
    except Exception as e:
        logger.error(f"Error calling Claude for code generation: {e}", exc_info=True)
        raise RuntimeError(f"Failed to generate Manim code: {e}")


def call_claude_to_fix_manim_code(previous_code: str, error_output: str) -> str:
    """
    Call Claude to fix Manim code that failed to compile or run
    
    Args:
        previous_code: The code that failed
        error_output: The error message from compilation or execution
    
    Returns:
        Corrected Python code string
    """
    claude_api_key = os.getenv("CLAUDE_API_KEY")
    if not claude_api_key:
        raise RuntimeError("CLAUDE_API_KEY not set in environment")
    
    client = Anthropic(api_key=claude_api_key)
    
    system_prompt = """You are an expert Manim animator and math teacher specializing in debugging and fixing Manim code.

Your task is to fix a Manim scene that failed to compile or run, while maintaining the original educational intent.

=== CODE STRUCTURE ===
You MUST use exactly this structure:
```python
from manim import *

class GeneratedScene(Scene):
    def construct(self):
        # Your animation code here
```

=== TECHNICAL CONSTRAINTS ===
1. Import: Only use `from manim import *` - no other imports
2. Class name: Must be exactly `GeneratedScene(Scene)`
3. No external dependencies: Do not use file I/O, networking, input(), or infinite loops
4. Render time: Keep total animation under 15 seconds for reasonable render times
5. Output format: Return ONLY the corrected Python code, no markdown fences, no explanations

=== AVAILABLE MANIM FEATURES ===

Mobjects (visual elements):
- Text, MathTex, Tex (for text and equations)
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

=== FIXING STRATEGY ===
1. Read the error message carefully - it tells you what went wrong
2. Identify the specific line or operation causing the issue
3. Fix the error while preserving the original animation intent
4. Ensure the fixed code follows all constraints
5. Test your mental model: would this code compile and run?

Remember: Fix the error, but keep the same teaching concept and visual approach."""
    
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
   - Uses only `from manim import *`
   - Has class name `GeneratedScene(Scene)`
   - Follows all technical constraints
   - Maintains the original teaching concept

Return ONLY the corrected Python source code - no markdown, no explanations, just the fixed code."""
    
    try:
        response = client.messages.create(
            model="claude-3-5-haiku-20241022",
            max_tokens=2048,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}]
        )
        
        code = response.content[0].text
        
        # Strip markdown code fences if present
        code = re.sub(r'^```python\s*\n', '', code, flags=re.MULTILINE)
        code = re.sub(r'^```\s*\n', '', code, flags=re.MULTILINE)
        code = re.sub(r'\n```\s*$', '', code, flags=re.MULTILINE)
        code = code.strip()
        
        return code
        
    except Exception as e:
        logger.error(f"Error calling Claude for code repair: {e}", exc_info=True)
        raise RuntimeError(f"Failed to repair Manim code: {e}")


def write_code_to_file(code: str, path: Path) -> None:
    """
    Write code to a file
    
    Args:
        code: Python code string
        path: Path to write to
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(code)


def check_python_compiles(path: Path) -> tuple[bool, str]:
    """
    Check if Python code compiles without syntax errors
    
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


def check_manim_runs(path: Path, scene_class: str = "GeneratedScene") -> tuple[bool, str]:
    """
    Check if Manim scene runs successfully in low quality mode
    
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


def generate_and_validate_manim_scene(
    concept: str,
    student_context: str | None = None,
) -> str:
    """
    High-level orchestration:
    - Ask Claude to generate Manim code for a scene.
    - Compile + test-run the code.
    - If it fails, ask Claude to fix it (loop).
    - Return the final, validated Python source code string.
    
    Args:
        concept: The concept to visualize
        student_context: Optional context about the student's current work
    
    Returns:
        Validated Python code string
    
    Raises:
        RuntimeError: If code generation/validation fails after max attempts
    """
    logger.info(f"Generating Manim scene for concept: {concept}")
    
    # Initial generation
    code = call_claude_for_manim_code(concept, student_context)
    
    attempt = 0
    last_error = ""
    
    # Create a temporary directory for validation
    temp_dir = Path(tempfile.gettempdir()) / "manim_validation"
    temp_dir.mkdir(exist_ok=True)
    
    while attempt <= MAX_REPAIR_ATTEMPTS:
        attempt += 1
        logger.info(f"Validation attempt {attempt}/{MAX_REPAIR_ATTEMPTS + 1}")
        
        # Write to a temp file
        tmp_path = temp_dir / f"generated_{uuid4().hex}.py"
        write_code_to_file(code, tmp_path)
        
        # Check Python compilation
        ok_py, py_err = check_python_compiles(tmp_path)
        if not ok_py:
            last_error = f"Python compilation error: {py_err}"
            logger.warning(f"Attempt {attempt}: {last_error}")
            
            if attempt > MAX_REPAIR_ATTEMPTS:
                # Clean up temp file
                try:
                    tmp_path.unlink()
                except:
                    pass
                break
            
            # Ask Claude to fix it
            logger.info(f"Requesting code repair (attempt {attempt})...")
            code = call_claude_to_fix_manim_code(code, last_error)
            continue
        
        # Check Manim execution
        ok_manim, manim_err = check_manim_runs(tmp_path, scene_class="GeneratedScene")
        if not ok_manim:
            last_error = f"Manim execution error: {manim_err}"
            logger.warning(f"Attempt {attempt}: {last_error}")
            
            if attempt > MAX_REPAIR_ATTEMPTS:
                # Clean up temp file
                try:
                    tmp_path.unlink()
                except:
                    pass
                break
            
            # Ask Claude to fix it
            logger.info(f"Requesting code repair (attempt {attempt})...")
            code = call_claude_to_fix_manim_code(code, last_error)
            continue
        
        # Success!
        logger.info(f"Code validation successful after {attempt} attempt(s)")
        
        # Clean up temp file
        try:
            tmp_path.unlink()
        except:
            pass
        
        return code
    
    # If we get here, all attempts failed
    raise RuntimeError(
        f"Failed to generate runnable Manim scene after {MAX_REPAIR_ATTEMPTS} attempts. "
        f"Last error: {last_error}"
    )

