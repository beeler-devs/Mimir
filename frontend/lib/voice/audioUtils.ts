/**
 * Audio utilities for voice assistant
 */

/**
 * Convert Float32Array PCM to Int16Array
 */
export function float32ToInt16(buffer: Float32Array): Int16Array {
  const int16 = new Int16Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    const s = Math.max(-1, Math.min(1, buffer[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

/**
 * Convert Int16Array to hex string for transmission
 */
export function int16ToHex(buffer: Int16Array): string {
  const bytes = new Uint8Array(buffer.buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to Int16Array for playback
 */
export function hexToInt16(hex: string): Int16Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return new Int16Array(bytes.buffer);
}

/**
 * Convert Int16Array PCM to Float32Array for Web Audio API
 */
export function int16ToFloat32(buffer: Int16Array): Float32Array {
  const float32 = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    float32[i] = buffer[i] / (buffer[i] < 0 ? 0x8000 : 0x7fff);
  }
  return float32;
}

/**
 * Resample audio buffer to a different sample rate
 */
export function resampleBuffer(
  buffer: Float32Array,
  fromRate: number,
  toRate: number
): Float32Array {
  if (fromRate === toRate) {
    return buffer;
  }

  const ratio = fromRate / toRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, buffer.length - 1);
    const t = srcIndex - srcIndexFloor;

    // Linear interpolation
    result[i] = buffer[srcIndexFloor] * (1 - t) + buffer[srcIndexCeil] * t;
  }

  return result;
}

/**
 * Get user media with audio constraints optimized for speech
 */
export async function getUserMicrophoneStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: { ideal: 16000 },
        channelCount: { ideal: 1 }
      },
      video: false
    });
  } catch (error) {
    console.error('Error getting microphone:', error);
    throw new Error('Microphone access denied or unavailable');
  }
}

/**
 * Calculate RMS (root mean square) amplitude of audio buffer
 */
export function calculateRMS(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / buffer.length);
}

/**
 * Detect if audio buffer is silent
 */
export function isSilent(buffer: Float32Array, threshold: number = 0.01): boolean {
  const rms = calculateRMS(buffer);
  return rms < threshold;
}

/**
 * Audio format constants
 */
export const AUDIO_CONFIG = {
  SAMPLE_RATE: 16000,
  CHANNELS: 1,
  BIT_DEPTH: 16,
  BUFFER_SIZE: 4096,
  CHUNK_SIZE: 2048, // Send chunks every ~128ms at 16kHz
} as const;
