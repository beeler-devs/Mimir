# Mimir

**🏆 Winner of the CMU Claude Builder Hackathon**

We built Mimir, the all-in-one AI education and tutoring platform designed to facilitate deep understanding through custom visualizations, full context tutoring, and more.

Huge thanks to Anthropic for sponsoring the hackathon and setting us up with our prize of $1500 in Claude credits!

---

## 🚨 The Problem

We’re currently facing a learning pandemic, where students blindly input their work into LLMs and copy down the answers without engaging with the material in any way. Instead of a tool for growth, AI has become associated with bypassing the cognitive struggle that is needed for learning.

## 💡 The Solution

Mimir flips that narrative. It turns AI into a personalized tutor that helps students work through problems to develop fundamental understanding rather than quick results.

### Key Features

- **Tutor Mode**: An AI assistant with full workspace context that guides you through your problem live, just like a real teacher.
- **Generative Visual Engine**: Scripts and animates mathematical visualizations using Manim, deconstructing complex topics in a step-by-step video.
- **All-in-One Workspace**: Support for code, text, handwritten notes, and lecture videos.
- **Voice-Enabled Learning**: Interactive learning sessions for natural, conversational learning.

---

## 🏗️ Architecture

Mimir is built as a monorepo with three main components:

```
┌─────────────────┐
│   Next.js App   │  ← Frontend (React, Tailwind, TypeScript)
│   (Frontend)    │
└────────┬────────┘
         │
         ├─────────────────┐
         │                 │
┌────────▼────────┐  ┌────▼──────────┐
│    Supabase     │  │ Python Manim  │
│                 │  │    Worker     │
│ • Auth          │  │               │
│ • Database      │  │ • Rendering   │
│ • Storage       │  │ • PDF Export  │
│ • Edge Functions│  │               │
└─────────────────┘  └───────────────┘
```

### Tech Stack

- **Frontend**: Next.js 14+ (App Router), TypeScript, Tailwind CSS
- **UI Libraries**: Excalidraw (annotations), Monaco Editor (code editing), Lucide React (icons)
- **Backend**: Supabase (Auth, Postgres, Storage, Edge Functions)
- **AI**: Claude API (claude-haiku-4-5-20251001)
- **Animations**: Python + Manim + FastAPI worker

---

## 📊 Database Schema Outline

### `documents`
Stores user documents (text notes, code files, PDFs)
- `id` (uuid, primary key)
- `user_id` (uuid, foreign key)
- `type` (text | code | pdf)
- `storage_path` (text, Supabase Storage reference)
- `created_at` (timestamp)

### `chats`
Stores conversation threads
- `id` (uuid, primary key)
- `user_id` (uuid, foreign key)
- `root_message_id` (uuid, foreign key to chat_messages)
- `created_at` (timestamp)

### `chat_messages`
Stores individual chat messages with tree structure
- `id` (uuid, primary key)
- `chat_id` (uuid, foreign key)
- `parent_id` (uuid, nullable, self-referencing for tree structure)
- `role` (user | assistant)
- `content` (text)
- `created_at` (timestamp)

### `jobs`
Tracks async jobs (Manim rendering, PDF exports)
- `id` (uuid, primary key)
- `type` (manim | pdf_export)
- `status` (pending | processing | completed | failed)
- `payload` (jsonb, job configuration)
- `result_url` (text, nullable, Supabase Storage reference)
- `created_at` (timestamp)
- `updated_at` (timestamp)

---

## 🚀 Setup Instructions

### Prerequisites

- **Node.js** 18+ and npm/yarn
- **Python** 3.10+
- **Supabase CLI** (optional, for local development)
- **Claude API Key** from Anthropic
- **Supabase Account** (free tier works)

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL and API keys (found in Settings → API)
3. Copy `.env.example` to `.env` and fill in your Supabase credentials

### 2. Install Frontend Dependencies

```bash
cd frontend
npm install
```

### 3. Install Backend Dependencies

```bash
cd backend/manim_worker
pip install -r requirements.txt
```

### 4. Configure Environment Variables

Copy `.env.example` to `.env` in the root directory:

```bash
cp .env.example .env
```

