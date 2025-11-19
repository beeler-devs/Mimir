"""
Docker sandbox utilities for secure code execution
"""

import os
import shutil
import tempfile
import subprocess
import logging
import shlex
import re
from typing import Tuple, Optional
import time

logger = logging.getLogger(__name__)

# Docker configuration
DOCKER_IMAGE = os.getenv('EXECUTION_DOCKER_IMAGE', 'mimir-executor:latest')
MEMORY_LIMIT = os.getenv('EXECUTION_MEMORY_LIMIT', '128m')
CPU_LIMIT = os.getenv('EXECUTION_CPU_LIMIT', '1')
PIDS_LIMIT = os.getenv('EXECUTION_PIDS_LIMIT', '50')

# Cache docker availability (check once at startup)
_docker_available: Optional[bool] = None
_docker_check_time: float = 0
_DOCKER_CHECK_INTERVAL = 60  # Re-check every 60 seconds


def sanitize_path(path: str) -> str:
    """
    Sanitize file path to prevent path traversal attacks

    Args:
        path: The file path to sanitize

    Returns:
        Sanitized path with no traversal components
    """
    # Remove any path traversal attempts
    parts = path.split('/')
    sanitized_parts = [
        part for part in parts
        if part and part != '..' and part != '.'
    ]
    return '/'.join(sanitized_parts)


def validate_filename(filename: str) -> bool:
    """
    Validate that a filename is safe for shell commands

    Args:
        filename: The filename to validate

    Returns:
        True if the filename is safe
    """
    # Only allow alphanumeric, underscore, hyphen, dot, and forward slash
    return bool(re.match(r'^[a-zA-Z0-9_\-./]+$', filename))


def create_temp_directory(files: list) -> str:
    """
    Create a temporary directory with the source files

    Args:
        files: List of dicts with 'path' and 'content' keys

    Returns:
        Path to the temporary directory

    Raises:
        ValueError: If any file path is invalid
    """
    temp_dir = tempfile.mkdtemp(prefix='mimir_exec_')

    try:
        for file in files:
            # Sanitize the path
            sanitized_path = sanitize_path(file['path'])
            if not sanitized_path:
                raise ValueError(f"Invalid file path: {file['path']}")

            file_path = os.path.join(temp_dir, sanitized_path)

            # Ensure the file path is still within temp_dir (defense in depth)
            real_file_path = os.path.realpath(file_path)
            real_temp_dir = os.path.realpath(temp_dir)
            if not real_file_path.startswith(real_temp_dir + os.sep):
                raise ValueError(f"Path traversal detected: {file['path']}")

            # Create parent directories if needed
            parent_dir = os.path.dirname(file_path)
            if parent_dir:
                os.makedirs(parent_dir, exist_ok=True)

            # Write file content
            with open(file_path, 'w') as f:
                f.write(file['content'])

        return temp_dir

    except Exception as e:
        # Clean up on error
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise


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
    # Generate a unique container name for cleanup
    container_name = f"mimir_exec_{os.path.basename(temp_dir)}"

    docker_command = [
        'docker', 'run',
        '--name', container_name,
        '--rm',  # Remove container after execution
        '--network', 'none',  # No network access
        '--memory', MEMORY_LIMIT,  # Memory limit
        '--cpus', CPU_LIMIT,  # CPU limit
        '--pids-limit', PIDS_LIMIT,  # Process limit (fork bomb protection)
        '--read-only',  # Read-only filesystem
        '--tmpfs', '/tmp:rw,size=64m,exec',  # Writable /tmp with size limit
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
        # Kill the container on timeout
        try:
            subprocess.run(
                ['docker', 'kill', container_name],
                capture_output=True,
                timeout=5
            )
            subprocess.run(
                ['docker', 'rm', '-f', container_name],
                capture_output=True,
                timeout=5
            )
        except Exception as e:
            logger.warning(f"Failed to kill container {container_name}: {e}")

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
    Check if Docker is available and the execution image exists.
    Results are cached to avoid repeated checks.

    Returns:
        True if Docker is available and configured
    """
    global _docker_available, _docker_check_time

    current_time = time.time()

    # Return cached result if still valid
    if _docker_available is not None and (current_time - _docker_check_time) < _DOCKER_CHECK_INTERVAL:
        return _docker_available

    try:
        # Check if Docker daemon is running
        result = subprocess.run(
            ['docker', 'info'],
            capture_output=True,
            timeout=5
        )
        if result.returncode != 0:
            _docker_available = False
            _docker_check_time = current_time
            return False

        # Check if our execution image exists
        result = subprocess.run(
            ['docker', 'image', 'inspect', DOCKER_IMAGE],
            capture_output=True,
            timeout=5
        )
        _docker_available = result.returncode == 0
        _docker_check_time = current_time
        return _docker_available

    except Exception:
        _docker_available = False
        _docker_check_time = current_time
        return False


def build_safe_command(file_paths: list, compile_template: str, output_path: str = '/tmp/program') -> str:
    """
    Build a safe shell command with properly escaped file paths

    Args:
        file_paths: List of file paths to include in command
        compile_template: Command template (e.g., "gcc -o {output} {files}")
        output_path: Path for output executable

    Returns:
        Safe shell command string
    """
    # Validate all file paths
    for path in file_paths:
        if not validate_filename(path):
            raise ValueError(f"Invalid characters in filename: {path}")

    # Quote each file path for shell safety
    quoted_files = ' '.join(shlex.quote(f) for f in file_paths)

    return compile_template.format(
        files=quoted_files,
        output=shlex.quote(output_path)
    )


def execute_with_sandbox(
    files: list,
    compile_command: Optional[str],
    run_command: str,
    timeout_ms: int = 30000
) -> Tuple[str, str, str, float, str]:
    """
    Execute code with sandbox protection

    Args:
        files: List of dicts with 'path' and 'content' keys
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

        timeout_seconds = max(1, timeout_ms / 1000)  # Ensure at least 1 second
        use_docker = is_docker_available()

        run_func = run_in_docker if use_docker else run_locally

        if not use_docker:
            logger.warning("Docker not available, falling back to local execution (less secure)")

        # Compile if needed
        if compile_command:
            # Give compilation at least 5 seconds, up to half the total timeout
            compile_timeout = max(5, int(timeout_seconds / 2))

            return_code, stdout, stderr = run_func(
                temp_dir,
                compile_command,
                timeout_seconds=compile_timeout
            )
            compilation_output = stdout + stderr

            if return_code != 0:
                execution_time = (time.time() - start_time) * 1000
                return 'error', '', stderr or stdout, execution_time, compilation_output

        # Run the program with remaining timeout
        elapsed = time.time() - start_time
        remaining_timeout = max(1, int(timeout_seconds - elapsed))

        return_code, stdout, stderr = run_func(
            temp_dir,
            run_command,
            timeout_seconds=remaining_timeout
        )

        execution_time = (time.time() - start_time) * 1000

        if 'timed out' in stderr.lower():
            return 'timeout', stdout, stderr, execution_time, compilation_output
        elif return_code != 0:
            return 'error', stdout, stderr, execution_time, compilation_output
        else:
            return 'success', stdout, stderr, execution_time, compilation_output

    except ValueError as e:
        # Path validation errors
        execution_time = (time.time() - start_time) * 1000
        return 'error', '', str(e), execution_time, compilation_output

    except Exception as e:
        execution_time = (time.time() - start_time) * 1000
        return 'error', '', str(e), execution_time, compilation_output

    finally:
        if temp_dir:
            cleanup_temp_directory(temp_dir)
