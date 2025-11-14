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
    <div className="flex flex-col h-full">
      {/* View Mode Toggle */}
      <div className="flex items-center border-b border-border px-4 py-3 gap-3">
        {[
          { id: 'chat' as ViewMode, label: 'Chat', icon: MessageSquare },
          { id: 'tree' as ViewMode, label: 'Tree', icon: GitBranch },
        ].map(({ id, label, icon: Icon }) => {
          const active = viewMode === id;
          return (
            <button
              key={id}
              onClick={() => setViewMode(id)}
              className={`
                flex-1 group rounded-2xl border px-4 py-3 text-left transition-all
                focus-visible:outline-none focus-visible:ring-2
                ${active ? 'border-primary/70 bg-primary/5 text-foreground focus-visible:ring-primary/60' : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted/40 focus-visible:ring-primary/30'}
              `}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`
                    h-9 w-9 rounded-xl flex items-center justify-center
                    ${active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground group-hover:text-foreground'}
                  `}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">
                    {id === 'chat' ? 'Talk with Mimir' : 'Navigate responses'}
                  </p>
                </div>
              </div>
            </button>
          );
        })}

        <VoiceButton size="sm" className="shrink-0" />
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
  );
};
