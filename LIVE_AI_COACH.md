# Live AI Coaching System

## Overview

The **Live AI Coach** is a real-time AI tutor that continuously monitors the Excalidraw canvas and provides proactive assistance through voice, laser pointer, and direct canvas annotations. Unlike traditional tutoring systems that require explicit interaction, this AI coach operates in the background, intervening only when helpful.

---

## Core Philosophy: Proactive, Not Reactive

This system operates on a **continuous monitoring model**:

1. **Always Watching**: AI observes every canvas change in real-time
2. **Contextual Awareness**: Maintains understanding of what the student is working on
3. **Smart Intervention**: Decides when to help based on:
   - User explicitly asking for help ("help", "?", "stuck")
   - User being idle for 15+ seconds
   - Detecting struggle or confusion
4. **Multi-Modal Assistance**: Can speak, point, and write simultaneously

---

## User Experience

### How It Works

```
Student draws on canvas
         ↓
   AI observes silently
         ↓
[Intervention triggers:]
   ┌────────────────┬─────────────────┐
   │                │                 │
   │ User asks      │  User idle      │
   │ for help       │  15+ seconds    │
   └────────┬───────┴────┬────────────┘
            ↓            ↓
       AI intervenes proactively:
       - Speaks guidance
       - Points with laser
       - Writes LaTeX hints on canvas
```

### Example Session

**Scenario**: Student working on derivative problem

1. **Student draws**: `f(x) = x³`
   - AI observes, understands: "Working on derivatives"
   - No intervention yet (student is active)

2. **Student pauses for 15 seconds**
   - AI intervenes:
   - 🗣️ Voice: "I see you're working with x³. Remember the power rule?"
   - 🔴 Laser: Points to the exponent
   - ✍️ Annotation: Writes `$$\frac{d}{dx}x^n = nx^{n-1}$$` on canvas

3. **Student writes "help"**
   - AI intervenes immediately:
   - 🗣️ Voice: "Let me show you the step-by-step application"
   - ✍️ Annotation: Writes `$$f'(x) = 3x^2$$` with explanation

4. **Student continues working**
   - AI goes silent, continues observing

---

## Architecture

### Component Structure

```
┌──────────────────────────────────────────────────────┐
│ AnnotateCanvas (Main Component)                      │
├──────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────┐ │
│  │ Excalidraw Canvas                               │ │
│  │ - User draws, writes, annotates                 │ │
│  │ - onChange events trigger monitoring            │ │
│  └────────────────────────────────────────────────┘ │
│                        ↓                              │
│  ┌────────────────────────────────────────────────┐ │
│  │ LiveAICoachingSystem (Background)               │ │
│  │ - Monitors element changes                      │ │
│  │ - Detects idle periods (15s timer)              │ │
│  │ - Detects help requests                         │ │
│  │ - Calls AI API when intervention needed         │ │
│  └────────────────────────────────────────────────┘ │
│                        ↓                              │
│  ┌─────────────┬──────────────┬───────────────────┐ │
│  │             │              │                   │ │
│  │ LiveVoice   │ LaserPointer │ Canvas Annotator  │ │
│  │ Synthesis   │ Overlay      │ (injects elements)│ │
│  │             │              │                   │ │
│  └─────────────┴──────────────┴───────────────────┘ │
└──────────────────────────────────────────────────────┘
                         ↓
┌──────────────────────────────────────────────────────┐
│ AI Coach API (/api/ai-coach)                         │
│ - Receives canvas screenshot + metadata              │
│ - Calls Claude Vision API                            │
│ - Returns intervention instructions                  │
└──────────────────────────────────────────────────────┘
```

### Data Flow

