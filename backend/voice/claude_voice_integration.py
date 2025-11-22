"""
Integration between voice gateway and Claude tutoring session
"""
import logging
import os
from typing import Optional, AsyncIterator
from anthropic import Anthropic

from .audio_utils import chunk_text_for_tts

logger = logging.getLogger(__name__)


class ClaudeVoiceIntegration:
    """
    Integrates voice assistant with Claude tutoring

    Handles:
    - Converting speech to text messages for Claude
    - Streaming Claude's text responses
    - Chunking text for TTS
    - Extracting UI actions from Claude responses
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("CLAUDE_API_KEY")
        if not self.api_key:
            raise ValueError("CLAUDE_API_KEY not configured")

        self.client = Anthropic(api_key=self.api_key)
        self.model = os.getenv("CHAT_MODEL", "claude-sonnet-4-5")

    def build_voice_system_prompt(self, base_context: Optional[str] = None) -> str:
        """
        Build system prompt optimized for voice tutoring

        Args:
            base_context: Optional base context from workspace

        Returns:
            System prompt string
        """
        voice_prompt = """You are an AI tutor for Mimir, an educational platform, speaking to a student via voice.

**CRITICAL VOICE GUIDELINES:**

1. **Conversational Style**:
   - Use short, natural sentences (5-15 words per sentence)
   - Speak like a patient, encouraging tutor
   - Avoid long paragraphs or complex nested clauses
   - Use contractions (e.g., "it's", "you're", "let's")

2. **Socratic Method**:
   - Ask guiding questions BEFORE giving answers
   - Use a "hint ladder" - start with gentle hints
   - Encourage the student to think through the problem
   - Example: "What do you think might happen if we...?"

3. **Clear Explanations**:
   - Break complex concepts into bite-sized pieces
   - Use analogies and real-world examples
   - Check understanding: "Does that make sense?"
   - Pause points: "Let's pause here. Any questions?"

4. **Math and Technical Content**:
   - Spell out equations verbally: "x squared plus 2x equals 10"
   - Refer to visual elements: "Look at the graph on your screen"
   - Don't use LaTeX in voice responses (it will be spoken)
   - For complex equations, say: "I'll write that on the canvas for you"

5. **Reference Visual Context**:
   - You can trigger UI actions to help explain concepts
   - Example: "Let's look at the mind map node for derivatives"
   - Example: "I'll show you an animation of this concept"

6. **Pacing**:
   - One concept at a time
   - Allow thinking time with questions
   - Don't rush through explanations

**UI ACTIONS** (optional):
If you want to trigger a UI action (show mind map node, play animation, etc.), include a structured action block:

UI_ACTION: {"type": "HIGHLIGHT_MIND_MAP_NODE", "nodeId": "derivative-core"}
UI_ACTION: {"type": "SHOW_MANIM_SCENE", "sceneId": "limit-definition"}
UI_ACTION: {"type": "SHOW_HINT", "hint": "Think about the slope of the tangent line"}

Available action types:
- HIGHLIGHT_MIND_MAP_NODE: Highlight a specific mind map node
- SHOW_MANIM_SCENE: Play a Manim animation
- SHOW_HINT: Display a hint on screen
- FOCUS_CANVAS: Focus on a specific area of the canvas

