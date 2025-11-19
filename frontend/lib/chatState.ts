import { ChatNode } from './types';

/**
 * Chat state management utilities
 * Handles conversation tree structure and branch navigation
 */

/**
 * Create an index map for O(1) node lookups
 */
export function createNodeIndex(nodes: ChatNode[]): Map<string, ChatNode> {
  return new Map(nodes.map(node => [node.id, node]));
}

/**
 * Create a children index for O(1) children lookups
 */
export function createChildrenIndex(nodes: ChatNode[]): Map<string | null, ChatNode[]> {
  const index = new Map<string | null, ChatNode[]>();

  for (const node of nodes) {
    const parentId = node.parentId;
    if (!index.has(parentId)) {
      index.set(parentId, []);
    }
    index.get(parentId)!.push(node);
  }

  return index;
}

/**
 * Build the path from root to a specific node (optimized with Map)
 */
export function buildBranchPath(nodes: ChatNode[], targetNodeId: string): string[] {
  const nodeIndex = createNodeIndex(nodes);
  return buildBranchPathWithIndex(nodeIndex, targetNodeId);
}

/**
 * Build the path from root to a specific node using pre-built index
 * Use this when you need to call multiple times with the same nodes
 */
export function buildBranchPathWithIndex(
  nodeIndex: Map<string, ChatNode>,
  targetNodeId: string
): string[] {
  const path: string[] = [];
  let currentId: string | null = targetNodeId;

  // Traverse up the tree from target to root
  while (currentId) {
    path.push(currentId); // Use push instead of unshift (O(1) vs O(n))
    const node = nodeIndex.get(currentId);
    currentId = node?.parentId || null;
  }

  // Reverse at the end (O(n) once instead of O(n) for each unshift)
  return path.reverse();
}

/**
 * Get all messages in a specific branch (from root to leaf)
 */
export function getActiveBranch(nodes: ChatNode[], leafNodeId: string): ChatNode[] {
  const nodeIndex = createNodeIndex(nodes);
  return getActiveBranchWithIndex(nodeIndex, leafNodeId);
}

/**
 * Get all messages in a specific branch using pre-built index
 */
export function getActiveBranchWithIndex(
  nodeIndex: Map<string, ChatNode>,
  leafNodeId: string
): ChatNode[] {
  const path = buildBranchPathWithIndex(nodeIndex, leafNodeId);
  return path.map(id => nodeIndex.get(id)!).filter(Boolean);
}

/**
 * Add a new message to the tree
 */
export function addMessage(
  nodes: ChatNode[],
  message: Omit<ChatNode, 'id' | 'createdAt'>
): ChatNode[] {
  const newNode: ChatNode = {
    ...message,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };

  return [...nodes, newNode];
}

/**
 * Get all children of a specific node
 */
export function getChildren(nodes: ChatNode[], parentId: string): ChatNode[] {
  return nodes.filter(node => node.parentId === parentId);
}

/**
 * Get all children of a specific node using pre-built index
 */
export function getChildrenWithIndex(
  childrenIndex: Map<string | null, ChatNode[]>,
  parentId: string
): ChatNode[] {
  return childrenIndex.get(parentId) || [];
}

/**
 * Get the root nodes (nodes with no parent)
 */
export function getRootNodes(nodes: ChatNode[]): ChatNode[] {
  return nodes.filter(node => node.parentId === null);
}

/**
 * Get the root nodes using pre-built index
 */
export function getRootNodesWithIndex(
  childrenIndex: Map<string | null, ChatNode[]>
): ChatNode[] {
  return childrenIndex.get(null) || [];
}

/**
 * Switch to a different branch by finding the leaf node of that branch
 */
export function switchBranch(nodes: ChatNode[], nodeId: string): string {
  const childrenIndex = createChildrenIndex(nodes);
  return switchBranchWithIndex(childrenIndex, nodeId);
}

/**
 * Switch to a different branch using pre-built index
 */
