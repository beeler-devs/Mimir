/**
 * Database operations for mind maps
 * Handles interactive concept maps with nodes and edges
 */

import { supabase as supabaseClient } from '../supabaseClient';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  MindMap,
  MindMapNode,
  MindMapEdge,
  MindMapWithNodes,
  MindMapInteraction,
  StudyMaterial,
} from '../types';
import { createStudyMaterial, getLatestStudyMaterial, calculateContentHash } from './studyMaterials';

// =====================================================
// MIND MAPS
// =====================================================

/**
 * Save a mind map to the database
 */
export async function saveMindMap(
  instanceId: string,
  nodes: Array<{
    label: string;
    description?: string;
    nodeType: 'concept' | 'topic' | 'subtopic' | 'detail';
    level: number;
    positionX?: number;
    positionY?: number;
    width?: number;
    height?: number;
    style?: Record<string, any>;
    metadata?: Record<string, any>;
  }>,
  edges: Array<{
    sourceNodeIndex: number; // Index in nodes array
    targetNodeIndex: number;
    label?: string;
    edgeType: 'child' | 'related' | 'prerequisite' | 'example';
    style?: Record<string, any>;
    metadata?: Record<string, any>;
  }>,
  title?: string,
  description?: string,
  layoutAlgorithm: 'dagre' | 'elk' | 'manual' = 'dagre',
  metadata?: Record<string, any>,
  client?: SupabaseClient
): Promise<MindMapWithNodes> {
  const supabase = client || supabaseClient;
  const contentHash = calculateContentHash(JSON.stringify({ nodes, edges }));

  // Create study material
  const studyMaterial = await createStudyMaterial(instanceId, 'mind_map', contentHash, metadata, client);

  // Create mind map (without root_node_id initially)
  const { data: mindMapData, error: mindMapError } = await supabase
    .from('mind_maps')
    .insert({
      study_material_id: studyMaterial.id,
      title: title || null,
      description: description || null,
      layout_algorithm: layoutAlgorithm,
      root_node_id: null, // Will be set after creating nodes
    })
    .select()
    .single();

  if (mindMapError) throw mindMapError;

  // Create nodes
  const nodeInserts = nodes.map((node) => ({
    mind_map_id: mindMapData.id,
    label: node.label,
    description: node.description || null,
    node_type: node.nodeType,
    level: node.level,
    position_x: node.positionX || null,
    position_y: node.positionY || null,
    width: node.width || 200,
    height: node.height || 100,
    style: node.style || null,
    metadata: node.metadata || null,
  }));

  const { data: nodesData, error: nodesError } = await supabase
    .from('mind_map_nodes')
    .insert(nodeInserts)
    .select();

  if (nodesError) throw nodesError;

  // Create edges using actual node IDs
  const edgeInserts = edges.map((edge) => ({
    mind_map_id: mindMapData.id,
    source_node_id: nodesData![edge.sourceNodeIndex].id,
    target_node_id: nodesData![edge.targetNodeIndex].id,
    label: edge.label || null,
    edge_type: edge.edgeType,
    style: edge.style || null,
    metadata: edge.metadata || null,
  }));

  const { data: edgesData, error: edgesError } = await supabase
    .from('mind_map_edges')
    .insert(edgeInserts)
    .select();

  if (edgesError) throw edgesError;

  // Set root node (first level 0 node, or first node if none)
  const rootNode = nodesData!.find((n) => n.level === 0) || nodesData![0];
  if (rootNode) {
    await supabase.from('mind_maps').update({ root_node_id: rootNode.id }).eq('id', mindMapData.id);
  }

  return {
    ...mapMindMap({ ...mindMapData, root_node_id: rootNode?.id || null }),
    nodes: (nodesData || []).map(mapMindMapNode),
    edges: (edgesData || []).map(mapMindMapEdge),
    studyMaterial,
  };
}

/**
 * Get the latest mind map for an instance
 */
export async function getLatestMindMap(instanceId: string): Promise<MindMapWithNodes | null> {
  const studyMaterial = await getLatestStudyMaterial(instanceId, 'mind_map');
  if (!studyMaterial) return null;

  const { data: mindMapData, error: mindMapError } = await supabaseClient
    .from('mind_maps')
    .select('*')
    .eq('study_material_id', studyMaterial.id)
    .single();

  if (mindMapError) {
    if (mindMapError.code === 'PGRST116') return null;
    throw mindMapError;
  }

  // Get nodes
  const { data: nodesData, error: nodesError } = await supabaseClient
    .from('mind_map_nodes')
    .select('*')
    .eq('mind_map_id', mindMapData.id)
    .order('level')
    .order('created_at');

  if (nodesError) throw nodesError;

  // Get edges
  const { data: edgesData, error: edgesError } = await supabaseClient
    .from('mind_map_edges')
    .select('*')
    .eq('mind_map_id', mindMapData.id);

  if (edgesError) throw edgesError;

  return {
    ...mapMindMap(mindMapData),
    nodes: (nodesData || []).map(mapMindMapNode),
    edges: (edgesData || []).map(mapMindMapEdge),
    studyMaterial,
  };
}

