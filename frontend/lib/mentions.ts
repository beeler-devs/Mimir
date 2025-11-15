import { Mention, WorkspaceInstance, Folder, MentionableItem } from '@/lib/types';

/**
 * Parse @ mentions from text
 * Finds all @ mentions in format @instance-name or @folder-name
 */
export function parseMentions(text: string): Mention[] {
  const mentionRegex = /@([\w\s-]+)/g;
  const mentions: Mention[] = [];
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    const name = match[1].trim();
    if (name) {
      // We'll resolve the type and id later when we have instances/folders
      mentions.push({
        type: 'instance', // Default, will be resolved
        id: '', // Will be resolved
        name,
      });
    }
  }

  return mentions;
}

/**
 * Calculate similarity between two strings (simple Levenshtein-like)
 * Returns a score between 0 and 1, where 1 is exact match
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  // Exact match
  if (s1 === s2) return 1;
  
  // One contains the other
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  
  // Calculate character overlap
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  let matches = 0;
  
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }
  
  return matches / longer.length;
}

/**
 * Resolve mentions to actual instances/folders
 * Matches mention names to instances and folders with fuzzy matching
 * Returns resolved mentions, with unresolved ones marked (id will be empty)
 */
export function resolveMentions(
  mentions: Mention[],
  instances: WorkspaceInstance[],
  folders: Folder[]
): Mention[] {
  return mentions.map((mention) => {
    const mentionLower = mention.name.toLowerCase();
    
    // First, try exact match (case-insensitive)
    let instance = instances.find(
      (inst) => inst.title.toLowerCase() === mentionLower
    );
    
    if (instance) {
      return {
        type: 'instance' as const,
        id: instance.id,
        name: instance.title,
      };
    }
    
    let folder = folders.find(
      (f) => f.name.toLowerCase() === mentionLower
    );
    
    if (folder) {
      return {
        type: 'folder' as const,
        id: folder.id,
        name: folder.name,
      };
    }
    
    // If no exact match, try fuzzy matching
    // For instances: prefer exact substring matches, then fuzzy
    const instanceMatches = instances
      .map((inst) => ({
        instance: inst,
        similarity: calculateSimilarity(mention.name, inst.title),
      }))
      .filter((m) => m.similarity > 0.5)
      .sort((a, b) => b.similarity - a.similarity);
    
    if (instanceMatches.length > 0) {
      // If multiple matches with same similarity, prefer the first one alphabetically
      const bestMatch = instanceMatches[0];
      if (bestMatch.similarity >= 0.7) {
        return {
          type: 'instance' as const,
          id: bestMatch.instance.id,
          name: bestMatch.instance.title,
        };
      }
    }
    
    // Try fuzzy matching for folders
    const folderMatches = folders
      .map((f) => ({
        folder: f,
        similarity: calculateSimilarity(mention.name, f.name),
      }))
      .filter((m) => m.similarity > 0.5)
      .sort((a, b) => b.similarity - a.similarity);
    
    if (folderMatches.length > 0) {
      const bestMatch = folderMatches[0];
      if (bestMatch.similarity >= 0.7) {
        return {
          type: 'folder' as const,
          id: bestMatch.folder.id,
          name: bestMatch.folder.name,
        };
      }
    }
    
    // Return unresolved mention (id will be empty string)
    // Log warning but don't block
    console.warn(`Could not resolve mention: @${mention.name}`);
    return {
      type: mention.type,
      id: '', // Empty id indicates unresolved
      name: mention.name,
    };
  });
}

/**
 * Find mentionable items (instances and folders) matching a query
 * Used for autocomplete dropdown
 * Handles duplicate names by showing all matches
 */
export function findMentionableItems(
  instances: WorkspaceInstance[],
  folders: Folder[],
  query: string
): MentionableItem[] {
  const lowerQuery = query.toLowerCase();
  const items: MentionableItem[] = [];

  // Add matching instances (includes partial matches)
  instances.forEach((instance) => {
    const titleLower = instance.title.toLowerCase();
    if (titleLower.includes(lowerQuery) || lowerQuery === '') {
      items.push({
        type: 'instance',
        id: instance.id,
        name: instance.title,
        icon: instance.type === 'text' ? 'FileText' : instance.type === 'code' ? 'Code2' : 'PenTool',
      });
    }
  });

  // Add matching folders
  folders.forEach((folder) => {
    const nameLower = folder.name.toLowerCase();
    if (nameLower.includes(lowerQuery) || lowerQuery === '') {
      items.push({
        type: 'folder',
        id: folder.id,
        name: folder.name,
        icon: 'Folder',
      });
    }
  });

  // Sort: exact matches first, then instances before folders, then alphabetically
  return items.sort((a, b) => {
    const aExact = a.name.toLowerCase().startsWith(lowerQuery);
    const bExact = b.name.toLowerCase().startsWith(lowerQuery);
    
    // Exact matches first
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    
    // Then by type (instances before folders)
    if (a.type !== b.type) {
      return a.type === 'instance' ? -1 : 1;
    }
    
    // Finally alphabetically
    return a.name.localeCompare(b.name);
  });
}

/**
 * Remove @ mentions from text, keeping only the clean message
 */
export function removeMentionsFromText(text: string): string {
  return text.replace(/@[\w\s-]+/g, '').trim();
}

