-- Deployment registry for coexisting BlessBoard V4/V5 (and future apps).
-- Separate cookies, domains, and job ownership per row.

CREATE TABLE IF NOT EXISTS platform.deployments (
  deployment_code TEXT PRIMARY KEY,
  application_code TEXT NOT NULL,
  release_version TEXT NOT NULL,
  canonical_domain TEXT NOT NULL,
  environment_code TEXT NOT NULL,
  status TEXT NOT NULL,
  jobs_enabled BOOLEAN NOT NULL DEFAULT false,
  database_access_mode TEXT NOT NULL,
  session_cookie_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT deployments_application_code_check
    CHECK (application_code IN ('blessboard', 'getpro', 'ngo', 'platform')),
  CONSTRAINT deployments_environment_code_check
    CHECK (environment_code IN ('preproduction', 'shared', 'production', 'testing')),
  CONSTRAINT deployments_status_check
    CHECK (status IN ('active', 'inactive', 'retired')),
  CONSTRAINT deployments_database_access_mode_check
    CHECK (database_access_mode IN ('read_write', 'read_only')),
  CONSTRAINT deployments_canonical_domain_unique UNIQUE (canonical_domain),
  CONSTRAINT deployments_session_cookie_name_unique UNIQUE (session_cookie_name),
  CONSTRAINT deployments_deployment_code_len
    CHECK (char_length(deployment_code) BETWEEN 1 AND 64),
  CONSTRAINT deployments_canonical_domain_len
    CHECK (char_length(canonical_domain) BETWEEN 1 AND 253),
  CONSTRAINT deployments_session_cookie_name_len
    CHECK (char_length(session_cookie_name) BETWEEN 1 AND 64)
);

CREATE INDEX IF NOT EXISTS deployments_application_code_idx
  ON platform.deployments (application_code);
