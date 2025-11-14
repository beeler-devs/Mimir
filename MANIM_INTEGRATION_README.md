# Manim Integration - Implementation Guide

## Overview

The Manim integration allows Mimir to generate mathematical animations on-demand through a job-based polling system. When users or AI request visualizations, the system:

1. Creates an animation job
2. Renders the animation using Manim
3. Uploads the MP4 to Supabase Storage
4. Returns a public URL for viewing

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────────┐      ┌──────────────┐
│   Frontend  │─────▶│  Next.js API │─────▶│  Manim Worker   │─────▶│   Supabase   │
│   (Chat UI) │      │   (/api/)    │      │  (FastAPI)      │      │   Storage    │
│             │◀─────│              │◀─────│                 │      │              │
│   Polling   │      │    Proxy     │      │  Job Queue      │      │              │
└─────────────┘      └──────────────┘      └─────────────────┘      └──────────────┘
```

### Components

1. **Backend Python Worker** (`backend/manim_worker/`)
   - FastAPI server with job endpoints
   - Manim scene templates (Brownian motion, random walk, etc.)
   - Supabase Storage integration
   - Thread-based rendering

2. **Frontend API Routes** (`frontend/app/api/manim/`)
   - Proxy to Python worker
   - Handles CORS and error handling

3. **Supabase Function** (`supabase/functions/chat/`)
   - Detects animation keywords in user messages
   - Returns `suggestedAnimation` in response

4. **Frontend UI** (`frontend/components/ai/AnimationPanel.tsx`)
   - "Generate Animation" button
   - Job status polling (every 2s)
   - Video player for completed animations

## Setup Instructions

### 1. Backend Setup

```bash
cd backend/manim_worker

# Install dependencies
pip install -r requirements.txt

# Copy environment template
cp .env.example .env

# Edit .env with your Supabase credentials
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
# SUPABASE_BUCKET_NAME=animations

# Start the worker
python main.py
```

The worker will start on port 8001.

### 2. Supabase Storage Setup

In your Supabase project:

1. Go to **Storage** → **Create a new bucket**
2. Name it `animations`
3. Set to **Public** bucket
4. No file size limit needed (videos are typically 1-5 MB)

### 3. Frontend Setup

```bash
cd frontend

# Copy environment template
cp .env.local.example .env.local

# Edit .env.local
# NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
# MANIM_WORKER_URL=http://localhost:8001

# Install dependencies (if not already)
npm install

# Start dev server
npm run dev
```

### 4. Deploy Supabase Functions (Optional)

```bash
cd supabase

# Deploy the enhanced chat function
supabase functions deploy chat
```

## Usage

### Triggering Animations

Users can trigger animations by using keywords in their chat messages:

- **"visualize Brownian motion"** → Brownian motion animation
- **"show me a random walk"** → 1D random walk animation
- **"animate a matrix transformation"** → Linear transformation
- **"illustrate [any concept]"** → Generic text animation

### Flow

1. User types: "Can you visualize Brownian motion?"
2. Chat function responds with `suggestedAnimation`:
   ```json
   {
     "description": "Visualize Brownian motion",
     "topic": "math"
   }
   ```
3. Frontend shows AnimationPanel with "Generate Animation" button
4. User clicks button → POST `/api/manim/jobs`
5. Frontend polls GET `/api/manim/jobs/{id}` every 2 seconds
6. Status updates: pending → running → done
7. Video appears automatically when ready

## API Endpoints

### Backend (Python Worker)

#### `GET /health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "version": "0.2.0"
}
```

#### `POST /jobs`
Create a new animation job.

**Request:**
```json
{
  "description": "Visualize Brownian motion",
  "topic": "math"
}
```

**Response:**
```json
{
  "job_id": "123e4567-e89b-12d3-a456-426614174000",
  "status": "pending",
  "video_url": null,
  "error": null
}
```

#### `GET /jobs/{job_id}`
Poll job status.

**Response:**
```json
{
  "job_id": "123e4567-e89b-12d3-a456-426614174000",
  "status": "done",
  "video_url": "https://...supabase.co/storage/.../out.mp4",
  "error": null
}
```

**Status values:** `pending`, `running`, `done`, `error`

### Frontend (Next.js API)

#### `POST /api/manim/jobs`
Proxies to worker's POST /jobs

#### `GET /api/manim/jobs/[id]`
Proxies to worker's GET /jobs/{id}

## Available Scene Templates

### 1. Brownian Motion (`BrownianMotionScene`)
**Triggers:** "brownian", "brownian motion"
- 2D random walk visualization
- Particle with traced path
- 100 steps with smooth animation

### 2. Random Walk (`RandomWalkScene`)
**Triggers:** "random walk", "1d walk"
- 1D random walk on number line
- 20 steps with visual markers

### 3. Matrix Transformation (`MatrixTransformScene`)
**Triggers:** "matrix", "transform", "linear transformation"
- Grid transformation visualization
- Shows vector transformation
- Displays transformation matrix

### 4. Text Animation (`TextAnimationScene`)
**Default fallback**
- Generic animation for any description
- Shows title and description text
- Simple shape transformations

## Adding New Scenes

To add a new scene template:

1. Add scene class to `backend/manim_worker/scenes.py`:

```python
class MyNewScene(Scene):
    def construct(self):
        # Your Manim animation code
        title = Text("My Animation")
        self.play(Write(title))
        # ... more animation
