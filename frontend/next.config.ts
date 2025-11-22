import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Externalize packages for server-side rendering (works with both Webpack and Turbopack)
  serverExternalPackages: ['pdfjs-dist', 'canvas', 'pyodide'],
  
  // Experimental features for large body handling
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb', // Allow large file uploads
    },
  },
  
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
