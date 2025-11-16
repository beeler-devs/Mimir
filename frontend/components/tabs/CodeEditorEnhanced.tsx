'use client';

import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { editor as MonacoEditor } from 'monaco-editor';
import { Button } from '@/components/common';
import { Play, MessageCircle, Sparkles, X } from 'lucide-react';
import type { CodeLanguage } from '@/lib/types';
import { CodeSelectionPopup } from '@/components/code/CodeSelectionPopup';
import { DiffEditor } from '@/components/code/DiffEditor';

interface CodeEditorEnhancedProps {
  language: CodeLanguage;
  code: string;
  onCodeChange: (value: string) => void;
  onLanguageChange: (language: CodeLanguage) => void;
  onAddToChat?: (code: string) => void;
}

interface CodeSuggestion {
  originalCode: string;
  suggestedCode: string;
}

/**
 * Enhanced code editor with Monaco Editor, selection popup, and AI diff support
 */
export const CodeEditorEnhanced: React.FC<CodeEditorEnhancedProps> = ({
  language,
  code,
  onCodeChange,
  onLanguageChange,
  onAddToChat,
}) => {
  const [theme, setTheme] = useState<'vs' | 'vs-dark'>('vs');
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [selectionPosition, setSelectionPosition] = useState<{ top: number; left: number } | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [codeSuggestion, setCodeSuggestion] = useState<CodeSuggestion | null>(null);
  const [isLoadingAI, setIsLoadingAI] = useState(false);

  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);

  // Detect theme changes
  useEffect(() => {
    const updateTheme = () => {
      const isDark = document.documentElement.classList.contains('dark');
      setTheme(isDark ? 'vs-dark' : 'vs');
    };

    updateTheme();

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

  const handleEditorDidMount = (editor: MonacoEditor.IStandaloneCodeEditor) => {
    editorRef.current = editor;

    // Listen for selection changes
    editor.onDidChangeCursorSelection((e) => {
      const selection = editor.getSelection();
      if (selection && !selection.isEmpty()) {
        const selectedText = editor.getModel()?.getValueInRange(selection);
        if (selectedText && selectedText.trim().length > 0) {
          setSelectedCode(selectedText);

          // Calculate popup position
          const position = editor.getScrolledVisiblePosition(selection.getStartPosition());
          if (position) {
            const editorDom = editor.getDomNode();
            if (editorDom) {
              const rect = editorDom.getBoundingClientRect();
              setSelectionPosition({
                top: rect.top + position.top - 50,
                left: rect.left + position.left,
              });
            }
          }
        } else {
          setSelectedCode('');
          setSelectionPosition(null);
        }
      } else {
        setSelectedCode('');
        setSelectionPosition(null);
      }
    });
  };

  const handleAddToChat = () => {
    if (selectedCode && onAddToChat) {
      onAddToChat(`Here's a code snippet I'm working with:\n\`\`\`${language}\n${selectedCode}\n\`\`\`\n\n`);
      setSelectionPosition(null);
    }
  };

  const handleAskAI = async () => {
    if (!selectedCode) return;

    setIsLoadingAI(true);
    setSelectionPosition(null);

    try {
      // Call backend to get AI suggestions
      const backendUrl = process.env.NEXT_PUBLIC_MANIM_WORKER_URL || 'http://localhost:8001';

      const response = await fetch(`${backendUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: `Please improve this ${language} code and suggest a better version. Respond ONLY with the improved code, no explanations:\n\`\`\`${language}\n${selectedCode}\n\`\`\``,
            },
          ],
          branchPath: [],
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const suggestedCode = extractCodeFromResponse(data.message.content);

      if (suggestedCode) {
        setCodeSuggestion({
          originalCode: selectedCode,
          suggestedCode,
        });
        setShowDiff(true);
      }
    } catch (error) {
      console.error('Error getting AI suggestion:', error);
      alert('Failed to get AI suggestion. Please try again.');
    } finally {
      setIsLoadingAI(false);
    }
  };

  const extractCodeFromResponse = (response: string): string | null => {
    // Try to extract code from markdown code blocks
    const codeBlockRegex = /```(?:\w+)?\n([\s\S]*?)```/;
    const match = response.match(codeBlockRegex);

    if (match && match[1]) {
      return match[1].trim();
    }

    // If no code block, return the whole response trimmed
    return response.trim();
  };

  const handleAcceptDiff = () => {
    if (codeSuggestion && editorRef.current) {
      const selection = editorRef.current.getSelection();
      if (selection) {
        // Replace selected code with suggested code
        const newCode = code.replace(codeSuggestion.originalCode, codeSuggestion.suggestedCode);
        onCodeChange(newCode);
      }
    }
    setShowDiff(false);
    setCodeSuggestion(null);
  };

  const handleRejectDiff = () => {
    setShowDiff(false);
    setCodeSuggestion(null);
  };

  const handleRun = () => {
    console.log('Running code:', code);
    alert('Code execution will be implemented in a future update!');
  };

  const handleAskAIAboutCode = () => {
    if (onAddToChat) {
      onAddToChat(`Can you help me with this ${language} code?\n\`\`\`${language}\n${code}\n\`\`\`\n\n`);
    }
  };

  // Render diff view if showing
  if (showDiff && codeSuggestion) {
    return (
      <div className="h-full flex flex-col bg-background">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border">
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium">AI Code Suggestion</span>
          </div>
          <Button onClick={handleRejectDiff} size="sm" variant="secondary">
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
        </div>

        {/* Diff Editor */}
        <div className="flex-1 overflow-hidden">
          <DiffEditor
            originalCode={codeSuggestion.originalCode}
            modifiedCode={codeSuggestion.suggestedCode}
            language={language}
            onAccept={handleAcceptDiff}
            onReject={handleRejectDiff}
            theme={theme}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background relative">
      {/* Selection popup */}
      {selectionPosition && (
        <CodeSelectionPopup
          position={selectionPosition}
          onAddToChat={handleAddToChat}
          onAskAI={handleAskAI}
        />
      )}

      {/* Loading overlay */}
      {isLoadingAI && (
        <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-40 flex items-center justify-center">
          <div className="bg-background border border-border rounded-lg p-6 shadow-lg flex items-center gap-3">
            <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium">Getting AI suggestion...</span>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center space-x-4">
          <label className="text-sm font-medium">Language:</label>
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value as CodeLanguage)}
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
          <Button onClick={handleAskAIAboutCode} size="sm">
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
          onChange={(value) => onCodeChange(value || '')}
          onMount={handleEditorDidMount}
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
