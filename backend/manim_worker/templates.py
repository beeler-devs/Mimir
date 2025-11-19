"""
Template-based Manim code generation for common patterns

This module provides pre-built, validated templates for frequently requested
animations, avoiding the need for full LLM generation.
"""

import logging
import re
from typing import Dict, Optional, List, Any
from string import Template
import json

logger = logging.getLogger(__name__)


class ManimTemplate:
    """Represents a reusable Manim animation template"""

    def __init__(
        self,
        template_id: str,
        name: str,
        code_template: str,
        parameters: Dict[str, Any],
        keywords: List[str],
        examples: List[str],
        description: str = ""
    ):
        self.template_id = template_id
        self.name = name
        self.code_template = code_template
        self.parameters = parameters
        self.keywords = keywords
        self.examples = examples
        self.description = description

    def render(self, params: Dict[str, Any]) -> str:
        """
        Render template with parameters

        Args:
            params: Parameter values

        Returns:
            Rendered Python code
        """
        # Use Python's Template for safe substitution
        template = Template(self.code_template)

        # Fill in defaults for missing parameters
        full_params = {}
        for param_name, param_spec in self.parameters.items():
            if param_name in params:
                full_params[param_name] = params[param_name]
            elif "default" in param_spec:
                full_params[param_name] = param_spec["default"]
            elif param_spec.get("required", False):
                raise ValueError(f"Required parameter '{param_name}' not provided")
            else:
                full_params[param_name] = ""

        # Format special types
        for param_name, value in full_params.items():
            param_spec = self.parameters[param_name]
            param_type = param_spec.get("type", "string")

            if param_type == "array":
                # Format as Python list
                if isinstance(value, list):
                    full_params[param_name] = str(value)
            elif param_type == "color":
                # Ensure uppercase for Manim colors
                full_params[param_name] = str(value).upper()

        # Render template
        code = template.safe_substitute(full_params)
        return code


