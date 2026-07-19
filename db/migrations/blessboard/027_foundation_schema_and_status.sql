-- Foundation schema + status consolidation (Phase 1).
-- Extends registration applications, adds organization onboarding + support contacts,
-- and reconciles Free-plan max_branches to 1 (HQ is a branch row with branch_type='hq').
-- Does not provision tenants, change registration HTTP handlers, or enable path routing.
-- Retains legacy applications.status for Phase 4 POST compatibility (pending|contacted|closed).

-- ---------------------------------------------------------------------------
-- A. Extend blessboard.platform_church_registration_applications
-- ---------------------------------------------------------------------------

ALTER TABLE blessboard.platform_church_registration_applications
  ADD COLUMN IF NOT EXISTS organization_id UUID NULL;

ALTER TABLE blessboard.platform_church_registration_applications
  ADD COLUMN IF NOT EXISTS application_status TEXT NULL;

ALTER TABLE blessboard.platform_church_registration_applications
  ADD COLUMN IF NOT EXISTS provisioning_status TEXT NULL;

ALTER TABLE blessboard.platform_church_registration_applications
  ADD COLUMN IF NOT EXISTS provisioning_started_at TIMESTAMPTZ NULL;

ALTER TABLE blessboard.platform_church_registration_applications
  ADD COLUMN IF NOT EXISTS provisioned_at TIMESTAMPTZ NULL;

ALTER TABLE blessboard.platform_church_registration_applications
  ADD COLUMN IF NOT EXISTS provisioning_failed_at TIMESTAMPTZ NULL;

ALTER TABLE blessboard.platform_church_registration_applications
  ADD COLUMN IF NOT EXISTS provisioning_error_code TEXT NULL;

ALTER TABLE blessboard.platform_church_registration_applications
  ADD COLUMN IF NOT EXISTS provisioning_error_detail TEXT NULL;

-- Safe deterministic backfill from legacy status (no organization_id exists yet).
-- pending|contacted → submitted + not_started
-- closed → closed + not_started (do not infer provisioned from notes)
DO $$
DECLARE
  ambiguous_count INT;
  linked_count INT;
BEGIN
  SELECT COUNT(*)::int INTO ambiguous_count
    FROM blessboard.platform_church_registration_applications
   WHERE status NOT IN ('pending', 'contacted', 'closed');

  IF ambiguous_count > 0 THEN
    RAISE EXCEPTION
      '027 foundation status backfill: % application row(s) have unexpected legacy status',
      ambiguous_count
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  SELECT COUNT(*)::int INTO linked_count
    FROM blessboard.platform_church_registration_applications
   WHERE organization_id IS NOT NULL;

  IF linked_count > 0 THEN
    RAISE NOTICE
      '027 foundation status: % application row(s) already have organization_id; those stay closed/provisioned if status was closed',
      linked_count;
  END IF;

  UPDATE blessboard.platform_church_registration_applications
     SET application_status = CASE
           WHEN organization_id IS NOT NULL AND status = 'closed' THEN 'closed'
           WHEN status IN ('pending', 'contacted') THEN 'submitted'
           WHEN status = 'closed' THEN 'closed'
           ELSE application_status
         END,
         provisioning_status = CASE
           WHEN organization_id IS NOT NULL AND status = 'closed' THEN 'provisioned'
           ELSE COALESCE(provisioning_status, 'not_started')
         END,
         provisioned_at = CASE
           WHEN organization_id IS NOT NULL
                AND status = 'closed'
                AND provisioned_at IS NULL THEN updated_at
           ELSE provisioned_at
         END,
         updated_at = updated_at
   WHERE application_status IS NULL
      OR provisioning_status IS NULL;
END $$;

ALTER TABLE blessboard.platform_church_registration_applications
  ALTER COLUMN application_status SET DEFAULT 'submitted';

ALTER TABLE blessboard.platform_church_registration_applications
  ALTER COLUMN provisioning_status SET DEFAULT 'not_started';

UPDATE blessboard.platform_church_registration_applications
   SET application_status = 'submitted'
 WHERE application_status IS NULL;

UPDATE blessboard.platform_church_registration_applications
   SET provisioning_status = 'not_started'
 WHERE provisioning_status IS NULL;

ALTER TABLE blessboard.platform_church_registration_applications
  ALTER COLUMN application_status SET NOT NULL;

