"""
Deepgram Speech-to-Text provider implementation
"""
import asyncio
import logging
import json
from typing import AsyncIterator, Dict, Optional
import websockets
from websockets.client import WebSocketClientProtocol

from .stt_provider import STTProvider, STTEvent, STTEventData

logger = logging.getLogger(__name__)


class DeepgramSTTProvider(STTProvider):
    """
    Deepgram streaming STT implementation

    Uses Deepgram's WebSocket API for real-time transcription
    """

    def __init__(self, api_key: str, **config):
        super().__init__(api_key, **config)

        self.model = config.get("model", "nova-2")
        self.language = config.get("language", "en-US")
        self.sample_rate = config.get("sample_rate", 16000)
        self.encoding = config.get("encoding", "linear16")
        self.channels = config.get("channels", 1)
        self.interim_results = config.get("interim_results", True)
        self.punctuate = config.get("punctuate", True)
        self.endpointing = config.get("endpointing", 800)  # ms of silence to end utterance

        # Session management
        self._sessions: Dict[str, dict] = {}
        self._event_queues: Dict[str, asyncio.Queue] = {}

    async def start_stream(self, session_id: str) -> None:
        """Start a new Deepgram STT stream"""
        if session_id in self._sessions:
            logger.warning(f"[Deepgram] Session {session_id} already exists")
            return

        # Build Deepgram WebSocket URL
        params = {
            "model": self.model,
            "language": self.language,
            "sample_rate": self.sample_rate,
            "encoding": self.encoding,
            "channels": self.channels,
            "interim_results": str(self.interim_results).lower(),
            "punctuate": str(self.punctuate).lower(),
            "endpointing": self.endpointing,
            "vad_events": "true",  # Get speech start/end events
        }

        param_string = "&".join([f"{k}={v}" for k, v in params.items()])
        ws_url = f"wss://api.deepgram.com/v1/listen?{param_string}"

        try:
            # Connect to Deepgram
            websocket = await websockets.connect(
                ws_url,
                extra_headers={"Authorization": f"Token {self.api_key}"}
            )

            event_queue = asyncio.Queue()
            self._event_queues[session_id] = event_queue

            # Create session
            self._sessions[session_id] = {
                "websocket": websocket,
                "event_queue": event_queue,
                "receive_task": None,
                "is_active": True
            }

            # Start receiving task
            receive_task = asyncio.create_task(
                self._receive_loop(session_id, websocket, event_queue)
            )
            self._sessions[session_id]["receive_task"] = receive_task

            logger.info(f"[Deepgram] Started STT stream for session {session_id}")
            self._is_streaming = True

        except Exception as e:
            logger.error(f"[Deepgram] Error starting stream for {session_id}: {e}", exc_info=True)
            # Send error event
            if session_id in self._event_queues:
                await self._event_queues[session_id].put(
                    STTEventData(STTEvent.ERROR, error=str(e))
                )

    async def _receive_loop(
        self,
        session_id: str,
        websocket: WebSocketClientProtocol,
        event_queue: asyncio.Queue
    ) -> None:
        """Receive and process messages from Deepgram"""
        try:
            async for message in websocket:
                if not isinstance(message, str):
                    continue

                try:
                    data = json.loads(message)

                    # Handle different message types
                    if data.get("type") == "Results":
                        await self._handle_transcript(session_id, data, event_queue)
                    elif data.get("type") == "SpeechStarted":
                        await event_queue.put(
                            STTEventData(STTEvent.SPEECH_STARTED)
                        )
                        logger.debug(f"[Deepgram] Speech started for {session_id}")
                    elif data.get("type") == "UtteranceEnd":
                        await event_queue.put(
                            STTEventData(STTEvent.SPEECH_ENDED)
                        )
                        logger.debug(f"[Deepgram] Speech ended for {session_id}")
                    elif data.get("type") == "Metadata":
                        # Metadata message, can be ignored or logged
                        logger.debug(f"[Deepgram] Metadata for {session_id}: {data}")

                except json.JSONDecodeError as e:
                    logger.error(f"[Deepgram] JSON decode error for {session_id}: {e}")

        except websockets.exceptions.ConnectionClosed:
            logger.info(f"[Deepgram] Connection closed for {session_id}")
        except Exception as e:
            logger.error(f"[Deepgram] Error in receive loop for {session_id}: {e}", exc_info=True)
            await event_queue.put(
                STTEventData(STTEvent.ERROR, error=str(e))
            )
        finally:
            if session_id in self._sessions:
                self._sessions[session_id]["is_active"] = False

    async def _handle_transcript(
        self,
        session_id: str,
        data: dict,
        event_queue: asyncio.Queue
    ) -> None:
        """Handle transcript results from Deepgram"""
        try:
            channel = data.get("channel", {})
            alternatives = channel.get("alternatives", [])

            if not alternatives:
                return

            # Get best alternative
            alternative = alternatives[0]
            transcript = alternative.get("transcript", "").strip()
            confidence = alternative.get("confidence", 0.0)
            is_final = data.get("is_final", False)

            if not transcript:
                return

            # Determine event type
            if is_final:
                event_type = STTEvent.FINAL_TRANSCRIPT
                logger.info(f"[Deepgram] Final transcript for {session_id}: {transcript}")
            else:
                event_type = STTEvent.PARTIAL_TRANSCRIPT
                logger.debug(f"[Deepgram] Partial transcript for {session_id}: {transcript}")

            # Send event
            await event_queue.put(
                STTEventData(
                    event_type=event_type,
                    transcript=transcript,
                    confidence=confidence,
                    is_final=is_final
                )
            )

        except Exception as e:
            logger.error(f"[Deepgram] Error handling transcript for {session_id}: {e}", exc_info=True)

    async def send_audio(self, session_id: str, audio_chunk: bytes) -> None:
        """Send audio chunk to Deepgram"""
        session = self._sessions.get(session_id)
        if not session or not session["is_active"]:
            logger.warning(f"[Deepgram] Session {session_id} not active, cannot send audio")
            return

        try:
            websocket = session["websocket"]
            await websocket.send(audio_chunk)
        except Exception as e:
            logger.error(f"[Deepgram] Error sending audio for {session_id}: {e}", exc_info=True)
            # Mark session as inactive
            session["is_active"] = False
            # Send error event
            await session["event_queue"].put(
                STTEventData(STTEvent.ERROR, error=str(e))
            )

    async def stop_stream(self, session_id: str) -> None:
        """Stop the STT stream"""
        session = self._sessions.get(session_id)
        if not session:
            return

        try:
            websocket = session["websocket"]

            # Send close frame to Deepgram
            await websocket.send(json.dumps({"type": "CloseStream"}))

            # Wait a bit for final transcripts
            await asyncio.sleep(0.5)

            # Close websocket
            await websocket.close()

            # Cancel receive task
            receive_task = session.get("receive_task")
            if receive_task and not receive_task.done():
                receive_task.cancel()
                try:
                    await receive_task
                except asyncio.CancelledError:
                    pass

            logger.info(f"[Deepgram] Stopped STT stream for {session_id}")

        except Exception as e:
            logger.error(f"[Deepgram] Error stopping stream for {session_id}: {e}", exc_info=True)
        finally:
            # Cleanup
            if session_id in self._sessions:
                del self._sessions[session_id]
            if session_id in self._event_queues:
                del self._event_queues[session_id]

            if not self._sessions:
                self._is_streaming = False

    async def get_events(self, session_id: str) -> AsyncIterator[STTEventData]:
        """Get async stream of STT events"""
        event_queue = self._event_queues.get(session_id)
        if not event_queue:
            logger.error(f"[Deepgram] No event queue for session {session_id}")
            return

        try:
            while True:
                session = self._sessions.get(session_id)
                if not session or not session["is_active"]:
                    # Check if there are remaining events
                    if event_queue.empty():
                        break

                # Wait for next event with timeout
                try:
                    event = await asyncio.wait_for(event_queue.get(), timeout=1.0)
                    yield event
                except asyncio.TimeoutError:
                    # Continue loop
                    continue

        except asyncio.CancelledError:
            logger.info(f"[Deepgram] Event stream cancelled for {session_id}")
        except Exception as e:
            logger.error(f"[Deepgram] Error in event stream for {session_id}: {e}", exc_info=True)

    async def close(self) -> None:
        """Close all sessions and cleanup"""
        session_ids = list(self._sessions.keys())
        for session_id in session_ids:
            await self.stop_stream(session_id)

        logger.info("[Deepgram] Closed all STT sessions")
