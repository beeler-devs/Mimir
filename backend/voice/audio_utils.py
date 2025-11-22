"""
Audio processing utilities for voice gateway
"""
import base64
import struct
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class AudioFormat:
    """Audio format constants"""
    SAMPLE_RATE_8KHZ = 8000
    SAMPLE_RATE_16KHZ = 16000
    SAMPLE_RATE_24KHZ = 24000
    SAMPLE_RATE_48KHZ = 48000

    ENCODING_PCM16 = "pcm16"
    ENCODING_OPUS = "opus"
    ENCODING_MULAW = "mulaw"


def pcm16_to_base64(pcm_bytes: bytes) -> str:
    """Convert PCM16 bytes to base64 string"""
    return base64.b64encode(pcm_bytes).decode('utf-8')


def base64_to_pcm16(b64_string: str) -> bytes:
    """Convert base64 string to PCM16 bytes"""
    return base64.b64decode(b64_string)


def resample_audio(
    audio_bytes: bytes,
    from_rate: int,
    to_rate: int,
    channels: int = 1
) -> bytes:
    """
    Resample audio from one sample rate to another

    Note: This is a simple implementation. For production,
    consider using libraries like librosa or scipy for better quality.

    Args:
        audio_bytes: Raw PCM16 audio bytes
        from_rate: Source sample rate
        to_rate: Target sample rate
        channels: Number of audio channels

    Returns:
        Resampled audio bytes
    """
    if from_rate == to_rate:
        return audio_bytes

    # Simple nearest-neighbor resampling (not high quality, but fast)
    # For production, use proper resampling libraries
    sample_size = 2  # 16-bit = 2 bytes
    frame_size = sample_size * channels

    num_frames_in = len(audio_bytes) // frame_size
    num_frames_out = int(num_frames_in * to_rate / from_rate)

    output = bytearray()

    for i in range(num_frames_out):
        # Find nearest source frame
        src_frame = int(i * from_rate / to_rate)
        if src_frame >= num_frames_in:
            src_frame = num_frames_in - 1

        src_offset = src_frame * frame_size
        output.extend(audio_bytes[src_offset:src_offset + frame_size])

    return bytes(output)


def chunk_text_for_tts(text: str, chunk_size: int = 200) -> list[str]:
    """
    Split text into chunks suitable for streaming TTS

    Args:
        text: Input text
        chunk_size: Approximate chunk size in characters

    Returns:
        List of text chunks split on sentence boundaries
    """
    if len(text) <= chunk_size:
        return [text]

    # Split on sentence boundaries
    sentences = []
    current = ""

    for char in text:
        current += char
        if char in '.!?' and len(current) > 20:
            sentences.append(current.strip())
            current = ""

    if current.strip():
        sentences.append(current.strip())

    # Combine sentences into chunks
    chunks = []
    current_chunk = ""

    for sentence in sentences:
        if len(current_chunk) + len(sentence) <= chunk_size:
            current_chunk += " " + sentence if current_chunk else sentence
        else:
            if current_chunk:
                chunks.append(current_chunk)
            current_chunk = sentence

    if current_chunk:
        chunks.append(current_chunk)

    return chunks


def detect_silence(audio_bytes: bytes, threshold: int = 500) -> bool:
    """
    Detect if audio chunk is silent

    Args:
        audio_bytes: Raw PCM16 audio bytes
        threshold: RMS threshold for silence detection

    Returns:
        True if audio is considered silent
    """
    if len(audio_bytes) < 2:
        return True

    # Calculate RMS (root mean square) amplitude
    samples = []
    for i in range(0, len(audio_bytes) - 1, 2):
        sample = struct.unpack('<h', audio_bytes[i:i+2])[0]
        samples.append(sample * sample)

    if not samples:
        return True

    rms = (sum(samples) / len(samples)) ** 0.5
    return rms < threshold


def calculate_audio_duration_ms(audio_bytes: bytes, sample_rate: int = 16000, channels: int = 1) -> int:
    """
    Calculate duration of audio in milliseconds

    Args:
        audio_bytes: Raw PCM16 audio bytes
        sample_rate: Sample rate in Hz
        channels: Number of channels

    Returns:
        Duration in milliseconds
    """
    sample_size = 2  # 16-bit = 2 bytes
    frame_size = sample_size * channels
    num_frames = len(audio_bytes) // frame_size
    duration_seconds = num_frames / sample_rate
    return int(duration_seconds * 1000)


class AudioBuffer:
    """Buffer for accumulating audio chunks"""

    def __init__(self, max_duration_ms: int = 5000, sample_rate: int = 16000):
        self.buffer = bytearray()
        self.max_duration_ms = max_duration_ms
        self.sample_rate = sample_rate
        self.max_bytes = (max_duration_ms * sample_rate * 2) // 1000  # PCM16

    def append(self, audio_bytes: bytes) -> None:
        """Append audio to buffer"""
        self.buffer.extend(audio_bytes)

        # Trim if exceeds max duration
        if len(self.buffer) > self.max_bytes:
            overflow = len(self.buffer) - self.max_bytes
            self.buffer = self.buffer[overflow:]

    def get_bytes(self) -> bytes:
        """Get buffered audio bytes"""
        return bytes(self.buffer)

    def clear(self) -> None:
        """Clear buffer"""
        self.buffer.clear()

    def duration_ms(self) -> int:
        """Get current buffer duration in ms"""
        return calculate_audio_duration_ms(bytes(self.buffer), self.sample_rate)

    def is_empty(self) -> bool:
        """Check if buffer is empty"""
        return len(self.buffer) == 0
