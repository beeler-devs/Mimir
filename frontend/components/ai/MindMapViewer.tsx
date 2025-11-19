'use client';

import React, { useCallback, useMemo, useState } from 'react';
import ReactFlow, {
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  Node,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Maximize2, ZoomIn, ZoomOut, Download } from 'lucide-react';
import { toPng } from 'html-to-image';

import MindMapNode from './MindMapNode';
import { convertToReactFlow } from '@/lib/mindMapLayout';
import type { MindMapWithNodes, ReactFlowNode } from '@/lib/types';

interface MindMapViewerProps {
  mindMap: MindMapWithNodes;
  onAskAboutNode?: (nodeId: string, nodeLabel: string, nodeDescription?: string) => void;
}

// Register custom node types
const nodeTypes = {
  mindMapNode: MindMapNode,
};

export default function MindMapViewer({ mindMap, onAskAboutNode }: MindMapViewerProps) {
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // Convert mind map data to React Flow format with layout
  const { initialNodes, initialEdges } = useMemo(() => {
    const { nodes, edges } = convertToReactFlow(mindMap);

    // Add onAskQuestion callback to each node
    const nodesWithCallbacks = nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onAskQuestion: onAskAboutNode
          ? () => onAskAboutNode(node.id, node.data.label, node.data.description)
          : undefined,
      },
    }));

    return {
      initialNodes: nodesWithCallbacks,
      initialEdges: edges,
    };
  }, [mindMap, onAskAboutNode]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Fit view to show all nodes
  const handleFitView = useCallback(() => {
    if (reactFlowInstance) {
      reactFlowInstance.fitView({ padding: 0.2, duration: 300 });
    }
  }, [reactFlowInstance]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    if (reactFlowInstance) {
      reactFlowInstance.zoomIn({ duration: 300 });
    }
  }, [reactFlowInstance]);

  const handleZoomOut = useCallback(() => {
    if (reactFlowInstance) {
      reactFlowInstance.zoomOut({ duration: 300 });
    }
  }, [reactFlowInstance]);

  // Download as PNG
  const handleDownload = useCallback(() => {
    const viewport = document.querySelector('.react-flow__viewport') as HTMLElement;
    if (!viewport) return;

    toPng(viewport, {
      backgroundColor: '#ffffff',
      width: viewport.scrollWidth,
      height: viewport.scrollHeight,
      style: {
        width: `${viewport.scrollWidth}px`,
        height: `${viewport.scrollHeight}px`,
      },
    })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = `${mindMap.title || 'mind-map'}.png`;
        link.href = dataUrl;
        link.click();
      })
      .catch((err) => {
        console.error('Error exporting mind map:', err);
      });
  }, [mindMap.title]);

  // Mini map node color based on type
  const miniMapNodeColor = useCallback((node: Node) => {
    const nodeType = (node.data as any)?.nodeType;
    switch (nodeType) {
      case 'concept':
        return '#8b5cf6';
      case 'topic':
        return '#3b82f6';
      case 'subtopic':
        return '#10b981';
      case 'detail':
        return '#6b7280';
      default:
        return '#6b7280';
    }
  }, []);

  return (
    <div className="w-full h-full relative">
      {/* Toolbar */}
      <div className="absolute top-4 left-4 z-10 flex gap-1 bg-background/90 backdrop-blur-sm rounded-lg border border-border shadow-sm p-1">
        <button
          onClick={handleFitView}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
          title="Fit to view"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        <button
          onClick={handleZoomIn}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={handleZoomOut}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <div className="w-px bg-border mx-1" />
        <button
          onClick={handleDownload}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors"
          title="Download as PNG"
        >
          <Download className="h-4 w-4" />
        </button>
      </div>

      {/* React Flow Canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={setReactFlowInstance}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        attributionPosition="bottom-left"
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e2e8f0" />
        <Controls
          showInteractive={false}
          className="!bg-background/90 !backdrop-blur-sm !border !border-border !shadow-sm !rounded-lg"
        />
        <MiniMap
          nodeColor={miniMapNodeColor}
          nodeStrokeWidth={3}
          zoomable
          pannable
          className="!bg-background/90 !backdrop-blur-sm !border !border-border !shadow-sm !rounded-lg"
        />
      </ReactFlow>
    </div>
  );
}
