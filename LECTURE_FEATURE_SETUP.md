# Lecture Instance Feature - Setup Guide

This guide covers all the Supabase and backend changes needed to get the lecture instance feature fully working.

## 1. Database Migration ✅

**Status:** Migration file created at `supabase/migrations/005_enable_lecture_instances.sql`

**To Apply:**

```bash
# Option 1: Using Supabase CLI
cd /home/user/Mimir-Private
supabase db push

# Option 2: Manual via Supabase Dashboard
# Go to SQL Editor and run:
```

```sql
ALTER TABLE instances DROP CONSTRAINT IF EXISTS instances_type_check;
ALTER TABLE instances ADD CONSTRAINT instances_type_check
  CHECK (type IN ('text', 'code', 'annotate', 'pdf', 'lecture'));
```

## 2. Supabase Storage Configuration

### Verify Storage Bucket Exists

1. Go to **Supabase Dashboard → Storage**
2. Ensure the `documents` bucket exists
3. Make it **public** or configure RLS policies

### Storage Policies (Recommended)

```sql
-- Allow users to upload to their own folders
CREATE POLICY "Users can upload to their own lecture folders"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to read from their own folders
CREATE POLICY "Users can read their own lecture files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own files
CREATE POLICY "Users can delete their own lecture files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);
```

### Storage Structure

Files will be organized as:
```
documents/
├── {userId}/
│   ├── pdfs/              # PDF documents
│   ├── lectures/
│   │   ├── audio/         # Recorded audio
│   │   ├── videos/        # Uploaded videos
│   │   └── slides/        # PDF slides (reuses PDF upload)
```

## 3. Backend API Endpoints ✅

**Status:** Template endpoints created with mock responses

### Created Endpoints:

1. **`/api/lecture/youtube-transcript`** - Fetch YouTube transcripts
2. **`/api/lecture/transcribe-audio`** - Transcribe audio recordings
3. **`/api/lecture/upload-video`** - Upload and transcribe videos

### To Implement Real Functionality:

#### A. YouTube Transcript Fetching

**Option 1: youtube-transcript package** (Recommended for simple use)

```bash
npm install youtube-transcript
```

```typescript
// In /api/lecture/youtube-transcript/route.ts
import { YoutubeTranscript } from 'youtube-transcript';

const transcriptData = await YoutubeTranscript.fetchTranscript(youtubeId);
const segments = transcriptData.map(item => ({
  text: item.text,
  timestamp: item.offset / 1000,
  duration: item.duration / 1000
}));
```

**Option 2: YouTube Data API v3** (Official, requires API key)

```bash
# Set environment variable
YOUTUBE_API_KEY=your_api_key_here
```

```typescript
// Fetch captions using YouTube Data API
const response = await fetch(
  `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${youtubeId}&key=${process.env.YOUTUBE_API_KEY}`
);
```

#### B. Audio Transcription

**Option 1: OpenAI Whisper API** (Recommended - high accuracy)

```bash
npm install openai
```

```bash
# Add to .env
OPENAI_API_KEY=your_openai_api_key
```

```typescript
// In /api/lecture/transcribe-audio/route.ts
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const transcription = await openai.audio.transcriptions.create({
  file: audioFile,
  model: 'whisper-1',
  response_format: 'verbose_json',
  timestamp_granularities: ['segment']
});

const segments = transcription.segments.map(seg => ({
  text: seg.text,
  timestamp: seg.start,
  duration: seg.end - seg.start
}));
```

**Pricing:** $0.006 per minute (~$0.36 per hour)

**Option 2: AssemblyAI** (Alternative)

```bash
npm install assemblyai
```

```bash
ASSEMBLYAI_API_KEY=your_assemblyai_api_key
```

**Option 3: Deepgram** (Real-time option)

```bash
npm install @deepgram/sdk
```

#### C. Video Transcription

**Recommended Approach:** Extract audio + Whisper

```bash
npm install fluent-ffmpeg @ffmpeg-installer/ffmpeg
```

```typescript
// In /api/lecture/upload-video/route.ts
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';

ffmpeg.setFfmpegPath(ffmpegPath.path);

// Extract audio from video
const extractAudio = (videoBuffer: Buffer): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    ffmpeg(Readable.from(videoBuffer))
      .toFormat('mp3')
      .on('data', (chunk) => chunks.push(chunk))
      .on('end', () => resolve(Buffer.concat(chunks)))
      .on('error', reject)
      .pipe();
  });
};

const audioBuffer = await extractAudio(buffer);

// Then use OpenAI Whisper on the audio
const audioFile = new File([audioBuffer], 'audio.mp3', { type: 'audio/mpeg' });
const transcription = await openai.audio.transcriptions.create({
  file: audioFile,
  model: 'whisper-1',
  response_format: 'verbose_json',
  timestamp_granularities: ['segment']
});
```

