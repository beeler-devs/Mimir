# Voice AI + Laser Pointer System Architecture

## Overview

This document describes the **Voice AI Tutor with Laser Pointer Synchronization** system implemented for Mimir's Excalidraw annotation workspace. The system combines Claude's vision capabilities, text-to-speech, and real-time visual guidance to create an interactive learning experience.

---

## Core Concept: Positional Encoding

**Positional encoding** in this context means embedding spatial coordinates and timing information directly into the AI's explanation. Instead of just generating text, the AI outputs:

1. **What to say** (explanation text)
2. **Where to point** (x, y coordinates on the canvas)
3. **When to point** (duration and timing for each segment)
4. **How to point** (visual style: point, circle, highlight, ripple)

This creates a synchronized **timeline** where voice narration is coupled with visual guidance.

---

## System Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Frontend Components (React)                                │
├────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ AnnotateCanvas.tsx                                    │  │
│  │  - Main container                                     │  │
│  │  - Triggers voice explanation                         │  │
│  │  - Manages state                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                        ↓                                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ LaserPointerOverlay.tsx                               │  │
│  │  - SVG/Canvas overlay layer                           │  │
│  │  - Renders red laser pointer                          │  │
│  │  - 4 pointer styles: point, circle, highlight, ripple │  │
│  │  - Smooth animations with Framer Motion               │  │
│  └──────────────────────────────────────────────────────┘  │
│                        +                                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ VoiceOrchestrator.tsx                                 │  │
│  │  - Manages TTS playback (Web Speech API)              │  │
│  │  - Syncs laser movements with speech                  │  │
│  │  - Controls timeline (play, pause, stop, skip)        │  │
│  │  - Progress tracking                                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│  API Layer: /api/voice-explain                             │
├────────────────────────────────────────────────────────────┤
│  POST endpoint that:                                        │
│  1. Receives canvas screenshot (base64 PNG)                 │
│  2. Receives element metadata (positions, types, text)      │
│  3. Calls Claude API with vision                            │
│  4. Returns structured explanation with positions           │
└────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────┐
│  Claude API (claude-sonnet-4-5)                            │
│  - Vision analysis of canvas                                │
│  - Generates explanation segments with coordinates          │
│  - Returns JSON with positional encoding                    │
└────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. User Triggers Explanation

```typescript
// User clicks the voice button
AnnotateCanvas.startVoiceExplanation()
  ↓
// Export canvas as PNG
const screenshot = await exportCanvasAsImage()
  ↓
// Prepare element metadata
const elementData = elements.map(el => ({
  id: el.id,
  type: el.type,
  x: el.x,
  y: el.y,
  text: el.text
}))
```

### 2. API Request

```typescript
POST /api/voice-explain
{
  "screenshot": "data:image/png;base64,...",
  "elements": [
    { "id": "el-1", "type": "rectangle", "x": 100, "y": 150, ... }
  ],
  "userQuestion": "Explain this derivative" // optional
}
```

### 3. Claude Vision Analysis

The API constructs a prompt that:
- Includes the canvas screenshot as vision input
- Provides element metadata for precise positioning
- Instructs Claude to generate segments with coordinates

### 4. Structured Response

```typescript
interface VoiceExplanationResponse {
  segments: [
    {
      id: "seg-1",
      text: "Let's start with this function definition...",
      position: {
        x: 150,
        y: 200,
        elementId: "el-abc123",
        offset: { x: 0, y: 0 }
      },
      duration: 5000,      // milliseconds
      pointerStyle: "circle",
      emphasis: 0.8        // 0-1 intensity
    },
    // ... more segments
  ],
  totalDuration: 25000
}
```

### 5. Synchronized Playback

```
VoiceOrchestrator receives segments
  ↓
For each segment:
  1. Update LaserPointerOverlay position
  2. Speak text using Web Speech API
  3. Wait for duration
  4. Move to next segment
```

---

## Key Components

### LaserPointerOverlay.tsx

**Purpose**: Renders visual pointer on top of Excalidraw canvas

**Features**:
- **4 pointer styles**:
  - `point`: Small red dot with pulsing ring
  - `circle`: Circular highlight around element
  - `highlight`: Spotlight effect for broad areas
  - `ripple`: Expanding waves for emphasis
