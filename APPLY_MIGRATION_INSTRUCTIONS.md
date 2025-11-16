# How to Apply the PDF Instance Migration

The database needs to be updated to allow 'pdf' instance types. Please apply it manually using the Supabase SQL Editor.

## Steps to Apply Migration

1. Go to your Supabase project dashboard: https://supabase.com/dashboard/project/hrflddtamoepasnlvfiw

2. Navigate to **SQL Editor** in the left sidebar

3. Click **New Query**

4. Copy and paste the following SQL:

```sql
-- Allow PDF instances
-- Extends the type constraint on instances.type to include 'pdf'

-- Drop the old constraint if it exists
ALTER TABLE instances DROP CONSTRAINT IF EXISTS instances_type_check;

-- Recreate constraint with pdf support
ALTER TABLE instances
  ADD CONSTRAINT instances_type_check
  CHECK (type IN ('text', 'code', 'annotate', 'pdf'));
```

5. Click **Run** or press `Ctrl/Cmd + Enter`

6. You should see a success message like "Success. No rows returned"

7. Done! You can now create PDF instances

## Method 2: Supabase CLI (Alternative)

If you have the Supabase CLI installed:

```bash
# Navigate to project root
cd /Users/aarushagarwal/Documents/Programming/BeelerDevs/Mimir-Private

# Apply all pending migrations
supabase db push
```

## Verification

After applying the migration, you can verify it worked by:

1. Starting your development server:
   ```bash
   cd frontend
   npm run dev
   ```

2. Navigate to the workspace page
3. Try creating a new PDF instance
4. Check the console logs - they should now show detailed debug information
5. The instance should be created successfully without errors

## What Changed

The migration file `supabase/migrations/003_enable_pdf_instances.sql` updates the `instances` table constraint to accept 'pdf' as a valid instance type, in addition to the existing 'text', 'code', and 'annotate' types.

