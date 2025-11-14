'use client';

import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { Button } from '@/components/common';
import { Play, MessageCircle } from 'lucide-react';
import type { CodeLanguage } from '@/lib/types';

/**
 * Code editor with Monaco Editor and language selection
 */
export const CodeEditor: React.FC = () => {
  const [language, setLanguage] = useState<CodeLanguage>('python');
  const [code, setCode] = useState(`# Write your code here
def hello_world():
    print("Hello, Mimir!")

hello_world()
`);
  const [theme, setTheme] = useState<'vs' | 'vs-dark'>('vs');

  // Detect theme changes
  useEffect(() => {
    const updateTheme = () => {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'vs-dark' : 'vs');
    };

    // Initial theme
    updateTheme();

    // Watch for theme changes
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);
  
  const languages: { value: CodeLanguage; label: string }[] = [
    { value: 'python', label: 'Python' },
    { value: 'javascript', label: 'JavaScript' },
    { value: 'typescript', label: 'TypeScript' },
    { value: 'java', label: 'Java' },
    { value: 'cpp', label: 'C++' },
  ];

  const handleRun = () => {
    // Stub - will be implemented later
    console.log('Running code:', code);
    alert('Code execution will be implemented in a future update!');
  };

  const handleAskAI = () => {
    // Stub - will be implemented with chat system
    console.log('Ask AI about code');
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center space-x-4">
          <label className="text-sm font-medium">Language:</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as CodeLanguage)}
            className="
              px-3 py-1.5 rounded-xl border border-input
              bg-background text-foreground text-sm
              focus:outline-none
            "
          >
            {languages.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button onClick={handleRun} size="sm" variant="secondary">
            <Play className="h-4 w-4 mr-2" />
            Run
          </Button>
          <Button onClick={handleAskAI} size="sm">
            <MessageCircle className="h-4 w-4 mr-2" />
            Ask AI
          </Button>
        </div>
      </div>
      
      {/* Monaco Editor */}
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          language={language}
          value={code}
          onChange={(value) => setCode(value || '')}
          theme={theme}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            fontFamily: "'JetBrains Mono', 'Courier New', monospace",
            lineNumbers: 'on',
            roundedSelection: true,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
          }}
        />
      </div>
    </div>
  );
};

