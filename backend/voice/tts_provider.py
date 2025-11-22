"""
Text-to-Speech provider abstraction
"""
from abc import ABC, abstractmethod
from typing import AsyncIterator, Optional
import logging

logger = logging.getLogger(__name__)


class TTSProvider(ABC):
    """Abstract base class for TTS providers"""

    def __init__(self, api_key: str, **config):
        self.api_key = api_key
        self.config = config
        self._current_stream_id: Optional[str] = None

    @abstractmethod
    async def synthesize_stream(
        self,
        text: str,
        voice_id: Optional[str] = None,
        stream_id: Optional[str] = None
    ) -> AsyncIterator[bytes]:
        """
        Convert text to speech and stream audio chunks

        Args:
            text: Text to synthesize
            voice_id: Optional voice identifier
            stream_id: Optional stream identifier for cancellation

        Yields:
            Audio bytes (PCM16, 16kHz mono or format specified in config)
        """
        pass

    @abstractmethod
    async def cancel_stream(self, stream_id: str) -> None:
        """
        Cancel an ongoing TTS stream (for barge-in)

        Args:
            stream_id: Stream identifier to cancel
        """
        pass

    @abstractmethod
    async def close(self) -> None:
        """Close and cleanup resources"""
        pass

    def get_audio_format(self) -> dict:
        """
        Get audio format information

        Returns:
            Dictionary with sample_rate, channels, encoding
        """
        return {
            "sample_rate": self.config.get("sample_rate", 16000),
            "channels": self.config.get("channels", 1),
            "encoding": self.config.get("encoding", "pcm16")
        }