```typescript
// 1. User draws on canvas
onChange(newElements) → LiveAICoachingSystem receives elements

// 2. Activity tracking
- Reset idle timer
- Update element count
- Debounce analysis (3s)

// 3. Idle detection (15s timeout)
if (userIdle || userAskedForHelp) {
  triggerIntervention()
}

// 4. Capture canvas state
screenshot = exportCanvas()
elements = getElementMetadata()

// 5. Call AI API
POST /api/ai-coach {
  screenshot,
  elements,
  context: {
    isUserIdle,
    userAskedForHelp,
    previousTopic,
    detectedConcepts
  }
}

// 6. Receive intervention
{
  type: "both",
  voiceText: "Remember the power rule...",
  laserPosition: { x: 150, y: 200, style: "circle" },
  annotation: {
    text: "$$\\frac{d}{dx}x^n = nx^{n-1}$$",
    position: { x: 200, y: 250 },
    type: "hint"
  }
}

// 7. Execute intervention
- LiveVoiceSynthesis speaks text
- LaserPointerOverlay shows position
- Canvas receives new text element (LaTeX)
```

---

## Key Components

### 1. LiveAICoachingSystem.tsx

**Purpose**: Background monitoring and intervention orchestration

**Features**:
- **Real-time monitoring**: Watches element changes via useEffect
- **Idle detection**: 15-second timer, resets on activity
- **Help detection**: Scans text elements for keywords ("help", "?", "stuck")
- **Debounced analysis**: Waits 3s after last change before analyzing
- **Intervention throttling**: Minimum 30s between AI interventions
- **Screenshot capture**: Exports canvas when intervention needed
- **API coordination**: Calls /api/ai-coach and executes response

**Configuration**:
```typescript
const IDLE_THRESHOLD_MS = 15000;           // 15 seconds
const ANALYSIS_DEBOUNCE_MS = 3000;         // 3 seconds
const MIN_INTERVENTION_INTERVAL_MS = 30000; // 30 seconds
const HELP_KEYWORDS = ['help', '?', 'stuck', 'confused', 'hint'];
```

**Location**: `frontend/components/ai/LiveAICoachingSystem.tsx`

---

### 2. LiveVoiceSynthesis.tsx

**Purpose**: Real-time text-to-speech

**Features**:
- Speaks text immediately when prop changes
- Uses Web Speech API
- Cancels previous speech when new text arrives
- Prefers high-quality voices (Google, Microsoft, Natural)
- Callback on completion

**Usage**:
```typescript
<LiveVoiceSynthesis
  text={voiceText}
  onComplete={() => setVoiceText(null)}
/>
```

**Location**: `frontend/components/ai/LiveVoiceSynthesis.tsx`

---

### 3. AI Coach API Endpoint

**Purpose**: Generate contextual interventions using Claude Vision

**Request**:
```typescript
POST /api/ai-coach
{
  screenshot: "data:image/png;base64,...",
  elements: [
    { id: "el-1", type: "text", x: 100, y: 150, text: "f(x) = x²" }
  ],
  context: {
    isUserIdle: true,
    userAskedForHelp: false,
    previousTopic: "derivatives",
    detectedConcepts: ["power rule", "calculus"]
  }
}
```

**Response**:
```typescript
{
  type: "both",
  voiceText: "Remember the power rule: bring down the exponent...",
  laserPosition: {
    x: 180,
    y: 120,
    style: "circle"
  },
  annotation: {
    text: "Power rule: $$\\frac{d}{dx}x^n = nx^{n-1}$$",
    position: { x: 200, y: 250 },
    type: "hint"
  }
}
```

**Location**: `frontend/app/api/ai-coach/route.ts`

---

### 4. Canvas Annotation Writer

**Purpose**: Inject LaTeX/markdown text elements into Excalidraw

**How it works**:
```typescript
const handleAddAnnotation = (annotation) => {
  const textElement = {
    type: 'text',
    x: annotation.x,
    y: annotation.y,
    text: annotation.text,  // Can contain LaTeX: $$...$$
    fontSize: 16,
    strokeColor: annotation.type === 'hint' ? '#10b981' : '#3b82f6',
    customData: {
      isAIGenerated: true,
      annotationType: annotation.type
    }
  };

  excalidrawAPI.updateScene({
    elements: [...currentElements, textElement]
  });
};
```

**LaTeX Support**:
- Inline math: `$$x^2$$`
- Block math: `$$$\frac{d}{dx}x^n = nx^{n-1}$$$`
- Excalidraw renders LaTeX automatically

---

### 5. LaserPointerOverlay.tsx

**Purpose**: Visual pointer synchronized with voice

**Reused from previous system** - no changes needed

