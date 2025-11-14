from pydantic import BaseModel
from typing import Optional, Literal

"""
Pydantic models for request/response validation
"""

class HealthResponse(BaseModel):
    status: str
    version: str = "0.1.0"

class RenderRequest(BaseModel):
    scene_code: str
    scene_class: str
    quality: Literal["low", "medium", "high"] = "medium"

class RenderResponse(BaseModel):
    job_id: str
    status: Literal["pending", "processing", "completed", "failed"]
    video_url: Optional[str] = None
    error: Optional[str] = None

