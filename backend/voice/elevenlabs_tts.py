"""
ElevenLabs Text-to-Speech provider implementation
"""
import asyncio
import logging
from typing import AsyncIterator, Optional, Dict
import httpx

from .tts_provider import TTSProvider

logger = logging.getLogger(__name__)


class ElevenLabsTTSProvider(TTSProvider):
    """
    ElevenLabs streaming TTS implementation

    Uses ElevenLabs' TTS API for text-to-speech synthesis with streaming
    """

    def __init__(self, api_key: str, **config):
        super().__init__(api_key, **config)

        # Default to a clear, neutral voice suitable for tutoring
        self.voice_id = config.get("voice_id", "21m00Tcm4TlvDq8ikWAM")  # Rachel voice
        self.model_id = config.get("model_id", "eleven_turbo_v2")  # Fast, low-latency model
        self.stability = config.get("stability", 0.5)  # 0-1
        self.similarity_boost = config.get("similarity_boost", 0.75)  # 0-1
        self.optimize_streaming_latency = config.get("optimize_streaming_latency", 4)  # 0-4
        self.output_format = config.get("output_format", "pcm_16000")  # pcm_16000, pcm_22050, pcm_24000

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
            logger.warning("[ElevenLabs TTS] Empty text, skipping synthesis")
            return

        voice = voice_id or self.voice_id
        if stream_id:
            self._active_streams[stream_id] = True

        logger.info(f"[ElevenLabs TTS] Synthesizing text (stream_id={stream_id}): {text[:100]}...")

        try:
            # Build request
            # output_format and optimize_streaming_latency must be query parameters
            query_params = f"?output_format={self.output_format}&optimize_streaming_latency={self.optimize_streaming_latency}"
            url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice}/stream{query_params}"
            
            headers = {
                "xi-api-key": self.api_key,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg"  # or audio/wav
            }
            payload = {
                "text": text,
                "model_id": self.model_id,
                "voice_settings": {
                    "stability": self.stability,
                    "similarity_boost": self.similarity_boost
                }
            }

            # Stream response
            async with self._client.stream("POST", url, headers=headers, json=payload) as response:
                if response.status_code != 200:
                    error_text = await response.aread()
                    logger.error(
                        f"[ElevenLabs TTS] API error (stream_id={stream_id}): "
                        f"{response.status_code} - {error_text.decode()}"
                    )
                    return

                # Stream audio chunks
                chunk_count = 0
                buffer = bytearray()
                
                async for chunk in response.aiter_bytes(chunk_size=4096):
                    # Check if stream was cancelled
                    if stream_id and not self._active_streams.get(stream_id, False):
                        logger.info(f"[ElevenLabs TTS] Stream {stream_id} cancelled, stopping")
                        break

                    if chunk:
                        buffer.extend(chunk)
                        
                        # Ensure we have an even number of bytes (for 16-bit PCM)
                        if len(buffer) >= 2:
                            # Calculate length to send (must be even)
                            send_len = len(buffer) - (len(buffer) % 2)
                            
                            if send_len > 0:
                                chunk_to_send = bytes(buffer[:send_len])
                                buffer = buffer[send_len:]
                                
                                chunk_count += 1
                                yield chunk_to_send
                
                # Yield remaining bytes if any (though odd bytes would still be an issue, 
                # but usually the total stream is even)
                if len(buffer) > 0:
                    chunk_count += 1
                    yield bytes(buffer)

                logger.info(
                    f"[ElevenLabs TTS] Completed synthesis (stream_id={stream_id}, "
                    f"chunks={chunk_count})"
                )

        except httpx.HTTPError as e:
            logger.error(f"[ElevenLabs TTS] HTTP error (stream_id={stream_id}): {e}", exc_info=True)
        except Exception as e:
            logger.error(f"[ElevenLabs TTS] Error (stream_id={stream_id}): {e}", exc_info=True)
        finally:
            # Cleanup
            if stream_id and stream_id in self._active_streams:
                del self._active_streams[stream_id]

    async def cancel_stream(self, stream_id: str) -> None:
        """Cancel an ongoing TTS stream"""
        if stream_id in self._active_streams:
            self._active_streams[stream_id] = False
            logger.info(f"[ElevenLabs TTS] Cancelled stream {stream_id}")

    async def close(self) -> None:
        """Close and cleanup resources"""
        await self._client.aclose()
        logger.info("[ElevenLabs TTS] Closed HTTP client")
