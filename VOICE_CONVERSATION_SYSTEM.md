# Real-Time Voice Conversation System

## Overview

A complete voice-to-voice AI coaching system with **interrupt handling**. The AI can speak and the user can speak back, creating a natural tutoring conversation. When the user interrupts the AI, the system intelligently pauses, re-evaluates context, and responds appropriately.

---

## Key Innovation: Interrupt Handling

Unlike traditional voice assistants that wait for silence before responding, this system handles **real-time interruptions**:

1. **AI is explaining** a derivative problem
2. **Student interrupts**: "Wait, what's the power rule again?"
3. **System immediately**:
   - Pauses AI speech (VAD trigger)
   - Transcribes user question
   - Analyzes semantic intent
   - Re-evaluates with full context:
     * What AI was saying
     * What user just asked
     * Conversation history
4. **AI pivots naturally**: "Good question! The power rule says..."

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  User Interface                                           │
├──────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌────────────┐                          │
│  │ Mic Button │  │ Bot Button │                          │
│  │ (Blue)     │  │ (Green)    │                          │
│  └────────────┘  └────────────┘                          │
│  [Voice Active] [AI Watching]                            │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│  Voice Input Layer                                        │
├──────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────┐  │
│  │ VoiceInputListener                                  │  │
│  │ - Continuous microphone monitoring                  │  │
│  │ - VAD (Voice Activity Detection)                    │  │
│  │ - Real-time transcription (Web Speech API)          │  │
│  │ - Silence detection (1.5s threshold)                │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│  Semantic Analysis Layer                                  │
├──────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐  ┌──────────────────────────┐  │
│  │ Keyword Matching    │  │ Semantic Similarity      │  │
│  │ (Fast: ~10ms)       │  │ (Embeddings: ~300ms)     │  │
│  │ - "help", "stuck"   │  │ - OpenAI text-embedding  │  │
│  │ - "?", "confused"   │  │ - Cosine similarity      │  │
│  └─────────────────────┘  └──────────────────────────┘  │
│                  ↓                                        │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Intent Extraction                                   │  │
│  │ - help, question, statement, affirmation            │  │
│  │ - Subject detection (derivatives, integrals, etc.)  │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│  Conversation State Manager                               │
├──────────────────────────────────────────────────────────┤
│  • Conversation history (user + AI turns)                 │
│  • Current AI utterance (what it's saying right now)      │
│  • Interrupt tracking (was interrupted? at what progress?)│
│  • Canvas context (topic, concepts, screenshot)           │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│  AI Orchestration (LiveAICoachingSystem)                  │
├──────────────────────────────────────────────────────────┤
│  IF user speaks WHILE AI is speaking:                     │
│    1. Pause AI immediately (VAD trigger)                  │
│    2. Wait for user transcription                         │
│    3. Analyze user intent                                 │
│    4. Call re-evaluation API with context                 │
│    5. AI responds (continue or pivot)                     │
│                                                            │
│  IF user speaks WHILE AI is silent:                       │
│    1. Analyze user intent                                 │
│    2. If help needed → intervene                          │
│    3. If affirmation → acknowledge                        │
│    4. If statement → log and continue observing           │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│  API: /api/ai-coach-conversational                        │
│  - Receives: screenshot, elements, conversation context   │
│  - Claude Vision analyzes with full context:              │
│    * What AI was saying when interrupted                  │
│    * What user just said                                  │
│    * Recent conversation history                          │
│  - Returns: voice text, laser position, annotation        │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│  Output Layer                                             │
├──────────────────────────────────────────────────────────┤
│  ┌────────────────┬──────────────────┬─────────────────┐ │
│  │ Voice Synthesis│ Laser Pointer    │ Canvas Annotator│ │
│  │ (TTS)          │ Overlay          │ (LaTeX/markdown)│ │
│  │ - Pause/Resume │ - 4 styles       │ - Green hints   │ │
│  │ - Progress     │ - Animations     │ - Blue explains │ │
│  └────────────────┴──────────────────┴─────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## Components

### 1. VoiceInputListener.tsx

**Purpose**: Continuous voice input with VAD

**Features**:
- Monitors microphone continuously when enabled
- Detects speech start/end using silence threshold (1.5s)
- Transcribes using Web Speech API (browser STT)
- Auto-restarts on errors (network resilience)
- Emits events: `onVoiceActivityStart`, `onVoiceActivityEnd`, `onTranscription`

**Usage**:
```typescript
<VoiceInputListener
  isEnabled={isVoiceEnabled}
  onTranscription={(text) => handleUserSpeech(text)}
  onVoiceActivityStart={() => pauseAI()}
  onVoiceActivityEnd={() => console.log('User stopped')}
/>
```

**VAD Logic**:
```typescript
// When user starts speaking
speechRecognition.onresult → setIsSpeaking(true) → onVoiceActivityStart()

// When user stops (silence detected)
setTimeout(1500ms) → setIsSpeaking(false) → onVoiceActivityEnd()
```

---

### 2. SemanticAnalyzer (semanticAnalyzer.ts)

**Purpose**: Lightweight help detection without calling Claude

**Two-tier approach**:

**Tier 1: Keyword Matching (~10ms)**
```typescript
const HELP_KEYWORDS = ['help', 'stuck', '?', 'confused', 'hint'];
const QUESTION_PATTERNS = [/^what/i, /^how/i, /^why/i, /\?$/];
const STRUGGLE_PHRASES = ['i can\'t', 'wrong', 'mistake', 'error'];
```

**Tier 2: Semantic Similarity (~300ms)**
```typescript
// Only if keyword confidence < 0.8
// Uses OpenAI text-embedding-3-small
// Compares to known help request examples
// Cosine similarity threshold: 0.75
```

**Output**:
```typescript
{
  needsHelp: true,
  confidence: 0.95,
  reason: 'keyword',  // or 'semantic'
  matchedKeywords: ['help', 'stuck']
}
```

**Intent Extraction**:
```typescript
extractIntent("What's the power rule?")
→ { intent: 'question', subject: 'power rule' }

extractIntent("I'm stuck on this integral")
→ { intent: 'help', subject: 'integral' }

extractIntent("Got it, thanks!")
→ { intent: 'affirmation' }
```

---

### 3. ConversationStateManager (conversationState.ts)

**Purpose**: Track conversation state for re-evaluation

**State Structure**:
```typescript
interface ConversationState {
  history: ConversationTurn[];  // All user + AI turns
  currentAIUtterance: {
    text: string;                // What AI is saying
    startedAt: number;
    wasInterrupted: boolean;
    progressWhenInterrupted?: number;  // 0-1
  } | null;
  canvasContext: {
    lastSnapshot?: string;        // Base64 screenshot
    currentTopic?: string;
    detectedConcepts: string[];
  };
  lastInterventionTime: number;
}
```

**Key Methods**:
```typescript
// Add user speech
conversationManager.addUserSpeech("What's the power rule?", isInterruption: true);

// Start AI utterance
conversationManager.startAIUtterance("The power rule says...");

// Mark as interrupted
conversationManager.markAIUtteranceInterrupted(progress: 0.5);

// Get summary for API
conversationManager.getSummaryForAPI();
→ {
    recentHistory: [...last 5 turns],
    currentAIUtterance: "As I was explaining...",
    wasInterrupted: true,
    canvasContext: { topic: "derivatives", ... }
  }
```

---

### 4. EnhancedLiveVoiceSynthesis.tsx

**Purpose**: TTS with pause/resume/cancel controls

**Exposes Controller Interface**:
```typescript
interface VoiceSynthesisController {
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  isPaused: () => boolean;
  isSpeaking: () => boolean;
  getProgress: () => number;  // 0-1 estimate
}
```

**Usage**:
```typescript
const voiceSynthesisRef = useRef<VoiceSynthesisController>(null);

// When user interrupts
if (voiceSynthesisRef.current?.isSpeaking()) {
  voiceSynthesisRef.current.pause();
  const progress = voiceSynthesisRef.current.getProgress(); // 0.5 (50% done)
}

// Resume later if needed
voiceSynthesisRef.current.resume();
```

**Progress Tracking**:
```typescript
// Estimates based on word count
const words = text.split(/\s+/).length;
const estimatedDuration = (words / 150) * 60 * 1000;  // 150 WPM

// Tracks elapsed time
const progress = elapsed / estimatedDuration;
```

---

### 5. LiveAICoachingSystem.tsx (Rebuilt)

**Purpose**: Main orchestration component

**Handles Three Intervention Types**:

**1. Idle Intervention** (canvas activity)
```typescript
// User hasn't drawn for 15+ seconds
idleTimer.timeout() → callAIForIntervention({ trigger: 'idle' })
```

**2. Help Request** (user voice)
```typescript
// User says "I'm stuck"
onTranscription(text) → detectHelpRequest(text)
→ { needsHelp: true, confidence: 0.95 }
→ callAIForIntervention({ trigger: 'help_request', userSpeech: text })
```

**3. Interrupt** (user speaks during AI)
```typescript
// AI is speaking, user says "Wait, what?"
onVoiceActivityStart() → if (isAISpeaking) voiceSynthesis.pause()
onTranscription(text) →
  conversationManager.markAIUtteranceInterrupted(progress: 0.5)
  → callAIForIntervention({
      trigger: 'interrupt',
      userSpeech: text
    })
```

**Flow Diagram**:
```
User speaks
    ↓
Is AI speaking?
    ├─ YES → Pause AI → Mark interrupted → Re-evaluate
    └─ NO  → Analyze intent → Help? → Intervene
```

---

### 6. API: /api/ai-coach-conversational

**Purpose**: Context-aware re-evaluation

**Request**:
```typescript
{
  screenshot: "data:image/png;base64,...",
  elements: [...],
  conversationContext: {
    recentHistory: [
      { speaker: 'user', text: "I'm working on derivatives" },
      { speaker: 'ai', text: "Great! Let's start with..." }
    ],
    currentAIUtterance: "As I was explaining, the power rule...",
    wasInterrupted: true,
    trigger: 'interrupt',
    userSpeech: "Wait, what's the power rule again?",
    canvasContext: {
      currentTopic: "derivatives",
      detectedConcepts: ["power rule", "calculus"]
    }
  }
}
```

**Prompt Construction**:
```typescript
// For interrupts
`**INTERRUPTION SCENARIO**

You were saying: "${currentAIUtterance}"
Student just interrupted: "${userSpeech}"

Decide how to respond:
- If related to what you were explaining → acknowledge and continue/adjust
- If new topic → smoothly pivot
- If affirming → acknowledge and wrap up
- Be natural and conversational`

// For help requests
`**HELP REQUEST**
Student asked: "${userSpeech}"
Provide targeted assistance.`

// For idle
`**PROACTIVE GUIDANCE**
Student idle for 15+ seconds.
Offer gentle encouragement.`
```

**Claude's Job**:
1. Analyze canvas visually
2. Read conversation history
3. Understand what it was saying vs. what user asked
4. Decide: continue, pivot, or acknowledge
5. Return natural response with coordinates

**Response**:
```typescript
{
  type: 'both',
  voiceText: "Good question! The power rule says: bring down the exponent...",
  laserPosition: { x: 180, y: 120, style: 'circle' },
  annotation: {
    text: "$$\\frac{d}{dx}x^n = nx^{n-1}$$",
    position: { x: 200, y: 250 },
    type: 'hint'
  }
}
```

---

## User Experience Examples

### Example 1: Interrupt During Explanation

```
Scenario: AI is explaining derivatives

AI: "To find the derivative, you need to apply the power rule.
     This means you take the exponent..."

Student (interrupts): "Wait, what's the power rule again?"

System:
  ✓ Pauses AI speech immediately (VAD)
  ✓ Transcribes: "Wait, what's the power rule again?"
  ✓ Semantic analysis: Help request detected (0.95)
  ✓ Calls API with:
    - currentAIUtterance: "This means you take the exponent..."
    - userSpeech: "Wait, what's the power rule again?"
    - wasInterrupted: true
    - progress: 0.5 (halfway through)

AI (responds naturally):
  🗣️ "Good question! The power rule says: for x^n, you bring down
      the exponent as a coefficient, then subtract one from the
      exponent."
  🔴 [Points laser to formula]
  ✍️ [Writes on canvas]: $$\frac{d}{dx}x^n = nx^{n-1}$$
```

---

### Example 2: Help Request While Idle

```
Scenario: Student stuck, asks for help

Student: "I'm confused about this integral"

System:
  ✓ Transcribes: "I'm confused about this integral"
  ✓ Semantic analysis: Help + struggle keywords (0.90)
  ✓ Calls API with trigger: 'help_request'

AI (responds directly):
  🗣️ "Let's look at this together. I see you have x^2 + 1 in the
      denominator. Does a u-substitution come to mind?"
  🔴 [Points laser to "x^2 + 1"]
  ✍️ [Writes hint]: "Try: $$u = x^2 + 1$$"
```

---

### Example 3: Affirmation (User Understands)

```
Scenario: AI finishes explaining, student acknowledges

AI: "...and that's how you apply the chain rule. Does that make sense?"

Student: "Got it, thanks!"

System:
  ✓ Transcribes: "Got it, thanks!"
  ✓ Intent extraction: affirmation detected
  ✓ No API call needed
  ✓ Marks utterance as complete
  ✓ If AI was paused, resumes normal operation
```

---

## Configuration

### Voice Input (VoiceInputListener.tsx)
```typescript
const SILENCE_THRESHOLD_MS = 1500;  // 1.5s silence = speech end
```

### Semantic Analysis (semanticAnalyzer.ts)
```typescript
// Keyword-based confidence thresholds
HIGH_CONFIDENCE = 0.8   // Accept immediately
MEDIUM_CONFIDENCE = 0.6 // Still accept, no semantic check needed

// Semantic similarity threshold
HELP_THRESHOLD = 0.75   // Embeddings cosine similarity
```

### AI Coaching (LiveAICoachingSystem.tsx)
```typescript
const IDLE_THRESHOLD_MS = 15000;            // 15s before idle intervention
const ANALYSIS_DEBOUNCE_MS = 3000;          // 3s after last canvas change
const MIN_INTERVENTION_INTERVAL_MS = 30000; // 30s cooldown
```

---

## Performance & Optimization

### Latency Breakdown

| Step | Time | Optimization |
|------|------|--------------|
| VAD triggers | <100ms | Instant (local) |
| Transcription | Real-time | Streaming (Web Speech API) |
| Keyword matching | ~10ms | Fast path for obvious cases |
| Semantic embeddings | ~300ms | Only if ambiguous |
| Screenshot export | ~200ms | Cached when possible |
| Claude Vision API | ~2-5s | Batched with conversation context |
| TTS start | ~100ms | Pre-warmed voices |
| **Total** | **~3-6s** | For full intervention cycle |

### Optimization Strategies

1. **Fast Path for Keywords**
   - 95% of help requests caught by keywords (~10ms)
   - Only use embeddings for nuanced cases

2. **VAD Auto-Pause**
   - Pauses AI immediately when user speaks
   - No waiting for transcription

3. **Conversation State Cached**
   - In-memory state manager
   - No database calls during conversation

4. **Progressive Enhancement**
   - Works with basic STT (Web Speech API)
   - Can upgrade to Deepgram/AssemblyAI for better accuracy

5. **Debouncing**
   - 3s wait after canvas changes before analysis
   - Prevents excessive API calls

---

## Dependencies

### Browser APIs
- **Web Speech API**: Speech-to-text (STT)
  - `SpeechRecognition` / `webkitSpeechRecognition`
  - Continuous mode, interim results
- **Speech Synthesis API**: Text-to-speech (TTS)
  - `SpeechSynthesis`, `SpeechSynthesisUtterance`
  - Pause/resume support

### External APIs
- **OpenAI API**: Embeddings for semantic analysis
  - Model: `text-embedding-3-small` (fast & cheap)
  - ~$0.00002 per 1K tokens
- **Claude API**: Conversational coaching
  - Model: `claude-sonnet-4-5-20250929`
  - Vision + text understanding

### NPM Packages
- **Framer Motion**: Laser pointer animations (existing)
- **Lucide React**: Icons (Mic, Bot) (existing)

---

## Environment Variables

```bash
# Required
CLAUDE_API_KEY=sk-ant-...          # Anthropic Claude API
OPENAI_API_KEY=sk-...               # OpenAI for embeddings

# Optional
DEEPGRAM_API_KEY=...                # Upgrade STT (future)
```

---

## Browser Compatibility

### Web Speech API Support
- ✅ Chrome/Edge (best support)
- ✅ Safari (good support)
- ❌ Firefox (limited/experimental)

### Fallback Strategy
```typescript
if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
  // Show upgrade notice
  console.warn('Voice input not supported - upgrade to Chrome/Safari');
  // Could integrate Deepgram/AssemblyAI as fallback
}
```

---

## Files Overview

| File | Purpose | LOC |
|------|---------|-----|
| `VoiceInputListener.tsx` | Voice input with VAD | ~200 |
| `EnhancedLiveVoiceSynthesis.tsx` | TTS with pause/resume | ~200 |
| `semanticAnalyzer.ts` | Help detection logic | ~250 |
| `/api/semantic-help/route.ts` | Embeddings API | ~100 |
| `conversationState.ts` | Conversation tracking | ~250 |
| `LiveAICoachingSystem.tsx` | Main orchestration | ~350 |
| `/api/ai-coach-conversational/route.ts` | Re-evaluation API | ~200 |
| `AnnotateCanvas.tsx` | Integration layer | ~100 (changes) |

**Total**: ~1650 LOC

---

## Future Enhancements

### 1. Advanced VAD
- Use `@ricky0123/vad-web` for ML-based VAD
- Better noise filtering
- Faster interrupt detection

### 2. Better STT
- Integrate Deepgram/AssemblyAI
- Real-time streaming transcription
- Better accuracy for technical terms

### 3. Contextual Interrupts
- Detect "urgent" vs "clarifying" interrupts
- Prioritize urgent questions
- Defer clarifications to natural pauses

### 4. Multi-Turn Dialogues
- Handle back-and-forth conversations
- "What do you mean by that?"
- AI asks clarifying questions

### 5. Emotion Detection
- Analyze tone of voice
- Detect frustration → offer more help
- Detect confidence → reduce assistance

### 6. Collaboration Features
- Multiple students in session
- AI moderates discussion
- Peer learning

---

## Troubleshooting

### Issue: Voice input not working

**Check**:
1. Browser supports Web Speech API (Chrome/Edge/Safari)
2. Microphone permissions granted
3. HTTPS enabled (required for mic access)
4. Check browser console for errors

**Test**:
```javascript
// In browser console
const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
recognition.start();
// Speak into mic - should see console logs
```

---

### Issue: AI doesn't pause when interrupted

**Check**:
1. `voiceSynthesisRef` properly initialized
2. `onVoiceActivityStart` callback firing
3. `isSpeaking()` returns true
4. Check console: "⏸️ Auto-pausing AI speech"

**Debug**:
```typescript
// Add logging in LiveAICoachingSystem
console.log('Voice activity start, AI speaking?', voiceSynthesisRef.current?.isSpeaking());
```

---

### Issue: Help not detected

**Check**:
1. Transcription working (check console logs)
2. Keywords present in `HELP_KEYWORDS`
3. Semantic API responding (check network tab)

**Test**:
```typescript
// Test semantic analyzer directly
import { detectHelpRequest } from './semanticAnalyzer';

const result = await detectHelpRequest("I'm stuck on this problem");
console.log(result);
// Should show: { needsHelp: true, confidence: 0.95, ... }
```

---

## Summary

This **Real-Time Voice Conversation System** creates a natural tutoring experience where:

✅ **User can speak** anytime (continuous voice input)
✅ **AI listens intelligently** (semantic analysis, not just keywords)
✅ **Interrupts handled gracefully** (AI pauses, re-evaluates, responds naturally)
✅ **Context-aware** (remembers conversation, understands what it was saying)
✅ **Multi-modal output** (voice + laser + LaTeX annotations)

The key innovation is **interrupt handling** - when the user speaks during an AI explanation, the system doesn't just stop; it:
1. Pauses immediately (VAD)
2. Understands what user wants
3. Re-evaluates with full context
4. Decides whether to continue or pivot
5. Responds naturally

This creates a **conversation**, not just a Q&A bot.
