-- NOT APPLIED.
-- Reviewed schema for ActiveClinic Community Benefits.
-- Do not copy this file into db/migrations.
-- Do not execute it against getpro_v13_e2e_g78d2301 or any other database.
-- This file has no DELETE FROM, DROP TABLE, or TRUNCATE.

CREATE TABLE IF NOT EXISTS activeclinic.community_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  program_id TEXT NOT NULL,
  person_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_consent',
  identity_verified BOOLEAN NOT NULL DEFAULT false,
  consent_recorded BOOLEAN NOT NULL DEFAULT false,
  notice_version TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, person_id),
  CONSTRAINT community_memberships_status
    CHECK (status IN ('pending_consent', 'active', 'suspended', 'revoked'))
);

CREATE TABLE IF NOT EXISTS activeclinic.clinic_acquisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  person_id UUID NOT NULL,
  clinic_id UUID NOT NULL,
  state TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id TEXT NOT NULL,
  CONSTRAINT clinic_acquisitions_state
    CHECK (state IN ('CLINIC_DIRECT', 'PLATFORM_INTRODUCED', 'CLINIC_EXITED'))
);

CREATE TABLE IF NOT EXISTS activeclinic.community_introductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  person_id UUID NOT NULL,
  clinic_id UUID NOT NULL,
  source_type TEXT NOT NULL,
  evidence_ref TEXT NOT NULL UNIQUE,
  notice_version TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT community_introductions_source
    CHECK (source_type = 'platform_introduction')
);

CREATE TABLE IF NOT EXISTS activeclinic.community_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  fallback_code TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS activeclinic.community_patient_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  clinic_id UUID NOT NULL,
  facility_id UUID NULL,
  person_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id TEXT NOT NULL,
  UNIQUE (clinic_id, person_id)
);

CREATE TABLE IF NOT EXISTS activeclinic.community_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  clinic_id UUID NOT NULL,
  model TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'INACTIVE',
  legal_approval TEXT NOT NULL DEFAULT 'unapproved',
  currency TEXT NOT NULL DEFAULT 'ZMW',
  discount_bps INTEGER NULL,
  contribution_bps INTEGER NULL,
  effective_from TIMESTAMPTZ NULL,
  effective_to TIMESTAMPTZ NULL,
  CONSTRAINT community_agreements_status
    CHECK (status IN ('INACTIVE', 'ACTIVE')),
  CONSTRAINT community_agreements_approval
    CHECK (status <> 'ACTIVE' OR legal_approval = 'approved'),
  CONSTRAINT community_agreements_discount
    CHECK (discount_bps IS NULL OR (discount_bps >= 0 AND discount_bps <= 10000)),
  CONSTRAINT community_agreements_contribution
    CHECK (contribution_bps IS NULL OR (contribution_bps >= 0 AND contribution_bps <= 10000))
);
