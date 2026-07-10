-- Phase F: in-app broadcast delivery analytics helpers
-- Attachment download counts (member downloads only; not external delivery).

ALTER TABLE public.church_hq_broadcast_attachments
  ADD COLUMN IF NOT EXISTS download_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.church_hq_broadcast_attachments
  DROP CONSTRAINT IF EXISTS church_hq_broadcast_attachments_download_count_check;

ALTER TABLE public.church_hq_broadcast_attachments
  ADD CONSTRAINT church_hq_broadcast_attachments_download_count_check
  CHECK (download_count >= 0);
