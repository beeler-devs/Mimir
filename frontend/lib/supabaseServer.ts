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
      global: {
        // Increase timeout for large file uploads (5 minutes)
        fetch: (url, options = {}) => {
          return fetch(url, {
            ...options,
            // @ts-ignore - signal timeout is supported but not in types
            signal: options.signal || AbortSignal.timeout(300000),
          });
        },
      },
    })
  : null;
