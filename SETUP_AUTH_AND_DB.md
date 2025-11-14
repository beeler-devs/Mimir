# Authentication and Database Setup Guide

This guide will help you set up Google OAuth authentication and configure the Supabase database for Mimir.

## ✅ What Has Been Implemented

### 1. Database Schema
- **Migration file created**: `supabase/migrations/001_initial_schema.sql`
- Tables: `folders`, `instances`, `chats`, `chat_messages`
- Row Level Security (RLS) policies for all tables
- Automatic timestamp updates

### 2. Authentication System
- Google OAuth integration via Supabase Auth
- Auth context provider (`lib/auth/AuthContext.tsx`)
- Protected routes with automatic redirects
- Landing page at `/login` with sign-in button
- Auto-redirect to `/workspace` when authenticated

### 3. Chat Persistence
- All chat messages saved to database in real-time
- Tree-based conversation structure preserved
- Automatic chat title generation
- Chat history loads on mount

### 4. Instance & Folder Persistence
- Instances (text, code, annotate) saved to database
- Folder organization with tree structure
- Debounced autosave (2 seconds) for content changes
- Instant save for structural changes (rename, delete, language)

### 5. Folder UI
- Collapsible folder tree in sidebar
- Create/rename/delete folders
- Move instances between folders
- Nested folder support

## 🚀 Setup Instructions

### Step 1: Configure Supabase Project

1. **Go to your Supabase project dashboard**
   - Navigate to https://supabase.com/dashboard/project/YOUR_PROJECT_ID

2. **Run the migration**
   - Option A: Use Supabase CLI
     ```bash
     cd /Users/aarushagarwal/Documents/Programming/BeelerDevs/Mimir
     supabase db push
     ```
   
   - Option B: Manual SQL execution
     - Go to SQL Editor in Supabase dashboard
     - Copy contents of `supabase/migrations/001_initial_schema.sql`
     - Paste and execute

3. **Verify tables were created**
   - Go to Table Editor in Supabase dashboard
   - You should see: `folders`, `instances`, `chats`, `chat_messages`

### Step 2: Configure Google OAuth

1. **Enable Google Auth Provider in Supabase**
   - Go to Authentication → Providers
   - Enable "Google" provider
   - Note: You'll need to create a Google Cloud project if you haven't

2. **Set up Google Cloud Console**
   - Go to https://console.cloud.google.com/
   - Create a new project or select existing one
   - Enable Google+ API
   - Create OAuth 2.0 credentials (Web application)
   - Add authorized redirect URIs:
     ```
     https://YOUR_SUPABASE_PROJECT_REF.supabase.co/auth/v1/callback
     http://localhost:3000/workspace
     ```
   - Copy Client ID and Client Secret

3. **Add Google credentials to Supabase**
   - Return to Supabase Authentication → Providers → Google
   - Paste Client ID and Client Secret
   - Save changes

### Step 3: Configure Environment Variables

1. **Frontend environment variables**
   ```bash
   cd frontend
   cp env.example .env.local
   ```
   
   Edit `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
   CLAUDE_API_KEY=sk-ant-your-key-here
   MANIM_WORKER_URL=http://localhost:8001
   ```

2. **Backend environment variables** (for future use with Edge Functions)
   ```bash
   cd backend/manim_worker
   cp env.example .env
   ```
   
   Edit `.env`:
   ```env
   SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   SUPABASE_BUCKET_NAME=animations
   PORT=8001
   ```

### Step 4: Install Dependencies & Run

1. **Install frontend dependencies**
   ```bash
   cd frontend
   npm install
   ```

2. **Start the development server**
   ```bash
   npm run dev
   ```

3. **Open browser**
   - Navigate to http://localhost:3000
   - You should be redirected to `/login`
   - Click "Sign in with Google"
   - After authentication, you'll be redirected to `/workspace`

## 🧪 Testing the Implementation

### Test Authentication Flow
1. Visit http://localhost:3000
2. Should redirect to `/login` page
3. Click "Sign in with Google"
4. Complete Google OAuth flow
5. Should redirect to `/workspace` with your workspace loaded

### Test Chat Persistence
1. Send a message in the AI chat panel
2. Refresh the page
3. Chat history should persist and reload

### Test Instance Persistence
1. Create a new text/code/annotate instance
2. Add content to the instance
3. Refresh the page
4. Instance and content should persist

### Test Folder Organization
1. Click "Folder" button in sidebar
2. Create a new folder
3. Right-click instance to move to folder (UI for this needs drag-and-drop, currently just structure is in place)
4. Expand/collapse folders
5. Refresh page - folder structure should persist

## 🗂️ Database Structure

### Tables Overview

**folders**
- Stores folder hierarchy
- Can have parent folders (nested structure)
- Deleted folders cascade delete children

**instances**
- Stores workspace instances (text, code, annotate)
- Links to folders via `folder_id`
- Stores all instance data as JSONB

**chats**
- Stores chat sessions
- Auto-generates title from first message
- One-to-many with chat_messages

**chat_messages**
- Stores individual messages in tree structure
- `parent_id` enables conversation branching
- Stores suggested animations as JSONB

## 🔒 Security (RLS Policies)

All tables have Row Level Security enabled with policies that:
- Users can only view their own data
- Users can only create/update/delete their own data
- Policies use `auth.uid()` to enforce user boundaries

## 🐛 Troubleshooting

### "User not authenticated" errors
- Check that Supabase environment variables are correct
- Verify Google OAuth is properly configured
- Check browser console for auth errors

### Migration fails
- Ensure you have admin access to Supabase project
- Check SQL syntax in migration file
- Look for conflicts with existing tables

### Chat/instances not persisting
- Verify RLS policies are active
- Check browser console for database errors
- Ensure user is authenticated before operations

### Google Sign-In not working
- Verify authorized redirect URIs in Google Cloud Console
- Check Google OAuth credentials in Supabase
- Ensure Google+ API is enabled

## 📝 Next Steps

1. **Add sign-out functionality**: Already available via `signOut()` from `useAuth()` hook
2. **Implement chat switcher UI**: Display list of chats, allow switching between them
3. **Add drag-and-drop**: For moving instances between folders
4. **Implement Claude AI integration**: Update `/api/chat/route.ts` to call actual Claude API
5. **Add user profile page**: Display user info, manage account settings

## 🎉 Completed Features

✅ Google OAuth authentication  
✅ Protected routes with auto-redirect  
✅ Chat history persistence with tree structure  
✅ Instance persistence (text, code, annotate)  
✅ Folder organization with nesting  
✅ Real-time autosave with debouncing  
✅ Row Level Security on all tables  
✅ Type-safe database operations  

Your application is now fully set up with authentication and data persistence!

