-- Hostname routing registry.
-- Deployments, organizations, products, and domains are separate concepts.
-- deployment_id references platform.deployments.deployment_code (TEXT PK).
-- Hostnames are stored normalized: lowercase, trimmed, no trailing dot.
-- Protocol, path, port, and internal whitespace are rejected.

CREATE TABLE IF NOT EXISTS platform.domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  product_id UUID NOT NULL
    REFERENCES platform.products (id)
    ON DELETE RESTRICT,
  deployment_id TEXT NULL
    REFERENCES platform.deployments (deployment_code)
    ON DELETE RESTRICT,
  hostname TEXT NOT NULL,
  domain_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  is_primary BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT domains_hostname_unique UNIQUE (hostname),
  CONSTRAINT domains_domain_type_check
    CHECK (domain_type IN ('canonical', 'custom', 'alias', 'apex')),
  CONSTRAINT domains_status_check
    CHECK (status IN ('active', 'inactive', 'retired')),
  CONSTRAINT domains_hostname_no_protocol
    CHECK (hostname !~* '://'),
  CONSTRAINT domains_hostname_no_path
    CHECK (hostname !~ '/'),
  CONSTRAINT domains_hostname_no_port
    CHECK (hostname !~ ':'),
  CONSTRAINT domains_hostname_no_whitespace
    CHECK (hostname !~ '[[:space:]]'),
  CONSTRAINT domains_hostname_no_trailing_dot
    CHECK (hostname !~ '\.$'),
  CONSTRAINT domains_hostname_format
    CHECK (
      hostname ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
      AND char_length(hostname) BETWEEN 1 AND 253
    )
);

CREATE INDEX IF NOT EXISTS domains_organization_id_idx
  ON platform.domains (organization_id);

CREATE INDEX IF NOT EXISTS domains_product_id_idx
  ON platform.domains (product_id);

CREATE INDEX IF NOT EXISTS domains_deployment_id_idx
  ON platform.domains (deployment_id);

CREATE OR REPLACE FUNCTION platform.normalize_domain_hostname()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  raw TEXT;
  normalized TEXT;
BEGIN
  raw := COALESCE(NEW.hostname, '');
  -- Reject protocol / path / port / any whitespace before normalization.
  IF raw ~* '://' OR raw ~ '/' OR raw ~ ':' OR raw ~ '[[:space:]]' THEN
    RAISE EXCEPTION 'platform.domains.hostname must not include protocol, path, port, or whitespace: %', raw
      USING ERRCODE = 'check_violation';
  END IF;

  normalized := lower(btrim(raw));
  WHILE right(normalized, 1) = '.' LOOP
    normalized := left(normalized, length(normalized) - 1);
  END LOOP;

  IF normalized = '' THEN
    RAISE EXCEPTION 'platform.domains.hostname must not be empty after normalization'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.hostname := normalized;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS domains_normalize_hostname ON platform.domains;
CREATE TRIGGER domains_normalize_hostname
  BEFORE INSERT OR UPDATE OF hostname ON platform.domains
  FOR EACH ROW
  EXECUTE FUNCTION platform.normalize_domain_hostname();
