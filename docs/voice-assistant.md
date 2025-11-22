# Voice Assistant Feature

## Overview

Mimir includes a real-time AI voice tutor that allows students to have natural, spoken conversations with Claude. The voice assistant supports:

- **Low-latency streaming**: ~300-500ms from end of speech to AI response
- **Full-duplex conversation**: Students can interrupt the AI ("barge-in")
- **Real-time transcription**: Live transcripts appear in the chat panel
- **UI integration**: AI can trigger UI actions (show mind maps, play animations, etc.)
- **Socratic tutoring**: AI asks guiding questions before giving answers

## Architecture

### Pipeline

```
Browser Mic → WebSocket → Voice Gateway → STT (Deepgram) → Claude → TTS (OpenAI/ElevenLabs) → WebSocket → Browser Audio
```

### Components

**Backend** (`backend/voice/`):
- `session.py`: Voice session management
- `state_machine.py`: Conversation state machine (IDLE → LISTENING → PROCESSING → SPEAKING)
- `stt_provider.py`: STT abstraction layer
- `deepgram_stt.py`: Deepgram streaming STT implementation
- `tts_provider.py`: TTS abstraction layer
- `openai_tts.py`: OpenAI TTS implementation
- `elevenlabs_tts.py`: ElevenLabs TTS implementation
- `claude_voice_integration.py`: Integration with Claude tutoring session
- `audio_utils.py`: Audio processing utilities

**Frontend** (`frontend/`):
- `hooks/useVoiceSession.ts`: Main voice session hook
- `hooks/useAudioRecorder.ts`: Microphone recording
- `hooks/useAudioPlayback.ts`: Audio playback
- `components/ai/VoiceButton.tsx`: Voice control UI
- `lib/voice/audioUtils.ts`: Audio utilities

### WebSocket Protocol

#### Client → Server

1. **Auth**: `{"type": "auth", "user_id": "...", "instance_id": "..."}`
2. **Audio**: `{"type": "audio", "audio": "hex_string"}`
3. **Stop Speaking**: `{"type": "stop_speaking"}`
4. **Ping**: `{"type": "ping"}`

#### Server → Client

1. **Connected**: `{"type": "connected", "session_id": "...", "state": "..."}`
2. **Partial Transcript**: `{"type": "partial_transcript", "transcript": "...", "confidence": 0.95}`
3. **Final Transcript**: `{"type": "final_transcript", "transcript": "...", "confidence": 0.98}`
4. **Audio Chunk**: `{"type": "audio_chunk", "audio": "hex_string", "stream_id": "..."}`
5. **Barge-in**: `{"type": "barge_in"}`
6. **UI Actions**: `{"type": "ui_actions", "actions": [...]}`
7. **Assistant Transcript**: `{"type": "assistant_transcript", "transcript": "..."}`
8. **Error**: `{"type": "error", "error": "..."}`

## Setup

### Prerequisites

1. **Python dependencies** (backend):
```bash
cd backend
pip install -r requirements.txt
```

2. **API Keys**:
- **Deepgram** (STT): https://console.deepgram.com/
- **OpenAI** (TTS, optional): https://platform.openai.com/api-keys
- **ElevenLabs** (TTS, alternative): https://elevenlabs.io/
- **Anthropic Claude** (LLM): https://console.anthropic.com/

### Configuration

1. **Backend** (`backend/.env`):
```bash
# Required
CLAUDE_API_KEY=sk-ant-your-key
DEEPGRAM_API_KEY=your-deepgram-key

# TTS (at least one required)
OPENAI_API_KEY=sk-your-openai-key
# OR
ELEVENLABS_API_KEY=your-elevenlabs-key

# Optional
VOICE_ASSISTANT_ENABLED=true
PORT=8001
```

2. **Frontend** (`frontend/.env.local`):
```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:8001
NEXT_PUBLIC_BACKEND_WS=ws://localhost:8001
NEXT_PUBLIC_VOICE_ENABLED=true
```

