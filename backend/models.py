from pydantic import BaseModel
from typing import Optional, Literal
from enum import Enum

"""
Pydantic models for request/response validation
"""

class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    ERROR = "error"

class HealthResponse(BaseModel):
    status: str
    version: str = "0.1.0"

class JobRequest(BaseModel):
    description: str
    topic: str = "math"

class JobResponse(BaseModel):
    job_id: str
    status: JobStatus
    video_url: Optional[str] = None
    error: Optional[str] = None


