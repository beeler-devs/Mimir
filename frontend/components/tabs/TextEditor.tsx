'use client';

import React, { useState, KeyboardEvent } from 'react';
import { Button } from '@/components/common';
import { Send } from 'lucide-react';

interface TextEditorProps {
  content: string;
  onChange: (value: string) => void;
}

/**
 * Rich text editor for notes, essays, and problem sets
 * Currently a simple textarea - can be enhanced with a rich text library later
 */
export const TextEditor: React.FC<TextEditorProps> = ({ content, onChange }) => {
  const [selectedText, setSelectedText] = useState('');

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (selection) {
      setSelectedText(selection.toString());
    }
  };

  const handleAskAI = () => {
    if (selectedText) {
      // This will be implemented later with the chat system
      console.log('Ask AI about:', selectedText);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      
      // Insert 4 spaces at cursor position
      const newContent = content.substring(0, start) + '    ' + content.substring(end);
      onChange(newContent);
      
      // Move cursor after the inserted spaces
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 4;
      }, 0);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {selectedText && (
        <div className="mb-4 flex items-center justify-end">
          <button
            onClick={handleAskAI}
            className="px-3 py-2 text-sm font-medium text-foreground hover:opacity-80 transition-opacity"
            style={{
              backgroundColor: '#F5F5F5',
              borderRadius: '0.85rem',
            }}
          >
            <Send className="h-3.5 w-3.5 mr-2 inline" />
            Ask Mimir
          </button>
        </div>
      )}
      
      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        onMouseUp={handleTextSelection}
        onKeyDown={handleKeyDown}
        className="
          flex-1 w-full p-4
          rounded-lg border border-input
          bg-background text-foreground
          font-mono text-sm
          focus:outline-none
          resize-none
        "
        placeholder="Start writing your notes, problem sets, or essays here...&#10;&#10;Select any text and click 'Ask Mimir' to get explanations or guidance."
      />
      
      <div className="my-4 px-4 text-sm text-muted-foreground">
        {content.split(/\s+/).filter(Boolean).length} words · {content.length} characters
      </div>
    </div>
  );
};
