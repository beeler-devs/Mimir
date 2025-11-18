"""
Rust language executor
"""

from typing import List
from ..models import CodeFile, ExecuteResponse
from ..sandbox import execute_with_sandbox


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
    rs_files = [f.path for f in files if f.path.endswith('.rs')]

    if not rs_files:
        return ExecuteResponse(
            status='error',
            stdout='',
            stderr='No .rs files found to compile',
            executionTime=0,
            compilationOutput=None
        )

    # For simple single-file programs, compile the entry point directly
    # For multi-file projects, users should use Cargo (future enhancement)
    compile_command = f"rustc -o /tmp/program {entry_point}"

    # Run command
    run_command = "/tmp/program"

    status, stdout, stderr, exec_time, compilation_output = execute_with_sandbox(
        files=[f.model_dump() for f in files],
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
