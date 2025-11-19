from __future__ import annotations

from pydantic import BaseModel
from typing import Optional, Literal, List, Union
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

class PdfAttachment(BaseModel):
    type: Literal["pdf"] = "pdf"
    id: str
    filename: str
    url: Optional[str] = None
    extractedText: Optional[str] = None
    pageCount: Optional[int] = None
    status: Literal["uploading", "ready", "error"] = "ready"

class ImageAttachment(BaseModel):
    type: Literal["image"] = "image"
    id: str
    filename: str
    url: str
    width: Optional[int] = None
    height: Optional[int] = None
    mimeType: str

class WorkspaceContextInstance(BaseModel):
    id: str
    title: str
    type: Literal["text", "code", "annotate", "pdf", "lecture"]
    folderId: Optional[str] = None
    content: Optional[str] = None  # For text instances
    code: Optional[str] = None  # For code instances
    language: Optional[str] = None  # For code instances
    fullText: Optional[str] = None  # For PDF and lecture instances

class WorkspaceContextFolder(BaseModel):
    id: str
    name: str
    parentFolderId: Optional[str] = None

class WorkspaceContext(BaseModel):
    instances: List[WorkspaceContextInstance]
    folders: List[WorkspaceContextFolder]
    annotationImages: dict[str, str] = {}  # instanceId -> base64 PNG
    pdfAttachments: Optional[List[PdfAttachment]] = None  # Backwards compatibility
    attachments: Optional[List[Union[PdfAttachment, ImageAttachment]]] = None  # New unified format
    pdfContext: Optional[str] = None  # Full text of PDF for context
    currentPageImage: Optional[str] = None  # Base64 image of current PDF page
    lectureTranscript: Optional[str] = None  # Lecture transcript when @transcript is mentioned
    lectureSlides: Optional[str] = None  # Lecture slides full text when @slides/@pdf is mentioned

class JobRequest(BaseModel):
    description: str
    topic: str = "math"
    workspace_context: Optional[WorkspaceContext] = None
    planning_context: Optional[str] = None

class JobResponse(BaseModel):
    job_id: str
    status: JobStatus
    video_url: Optional[str] = None
    error: Optional[str] = None

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    branchPath: List[str]
    workspaceContext: Optional[WorkspaceContext] = None
    learningMode: Optional[Literal["socratic", "direct", "guided", "exploratory", "conceptual"]] = None

class ChatMessageResponse(BaseModel):
    role: Literal["assistant"]
    content: str

class ChatResponse(BaseModel):
    message: ChatMessageResponse
    suggestedAnimation: Optional[AnimationSuggestion] = None
    nodeId: str


