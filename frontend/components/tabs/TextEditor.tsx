'use client';

import React, { useState } from 'react';
import { Button } from '@/components/common';
import { Send } from 'lucide-react';

/**
 * Rich text editor for notes, essays, and problem sets
 * Currently a simple textarea - can be enhanced with a rich text library later
 */
export const TextEditor: React.FC = () => {
  const [content, setContent] = useState('');
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

  return (
    <div className="h-full flex flex-col p-6 bg-background">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Text Editor</h2>
        {selectedText && (
          <Button onClick={handleAskAI} size="sm">
            <Send className="h-4 w-4 mr-2" />
            Ask AI about selection
          </Button>
        )}
      </div>
      
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onMouseUp={handleTextSelection}
        className="
          flex-1 w-full p-4 
          rounded-lg border border-input
          bg-background text-foreground
          font-mono text-base
          focus:outline-none focus:ring-2 focus:ring-ring
          resize-none
        "
        placeholder="Start writing your notes, problem sets, or essays here...&#10;&#10;Select any text and click 'Ask AI' to get explanations or guidance."
      />
      
      <div className="mt-4 text-sm text-muted-foreground">
        {content.split(/\s+/).filter(Boolean).length} words · {content.length} characters
      </div>
    </div>
  );
};

