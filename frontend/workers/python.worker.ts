/**
 * Pyodide Web Worker for Python code execution
 * Runs Python code in a separate thread to avoid blocking the UI
 */

import { loadPyodide, PyodideInterface } from 'pyodide';

let pyodide: PyodideInterface | null = null;
let isInitializing = false;

interface WorkerMessage {
  type: 'init' | 'run' | 'interrupt';
  code?: string;
  timeout?: number;
}

interface WorkerResponse {
  type: 'ready' | 'success' | 'error' | 'interrupted';
  output?: string;
  error?: string;
  executionTime?: number;
}

// Initialize Pyodide
async function initializePyodide() {
  if (pyodide || isInitializing) return;

  isInitializing = true;
  try {
    pyodide = await loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/',
    });

    // Set up stdout/stderr capture
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
    self.postMessage({
      type: 'error',
      error: `Failed to initialize Pyodide: ${error}`,
    } as WorkerResponse);
  } finally {
    isInitializing = false;
  }
}

// Run Python code
async function runPython(code: string, timeout = 30000) {
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
    const timeoutPromise = new Promise((_, reject) => {
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

    const executionTime = performance.now() - startTime;

    const output = stdout + (stderr ? `\n${stderr}` : '');

    self.postMessage({
      type: 'success',
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
      const capturedOutput = stdout + (stderr ? `\n${stderr}` : '');

      self.postMessage({
        type: 'error',
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
  const { type, code, timeout } = event.data;

  switch (type) {
    case 'init':
      await initializePyodide();
      break;

    case 'run':
      if (code) {
        await runPython(code, timeout);
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
