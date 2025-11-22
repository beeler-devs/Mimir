"""
OpenAI Text-to-Speech provider implementation
"""
import asyncio
import logging
from typing import AsyncIterator, Optional, Dict
import httpx

from .tts_provider import TTSProvider

logger = logging.getLogger(__name__)


class OpenAITTSProvider(TTSProvider):
    """
    OpenAI streaming TTS implementation

    Uses OpenAI's TTS API for text-to-speech synthesis
    """

    def __init__(self, api_key: str, **config):
        super().__init__(api_key, **config)

        self.model = config.get("model", "tts-1")  # tts-1 or tts-1-hd
        self.voice = config.get("voice", "alloy")  # alloy, echo, fable, onyx, nova, shimmer
        self.speed = config.get("speed", 1.0)  # 0.25 to 4.0
        self.response_format = config.get("response_format", "pcm")  # pcm, opus, aac, flac

        # For cancellation
        self._active_streams: Dict[str, bool] = {}
        self._client = httpx.AsyncClient(timeout=30.0)

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
            voice_id: Optional voice identifier (overrides default)
            stream_id: Optional stream identifier for cancellation
        """
        if not text or not text.strip():
            logger.warning("[OpenAI TTS] Empty text, skipping synthesis")
            return

        voice = voice_id or self.voice
        if stream_id:
            self._active_streams[stream_id] = True

        logger.info(f"[OpenAI TTS] Synthesizing text (stream_id={stream_id}): {text[:100]}...")

        try:
            # Build request
            url = "https://api.openai.com/v1/audio/speech"
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": self.model,
                "input": text,
                "voice": voice,
                "speed": self.speed,
                "response_format": self.response_format
            }

            # Stream response
            async with self._client.stream("POST", url, headers=headers, json=payload) as response:
                if response.status_code != 200:
                    error_text = await response.aread()
                    logger.error(
                        f"[OpenAI TTS] API error (stream_id={stream_id}): "
                        f"{response.status_code} - {error_text.decode()}"
                    )
                    return

                # Stream audio chunks
                chunk_count = 0
                async for chunk in response.aiter_bytes(chunk_size=4096):
                    # Check if stream was cancelled
                    if stream_id and not self._active_streams.get(stream_id, False):
                        logger.info(f"[OpenAI TTS] Stream {stream_id} cancelled, stopping")
                        break

                    if chunk:
                        chunk_count += 1
                        yield chunk

                logger.info(
                    f"[OpenAI TTS] Completed synthesis (stream_id={stream_id}, "
                    f"chunks={chunk_count})"
                )

        except httpx.HTTPError as e:
            logger.error(f"[OpenAI TTS] HTTP error (stream_id={stream_id}): {e}", exc_info=True)
        except Exception as e:
            logger.error(f"[OpenAI TTS] Error (stream_id={stream_id}): {e}", exc_info=True)
        finally:
            # Cleanup
            if stream_id and stream_id in self._active_streams:
                del self._active_streams[stream_id]

    async def cancel_stream(self, stream_id: str) -> None:
        """Cancel an ongoing TTS stream"""
        if stream_id in self._active_streams:
            self._active_streams[stream_id] = False
            logger.info(f"[OpenAI TTS] Cancelled stream {stream_id}")

    async def close(self) -> None:
        """Close and cleanup resources"""
        await self._client.aclose()
        logger.info("[OpenAI TTS] Closed HTTP client")
