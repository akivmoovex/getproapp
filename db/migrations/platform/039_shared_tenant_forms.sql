-- Additive: shared Moovex tenant form builder (SH01–SH07).
-- Tenant-scoped CRUD, schema versioning, publication, and access-controlled submissions.
-- Clinical intake and executable validation rules are excluded at the application layer.
-- Idempotent. Does not migrate legacy blessboard.forms rows.

CREATE TABLE IF NOT EXISTS platform.tenant_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  product_code TEXT NOT NULL,
  form_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  schema_json JSONB NOT NULL DEFAULT '{"version":1,"fields":[]}'::jsonb,
  schema_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft',
  access_mode TEXT NOT NULL DEFAULT 'open_public',
  discoverable BOOLEAN NOT NULL DEFAULT false,
  public_token TEXT NOT NULL,
  published_at TIMESTAMPTZ NULL,
  unpublished_at TIMESTAMPTZ NULL,
  created_by_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE SET NULL,
  updated_by_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_forms_product_code_check
    CHECK (product_code IN ('blessboard', 'activeclinic')),
  CONSTRAINT tenant_forms_category_check
    CHECK (category IN ('general', 'feedback', 'registration', 'event', 'survey')),
  CONSTRAINT tenant_forms_status_check
    CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT tenant_forms_access_mode_check
    CHECK (access_mode IN ('open_public', 'email_token')),
  CONSTRAINT tenant_forms_schema_version_check
    CHECK (schema_version >= 1),
  CONSTRAINT tenant_forms_title_len
    CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT tenant_forms_description_len
    CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 5000),
  CONSTRAINT tenant_forms_form_key_format
    CHECK (form_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  CONSTRAINT tenant_forms_public_token_format
    CHECK (char_length(public_token) BETWEEN 16 AND 64),
  CONSTRAINT tenant_forms_published_consistency
    CHECK (
      (status = 'published' AND published_at IS NOT NULL)
      OR (status <> 'published')
    ),
  CONSTRAINT tenant_forms_updated_after_created
    CHECK (updated_at >= created_at),
  CONSTRAINT tenant_forms_org_product_key_unique
    UNIQUE (organization_id, product_code, form_key),
  CONSTRAINT tenant_forms_public_token_unique
    UNIQUE (public_token)
);

CREATE INDEX IF NOT EXISTS tenant_forms_org_product_status_idx
  ON platform.tenant_forms (organization_id, product_code, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS tenant_forms_org_discoverable_idx
  ON platform.tenant_forms (organization_id, product_code, discoverable)
  WHERE discoverable = true AND status = 'published';

CREATE TABLE IF NOT EXISTS platform.tenant_form_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL
    REFERENCES platform.tenant_forms (id)
    ON DELETE CASCADE,
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  schema_version INTEGER NOT NULL,
  schema_json JSONB NOT NULL,
  access_mode TEXT NOT NULL,
  title TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE SET NULL,
  CONSTRAINT tenant_form_versions_schema_version_check
    CHECK (schema_version >= 1),
  CONSTRAINT tenant_form_versions_access_mode_check
    CHECK (access_mode IN ('open_public', 'email_token')),
  CONSTRAINT tenant_form_versions_unique
    UNIQUE (form_id, schema_version)
);

CREATE INDEX IF NOT EXISTS tenant_form_versions_org_form_idx
  ON platform.tenant_form_versions (organization_id, form_id, schema_version DESC);

CREATE TABLE IF NOT EXISTS platform.tenant_form_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL
    REFERENCES platform.tenant_forms (id)
    ON DELETE CASCADE,
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  email_normalized TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NULL,
  used_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_by_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_form_access_tokens_email_len
    CHECK (char_length(email_normalized) BETWEEN 3 AND 320),
  CONSTRAINT tenant_form_access_tokens_hash_len
    CHECK (char_length(token_hash) = 64),
  CONSTRAINT tenant_form_access_tokens_unique_hash
    UNIQUE (token_hash),
  CONSTRAINT tenant_form_access_tokens_form_email_unique
    UNIQUE (form_id, email_normalized)
);

CREATE INDEX IF NOT EXISTS tenant_form_access_tokens_form_idx
  ON platform.tenant_form_access_tokens (form_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS platform.tenant_form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL
    REFERENCES platform.tenant_forms (id)
    ON DELETE RESTRICT,
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  product_code TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  answers_json JSONB NOT NULL,
  submitter_email TEXT NULL,
  access_token_id UUID NULL
    REFERENCES platform.tenant_form_access_tokens (id)
    ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tenant_form_submissions_product_code_check
    CHECK (product_code IN ('blessboard', 'activeclinic')),
  CONSTRAINT tenant_form_submissions_status_check
    CHECK (status IN ('submitted', 'archived')),
  CONSTRAINT tenant_form_submissions_schema_version_check
    CHECK (schema_version >= 1)
);

CREATE INDEX IF NOT EXISTS tenant_form_submissions_org_form_idx
  ON platform.tenant_form_submissions (organization_id, form_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS tenant_form_submissions_form_status_idx
  ON platform.tenant_form_submissions (form_id, status, submitted_at DESC);
