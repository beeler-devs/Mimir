"""
Rust language executor
"""

import shlex
from typing import List
from ..models import CodeFile, ExecuteResponse
from ..sandbox import execute_with_sandbox, sanitize_path, validate_filename


def execute_rust(
    files: List[CodeFile],
    entry_point: str,
    timeout_ms: int = 30000
) -> ExecuteResponse:
    """
    Execute Rust code

    Args:
        files: List of CodeFile objects
        entry_point: Main source file (e.g., "main.rs")
        timeout_ms: Execution timeout in milliseconds

    Returns:
        ExecuteResponse with execution results
    """
    # Get all .rs files
    rs_files = []
    for f in files:
        sanitized = sanitize_path(f.path)
        if sanitized.endswith('.rs'):
            if not validate_filename(sanitized):
                return ExecuteResponse(
                    status='error',
                    stdout='',
                    stderr=f'Invalid characters in filename: {f.path}',
                    executionTime=0,
                    compilationOutput=None
                )
            rs_files.append(sanitized)

    if not rs_files:
        return ExecuteResponse(
            status='error',
            stdout='',
            stderr='No .rs files found to compile',
            executionTime=0,
            compilationOutput=None
        )

    # Sanitize and validate entry point
    sanitized_entry = sanitize_path(entry_point)
    if not sanitized_entry or not validate_filename(sanitized_entry):
        return ExecuteResponse(
            status='error',
            stdout='',
            stderr=f'Invalid entry point: {entry_point}',
            executionTime=0,
            compilationOutput=None
        )

    # For simple single-file programs, compile the entry point directly
    # For multi-file projects, users should use Cargo (future enhancement)
    compile_command = f"rustc -o /tmp/program {shlex.quote(sanitized_entry)}"

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
