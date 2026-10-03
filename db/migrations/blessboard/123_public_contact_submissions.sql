-- V2.05 — Tenant public contact submissions for BlessBoard V5 Admin Console.
-- UUID-scoped (church/branch/organization). Classic public.church_public_contact_submissions
-- remains for legacy /branch/* hosts; V5 does not share that INTEGER model.

CREATE TABLE IF NOT EXISTS blessboard.public_contact_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  church_id UUID NOT NULL
    REFERENCES blessboard.churches (id)
    ON DELETE RESTRICT,
  branch_id UUID NOT NULL
    REFERENCES blessboard.branches (id)
    ON DELETE RESTRICT,
  full_name TEXT NOT NULL,
  email TEXT NULL,
  phone TEXT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  reviewed_by_user_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT public_contact_submissions_status_check
    CHECK (status IN ('new', 'read', 'resolved')),
  CONSTRAINT public_contact_submissions_full_name_len
    CHECK (char_length(full_name) BETWEEN 1 AND 200),
  CONSTRAINT public_contact_submissions_message_len
    CHECK (char_length(message) BETWEEN 1 AND 5000)
);

CREATE INDEX IF NOT EXISTS public_contact_submissions_org_created_idx
  ON blessboard.public_contact_submissions (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS public_contact_submissions_church_created_idx
  ON blessboard.public_contact_submissions (church_id, created_at DESC);

CREATE INDEX IF NOT EXISTS public_contact_submissions_branch_status_created_idx
  ON blessboard.public_contact_submissions (branch_id, status, created_at DESC);

COMMENT ON TABLE blessboard.public_contact_submissions IS
  'V2.05 BlessBoard tenant public contact form inbox. Scoped by organization/church/branch UUID. Never shared with platform-admin.';
