"""
Speech-to-Text provider abstraction
"""
from abc import ABC, abstractmethod
from typing import AsyncIterator, Callable, Optional
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class STTEvent(Enum):
    """STT event types"""
    PARTIAL_TRANSCRIPT = "partial_transcript"
    FINAL_TRANSCRIPT = "final_transcript"
    SPEECH_STARTED = "speech_started"
    SPEECH_ENDED = "speech_ended"
    ERROR = "error"


class STTEventData:
    """STT event data"""
    def __init__(
        self,
        event_type: STTEvent,
        transcript: str = "",
        confidence: float = 0.0,
        is_final: bool = False,
        error: Optional[str] = None
    ):
        self.event_type = event_type
        self.transcript = transcript
        self.confidence = confidence
        self.is_final = is_final
        self.error = error

    def to_dict(self):
        return {
            "event_type": self.event_type.value,
            "transcript": self.transcript,
            "confidence": self.confidence,
            "is_final": self.is_final,
            "error": self.error
        }


class STTProvider(ABC):
    """Abstract base class for STT providers"""

    def __init__(self, api_key: str, **config):
        self.api_key = api_key
        self.config = config
        self._is_streaming = False

    @abstractmethod
    async def start_stream(self, session_id: str) -> None:
        """
        Start a new STT stream for a session

        Args:
            session_id: Unique session identifier
        """
        pass

    @abstractmethod
    async def send_audio(self, session_id: str, audio_chunk: bytes) -> None:
        """
        Send audio chunk to the STT provider

        Args:
            session_id: Session identifier
            audio_chunk: Raw audio bytes (PCM16, 16kHz mono)
        """
        pass

    @abstractmethod
    async def stop_stream(self, session_id: str) -> None:
        """
        Stop the STT stream for a session

        Args:
            session_id: Session identifier
        """
        pass

    @abstractmethod
    async def get_events(self, session_id: str) -> AsyncIterator[STTEventData]:
        """
        Get async stream of STT events for a session

        Args:
            session_id: Session identifier

        Yields:
            STTEventData objects
        """
        pass

    @property
    def is_streaming(self) -> bool:
        """Check if currently streaming"""
        return self._is_streaming

    @abstractmethod
    async def close(self) -> None:
        """Close and cleanup resources"""
        pass
