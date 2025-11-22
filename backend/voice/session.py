"""
Voice session management
"""
import asyncio
import logging
import uuid
from typing import Dict, Optional, Callable
from datetime import datetime
from fastapi import WebSocket

from .state_machine import VoiceStateMachine, ConversationState
from .stt_provider import STTProvider, STTEvent, STTEventData
from .tts_provider import TTSProvider
from .audio_utils import AudioBuffer

logger = logging.getLogger(__name__)


class VoiceSession:
    """
    Represents an active voice session
    """

    def __init__(
        self,
        session_id: str,
        user_id: str,
        instance_id: str,
        websocket: WebSocket,
        stt_provider: STTProvider,
        tts_provider: TTSProvider
    ):
        self.session_id = session_id
        self.user_id = user_id
        self.instance_id = instance_id
        self.websocket = websocket
        self.stt_provider = stt_provider
        self.tts_provider = tts_provider

        self.state_machine = VoiceStateMachine(session_id)
        self.audio_buffer = AudioBuffer(max_duration_ms=500)  # 500ms buffer

        self.created_at = datetime.now()
        self.last_activity = datetime.now()

        self._stt_task: Optional[asyncio.Task] = None
        self._is_active = True
        self._current_utterance = ""
        self._pending_text_chunks = asyncio.Queue()

        # Metrics
        self.metrics = {
            "user_turns": 0,
            "assistant_turns": 0,
            "barge_ins": 0,
            "total_user_speech_ms": 0,
            "total_assistant_speech_ms": 0
        }

        # Setup state machine callbacks
        self._setup_state_callbacks()

    def _setup_state_callbacks(self):
        """Setup state machine callbacks for logging and metrics"""
        def on_user_speaking(session_id, old_state, new_state, metadata):
            if old_state == ConversationState.ASSISTANT_SPEAKING:
                self.metrics["barge_ins"] += 1
                logger.info(f"[{session_id}] Barge-in detected (total: {self.metrics['barge_ins']})")

        def on_processing(session_id, old_state, new_state, metadata):
            if old_state == ConversationState.USER_SPEAKING:
                self.metrics["user_turns"] += 1

        def on_assistant_speaking(session_id, old_state, new_state, metadata):
            if old_state == ConversationState.PROCESSING:
                self.metrics["assistant_turns"] += 1

        self.state_machine.on_state_enter(ConversationState.USER_SPEAKING, on_user_speaking)
        self.state_machine.on_state_enter(ConversationState.PROCESSING, on_processing)
        self.state_machine.on_state_enter(ConversationState.ASSISTANT_SPEAKING, on_assistant_speaking)

    async def handle_audio_chunk(self, audio_bytes: bytes) -> None:
        """
        Process incoming audio chunk from client

        Args:
            audio_bytes: Raw audio bytes (PCM16, 16kHz mono)
        """
        # logger.debug(f"[{self.session_id}] Received audio chunk: {len(audio_bytes)} bytes")
        self.last_activity = datetime.now()

        # Send to STT provider
        await self.stt_provider.send_audio(self.session_id, audio_bytes)

    async def handle_stt_events(self) -> None:
        """
        Process STT events in the background
        """
        try:
            async for event in self.stt_provider.get_events(self.session_id):
                await self._process_stt_event(event)
        except Exception as e:
            logger.error(f"[{self.session_id}] Error in STT event loop: {e}", exc_info=True)
            await self.state_machine.transition_to(ConversationState.ERROR)

    async def _process_stt_event(self, event: STTEventData) -> None:
        """Process a single STT event"""
        logger.debug(f"[{self.session_id}] Processing STT event: {event.event_type}")
        
        if event.event_type == STTEvent.SPEECH_STARTED:
            # User started speaking
            current_state = self.state_machine.get_state()

            if current_state == ConversationState.ASSISTANT_SPEAKING:
                # Barge-in!
                await self.state_machine.handle_barge_in()
                # Send barge-in event to client
                await self._send_to_client({
                    "type": "barge_in",
                    "timestamp": datetime.now().isoformat()
                })
            elif current_state == ConversationState.IDLE:
                await self.state_machine.transition_to(ConversationState.USER_SPEAKING)

        elif event.event_type == STTEvent.PARTIAL_TRANSCRIPT:
            # Send partial transcript to client for live display
            await self._send_to_client({
                "type": "partial_transcript",
                "transcript": event.transcript,
                "confidence": event.confidence
            })

        elif event.event_type == STTEvent.FINAL_TRANSCRIPT:
            # Complete utterance
            current_state = self.state_machine.get_state()

            logger.warning(
                f"[{self.session_id}] FINAL_TRANSCRIPT received while in state {current_state.value}: "
                f"'{event.transcript}' (confidence={event.confidence})"
            )

            # Only accept final transcripts when in USER_SPEAKING state
            # This prevents mid-conversation utterances from being queued while system is busy
            if current_state != ConversationState.USER_SPEAKING:
                logger.warning(
                    f"[{self.session_id}] IGNORING FINAL_TRANSCRIPT (not in USER_SPEAKING state): '{event.transcript}'"
                )
                return

            self._current_utterance = event.transcript

            # Send final transcript to client
            await self._send_to_client({
                "type": "final_transcript",
                "transcript": event.transcript,
                "confidence": event.confidence
            })

            # Transition to PROCESSING
            await self.state_machine.transition_to(
                ConversationState.PROCESSING,
                {"utterance": event.transcript, "confidence": event.confidence}
            )

        elif event.event_type == STTEvent.SPEECH_ENDED:
            # Speech ended (handled by final transcript typically)
            pass

        elif event.event_type == STTEvent.ERROR:
            logger.error(f"[{self.session_id}] STT error: {event.error}")
            await self._send_to_client({
                "type": "stt_error",
                "error": event.error
            })

    async def synthesize_and_stream(self, text: str) -> None:
        """
        Synthesize text and stream audio to client

        Args:
            text: Text to synthesize
        """
        stream_id = str(uuid.uuid4())
        self.state_machine.set_tts_stream_id(stream_id)

        logger.warning(
            f"[{self.session_id}] Starting TTS stream {stream_id} for text: '{text[:100]}...'"
        )

        try:
            first_chunk = True
            chunk_count = 0
            import datetime
            start_time = datetime.datetime.now()

            async for audio_chunk in self.tts_provider.synthesize_stream(
                text=text,
                stream_id=stream_id
            ):
                chunk_count += 1
                # Check if we should stop (barge-in or error)
                current_state = self.state_machine.get_state()
                if current_state != ConversationState.ASSISTANT_SPEAKING:
                    # Allow PROCESSING state only if we haven't started speaking yet (first chunk)
                    if not (first_chunk and current_state == ConversationState.PROCESSING):
                        logger.info(f"[{self.session_id}] Stopping TTS stream due to state change (current: {current_state})")
                        await self.tts_provider.cancel_stream(stream_id)
                        break

                # Transition to ASSISTANT_SPEAKING on first chunk
                if first_chunk:
                    await self.state_machine.transition_to(
                        ConversationState.ASSISTANT_SPEAKING,
                        {"stream_id": stream_id}
                    )
                    first_chunk = False

                # Send audio to client
                await self._send_to_client({
                    "type": "audio_chunk",
                    "audio": audio_chunk.hex(),  # Send as hex string
                    "stream_id": stream_id
                })

            # TTS chunk complete
            # Note: We do NOT transition to IDLE here anymore, because there might be
            # more chunks coming from the LLM. The caller must explicitly call finish_speaking()

            end_time = datetime.datetime.now()
            duration_ms = (end_time - start_time).total_seconds() * 1000

            logger.warning(
                f"[{self.session_id}] Completed TTS stream {stream_id} "
                f"({chunk_count} chunks, {duration_ms:.0f}ms)"
            )

        except Exception as e:
            logger.error(f"[{self.session_id}] Error in TTS streaming: {e}", exc_info=True)
            await self._send_to_client({
                "type": "tts_error",
                "error": str(e)
            })
            await self.state_machine.transition_to(ConversationState.ERROR)

            await self.state_machine.transition_to(ConversationState.ERROR)

    async def finish_speaking(self) -> None:
        """
        Signal that assistant has finished speaking all chunks
        """
        current_state = self.state_machine.get_state()
        logger.warning(
            f"[{self.session_id}] finish_speaking() called while in state: {current_state.value}"
        )

        if current_state == ConversationState.ASSISTANT_SPEAKING:
            await self.state_machine.transition_to(ConversationState.IDLE)
            self.state_machine.set_tts_stream_id(None)
            logger.warning(f"[{self.session_id}] Transitioned to IDLE after speaking")

    async def _send_to_client(self, message: dict) -> None:
        """
        Send message to client via WebSocket

        Args:
            message: Message dictionary
        """
        try:
            message["session_id"] = self.session_id
            message["state"] = self.state_machine.get_state().value
            await self.websocket.send_json(message)
        except Exception as e:
            logger.error(f"[{self.session_id}] Error sending to client: {e}", exc_info=True)
            self._is_active = False

    def get_current_utterance(self) -> str:
        """Get the current user utterance"""
        return self._current_utterance

    def clear_current_utterance(self) -> None:
        """Clear the current utterance"""
        self._current_utterance = ""

    def is_active(self) -> bool:
        """Check if session is active"""
        return self._is_active

    async def close(self) -> None:
        """Close the session and cleanup resources"""
        logger.info(f"[{self.session_id}] Closing session")
        self._is_active = False

        # Cancel STT task
        if self._stt_task and not self._stt_task.done():
            self._stt_task.cancel()
            try:
                await self._stt_task
            except asyncio.CancelledError:
                pass

        # Stop STT stream
        await self.stt_provider.stop_stream(self.session_id)

        # Log metrics
        logger.info(
            f"[{self.session_id}] Session metrics: "
            f"user_turns={self.metrics['user_turns']}, "
            f"assistant_turns={self.metrics['assistant_turns']}, "
            f"barge_ins={self.metrics['barge_ins']}"
        )

    def to_dict(self) -> dict:
        """Convert session to dictionary"""
        return {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "instance_id": self.instance_id,
            "state": self.state_machine.to_dict(),
            "created_at": self.created_at.isoformat(),
            "last_activity": self.last_activity.isoformat(),
            "is_active": self._is_active,
            "metrics": self.metrics
        }