**Pointer styles**:
- `point`: Small dot for precision
- `circle`: Highlight entire element
- `highlight`: Spotlight effect
- `ripple`: Emphasis for key moments

---

## LaTeX & Markdown Support

### LaTeX Rendering

Excalidraw natively supports LaTeX in text elements:

```typescript
// Inline math
text: "The derivative is $$f'(x) = 2x$$"

// Block math
text: "$$$\\int_0^1 x^2 dx = \\frac{1}{3}$$$"

// Complex formulas
text: "$$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$"
```

### Markdown Support

Basic markdown in text elements:

```typescript
text: "**Bold text**\n*Italic text*\n- List item"
```

### AI-Generated Annotations

The AI can write:
- **Hints**: Green colored, short guidance
- **Explanations**: Blue colored, detailed steps
- **Corrections**: Red colored (future), error fixes

Example AI response:
```json
{
  "annotation": {
    "text": "**Power Rule**\n\nFor $$f(x) = x^n$$:\n$$f'(x) = nx^{n-1}$$",
    "position": { "x": 200, "y": 300 },
    "type": "explanation"
  }
}
```

---

## Intervention Triggers

### 1. Explicit Help Request

**Detection**: Scans text elements for keywords

```typescript
const HELP_KEYWORDS = ['help', '?', 'stuck', 'confused', 'hint'];

// User writes text containing keyword
userWrites("I'm stuck on this step")
  → AI intervenes immediately
```

**Behavior**:
- Immediate intervention (no idle delay)
- More direct assistance
- Can provide full solutions if needed

---

### 2. Idle Detection

**Detection**: 15 seconds without canvas activity

```typescript
// Timer resets on every element change
onChange(elements) → resetIdleTimer()

// After 15s of inactivity
idleTimer.timeout() → setUserIdle(true) → triggerIntervention()
```

**Behavior**:
- Gentle encouragement
- Hints rather than solutions
- Asks guiding questions

---

### 3. Struggle Detection (Future)

Potential triggers:
- Multiple eraser actions
- Repeated similar attempts
- Long pause followed by delete
- Complex formula with errors

---

## Configuration & Customization

### Timing Parameters

```typescript
// In LiveAICoachingSystem.tsx

const IDLE_THRESHOLD_MS = 15000;
// How long before AI considers user idle

const ANALYSIS_DEBOUNCE_MS = 3000;
// Wait time after last change before analyzing

const MIN_INTERVENTION_INTERVAL_MS = 30000;
// Cooldown between interventions
```

### Help Keywords

```typescript
const HELP_KEYWORDS = ['help', '?', 'stuck', 'confused', 'hint'];
// Add more keywords to detect help requests
```

### AI Coaching Tone

Modify the API prompt in `/api/ai-coach/route.ts`:

```typescript
// For more Socratic approach
"Provide guidance through questions, don't give direct answers"

// For more direct teaching
"Provide clear, step-by-step explanations"

// For encouraging tone
"Be enthusiastic and encouraging, celebrate small wins"
```

---

## UI Elements

### AI Coach Toggle

Located top-right of canvas:

- **Green robot icon**: AI Coach ON (watching)
- **Gray robot icon**: AI Coach OFF
- **"AI Watching" badge**: Visual indicator when enabled

```typescript
<button onClick={() => setIsAICoachEnabled(!isAICoachEnabled)}>
  {isAICoachEnabled ? <Bot /> : <BotOff />}
</button>
```

### Visual Feedback

- **Laser pointer**: Appears when AI is pointing
- **Voice indicator**: Could add audio waveform (future)
- **Annotation highlight**: AI-generated text uses distinct colors

---

## Performance Considerations

### Optimization Strategies

1. **Debouncing**: 3-second delay prevents excessive API calls
2. **Throttling**: 30-second minimum between interventions
3. **Screenshot caching**: Only capture when needed
4. **Element filtering**: Ignore deleted elements

### Typical Latencies

- **Idle detection**: Instant (JS timer)
- **Help detection**: ~10ms (keyword scan)
- **Screenshot export**: ~200-500ms
- **AI API call**: ~2-5 seconds (vision analysis)
- **Voice synthesis**: ~100-300ms to start
- **Total intervention time**: ~3-6 seconds

### Resource Usage

