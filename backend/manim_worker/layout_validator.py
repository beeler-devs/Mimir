"""
Layout validation and optimization for Manim code generation

This module provides utilities to analyze generated Manim code for layout issues
such as elements going off-screen or overlapping.
"""

import re
import logging
from typing import List, Tuple, Optional

logger = logging.getLogger(__name__)

# Screen bounds for 16:9 aspect ratio at typical Manim resolution
# Conservative bounds to ensure everything stays visible
SCREEN_X_MIN = -6.5
SCREEN_X_MAX = 6.5
SCREEN_Y_MIN = -3.8
SCREEN_Y_MAX = 3.8

# Recommended safe bounds (with padding)
SAFE_X_MIN = -6.0
SAFE_X_MAX = 6.0
SAFE_Y_MIN = -3.5
SAFE_Y_MAX = 3.5


def extract_axes_ranges(code: str) -> List[Tuple[str, List[float]]]:
    """
    Extract x_range and y_range from Axes() calls in the code

    Args:
        code: Python code string

    Returns:
        List of (axis_type, range_values) tuples
    """
    ranges = []

    # Pattern: x_range=[-5, 5, 1] or x_range=[-5, 5]
    x_range_pattern = r'x_range\s*=\s*\[([-\d.]+),\s*([-\d.]+)(?:,\s*[-\d.]+)?\]'
    y_range_pattern = r'y_range\s*=\s*\[([-\d.]+),\s*([-\d.]+)(?:,\s*[-\d.]+)?\]'

    for match in re.finditer(x_range_pattern, code):
        x_min = float(match.group(1))
        x_max = float(match.group(2))
        ranges.append(('x_range', [x_min, x_max]))

    for match in re.finditer(y_range_pattern, code):
        y_min = float(match.group(1))
        y_max = float(match.group(2))
        ranges.append(('y_range', [y_min, y_max]))

    return ranges


def extract_explicit_coordinates(code: str) -> List[Tuple[float, float]]:
    """
    Extract explicit coordinate pairs like [2, 3, 0] or (2, 3) from the code

    Args:
        code: Python code string

    Returns:
        List of (x, y) coordinate tuples
    """
    coords = []

    # Pattern: [x, y, z] where z is 0
    pattern_3d = r'\[(-?\d+\.?\d*),\s*(-?\d+\.?\d*),\s*0\]'
    for match in re.finditer(pattern_3d, code):
        x = float(match.group(1))
        y = float(match.group(2))
        coords.append((x, y))

    return coords


def validate_axes_ranges(code: str) -> List[str]:
    """
    Validate that axes ranges are within safe bounds

    Args:
        code: Python code string

    Returns:
        List of warning messages (empty if all good)
    """
    warnings = []
    ranges = extract_axes_ranges(code)

    for axis_type, range_vals in ranges:
        min_val, max_val = range_vals

        if axis_type == 'x_range':
            if min_val < SCREEN_X_MIN or max_val > SCREEN_X_MAX:
                warnings.append(
                    f"x_range [{min_val}, {max_val}] may exceed screen bounds "
                    f"[{SCREEN_X_MIN}, {SCREEN_X_MAX}]. Consider using [{SAFE_X_MIN}, {SAFE_X_MAX}]"
                )
        elif axis_type == 'y_range':
            if min_val < SCREEN_Y_MIN or max_val > SCREEN_Y_MAX:
                warnings.append(
                    f"y_range [{min_val}, {max_val}] may exceed screen bounds "
                    f"[{SCREEN_Y_MIN}, {SCREEN_Y_MAX}]. Consider using [{SAFE_Y_MIN}, {SAFE_Y_MAX}]"
                )

    return warnings


def validate_explicit_coordinates(code: str) -> List[str]:
    """
    Validate that explicit coordinates are within safe bounds

    Args:
        code: Python code string

    Returns:
        List of warning messages (empty if all good)
    """
    warnings = []
    coords = extract_explicit_coordinates(code)

    for x, y in coords:
        if x < SAFE_X_MIN or x > SAFE_X_MAX:
            warnings.append(
                f"Coordinate x={x} may be outside safe bounds [{SAFE_X_MIN}, {SAFE_X_MAX}]"
            )
        if y < SAFE_Y_MIN or y > SAFE_Y_MAX:
            warnings.append(
                f"Coordinate y={y} may be outside safe bounds [{SAFE_Y_MIN}, {SAFE_Y_MAX}]"
            )

    return warnings


