"""
C language executor
"""

import shlex
from typing import List
from ..models import CodeFile, ExecuteResponse
from ..sandbox import execute_with_sandbox, sanitize_path, validate_filename


def execute_c(
    files: List[CodeFile],
    entry_point: str,
    timeout_ms: int = 30000
) -> ExecuteResponse:
    """
    Execute C code

    Args:
        files: List of CodeFile objects
        entry_point: Main source file (e.g., "main.c")
        timeout_ms: Execution timeout in milliseconds

    Returns:
        ExecuteResponse with execution results
    """
    # Get all .c files for compilation
    c_files = []
    for f in files:
        sanitized = sanitize_path(f.path)
        if sanitized.endswith('.c'):
            if not validate_filename(sanitized):
                return ExecuteResponse(
                    status='error',
                    stdout='',
                    stderr=f'Invalid characters in filename: {f.path}',
                    executionTime=0,
                    compilationOutput=None
                )
            c_files.append(sanitized)

    if not c_files:
        return ExecuteResponse(
            status='error',
            stdout='',
            stderr='No .c files found to compile',
            executionTime=0,
            compilationOutput=None
        )

    # Build compile command with properly escaped file paths
    quoted_files = ' '.join(shlex.quote(f) for f in c_files)
    compile_command = f"gcc -o /tmp/program {quoted_files} -lm -Wall"

    # Run command
    run_command = "/tmp/program"

    status, stdout, stderr, exec_time, compilation_output = execute_with_sandbox(
        files=[{'path': f.path, 'content': f.content} for f in files],
        compile_command=compile_command,
        run_command=run_command,
        timeout_ms=timeout_ms
    )

    return ExecuteResponse(
        status=status,
        stdout=stdout,
        stderr=stderr,
        executionTime=exec_time,
        compilationOutput=compilation_output if compilation_output else None
    )
