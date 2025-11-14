# Supabase Configuration

This directory contains Supabase-related configuration, migrations, and edge functions.

## Structure

```
supabase/
├── migrations/           # Database migrations
└── functions/           # Edge Functions (Deno runtime)
    ├── chat/           # AI chat endpoint
    ├── voice/          # Voice assistant
    ├── papers/         # Paper/lecture processing
    └── annotate/       # Annotation export
```

## Edge Functions

### Setup

1. **Install Supabase CLI:**
```bash
brew install supabase/tap/supabase  # macOS
# or
npm install -g supabase
```

2. **Login to Supabase:**
```bash
supabase login
```

3. **Link to your project:**
```bash
supabase link --project-ref your-project-ref
```

### Local Development

Run functions locally:
```bash
supabase functions serve
```

Test a function:
```bash
curl -i --location --request POST 'http://localhost:54321/functions/v1/chat' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"messages":[{"role":"user","content":"Hello"}],"branchPath":[]}'
```

### Deployment

Deploy all functions:
```bash
supabase functions deploy
```

Deploy a specific function:
```bash
supabase functions deploy chat
```

### Environment Variables

Set secrets for your functions:
```bash
supabase secrets set CLAUDE_API_KEY=your-claude-api-key
supabase secrets set MANIM_WORKER_URL=https://your-worker-url.com
```

## Functions Overview

### chat
Handles AI chat requests using Claude API.
- **Endpoint:** `/functions/v1/chat`
- **Method:** POST
- **Request:** `{ messages: ChatMessage[], branchPath: string[] }`
- **Response:** `{ message: ChatMessage, nodeId: string }`

### voice
Handles voice transcription and text-to-speech.
- **Endpoint:** `/functions/v1/voice`
- **Method:** POST
- **Request:** Audio data (multipart/form-data)
- **Response:** `{ transcript: string, response: { text: string, audioUrl?: string } }`

### papers
Processes lecture slides and research papers.
- **Endpoint:** `/functions/v1/papers`
- **Method:** POST
- **Request:** `{ pdfUrl: string, type: "lecture" | "paper" }`
- **Response:** `{ outline: string[], sections: Section[], animationJobs: string[] }`

### annotate
Exports annotated PDFs.
- **Endpoint:** `/functions/v1/annotate`
- **Method:** POST
- **Request:** `{ pdfUrl: string, annotations: any[] }`
- **Response:** `{ success: boolean, annotatedPdfUrl: string, jobId: string }`

## Database Migrations

Create a new migration:
```bash
supabase migration new migration_name
```

Apply migrations locally:
```bash
supabase db reset
```

Push migrations to remote:
```bash
supabase db push
```

## Future Enhancements

- [ ] Implement actual Claude API integration
- [ ] Add authentication middleware
- [ ] Implement rate limiting
- [ ] Add request validation
- [ ] Implement actual PDF processing
- [ ] Add job queue for long-running tasks
- [ ] Implement caching strategy

