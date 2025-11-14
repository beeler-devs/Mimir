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
export async function updateFolder(folderId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('folders')
    .update({ name })
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
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('instances')
    .insert({
      user_id: user.id,
      folder_id: instance.folderId || null,
      title: instance.title,
      type: instance.type,
      data: instance.data,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating instance:', error);
    throw error;
  }

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