```

2. Update `select_scene()` function:

```python
def select_scene(description: str, topic: str):
    desc_lower = description.lower()
    
    if "my keyword" in desc_lower:
        return MyNewScene
    # ... existing conditions
```

3. Test locally:

```bash
curl -X POST http://localhost:8001/jobs \
  -H "Content-Type: application/json" \
  -d '{"description": "my keyword animation", "topic": "math"}'
```

## Troubleshooting

### Worker won't start

**Error:** `ModuleNotFoundError: No module named 'manim'`
```bash
pip install -r requirements.txt
```

**Error:** Supabase connection failed
- Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`
- Verify service role key (not anon key)

### Animations fail to render

**Check logs:**
```bash
cd backend/manim_worker
python main.py
# Watch for errors in terminal
```

**Common issues:**
- Missing system dependencies for Manim (ffmpeg, LaTeX)
- Scene syntax errors
- Timeout (increase if needed)

### Videos don't upload to Supabase

**Check storage bucket:**
- Bucket must exist
- Bucket must be public
- Service role key must have storage permissions

**Fallback:** If Supabase is not configured, videos save to `/tmp/manim_jobs/{job_id}/`

### Frontend can't reach worker

**Check:**
```bash
curl http://localhost:8001/health
```

Should return: `{"status":"ok","version":"0.2.0"}`

**Fix:**
- Ensure worker is running
- Check `MANIM_WORKER_URL` in frontend `.env.local`
- Check CORS settings in worker `main.py`

## Performance Notes

- **Render time:** 30-60 seconds per animation
- **Video size:** 1-5 MB typically
- **Concurrent jobs:** Max 2 (configurable in `ManimService`)
- **Polling frequency:** Every 2 seconds
- **Timeout:** 5 minutes (can be extended)

## Production Considerations

### Scaling

- Deploy worker as separate service (Docker recommended)
- Use Redis for job queue (instead of in-memory dict)
- Add job expiration/cleanup
- Rate limit job creation per user

### Security

- Add authentication to worker endpoints
- Validate scene descriptions (prevent code injection)
- Limit video file sizes
- Add CORS whitelist for production domains

### Monitoring

- Log all job creation and completion
- Track render times and failure rates
- Monitor Supabase Storage usage
- Alert on worker crashes

## Future Enhancements

- [ ] LLM-generated Manim code (from description)
- [ ] Animation preview/thumbnail
- [ ] Download button for videos
- [ ] Animation history/library
- [ ] Custom quality settings in UI
- [ ] Audio narration
- [ ] Batch rendering
- [ ] Real-time progress updates (WebSocket)

## Credits

- **Manim** - Mathematical animation engine by 3Blue1Brown
- **FastAPI** - Modern Python web framework
- **Supabase** - Backend-as-a-Service platform


