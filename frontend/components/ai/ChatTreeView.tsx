'use client';

import React from 'react';
import { ChatNode } from '@/lib/types';
import { buildTree, TreeNode } from '@/lib/chatState';
import { MessageSquare, User, Bot } from 'lucide-react';

interface ChatTreeViewProps {
  nodes: ChatNode[];
  activeNodeId: string;
  onNodeClick: (nodeId: string) => void;
}

/**
 * Tree visualization of conversation branches
 */
export const ChatTreeView: React.FC<ChatTreeViewProps> = ({ nodes, activeNodeId, onNodeClick }) => {
  const tree = buildTree(nodes);

  const renderTreeNode = (treeNode: TreeNode, isLast: boolean = false) => {
    const { node, children, depth } = treeNode;
    const isActive = node.id === activeNodeId;
    const Icon = node.role === 'user' ? User : Bot;
    
    return (
      <div key={node.id} className="relative">
        <button
          onClick={() => onNodeClick(node.id)}
          className={`
            flex items-start space-x-2 w-full p-2 rounded-lg text-left
            transition-colors
            ${isActive ? 'bg-primary/10 border-l-2 border-primary' : 'hover:bg-muted'}
          `}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate">{node.content}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(node.createdAt).toLocaleTimeString()}
            </p>
          </div>
        </button>
        
        {children.length > 0 && (
          <div className="mt-1">
            {children.map((child, idx) => 
              renderTreeNode(child, idx === children.length - 1)
            )}
          </div>
        )}
      </div>
    );
  };

  if (tree.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center text-muted-foreground">
          <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No conversation history</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 overflow-y-auto">
      {tree.map((node, idx) => renderTreeNode(node, idx === tree.length - 1))}
    </div>
  );
};

