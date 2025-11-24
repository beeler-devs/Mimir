"""
Pydantic models for code execution
"""

from pydantic import BaseModel
from typing import Optional, Literal, List

# Supported languages for server-side execution
SupportedLanguage = Literal['c', 'cpp', 'java', 'rust']


class CodeFile(BaseModel):
    """A single code file"""
    path: str
    content: str


class ExecuteRequest(BaseModel):
    """Request to execute code"""
    language: SupportedLanguage
    entryPoint: str
    files: List[CodeFile]
    timeout: Optional[int] = 30000  # milliseconds


class ExecuteResponse(BaseModel):
    """Response from code execution"""
    status: Literal['success', 'error', 'timeout']
    stdout: str
    stderr: str
    executionTime: float  # milliseconds
    compilationOutput: Optional[str] = None