class VoiceSessionManager:
    """
    Manages all active voice sessions
    """

    def __init__(self):
        self._sessions: Dict[str, VoiceSession] = {}
        self._cleanup_task: Optional[asyncio.Task] = None

    async def create_session(
        self,
        user_id: str,
        instance_id: str,
        websocket: WebSocket,
        stt_provider: STTProvider,
        tts_provider: TTSProvider
    ) -> VoiceSession:
        """
        Create a new voice session

        Args:
            user_id: User identifier
            instance_id: Instance identifier
            websocket: WebSocket connection
            stt_provider: STT provider instance
            tts_provider: TTS provider instance

        Returns:
            Created VoiceSession
        """
        session_id = str(uuid.uuid4())

        session = VoiceSession(
            session_id=session_id,
            user_id=user_id,
            instance_id=instance_id,
            websocket=websocket,
            stt_provider=stt_provider,
            tts_provider=tts_provider
        )

        self._sessions[session_id] = session

        # Start STT provider
        await stt_provider.start_stream(session_id)

        # Start STT event processing task
        session._stt_task = asyncio.create_task(session.handle_stt_events())

        logger.info(
            f"Created voice session {session_id} for user {user_id}, "
            f"instance {instance_id}"
        )

        return session

    def get_session(self, session_id: str) -> Optional[VoiceSession]:
        """Get session by ID"""
        return self._sessions.get(session_id)

    async def close_session(self, session_id: str) -> None:
        """Close and remove a session"""
        session = self._sessions.get(session_id)
        if session:
            await session.close()
            del self._sessions[session_id]
            logger.info(f"Closed and removed session {session_id}")

    def get_active_sessions(self) -> list[VoiceSession]:
        """Get all active sessions"""
        return [s for s in self._sessions.values() if s.is_active()]

    def get_session_count(self) -> int:
        """Get count of active sessions"""
        return len(self._sessions)

    async def cleanup_inactive_sessions(self, max_inactive_seconds: int = 300) -> None:
        """Cleanup sessions that have been inactive for too long"""
        now = datetime.now()
        to_remove = []

        for session_id, session in self._sessions.items():
            inactive_seconds = (now - session.last_activity).total_seconds()
            if not session.is_active() or inactive_seconds > max_inactive_seconds:
                to_remove.append(session_id)

        for session_id in to_remove:
            await self.close_session(session_id)

        if to_remove:
            logger.info(f"Cleaned up {len(to_remove)} inactive sessions")

    async def start_cleanup_task(self, interval_seconds: int = 60) -> None:
        """Start periodic cleanup task"""
        async def cleanup_loop():
            while True:
                await asyncio.sleep(interval_seconds)
                await self.cleanup_inactive_sessions()

        self._cleanup_task = asyncio.create_task(cleanup_loop())
        logger.info("Started session cleanup task")

    async def stop_cleanup_task(self) -> None:
        """Stop cleanup task"""
        if self._cleanup_task and not self._cleanup_task.done():
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
        logger.info("Stopped session cleanup task")

    async def close_all_sessions(self) -> None:
        """Close all active sessions"""
        session_ids = list(self._sessions.keys())
        for session_id in session_ids:
            await self.close_session(session_id)
        logger.info("Closed all sessions")