### Running Locally

1. **Start backend**:
```bash
cd backend
uvicorn main:app --reload --port 8001
```

2. **Start frontend**:
```bash
cd frontend
npm run dev
```

3. **Test voice**:
- Open http://localhost:3000
- Click the microphone button in the chat panel
- Speak a question
- Listen to Claude's response

## Usage

### Basic Usage

```tsx
import { VoiceButton } from '@/components/ai/VoiceButton';

function MyComponent() {
  return (
    <VoiceButton
      userId="user-123"
      instanceId="instance-456"
      onTranscript={(transcript) => {
        console.log(transcript);
      }}
      onUIAction={(action) => {
        console.log('UI Action:', action);
      }}
    />
  );
}
```

### Advanced: Custom Voice Integration

```tsx
import { useVoiceSession } from '@/hooks/useVoiceSession';

function CustomVoiceComponent() {
  const {
    state,
    isConnected,
    startVoice,
    stopVoice,
    currentTranscript,
    error
  } = useVoiceSession({
    userId: 'user-123',
    instanceId: 'instance-456',
    onTranscript: (transcript) => {
      // Handle transcript
      if (transcript.isFinal) {
        addMessageToChat(transcript);
      }
    },
    onUIAction: (action) => {
      // Handle UI actions
      if (action.type === 'HIGHLIGHT_MIND_MAP_NODE') {
        highlightNode(action.nodeId);
      }
    }
  });

  return (
    <div>
      <button onClick={startVoice} disabled={isConnected}>
        Start Voice
      </button>
      <button onClick={stopVoice} disabled={!isConnected}>
        Stop Voice
      </button>
      <div>State: {state}</div>
      {currentTranscript && (
        <div>{currentTranscript.text}</div>
      )}
    </div>
  );
}
```

## State Machine

The voice assistant operates with the following states:

```
IDLE ──────> USER_SPEAKING ──────> PROCESSING ──────> ASSISTANT_SPEAKING ──────> IDLE
  ↑              |                      |                     |                     ↑
  |              └──────────────────────┘                     └─────────────────────┘
  |                                                            (barge-in)
  └───────────────────────────────────────────────────────────────────────────────┘
```

- **IDLE**: Waiting for user to start
- **USER_SPEAKING**: STT is actively transcribing
- **PROCESSING**: Claude is generating a response
- **ASSISTANT_SPEAKING**: TTS audio is playing
- **Barge-in**: User can interrupt ASSISTANT_SPEAKING to return to USER_SPEAKING

## Barge-in (Interruption)

The system supports full-duplex conversation with barge-in:

1. **Detection**: STT detects speech while AI is speaking
2. **Cancellation**: Backend immediately stops TTS stream
3. **State transition**: ASSISTANT_SPEAKING → USER_SPEAKING
4. **Audio cleanup**: Frontend stops audio playback
5. **New turn**: User's new utterance is processed

## UI Actions

Claude can trigger UI actions in its responses:

```python
# In Claude's response:
UI_ACTION: {"type": "HIGHLIGHT_MIND_MAP_NODE", "nodeId": "derivatives-101"}
UI_ACTION: {"type": "SHOW_MANIM_SCENE", "sceneId": "limit-definition"}
```

These are extracted and sent to the frontend as structured events.

### Available Action Types

- `HIGHLIGHT_MIND_MAP_NODE`: Highlight a specific mind map node
- `SHOW_MANIM_SCENE`: Play a Manim animation
- `SHOW_HINT`: Display a hint on screen
- `FOCUS_CANVAS`: Focus on a specific area of the canvas

## Debugging

### Backend Logs

Enable verbose logging:
```bash
cd backend
LOG_LEVEL=DEBUG uvicorn main:app --reload --port 8001
```

