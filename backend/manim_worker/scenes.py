"""
Manim Scene Templates
Pre-built animation scenes for common math/CS topics
"""

from manim import *
import numpy as np


class BrownianMotionScene(Scene):
    """
    Animated visualization of Brownian motion (random walk in 2D)
    """
    def construct(self):
        # Title
        title = Text("Brownian Motion", font_size=48)
        self.play(Write(title))
        self.wait(0.5)
        self.play(FadeOut(title))
        
        # Create axes
        axes = Axes(
            x_range=[-5, 5, 1],
            y_range=[-5, 5, 1],
            x_length=10,
            y_length=7,
            axis_config={"color": BLUE},
        )
        
        axes_labels = axes.get_axis_labels(x_label="x", y_label="y")
        self.play(Create(axes), Write(axes_labels))
        
        # Brownian motion particle
        dot = Dot(axes.c2p(0, 0), color=RED, radius=0.1)
        self.play(Create(dot))
        
        # Generate random walk path
        np.random.seed(42)
        n_steps = 100
        step_size = 0.3
        
        path_points = [(0, 0)]
        for _ in range(n_steps):
            angle = np.random.uniform(0, 2 * np.pi)
            dx = step_size * np.cos(angle)
            dy = step_size * np.sin(angle)
            
            prev_x, prev_y = path_points[-1]
            new_x = prev_x + dx
            new_y = prev_y + dy
            
            # Keep within bounds
            new_x = np.clip(new_x, -4.5, 4.5)
            new_y = np.clip(new_y, -4.5, 4.5)
            
            path_points.append((new_x, new_y))
        
        # Draw the path
        path = VMobject()
        path.set_points_as_corners([axes.c2p(x, y) for x, y in path_points])
        path.set_color(YELLOW)
        
        self.play(
            MoveAlongPath(dot, path, rate_func=linear),
            Create(path),
            run_time=8
        )
        
        self.wait(1)
        
        # Add final text
        final_text = Text("Random Walk in 2D", font_size=36).to_edge(DOWN)
        self.play(Write(final_text))
        self.wait(2)


class RandomWalkScene(Scene):
    """
    1D Random walk visualization
    """
    def construct(self):
        title = Text("Random Walk (1D)", font_size=48)
        self.play(Write(title))
        self.wait(0.5)
        self.play(FadeOut(title))
        
        # Create number line
        number_line = NumberLine(
            x_range=[-10, 10, 1],
            length=12,
            include_numbers=True,
            label_direction=DOWN,
        )
        self.play(Create(number_line))
        
        # Starting position
        position = 0
        dot = Dot(number_line.n2p(position), color=RED, radius=0.15)
        self.play(Create(dot))
        
        # Random walk
        np.random.seed(42)
        n_steps = 20
        
        for _ in range(n_steps):
            step = np.random.choice([-1, 1])
            position += step
            position = np.clip(position, -9, 9)
            
            self.play(dot.animate.move_to(number_line.n2p(position)), run_time=0.3)
        
        self.wait(2)


class TextAnimationScene(Scene):
    """
    Generic text animation scene for any description
    """
    def __init__(self, description="Math Concept", **kwargs):
        self.description = description
        super().__init__(**kwargs)
    
    def construct(self):
        # Split description into lines if too long
        max_chars_per_line = 40
        words = self.description.split()
        lines = []
        current_line = []
        current_length = 0
        
        for word in words:
            if current_length + len(word) + 1 <= max_chars_per_line:
                current_line.append(word)
                current_length += len(word) + 1
            else:
                lines.append(" ".join(current_line))
                current_line = [word]
                current_length = len(word)
        
        if current_line:
            lines.append(" ".join(current_line))
        
        # Create title
        title = Text("Concept Visualization", font_size=40)
        title.to_edge(UP)
        self.play(Write(title))
        self.wait(0.5)
        
        # Display description
        description_text = VGroup(*[Text(line, font_size=32) for line in lines])
        description_text.arrange(DOWN, aligned_edge=LEFT, buff=0.3)
        description_text.move_to(ORIGIN)
        
        self.play(FadeIn(description_text, shift=UP))
        self.wait(2)
        
        # Create some visual elements
        circle = Circle(radius=1.5, color=BLUE)
        circle.next_to(description_text, DOWN, buff=1)
        
        square = Square(side_length=2, color=RED)
        square.move_to(circle.get_center())
        
        self.play(Create(circle))
        self.wait(0.5)
        self.play(Transform(circle, square))
        self.wait(0.5)
        self.play(FadeOut(circle))
        
        self.wait(2)


class MatrixTransformScene(Scene):
    """
    Linear transformation visualization
    """
    def construct(self):
        title = Text("Matrix Transformation", font_size=42)
        self.play(Write(title))
        self.wait(0.5)
        self.play(title.animate.to_edge(UP))
        
        # Create grid
        grid = NumberPlane(
            x_range=[-5, 5, 1],
            y_range=[-5, 5, 1],
            background_line_style={
                "stroke_color": BLUE_E,
                "stroke_width": 1,
                "stroke_opacity": 0.3,
            }
        )
        
        self.play(Create(grid))
        
        # Create a vector
        vector = Arrow(ORIGIN, [2, 1, 0], buff=0, color=YELLOW)
        vector_label = MathTex("\\vec{v}").next_to(vector.get_end(), RIGHT)
        
        self.play(Create(vector), Write(vector_label))
        self.wait(1)
        
        # Show transformation matrix
        matrix = MathTex(
            "\\begin{bmatrix} 1 & 1 \\\\ 0 & 1 \\end{bmatrix}"
        ).to_corner(UL).shift(DOWN)
        self.play(Write(matrix))
        
        # Apply transformation
        self.play(
            ApplyMethod(grid.apply_matrix, [[1, 1], [0, 1]]),
            ApplyMethod(vector.put_start_and_end_on, ORIGIN, [3, 1, 0]),
            run_time=2
        )
        
        self.wait(2)


def select_scene(description: str, topic: str):
    """
    Select appropriate scene based on description and topic
    
    Args:
        description: Animation description from user/AI
        topic: Topic category (math, cs, physics, etc.)
    
    Returns:
        Scene class to render
    """
    desc_lower = description.lower()
    
    # Keyword matching
    if "brownian" in desc_lower or "random walk 2d" in desc_lower:
        return BrownianMotionScene
    elif "random walk" in desc_lower or "1d walk" in desc_lower:
        return RandomWalkScene
    elif "matrix" in desc_lower or "linear transformation" in desc_lower or "transform" in desc_lower:
        return MatrixTransformScene
    else:
        # Default to text animation
        return lambda **kwargs: TextAnimationScene(description=description, **kwargs)

