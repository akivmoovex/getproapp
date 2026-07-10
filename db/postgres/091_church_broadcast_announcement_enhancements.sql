-- BlessBoard — HQ broadcast / member announcement Phase B schema (idempotent).
-- Safe defaults preserve existing drafts and published rows.
-- Compatible with a prior incomplete 091 apply (IF NOT EXISTS / DROP+ADD CHECK / data backfill).

-- ---------------------------------------------------------------------------
-- 1) Priority, pin/feature, action links on HQ broadcasts
-- ---------------------------------------------------------------------------
ALTER TABLE public.church_hq_broadcasts
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS action_url TEXT,
  ADD COLUMN IF NOT EXISTS action_label TEXT,
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS attachment_label TEXT;

-- Map legacy app value "high" → "important" before CHECK.
UPDATE public.church_hq_broadcasts
SET priority = 'important'
WHERE priority = 'high';

UPDATE public.church_hq_broadcasts
SET priority = 'normal'
WHERE priority IS NULL
   OR priority NOT IN ('normal', 'important', 'urgent', 'emergency');

ALTER TABLE public.church_hq_broadcasts
  DROP CONSTRAINT IF EXISTS church_hq_broadcasts_priority_check;

ALTER TABLE public.church_hq_broadcasts
  ADD CONSTRAINT church_hq_broadcasts_priority_check
  CHECK (priority IN ('normal', 'important', 'urgent', 'emergency'));

ALTER TABLE public.church_hq_broadcasts
  DROP CONSTRAINT IF EXISTS church_hq_broadcasts_action_link_check;

