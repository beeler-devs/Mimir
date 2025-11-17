"""
Manim code generation and validation using Claude AI
"""

import os
import re
import subprocess
import logging
import tempfile
import importlib.util
from pathlib import Path
from uuid import uuid4
from anthropic import Anthropic
from dotenv import load_dotenv
from manim_worker.layout_validator import validate_layout, suggest_layout_fixes

# Load environment variables
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path, override=True)

logger = logging.getLogger(__name__)

# Maximum number of repair attempts
MAX_REPAIR_ATTEMPTS = 3

# Timeout for Manim test renders (seconds)
MANIM_TEST_TIMEOUT = 30


def _detect_concept_type(concept: str) -> str:
    """
    Detect the type of concept based on keywords
    
    Args:
        concept: The concept description
    
    Returns:
        Concept type string
    """
    concept_lower = concept.lower()
    
    if any(word in concept_lower for word in ["function", "graph", "plot", "curve", "derivative", "integral", "sin", "cos", "exp", "log"]):
        return "mathematical_function"
    elif any(word in concept_lower for word in ["random", "walk", "brownian", "stochastic", "probability", "distribution", "sampling"]):
        return "statistics_probability"
    elif any(word in concept_lower for word in ["matrix", "transform", "vector", "linear", "rotation", "translation"]):
        return "geometry_transform"
    elif any(word in concept_lower for word in ["motion", "velocity", "acceleration", "force", "wave", "physics", "trajectory"]):
        return "physics_motion"
    elif any(word in concept_lower for word in ["algorithm", "sort", "search", "tree", "graph", "data structure"]):
        return "algorithm_cs"
    elif any(word in concept_lower for word in ["circle", "square", "triangle", "polygon", "angle", "geometry", "proof"]):
        return "geometry_shapes"
    else:
        return "general"


def assess_animation_complexity(concept: str, student_context: str | None = None) -> dict:
    """
    Assess the complexity of an animation concept to determine which model to use
    
    Args:
        concept: The concept to visualize
        student_context: Optional context about the student's current work
    
    Returns:
        Dictionary with model selection, complexity score, reasoning, and factors
    """
    score = 0.0
    factors = {}
    
    concept_lower = concept.lower()
    
    # Keyword-based complexity (0.0-0.4 points)
    simple_keywords = ["plot", "graph", "show", "display", "visualize"]
    medium_keywords = ["function", "curve", "transform", "motion", "random walk"]
    complex_keywords = ["algorithm", "multi-step", "interaction", "system", "network", 
                       "recursive", "sorting", "searching", "tree", "graph structure"]
    
    if any(kw in concept_lower for kw in complex_keywords):
        score += 0.4
        factors["keywords"] = "complex"
    elif any(kw in concept_lower for kw in medium_keywords):
        score += 0.2
        factors["keywords"] = "medium"
    elif any(kw in concept_lower for kw in simple_keywords):
        score += 0.1
        factors["keywords"] = "simple"
    else:
        factors["keywords"] = "none"
    
    # Description length (0.0-0.2 points)
    word_count = len(concept.split())
    if word_count > 20:
        score += 0.2
        factors["length"] = "long"
    elif word_count > 10:
        score += 0.1
        factors["length"] = "medium"
    else:
        factors["length"] = "short"
    
    # Student context (0.0-0.2 points)
    if student_context:
        context_lower = student_context.lower()
        if any(word in context_lower for word in ["advanced", "graduate", "research"]):
            score += 0.2
            factors["context"] = "advanced"
        elif any(word in context_lower for word in ["multiple", "several", "complex"]):
            score += 0.1
            factors["context"] = "mentions_complexity"
        else:
            factors["context"] = "standard"
    else:
        factors["context"] = "none"
    
    # Concept type detection (0.0-0.2 points)
    concept_type = _detect_concept_type(concept)
    factors["concept_type"] = concept_type
    
    if concept_type == "algorithm_cs":
        score += 0.2
    elif concept_type in ["physics_motion", "statistics_probability"]:
        score += 0.1
    elif concept_type == "geometry_transform":
        score += 0.1
    
    # Get threshold and force model from environment
    threshold = float(os.getenv("MANIM_MODEL_THRESHOLD", "0.5"))
    force_model = os.getenv("MANIM_FORCE_MODEL", "").lower()
    default_model = os.getenv("MANIM_DEFAULT_MODEL", "haiku").lower()
    
    # Model selection
    if force_model == "haiku":
        model = "claude-haiku-4-5"
        reasoning = f"Force override to Haiku (score: {score:.2f})"
    elif force_model == "sonnet":
        model = "claude-sonnet-4-5"
        reasoning = f"Force override to Sonnet (score: {score:.2f})"
    elif score >= threshold:
        model = "claude-sonnet-4-5"
        reasoning = f"Complex animation (score: {score:.2f} >= {threshold}) - using Sonnet"
    else:
        model = "claude-haiku-4-5"
        reasoning = f"Simple animation (score: {score:.2f} < {threshold}) - using Haiku"
    
    return {
        "model": model,
        "complexity_score": score,
        "reasoning": reasoning,
        "factors": factors
    }


