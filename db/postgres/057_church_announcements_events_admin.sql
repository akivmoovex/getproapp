-- GetPro Church — branch announcements/events admin fields (Phase 8).
-- Idempotent: safe at startup via ensureChurchSchema.

-- Announcements: extend columns
ALTER TABLE public.church_announcements
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'General';

ALTER TABLE public.church_announcements
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'members';

ALTER TABLE public.church_announcements
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'branch';

ALTER TABLE public.church_announcements
  ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ;

ALTER TABLE public.church_announcements
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE public.church_announcements
  ADD COLUMN IF NOT EXISTS created_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL;

ALTER TABLE public.church_announcements
  ADD COLUMN IF NOT EXISTS updated_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL;

UPDATE public.church_announcements
SET publish_at = published_at
WHERE publish_at IS NULL AND published_at IS NOT NULL;

UPDATE public.church_announcements
SET publish_at = created_at
WHERE publish_at IS NULL AND status = 'published';

ALTER TABLE public.church_announcements
  DROP CONSTRAINT IF EXISTS church_announcements_status_check;

ALTER TABLE public.church_announcements
  ADD CONSTRAINT church_announcements_status_check CHECK (status IN ('draft', 'published', 'archived'));

ALTER TABLE public.church_announcements
  DROP CONSTRAINT IF EXISTS church_announcements_audience_check;

ALTER TABLE public.church_announcements
  ADD CONSTRAINT church_announcements_audience_check CHECK (
    audience IN ('public', 'members', 'leaders', 'specific_ministry')
  );

CREATE INDEX IF NOT EXISTS idx_church_announcements_branch_status
  ON public.church_announcements (branch_id, status);

-- Events: extend columns
ALTER TABLE public.church_events
  ADD COLUMN IF NOT EXISTS start_time TEXT NOT NULL DEFAULT '';

ALTER TABLE public.church_events
  ADD COLUMN IF NOT EXISTS end_time TEXT NOT NULL DEFAULT '';

ALTER TABLE public.church_events
  ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '';

ALTER TABLE public.church_events
  ADD COLUMN IF NOT EXISTS ministry_or_department TEXT;

ALTER TABLE public.church_events
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'members';

ALTER TABLE public.church_events
  ADD COLUMN IF NOT EXISTS created_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL;

ALTER TABLE public.church_events
  ADD COLUMN IF NOT EXISTS updated_by_admin_id INTEGER REFERENCES public.church_branch_admins (id) ON DELETE SET NULL;

UPDATE public.church_events
SET start_time = event_time
WHERE start_time = '' AND event_time <> '';

UPDATE public.church_events
SET location = location_text
WHERE location = '' AND location_text <> '';

ALTER TABLE public.church_events
  DROP CONSTRAINT IF EXISTS church_events_status_check;

ALTER TABLE public.church_events
  ADD CONSTRAINT church_events_status_check CHECK (status IN ('draft', 'published', 'cancelled'));

ALTER TABLE public.church_events
  DROP CONSTRAINT IF EXISTS church_events_visibility_check;

ALTER TABLE public.church_events
  ADD CONSTRAINT church_events_visibility_check CHECK (
    visibility IN ('public', 'members', 'leaders')
  );

CREATE INDEX IF NOT EXISTS idx_church_events_branch_status
  ON public.church_events (branch_id, status);
