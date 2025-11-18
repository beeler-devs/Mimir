'use client';

import React from 'react';
import { Terminal, X, Clock, CheckCircle2, XCircle, Hammer } from 'lucide-react';
import { CodeExecutionResult } from '@/lib/types';

interface OutputConsoleProps {
  result: CodeExecutionResult | null;
  isRunning: boolean;
  onClear: () => void;
}

/**
 * Output console for displaying code execution results
 * Shows stdout, stderr, compilation output, execution time, and status
 */
export const OutputConsole: React.FC<OutputConsoleProps> = ({
  result,
  isRunning,
  onClear,
}) => {
  return (
    <div className="h-full flex flex-col bg-background text-foreground font-mono text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-medium">Output</span>

          {/* Status indicator */}
          {isRunning && (
            <div className="flex items-center gap-1.5 text-xs text-yellow-400">
              <div className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
              Running...
            </div>
          )}

          {result && !isRunning && (
            <div className="flex items-center gap-1.5 text-xs">
              {result.status === 'success' ? (
                <>
                  <CheckCircle2 className="h-3 w-3 text-green-400" />
                  <span className="text-green-400">Success</span>
                </>
              ) : result.status === 'timeout' ? (
                <>
                  <Clock className="h-3 w-3 text-orange-400" />
                  <span className="text-orange-400">Timeout</span>
                </>
              ) : result.status === 'running' ? (
                <>
                  <div className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
                  <span className="text-yellow-400">Running</span>
                </>
              ) : (
                <>
                  <XCircle className="h-3 w-3 text-red-400" />
                  <span className="text-red-400">Error</span>
                </>
              )}
              {result.executionTime !== undefined && (
                <>
                  <span className="text-gray-500">•</span>
                  <Clock className="h-3 w-3 text-gray-400" />
                  <span className="text-gray-400">
                    {result.executionTime.toFixed(0)}ms
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        <button
          onClick={onClear}
          disabled={!result && !isRunning}
          className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Clear output"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Output content */}
      <div className="flex-1 overflow-auto p-4">
        {isRunning && !result && (
          <div className="flex items-center gap-2 text-yellow-400">
            <div className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
            Executing code...
          </div>
        )}

        {result && (
          <div className="space-y-3">
            {/* Compilation output (for compiled languages) */}
            {result.compilationOutput && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-blue-400 mb-1">
                  <Hammer className="h-3 w-3" />
                  <span>Compilation</span>
                </div>
                <pre className="whitespace-pre-wrap break-words text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30 p-2 rounded border border-blue-200 dark:border-blue-900">
                  {result.compilationOutput}
                </pre>
              </div>
            )}

            {/* Success output */}
            {result.status === 'success' && (
              <>
                {result.stdout && (
                  <div className="space-y-1">
                    <div className="text-xs text-gray-500">stdout:</div>
                    <pre className="whitespace-pre-wrap break-words text-green-600 dark:text-green-300">
                      {result.stdout}
                    </pre>
                  </div>
                )}
                {result.stderr && (
                  <div className="space-y-1">
                    <div className="text-xs text-gray-500">stderr:</div>
                    <pre className="whitespace-pre-wrap break-words text-yellow-600 dark:text-yellow-300">
                      {result.stderr}
                    </pre>
                  </div>
                )}
                {!result.stdout && !result.stderr && result.output && (
                  <pre className="whitespace-pre-wrap break-words text-green-600 dark:text-green-300">
                    {result.output}
                  </pre>
                )}
                {!result.stdout && !result.stderr && !result.output && (
                  <span className="text-muted-foreground italic">(no output)</span>
                )}
              </>
            )}

            {/* Running status (e.g., installing packages) */}
            {result.status === 'running' && result.output && (
              <pre className="whitespace-pre-wrap break-words text-yellow-600 dark:text-yellow-300">
                {result.output}
              </pre>
            )}

            {/* Error output */}
            {(result.status === 'error' || result.status === 'timeout') && (
              <>
                {result.stdout && (
                  <div className="space-y-1">
                    <div className="text-xs text-gray-500">stdout:</div>
                    <pre className="whitespace-pre-wrap break-words text-slate-600 dark:text-slate-300">
                      {result.stdout}
                    </pre>
                  </div>
                )}
                {result.stderr && (
                  <div className="space-y-1">
                    <div className="text-xs text-gray-500">stderr:</div>
                    <pre className="whitespace-pre-wrap break-words text-red-600 dark:text-red-400">
                      {result.stderr}
                    </pre>
                  </div>
                )}
                {!result.stdout && !result.stderr && result.output && (
                  <pre className="whitespace-pre-wrap break-words text-slate-600 dark:text-slate-300 mb-2">
                    {result.output}
                  </pre>
                )}
                {result.error && (
                  <div className="space-y-1">
                    <div className="text-xs text-red-500">Error:</div>
                    <pre className="whitespace-pre-wrap break-words text-red-600 dark:text-red-400">
                      {result.error}
                    </pre>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {!result && !isRunning && (
          <div className="text-muted-foreground italic">
            No output yet. Run your code to see results here.
          </div>
        )}
      </div>
    </div>
  );
};
