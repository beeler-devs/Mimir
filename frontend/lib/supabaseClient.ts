import { createClient } from '@supabase/supabase-js';

// Supabase client configuration
// Support both NEXT_PUBLIC_ prefixed (standard Next.js) and non-prefixed versions
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  const missingVars = [];
  if (!supabaseUrl) missingVars.push('SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
  if (!supabaseAnonKey) missingVars.push('SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  
  throw new Error(
    `Missing required Supabase environment variables: ${missingVars.join(', ')}\n\n` +
    `Please add to your .env file in the frontend directory:\n` +
    `SUPABASE_URL=https://your-project.supabase.co\n` +
    `SUPABASE_ANON_KEY=your-anon-key-here\n\n` +
    `Note: For client-side access, Next.js requires NEXT_PUBLIC_ prefix.\n` +
    `If using non-prefixed names, ensure they're available at build time.`
  );
}

/**
 * Supabase client instance
 * Used for auth, database queries, and storage operations
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