def check_layout_complexity(code: str) -> dict:
    """
    Assess the layout complexity of the generated code

    Args:
        code: Python code string

    Returns:
        Dictionary with complexity metrics
    """
    metrics = {
        'num_mobjects': 0,
        'num_animations': 0,
        'num_text_elements': 0,
        'num_axes': 0,
        'uses_vgroup': False,
        'uses_positioning': False,
    }

    # Count mobjects
    mobject_types = ['Circle', 'Square', 'Rectangle', 'Dot', 'Line', 'Arrow',
                     'Polygon', 'Text', 'MathTex', 'Tex']
    for mobject_type in mobject_types:
        metrics['num_mobjects'] += code.count(mobject_type + '(')

    # Count text elements
    metrics['num_text_elements'] = code.count('Text(') + code.count('MathTex(') + code.count('Tex(')

    # Count animations
    animation_types = ['Create', 'Write', 'FadeIn', 'FadeOut', 'Transform',
                       'Rotate', 'Scale', 'Shift', 'MoveAlongPath']
    for anim_type in animation_types:
        metrics['num_animations'] += code.count(anim_type + '(')

    # Count axes
    metrics['num_axes'] = code.count('Axes(') + code.count('NumberPlane(') + code.count('NumberLine(')

    # Check for layout helpers
    metrics['uses_vgroup'] = 'VGroup' in code
    metrics['uses_positioning'] = any(keyword in code for keyword in
                                      ['to_edge', 'next_to', 'move_to', 'arrange'])

    return metrics


def validate_layout(code: str) -> Tuple[bool, List[str], dict]:
    """
    Comprehensive layout validation

    Args:
        code: Python code string

    Returns:
        Tuple of (is_valid, warnings, metrics)
        - is_valid: True if no critical issues found
        - warnings: List of warning messages
        - metrics: Dictionary with layout complexity metrics
    """
    warnings = []

    # Validate axes ranges
    axes_warnings = validate_axes_ranges(code)
    warnings.extend(axes_warnings)

    # Validate explicit coordinates
    coord_warnings = validate_explicit_coordinates(code)
    warnings.extend(coord_warnings)

    # Check complexity
    metrics = check_layout_complexity(code)

    # Check if code uses positioning helpers when there are many objects
    if metrics['num_mobjects'] > 5 and not metrics['uses_positioning']:
        warnings.append(
            f"Code has {metrics['num_mobjects']} mobjects but doesn't use positioning helpers "
            f"(to_edge, next_to, move_to). Consider using these to prevent overlaps."
        )

    # Check if VGroup is used when there are many objects
    if metrics['num_mobjects'] > 8 and not metrics['uses_vgroup']:
        warnings.append(
            f"Code has {metrics['num_mobjects']} mobjects. Consider using VGroup for organization."
        )

    # Determine if layout is valid (no critical issues)
    # For now, we only warn - validation passes unless we want to be strict
    is_valid = len(warnings) == 0

    if warnings:
        logger.warning(f"Layout validation found {len(warnings)} issue(s):")
        for warning in warnings:
            logger.warning(f"  - {warning}")
    else:
        logger.info("Layout validation passed - no issues found")

    return is_valid, warnings, metrics


def suggest_layout_fixes(code: str, warnings: List[str]) -> Optional[str]:
    """
    Suggest specific fixes for layout issues

    Args:
        code: Python code string
        warnings: List of warnings from validate_layout

    Returns:
        String with suggested fixes, or None if no fixes needed
    """
    if not warnings:
        return None

    suggestions = []

    # Check for axes range issues
    for warning in warnings:
        if 'x_range' in warning and 'exceed screen bounds' in warning:
            suggestions.append(
                f"• Reduce x_range to fit within [{SAFE_X_MIN}, {SAFE_X_MAX}]"
            )
        elif 'y_range' in warning and 'exceed screen bounds' in warning:
            suggestions.append(
                f"• Reduce y_range to fit within [{SAFE_Y_MIN}, {SAFE_Y_MAX}]"
            )
        elif 'Coordinate x=' in warning:
            suggestions.append(
                f"• Move objects with large x coordinates closer to center using .shift() or .move_to()"
            )
        elif 'Coordinate y=' in warning:
            suggestions.append(
                f"• Move objects with large y coordinates closer to center using .shift() or .move_to()"
            )
        elif 'positioning helpers' in warning:
            suggestions.append(
                "• Use .to_edge(UP/DOWN/LEFT/RIGHT) to position elements relative to screen edges"
            )
            suggestions.append(
                "• Use .next_to(other_obj, direction) to position relative to other objects"
            )
        elif 'VGroup' in warning:
            suggestions.append(
                "• Group related objects with VGroup and use .arrange() to space them automatically"
            )

    if suggestions:
        return "Layout improvement suggestions:\n" + "\n".join(suggestions)

    return None
