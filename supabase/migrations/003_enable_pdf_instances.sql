-- Allow PDF instances
-- Extends the type constraint on instances.type to include 'pdf'

-- Drop the old constraint if it exists
ALTER TABLE instances DROP CONSTRAINT IF EXISTS instances_type_check;

-- Recreate constraint with pdf support
ALTER TABLE instances
  ADD CONSTRAINT instances_type_check
  CHECK (type IN ('text', 'code', 'annotate', 'pdf'));
