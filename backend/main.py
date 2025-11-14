from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import HealthResponse, JobRequest, JobResponse
from manim_worker.manim_service import manim_service
import logging

"""
FastAPI server for Manim rendering worker
Job-based animation rendering with Supabase Storage integration
"""

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Mimir Manim Worker",
    description="Job-based animation rendering service using Manim",
    version="0.2.0"
)

# CORS middleware to allow requests from frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],  # Frontend URLs
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
    return HealthResponse(status="ok", version="0.2.0")

@app.post("/jobs", response_model=JobResponse)
async def create_job(request: JobRequest):
    """
    Create a new animation rendering job
    
    Args:
        request: Job request with description and topic
    
    Returns:
        JobResponse with job_id and initial status
    
    Example:
        POST /jobs
        {
            "description": "Visualize Brownian motion",
            "topic": "math"
        }
    """
    try:
        job_id = manim_service.create_job(
            description=request.description,
            topic=request.topic
        )
        
        return JobResponse(
            job_id=job_id,
            status="pending",
            video_url=None,
            error=None
        )
        
    except Exception as e:
        logger.error(f"Error creating job: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job_status(job_id: str):
    """
    Get the status of a rendering job
    
    Args:
        job_id: Job identifier
    
    Returns:
        JobResponse with current status, video URL (if done), or error
    
    Example:
        GET /jobs/123e4567-e89b-12d3-a456-426614174000
        
        Response:
        {
            "job_id": "123e4567-e89b-12d3-a456-426614174000",
            "status": "done",
            "video_url": "https://...",
            "error": null
        }
    """
    job_status = manim_service.get_job_status(job_id)
    
    if job_status.get("status") == "not_found":
        raise HTTPException(status_code=404, detail="Job not found")
    
    return JobResponse(
        job_id=job_id,
        status=job_status["status"],
        video_url=job_status.get("video_url"),
        error=job_status.get("error"),
    )

if __name__ == "__main__":
    import uvicorn
    import os
    
    # Get port from environment or default to 8001
    port = int(os.getenv("PORT", 8001))
    
    logger.info(f"Starting Manim Worker on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)

