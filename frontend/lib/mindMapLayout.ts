/**
 * Mind Map Layout utilities
 * Converts database format to React Flow format with Dagre auto-layout
 */

import dagre from 'dagre';
import type {
  MindMapWithNodes,
  MindMapNode,
  MindMapEdge,
  ReactFlowNode,
  ReactFlowEdge,
} from './types';

// Node dimensions by level
const NODE_WIDTHS: Record<number, number> = {
  0: 280, // concept
  1: 240, // topic
  2: 200, // subtopic
  3: 180, // detail
};

const NODE_HEIGHT = 80;

// Colors for node types
const NODE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  concept: {
    bg: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
    border: '#7c3aed',
    text: '#ffffff',
  },
  topic: {
    bg: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    border: '#2563eb',
    text: '#ffffff',
  },
  subtopic: {
    bg: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    border: '#059669',
    text: '#ffffff',
  },
  detail: {
    bg: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
    border: '#4b5563',
    text: '#ffffff',
  },
};

// Edge styles by type
const EDGE_STYLES: Record<string, { stroke: string; strokeWidth: number; animated?: boolean; strokeDasharray?: string }> = {
  child: {
    stroke: '#94a3b8',
    strokeWidth: 2,
  },
  related: {
    stroke: '#a78bfa',
    strokeWidth: 2,
    strokeDasharray: '5,5',
  },
  prerequisite: {
    stroke: '#f97316',
    strokeWidth: 2,
    animated: true,
  },
  example: {
    stroke: '#22c55e',
    strokeWidth: 2,
    strokeDasharray: '3,3',
  },
};

/**
 * Get adaptive Dagre spacing based on node count
 */
function getDagreSpacing(nodeCount: number): { nodesep: number; ranksep: number; edgesep: number } {
  if (nodeCount < 10) {
    return { nodesep: 100, ranksep: 150, edgesep: 50 };
  } else if (nodeCount < 20) {
    return { nodesep: 80, ranksep: 120, edgesep: 40 };
  } else {
    return { nodesep: 60, ranksep: 100, edgesep: 30 };
  }
}

/**
 * Convert mind map database format to React Flow format with Dagre layout
 */
export function convertToReactFlow(
  mindMap: MindMapWithNodes
): { nodes: ReactFlowNode[]; edges: ReactFlowEdge[] } {
  if (!mindMap.nodes || mindMap.nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  // Create node ID mapping (database ID -> index)
  const nodeIdToIndex = new Map<string, number>();
  mindMap.nodes.forEach((node, index) => {
    nodeIdToIndex.set(node.id, index);
  });

  // Convert to React Flow nodes (initial positions will be set by Dagre)
  const flowNodes: ReactFlowNode[] = mindMap.nodes.map((node, index) => {
    const colors = NODE_COLORS[node.nodeType] || NODE_COLORS.detail;
    const width = NODE_WIDTHS[node.level] || NODE_WIDTHS[3];

    return {
      id: node.id,
      type: 'mindMapNode',
      position: { x: 0, y: 0 }, // Will be set by Dagre
      data: {
        label: node.label,
        description: node.description || undefined,
        nodeType: node.nodeType,
        level: node.level,
        isExpanded: true,
      },
      style: {
        width,
        background: colors.bg,
        borderColor: colors.border,
        color: colors.text,
      },
    };
  });

  // Convert to React Flow edges
  const flowEdges: ReactFlowEdge[] = mindMap.edges.map((edge) => {
    const style = EDGE_STYLES[edge.edgeType] || EDGE_STYLES.child;

    return {
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      label: edge.label || undefined,
      type: 'smoothstep',
      style: {
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        strokeDasharray: style.strokeDasharray,
      },
      animated: style.animated || false,
      labelStyle: {
        fontSize: 10,
        fontWeight: 500,
        fill: '#64748b',
      },
      labelBgStyle: {
        fill: '#f8fafc',
        fillOpacity: 0.8,
      },
    };
  });

  // Apply Dagre layout
  const layoutedNodes = applyDagreLayout(flowNodes, flowEdges);

  return {
    nodes: layoutedNodes,
    edges: flowEdges,
  };
}

/**
 * Apply Dagre hierarchical layout to nodes
 */
function applyDagreLayout(
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[]
): ReactFlowNode[] {
  const spacing = getDagreSpacing(nodes.length);

  // Create Dagre graph
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: 'TB', // Top to bottom
    nodesep: spacing.nodesep,
    ranksep: spacing.ranksep,
    edgesep: spacing.edgesep,
    marginx: 50,
    marginy: 50,
  });

  // Add nodes to graph
  nodes.forEach((node) => {
    const width = (node.style?.width as number) || 200;
    dagreGraph.setNode(node.id, {
      width,
      height: NODE_HEIGHT,
    });
  });

  // Add edges to graph
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Calculate layout
  dagre.layout(dagreGraph);

  // Apply calculated positions to nodes
  return nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    const width = (node.style?.width as number) || 200;

    return {
      ...node,
      position: {
        // Dagre returns center position, React Flow uses top-left
        x: nodeWithPosition.x - width / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });
}

/**
 * Get node style based on type and level
 */
export function getNodeStyle(nodeType: string, level: number): React.CSSProperties {
  const colors = NODE_COLORS[nodeType] || NODE_COLORS.detail;
  const width = NODE_WIDTHS[level] || NODE_WIDTHS[3];

  return {
    width,
    background: colors.bg,
    borderColor: colors.border,
    color: colors.text,
    borderWidth: 2,
    borderStyle: 'solid',
    borderRadius: 12,
    padding: 16,
  };
}

/**
 * Get edge style based on type
 */
export function getEdgeStyle(edgeType: string): {
  stroke: string;
  strokeWidth: number;
  animated?: boolean;
  strokeDasharray?: string;
} {
  return EDGE_STYLES[edgeType] || EDGE_STYLES.child;
}

/**
 * Calculate bounds of all nodes (for fit view)
 */
export function calculateBounds(nodes: ReactFlowNode[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  nodes.forEach((node) => {
    const width = (node.style?.width as number) || 200;
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + width);
    maxY = Math.max(maxY, node.position.y + NODE_HEIGHT);
  });

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
