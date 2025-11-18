"""
C language executor
"""

from typing import List
from ..models import CodeFile, ExecuteResponse
from ..sandbox import execute_with_sandbox


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
    c_files = [f.path for f in files if f.path.endswith('.c')]

    if not c_files:
        return ExecuteResponse(
            status='error',
            stdout='',
            stderr='No .c files found to compile',
            executionTime=0,
            compilationOutput=None
        )

    # Compile command: gcc all .c files to create executable
    compile_command = f"gcc -o /tmp/program {' '.join(c_files)} -lm -Wall"

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
