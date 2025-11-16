import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client with elevated privileges
 * Use ONLY in server-side contexts (API routes, server components)
 * Never expose service role key to the client
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn(
    'Warning: Missing Supabase service role configuration. ' +
    'Server-side features (like file uploads) may not work. ' +
    'Set SUPABASE_SERVICE_ROLE_KEY in your environment variables.'
  );
}

export const supabaseServer = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;
