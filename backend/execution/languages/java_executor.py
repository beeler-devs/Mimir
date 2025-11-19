"""
Java language executor
"""

import os
import shlex
from typing import List
from ..models import CodeFile, ExecuteResponse
from ..sandbox import execute_with_sandbox, sanitize_path, validate_filename


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
    java_files = []
    for f in files:
        sanitized = sanitize_path(f.path)
        if sanitized.endswith('.java'):
            if not validate_filename(sanitized):
                return ExecuteResponse(
                    status='error',
                    stdout='',
                    stderr=f'Invalid characters in filename: {f.path}',
                    executionTime=0,
                    compilationOutput=None
                )
            java_files.append(sanitized)

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
    sanitized_entry = sanitize_path(entry_point)
    main_class = os.path.splitext(os.path.basename(sanitized_entry))[0]

    # Validate main class name
    if not main_class or not main_class[0].isalpha():
        return ExecuteResponse(
            status='error',
            stdout='',
            stderr=f'Invalid main class name derived from: {entry_point}',
            executionTime=0,
            compilationOutput=None
        )

    # Build compile command with properly escaped file paths
    quoted_files = ' '.join(shlex.quote(f) for f in java_files)
    compile_command = f"javac -d /tmp {quoted_files}"

    # Run command: java with the main class
    run_command = f"java -cp /tmp {shlex.quote(main_class)}"

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
