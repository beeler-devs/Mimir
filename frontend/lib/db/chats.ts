import { supabase } from '@/lib/supabaseClient';
import { ChatNode, AnimationSuggestion } from '@/lib/types';

/**
 * Chat database operations
 * Handles CRUD operations for chats and chat messages
 */

export interface Chat {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  chat_id: string;
  parent_id: string | null;
  role: 'user' | 'assistant';
  content: string;
  suggested_animation: AnimationSuggestion | null;
  created_at: string;
}

/**
 * Load all chats for the current user
 */
export async function loadUserChats(): Promise<Chat[]> {
  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error loading chats:', error);
    throw error;
  }

  return data || [];
}

/**
 * Create a new chat
 */
export async function createChat(title?: string): Promise<Chat> {
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    throw new Error('User not authenticated');
  }

  const { data, error } = await supabase
    .from('chats')
    .insert({
      user_id: user.id,
      title: title || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating chat:', error);
    throw error;
  }

  return data;
}

/**
 * Update chat title
 */
export async function updateChatTitle(chatId: string, title: string): Promise<void> {
  const { error } = await supabase
    .from('chats')
    .update({ title })
    .eq('id', chatId);

  if (error) {
    console.error('Error updating chat title:', error);
    throw error;
  }
}

/**
 * Delete a chat (cascade deletes all messages)
 */
export async function deleteChat(chatId: string): Promise<void> {
  const { error } = await supabase
    .from('chats')
    .delete()
    .eq('id', chatId);

  if (error) {
    console.error('Error deleting chat:', error);
    throw error;
  }
}

/**
 * Load all messages for a specific chat
 */
export async function loadChatMessages(chatId: string): Promise<ChatNode[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error loading chat messages:', error);
    throw error;
  }

  // Convert database format to ChatNode format
  return (data || []).map((msg) => ({
    id: msg.id,
    parentId: msg.parent_id,
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
    createdAt: msg.created_at,
    suggestedAnimation: msg.suggested_animation,
  }));
}

/**
 * Save a new chat message
 */
export async function saveChatMessage(
  chatId: string,
  message: {
    parentId: string | null;
    role: 'user' | 'assistant';
    content: string;
    suggestedAnimation?: AnimationSuggestion;
  }
): Promise<ChatNode> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      chat_id: chatId,
      parent_id: message.parentId,
      role: message.role,
      content: message.content,
      suggested_animation: message.suggestedAnimation || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving chat message:', error);
    throw error;
  }

  // Convert database format to ChatNode format
  return {
    id: data.id,
    parentId: data.parent_id,
    role: data.role as 'user' | 'assistant',
    content: data.content,
    createdAt: data.created_at,
    suggestedAnimation: data.suggested_animation,
  };
}

/**
 * Generate a title from the first user message
 */
export function generateChatTitle(firstMessage: string): string {
  // Take first 50 characters and add ellipsis if needed
  const maxLength = 50;
  const title = firstMessage.trim();
  return title.length > maxLength ? title.substring(0, maxLength) + '...' : title;
}