def _get_concept_specific_guidance(concept_type: str) -> str:
    """
    Get concept-specific guidance for the user prompt
    
    Args:
        concept_type: Type of concept (mathematical_function, statistics_probability, etc.)
    
    Returns:
        Guidance string for the concept type
    """
    guidance_map = {
        "mathematical_function": """- Use Axes to plot the function
- Create smooth curves using VMobject.set_points_as_corners()
- Show key features: intercepts, extrema, asymptotes
- Use different colors for different functions if comparing
- Consider showing transformations (shifts, stretches) if relevant""",
        
        "statistics_probability": """- Use random number generation (np.random) for stochastic processes
- For random walks, generate path points and animate with MoveAlongPath
- Use NumberLine for 1D processes, Axes for 2D
- Show multiple samples or iterations to demonstrate randomness
- Consider using dots or particles to represent data points""",
        
        "geometry_transform": """- Use NumberPlane for coordinate transformations
- Show before/after states clearly
- Use Transform or ApplyMethod for smooth transitions
- Display transformation matrices with MathTex
- Use arrows to show vector transformations""",
        
        "physics_motion": """- Animate trajectories with MoveAlongPath
- Use Arrow objects for vectors (velocity, force, acceleration)
- NumberLine for 1D motion, Axes for 2D/3D
- Show multiple particles for systems
- Use color coding: different colors for different physical quantities""",
        
        "algorithm_cs": """- Break down into clear sequential steps
- Use Transform to show state changes
- Highlight current step with color changes
- Use VGroups to represent data structures
- Show comparisons side-by-side if relevant""",
        
        "geometry_shapes": """- Use NumberPlane for coordinate geometry
- Transform shapes smoothly (Circle → Square, etc.)
- Show geometric relationships with lines and angles
- Use VGroup to combine related shapes
- Highlight important elements (angles, lengths) with colors""",
        
        "general": """- Choose the most appropriate visualization approach
- Consider if this is a function, process, transformation, or static concept
- Use progressive reveals to build understanding
- Keep it clear and focused on the main idea"""
    }
    
    return guidance_map.get(concept_type, guidance_map["general"])


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
    
    # Assess complexity and select appropriate model
    assessment = assess_animation_complexity(concept, student_context)
    selected_model = assessment["model"]
    complexity_score = assessment["complexity_score"]
    reasoning = assessment["reasoning"]
    
    # Log model selection decision
    logger.info(
        f"Model selection - concept: \"{concept[:50]}...\", "
        f"score: {complexity_score:.2f}, "
        f"model: {selected_model.split('-')[1]}, "
        f"reasoning: {reasoning}"
    )
    
    system_prompt = """You are an expert Manim animator and math teacher specializing in creating clear, educational visualizations.

Your task is to generate a single Manim scene as Python code that effectively explains mathematical, scientific, or computational concepts to students.

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
5. Output format: Return ONLY the Python code, no markdown fences, no explanations
6. NumPy usage: Use numpy for mathematical calculations, random number generation, and array operations

=== AVAILABLE MANIM FEATURES ===

Mobjects (visual elements):
- Text, MathTex, Tex (for text and equations)
  IMPORTANT: MathTex already puts content in math mode - NEVER use $ signs inside MathTex!
  ✓ Correct: MathTex(r"a"), MathTex(r"\vec{v}"), MathTex(r"\frac{1}{2}")
  ✗ Wrong: MathTex(r"$a$"), MathTex(r"$\vec{v}$") - These will cause LaTeX errors!
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

=== CONCEPT-SPECIFIC GUIDANCE ===

**Mathematical Functions:**
- Use Axes for plotting functions
- Create parametric curves with numpy: `points = [axes.c2p(x, func(x)) for x in np.linspace(-5, 5, 100)]`
- Use VMobject.set_points_as_corners() for smooth curves
- Show derivatives/integrals with tangent lines or shaded areas
- Animate function transformations (shifts, stretches, reflections)

**Geometry & Shapes:**
- Use NumberPlane for coordinate geometry
- Transform shapes: Circle → Square, scaling, rotation
- Show geometric proofs step-by-step
- Use VGroup to combine related shapes
- Highlight angles, lengths, or relationships

**Physics & Motion:**
- Animate trajectories with MoveAlongPath
- Show vectors with Arrow objects
- Use NumberLine for 1D motion
- Create particle systems with multiple dots
- Show forces, velocities, accelerations as arrows

**Statistics & Probability:**
- Use random number generation: np.random.uniform(), np.random.choice()
- Create histograms or distributions
- Animate sampling processes
- Show random walks or stochastic processes
- Use dots or bars to represent data

**Algorithms & CS:**
- Step-by-step processes with clear transitions
- Use Transform to show state changes
- Highlight current step with color changes
- Show data structures with VGroups
- Animate sorting, searching, or transformations

=== ADVANCED TECHNIQUES ===

**Path Generation:**
```python
# Generate smooth path from points
path_points = [(x, y) for x, y in zip(np.linspace(-5, 5, 100), func_values)]
path = VMobject()
path.set_points_as_corners([axes.c2p(x, y) for x, y in path_points])
path.set_color(YELLOW)
```

**Random Processes:**
```python
np.random.seed(42)  # For reproducibility
for _ in range(n_steps):
    angle = np.random.uniform(0, 2 * np.pi)
    dx = step_size * np.cos(angle)
    dy = step_size * np.sin(angle)
```

**Tracing Paths:**
```python
# Animate object while creating path
self.play(
    MoveAlongPath(dot, path, rate_func=linear),
    Create(path),  # Create path simultaneously
    run_time=5
)
```

**Multi-step Processes:**
```python
# Show steps sequentially
for step in steps:
    self.play(Create(step), run_time=0.5)
    self.wait(0.3)
```

**Emphasis & Highlighting:**
```python
# Highlight important elements
highlight = Circle(radius=0.5, color=YELLOW, stroke_width=3)
highlight.move_to(important_point)
self.play(Create(highlight))
self.wait(0.5)
self.play(FadeOut(highlight))
```

=== COMMON VISUALIZATION PATTERNS ===

**Pattern 1: Random Walk (2D)**
```python
# Generate random walk path
path_points = [(0, 0)]
for _ in range(n_steps):
    angle = np.random.uniform(0, 2 * np.pi)
    dx = step_size * np.cos(angle)
    dy = step_size * np.sin(angle)
    new_x = np.clip(prev_x + dx, -4.5, 4.5)
    new_y = np.clip(prev_y + dy, -4.5, 4.5)
    path_points.append((new_x, new_y))

# Create and animate path
path = VMobject()
path.set_points_as_corners([axes.c2p(x, y) for x, y in path_points])
self.play(MoveAlongPath(dot, path), Create(path), run_time=8)
```

**Pattern 2: Function Plotting**
```python
# Create function curve
x_values = np.linspace(-5, 5, 100)
y_values = [func(x) for x in x_values]
points = [axes.c2p(x, y) for x, y in zip(x_values, y_values)]
curve = VMobject()
curve.set_points_as_corners(points)
self.play(Create(curve), run_time=3)
```

**Pattern 3: Step-by-step Process**
```python
# Show process steps
for i, step in enumerate(steps):
    step_obj = Create(step)
    label = Text(f"Step {i+1}", font_size=24).next_to(step, UP)
    self.play(step_obj, Write(label))
    self.wait(0.5)
    self.play(FadeOut(label))
```

**Pattern 4: Transformations**
```python
# Show before/after transformation
original = Circle(radius=1, color=BLUE)
transformed = Square(side_length=2, color=RED)
self.play(Create(original))
self.wait(1)
self.play(Transform(original, transformed), run_time=2)
```

=== REAL EXAMPLES FROM WORKING SCENES ===

**Example 1: Brownian Motion (Random Walk 2D)**
```python
# Title
title = Text("Brownian Motion", font_size=48)
self.play(Write(title))
self.wait(0.5)
self.play(FadeOut(title))

# Setup axes
axes = Axes(x_range=[-5, 5, 1], y_range=[-5, 5, 1], x_length=10, y_length=7)
axes_labels = axes.get_axis_labels(x_label="x", y_label="y")
self.play(Create(axes), Write(axes_labels))

# Create particle
dot = Dot(axes.c2p(0, 0), color=RED, radius=0.1)
self.play(Create(dot))

# Generate and animate path
np.random.seed(42)
path_points = [(0, 0)]
for _ in range(100):
    angle = np.random.uniform(0, 2 * np.pi)
    dx = 0.3 * np.cos(angle)
    dy = 0.3 * np.sin(angle)
    new_x = np.clip(path_points[-1][0] + dx, -4.5, 4.5)
    new_y = np.clip(path_points[-1][1] + dy, -4.5, 4.5)
    path_points.append((new_x, new_y))

path = VMobject()
path.set_points_as_corners([axes.c2p(x, y) for x, y in path_points])
path.set_color(YELLOW)
self.play(MoveAlongPath(dot, path), Create(path), run_time=8)
```

**Example 2: 1D Random Walk**
```python
# Number line setup
number_line = NumberLine(x_range=[-10, 10, 1], length=12, include_numbers=True)
self.play(Create(number_line))

# Animate step-by-step movement
position = 0
dot = Dot(number_line.n2p(position), color=RED)
self.play(Create(dot))

np.random.seed(42)
for _ in range(20):
    step = np.random.choice([-1, 1])
    position = np.clip(position + step, -9, 9)
    self.play(dot.animate.move_to(number_line.n2p(position)), run_time=0.3)
```

**Example 3: Matrix Transformation**
```python
# Grid setup
grid = NumberPlane(x_range=[-5, 5, 1], y_range=[-5, 5, 1])
self.play(Create(grid))

# Vector
vector = Arrow(ORIGIN, [2, 1, 0], buff=0, color=YELLOW)
vector_label = MathTex("\\vec{v}").next_to(vector.get_end(), RIGHT)
self.play(Create(vector), Write(vector_label))

# Show transformation
matrix = MathTex("\\begin{bmatrix} 1 & 1 \\\\ 0 & 1 \\end{bmatrix}").to_corner(UL)
self.play(Write(matrix))
self.play(
    ApplyMethod(grid.apply_matrix, [[1, 1], [0, 1]]),
    ApplyMethod(vector.put_start_and_end_on, ORIGIN, [3, 1, 0]),
    run_time=2
)
```

=== ANIMATION BEST PRACTICES ===

1. STRUCTURE YOUR SCENE IN PHASES:
   Phase 1: Title/Introduction (1-2 seconds)
   - Show a clear title that identifies the concept
   - Fade in or write the title, then move it to top edge or fade out

   Phase 2: Setup (2-3 seconds)
   - Create axes, labels, or initial objects
   - Use Create() for axes, Write() for labels
   - Establish the visual context clearly

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
   - Longer animations (run_time=3-8) for complex movements
   - Shorter animations (run_time=0.3-1) for quick reveals
   - Don't rush - give viewers time to understand

3. USE VISUAL HIERARCHY:
   - Titles at top (to_edge(UP)) or fade out after introduction
   - Main content centered (move_to(ORIGIN))
   - Labels/insights at bottom (to_edge(DOWN))
   - Use size differences: titles larger (font_size=48), labels smaller (font_size=24-36)

4. COLOR MEANINGFULLY:
   - RED: Important points, errors, or emphasis
   - BLUE: Axes, background elements, standard objects
   - YELLOW/GREEN: Highlights, positive indicators, paths
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

7. **CRITICAL: SPATIAL LAYOUT & BOUNDS**:
   - **Keep all content within visible bounds**: x ∈ [-6, 6], y ∈ [-3.5, 3.5]
   - **Prevent overlaps**: Space elements at least 0.5 units apart
   - **Use proper positioning**:
     * Title: to_edge(UP) or to_corner(UL/UR) with padding
     * Main content: ORIGIN or shift by small amounts (±1-2 units max)
     * Labels: to_edge(DOWN) or next_to() with appropriate buff
     * Side annotations: to_edge(LEFT/RIGHT) with padding
   - **For axes**: Use reasonable ranges (x_range=[-5,5], y_range=[-4,4])
   - **For multiple objects**: Use VGroup.arrange() or explicit positioning with next_to()
   - **Test bounds mentally**: Imagine the 16:9 screen, keep everything visible

8. **SCOPE MATCHING - ANSWER ONLY WHAT'S ASKED**:
   - **Read the user's question carefully** - what EXACTLY are they asking?
   - **Don't over-explain**: If they ask "why is area of triangle bh/2", show ONLY that - don't explain derivatives, integrals, or other advanced topics
   - **Stay focused**: One concept = one visualization
   - **Match depth to question**:
     * Simple "what is X" → Show definition + basic example
     * "How does X work" → Show mechanism/process
     * "Prove X" → Show step-by-step derivation
     * "Visualize X" → Show the concept directly
   - **Avoid scope creep**: Don't add "related concepts" unless explicitly asked
   - **Examples of scope matching**:
     * Request: "area of triangle" → Show base × height ÷ 2 visually ❌ Don't show calculus
     * Request: "Pythagorean theorem" → Show a²+b²=c² with squares ❌ Don't derive using trig
     * Request: "what is derivative" → Show slope/rate of change ❌ Don't show integration
     * Request: "bubble sort" → Show the swap algorithm ❌ Don't compare to quicksort

Remember: Your goal is to create an animation that a student can watch and understand the concept clearly. Prioritize clarity, pacing, and educational value. Use the examples and patterns above as inspiration, but adapt them to fit the specific concept you're visualizing. **Keep everything on-screen and answer only what was asked.**"""
    
    # Analyze concept to provide better guidance
    concept_type = _detect_concept_type(concept)
    complexity_hint = "intermediate"
    
    # Adjust complexity based on student context
    if student_context:
        if any(word in student_context.lower() for word in ["beginner", "intro", "basic", "first", "learning"]):
            complexity_hint = "beginner"
        elif any(word in student_context.lower() for word in ["advanced", "graduate", "research", "thesis"]):
            complexity_hint = "advanced"
    
    user_prompt = f"""=== CONCEPT TO VISUALIZE ===
{concept}

=== DETECTED CONCEPT TYPE ===
Based on the concept description, this appears to be: {concept_type}
Use the relevant guidance from the system prompt for this concept type.

=== STUDENT CONTEXT ===
{student_context if student_context else "No specific student context provided."}

=== COMPLEXITY LEVEL ===
Target complexity: {complexity_hint}
- Beginner: Simple, clear, step-by-step with extra explanations
- Intermediate: Standard educational animation with good pacing
- Advanced: Can assume prior knowledge, more sophisticated visualizations

=== YOUR TASK ===
Design a clear, intuitive animation that explains **EXACTLY AND ONLY** what the user asked for.

**CRITICAL: SCOPE ANALYSIS (Do this first!)**
Before coding, analyze the user's request:
- What is the EXACT question being asked?
- What is the MINIMUM explanation needed to answer it?
- Are they asking for a definition, proof, visualization, or mechanism?
- What prerequisite knowledge can we assume?

**DO NOT over-explain or add tangential topics!**

**Key Questions to Consider:**
1. What is the core idea that needs to be visualized?
   - Identify the main mathematical/scientific principle **being asked about**
   - What makes this concept important or interesting?
   - **Stay within the scope of the question**

2. What visual elements will best convey this concept?
   - Should you use axes, number lines, shapes, or combinations?
   - What colors and sizes will create clear visual hierarchy?
   - Are there standard visualizations for this concept type?
   - **Ensure all elements fit within bounds: x∈[-6,6], y∈[-3.5,3.5]**

3. How can you build understanding progressively?
   - What should the student see first? (setup/context)
   - What's the main demonstration? (core animation)
   - What's the key takeaway? (conclusion/insight)
   - **Use proper spacing: elements at least 0.5 units apart**

4. What pacing will help the student follow along?
   - Are there multiple steps that need separate reveals?
   - Should the animation be slow and deliberate or faster?
   - Where should you pause (self.wait()) for comprehension?

5. How can student context inform your approach?
   - If student context mentions specific work, reference it visually if relevant
   - Adjust complexity: simpler for beginners, more sophisticated for advanced
   - Consider what they might already know based on context

**Specific Guidance for {concept_type}:**
{_get_concept_specific_guidance(concept_type)}

**Implementation Checklist:**
- [ ] **SCOPE CHECK**: Does this answer EXACTLY what was asked, no more, no less?
- [ ] **LAYOUT CHECK**: All elements within bounds [-6,6] × [-3.5,3.5]?
- [ ] **SPACING CHECK**: Elements spaced at least 0.5 units apart?
- [ ] Title/introduction phase (1-2 seconds)
- [ ] Setup phase with axes/labels/initial objects (2-3 seconds)
- [ ] Main animation that demonstrates the concept (5-10 seconds)
- [ ] Conclusion with key insight or summary (1-2 seconds)
- [ ] Appropriate use of colors, pacing, and visual hierarchy
- [ ] Proper use of numpy if calculations are needed
- [ ] Code follows all technical constraints

Follow all the system constraints, best practices, and use the examples/patterns as inspiration.
**Focus on clarity and staying within scope.**
Return ONLY the complete Python source code for the scene - no markdown, no explanations, just the code."""
    
    try:
        response = client.messages.create(
            model=selected_model,
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
        
        return code
        
    except Exception as e:
        logger.error(f"Error calling Claude for code generation: {e}", exc_info=True)
        raise RuntimeError(f"Failed to generate Manim code: {e}")


def call_claude_to_fix_manim_code(previous_code: str, error_output: str) -> str:
    """
    Call Claude to fix Manim code that failed to compile or run
    
    Always uses Sonnet for repairs as it's more reliable at error fixing.
    
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
  ✓ Correct: MathTex(r"a"), MathTex(r"\vec{v}"), MathTex(r"\frac{1}{2}")
  ✗ Wrong: MathTex(r"$a$"), MathTex(r"$\vec{v}$") - These will cause LaTeX errors!
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
  * Example: Change MathTex(r"$\frac{1}{2}$") to MathTex(r"\frac{1}{2}")
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

    # Validate layout before testing execution
    is_layout_valid, layout_warnings, layout_metrics = validate_layout(code)
    if layout_warnings:
        logger.warning(f"Layout validation found {len(layout_warnings)} potential issues")
        suggestions = suggest_layout_fixes(code, layout_warnings)
        if suggestions:
            logger.info(suggestions)

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
        
        # Verify GeneratedScene class exists in code
        if 'class GeneratedScene' not in code:
            last_error = "Generated code does not contain 'class GeneratedScene' definition"
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
        
        # Additional validation: Try to import and verify class exists
        try:
            spec = importlib.util.spec_from_file_location("temp_scene", tmp_path)
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
                    
                    logger.info(f"Requesting code repair (attempt {attempt})...")
                    code = call_claude_to_fix_manim_code(code, last_error)
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

