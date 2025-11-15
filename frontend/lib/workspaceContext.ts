import {
  WorkspaceContext,
  WorkspaceContextInstance,
  WorkspaceContextFolder,
  WorkspaceInstance,
  Folder,
  Mention,
} from '@/lib/types';

// Context size limits
const MAX_TEXT_LENGTH = 10000; // characters
const MAX_CODE_LINES = 500; // lines
const MAX_INSTANCES_PER_FOLDER = 20;

/**
 * Truncate text content intelligently (show beginning and end)
 */
function truncateText(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;
  
  const firstPart = content.substring(0, 500);
  const lastPart = content.substring(content.length - 200);
  return `${firstPart}\n\n[truncated...]\n\n${lastPart}`;
}

/**
 * Truncate code content intelligently (show beginning and end lines)
 */
function truncateCode(code: string, maxLines: number): string {
  const lines = code.split('\n');
  if (lines.length <= maxLines) return code;
  
  const firstLines = lines.slice(0, 300).join('\n');
  const lastLines = lines.slice(lines.length - 100).join('\n');
  return `${firstLines}\n\n// [truncated...]\n\n${lastLines}`;
}

/**
 * Build workspace context from active instance and mentions
 * Always includes active instance, plus any mentioned instances/folders
 * Applies intelligent truncation to manage context size
 */
export function buildWorkspaceContext(
  activeInstance: WorkspaceInstance | null,
  instances: WorkspaceInstance[],
  folders: Folder[],
  mentions: Mention[],
  annotationExports: Record<string, string> // instanceId -> base64 image
): WorkspaceContext {
  const contextInstances: WorkspaceContextInstance[] = [];
  const contextFolders: WorkspaceContextFolder[] = [];
  const annotationImages: Record<string, string> = {};

  // Always include active instance if it exists (prioritized - no truncation)
  if (activeInstance) {
    const instanceContext = buildInstanceContext(activeInstance, true);
    contextInstances.push(instanceContext);
    
    // Include annotation image if available
    if (activeInstance.type === 'annotate' && annotationExports[activeInstance.id]) {
      annotationImages[activeInstance.id] = annotationExports[activeInstance.id];
    }
  }

  // Process mentions
  const mentionedInstanceIds = new Set<string>();
  const mentionedFolderIds = new Set<string>();

  mentions.forEach((mention) => {
    if (mention.type === 'instance' && mention.id) {
      mentionedInstanceIds.add(mention.id);
    } else if (mention.type === 'folder' && mention.id) {
      mentionedFolderIds.add(mention.id);
    }
  });

  // Add mentioned instances (skip if already added as active instance)
  // Mentioned instances are prioritized - no truncation
  mentionedInstanceIds.forEach((instanceId) => {
    if (activeInstance?.id !== instanceId) {
      const instance = instances.find((i) => i.id === instanceId);
      if (instance) {
        const instanceContext = buildInstanceContext(instance, true); // Prioritized
        contextInstances.push(instanceContext);
        
        // Include annotation image if available
        if (instance.type === 'annotate' && annotationExports[instanceId]) {
          annotationImages[instanceId] = annotationExports[instanceId];
        }
      }
    }
  });

  // Add instances from mentioned folders (with limit)
  mentionedFolderIds.forEach((folderId) => {
    const folder = folders.find((f) => f.id === folderId);
    if (folder) {
      // Add folder to context
      contextFolders.push({
        id: folder.id,
        name: folder.name,
        parentFolderId: folder.parentFolderId,
      });

      // Add instances in this folder (limit to MAX_INSTANCES_PER_FOLDER)
      const folderInstances = instances
        .filter((inst) => inst.folderId === folderId)
        .slice(0, MAX_INSTANCES_PER_FOLDER);
      
      folderInstances.forEach((instance) => {
        // Skip if already added
        if (
          activeInstance?.id !== instance.id &&
          !mentionedInstanceIds.has(instance.id)
        ) {
          const instanceContext = buildInstanceContext(instance, false); // Not prioritized
          contextInstances.push(instanceContext);
          
          // Include annotation image if available
          if (instance.type === 'annotate' && annotationExports[instance.id]) {
            annotationImages[instance.id] = annotationExports[instance.id];
          }
        }
      });
    }
  });

  return {
    instances: contextInstances,
    folders: contextFolders,
    annotationImages,
  };
}

/**
 * Build context instance from workspace instance
 * @param instance - The workspace instance
 * @param isPrioritized - If true, don't truncate (for active/mentioned instances)
 */
function buildInstanceContext(
  instance: WorkspaceInstance,
  isPrioritized: boolean = true
): WorkspaceContextInstance {
  const base: WorkspaceContextInstance = {
    id: instance.id,
    title: instance.title,
    type: instance.type,
    folderId: instance.folderId,
  };

  if (instance.type === 'text') {
    const content = instance.data.content || '';
    // Only truncate if not prioritized
    base.content = isPrioritized ? content : truncateText(content, MAX_TEXT_LENGTH);
  } else if (instance.type === 'code') {
    base.language = instance.data.language;
    const code = instance.data.code || '';
    // Only truncate if not prioritized
    base.code = isPrioritized ? code : truncateCode(code, MAX_CODE_LINES);
  }

  return base;
}

