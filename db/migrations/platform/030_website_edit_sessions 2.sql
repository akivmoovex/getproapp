-- Lightweight website edit sessions for AUTO_PUBLISH version batching.
-- Field saves still persist immediately. One open session amends one version.
-- Does not rewrite frozen (closed-session) versions. No public_pages writes.

CREATE TABLE IF NOT EXISTS platform.website_edit_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  instance_id UUID NOT NULL
    REFERENCES platform.website_instances (id)
    ON DELETE RESTRICT,
  editor_identity_id UUID NULL,
  status TEXT NOT NULL DEFAULT 'open',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ NULL,
  close_reason TEXT NULL,
  changed_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT website_edit_sessions_status_check
    CHECK (status IN ('open', 'closed')),
  CONSTRAINT website_edit_sessions_close_reason_len
    CHECK (close_reason IS NULL OR char_length(close_reason) BETWEEN 1 AND 64),
  CONSTRAINT website_edit_sessions_closed_shape
    CHECK (
      (status = 'open' AND closed_at IS NULL)
      OR (status = 'closed' AND closed_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS website_edit_sessions_open_editor_uidx
  ON platform.website_edit_sessions (
    instance_id,
    COALESCE(editor_identity_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS website_edit_sessions_instance_open_idx
  ON platform.website_edit_sessions (instance_id, last_activity_at DESC)
  WHERE status = 'open';

ALTER TABLE platform.website_versions
  ADD COLUMN IF NOT EXISTS edit_session_id UUID NULL
    REFERENCES platform.website_edit_sessions (id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS website_versions_edit_session_idx
  ON platform.website_versions (edit_session_id)
  WHERE edit_session_id IS NOT NULL;

COMMENT ON TABLE platform.website_edit_sessions IS
  'Editor-scoped website edit sessions. Live content updates per save; one version per session.';
