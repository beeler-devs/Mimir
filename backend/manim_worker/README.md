# Manim Worker Module

This module contains the Manim animation rendering logic and scene definitions.

## Structure

```
backend/manim_worker/
  ├── __init__.py          # Package initialization
  ├── manim_service.py     # Rendering service with job queue
  ├── scenes.py            # Manim scene definitions
  └── README.md            # This file
```

## Components

### `manim_service.py`
- `ManimService` class that manages animation rendering jobs
- Thread pool for concurrent rendering
- Supabase Storage integration for video uploads
- Job queue and status tracking

### `scenes.py`
- Manim scene class definitions (BrownianMotion, RandomWalk, etc.)
- `select_scene()` function for dynamic scene selection based on description/topic

## Usage

This module is imported by `backend/main.py`. To run the server:

### Option 1: Direct Python execution
```bash
cd backend
python main.py
```

### Option 2: Uvicorn CLI (Recommended for WebSocket reliability)
```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8001 --log-level info
```

**Note**: The uvicorn CLI method is more reliable for WebSocket connections as it automatically handles WebSocket protocol upgrades correctly. Use this method if you experience WebSocket connection issues.

For development with auto-reload:
```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8001 --reload --log-level info
```

## Configuration

Environment variables are loaded from `backend/.env`:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key for storage access
- `SUPABASE_BUCKET_NAME` - Storage bucket name (default: "animations")
- `PORT` - Server port (default: 8001)

## Adding New Scenes

To add new animation types, edit `scenes.py`:

1. Create a new Manim scene class:
```python
class MyNewScene(Scene):
    def construct(self):
        # Your animation code
        pass
```

2. Update `select_scene()` to recognize keywords for your scene:
```python
if 'keyword' in desc_lower:
    return MyNewScene
```

## Dependencies

All dependencies are managed in `backend/requirements.txt`. The main dependencies are:
- `manim` - Animation library
- `fastapi` - Web framework
- `supabase` - Storage integration
- `python-dotenv` - Environment variable loading

