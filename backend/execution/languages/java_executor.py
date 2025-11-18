"""
Java language executor
"""

import os
from typing import List
from ..models import CodeFile, ExecuteResponse
from ..sandbox import execute_with_sandbox


def execute_java(
    files: List[CodeFile],
    entry_point: str,
    timeout_ms: int = 30000
) -> ExecuteResponse:
    """
    Execute Java code

    Args:
        files: List of CodeFile objects
        entry_point: Main source file (e.g., "Main.java")
        timeout_ms: Execution timeout in milliseconds

    Returns:
        ExecuteResponse with execution results
    """
    # Get all .java files for compilation
    java_files = [f.path for f in files if f.path.endswith('.java')]

    if not java_files:
        return ExecuteResponse(
            status='error',
            stdout='',
            stderr='No .java files found to compile',
            executionTime=0,
            compilationOutput=None
        )

    # Determine the main class from entry point
    # e.g., "Main.java" -> "Main", "src/App.java" -> "App"
    main_class = os.path.splitext(os.path.basename(entry_point))[0]

    # Compile command: javac all .java files
    compile_command = f"javac -d /tmp {' '.join(java_files)}"

    # Run command: java with the main class
    run_command = f"java -cp /tmp {main_class}"

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
