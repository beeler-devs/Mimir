"""
Conversation state machine for voice interactions with barge-in support
"""
from enum import Enum
from typing import Optional, Callable, Dict
import logging
import asyncio
from datetime import datetime

logger = logging.getLogger(__name__)


class ConversationState(Enum):
    """Voice conversation states"""
    IDLE = "idle"
    USER_SPEAKING = "user_speaking"
    PROCESSING = "processing"
    ASSISTANT_SPEAKING = "assistant_speaking"
    ERROR = "error"


class VoiceStateMachine:
    """
    Manages conversation state transitions and barge-in logic
    """

    def __init__(self, session_id: str):
        self.session_id = session_id
        self.state = ConversationState.IDLE
        self.previous_state = ConversationState.IDLE
        self.state_changed_at = datetime.now()
        self._state_callbacks: Dict[ConversationState, list] = {
            state: [] for state in ConversationState
        }
        self._transition_callbacks = []
        self._current_tts_stream_id: Optional[str] = None
        self._lock = asyncio.Lock()

    async def transition_to(
        self,
        new_state: ConversationState,
        metadata: Optional[dict] = None
    ) -> bool:
        """
        Transition to a new state

        Args:
            new_state: Target state
            metadata: Optional metadata about the transition

        Returns:
            True if transition was successful
        """
        async with self._lock:
            if not self._is_valid_transition(self.state, new_state):
                logger.warning(
                    f"[{self.session_id}] Invalid transition: "
                    f"{self.state.value} -> {new_state.value}"
                )
                return False

            old_state = self.state
            self.previous_state = old_state
            self.state = new_state
            self.state_changed_at = datetime.now()

            logger.info(
                f"[{self.session_id}] State transition: "
                f"{old_state.value} -> {new_state.value}"
            )

            # Execute callbacks
            await self._execute_callbacks(old_state, new_state, metadata or {})

            return True

    def _is_valid_transition(
        self,
        from_state: ConversationState,
        to_state: ConversationState
    ) -> bool:
        """
        Check if a state transition is valid

        Valid transitions:
        - IDLE -> USER_SPEAKING (user starts speaking)
        - USER_SPEAKING -> PROCESSING (utterance complete)
        - USER_SPEAKING -> IDLE (false alarm)
        - PROCESSING -> ASSISTANT_SPEAKING (first TTS audio)
        - PROCESSING -> IDLE (error or empty response)
        - ASSISTANT_SPEAKING -> IDLE (TTS complete)
        - ASSISTANT_SPEAKING -> USER_SPEAKING (barge-in!)
        - any -> ERROR (error occurred)
        - ERROR -> IDLE (recovery)
        """
        valid_transitions = {
            ConversationState.IDLE: [
                ConversationState.USER_SPEAKING,
                ConversationState.PROCESSING,  # Allow processing queued utterances
                ConversationState.ERROR
            ],
            ConversationState.USER_SPEAKING: [
                ConversationState.PROCESSING,
                ConversationState.IDLE,
                ConversationState.ERROR
            ],
            ConversationState.PROCESSING: [
                ConversationState.ASSISTANT_SPEAKING,
                ConversationState.IDLE,
                ConversationState.ERROR
            ],
            ConversationState.ASSISTANT_SPEAKING: [
                ConversationState.IDLE,
                ConversationState.USER_SPEAKING,  # Barge-in
                ConversationState.ERROR
            ],
            ConversationState.ERROR: [
                ConversationState.IDLE
            ]
        }

        # Allow same-state transitions for idempotency
        if from_state == to_state:
            return True

        return to_state in valid_transitions.get(from_state, [])

    async def _execute_callbacks(
        self,
        old_state: ConversationState,
        new_state: ConversationState,
        metadata: dict
    ) -> None:
        """Execute registered callbacks for state transitions"""
        # Execute state entry callbacks
        for callback in self._state_callbacks.get(new_state, []):
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(self.session_id, old_state, new_state, metadata)
                else:
                    callback(self.session_id, old_state, new_state, metadata)
            except Exception as e:
                logger.error(
                    f"[{self.session_id}] Error in state callback: {e}",
                    exc_info=True
                )

        # Execute general transition callbacks
        for callback in self._transition_callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(self.session_id, old_state, new_state, metadata)
                else:
                    callback(self.session_id, old_state, new_state, metadata)
            except Exception as e:
                logger.error(
                    f"[{self.session_id}] Error in transition callback: {e}",
                    exc_info=True
                )

    def on_state_enter(
        self,
        state: ConversationState,
        callback: Callable
    ) -> None:
        """
        Register a callback for when entering a specific state

        Args:
            state: State to watch
            callback: Callback function(session_id, old_state, new_state, metadata)
        """
        self._state_callbacks[state].append(callback)

    def on_transition(self, callback: Callable) -> None:
        """
        Register a callback for any state transition

        Args:
            callback: Callback function(session_id, old_state, new_state, metadata)
        """
        self._transition_callbacks.append(callback)

    async def handle_barge_in(self) -> bool:
        """
        Handle user barge-in (user starts speaking while assistant is speaking)

        Returns:
            True if barge-in was handled
        """
        if self.state != ConversationState.ASSISTANT_SPEAKING:
            logger.debug(
                f"[{self.session_id}] Barge-in called but state is {self.state.value}, ignoring"
            )
            return False

        logger.info(f"[{self.session_id}] Barge-in detected! Interrupting assistant")

        # Transition to USER_SPEAKING
        success = await self.transition_to(
            ConversationState.USER_SPEAKING,
            {"reason": "barge_in", "interrupted_stream_id": self._current_tts_stream_id}
        )

        return success

    def set_tts_stream_id(self, stream_id: Optional[str]) -> None:
        """Set the current TTS stream ID for cancellation"""
        self._current_tts_stream_id = stream_id

    def get_tts_stream_id(self) -> Optional[str]:
        """Get the current TTS stream ID"""
        return self._current_tts_stream_id

    def get_state(self) -> ConversationState:
        """Get current state"""
        return self.state

    def get_state_duration_ms(self) -> int:
        """Get duration in current state in milliseconds"""
        return int((datetime.now() - self.state_changed_at).total_seconds() * 1000)

    def to_dict(self) -> dict:
        """Convert state machine to dictionary"""
        return {
            "session_id": self.session_id,
            "state": self.state.value,
            "previous_state": self.previous_state.value,
            "state_duration_ms": self.get_state_duration_ms(),
            "current_tts_stream_id": self._current_tts_stream_id
        }