export function switchBranchWithIndex(
  childrenIndex: Map<string | null, ChatNode[]>,
  nodeId: string
): string {
  // Find the leaf node in this branch
  let currentId = nodeId;
  let children = childrenIndex.get(currentId) || [];

  while (children.length > 0) {
    // If multiple children, pick the first one (could be made smarter)
    currentId = children[0].id;
    children = childrenIndex.get(currentId) || [];
  }

  return currentId;
}

/**
 * Generate a unique ID for a node
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get tree structure for visualization
 */
export interface TreeNode {
  node: ChatNode;
  children: TreeNode[];
  depth: number;
}

export function buildTree(nodes: ChatNode[]): TreeNode[] {
  const childrenIndex = createChildrenIndex(nodes);
  return buildTreeWithIndex(childrenIndex, null, 0);
}

/**
 * Build tree using pre-built children index
 */
export function buildTreeWithIndex(
  childrenIndex: Map<string | null, ChatNode[]>,
  parentId: string | null,
  depth: number
): TreeNode[] {
  const children = childrenIndex.get(parentId) || [];
  return children.map(node => ({
    node,
    children: buildTreeWithIndex(childrenIndex, node.id, depth + 1),
    depth,
  }));
}

/**
 * Chat tree manager for efficient operations
 * Use this when performing multiple operations on the same tree
 */
export class ChatTreeManager {
  private nodes: ChatNode[];
  private nodeIndex: Map<string, ChatNode>;
  private childrenIndex: Map<string | null, ChatNode[]>;

  constructor(nodes: ChatNode[]) {
    this.nodes = nodes;
    this.nodeIndex = createNodeIndex(nodes);
    this.childrenIndex = createChildrenIndex(nodes);
  }

  /**
   * Update the tree with new nodes (rebuilds indices)
   */
  setNodes(nodes: ChatNode[]): void {
    this.nodes = nodes;
    this.nodeIndex = createNodeIndex(nodes);
    this.childrenIndex = createChildrenIndex(nodes);
  }

  /**
   * Get the current nodes
   */
  getNodes(): ChatNode[] {
    return this.nodes;
  }

  /**
   * Get a node by ID - O(1)
   */
  getNode(id: string): ChatNode | undefined {
    return this.nodeIndex.get(id);
  }

  /**
   * Build path from root to target - O(depth)
   */
  buildBranchPath(targetNodeId: string): string[] {
    return buildBranchPathWithIndex(this.nodeIndex, targetNodeId);
  }

  /**
   * Get active branch - O(depth)
   */
  getActiveBranch(leafNodeId: string): ChatNode[] {
    return getActiveBranchWithIndex(this.nodeIndex, leafNodeId);
  }

  /**
   * Get children of a node - O(1)
   */
  getChildren(parentId: string): ChatNode[] {
    return getChildrenWithIndex(this.childrenIndex, parentId);
  }

  /**
   * Get root nodes - O(1)
   */
  getRootNodes(): ChatNode[] {
    return getRootNodesWithIndex(this.childrenIndex);
  }

  /**
   * Switch branch - O(depth)
   */
  switchBranch(nodeId: string): string {
    return switchBranchWithIndex(this.childrenIndex, nodeId);
  }

  /**
   * Build tree structure - O(n)
   */
  buildTree(): TreeNode[] {
    return buildTreeWithIndex(this.childrenIndex, null, 0);
  }

  /**
   * Add a message and update indices
   */
  addMessage(message: Omit<ChatNode, 'id' | 'createdAt'>): ChatNode {
    const newNode: ChatNode = {
      ...message,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };

    this.nodes = [...this.nodes, newNode];
    this.nodeIndex.set(newNode.id, newNode);

    const parentId = newNode.parentId;
    if (!this.childrenIndex.has(parentId)) {
      this.childrenIndex.set(parentId, []);
    }
    this.childrenIndex.get(parentId)!.push(newNode);

    return newNode;
  }
}