"""

        if base_context:
            voice_prompt += f"\n**STUDENT CONTEXT:**\n{base_context}\n"

        return voice_prompt

    async def process_user_utterance(
        self,
        utterance: str,
        conversation_history: list[dict],
        workspace_context: Optional[str] = None
    ) -> AsyncIterator[str]:
        """
        Process user utterance and stream Claude's response

        Args:
            utterance: User's spoken text
            conversation_history: Previous conversation messages
            workspace_context: Optional workspace context

        Yields:
            Text chunks from Claude's response
        """
        try:
            # Debug: Log workspace context received
            logger.warning(f"[Claude Voice Integration] workspace_context received: {workspace_context is not None}")
            if workspace_context:
                logger.warning(f"[Claude Voice Integration] Context type: {type(workspace_context)}")
                if isinstance(workspace_context, dict):
                    logger.warning(f"[Claude Voice Integration] Context keys: {workspace_context.keys()}")
                    logger.warning(f"[Claude Voice Integration] Instances: {len(workspace_context.get('instances', []))}, Folders: {len(workspace_context.get('folders', []))}")
                elif isinstance(workspace_context, str):
                    logger.warning(f"[Claude Voice Integration] Context string length: {len(workspace_context)}")
            else:
                logger.warning("[Claude Voice Integration] NO WORKSPACE CONTEXT RECEIVED")

            # Build messages
            messages = conversation_history.copy()
            messages.append({
                "role": "user",
                "content": utterance
            })

            # Build system prompt
            system_prompt = self.build_voice_system_prompt(workspace_context)

            logger.info(f"[Claude Voice] Processing utterance: {utterance[:100]}...")

            # Stream from Claude
            full_response = ""
            with self.client.messages.stream(
                model=self.model,
                max_tokens=1024,
                system=system_prompt,
                messages=messages
            ) as stream:
                logger.info(f"[Claude Voice] Stream started for utterance: {utterance[:50]}...")
                for text_block in stream.text_stream:
                    full_response += text_block
                    # logger.debug(f"[Claude Voice] Received chunk: {text_block[:20]}...")
                    yield text_block

            logger.info(
                f"[Claude Voice] Completed response "
                f"({len(full_response)} chars): {full_response[:100]}..."
            )

        except Exception as e:
            logger.error(f"[Claude Voice] Error processing utterance: {e}", exc_info=True)
            yield f"I'm sorry, I encountered an error: {str(e)}"

    def extract_ui_actions(self, text: str) -> tuple[str, list[dict]]:
        """
        Extract UI actions from Claude's response

        Args:
            text: Full response text

        Returns:
            Tuple of (clean_text, ui_actions_list)
        """
        import re
        import json

        ui_actions = []
        clean_text = text

        # Find all UI_ACTION markers
        pattern = r'UI_ACTION:\s*(\{[^}]+\})'
        matches = re.finditer(pattern, text)

        for match in matches:
            try:
                action_json = match.group(1)
                action = json.loads(action_json)
                ui_actions.append(action)
            except json.JSONDecodeError as e:
                logger.error(f"[Claude Voice] Failed to parse UI action: {e}")

        # Remove UI_ACTION markers from text
        clean_text = re.sub(pattern, '', text).strip()

        # Remove empty lines
        clean_text = '\n'.join(line for line in clean_text.split('\n') if line.strip())

        return clean_text, ui_actions

    async def chunk_response_for_tts(
        self,
        response_stream: AsyncIterator[str]
    ) -> AsyncIterator[str]:
        """
        Chunk streaming response into TTS-friendly segments

        Accumulates text and yields complete sentences for TTS

        Args:
            response_stream: Async iterator of text chunks from Claude

        Yields:
            Complete sentences ready for TTS
        """
        buffer = ""
        sentence_endings = {'.', '!', '?'}

        async for chunk in response_stream:
            buffer += chunk

            # Check if we have complete sentences
            while True:
                # Find the first sentence ending
                min_pos = -1
                for ending in sentence_endings:
                    pos = buffer.find(ending)
                    if pos != -1:
                        if min_pos == -1 or pos < min_pos:
                            min_pos = pos

                if min_pos == -1:
                    # No complete sentence yet
                    break

                # Extract sentence (including punctuation)
                sentence = buffer[:min_pos + 1].strip()
                buffer = buffer[min_pos + 1:].strip()

                if sentence:
                    # Skip UI_ACTION markers
                    if "UI_ACTION:" not in sentence:
                        yield sentence

        # Yield remaining buffer if any
        if buffer.strip() and "UI_ACTION:" not in buffer:
            yield buffer.strip()


# Global instance (will be initialized in main.py)
claude_voice_integration: Optional[ClaudeVoiceIntegration] = None


def get_claude_voice_integration() -> ClaudeVoiceIntegration:
    """Get or create Claude voice integration instance"""
    global claude_voice_integration
    if claude_voice_integration is None:
        claude_voice_integration = ClaudeVoiceIntegration()
    return claude_voice_integration
