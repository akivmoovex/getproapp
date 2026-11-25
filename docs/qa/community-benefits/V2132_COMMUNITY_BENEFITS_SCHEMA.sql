-- NOT APPLIED.
-- Reviewed schema for ActiveClinic Community Benefits.
-- Do not copy this file into db/migrations.
-- Do not execute it against getpro_v13_e2e_g78d2301 or any other database.

CREATE TABLE activeclinic.community_memberships (
  id uuid PRIMARY KEY,
  program_id text NOT NULL,
  person_id uuid NOT NULL,
  status text NOT NULL,
  identity_verified boolean NOT NULL DEFAULT false,
  consent_recorded boolean NOT NULL DEFAULT false,
  notice_version text NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (program_id, person_id)
);

CREATE TABLE activeclinic.clinic_acquisitions (
  id uuid PRIMARY KEY,
  person_id uuid NOT NULL,
  clinic_id uuid NOT NULL,
  state text NOT NULL,
  recorded_at timestamptz NOT NULL,
  actor_id text NOT NULL
);

CREATE TABLE activeclinic.community_introductions (
  id uuid PRIMARY KEY,
  person_id uuid NOT NULL,
  clinic_id uuid NOT NULL,
  source_type text NOT NULL,
  evidence_ref text NOT NULL UNIQUE,
  notice_version text NOT NULL,
  actor_id text NOT NULL,
  correlation_id text NOT NULL,
  recorded_at timestamptz NOT NULL
);

CREATE TABLE activeclinic.community_passes (
  id uuid PRIMARY KEY,
  person_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  fallback_code text NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL
);

CREATE TABLE activeclinic.community_patient_links (
  id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL,
  person_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  linked_at timestamptz NOT NULL,
  actor_id text NOT NULL,
  UNIQUE (clinic_id, person_id)
);

CREATE TABLE activeclinic.community_agreements (
  id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL,
  model text NOT NULL,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'INACTIVE',
  currency text NOT NULL,
  discount_bps integer NULL,
  contribution_bps integer NULL,
  effective_from timestamptz NULL,
  effective_to timestamptz NULL
);
