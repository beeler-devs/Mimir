'use client';

import React from 'react';
import { Terminal, X, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { CodeExecutionResult } from '@/lib/types';

interface OutputConsoleProps {
  result: CodeExecutionResult | null;
  isRunning: boolean;
  onClear: () => void;
}

/**
 * Output console for displaying code execution results
 * Shows stdout, stderr, execution time, and status
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
          <div className="space-y-2">
            {/* Success output */}
            {result.status === 'success' && result.output && (
              <pre className="whitespace-pre-wrap break-words text-green-600 dark:text-green-300">
                {result.output}
              </pre>
            )}

            {/* Error output */}
            {result.status === 'error' && (
              <>
                {result.output && (
                  <pre className="whitespace-pre-wrap break-words text-slate-600 dark:text-slate-300 mb-2">
                    {result.output}
                  </pre>
                )}
                <pre className="whitespace-pre-wrap break-words text-red-600 dark:text-red-400">
                  {result.error}
                </pre>
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
