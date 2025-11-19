'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Sparkles, BookOpen, FileText, Info, MessageCircle } from 'lucide-react';

interface MindMapNodeData {
  label: string;
  description?: string;
  nodeType: 'concept' | 'topic' | 'subtopic' | 'detail';
  level: number;
  isExpanded: boolean;
  onAskQuestion?: () => void;
}

const nodeTypeIcons: Record<string, React.ReactNode> = {
  concept: <Sparkles className="h-4 w-4" />,
  topic: <BookOpen className="h-4 w-4" />,
  subtopic: <FileText className="h-4 w-4" />,
  detail: <Info className="h-4 w-4" />,
};

const MindMapNode = memo(({ data, selected }: NodeProps<MindMapNodeData>) => {
  const { label, description, nodeType, level, onAskQuestion } = data;

  // Font sizes based on level
  const labelSize = level === 0 ? 'text-base' : level === 1 ? 'text-sm' : 'text-xs';
  const descSize = 'text-xs';

  return (
    <div
      className={`
        relative group rounded-xl shadow-md transition-all duration-200
        hover:shadow-xl hover:scale-[1.02]
        ${selected ? 'ring-2 ring-blue-400 ring-offset-2' : ''}
      `}
      style={{
        background: 'inherit',
        borderColor: 'inherit',
        color: 'inherit',
      }}
    >
      {/* Target handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-gray-400 !border-white !border-2 !w-3 !h-3"
      />

      {/* Node content */}
      <div className="p-4">
        {/* Header with icon and label */}
        <div className="flex items-start gap-2">
          <span className="flex-shrink-0 mt-0.5 opacity-80">
            {nodeTypeIcons[nodeType] || nodeTypeIcons.detail}
          </span>
          <span className={`font-semibold ${labelSize} leading-tight`}>
            {label}
          </span>
        </div>

        {/* Description */}
        {description && (
          <p className={`mt-2 ${descSize} opacity-80 leading-snug line-clamp-2`}>
            {description}
          </p>
        )}

        {/* Ask Mimir button - appears on hover */}
        {onAskQuestion && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAskQuestion();
            }}
            className={`
              absolute -bottom-3 left-1/2 -translate-x-1/2
              opacity-0 group-hover:opacity-100
              transition-all duration-200
              bg-purple-500 hover:bg-purple-600
              text-white text-xs font-medium
              px-3 py-1.5 rounded-full shadow-lg
              flex items-center gap-1.5
              whitespace-nowrap
            `}
          >
            <MessageCircle className="h-3 w-3" />
            Ask Mimir
          </button>
        )}
      </div>

      {/* Source handle (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-gray-400 !border-white !border-2 !w-3 !h-3"
      />

      {/* Left handle for related edges */}
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!bg-purple-400 !border-white !border-2 !w-2 !h-2 opacity-0 group-hover:opacity-100"
      />

      {/* Right handle for related edges */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!bg-purple-400 !border-white !border-2 !w-2 !h-2 opacity-0 group-hover:opacity-100"
      />
    </div>
  );
});

MindMapNode.displayName = 'MindMapNode';

export default MindMapNode;
