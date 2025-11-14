'use client';

import React, { useState } from 'react';
import { ChatNode } from '@/lib/types';
import { addMessage, getActiveBranch, buildBranchPath } from '@/lib/chatState';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';
import { ChatTreeView } from './ChatTreeView';
import { VoiceButton } from './VoiceButton';
import { MessageSquare, GitBranch } from 'lucide-react';

type ViewMode = 'chat' | 'tree';

/**
 * Main AI sidepanel component
 * Manages chat state and switches between chat and tree views
 */
export const AISidePanel: React.FC = () => {
  const [nodes, setNodes] = useState<ChatNode[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [loading, setLoading] = useState(false);

  const activeBranch = activeNodeId ? getActiveBranch(nodes, activeNodeId) : [];

  const handleSendMessage = async (content: string) => {
    // Add user message
    const userMessage: Omit<ChatNode, 'id' | 'createdAt'> = {
      role: 'user',
      content,
      parentId: activeNodeId,
    };
    
    const updatedNodes = addMessage(nodes, userMessage);
    const newUserNode = updatedNodes[updatedNodes.length - 1];
    setNodes(updatedNodes);
    setActiveNodeId(newUserNode.id);
    setLoading(true);

    try {
      // Call API to get AI response
      const branchPath = buildBranchPath(updatedNodes, newUserNode.id);
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: getActiveBranch(updatedNodes, newUserNode.id).map(n => ({
            role: n.role,
            content: n.content,
          })),
          branchPath,
        }),
      });

      const data = await response.json();
      
      // Add AI response
      const aiMessage: Omit<ChatNode, 'id' | 'createdAt'> = {
        role: 'assistant',
        content: data.message.content,
        parentId: newUserNode.id,
        suggestedAnimation: data.suggestedAnimation,
      };
      
      const nodesWithAI = addMessage(updatedNodes, aiMessage);
      const newAINode = nodesWithAI[nodesWithAI.length - 1];
      setNodes(nodesWithAI);
      setActiveNodeId(newAINode.id);
    } catch (error) {
      console.error('Error sending message:', error);
      // Add error message
      const errorMessage: Omit<ChatNode, 'id' | 'createdAt'> = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        parentId: newUserNode.id,
      };
      const nodesWithError = addMessage(updatedNodes, errorMessage);
      const errorNode = nodesWithError[nodesWithError.length - 1];
      setNodes(nodesWithError);
      setActiveNodeId(errorNode.id);
    } finally {
      setLoading(false);
    }
  };

  const handleNodeClick = (nodeId: string) => {
    setActiveNodeId(nodeId);
    setViewMode('chat');
  };

  return (
    <>
      <div className="flex flex-col h-full">
        {/* View Mode Toggle */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setViewMode('chat')}
            className={`
              flex-1 flex items-center justify-center space-x-2 py-3
              text-sm font-medium transition-colors
              ${viewMode === 'chat' 
                ? 'bg-background text-foreground border-b-2 border-primary' 
                : 'text-muted-foreground hover:text-foreground'}
            `}
          >
            <MessageSquare className="h-4 w-4" />
            <span>Chat</span>
          </button>
          <button
            onClick={() => setViewMode('tree')}
            className={`
              flex-1 flex items-center justify-center space-x-2 py-3
              text-sm font-medium transition-colors
              ${viewMode === 'tree' 
                ? 'bg-background text-foreground border-b-2 border-primary' 
                : 'text-muted-foreground hover:text-foreground'}
            `}
          >
            <GitBranch className="h-4 w-4" />
            <span>Tree</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          {viewMode === 'chat' ? (
            <ChatMessageList messages={activeBranch} />
          ) : (
            <ChatTreeView
              nodes={nodes}
              activeNodeId={activeNodeId || ''}
              onNodeClick={handleNodeClick}
            />
          )}
        </div>

        {/* Chat Input (only in chat mode) */}
        {viewMode === 'chat' && (
          <ChatInput
            onSend={handleSendMessage}
            loading={loading}
          />
        )}
      </div>

      {/* Voice Button */}
      <VoiceButton />
    </>
  );
};

