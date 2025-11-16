'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Custom markdown renderer with compact, chat-optimized styling
 * Renders AI assistant responses with proper formatting
 */
export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = '',
}) => {
  const components: Components = {
    // Headers - progressively smaller with compact spacing
    h1: ({ node, ...props }) => (
      <h1 className="text-base font-bold mt-3 mb-2 first:mt-0" {...props} />
    ),
    h2: ({ node, ...props }) => (
      <h2 className="text-sm font-bold mt-2.5 mb-1.5 first:mt-0" {...props} />
    ),
    h3: ({ node, ...props }) => (
      <h3 className="text-sm font-semibold mt-2 mb-1 first:mt-0" {...props} />
    ),
    h4: ({ node, ...props }) => (
      <h4 className="text-sm font-semibold mt-1.5 mb-1 first:mt-0" {...props} />
    ),
    h5: ({ node, ...props }) => (
      <h5 className="text-xs font-semibold mt-1.5 mb-0.5 first:mt-0" {...props} />
    ),
    h6: ({ node, ...props }) => (
      <h6 className="text-xs font-semibold mt-1 mb-0.5 first:mt-0" {...props} />
    ),

    // Paragraphs - relaxed line height, last paragraph no bottom margin
    p: ({ node, ...props }) => (
      <p className="text-sm mb-2 last:mb-0 leading-relaxed" {...props} />
    ),

    // Lists - compact spacing between items
    ul: ({ node, ...props }) => (
      <ul className="text-sm list-disc list-inside mb-2 space-y-0.5" {...props} />
    ),
    ol: ({ node, ...props }) => (
      <ol className="text-sm list-decimal list-inside mb-2 space-y-0.5" {...props} />
    ),
    li: ({ node, ...props }) => (
      <li className="text-sm leading-relaxed" {...props} />
    ),

    // Code - distinguish inline vs block via inline prop
    code: ({ node, inline, ...props }) => {
      if (inline) {
        return (
          <code
            className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono"
            {...props}
          />
        );
      }
      // Block code
      return (
        <code
          className="block text-xs bg-muted p-2 rounded font-mono overflow-x-auto mb-2"
          {...props}
        />
      );
    },

    // Pre - wraps code blocks
    pre: ({ node, ...props }) => (
      <pre className="text-xs bg-muted p-2 rounded overflow-x-auto mb-2" {...props} />
    ),

    // Blockquotes - left border accent with italic text
    blockquote: ({ node, ...props }) => (
      <blockquote
        className="text-sm border-l-2 border-muted-foreground/30 pl-3 italic my-2 text-muted-foreground"
        {...props}
      />
    ),

    // Links - always open in new tab with security
    a: ({ node, ...props }) => (
      <a
        className="text-sm text-primary hover:underline"
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      />
    ),

    // Tables - horizontally scrollable with compact cells
    table: ({ node, ...props }) => (
      <div className="overflow-x-auto mb-2">
        <table className="text-xs border-collapse w-full" {...props} />
      </div>
    ),
    thead: ({ node, ...props }) => (
      <thead className="bg-muted" {...props} />
    ),
    th: ({ node, ...props }) => (
      <th
        className="text-xs border border-border px-2 py-1 text-left font-semibold"
        {...props}
      />
    ),
    td: ({ node, ...props }) => (
      <td className="text-xs border border-border px-2 py-1" {...props} />
    ),

    // Other elements
    hr: ({ node, ...props }) => (
      <hr className="my-3 border-border" {...props} />
    ),
    strong: ({ node, ...props }) => (
      <strong className="font-semibold" {...props} />
    ),
    em: ({ node, ...props }) => (
      <em className="italic" {...props} />
    ),
  };

  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
};

