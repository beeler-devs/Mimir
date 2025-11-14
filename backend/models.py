from pydantic import BaseModel
from typing import Optional, Literal, List
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

# Chat models
class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str

class AnimationSuggestion(BaseModel):
    description: str
    topic: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    branchPath: List[str]

class ChatMessageResponse(BaseModel):
    role: Literal["assistant"]
    content: str

class ChatResponse(BaseModel):
    message: ChatMessageResponse
    suggestedAnimation: Optional[AnimationSuggestion] = None
    nodeId: str


