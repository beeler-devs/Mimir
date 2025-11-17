"""
Template classification and parameter extraction for Manim templates

This module matches user requests to appropriate templates and extracts
the necessary parameters using lightweight LLM calls.
"""

import logging
import json
import re
import os
from typing import Optional, Dict, Any, Tuple
from anthropic import Anthropic
from manim_worker.templates import get_all_templates, get_template, ManimTemplate

logger = logging.getLogger(__name__)


class TemplateMatch:
    """Represents a matched template with confidence and extracted parameters"""

    def __init__(
        self,
        template: ManimTemplate,
        confidence: float,
        parameters: Dict[str, Any]
    ):
        self.template = template
        self.confidence = confidence
        self.parameters = parameters


class TemplateClassifier:
    """Classifies user requests and matches them to templates"""

    def __init__(self):
        self.templates = get_all_templates()
        self.enabled = os.getenv("TEMPLATE_MATCHING_ENABLED", "true").lower() == "true"
        self.confidence_threshold = float(os.getenv("TEMPLATE_CONFIDENCE_THRESHOLD", "0.90"))

        # Initialize Anthropic client for parameter extraction
        claude_api_key = os.getenv("CLAUDE_API_KEY")
        if claude_api_key:
            self.client = Anthropic(api_key=claude_api_key)
        else:
            logger.warning("CLAUDE_API_KEY not set - template parameter extraction disabled")
            self.enabled = False

        if self.enabled:
            logger.info(f"Template classifier initialized with {len(self.templates)} templates")
            logger.info(f"Confidence threshold: {self.confidence_threshold}")

    def _keyword_matching(self, description: str) -> Optional[Tuple[str, float]]:
        """
        Simple keyword-based template matching

        Args:
            description: User's animation request

        Returns:
            Tuple of (template_id, confidence) if match found
        """
        desc_lower = description.lower()
        best_match = None
        best_score = 0.0

        for template_id, template in self.templates.items():
            # Count matching keywords
            matches = sum(1 for kw in template.keywords if kw in desc_lower)

            if matches > 0:
                # Confidence based on keyword coverage
                confidence = matches / len(template.keywords)

                # Boost confidence if exact phrase match
                for example in template.examples:
                    if example.lower() in desc_lower:
                        confidence = min(1.0, confidence + 0.3)

                if confidence > best_score:
                    best_score = confidence
                    best_match = template_id

        if best_match and best_score >= self.confidence_threshold:
            return (best_match, best_score)

        return None

    def _extract_parameters_with_llm(
        self,
        description: str,
        template: ManimTemplate,
        student_context: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Extract parameters from description using LLM

        Args:
            description: User's animation request
            template: Matched template
            student_context: Optional student context

        Returns:
            Dictionary of extracted parameters
        """
        # Build parameter schema for the prompt
        param_schema = {}
        for param_name, param_spec in template.parameters.items():
            param_schema[param_name] = {
                "type": param_spec["type"],
                "required": param_spec.get("required", False),
                "default": param_spec.get("default", None)
            }

        prompt = f"""Extract parameters from the following animation request to fill in a template.

REQUEST: "{description}"
{f'STUDENT CONTEXT: {student_context}' if student_context else ''}

TEMPLATE: {template.name}
PARAMETERS NEEDED:
{json.dumps(param_schema, indent=2)}

IMPORTANT INSTRUCTIONS:
1. Extract values from the request that match the parameter types
2. For "expression" type: Convert to Python lambda syntax (e.g., "sin(x)" → "np.sin(x)", "x^2" → "x**2")
3. For "latex" type: Convert to LaTeX syntax (e.g., "a^2" → "a^2", "fraction 1/2" → "\\\\frac{{1}}{{2}}")
4. For "number" type: Extract numeric values
5. For "array" type: Return as JSON array [min, max, step]
6. For "color" type: Use Manim color names (RED, BLUE, YELLOW, GREEN, etc.)
7. For "string" type: Extract or infer appropriate text
8. If a value cannot be determined, use the default if provided, otherwise omit it

Return ONLY a valid JSON object with the extracted parameters. No explanations, just JSON.

Example format:
{{"title": "My Function", "function_expr": "np.sin(x)", "color": "YELLOW"}}"""

        try:
            # Use Haiku for fast, cheap parameter extraction
            response = self.client.messages.create(
                model="claude-haiku-4-5",
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}]
            )

            # Parse JSON response
            response_text = response.content[0].text.strip()

            # Extract JSON if it's wrapped in markdown
            json_match = re.search(r'```json\s*(\{.*?\})\s*```', response_text, re.DOTALL)
            if json_match:
                response_text = json_match.group(1)
            else:
                # Try to find raw JSON
                json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
                if json_match:
                    response_text = json_match.group(0)

            parameters = json.loads(response_text)
            logger.info(f"Extracted parameters for template '{template.template_id}': {parameters}")
            return parameters

        except Exception as e:
            logger.error(f"Failed to extract parameters: {e}")
            logger.error(f"Response was: {response_text if 'response_text' in locals() else 'N/A'}")

            # Return empty dict, renderer will use defaults
            return {}

    def classify(
        self,
        description: str,
        student_context: Optional[str] = None
    ) -> Optional[TemplateMatch]:
        """
        Classify a request and return matched template with parameters

        Args:
            description: Animation request description
            student_context: Optional student context

        Returns:
            TemplateMatch if match found above confidence threshold, else None
        """
        if not self.enabled:
            return None

        # Try keyword matching first (fast)
        match_result = self._keyword_matching(description)

        if not match_result:
            logger.debug(f"No template match found for: {description[:60]}...")
            return None

        template_id, confidence = match_result
        template = get_template(template_id)

        if not template:
            logger.error(f"Template {template_id} not found in registry")
            return None

        logger.info(f"Template match: {template_id} (confidence: {confidence:.3f})")

        # Extract parameters using LLM
        parameters = self._extract_parameters_with_llm(description, template, student_context)

        return TemplateMatch(
            template=template,
            confidence=confidence,
            parameters=parameters
        )


# Global classifier instance
template_classifier = TemplateClassifier()
