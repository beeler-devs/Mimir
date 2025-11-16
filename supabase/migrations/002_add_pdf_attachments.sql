-- Add PDF attachments support to chat messages
-- Stores PDF attachment data as JSONB array

ALTER TABLE chat_messages
ADD COLUMN pdf_attachments JSONB;

-- Add comment to describe the column
COMMENT ON COLUMN chat_messages.pdf_attachments IS 'Array of PDF attachments with id, filename, extractedText, and status fields';

