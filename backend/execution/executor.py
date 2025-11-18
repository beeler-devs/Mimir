"""
Main executor that routes to language-specific executors
"""

import logging
from .models import ExecuteRequest, ExecuteResponse
from .languages import execute_c, execute_cpp, execute_java, execute_rust

logger = logging.getLogger(__name__)


def execute_code(request: ExecuteRequest) -> ExecuteResponse:
    """
    Execute code based on language

    Args:
        request: ExecuteRequest with language, files, and entry point

    Returns:
        ExecuteResponse with execution results
    """
    logger.info(f"Executing {request.language} code: {request.entryPoint}")
    logger.info(f"Files: {[f.path for f in request.files]}")

    # Route to appropriate executor based on language
    if request.language == 'c':
        return execute_c(
            files=request.files,
            entry_point=request.entryPoint,
            timeout_ms=request.timeout or 30000
        )
    elif request.language == 'cpp':
        return execute_cpp(
            files=request.files,
            entry_point=request.entryPoint,
            timeout_ms=request.timeout or 30000
        )
    elif request.language == 'java':
        return execute_java(
            files=request.files,
            entry_point=request.entryPoint,
            timeout_ms=request.timeout or 30000
        )
    elif request.language == 'rust':
        return execute_rust(
            files=request.files,
            entry_point=request.entryPoint,
            timeout_ms=request.timeout or 30000
        )
    else:
        return ExecuteResponse(
            status='error',
            stdout='',
            stderr=f'Unsupported language: {request.language}',
            executionTime=0,
            compilationOutput=None
        )
