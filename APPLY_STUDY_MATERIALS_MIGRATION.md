# Apply Study Materials Migration

Quick guide to applying the study materials database migration.

## Prerequisites

- Supabase project configured
- Migrations 001-003 already applied
- Database connection credentials in `.env`

## Method 1: Supabase CLI (Recommended)

```bash
# From project root
supabase db push
```

This will automatically apply all pending migrations including `004_study_materials_system.sql`.

## Method 2: Manual Application via SQL Editor

1. Navigate to your Supabase project dashboard: https://app.supabase.com
2. Go to **SQL Editor** in the sidebar
3. Open `supabase/migrations/004_study_materials_system.sql`
4. Copy the entire contents
5. Paste into the SQL Editor
6. Click **Run** button
7. Verify success (should see "Success. No rows returned")

## Method 3: Using Node.js Migration Script

```bash
# From project root
node apply-migration-simple.mjs
```

When prompted, enter the path:
```
supabase/migrations/004_study_materials_system.sql
```

## Verification

After applying the migration, verify the tables exist:

```sql
-- Run in Supabase SQL Editor
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'study_materials',
  'summaries',
  'flashcard_sets',
  'flashcards',
  'flashcard_reviews',
  'quizzes',
  'quiz_questions',
  'quiz_attempts',
  'quiz_answers'
)
ORDER BY table_name;
```

You should see 9 rows returned with all the table names.

## Test the System

After migration, test the API:

```bash
# Start the backend
cd backend
uvicorn main:app --reload --port 8001

# In another terminal, start the frontend
cd frontend
npm run dev
```

Then test the endpoints:

```bash
# Generate flashcards (replace with actual instanceId and content)
curl -X POST http://localhost:3000/api/study-materials/flashcards \
  -H "Content-Type: application/json" \
  -d '{
    "instanceId": "your-instance-id",
    "pdfText": "Sample content for flashcard generation..."
  }'
```

## Troubleshooting

### "relation already exists" error

The migration has already been applied. You can verify by checking the tables exist (see Verification above).

### "permission denied" error

Ensure your Supabase service role key is correctly set in `.env`:
```
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### RLS policy errors

If you get RLS policy errors when testing, ensure:
1. User is authenticated before making requests
2. The user_id in the database matches the authenticated user

### Migration timeout

The migration is large. If it times out:
1. Split the file into smaller chunks
2. Apply table creation first, then indexes, then policies
3. Increase timeout limits in Supabase settings

## Next Steps

After successful migration:

1. Read the full documentation: `STUDY_MATERIALS_SYSTEM.md`
2. Review the API usage examples
3. Test the study materials generation in your application
4. Implement UI components that use the new APIs

## Need Help?

- Check `STUDY_MATERIALS_SYSTEM.md` for detailed documentation
- Review `frontend/lib/db/studyMaterials.ts` for available functions
- Examine the API routes in `frontend/app/api/study-materials/`
- Look at TypeScript types in `frontend/lib/types.ts`

