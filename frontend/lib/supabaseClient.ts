import { createClient } from '@supabase/supabase-js';

// Supabase client configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables are not set. Please configure .env file.');
}

/**
 * Supabase client instance
 * Used for auth, database queries, and storage operations
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

