import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  env: {
    // Expose non-prefixed Supabase variables to the client
    // This allows using SUPABASE_URL and SUPABASE_ANON_KEY instead of NEXT_PUBLIC_ versions
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    // Expose backend URL to the client
    NEXT_PUBLIC_MANIM_WORKER_URL: process.env.MANIM_WORKER_URL || process.env.NEXT_PUBLIC_MANIM_WORKER_URL,
  },
};

export default nextConfig;
