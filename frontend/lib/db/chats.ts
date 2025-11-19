import { supabase } from '@/lib/supabaseClient';
import { ChatNode, AnimationSuggestion, PdfAttachment, Attachment } from '@/lib/types';

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
  attachments: Attachment[] | null;
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
  return (data || []).map((msg) => {
    const attachments = msg.attachments || [];
    const pdfAttachments = attachments.filter((att: Attachment): att is PdfAttachment => att.type === 'pdf');
    
    return {
      id: msg.id,
      parentId: msg.parent_id,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      createdAt: msg.created_at,
      suggestedAnimation: msg.suggested_animation,
      attachments: attachments.length > 0 ? attachments : undefined,
      pdfAttachments: pdfAttachments.length > 0 ? pdfAttachments : undefined,
    };
  });
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
    pdfAttachments?: PdfAttachment[]; // Backwards compatibility
    attachments?: Attachment[]; // New unified format
  }
): Promise<ChatNode> {
  // Convert pdfAttachments to unified attachments format if provided
  let finalAttachments: Attachment[] | null = null;
  
  if (message.attachments && message.attachments.length > 0) {
    finalAttachments = message.attachments;
  } else if (message.pdfAttachments && message.pdfAttachments.length > 0) {
    // Convert old format to new format
    finalAttachments = message.pdfAttachments.map(pdf => ({
      ...pdf,
      type: 'pdf' as const,
    }));
  }

  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      chat_id: chatId,
      parent_id: message.parentId,
      role: message.role,
      content: message.content,
      suggested_animation: message.suggestedAnimation || null,
      attachments: finalAttachments,
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving chat message:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    console.error('Message payload:', { chatId, message });
    throw error;
  }

  // Convert database format to ChatNode format
  const attachments = data.attachments || [];
  const pdfAttachments = attachments.filter((att: Attachment): att is PdfAttachment => att.type === 'pdf');
  
  return {
    id: data.id,
    parentId: data.parent_id,
    role: data.role as 'user' | 'assistant',
    content: data.content,
    createdAt: data.created_at,
    suggestedAnimation: data.suggested_animation,
    attachments: attachments.length > 0 ? attachments : undefined,
    pdfAttachments: pdfAttachments.length > 0 ? pdfAttachments : undefined,
  };
}

/**
 * Generate a title from the first user message (simple fallback)
 */
export function generateChatTitle(firstMessage: string): string {
  // Take first 50 characters and add ellipsis if needed
  const maxLength = 50;
  const title = firstMessage.trim();
  return title.length > maxLength ? title.substring(0, maxLength) + '...' : title;
}

/**
 * Generate an AI-powered chat title from conversation messages
 */
export async function generateAIChatTitle(messages: { role: string; content: string }[]): Promise<string> {
  try {
    // Call the API route to generate title
    const response = await fetch('/api/chat/generate-title', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      console.error('Failed to generate AI title, using fallback');
      // Fallback to simple title generation
      return generateChatTitle(messages[0]?.content || 'New Chat');
    }

    const data = await response.json();
    return data.title || generateChatTitle(messages[0]?.content || 'New Chat');
  } catch (error) {
    console.error('Error generating AI chat title:', error);
    // Fallback to simple title generation
    return generateChatTitle(messages[0]?.content || 'New Chat');
  }
}

