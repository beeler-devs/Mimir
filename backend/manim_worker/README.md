# Mimir Manim Worker

FastAPI service for rendering mathematical animations using Manim.

## Setup

1. **Create a virtual environment:**
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. **Install dependencies:**
```bash
pip install -r requirements.txt
```

3. **Run the server:**
```bash
python main.py
```

Or with uvicorn directly:
```bash
uvicorn main:app --reload --port 8001
```

The server will start at `http://localhost:8001`

## API Endpoints

### Health Check
```
GET /health
```
Returns the service status.

### Render Scene
```
POST /render
```
Request body:
```json
{
  "scene_code": "Python code containing Manim scene",
  "scene_class": "Name of the scene class",
  "quality": "low" | "medium" | "high"
}
```

Returns:
```json
{
  "job_id": "uuid",
  "status": "pending" | "processing" | "completed" | "failed",
  "video_url": "URL to rendered video (if completed)"
}
```

### Get Render Status
```
GET /render/{job_id}
```
Returns the current status of a render job.

## Future Enhancements

- [ ] Implement actual Manim rendering (currently stubbed)
- [ ] Add video storage integration (Supabase Storage)
- [ ] Add job queue for multiple simultaneous renders
- [ ] Add authentication/authorization
- [ ] Add rate limiting
- [ ] Add caching for common scenes

