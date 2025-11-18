"""
Docker sandbox utilities for secure code execution
"""

import os
import shutil
import tempfile
import subprocess
import logging
from typing import Tuple, Optional
import time

logger = logging.getLogger(__name__)

# Docker configuration
DOCKER_IMAGE = os.getenv('EXECUTION_DOCKER_IMAGE', 'mimir-executor:latest')
MEMORY_LIMIT = os.getenv('EXECUTION_MEMORY_LIMIT', '128m')
CPU_LIMIT = os.getenv('EXECUTION_CPU_LIMIT', '1')
PIDS_LIMIT = os.getenv('EXECUTION_PIDS_LIMIT', '50')


def create_temp_directory(files: list) -> str:
    """
    Create a temporary directory with the source files

    Args:
        files: List of CodeFile objects with path and content

    Returns:
        Path to the temporary directory
    """
    temp_dir = tempfile.mkdtemp(prefix='mimir_exec_')

    for file in files:
        file_path = os.path.join(temp_dir, file.path)

        # Create parent directories if needed
        parent_dir = os.path.dirname(file_path)
        if parent_dir:
            os.makedirs(parent_dir, exist_ok=True)

        # Write file content
        with open(file_path, 'w') as f:
            f.write(file.content)

    return temp_dir


def cleanup_temp_directory(temp_dir: str) -> None:
    """
    Clean up the temporary directory

    Args:
        temp_dir: Path to the temporary directory
    """
    try:
        shutil.rmtree(temp_dir)
    except Exception as e:
        logger.warning(f"Failed to cleanup temp directory {temp_dir}: {e}")


def run_in_docker(
    temp_dir: str,
    command: str,
    timeout_seconds: int = 30
) -> Tuple[int, str, str]:
    """
    Run a command inside a Docker container with security restrictions

    Args:
        temp_dir: Path to the temporary directory with source files
        command: Command to execute inside the container
        timeout_seconds: Maximum execution time in seconds

    Returns:
        Tuple of (return_code, stdout, stderr)
    """
    docker_command = [
        'docker', 'run',
        '--rm',  # Remove container after execution
        '--network', 'none',  # No network access
        '--memory', MEMORY_LIMIT,  # Memory limit
        '--cpus', CPU_LIMIT,  # CPU limit
        '--pids-limit', PIDS_LIMIT,  # Process limit (fork bomb protection)
        '--read-only',  # Read-only filesystem
        '--tmpfs', '/tmp:rw,size=64m',  # Writable /tmp with size limit
        '-v', f'{temp_dir}:/project:ro',  # Mount source files read-only
        '-w', '/project',  # Working directory
        '--user', '1000:1000',  # Non-root user
        DOCKER_IMAGE,
        'sh', '-c', command
    ]

    try:
        result = subprocess.run(
            docker_command,
            capture_output=True,
            text=True,
            timeout=timeout_seconds
        )

        return result.returncode, result.stdout, result.stderr

    except subprocess.TimeoutExpired:
        return -1, '', f'Execution timed out after {timeout_seconds} seconds'
    except Exception as e:
        return -1, '', str(e)


def run_locally(
    temp_dir: str,
    command: str,
    timeout_seconds: int = 30,
    cwd: Optional[str] = None
) -> Tuple[int, str, str]:
    """
    Run a command locally (fallback when Docker is not available)
    WARNING: This is less secure than Docker execution

    Args:
        temp_dir: Path to the temporary directory with source files
        command: Command to execute
        timeout_seconds: Maximum execution time in seconds
        cwd: Working directory (defaults to temp_dir)

    Returns:
        Tuple of (return_code, stdout, stderr)
    """
    working_dir = cwd or temp_dir

    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            cwd=working_dir
        )

        return result.returncode, result.stdout, result.stderr

    except subprocess.TimeoutExpired:
        return -1, '', f'Execution timed out after {timeout_seconds} seconds'
    except Exception as e:
        return -1, '', str(e)


def is_docker_available() -> bool:
    """
    Check if Docker is available and the execution image exists

    Returns:
        True if Docker is available and configured
    """
    try:
        # Check if Docker daemon is running
        result = subprocess.run(
            ['docker', 'info'],
            capture_output=True,
            timeout=5
        )
        if result.returncode != 0:
            return False

        # Check if our execution image exists
        result = subprocess.run(
            ['docker', 'image', 'inspect', DOCKER_IMAGE],
            capture_output=True,
            timeout=5
        )
        return result.returncode == 0

    except Exception:
        return False


def execute_with_sandbox(
    files: list,
    compile_command: Optional[str],
    run_command: str,
    timeout_ms: int = 30000
) -> Tuple[str, str, str, float, str]:
    """
    Execute code with sandbox protection

    Args:
        files: List of CodeFile objects
        compile_command: Optional compilation command
        run_command: Command to run the executable
        timeout_ms: Timeout in milliseconds

    Returns:
        Tuple of (status, stdout, stderr, execution_time_ms, compilation_output)
    """
    temp_dir = None
    start_time = time.time()
    compilation_output = ''

    try:
        # Create temp directory with source files
        temp_dir = create_temp_directory(files)

        timeout_seconds = timeout_ms / 1000
        use_docker = is_docker_available()

        run_func = run_in_docker if use_docker else run_locally

        if not use_docker:
            logger.warning("Docker not available, falling back to local execution (less secure)")

        # Compile if needed
        if compile_command:
            compile_start = time.time()
            return_code, stdout, stderr = run_func(
                temp_dir,
                compile_command,
                timeout_seconds=int(timeout_seconds / 2)  # Half timeout for compilation
            )
            compilation_output = stdout + stderr

            if return_code != 0:
                execution_time = (time.time() - start_time) * 1000
                return 'error', '', stderr or stdout, execution_time, compilation_output

        # Run the program
        return_code, stdout, stderr = run_func(
            temp_dir,
            run_command,
            timeout_seconds=int(timeout_seconds)
        )

        execution_time = (time.time() - start_time) * 1000

        if 'timed out' in stderr:
            return 'timeout', stdout, stderr, execution_time, compilation_output
        elif return_code != 0:
            return 'error', stdout, stderr, execution_time, compilation_output
        else:
            return 'success', stdout, stderr, execution_time, compilation_output

    except Exception as e:
        execution_time = (time.time() - start_time) * 1000
        return 'error', '', str(e), execution_time, compilation_output

    finally:
        if temp_dir:
            cleanup_temp_directory(temp_dir)
