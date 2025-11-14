import { ChatNode } from './types';

/**
 * Chat state management utilities
 * Handles conversation tree structure and branch navigation
 */

/**
 * Build the path from root to a specific node
 */
export function buildBranchPath(nodes: ChatNode[], targetNodeId: string): string[] {
  const path: string[] = [];
  let currentId: string | null = targetNodeId;
  
  // Traverse up the tree from target to root
  while (currentId) {
    path.unshift(currentId);
    const node = nodes.find(n => n.id === currentId);
    currentId = node?.parentId || null;
  }
  
  return path;
}

/**
 * Get all messages in a specific branch (from root to leaf)
 */
export function getActiveBranch(nodes: ChatNode[], leafNodeId: string): ChatNode[] {
  const path = buildBranchPath(nodes, leafNodeId);
  return path.map(id => nodes.find(n => n.id === id)!).filter(Boolean);
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
 * Get the root nodes (nodes with no parent)
 */
export function getRootNodes(nodes: ChatNode[]): ChatNode[] {
  return nodes.filter(node => node.parentId === null);
}

/**
 * Switch to a different branch by finding the leaf node of that branch
 */
export function switchBranch(nodes: ChatNode[], nodeId: string): string {
  // Find the leaf node in this branch
  let currentId = nodeId;
  let children = getChildren(nodes, currentId);
  
  while (children.length > 0) {
    // If multiple children, pick the first one (could be made smarter)
    currentId = children[0].id;
    children = getChildren(nodes, currentId);
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
  const buildSubtree = (parentId: string | null, depth: number): TreeNode[] => {
    const children = nodes.filter(n => n.parentId === parentId);
    return children.map(node => ({
      node,
      children: buildSubtree(node.id, depth + 1),
      depth,
    }));
  };
  
  return buildSubtree(null, 0);
}