/**
 * Get a mind map by ID
 */
export async function getMindMapById(mindMapId: string): Promise<MindMapWithNodes | null> {
  const { data: mindMapData, error: mindMapError } = await supabaseClient
    .from('mind_maps')
    .select('*')
    .eq('id', mindMapId)
    .single();

  if (mindMapError) {
    if (mindMapError.code === 'PGRST116') return null;
    throw mindMapError;
  }

  // Get nodes
  const { data: nodesData, error: nodesError } = await supabaseClient
    .from('mind_map_nodes')
    .select('*')
    .eq('mind_map_id', mindMapId)
    .order('level')
    .order('created_at');

  if (nodesError) throw nodesError;

  // Get edges
  const { data: edgesData, error: edgesError } = await supabaseClient
    .from('mind_map_edges')
    .select('*')
    .eq('mind_map_id', mindMapId);

  if (edgesError) throw edgesError;

  return {
    ...mapMindMap(mindMapData),
    nodes: (nodesData || []).map(mapMindMapNode),
    edges: (edgesData || []).map(mapMindMapEdge),
  };
}

/**
 * Update node positions (for manual layout adjustments)
 */
export async function updateNodePositions(
  updates: Array<{ nodeId: string; x: number; y: number }>
): Promise<void> {
  const updatePromises = updates.map((update) =>
    supabaseClient
      .from('mind_map_nodes')
      .update({
        position_x: update.x,
        position_y: update.y,
      })
      .eq('id', update.nodeId)
  );

  await Promise.all(updatePromises);
}

/**
 * Update mind map layout algorithm
 */
export async function updateMindMapLayout(
  mindMapId: string,
  layoutAlgorithm: 'dagre' | 'elk' | 'manual'
): Promise<void> {
  const { error } = await supabaseClient
    .from('mind_maps')
    .update({ layout_algorithm: layoutAlgorithm })
    .eq('id', mindMapId);

  if (error) throw error;
}

/**
 * Delete a mind map
 */
export async function deleteMindMap(mindMapId: string): Promise<void> {
  const { error } = await supabaseClient.from('mind_maps').delete().eq('id', mindMapId);

  if (error) throw error;
}

// =====================================================
// MIND MAP INTERACTIONS (Analytics)
// =====================================================

/**
 * Record a mind map interaction
 */
export async function recordMindMapInteraction(
  mindMapId: string,
  interactionType: 'view' | 'expand' | 'collapse' | 'ask_question',
  nodeId?: string,
  interactionData?: Record<string, any>
): Promise<void> {
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const { error } = await supabaseClient.from('mind_map_interactions').insert({
    mind_map_id: mindMapId,
    user_id: user.id,
    node_id: nodeId || null,
    interaction_type: interactionType,
    interaction_data: interactionData || null,
  });

  if (error) throw error;
}

/**
 * Get interactions for a mind map
 */
export async function getMindMapInteractions(mindMapId: string): Promise<MindMapInteraction[]> {
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (!user) throw new Error('User not authenticated');

  const { data, error } = await supabaseClient
    .from('mind_map_interactions')
    .select('*')
    .eq('mind_map_id', mindMapId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(mapMindMapInteraction);
}

// =====================================================
// MAPPING FUNCTIONS (camelCase conversion)
// =====================================================

function mapMindMap(data: any): MindMap {
  return {
    id: data.id,
    studyMaterialId: data.study_material_id,
    title: data.title,
    description: data.description,
    rootNodeId: data.root_node_id,
    layoutAlgorithm: data.layout_algorithm,
    nodeCount: data.node_count,
    edgeCount: data.edge_count,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function mapMindMapNode(data: any): MindMapNode {
  return {
    id: data.id,
    mindMapId: data.mind_map_id,
    label: data.label,
    description: data.description,
    nodeType: data.node_type,
    level: data.level,
    positionX: data.position_x,
    positionY: data.position_y,
    width: data.width,
    height: data.height,
    style: data.style,
    metadata: data.metadata,
    createdAt: data.created_at,
  };
}

function mapMindMapEdge(data: any): MindMapEdge {
  return {
    id: data.id,
    mindMapId: data.mind_map_id,
    sourceNodeId: data.source_node_id,
    targetNodeId: data.target_node_id,
    label: data.label,
    edgeType: data.edge_type,
    style: data.style,
    metadata: data.metadata,
    createdAt: data.created_at,
  };
}

function mapMindMapInteraction(data: any): MindMapInteraction {
  return {
    id: data.id,
    mindMapId: data.mind_map_id,
    userId: data.user_id,
    nodeId: data.node_id,
    interactionType: data.interaction_type,
    interactionData: data.interaction_data,
    createdAt: data.created_at,
  };
}
