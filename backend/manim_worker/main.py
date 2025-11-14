from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import HealthResponse, RenderRequest, RenderResponse
from manim_service import manim_service

"""
FastAPI server for Manim rendering worker
Handles requests to render mathematical animations
"""

app = FastAPI(
    title="Mimir Manim Worker",
    description="Render service for mathematical animations using Manim",
    version="0.1.0"
)

# CORS middleware to allow requests from frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint
    Returns the service status
    """
    return HealthResponse(status="ok", version="0.1.0")

@app.post("/render", response_model=RenderResponse)
async def render_scene(request: RenderRequest):
    """
    Render a Manim scene to video
    
    Args:
        request: Render request containing scene code and configuration
    
    Returns:
        RenderResponse with job ID and status
    """
    try:
        job_id = manim_service.render_scene(
            scene_code=request.scene_code,
            scene_class=request.scene_class,
            quality=request.quality
        )
        
        # Get job status
        job_status = manim_service.get_job_status(job_id)
        
        return RenderResponse(
            job_id=job_id,
            status=job_status["status"],
            video_url=job_status.get("video_url"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/render/{job_id}", response_model=RenderResponse)
async def get_render_status(job_id: str):
    """
    Get the status of a render job
    
    Args:
        job_id: Job identifier
    
    Returns:
        RenderResponse with current job status
    """
    job_status = manim_service.get_job_status(job_id)
    
    if job_status.get("status") == "not_found":
        raise HTTPException(status_code=404, detail="Job not found")
    
    return RenderResponse(
        job_id=job_id,
        status=job_status["status"],
        video_url=job_status.get("video_url"),
        error=job_status.get("error"),
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)

