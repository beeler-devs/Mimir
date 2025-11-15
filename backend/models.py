from __future__ import annotations

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
    workspace_context: Optional[WorkspaceContext] = None

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

class Mention(BaseModel):
    type: Literal["instance", "folder"]
    id: str
    name: str

class WorkspaceContextInstance(BaseModel):
    id: str
    title: str
    type: Literal["text", "code", "annotate"]
    folderId: Optional[str] = None
    content: Optional[str] = None  # For text instances
    code: Optional[str] = None  # For code instances
    language: Optional[str] = None  # For code instances

class WorkspaceContextFolder(BaseModel):
    id: str
    name: str
    parentFolderId: Optional[str] = None

class WorkspaceContext(BaseModel):
    instances: List[WorkspaceContextInstance]
    folders: List[WorkspaceContextFolder]
    annotationImages: dict[str, str] = {}  # instanceId -> base64 PNG

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    branchPath: List[str]
    workspaceContext: Optional[WorkspaceContext] = None

class ChatMessageResponse(BaseModel):
    role: Literal["assistant"]
    content: str

class ChatResponse(BaseModel):
    message: ChatMessageResponse
    suggestedAnimation: Optional[AnimationSuggestion] = None
    nodeId: str