Fill in all required values:
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key (keep secret!)
- `CLAUDE_API_KEY` - Your Claude API key from Anthropic
- `MANIM_WORKER_URL` - URL of the Manim worker (default: http://localhost:8001)

### 5. Run the Development Servers

**Terminal 1 - Frontend:**
```bash
cd frontend
npm run dev
```
The app will be available at [http://localhost:3000](http://localhost:3000)

**Terminal 2 - Manim Worker:**
```bash
cd backend/manim_worker
uvicorn main:app --reload --port 8001
```
The worker will be available at [http://localhost:8001](http://localhost:8001)

### 6. Deploy Supabase Edge Functions (Future)

```bash
# Login to Supabase CLI
supabase login

# Deploy functions
supabase functions deploy chat
supabase functions deploy voice
supabase functions deploy papers
supabase functions deploy annotate
```

---

## 💻 Development Workflow

### Main Tabs

**Text Tab** (`/text`)
- Rich text editor for notes, essays, and problem sets
- Select text and send to AI for explanations or guidance
- Stepwise problem-solving assistance

**Code Tab** (`/code`)
- Monaco code editor with syntax highlighting
- Language selector (Python, JavaScript, etc.)
- Run button (stubbed) and "Ask AI" for code help

**Annotate Tab** (`/annotate`)
- PDF upload and viewing
- Excalidraw canvas overlay for drawing/annotations
- Pen tool, eraser, shapes
- Export to annotated PDF

### AI Interaction

**Chat Panel**
- Right-side collapsible panel
- Send messages to Claude AI
- Conversation branching: each message can spawn a new thread
- Tree view shows all branches and lets you navigate between them

**Voice Assistant** (Stub)
- Floating microphone button
- Will support voice-to-text → AI → text-to-speech

**Manim Animations** (Future)
- Request visual explanations for math/quant concepts
- Worker renders Manim video
- Video displayed inline in chat

---

## 🗺️ Future Roadmap

- [ ] **Authentication**: User accounts and document persistence
- [ ] **Real-time Collaboration**: Multiple users editing same document
- [ ] **Advanced RAG**: Vector search for research papers and lecture notes
- [ ] **Enhanced Voice**: Full STT/TTS pipeline with Whisper
- [ ] **Mobile Support**: Responsive design and PWA
- [ ] **Manim Gallery**: Library of pre-rendered animations
- [ ] **LaTeX Support**: Native math equation rendering
- [ ] **Code Execution**: Safe sandboxed code running
- [ ] **Export Options**: PDF reports, study guides

---

## 📁 Project Structure

```
mimir/
├── frontend/                 # Next.js application
│   ├── app/                 # App router pages
│   │   ├── layout.tsx       # Root layout
│   │   ├── page.tsx         # Home (redirects to /text)
│   │   ├── text/            # Text editor tab
│   │   ├── code/            # Code editor tab
│   │   ├── annotate/        # Annotation tab
│   │   └── api/             # API routes (stub)
│   ├── components/          # React components
│   │   ├── common/          # Reusable UI components
│   │   ├── layout/          # Layout components
│   │   ├── tabs/            # Tab-specific components
│   │   └── ai/              # AI panel components
│   ├── lib/                 # Utilities and clients
│   │   ├── supabaseClient.ts
│   │   ├── types.ts
│   │   └── chatState.ts
│   └── public/              # Static assets
│
├── backend/                  # Python services
│   └── manim_worker/        # Manim rendering worker
│       ├── main.py          # FastAPI app
│       ├── manim_service.py # Rendering logic
│       ├── models.py        # Pydantic models
│       └── requirements.txt
│
├── supabase/                 # Supabase configuration
│   ├── migrations/          # Database migrations
│   └── functions/           # Edge Functions
│       ├── chat/            # Chat endpoint
│       ├── voice/           # Voice assistant
│       ├── papers/          # Paper processing
│       └── annotate/        # Annotation export
│
├── .env.example             # Environment variables template
├── .gitignore
└── README.md
```

---

## 🤝 Contributing

This is a hackathon/educational project. Contributions welcome!

---

## 📄 License

MIT License - feel free to use this for educational purposes.

---

Built with ❤️ for students who want to truly understand, not just memorize.