ALTER TABLE public.church_hq_broadcasts
  ADD CONSTRAINT church_hq_broadcasts_action_link_check
  CHECK (
    (action_url IS NULL AND action_label IS NULL)
    OR (
      action_url IS NOT NULL
      AND action_label IS NOT NULL
      AND btrim(action_url) <> ''
      AND btrim(action_label) <> ''
      AND (
        lower(action_url) LIKE 'http://%'
        OR lower(action_url) LIKE 'https://%'
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Same columns on branch announcements
-- ---------------------------------------------------------------------------
ALTER TABLE public.church_announcements
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS action_url TEXT,
  ADD COLUMN IF NOT EXISTS action_label TEXT,
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS attachment_label TEXT;

UPDATE public.church_announcements
SET priority = 'important'
WHERE priority = 'high';

UPDATE public.church_announcements
SET priority = 'normal'
WHERE priority IS NULL
   OR priority NOT IN ('normal', 'important', 'urgent', 'emergency');

ALTER TABLE public.church_announcements
  DROP CONSTRAINT IF EXISTS church_announcements_priority_check;

ALTER TABLE public.church_announcements
  ADD CONSTRAINT church_announcements_priority_check
  CHECK (priority IN ('normal', 'important', 'urgent', 'emergency'));

ALTER TABLE public.church_announcements
  DROP CONSTRAINT IF EXISTS church_announcements_action_link_check;

ALTER TABLE public.church_announcements
  ADD CONSTRAINT church_announcements_action_link_check
  CHECK (
    (action_url IS NULL AND action_label IS NULL)
    OR (
      action_url IS NOT NULL
      AND action_label IS NOT NULL
      AND btrim(action_url) <> ''
      AND btrim(action_label) <> ''
      AND (
        lower(action_url) LIKE 'http://%'
        OR lower(action_url) LIKE 'https://%'
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_church_hq_broadcasts_org_priority
  ON public.church_hq_broadcasts (
    organization_id,
    is_featured DESC,
    is_pinned DESC,
    priority,
    publish_at DESC NULLS LAST
  );

CREATE INDEX IF NOT EXISTS idx_church_announcements_branch_priority
  ON public.church_announcements (
    branch_id,
    is_featured DESC,
    is_pinned DESC,
    priority,
    publish_at DESC NULLS LAST
  );

-- ---------------------------------------------------------------------------
-- 3) File attachments (separate tables; relative storage path only — no absolute paths)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.church_hq_broadcast_attachments (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES public.church_organizations(id) ON DELETE CASCADE,
  broadcast_id BIGINT NOT NULL REFERENCES public.church_hq_broadcasts(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  created_by_hq_admin_id BIGINT REFERENCES public.church_hq_admins(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_hq_broadcast_attachments_file_size_check CHECK (file_size > 0 AND file_size <= 5242880),
  CONSTRAINT church_hq_broadcast_attachments_mime_check CHECK (
    mime_type IN (
      'application/pdf',
      'image/png',
      'image/jpeg',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_church_hq_broadcast_attachments_broadcast
  ON public.church_hq_broadcast_attachments (broadcast_id, id);

CREATE INDEX IF NOT EXISTS idx_church_hq_broadcast_attachments_org
  ON public.church_hq_broadcast_attachments (organization_id, broadcast_id);

CREATE TABLE IF NOT EXISTS public.church_announcement_attachments (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES public.church_organizations(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL REFERENCES public.church_branches(id) ON DELETE CASCADE,
  announcement_id INTEGER NOT NULL REFERENCES public.church_announcements(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  created_by_admin_id INTEGER REFERENCES public.church_branch_admins(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_announcement_attachments_file_size_check CHECK (file_size > 0 AND file_size <= 5242880),
  CONSTRAINT church_announcement_attachments_mime_check CHECK (
    mime_type IN (
      'application/pdf',
      'image/png',
      'image/jpeg',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_church_announcement_attachments_announcement
  ON public.church_announcement_attachments (announcement_id, id);

CREATE INDEX IF NOT EXISTS idx_church_announcement_attachments_branch
  ON public.church_announcement_attachments (branch_id, announcement_id);

-- ---------------------------------------------------------------------------
-- 4) Read / seen tracking (typed receipt table for HQ broadcasts + branch announcements)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.church_feed_item_reads (
  id BIGSERIAL PRIMARY KEY,
  organization_id BIGINT NOT NULL REFERENCES public.church_organizations(id) ON DELETE CASCADE,
  branch_id BIGINT NOT NULL REFERENCES public.church_branches(id) ON DELETE CASCADE,
  member_id BIGINT NOT NULL REFERENCES public.church_members(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id BIGINT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_feed_item_reads_source_type_check
    CHECK (source_type IN ('hq_broadcast', 'announcement')),
  UNIQUE (member_id, source_type, source_id)
);

-- Upgrade columns if an earlier incomplete 091 created a thinner table.
ALTER TABLE public.church_feed_item_reads
  ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Backfill from legacy single read_at column when present.
UPDATE public.church_feed_item_reads
SET first_seen_at = COALESCE(first_seen_at, read_at, now())
WHERE first_seen_at IS NULL;

UPDATE public.church_feed_item_reads
SET created_at = COALESCE(created_at, first_seen_at, read_at, now())
WHERE created_at IS NULL;

UPDATE public.church_feed_item_reads
SET updated_at = COALESCE(updated_at, read_at, first_seen_at, created_at, now())
WHERE updated_at IS NULL;

-- Ensure NOT NULL defaults after backfill (safe for empty and populated tables).
ALTER TABLE public.church_feed_item_reads
  ALTER COLUMN first_seen_at SET DEFAULT now(),
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

UPDATE public.church_feed_item_reads
SET first_seen_at = now()
WHERE first_seen_at IS NULL;

UPDATE public.church_feed_item_reads
SET created_at = now()
WHERE created_at IS NULL;

UPDATE public.church_feed_item_reads
SET updated_at = now()
WHERE updated_at IS NULL;

-- Legacy incomplete 091 used NOT NULL read_at; Phase B allows seen-without-read.
ALTER TABLE public.church_feed_item_reads
  ALTER COLUMN read_at DROP NOT NULL;

ALTER TABLE public.church_feed_item_reads
  ALTER COLUMN first_seen_at SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.church_feed_item_reads
  DROP CONSTRAINT IF EXISTS church_feed_item_reads_source_type_check;

ALTER TABLE public.church_feed_item_reads
  ADD CONSTRAINT church_feed_item_reads_source_type_check
  CHECK (source_type IN ('hq_broadcast', 'announcement'));

CREATE INDEX IF NOT EXISTS idx_church_feed_item_reads_source
  ON public.church_feed_item_reads (organization_id, source_type, source_id);

DROP INDEX IF EXISTS public.idx_church_feed_item_reads_member;

CREATE INDEX IF NOT EXISTS idx_church_feed_item_reads_member
  ON public.church_feed_item_reads (member_id, branch_id, (COALESCE(read_at, first_seen_at)) DESC);
