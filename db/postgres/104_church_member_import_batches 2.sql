-- Safe member CSV import: preview, conflict review, batch-traceable commit.
-- Idempotent via (organization_id, branch_id, batch_key). No auto-merge / no hard-delete.
-- Idempotent: safe at startup via ensureChurchSchema.

ALTER TABLE public.church_members
  ADD COLUMN IF NOT EXISTS import_batch_id BIGINT;

CREATE TABLE IF NOT EXISTS public.church_member_import_batches (
  id BIGSERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL
    REFERENCES public.church_organizations (id) ON DELETE CASCADE,
  branch_id INTEGER NOT NULL
    REFERENCES public.church_branches (id) ON DELETE CASCADE,
  platform_tenant_id TEXT,
  batch_key TEXT NOT NULL,
  content_sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'previewed',
  original_filename TEXT,
  stored_relpath TEXT,
  byte_size INTEGER NOT NULL DEFAULT 0,
  row_count INTEGER NOT NULL DEFAULT 0,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  impact_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_admin_id INTEGER,
  committed_by_admin_id INTEGER,
  committed_at TIMESTAMPTZ,
  reversed_by_admin_id INTEGER,
  reversed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_member_import_batches_status_check
    CHECK (status IN ('previewed', 'committed', 'reversed', 'cancelled', 'failed')),
  CONSTRAINT church_member_import_batches_batch_key_uniq
    UNIQUE (organization_id, branch_id, batch_key)
);

CREATE INDEX IF NOT EXISTS idx_church_member_import_batches_branch
  ON public.church_member_import_batches (branch_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.church_member_import_rows (
  id BIGSERIAL PRIMARY KEY,
  batch_id BIGINT NOT NULL
    REFERENCES public.church_member_import_batches (id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  disposition TEXT NOT NULL,
  proposed_status TEXT NOT NULL DEFAULT 'pending',
  review_decision TEXT NOT NULL DEFAULT 'skip',
  full_name TEXT,
  email_normalized TEXT,
  phone_normalized TEXT,
  phone_display TEXT,
  member_type_raw TEXT,
  admin_flag BOOLEAN NOT NULL DEFAULT false,
  ignored_tenant_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  field_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  match_member_id INTEGER
    REFERENCES public.church_members (id) ON DELETE SET NULL,
  match_status TEXT,
  match_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  commit_outcome TEXT,
  committed_member_id INTEGER
    REFERENCES public.church_members (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT church_member_import_rows_disposition_check
    CHECK (disposition IN (
      'ready',
      'invalid',
      'duplicate_in_file',
      'existing_match',
      'conflict',
      'over_limit',
      'admin_flag_only'
    )),
  CONSTRAINT church_member_import_rows_proposed_status_check
    CHECK (proposed_status IN ('pending', 'verified')),
  CONSTRAINT church_member_import_rows_decision_check
    CHECK (review_decision IN ('import', 'skip')),
  CONSTRAINT church_member_import_rows_batch_row_uniq
    UNIQUE (batch_id, row_number)
);

CREATE INDEX IF NOT EXISTS idx_church_member_import_rows_batch
  ON public.church_member_import_rows (batch_id, disposition);

ALTER TABLE public.church_members
  DROP CONSTRAINT IF EXISTS church_members_import_batch_id_fkey;

ALTER TABLE public.church_members
  ADD CONSTRAINT church_members_import_batch_id_fkey
    FOREIGN KEY (import_batch_id)
    REFERENCES public.church_member_import_batches (id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_church_members_import_batch_id
  ON public.church_members (import_batch_id)
  WHERE import_batch_id IS NOT NULL;