ALTER TABLE blessboard.platform_church_registration_applications
  ALTER COLUMN provisioning_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'platform_church_reg_apps_organization_id_fkey'
       AND conrelid = 'blessboard.platform_church_registration_applications'::regclass
  ) THEN
    ALTER TABLE blessboard.platform_church_registration_applications
      ADD CONSTRAINT platform_church_reg_apps_organization_id_fkey
      FOREIGN KEY (organization_id)
      REFERENCES platform.organizations (id)
      ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE blessboard.platform_church_registration_applications
  DROP CONSTRAINT IF EXISTS platform_church_reg_apps_application_status_check;
ALTER TABLE blessboard.platform_church_registration_applications
  ADD CONSTRAINT platform_church_reg_apps_application_status_check
    CHECK (application_status IN (
      'submitted',
      'duplicate_review',
      'rejected',
      'cancelled',
      'closed'
    ));

ALTER TABLE blessboard.platform_church_registration_applications
  DROP CONSTRAINT IF EXISTS platform_church_reg_apps_provisioning_status_check;
ALTER TABLE blessboard.platform_church_registration_applications
  ADD CONSTRAINT platform_church_reg_apps_provisioning_status_check
    CHECK (provisioning_status IN (
      'not_started',
      'provisioning',
      'provisioned',
      'provisioning_failed'
    ));

ALTER TABLE blessboard.platform_church_registration_applications
  DROP CONSTRAINT IF EXISTS platform_church_reg_apps_provisioning_error_code_len;
ALTER TABLE blessboard.platform_church_registration_applications
  ADD CONSTRAINT platform_church_reg_apps_provisioning_error_code_len
    CHECK (
      provisioning_error_code IS NULL
      OR char_length(provisioning_error_code) BETWEEN 1 AND 120
    );

ALTER TABLE blessboard.platform_church_registration_applications
  DROP CONSTRAINT IF EXISTS platform_church_reg_apps_provisioning_error_detail_len;
ALTER TABLE blessboard.platform_church_registration_applications
  ADD CONSTRAINT platform_church_reg_apps_provisioning_error_detail_len
    CHECK (
      provisioning_error_detail IS NULL
      OR char_length(provisioning_error_detail) BETWEEN 1 AND 2000
    );

-- Consistency: provisioned requires FK + timestamp; failed/in-progress require timestamps.
-- application_status=closed does NOT imply provisioned (manual close allowed).
ALTER TABLE blessboard.platform_church_registration_applications
  DROP CONSTRAINT IF EXISTS platform_church_reg_apps_provisioned_consistency;
ALTER TABLE blessboard.platform_church_registration_applications
  ADD CONSTRAINT platform_church_reg_apps_provisioned_consistency
    CHECK (
      provisioning_status <> 'provisioned'
      OR (organization_id IS NOT NULL AND provisioned_at IS NOT NULL)
    );

ALTER TABLE blessboard.platform_church_registration_applications
  DROP CONSTRAINT IF EXISTS platform_church_reg_apps_failed_consistency;
ALTER TABLE blessboard.platform_church_registration_applications
  ADD CONSTRAINT platform_church_reg_apps_failed_consistency
    CHECK (
      provisioning_status <> 'provisioning_failed'
      OR provisioning_failed_at IS NOT NULL
    );

ALTER TABLE blessboard.platform_church_registration_applications
  DROP CONSTRAINT IF EXISTS platform_church_reg_apps_provisioning_consistency;
ALTER TABLE blessboard.platform_church_registration_applications
  ADD CONSTRAINT platform_church_reg_apps_provisioning_consistency
    CHECK (
      provisioning_status <> 'provisioning'
      OR provisioning_started_at IS NOT NULL
    );