- Smooth animations using Framer Motion
- Coordinate transformation (Excalidraw → viewport)
- Pointer-events: none (doesn't block canvas interaction)

**Location**: `frontend/components/ai/LaserPointerOverlay.tsx`

### VoiceOrchestrator.tsx

**Purpose**: Manages TTS and timeline synchronization

**Features**:
- Web Speech Synthesis API for TTS
- Playback controls (play, pause, stop, skip)
- Progress tracking (per-segment and total)
- Voice selection (prefers Google/Microsoft voices)
- Segment navigation
- Auto-start capability

**Location**: `frontend/components/ai/VoiceOrchestrator.tsx`

### API Endpoint: /api/voice-explain

**Purpose**: Generates explanations with positional encoding

**Input**:
- Canvas screenshot (base64 PNG)
- Element metadata (positions, types, text)
- Optional user question
- Optional focus area

**Output**:
- Array of explanation segments
- Each segment has text + position + timing

**Location**: `frontend/app/api/voice-explain/route.ts`

---

## Positional Encoding Strategy

### How It Works

1. **Vision Analysis**: Claude "sees" the canvas image
2. **Element Recognition**: Claude identifies mathematical symbols, diagrams, text
3. **Spatial Understanding**: Claude understands spatial relationships between elements
4. **Coordinate Generation**: Claude generates (x, y) coordinates for each explanation point
5. **Timeline Creation**: Claude estimates appropriate durations for each segment

### Coordinate System

```
(0, 0) ────────────────→ X
  │
  │    Canvas
  │
  │
  ↓
  Y
```

- Origin at top-left
- X increases to the right
- Y increases downward
- Coordinates match Excalidraw's coordinate system

### Element Referencing

Claude can reference elements in two ways:

1. **Absolute coordinates**: Direct (x, y) position
2. **Element-relative**: Reference element ID + offset

```typescript
// Absolute
position: { x: 250, y: 180 }

// Element-relative (points to center of element)
position: {
  x: 150,
  y: 200,
  elementId: "el-abc123",
  offset: { x: 0, y: 0 }  // Center of element
}
```

---

## User Experience Flow

### Typical Session

1. **Student draws on Excalidraw** (equations, diagrams, notes)
2. **Student clicks voice button** (top-right of canvas)
3. **System captures screenshot** + element data
4. **API calls Claude** with vision input
5. **Claude analyzes content** and generates explanation
6. **Voice controls appear** at top of canvas
7. **Playback begins automatically**:
   - Voice speaks explanation
   - Laser pointer highlights relevant areas
   - Smooth transitions between points
8. **Student can**:
   - Pause/resume
   - Skip segments
   - Stop and restart
9. **Playback completes**, controls disappear

### Example Explanation Flow

For a derivative problem:

```
Segment 1 (5s):
  Text: "Let's start with the function f(x) = x²"
  Pointer: Points to f(x) = x² (circle style)

Segment 2 (4s):
  Text: "The derivative represents the rate of change"
  Pointer: Points to f'(x) notation (point style)

Segment 3 (6s):
  Text: "Using the power rule, we bring down the exponent"
  Pointer: Highlights the exponent (highlight style)

Segment 4 (5s):
  Text: "And subtract one, giving us f'(x) = 2x"
  Pointer: Points to final answer (ripple style for emphasis)
```

---

## Technical Implementation Details

### 1. Canvas Screenshot Export

Uses Excalidraw's `exportToCanvas` utility:

```typescript
// In AnnotateCanvas.tsx
const exportCanvasAsImage = async (): Promise<string> => {
  const { exportToCanvas } = await import('@excalidraw/excalidraw');
  const canvas = await exportToCanvas({
    elements: visibleElements,
    appState,
    files,
  });
  return canvas.toDataURL('image/png');
};
```

### 2. Web Speech API

Uses browser's built-in TTS:

```typescript
// In VoiceOrchestrator.tsx
const utterance = new SpeechSynthesisUtterance(segment.text);
utterance.rate = 0.9;    // Slightly slower for clarity
utterance.pitch = 1.0;
window.speechSynthesis.speak(utterance);
```

### 3. Animation Synchronization

Timeline management:

```typescript
const playSegment = (index: number) => {
  const segment = segments[index];

  // Update pointer position
  onPositionChange({
    x: segment.position.x,
    y: segment.position.y,
    style: segment.pointerStyle
  });

  // Start speaking
  speechSynthesis.speak(utterance);

  // Move to next segment after duration
  utterance.onend = () => {
    setTimeout(() => playSegment(index + 1), 500);
  };
};
```

### 4. Coordinate Transformation

Currently uses 1:1 mapping. For production with zoom/pan:

```typescript
// Transform Excalidraw coordinates to viewport coordinates
const transformCoordinates = (excalidrawX: number, excalidrawY: number) => {
  const api = excalidrawRef.current;
  const appState = api.getAppState();

  const viewportX = (excalidrawX - appState.scrollX) * appState.zoom;
  const viewportY = (excalidrawY - appState.scrollY) * appState.zoom;

  return { x: viewportX, y: viewportY };
};
```

---

## Future Enhancements

### 1. Advanced Coordinate Handling

- Account for Excalidraw zoom levels
- Handle pan transformations
- Support multi-monitor setups

### 2. Better TTS

- Integrate ElevenLabs or Google Cloud TTS for higher quality
- Pre-generate audio for offline playback
- Support multiple voices and languages

### 3. Interactive Features

- "Ask a question" at any segment
- Click on laser pointer to pause
- Manual control of pointer position

### 4. Intelligent Segmentation

- Automatic detection of key areas
- Adaptive durations based on complexity
- Context-aware pointer styles

### 5. Recording & Playback

- Save explanations for later review
- Export as video with laser pointer overlay
- Share explanations with classmates

### 6. Multi-modal Input

- Voice questions from student
- Real-time Q&A during playback
- Adaptive explanations based on student feedback

---

## Performance Considerations

### Optimization Strategies

1. **Canvas Export**: Cache screenshots, only regenerate when content changes
2. **API Calls**: Debounce repeated requests, implement retry logic
3. **Animation**: Use CSS transforms for smooth 60fps animations
4. **Memory**: Clean up audio resources after playback

### Typical Latencies

- Canvas export: ~100-500ms (depends on complexity)
- API call to Claude: ~2-5 seconds (vision analysis)
- TTS initialization: ~100-300ms
- Total time to start: ~3-6 seconds

---

## Dependencies

### NPM Packages

```json
{
  "@anthropic-ai/sdk": "^0.36.1",
  "framer-motion": "^11.x",
  "lucide-react": "^0.x",
  "@excalidraw/excalidraw": "^0.x"
}
```

### Browser APIs

- **Web Speech API**: For text-to-speech
- **Canvas API**: For screenshot rendering
- **Fetch API**: For API calls

### Environment Variables

```bash
CLAUDE_API_KEY=your_claude_api_key
```

---

## Usage Examples

### Basic Usage

```typescript
// In your Annotate workspace
const canvasRef = useRef<AnnotateCanvasRef>(null);

// Trigger voice explanation
const handleExplain = async () => {
  await canvasRef.current?.startVoiceExplanation();
};

return (
  <AnnotateCanvas
    ref={canvasRef}
    initialData={instanceData}
    onStateChange={handleSave}
  />
);
```

### Custom Focus Area

Modify `startVoiceExplanation` to accept focus area:

```typescript
const startVoiceExplanation = async (focusArea?: {
  x: number;
  y: number;
  width: number;
  height: number;
}) => {
  const response = await fetch('/api/voice-explain', {
    method: 'POST',
    body: JSON.stringify({
      screenshot,
      elements: elementData,
      focusArea, // Highlight specific region
    }),
  });
  // ...
};
```

### Custom Question

```typescript
const askQuestion = async (question: string) => {
  const response = await fetch('/api/voice-explain', {
    method: 'POST',
    body: JSON.stringify({
      screenshot,
      elements: elementData,
      userQuestion: question, // "Explain the second step"
    }),
  });
  // ...
};
```

---

## Troubleshooting

### Common Issues

**Issue**: Laser pointer not visible
- Check z-index of LaserPointerOverlay (should be > canvas)
- Verify `isActive` prop is true
- Check browser console for errors

**Issue**: Voice not playing
- Ensure Web Speech API is supported (works in Chrome, Edge, Safari)
- Check browser audio permissions
- Verify utterance is being created

**Issue**: Coordinates off-target
- Check Excalidraw zoom/pan state
- Verify coordinate transformation logic
- Ensure element positions are current

**Issue**: API call fails
- Verify CLAUDE_API_KEY is set
- Check screenshot is valid base64
- Look at API response in network tab

---

## Code References

| Component | Location |
|-----------|----------|
| LaserPointerOverlay | `frontend/components/ai/LaserPointerOverlay.tsx` |
| VoiceOrchestrator | `frontend/components/ai/VoiceOrchestrator.tsx` |
| AnnotateCanvas (main) | `frontend/components/tabs/AnnotateCanvas.tsx` |
| API endpoint | `frontend/app/api/voice-explain/route.ts` |
| Type definitions | `frontend/lib/types.ts` |

---

## Summary

The Voice AI + Laser Pointer system transforms static Excalidraw canvases into interactive learning experiences. By combining:

1. **Vision AI** (Claude with vision)
2. **Positional encoding** (coordinates + timing)
3. **Text-to-speech** (Web Speech API)
4. **Visual guidance** (animated laser pointer)

Students receive synchronized, multi-modal explanations that guide their attention through complex material step-by-step.

This architecture is extensible and can be adapted for other visual learning contexts beyond Excalidraw, such as code editors, diagram tools, or video annotations.
