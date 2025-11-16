import { supabase } from '@/lib/supabaseClient';
import { Folder, WorkspaceInstance, InstanceType } from '@/lib/types';

/**
 * Instance and Folder database operations
 * Handles CRUD operations for workspace instances and folders
 */

/**
 * Load all folders for the current user
 */
export async function loadUserFolders(): Promise<Folder[]> {
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error loading folders:', error);
    throw error;
  }

  // Convert snake_case to camelCase
  return (data || []).map((folder) => ({
    id: folder.id,
    userId: folder.user_id,
    name: folder.name,
    parentFolderId: folder.parent_folder_id,
    createdAt: folder.created_at,
    updatedAt: folder.updated_at,
  }));
}

/**
 * Create a new folder
 */
export async function createFolder(
  name: string,
  parentFolderId?: string | null
): Promise<Folder> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('folders')
    .insert({
      user_id: user.id,
      name,
      parent_folder_id: parentFolderId || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating folder:', error);
    throw error;
  }

  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    parentFolderId: data.parent_folder_id,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Update folder name
 */
export async function updateFolder(
  folderId: string,
  name?: string,
  parentFolderId?: string | null
): Promise<void> {
  const updates: { name?: string; parent_folder_id?: string | null } = {};
  if (name !== undefined) {
    updates.name = name;
  }
  if (parentFolderId !== undefined) {
    updates.parent_folder_id = parentFolderId;
  }

  if (Object.keys(updates).length === 0) {
    return;
  }

  const { error } = await supabase
    .from('folders')
    .update(updates)
    .eq('id', folderId);

  if (error) {
    console.error('Error updating folder:', error);
    throw error;
  }
}

/**
 * Delete a folder
 * Note: This will cascade delete child folders and set instances' folder_id to null
 */
export async function deleteFolder(folderId: string): Promise<void> {
  const { error } = await supabase
    .from('folders')
    .delete()
    .eq('id', folderId);

  if (error) {
    console.error('Error deleting folder:', error);
    throw error;
  }
}

/**
 * Load all instances for the current user
 */
export async function loadUserInstances(): Promise<WorkspaceInstance[]> {
  const { data, error } = await supabase
    .from('instances')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error loading instances:', error);
    throw error;
  }

  // Convert database format to WorkspaceInstance format
  return (data || []).map((instance) => {
    const baseInstance = {
      id: instance.id,
      title: instance.title,
      folderId: instance.folder_id,
    };

    switch (instance.type as InstanceType) {
      case 'text':
        return {
          ...baseInstance,
          type: 'text' as const,
          data: instance.data,
        };
      case 'code':
        return {
          ...baseInstance,
          type: 'code' as const,
          data: instance.data,
        };
      case 'annotate':
        return {
          ...baseInstance,
          type: 'annotate' as const,
          data: instance.data,
        };
      case 'pdf':
        return {
          ...baseInstance,
          type: 'pdf' as const,
          data: instance.data,
        };
      default:
        throw new Error(`Unknown instance type: ${instance.type}`);
    }
  });
}

/**
 * Create a new instance
 */
export async function createInstance(
  instance: Omit<WorkspaceInstance, 'id'>
): Promise<WorkspaceInstance> {
  console.log('[createInstance] Starting instance creation...');
  console.log('[createInstance] Instance type:', instance.type);
  console.log('[createInstance] Instance title:', instance.title);
  console.log('[createInstance] Instance folderId:', instance.folderId);
  console.log('[createInstance] Instance data:', JSON.stringify(instance.data, null, 2));

  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    console.error('[createInstance] User not authenticated');
    throw new Error('User not authenticated');
  }

  console.log('[createInstance] User authenticated:', user.id);

  const insertPayload = {
    user_id: user.id,
    folder_id: instance.folderId || null,
    title: instance.title,
    type: instance.type,
    data: instance.data,
  };

  console.log('[createInstance] Insert payload:', JSON.stringify(insertPayload, null, 2));

  const { data, error } = await supabase
    .from('instances')
    .insert(insertPayload)
    .select()
    .single();

  if (error) {
    console.error('[createInstance] ❌ ERROR creating instance');
    console.error('[createInstance] Error object:', error);
    console.error('[createInstance] Error message:', error.message);
    console.error('[createInstance] Error code:', error.code);
    console.error('[createInstance] Error details:', error.details);
    console.error('[createInstance] Error hint:', error.hint);
    console.error('[createInstance] Full error JSON:', JSON.stringify(error, null, 2));
    throw error;
  }

  console.log('[createInstance] ✅ Instance created successfully');
  console.log('[createInstance] Created instance ID:', data.id);
  console.log('[createInstance] Created instance type:', data.type);

  // Convert back to WorkspaceInstance format
  const baseInstance = {
    id: data.id,
    title: data.title,
    folderId: data.folder_id,
  };

  switch (data.type as InstanceType) {
    case 'text':
      return { ...baseInstance, type: 'text' as const, data: data.data };
    case 'code':
      return { ...baseInstance, type: 'code' as const, data: data.data };
    case 'annotate':
      return { ...baseInstance, type: 'annotate' as const, data: data.data };
    case 'pdf':
      return { ...baseInstance, type: 'pdf' as const, data: data.data };
    default:
      throw new Error(`Unknown instance type: ${data.type}`);
  }
}

/**
 * Update an instance (title, data, or folder)
 */
export async function updateInstance(
  instanceId: string,
  updates: {
    title?: string;
    data?: Record<string, unknown>;
    folderId?: string | null;
  }
): Promise<void> {
  const dbUpdates: Record<string, unknown> = {};
  
  if (updates.title !== undefined) {
    dbUpdates.title = updates.title;
  }
  if (updates.data !== undefined) {
    dbUpdates.data = updates.data;
  }
  if (updates.folderId !== undefined) {
    dbUpdates.folder_id = updates.folderId;
  }

  const { error } = await supabase
    .from('instances')
    .update(dbUpdates)
    .eq('id', instanceId);

  if (error) {
    console.error('Error updating instance:', error);
    throw error;
  }
}

/**
 * Delete an instance
 */
export async function deleteInstance(instanceId: string): Promise<void> {
  const { error } = await supabase
    .from('instances')
    .delete()
    .eq('id', instanceId);

  if (error) {
    console.error('Error deleting instance:', error);
    throw error;
  }
}
