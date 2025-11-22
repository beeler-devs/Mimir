# Voice Assistant Quick Start

Get the voice tutor running in 5 minutes!

## 1. Get API Keys

### Required:
- **Deepgram** (STT): https://console.deepgram.com/ → Sign up → Copy API key
- **Claude**: https://console.anthropic.com/ → API Keys → Create key

### One of these for TTS:
- **OpenAI**: https://platform.openai.com/api-keys → Create key (recommended for simplicity)
- **OR ElevenLabs**: https://elevenlabs.io/ → Sign up → Copy API key (better quality)

## 2. Configure Backend

```bash
cd backend

# Copy example env
cp .env.example .env

# Edit .env and add your keys:
# CLAUDE_API_KEY=sk-ant-your-key
# DEEPGRAM_API_KEY=your-deepgram-key
# OPENAI_API_KEY=sk-your-openai-key

# Install dependencies
pip install -r requirements.txt
```

## 3. Configure Frontend

```bash
cd frontend

# Copy example env
cp env.example .env.local

# Edit .env.local - defaults should work for local dev
```

## 4. Run

**Terminal 1 - Backend:**
```bash
cd backend
uvicorn main:app --reload --port 8001
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

## 5. Test

1. Open http://localhost:3000
2. Click the **microphone button** in the chat panel
3. **Allow microphone access** when prompted
4. **Speak**: "What is a derivative?"
5. **Listen** to Claude's response!

## Troubleshooting

### "Microphone access denied"
- Check browser permissions (click lock icon in address bar)
- Use HTTPS or localhost (required for microphone)

### "Deepgram API key not configured"
- Check `backend/.env` has `DEEPGRAM_API_KEY`
- Restart backend after changing `.env`

### "No TTS provider configured"
- Add either `OPENAI_API_KEY` or `ELEVENLABS_API_KEY` to `backend/.env`
- Restart backend

### No audio plays but transcripts work
- Check browser audio isn't muted
- Check TTS API key is valid
- Open DevTools console for errors

### High latency (>2 seconds)
- Check network connection
- Try OpenAI TTS instead of ElevenLabs (faster)
- Reduce Deepgram endpointing in `backend/main.py` (line ~2172)

## Next Steps

- Read full docs: `docs/voice-assistant.md`
- Customize voice settings: Edit TTS provider config in `backend/voice/`
- Integrate into your app: See `docs/voice-assistant.md` → Usage section

## Cost

Free tier limits:
- **Deepgram**: $200 credit
- **OpenAI**: $5-10/month for moderate use
- **ElevenLabs**: 10K characters/month free
- **Claude**: Pay-as-you-go

A 10-minute conversation costs ~$0.20-0.50 total.