CREATE INDEX IF NOT EXISTS platform_church_reg_apps_organization_id_idx
  ON blessboard.platform_church_registration_applications (organization_id)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS platform_church_reg_apps_application_status_created_idx
  ON blessboard.platform_church_registration_applications (application_status, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_church_reg_apps_provisioning_status_created_idx
  ON blessboard.platform_church_registration_applications (provisioning_status, created_at DESC);

-- Legacy status column + CHECK retained for current POST insert/idempotency until Phase 4.

-- ---------------------------------------------------------------------------
-- B. Organization onboarding (1:1 platform.organizations)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.organization_onboarding (
  organization_id UUID PRIMARY KEY
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  registration_application_id UUID NULL
    REFERENCES blessboard.platform_church_registration_applications (id)
    ON DELETE SET NULL,
  onboarding_status TEXT NOT NULL DEFAULT 'not_started',
  follow_up_status TEXT NOT NULL DEFAULT 'new',
  assigned_support_user_id UUID NULL
    REFERENCES blessboard.users (id)
    ON DELETE SET NULL,
  first_contacted_at TIMESTAMPTZ NULL,
  last_contacted_at TIMESTAMPTZ NULL,
  next_follow_up_at TIMESTAMPTZ NULL,
  onboarding_started_at TIMESTAMPTZ NULL,
  onboarding_completed_at TIMESTAMPTZ NULL,
  last_activity_at TIMESTAMPTZ NULL,
  -- Non-derivable checklist flags only (other checklist facts derived from real rows).
  preview_acknowledged BOOLEAN NOT NULL DEFAULT false,
  onboarding_dismissed BOOLEAN NOT NULL DEFAULT false,
  support_requested BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organization_onboarding_status_check
    CHECK (onboarding_status IN ('not_started', 'in_progress', 'completed', 'skipped')),
  CONSTRAINT organization_onboarding_follow_up_status_check
    CHECK (follow_up_status IN (
      'new',
      'call_pending',
      'contacted',
      'needs_help',
      'self_onboarding',
      'completed',
      'unreachable',
      'not_interested'
    )),
  CONSTRAINT organization_onboarding_updated_after_created
    CHECK (updated_at >= created_at),
  CONSTRAINT organization_onboarding_completed_after_started
    CHECK (
      onboarding_completed_at IS NULL
      OR onboarding_started_at IS NULL
      OR onboarding_completed_at >= onboarding_started_at
    ),
  CONSTRAINT organization_onboarding_last_contacted_after_first
    CHECK (
      last_contacted_at IS NULL
      OR first_contacted_at IS NULL
      OR last_contacted_at >= first_contacted_at
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_onboarding_registration_application_uidx
  ON blessboard.organization_onboarding (registration_application_id)
  WHERE registration_application_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS organization_onboarding_follow_up_status_idx
  ON blessboard.organization_onboarding (follow_up_status);

CREATE INDEX IF NOT EXISTS organization_onboarding_assigned_support_user_idx
  ON blessboard.organization_onboarding (assigned_support_user_id)
  WHERE assigned_support_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS organization_onboarding_next_follow_up_idx
  ON blessboard.organization_onboarding (next_follow_up_at)
  WHERE next_follow_up_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- C. Append-only support contact history
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS blessboard.organization_support_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  registration_application_id UUID NULL
    REFERENCES blessboard.platform_church_registration_applications (id)
    ON DELETE SET NULL,
  created_by_user_id UUID NOT NULL
    REFERENCES blessboard.users (id)
    ON DELETE RESTRICT,
  contact_method TEXT NOT NULL,
  outcome TEXT NOT NULL,
  note TEXT NOT NULL,
  contacted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_follow_up_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organization_support_contacts_method_check
    CHECK (contact_method IN ('phone', 'email', 'message', 'meeting', 'internal_note')),
  CONSTRAINT organization_support_contacts_outcome_check
    CHECK (outcome IN (
      'reached',
      'no_answer',
      'left_message',
      'scheduled',
      'declined',
      'completed',
      'other'
    )),
  CONSTRAINT organization_support_contacts_note_len
    CHECK (char_length(note) BETWEEN 1 AND 2000),
  CONSTRAINT organization_support_contacts_created_after_contacted
    CHECK (created_at >= contacted_at)
);

CREATE INDEX IF NOT EXISTS organization_support_contacts_org_contacted_idx
  ON blessboard.organization_support_contacts (organization_id, contacted_at DESC);

CREATE INDEX IF NOT EXISTS organization_support_contacts_application_idx
  ON blessboard.organization_support_contacts (registration_application_id, contacted_at DESC)
  WHERE registration_application_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS organization_support_contacts_next_follow_up_idx
  ON blessboard.organization_support_contacts (next_follow_up_at)
  WHERE next_follow_up_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- D. Free-plan max_branches reconciliation (HQ counts as one branch row)
-- ---------------------------------------------------------------------------

UPDATE platform.plan_features pf
   SET limit_value = 1,
       updated_at = now()
  FROM platform.plans p
 WHERE pf.plan_id = p.id
   AND p.product_key = 'blessboard'
   AND p.plan_key = 'free'
   AND pf.feature_key = 'max_branches'
   AND pf.feature_kind = 'limit'
   AND pf.limit_value IS DISTINCT FROM 1;