- **API calls**: ~1-3 per minute (with active intervention)
- **Screenshot size**: ~50-200KB per capture
- **Memory**: Minimal (no history stored)

---

## Usage Examples

### Basic Usage

```typescript
// Enable/disable AI coach
const [isAICoachEnabled, setIsAICoachEnabled] = useState(true);

// Integrate into Excalidraw canvas
<AnnotateCanvas
  initialData={instanceData}
  onStateChange={handleSave}
/>

// AI coach runs automatically in background
// - Monitors canvas changes
// - Intervenes when helpful
// - Speaks, points, and annotates
```

### Custom Help Trigger

Add custom keywords:

```typescript
// In LiveAICoachingSystem.tsx
const HELP_KEYWORDS = [
  'help', '?', 'stuck', 'confused', 'hint',
  'explain', 'why', 'what', 'how'  // Add more
];
```

### Adjust Idle Threshold

```typescript
// Make AI more patient (wait longer)
const IDLE_THRESHOLD_MS = 30000; // 30 seconds

// Make AI more proactive (intervene sooner)
const IDLE_THRESHOLD_MS = 10000; // 10 seconds
```

---

## Future Enhancements

### 1. Contextual Memory

- Remember previous interventions
- Track student learning progress
- Adapt difficulty over time

### 2. Multi-Turn Conversations

- Allow student to respond to AI
- Back-and-forth dialogue
- Voice input from student

### 3. Advanced Struggle Detection

- Analyze erasure patterns
- Detect circular reasoning
- Identify misconceptions

### 4. Visual Annotations Beyond Text

- Draw arrows, circles, highlights
- Animate step-by-step solutions
- Interactive diagrams

### 5. Voice Customization

- Choose AI voice/accent
- Adjust speaking speed
- Emotional tone adaptation

### 6. Learning Analytics

- Track topics covered
- Time spent per concept
- Intervention effectiveness

---

## Troubleshooting

### AI Not Intervening

**Check**:
1. Is AI coach enabled? (green robot icon)
2. Are you drawing on canvas? (need elements)
3. Wait 15+ seconds for idle trigger
4. Try typing "help" explicitly

**Debug**:
```javascript
// Check console for logs
console.log('⏱️ Analysis debounce complete, analyzing...')
console.log('💤 User is idle')
console.log('🎯 AI intervention triggered')
```

---

### Voice Not Playing

**Check**:
1. Browser supports Web Speech API
2. Audio permissions granted
3. Volume not muted

**Test**:
```javascript
// Test in browser console
const utterance = new SpeechSynthesisUtterance('Hello');
window.speechSynthesis.speak(utterance);
```

---

### Laser Pointer Not Visible

**Check**:
1. Position coordinates are within canvas bounds
2. z-index of overlay (should be 50)
3. isActive prop is true

---

### Annotations Not Appearing

**Check**:
1. excalidrawRef.current is defined
2. Element structure is correct
3. Check console for errors

---

## Code References

| Component | Location | Purpose |
|-----------|----------|---------|
| LiveAICoachingSystem | `frontend/components/ai/LiveAICoachingSystem.tsx` | Real-time monitoring & orchestration |
| LiveVoiceSynthesis | `frontend/components/ai/LiveVoiceSynthesis.tsx` | Text-to-speech |
| AI Coach API | `frontend/app/api/ai-coach/route.ts` | Claude Vision integration |
| AnnotateCanvas | `frontend/components/tabs/AnnotateCanvas.tsx` | Main canvas with AI integration |
| LaserPointerOverlay | `frontend/components/ai/LaserPointerOverlay.tsx` | Visual pointer |

---

## Summary

The **Live AI Coach** transforms Excalidraw into an intelligent tutoring environment:

✅ **Always observing** - monitors every canvas change
✅ **Proactively helpful** - intervenes when needed, not intrusive
✅ **Multi-modal teaching** - voice + visual + written guidance
✅ **LaTeX support** - writes mathematical formulas directly
✅ **Context-aware** - understands what student is working on
✅ **Customizable** - adjust timing, tone, and behavior

This creates a **persistent AI tutor** that feels like having a knowledgeable teacher looking over your shoulder, ready to help the moment you need it.
