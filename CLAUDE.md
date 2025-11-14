# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mimir is an AI-native, college-level education platform serving as a personal AI professor for STEM students. It combines AI-powered tutoring with visual explanations for stepwise understanding of mathematics, computer science, probability, quantitative finance, physics, and more.

## Development Commands

### Frontend (Next.js)
```bash
cd frontend
npm install                # Install dependencies
npm run dev               # Start development server (http://localhost:3000)
npm run build             # Production build
npm run lint              # Run ESLint
```

### Backend (Manim Worker)
```bash
cd backend/manim_worker
pip install -r requirements.txt          # Install Python dependencies
uvicorn main:app --reload --port 8001   # Start development server (http://localhost:8001)
```

Note: Manim is currently commented out in requirements.txt and not fully integrated.

## Architecture

### Three-Component Monorepo Structure

1. **Frontend** (Next.js 14+ App Router)
   - TypeScript, React 19, Tailwind CSS 4
   - Key libraries: Monaco Editor (code editing), Excalidraw (annotations), Lucide React (icons)
   - Three main workspace types accessible via tabs: Text, Code, Annotate

2. **Supabase Backend**
   - Authentication, PostgreSQL database, Storage
   - Edge Functions (chat, voice, papers, annotate) - stub implementations

3. **Manim Worker** (Python FastAPI)
   - Renders mathematical animations (future feature, currently stubbed)
   - Runs on port 8001

### Key Architectural Patterns

**Conversation Branching with Tree Structure**
- Chat messages are stored as a tree, not a linear list
- Each message has a parent (except root), enabling conversation branching
- Users can explore multiple conversational paths from any message
- The `ChatNode` type and `chatState.ts` utilities manage this tree structure
- Active branch is determined by finding the path from root to current leaf node

**Workspace Instances System**
- Users work in "instances" (documents/workspaces), each with a type: text, code, or annotate
- Instance sidebar allows creating, renaming, deleting, and switching between instances
- Each instance has its own isolated workspace and chat context
- Types defined in `frontend/lib/types.ts`: `TextInstance`, `CodeInstance`, `AnnotateInstance`

**Client-Side State Management**
- Currently uses React hooks and local state (useState, useEffect)
- No global state library (Redux/Zustand) - state is component-local or passed via props
- Supabase client is initialized in `frontend/lib/supabaseClient.ts`

## Database Schema

### Core Tables

**documents**
- User documents (text notes, code files, PDFs)
- Fields: `id`, `user_id`, `type` (text|code|pdf), `storage_path`, `created_at`

**chats**
- Conversation threads
- Fields: `id`, `user_id`, `root_message_id`, `created_at`

**chat_messages**
- Individual chat messages with tree structure for branching
- Fields: `id`, `chat_id`, `parent_id` (nullable, self-referencing), `role` (user|assistant), `content`, `created_at`

**jobs**
- Async job tracking (Manim rendering, PDF exports)
- Fields: `id`, `type` (manim|pdf_export), `status` (pending|processing|completed|failed), `payload` (jsonb), `result_url`, `created_at`, `updated_at`

## Code Structure

### Frontend Organization

```
frontend/
├── app/                          # Next.js App Router pages
│   ├── text/page.tsx            # Text editor workspace
│   ├── code/page.tsx            # Code editor workspace
│   ├── annotate/page.tsx        # PDF annotation workspace
│   └── api/                     # API routes (stubs)
├── components/
│   ├── ai/                      # AI chat panel components
│   │   ├── AISidePanel.tsx     # Collapsible chat sidebar
│   │   ├── ChatTreeView.tsx    # Conversation branch visualization
│   │   ├── ChatMessageList.tsx # Message display
│   │   └── VoiceButton.tsx     # Voice assistant (stub)
│   ├── tabs/                    # Workspace-specific components
│   │   ├── TextEditor.tsx
│   │   ├── CodeEditor.tsx
│   │   └── AnnotateCanvas.tsx
│   ├── workspace/               # Instance management
│   │   ├── InstanceSidebar.tsx # Instance list and switcher
│   │   └── NewInstanceModal.tsx
│   ├── layout/                  # Layout components
│   └── common/                  # Reusable UI components
└── lib/
    ├── supabaseClient.ts        # Supabase client singleton
    ├── types.ts                 # TypeScript type definitions
    └── chatState.ts             # Chat tree utilities
```

### Backend Organization

```
backend/manim_worker/
├── main.py                # FastAPI app with /health and /render endpoints
├── manim_service.py       # Rendering logic (stub)
├── models.py              # Pydantic request/response models
└── requirements.txt

supabase/
├── functions/             # Edge Functions
│   ├── chat/             # AI chat endpoint
│   ├── voice/            # Voice assistant
│   ├── papers/           # PDF processing
│   └── annotate/         # Annotation export
└── migrations/           # Database migrations
```

## Important Implementation Details

### Chat Tree Navigation
- Use functions from `frontend/lib/chatState.ts`: `buildBranchPath()`, `getActiveBranch()`, `addMessage()`
- Always maintain parent-child relationships when adding messages
- Tree visualization uses recursive rendering in `ChatTreeView.tsx`

### Workspace Instance Management
- Each instance is a discriminated union type (`TextInstance | CodeInstance | AnnotateInstance`)
- Type discrimination via the `type` field
- Instance data structure varies by type (see `frontend/lib/types.ts`)

### Monaco Editor Integration
- Used in Code tab for syntax highlighting
- Language selection: Python, JavaScript, TypeScript, Java, C++
- Located in `frontend/components/tabs/CodeEditor.tsx`

### Excalidraw Integration
- Used in Annotate tab for PDF annotations
- Canvas overlay allows drawing on PDFs
- Located in `frontend/components/tabs/AnnotateCanvas.tsx`

## Environment Variables

Required environment variables (set in `.env` or `.env.local`):
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous/public key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-side only)
- `CLAUDE_API_KEY` - Anthropic Claude API key
- `MANIM_WORKER_URL` - Manim worker URL (default: http://localhost:8001)

Note: There is no `.env.example` file currently in the repository.

## Current Implementation Status

**Completed:**
- Frontend workspace UI with tabs (text, code, annotate)
- Monaco code editor with language selection
- Excalidraw PDF annotation canvas
- Chat UI with tree visualization
- Instance management (create, rename, delete, switch)
- Supabase client setup

**Stub/Future:**
- Supabase Edge Functions (chat, voice, papers, annotate endpoints)
- Manim rendering (worker skeleton exists but Manim package commented out)
- Voice assistant (UI exists, backend not implemented)
- Authentication (Supabase Auth configured but not integrated in UI)
- Database persistence (schema defined but CRUD operations not implemented)
- Real AI integration (Claude API key configured but not actively used)

## Design Patterns to Follow

1. **Keep components client-side** - Most components use `'use client'` directive since they involve interactivity
2. **Type safety** - All data structures are fully typed in `frontend/lib/types.ts`
3. **Tree-based chat** - Always think in terms of tree nodes and branches, not linear conversations
4. **Isolated instances** - Each workspace instance should be completely independent
5. **Modular components** - Break down complex UIs into focused, reusable components in appropriate directories
