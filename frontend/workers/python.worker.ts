/**
 * Pyodide Web Worker for Python code execution
 * Runs Python code in a separate thread to avoid blocking the UI
 * Supports multi-file execution with virtual filesystem
 */

import { loadPyodide, PyodideInterface } from 'pyodide';

let pyodide: PyodideInterface | null = null;
let isInitializing = false;
let initPromise: Promise<void> | null = null;

interface CodeFile {
  path: string;
  content: string;
}

interface WorkerMessage {
  type: 'init' | 'run' | 'install' | 'interrupt';
  // For single file execution (backwards compatibility)
  code?: string;
  // For multi-file execution
  entryPoint?: string;
  files?: CodeFile[];
  // Common options
  timeout?: number;
  packages?: string[];
}

interface WorkerResponse {
  type: 'ready' | 'success' | 'error' | 'interrupted' | 'installing';
  stdout?: string;
  stderr?: string;
  output?: string; // Combined output for backwards compatibility
  error?: string;
  executionTime?: number;
}

/**
 * Validate and sanitize file path to prevent path traversal attacks
 */
function sanitizePath(path: string): string {
  // Remove any path traversal attempts
  const sanitized = path
    .split('/')
    .filter(segment => segment !== '..' && segment !== '.' && segment !== '')
    .join('/');

  // Ensure path doesn't start with /
  return sanitized.replace(/^\/+/, '');
}

/**
 * Validate all file paths in the files array
 */
function validateFiles(files: CodeFile[]): CodeFile[] {
  return files.map(file => ({
    ...file,
    path: sanitizePath(file.path)
  })).filter(file => file.path.length > 0);
}

// Initialize Pyodide
async function initializePyodide(): Promise<void> {
  // Return existing promise if already initializing
  if (initPromise) return initPromise;

  // Return immediately if already initialized
  if (pyodide) return;

  isInitializing = true;

  initPromise = (async () => {
    try {
      pyodide = await loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',
      });

      // Set up output capture mechanism
      await pyodide.runPythonAsync(`
import sys
from io import StringIO

class OutputCapture:
    def __init__(self):
        self.stdout = StringIO()
        self.stderr = StringIO()

    def capture(self):
        sys.stdout = self.stdout
        sys.stderr = self.stderr

    def release(self):
        sys.stdout = sys.__stdout__
        sys.stderr = sys.__stderr__

    def get_output(self):
        return self.stdout.getvalue(), self.stderr.getvalue()

    def clear(self):
        self.stdout = StringIO()
        self.stderr = StringIO()

_output_capture = OutputCapture()
      `);

      self.postMessage({ type: 'ready' } as WorkerResponse);
    } catch (error) {
      pyodide = null;
      self.postMessage({
        type: 'error',
        error: `Failed to initialize Pyodide: ${error}`,
      } as WorkerResponse);
      throw error;
    } finally {
      isInitializing = false;
    }
  })();

  return initPromise;
}

// Install packages using micropip
async function installPackages(packages: string[]) {
  if (!pyodide) {
    throw new Error('Pyodide not initialized');
  }

  self.postMessage({
    type: 'installing',
    output: `Installing packages: ${packages.join(', ')}...`,
  } as WorkerResponse);

  await pyodide.loadPackage('micropip');
  const micropip = pyodide.pyimport('micropip');

  try {
    for (const pkg of packages) {
      await micropip.install(pkg);
    }
  } finally {
    // Clean up the micropip reference
    micropip.destroy();
  }
}

// Set up virtual filesystem with project files
async function setupVirtualFilesystem(files: CodeFile[]) {
  if (!pyodide) {
    throw new Error('Pyodide not initialized');
  }

  // Validate and sanitize all file paths
  const sanitizedFiles = validateFiles(files);

  // Clean previous project state
  await pyodide.runPythonAsync(`
import os
import shutil

# Remove previous project directory if it exists
if os.path.exists('/project'):
    shutil.rmtree('/project')

# Create fresh project directory
os.makedirs('/project', exist_ok=True)
  `);

  // Create directory structure and write files
  const directories = new Set<string>();

  // Collect all directories
  for (const file of sanitizedFiles) {
    const parts = file.path.split('/');
    let currentPath = '/project';
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath += `/${parts[i]}`;
      directories.add(currentPath);
    }
  }

  // Create directories
  for (const dir of directories) {
    try {
      pyodide.FS.mkdirTree(dir);
    } catch {
      // Directory may already exist
    }
  }

  // Write files
  for (const file of sanitizedFiles) {
    const fullPath = `/project/${file.path}`;
    pyodide.FS.writeFile(fullPath, file.content);
  }

  // Update sys.path to include project directories
  await pyodide.runPythonAsync(`
import sys
import os

# Add project root to path
if '/project' not in sys.path:
    sys.path.insert(0, '/project')

# Also add common subdirectories
for subdir in ['src', 'lib', 'utils']:
    path = f'/project/{subdir}'
    if os.path.exists(path) and path not in sys.path:
        sys.path.insert(0, path)
  `);
}