Look for:
- `[Voice WS]`: WebSocket connection logs
- `[Deepgram]`: STT logs
- `[OpenAI TTS]` / `[ElevenLabs TTS]`: TTS logs
- `[Claude Voice]`: Claude integration logs

### Frontend Console

Open browser DevTools console and look for:
- `Voice session connected`: WebSocket connected
- `Audio recorder error`: Microphone issues
- `Voice session error`: General errors

### Common Issues

#### 1. Microphone not working
**Symptom**: No audio being sent to backend
**Solution**: Check browser permissions, ensure HTTPS (or localhost)

#### 2. No audio playback
**Symptom**: Transcripts appear but no audio
**Solution**: Check TTS API key, verify audio format compatibility

#### 3. High latency
**Symptom**: >1s delay from speech to response
**Solution**:
- Use OpenAI `tts-1` (not `tts-1-hd`)
- Use ElevenLabs `eleven_turbo_v2`
- Check network latency
- Reduce Deepgram endpointing time

#### 4. WebSocket disconnects
**Symptom**: Frequent disconnections
**Solution**: Check firewall, enable WebSocket keepalive, verify backend is running

## Testing

### Manual Testing Checklist

- [ ] Microphone access granted
- [ ] Voice button shows correct states (idle → connecting → listening → thinking → speaking)
- [ ] Partial transcripts appear in real-time
- [ ] Final transcripts are accurate
- [ ] AI response audio plays clearly
- [ ] Barge-in works (interrupt AI mid-sentence)
- [ ] UI actions trigger correctly
- [ ] Transcripts appear in chat panel
- [ ] Session cleanup on disconnect

### Automated Tests

```bash
# Backend tests (future)
cd backend
pytest tests/voice/

# Frontend tests (future)
cd frontend
npm test -- voice
```

## Performance

### Latency Breakdown

Target latency: **~300-500ms** from end of user speech to first AI audio

- STT finalization: 50-200ms
- Claude response (first token): 100-200ms
- TTS synthesis (first chunk): 100-200ms
- Network + audio buffering: 50-100ms

### Optimization Tips

1. **Use streaming everywhere**: STT, LLM, TTS all streaming
2. **Chunk text smartly**: Send sentences to TTS as soon as available
3. **Tune endpointing**: Balance between responsiveness and false positives
4. **Choose fast models**: `tts-1`, `eleven_turbo_v2`, `nova-2` STT
5. **Minimize network hops**: Deploy backend and STT/TTS in same region

## Cost Estimates

Assuming 10-minute conversation:

- **STT (Deepgram)**: ~$0.08 (10min × $0.0043/min × 2 for streaming)
- **TTS (OpenAI)**: ~$0.15 (1000 characters × $0.015/1K chars)
- **TTS (ElevenLabs)**: ~$0.30 (10K characters × $0.03/1K chars)
- **Claude (Sonnet)**: Variable, ~$0.01-0.10 depending on context

**Total per 10-min session**: ~$0.20-0.50

## Security

- WebSocket connections are authenticated via `user_id` and `instance_id`
- Audio streams are not stored by default (configurable)
- Transcripts are stored in the same way as text chat
- API keys are server-side only (never exposed to client)

## Future Enhancements

- [ ] Voice activity detection (VAD) for better endpointing
- [ ] Audio recording for later review
- [ ] Multi-speaker support
- [ ] Voice profiles and customization
- [ ] Emotion detection
- [ ] Real-time translation
- [ ] Whisper mode (reduce AI speaking volume during user thinking)

## Contributing

When adding new features to the voice assistant:

1. Update this documentation
2. Add tests (when testing framework is ready)
3. Update type definitions
4. Consider backward compatibility
5. Profile for latency impact

## References

- [Deepgram Streaming API](https://developers.deepgram.com/docs/streaming)
- [OpenAI TTS](https://platform.openai.com/docs/guides/text-to-speech)
- [ElevenLabs Streaming](https://elevenlabs.io/docs/api-reference/streaming)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [MediaStream Recording API](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API)
