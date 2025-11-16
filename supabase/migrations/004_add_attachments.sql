-- Add attachments column to chat_messages table
-- Supports PDFs, images, and future attachment types

-- Add attachments column with JSONB type
ALTER TABLE chat_messages
ADD COLUMN attachments JSONB DEFAULT '[]'::jsonb;

-- Create index for better query performance on attachments
CREATE INDEX idx_chat_messages_attachments ON chat_messages USING gin(attachments);

-- Add comment explaining the structure
COMMENT ON COLUMN chat_messages.attachments IS 'Array of attachments (PDFs, images, etc.) in JSONB format. Structure: [{"type": "pdf|image", "id": "uuid", "filename": "...", "url": "...", ...}]';