// Run Python code (single file - backwards compatible)
async function runPythonSingleFile(code: string, timeout = 30000) {
  // Ensure Pyodide is initialized
  await initializePyodide();

  if (!pyodide) {
    throw new Error('Pyodide not initialized');
  }

  const startTime = performance.now();

  try {
    // Clear previous output
    await pyodide.runPythonAsync('_output_capture.clear()');

    // Capture output
    await pyodide.runPythonAsync('_output_capture.capture()');

    // Run user code with timeout
    // Note: This timeout only prevents waiting forever, it doesn't stop execution
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Execution timeout')), timeout);
    });

    const executionPromise = pyodide.runPythonAsync(code);

    await Promise.race([executionPromise, timeoutPromise]);

    // Release output capture
    await pyodide.runPythonAsync('_output_capture.release()');

    // Get captured output
    const result = await pyodide.runPythonAsync(
      'tuple(_output_capture.get_output())'
    );

    const [stdout, stderr] = result.toJs() as [string, string];

    // Clean up proxy object to prevent memory leak
    result.destroy();

    const executionTime = performance.now() - startTime;

    const output = stdout + (stderr ? `\n${stderr}` : '');

    self.postMessage({
      type: 'success',
      stdout,
      stderr,
      output: output || '(no output)',
      executionTime,
    } as WorkerResponse);

  } catch (error: any) {
    // Release output capture on error
    try {
      await pyodide.runPythonAsync('_output_capture.release()');
      const result = await pyodide.runPythonAsync(
        'tuple(_output_capture.get_output())'
      );
      const [stdout, stderr] = result.toJs() as [string, string];
      result.destroy();
      const capturedOutput = stdout + (stderr ? `\n${stderr}` : '');

      self.postMessage({
        type: 'error',
        stdout,
        stderr,
        error: error.message || String(error),
        output: capturedOutput || undefined,
        executionTime: performance.now() - startTime,
      } as WorkerResponse);
    } catch {
      self.postMessage({
        type: 'error',
        error: error.message || String(error),
        executionTime: performance.now() - startTime,
      } as WorkerResponse);
    }
  }
}

// Run Python code with multi-file support
async function runPythonMultiFile(files: CodeFile[], entryPoint: string, timeout = 30000) {
  // Ensure Pyodide is initialized
  await initializePyodide();

  if (!pyodide) {
    throw new Error('Pyodide not initialized');
  }

  const startTime = performance.now();

  // Sanitize the entry point path
  const sanitizedEntryPoint = sanitizePath(entryPoint);
  if (!sanitizedEntryPoint) {
    self.postMessage({
      type: 'error',
      error: 'Invalid entry point path',
      executionTime: performance.now() - startTime,
    } as WorkerResponse);
    return;
  }

  try {
    // Set up virtual filesystem with all project files
    await setupVirtualFilesystem(files);

    // Clear previous output
    await pyodide.runPythonAsync('_output_capture.clear()');

    // Capture output
    await pyodide.runPythonAsync('_output_capture.capture()');

    // Execute the entry point file
    // Use JSON to safely pass the entry point path
    const pythonScript = `
import sys
import os
import json

# Change to project directory
os.chdir('/project')

entry_point = json.loads('${JSON.stringify(sanitizedEntryPoint)}')

try:
    # Read and execute the entry point
    entry_path = f'/project/{entry_point}'
    if not os.path.exists(entry_path):
        raise FileNotFoundError(f"Entry point not found: {entry_point}")

    with open(entry_path, 'r') as f:
        code = f.read()

    # Execute with __name__ = '__main__' so if __name__ == '__main__' works
    exec(compile(code, entry_point, 'exec'), {'__name__': '__main__', '__file__': entry_path})
except Exception:
    import traceback
    traceback.print_exc()
`;

    // Run with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Execution timeout')), timeout);
    });

    const executionPromise = pyodide.runPythonAsync(pythonScript);

    await Promise.race([executionPromise, timeoutPromise]);

    // Release output capture
    await pyodide.runPythonAsync('_output_capture.release()');

    // Get captured output
    const result = await pyodide.runPythonAsync(
      'tuple(_output_capture.get_output())'
    );

    const [stdout, stderr] = result.toJs() as [string, string];
    result.destroy();

    const executionTime = performance.now() - startTime;

    const output = stdout + (stderr ? `\n${stderr}` : '');

    self.postMessage({
      type: 'success',
      stdout,
      stderr,
      output: output || '(no output)',
      executionTime,
    } as WorkerResponse);

  } catch (error: any) {
    // Release output capture on error
    try {
      await pyodide.runPythonAsync('_output_capture.release()');
      const result = await pyodide.runPythonAsync(
        'tuple(_output_capture.get_output())'
      );
      const [stdout, stderr] = result.toJs() as [string, string];
      result.destroy();
      const capturedOutput = stdout + (stderr ? `\n${stderr}` : '');

      self.postMessage({
        type: 'error',
        stdout,
        stderr,
        error: error.message || String(error),
        output: capturedOutput || undefined,
        executionTime: performance.now() - startTime,
      } as WorkerResponse);
    } catch {
      self.postMessage({
        type: 'error',
        error: error.message || String(error),
        executionTime: performance.now() - startTime,
      } as WorkerResponse);
    }
  }
}

// Handle messages from main thread
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, code, files, entryPoint, timeout, packages } = event.data;

  switch (type) {
    case 'init':
      await initializePyodide();
      break;

    case 'install':
      if (packages && packages.length > 0) {
        try {
          await initializePyodide();
          await installPackages(packages);
          self.postMessage({
            type: 'success',
            output: `Successfully installed: ${packages.join(', ')}`,
          } as WorkerResponse);
        } catch (error: any) {
          self.postMessage({
            type: 'error',
            error: error.message || String(error),
          } as WorkerResponse);
        }
      }
      break;

    case 'run':
      // Multi-file execution
      if (files && files.length > 0 && entryPoint) {
        await runPythonMultiFile(files, entryPoint, timeout);
      }
      // Single file execution (backwards compatible)
      else if (code) {
        await runPythonSingleFile(code, timeout);
      }
      break;

    case 'interrupt':
      // Pyodide doesn't support interruption, would need to restart worker
      self.postMessage({
        type: 'interrupted',
        error: 'Execution interrupted (worker restart required)',
      } as WorkerResponse);
      break;
  }
};

// Auto-initialize on worker start
initializePyodide();