# Template definitions
TEMPLATES = {
    "function_plot_2d": ManimTemplate(
        template_id="function_plot_2d",
        name="2D Function Plot",
        description="Plot a mathematical function on 2D axes",
        keywords=["plot", "graph", "function", "curve", "visualize", "show function"],
        examples=[
            "plot sin(x)",
            "graph y = x^2",
            "visualize exponential function",
            "show parabola"
        ],
        parameters={
            "title": {"type": "string", "required": True},
            "function_expr": {"type": "expression", "required": True},
            "x_range_min": {"type": "number", "default": -5},
            "x_range_max": {"type": "number", "default": 5},
            "y_range_min": {"type": "number", "default": -4},
            "y_range_max": {"type": "number", "default": 4},
            "color": {"type": "color", "default": "YELLOW"},
            "x_label": {"type": "string", "default": "x"},
            "y_label": {"type": "string", "default": "y"},
        },
        code_template="""from manim import *
import numpy as np

class GeneratedScene(Scene):
    def construct(self):
        # Title
        title = Text("$title", font_size=48)
        self.play(Write(title))
        self.wait(0.5)
        self.play(title.animate.to_edge(UP))

        # Create axes
        axes = Axes(
            x_range=[$x_range_min, $x_range_max, 1],
            y_range=[$y_range_min, $y_range_max, 1],
            x_length=8,
            y_length=5,
            axis_config={"color": BLUE}
        )
        labels = axes.get_axis_labels(x_label="$x_label", y_label="$y_label")

        self.play(Create(axes), Write(labels))
        self.wait(0.5)

        # Plot function
        curve = axes.plot(lambda x: $function_expr, color=$color)

        self.play(Create(curve), run_time=2)
        self.wait(2)
"""
    ),

    "equation_display": ManimTemplate(
        template_id="equation_display",
        name="Equation Display",
        description="Display a mathematical equation with optional derivation steps",
        keywords=["equation", "formula", "show equation", "display", "latex"],
        examples=[
            "show pythagorean theorem",
            "display quadratic formula",
            "equation for area of circle"
        ],
        parameters={
            "title": {"type": "string", "required": True},
            "equation": {"type": "latex", "required": True},
            "description": {"type": "string", "default": ""}
        },
        code_template="""from manim import *
import numpy as np

class GeneratedScene(Scene):
    def construct(self):
        # Title
        title = Text("$title", font_size=48)
        self.play(Write(title))
        self.wait(0.5)
        self.play(title.animate.to_edge(UP))

        # Main equation
        equation = MathTex(r"$equation", font_size=60)
        equation.move_to(ORIGIN)

        self.play(Write(equation), run_time=2)
        self.wait(1.5)

        # Optional description
        if "$description":
            desc_text = Text("$description", font_size=28)
            desc_text.next_to(equation, DOWN, buff=1)
            self.play(FadeIn(desc_text))
            self.wait(1.5)

        self.wait(1)
"""
    ),

    "random_walk_2d": ManimTemplate(
        template_id="random_walk_2d",
        name="2D Random Walk",
        description="Simulate a random walk in 2D (Brownian motion)",
        keywords=["random walk", "brownian", "stochastic", "2d walk", "random motion"],
        examples=[
            "random walk 2d",
            "brownian motion",
            "simulate random movement"
        ],
        parameters={
            "title": {"type": "string", "default": "Random Walk (2D)"},
            "n_steps": {"type": "number", "default": 100},
            "step_size": {"type": "number", "default": 0.3},
            "particle_color": {"type": "color", "default": "RED"},
            "path_color": {"type": "color", "default": "YELLOW"}
        },
        code_template="""from manim import *
import numpy as np

class GeneratedScene(Scene):
    def construct(self):
        # Title
        title = Text("$title", font_size=48)
        self.play(Write(title))
        self.wait(0.5)
        self.play(FadeOut(title))

        # Create axes
        axes = Axes(
            x_range=[-5, 5, 1],
            y_range=[-5, 5, 1],
            x_length=9,
            y_length=6,
            axis_config={"color": BLUE}
        )
        labels = axes.get_axis_labels(x_label="x", y_label="y")
        self.play(Create(axes), Write(labels))

        # Particle
        dot = Dot(axes.c2p(0, 0), color=$particle_color, radius=0.12)
        self.play(Create(dot))

        # Generate random walk
        np.random.seed(42)
        path_points = [(0, 0)]
        for _ in range($n_steps):
            angle = np.random.uniform(0, 2 * np.pi)
            dx = $step_size * np.cos(angle)
            dy = $step_size * np.sin(angle)
            prev_x, prev_y = path_points[-1]
            new_x = np.clip(prev_x + dx, -4.5, 4.5)
            new_y = np.clip(prev_y + dy, -4.5, 4.5)
            path_points.append((new_x, new_y))

        # Animate path
        path = VMobject()
        path.set_points_as_corners([axes.c2p(x, y) for x, y in path_points])
        path.set_color($path_color)

        self.play(
            MoveAlongPath(dot, path, rate_func=linear),
            Create(path),
            run_time=8
        )
        self.wait(1)
"""
    ),

    "random_walk_1d": ManimTemplate(
        template_id="random_walk_1d",
        name="1D Random Walk",
        description="Simulate a random walk on a number line",
        keywords=["random walk 1d", "1d walk", "number line walk", "one dimensional"],
        examples=[
            "random walk on number line",
            "1d random walk",
            "show random steps"
        ],
        parameters={
            "title": {"type": "string", "default": "Random Walk (1D)"},
            "n_steps": {"type": "number", "default": 20},
            "dot_color": {"type": "color", "default": "RED"}
        },
        code_template="""from manim import *
import numpy as np

class GeneratedScene(Scene):
    def construct(self):
        # Title
        title = Text("$title", font_size=48)
        self.play(Write(title))
        self.wait(0.5)
        self.play(FadeOut(title))

        # Number line
        number_line = NumberLine(
            x_range=[-10, 10, 1],
            length=12,
            include_numbers=True,
            label_direction=DOWN
        )
        self.play(Create(number_line))

        # Starting dot
        position = 0
        dot = Dot(number_line.n2p(position), color=$dot_color, radius=0.15)
        self.play(Create(dot))

        # Random walk
        np.random.seed(42)
        for _ in range($n_steps):
            step = np.random.choice([-1, 1])
            position += step
            position = np.clip(position, -9, 9)
            self.play(dot.animate.move_to(number_line.n2p(position)), run_time=0.3)

        self.wait(2)
"""
    ),

    "matrix_transformation": ManimTemplate(
        template_id="matrix_transformation",
        name="Matrix Transformation",
        description="Visualize a 2D linear transformation",
        keywords=["matrix", "transformation", "linear", "transform", "rotation", "scaling"],
        examples=[
            "matrix transformation",
            "show linear transformation",
            "visualize rotation matrix"
        ],
        parameters={
            "title": {"type": "string", "default": "Matrix Transformation"},
            "matrix_latex": {"type": "latex", "required": True},
            "m11": {"type": "number", "required": True},
            "m12": {"type": "number", "required": True},
            "m21": {"type": "number", "required": True},
            "m22": {"type": "number", "required": True}
        },
        code_template="""from manim import *
import numpy as np

class GeneratedScene(Scene):
    def construct(self):
        # Title
        title = Text("$title", font_size=42)
        self.play(Write(title))
        self.wait(0.5)
        self.play(title.animate.to_edge(UP))

        # Grid
        grid = NumberPlane(
            x_range=[-5, 5, 1],
            y_range=[-4, 4, 1],
            background_line_style={"stroke_opacity": 0.3}
        )
        self.play(Create(grid))

        # Vector
        vector = Arrow(ORIGIN, [2, 1, 0], buff=0, color=YELLOW)
        vector_label = MathTex(r"\\vec{v}").next_to(vector.get_end(), RIGHT)
        self.play(Create(vector), Write(vector_label))
        self.wait(1)

        # Matrix display
        matrix_text = MathTex(r"$matrix_latex").to_corner(UL).shift(DOWN * 0.5)
        self.play(Write(matrix_text))
        self.wait(0.5)

        # Apply transformation
        matrix = [[$m11, $m12], [$m21, $m22]]
        new_vector_end = [
            $m11 * 2 + $m12 * 1,
            $m21 * 2 + $m22 * 1,
            0
        ]

        self.play(
            ApplyMethod(grid.apply_matrix, matrix),
            ApplyMethod(vector.put_start_and_end_on, ORIGIN, new_vector_end),
            run_time=2
        )
        self.wait(2)
"""
    ),

    "circle_to_square": ManimTemplate(
        template_id="circle_to_square",
        name="Circle to Square Transform",
        description="Morph a circle into a square",
        keywords=["circle", "square", "transform", "morph", "shape"],
        examples=[
            "circle to square",
            "transform circle into square",
            "morph shapes"
        ],
        parameters={
            "title": {"type": "string", "default": "Shape Transformation"},
            "circle_color": {"type": "color", "default": "BLUE"},
            "square_color": {"type": "color", "default": "RED"}
        },
        code_template="""from manim import *
import numpy as np

class GeneratedScene(Scene):
    def construct(self):
        # Title
        title = Text("$title", font_size=48)
        self.play(Write(title))
        self.wait(0.5)
        self.play(title.animate.to_edge(UP))

        # Circle
        circle = Circle(radius=2, color=$circle_color, fill_opacity=0.3)
        circle_label = Text("Circle", font_size=32).next_to(circle, DOWN)

        self.play(Create(circle), Write(circle_label))
        self.wait(1)
        self.play(FadeOut(circle_label))

        # Transform to square
        square = Square(side_length=3.5, color=$square_color, fill_opacity=0.3)
        square_label = Text("Square", font_size=32).next_to(square, DOWN)

        self.play(Transform(circle, square), run_time=2)
        self.play(Write(square_label))
        self.wait(2)
"""
    ),

    "triangle_area": ManimTemplate(
        template_id="triangle_area",
        name="Triangle Area Formula",
        description="Show why triangle area = base × height ÷ 2",
        keywords=["triangle", "area", "base", "height", "geometry", "bh/2"],
        examples=[
            "area of triangle",
            "why is triangle area bh/2",
            "triangle area formula"
        ],
        parameters={
            "title": {"type": "string", "default": "Area of a Triangle"}
        },
        code_template="""from manim import *
import numpy as np

class GeneratedScene(Scene):
    def construct(self):
        # Title
        title = Text("$title", font_size=48)
        self.play(Write(title))
        self.wait(0.5)
        self.play(title.animate.to_edge(UP))

        # Triangle
        triangle = Polygon(
            [-2, -1, 0], [2, -1, 0], [0, 2, 0],
            color=BLUE, fill_opacity=0.3
        )
        self.play(Create(triangle))
        self.wait(0.5)

        # Base line
        base_line = Line([-2, -1, 0], [2, -1, 0], color=YELLOW, stroke_width=4)
        base_label = MathTex("b").next_to(base_line, DOWN)
        self.play(Create(base_line), Write(base_label))
        self.wait(0.5)

        # Height line
        height_line = DashedLine([0, -1, 0], [0, 2, 0], color=GREEN, stroke_width=4)
        height_label = MathTex("h").next_to(height_line, RIGHT)
        self.play(Create(height_line), Write(height_label))
        self.wait(1)

        # Formula
        formula = MathTex(r"A = \\frac{1}{2}bh", font_size=60)
        formula.to_edge(DOWN).shift(UP * 0.5)
        self.play(Write(formula))
        self.wait(2)
"""
    ),

    "pythagorean_theorem": ManimTemplate(
        template_id="pythagorean_theorem",
        name="Pythagorean Theorem",
        description="Visualize a² + b² = c² with squares",
        keywords=["pythagorean", "theorem", "right triangle", "a^2 + b^2 = c^2"],
        examples=[
            "pythagorean theorem",
            "show a^2 + b^2 = c^2",
            "right triangle theorem"
        ],
        parameters={
            "title": {"type": "string", "default": "Pythagorean Theorem"}
        },
        code_template="""from manim import *
import numpy as np

class GeneratedScene(Scene):
    def construct(self):
        # Title
        title = Text("$title", font_size=48)
        self.play(Write(title))
        self.wait(0.5)
        self.play(title.animate.to_edge(UP))

        # Right triangle
        triangle = Polygon(
            [-2, -1.5, 0], [2, -1.5, 0], [-2, 1.5, 0],
            color=WHITE, stroke_width=3
        )
        self.play(Create(triangle))
        self.wait(0.5)

        # Labels for sides
        a_label = MathTex("a").next_to([-2, 0, 0], LEFT)
        b_label = MathTex("b").next_to([0, -1.5, 0], DOWN)
        c_label = MathTex("c").move_to([0.3, 0.3, 0])

        self.play(Write(a_label), Write(b_label), Write(c_label))
        self.wait(1)

        # Formula
        formula = MathTex(r"a^2 + b^2 = c^2", font_size=56)
        formula.to_edge(DOWN).shift(UP * 0.5)
        self.play(Write(formula))
        self.wait(2)
"""
    ),
}


def get_template(template_id: str) -> Optional[ManimTemplate]:
    """Get template by ID"""
    return TEMPLATES.get(template_id)


def list_templates() -> List[str]:
    """List all available template IDs"""
    return list(TEMPLATES.keys())


def get_all_templates() -> Dict[str, ManimTemplate]:
    """Get all templates"""
    return TEMPLATES
