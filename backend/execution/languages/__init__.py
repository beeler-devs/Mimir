"""
Language-specific executors
"""

from .c_executor import execute_c
from .cpp_executor import execute_cpp
from .java_executor import execute_java
from .rust_executor import execute_rust

__all__ = ['execute_c', 'execute_cpp', 'execute_java', 'execute_rust']