## 4. Environment Variables

Add these to your `.env` file:

```bash
# Existing variables (required)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# New for lecture feature (choose based on services you use)
OPENAI_API_KEY=your_openai_key          # For Whisper transcription
YOUTUBE_API_KEY=your_youtube_key        # For YouTube Data API (optional)
ASSEMBLYAI_API_KEY=your_assemblyai_key  # Alternative to Whisper (optional)
DEEPGRAM_API_KEY=your_deepgram_key      # Alternative transcription (optional)
```

## 5. Testing the Feature

### Test Workflow:

1. **Apply Database Migration**
   ```bash
   supabase db push
   ```

2. **Verify Storage Bucket**
   - Check that `documents` bucket exists and is public/has correct policies

3. **Start Development Server**
   ```bash
   cd frontend
   npm run dev
   ```

4. **Create a Lecture Instance**
   - Click "Create instance" in the sidebar
   - Select "Lecture" type
   - Name it and create

5. **Test Each Input Method:**

   **YouTube (currently returns mock data):**
   - Paste a YouTube URL
   - Click "Fetch Transcript"
   - Should show mock transcript

   **Audio Recording (currently returns mock data):**
   - Click "Start Recording"
   - Record some audio
   - Click "Stop Recording"
   - Should upload and show mock transcript

   **PDF Slides (uses existing PDF API):**
   - Click "Upload PDF"
   - Select a PDF file
   - Should upload successfully

   **Video Upload (currently returns mock data):**
   - Drag and drop or upload a .mp4/.mov file
   - Should upload and show mock transcript

6. **Test Study Tools**
   - After uploading content, try:
     - Chat about the lecture
     - Generate flashcards
     - Take a quiz
     - View summary

## 6. Production Checklist

Before deploying to production:

- [ ] Apply database migration to production Supabase
- [ ] Configure storage bucket and policies in production
- [ ] Implement real transcription (not mocks) in all 3 endpoints
- [ ] Add proper error handling and retries
- [ ] Set up environment variables in production (Vercel, etc.)
- [ ] Test with real YouTube videos, audio recordings, and video files
- [ ] Add rate limiting to prevent API abuse
- [ ] Consider adding queue system for long transcription jobs
- [ ] Add progress indicators for long-running operations
- [ ] Test file size limits and adjust as needed
- [ ] Add monitoring/logging for transcription failures

## 7. Cost Estimates

### OpenAI Whisper (per hour of audio/video):
- **Transcription:** ~$0.36/hour ($0.006/minute)
- **Average lecture (60 min):** $0.36
- **Recommended approach** due to accuracy and ease of use

### Storage (Supabase):
- Free tier: 1GB storage
- Pro: $0.021/GB/month
- **100 hours of video (compressed):** ~50-100GB = $1-2/month

### Bandwidth:
- Supabase Free: 2GB egress/month
- Supabase Pro: 50GB egress/month
- After that: $0.09/GB

## 8. Optional Enhancements

Consider adding these features later:

1. **Speaker Diarization** - Identify different speakers in lectures
2. **Auto-generated Notes** - Create structured notes from transcripts
3. **Timestamp Sync** - Click transcript text to jump to video timestamp
4. **Slide-to-Video Sync** - Sync PDF slides with video timestamps
5. **Search within Lecture** - Full-text search across all lectures
6. **Export Options** - Download transcripts as TXT, SRT, VTT
7. **Video Processing** - Compress videos, generate thumbnails
8. **Batch Processing** - Process multiple lectures at once

## Need Help?

- **Supabase Docs:** https://supabase.com/docs
- **OpenAI Whisper:** https://platform.openai.com/docs/guides/speech-to-text
- **YouTube Transcript:** https://github.com/Kakulukian/youtube-transcript
- **FFmpeg:** https://github.com/fluent-ffmpeg/node-fluent-ffmpeg

## Current Implementation Status

✅ **Completed:**
- Frontend UI for all 4 input methods
- LectureViewer component
- Study tools integration (chat, flashcards, quiz, summary)
- Database schema
- API endpoint templates
- File upload to Supabase Storage

⏳ **Pending (requires implementation):**
- YouTube transcript fetching (currently returns mock data)
- Audio transcription (currently returns mock data)
- Video transcription (currently returns mock data)
- Real-world testing with actual content

📝 **Note:** The feature is fully functional with mock data. Users can create lecture instances and use all study tools. You just need to implement the actual transcription services to replace the mock responses.
