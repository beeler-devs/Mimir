# Mimir - Credentials Setup Guide

## Overview

Mimir requires credentials for three services:
1. **Supabase** - Database, storage, and authentication
2. **Claude API** - AI chat functionality
3. **Manim Worker** - Animation rendering service

## Required Services

### 1. Supabase Account (Free Tier Works!)

**What you need:**
- Project URL
- Anon/Public Key (for frontend)
- Service Role Key (for backend)
- Storage bucket named "animations"

**Setup Steps:**
1. Go to [supabase.com](https://supabase.com) and create an account
2. Click "New Project"
3. Fill in project details (name, database password, region)
4. Wait ~2 minutes for provisioning
5. Navigate to **Settings** → **API**
6. Copy your credentials:
   - **URL**: `https://xxxxx.supabase.co`
   - **anon public**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - **service_role**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

**Storage Bucket Setup:**
1. In Supabase, go to **Storage** (left sidebar)
2. Click **Create a new bucket**
3. Name: `animations`
4. Public: **Yes** (toggle on)
5. Click **Create bucket**

### 2. Claude API Account

**What you need:**
- API Key from Anthropic

**Setup Steps:**
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up or sign in
3. Navigate to **API Keys**
4. Click **Create Key**
5. Name it (e.g., "Mimir Development")
6. Copy the key (starts with `sk-ant-...`)

⚠️ **Important**: Claude API is paid. You'll need to add credits ($5-$10 minimum).
The project uses `claude-haiku-4-5-20251001` which is very cost-effective (~$0.25 per million input tokens).

### 3. Local Development (No Credentials Needed)

The Manim Worker runs locally on your machine:
- No API keys required
- Runs on `http://localhost:8001`
- Just needs Python dependencies installed

---

## Environment Files Setup

### Frontend: `frontend/.env.local`

```bash
# Supabase (Public keys - safe for browser)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Claude AI API Key (Server-side only - KEEP SECRET!)
CLAUDE_API_KEY=sk-ant-your-key-here

# Manim Worker
MANIM_WORKER_URL=http://localhost:8001
```

**How to fill in:**
1. Open Supabase project → Settings → API
2. Copy **URL** and **anon public** key
3. Go to Anthropic Console → API Keys
4. Copy your Claude API key
5. Paste all into the file

⚠️ **Important:** `CLAUDE_API_KEY` does NOT have the `NEXT_PUBLIC_` prefix, so it stays server-side only and is never exposed to the browser.

### Backend: `backend/manim_worker/.env`

```bash
# Supabase (Service Role - KEEP SECRET!)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_BUCKET_NAME=animations

# Server
PORT=8001
```

**How to fill in:**
1. Same Supabase project
2. Go to Settings → API
3. Copy **URL** and **service_role** key
4. Paste into the file

⚠️ **Never commit `.env` files to Git!** They're already in `.gitignore`.

### Supabase Edge Functions (Optional)

If you plan to use Supabase Edge Functions instead of Next.js API routes, you can set the Claude API key there:

```bash
supabase secrets set CLAUDE_API_KEY=sk-ant-...your-key-here
```

**Note:** For local development, it's easier to just put the Claude key in your `frontend/.env.local` file and use Next.js API routes directly. You only need Edge Functions if you're deploying them to production.

---

## Verification Checklist

Use this checklist to verify everything is set up:

### ✅ Supabase Setup
- [ ] Created Supabase account
- [ ] Created new project
- [ ] Copied Project URL
- [ ] Copied anon/public key
- [ ] Copied service_role key
- [ ] Created "animations" bucket
- [ ] Set bucket to Public

### ✅ Claude API Setup
- [ ] Created Anthropic account
- [ ] Generated API key
- [ ] Added credits to account ($5-$10)
- [ ] Copied API key

### ✅ Environment Files
- [ ] Created `frontend/.env.local`
- [ ] Filled in NEXT_PUBLIC_SUPABASE_URL
- [ ] Filled in NEXT_PUBLIC_SUPABASE_ANON_KEY
- [ ] Created `backend/manim_worker/.env`
- [ ] Filled in SUPABASE_URL
- [ ] Filled in SUPABASE_SERVICE_ROLE_KEY
- [ ] Verified SUPABASE_BUCKET_NAME is "animations"

### ✅ Test Connections
- [ ] Frontend can connect to Supabase
- [ ] Backend can connect to Supabase
- [ ] Backend can upload to storage bucket
- [ ] Chat function has Claude API key

---

## Testing Your Setup

### 1. Test Backend Supabase Connection

```bash
cd backend/manim_worker
python -c "
from supabase import create_client
import os
from dotenv import load_dotenv
load_dotenv()
client = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))
print('✅ Backend Supabase connection successful!')
"
```

### 2. Test Frontend Connection

Start the frontend:
```bash
cd frontend
npm run dev
```

Open browser console at `http://localhost:3000` - you should see no Supabase errors.

### 3. Test Manim Worker

```bash
cd backend/manim_worker
python main.py
```

In another terminal:
```bash
curl http://localhost:8001/health
```

Expected response:
```json
{"status":"ok","version":"0.2.0"}
```

### 4. Test Animation Upload

Create a test job:
```bash
curl -X POST http://localhost:8001/jobs \
  -H "Content-Type: application/json" \
  -d '{"description":"test animation","topic":"math"}'
```

This should return a job_id. After 30-60 seconds, check status:
```bash
curl http://localhost:8001/jobs/YOUR_JOB_ID
```

If successful, you'll see a `video_url` with a Supabase storage link.

---

## Troubleshooting

### "Supabase credentials not set" warning

**Problem**: Environment variables not loaded
**Solution**: 
- Verify `.env.local` and `.env` files exist
- Restart development servers
- Check for typos in variable names

### "Failed to upload to Supabase"

**Problem**: Service role key or bucket issue
**Solution**:
- Verify service_role key (not anon key)
- Check bucket exists and is named "animations"
- Verify bucket is set to Public
- Check Supabase Storage permissions

### "Claude API error" or 401 Unauthorized

**Problem**: Invalid or missing API key
**Solution**:
- Verify API key is correct
- Check you've added credits to your Anthropic account
- Ensure key has proper permissions

### Backend can't connect on port 8001

**Problem**: Port already in use
**Solution**:
```bash
# Find process using port 8001
lsof -i :8001

# Kill it or change PORT in .env
PORT=8002
```

---

## Cost Estimates

### Supabase
- **Free tier**: 500MB database, 1GB storage, 2GB bandwidth
- Perfect for development and small-scale usage

### Claude API
- **Haiku model**: ~$0.25 per 1M input tokens, ~$1.25 per 1M output tokens
- Typical chat: 500-1000 tokens (~$0.001 per message)
- $5 credit ≈ 5,000-10,000 messages

### Total
- Development: ~$5-$10 to get started
- Monthly (light use): $1-$5

---

## Security Best Practices

1. **Never commit credentials to Git**
   - `.env.local` and `.env` are in `.gitignore`
   - Double-check before committing

2. **Use service_role key only in backend**
   - This key has full access
   - Never expose in frontend code
   - Keep it server-side only

3. **Rotate keys periodically**
   - Regenerate API keys every few months
   - Update in Supabase dashboard

4. **Use environment variables in production**
   - Set via hosting platform (Vercel, Railway, etc.)
   - Never hardcode credentials

---

## Next Steps

Once credentials are set up:

1. **Start the backend:**
   ```bash
   cd backend/manim_worker
   python main.py
   ```

2. **Start the frontend:**
   ```bash
   cd frontend
   npm run dev
   ```

3. **Test the chat:**
   - Go to `http://localhost:3000`
   - Type a message in the AI panel
   - Try "visualize Brownian motion" to test animations

4. **Deploy (optional):**
   - Frontend: Vercel or Netlify
   - Backend: Railway, Render, or DigitalOcean
   - Edge Functions: `supabase functions deploy`

---

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Verify all credentials are correct
3. Check server logs for specific errors
4. Ensure all dependencies are installed

Happy coding! 🚀

