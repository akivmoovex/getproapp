-- V2.03 Batch 1A: services pricing + practitioner profile/availability.
-- Additive / backward-safe. Does not remove or rename existing columns.
-- Clinical consent / invoices / appointments domain unchanged.

-- ---------------------------------------------------------------------------
-- Services: price, location, buffer (ops catalogue fields on service types)
-- ---------------------------------------------------------------------------
ALTER TABLE activeclinic.appointment_service_types
  ADD COLUMN IF NOT EXISTS amount_minor BIGINT NULL,
  ADD COLUMN IF NOT EXISTS currency_code TEXT NULL,
  ADD COLUMN IF NOT EXISTS follow_up_amount_minor BIGINT NULL,
  ADD COLUMN IF NOT EXISTS buffer_minutes INTEGER NULL,
  ADD COLUMN IF NOT EXISTS facility_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'appointment_service_types_amount_nonneg'
  ) THEN
    ALTER TABLE activeclinic.appointment_service_types
      ADD CONSTRAINT appointment_service_types_amount_nonneg
      CHECK (amount_minor IS NULL OR amount_minor >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'appointment_service_types_follow_up_nonneg'
  ) THEN
    ALTER TABLE activeclinic.appointment_service_types
      ADD CONSTRAINT appointment_service_types_follow_up_nonneg
      CHECK (follow_up_amount_minor IS NULL OR follow_up_amount_minor >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'appointment_service_types_currency_len'
  ) THEN
    ALTER TABLE activeclinic.appointment_service_types
      ADD CONSTRAINT appointment_service_types_currency_len
      CHECK (currency_code IS NULL OR char_length(currency_code) = 3);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'appointment_service_types_buffer_range'
  ) THEN
    ALTER TABLE activeclinic.appointment_service_types
      ADD CONSTRAINT appointment_service_types_buffer_range
      CHECK (buffer_minutes IS NULL OR buffer_minutes BETWEEN 0 AND 120);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'appointment_service_types_facility_fk'
  ) THEN
    ALTER TABLE activeclinic.appointment_service_types
      ADD CONSTRAINT appointment_service_types_facility_fk
      FOREIGN KEY (facility_id, healthcare_organization_id)
      REFERENCES activeclinic.facilities (id, healthcare_organization_id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN activeclinic.appointment_service_types.amount_minor IS
  'Optional consultation fee in minor currency units (e.g. ngwee). Null = no ops price set.';

-- Service ↔ practitioner assignments (does not grant application RBAC)
CREATE TABLE IF NOT EXISTS activeclinic.service_staff_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  service_type_id UUID NOT NULL,
  staff_member_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT service_staff_assignments_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT service_staff_assignments_service_fk
    FOREIGN KEY (service_type_id, healthcare_organization_id)
    REFERENCES activeclinic.appointment_service_types (id, healthcare_organization_id)
    ON DELETE CASCADE,
  CONSTRAINT service_staff_assignments_staff_fk
    FOREIGN KEY (staff_member_id, healthcare_organization_id)
    REFERENCES activeclinic.staff_members (id, healthcare_organization_id)
    ON DELETE CASCADE,
  CONSTRAINT service_staff_assignments_unique
    UNIQUE (service_type_id, staff_member_id),
  CONSTRAINT service_staff_assignments_status_check
    CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX IF NOT EXISTS service_staff_assignments_service_idx
  ON activeclinic.service_staff_assignments (service_type_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS service_staff_assignments_staff_idx
  ON activeclinic.service_staff_assignments (staff_member_id)
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- Practitioners: credentials / specialties / public booking (profile only)
-- ---------------------------------------------------------------------------
ALTER TABLE activeclinic.staff_members
  ADD COLUMN IF NOT EXISTS credentials_text TEXT NULL,
  ADD COLUMN IF NOT EXISTS license_number TEXT NULL,
  ADD COLUMN IF NOT EXISTS specialties_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS public_bookable BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'staff_members_credentials_len'
  ) THEN
    ALTER TABLE activeclinic.staff_members
      ADD CONSTRAINT staff_members_credentials_len
      CHECK (credentials_text IS NULL OR char_length(credentials_text) BETWEEN 1 AND 500);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'staff_members_license_number_len'
  ) THEN
    ALTER TABLE activeclinic.staff_members
      ADD CONSTRAINT staff_members_license_number_len
      CHECK (license_number IS NULL OR char_length(license_number) BETWEEN 1 AND 80);
  END IF;
END $$;

COMMENT ON COLUMN activeclinic.staff_members.public_bookable IS
  'Public self-scheduling visibility for this practitioner profile. Does NOT grant application RBAC.';

-- Weekly availability template (day_of_week 0=Sunday .. 6=Saturday)
CREATE TABLE IF NOT EXISTS activeclinic.staff_weekly_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  staff_member_id UUID NOT NULL,
  facility_id UUID NULL,
  day_of_week SMALLINT NOT NULL,
  starts_at_local TIME NOT NULL,
  ends_at_local TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_weekly_availability_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT staff_weekly_availability_staff_fk
    FOREIGN KEY (staff_member_id, healthcare_organization_id)
    REFERENCES activeclinic.staff_members (id, healthcare_organization_id)
    ON DELETE CASCADE,
  CONSTRAINT staff_weekly_availability_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE SET NULL,
  CONSTRAINT staff_weekly_availability_dow_check
    CHECK (day_of_week BETWEEN 0 AND 6),
  CONSTRAINT staff_weekly_availability_time_check
    CHECK (starts_at_local < ends_at_local),
  CONSTRAINT staff_weekly_availability_status_check
    CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX IF NOT EXISTS staff_weekly_availability_staff_idx
  ON activeclinic.staff_weekly_availability (staff_member_id, day_of_week)
  WHERE status = 'active';

-- Leave / blocked periods
CREATE TABLE IF NOT EXISTS activeclinic.staff_availability_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  staff_member_id UUID NOT NULL,
  facility_id UUID NULL,
  block_kind TEXT NOT NULL DEFAULT 'leave',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by_staff_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_availability_blocks_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT staff_availability_blocks_staff_fk
    FOREIGN KEY (staff_member_id, healthcare_organization_id)
    REFERENCES activeclinic.staff_members (id, healthcare_organization_id)
    ON DELETE CASCADE,
  CONSTRAINT staff_availability_blocks_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE SET NULL,
  CONSTRAINT staff_availability_blocks_created_by_fk
    FOREIGN KEY (created_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE SET NULL,
  CONSTRAINT staff_availability_blocks_kind_check
    CHECK (block_kind IN ('leave', 'blocked', 'training', 'other')),
  CONSTRAINT staff_availability_blocks_range_check
    CHECK (starts_at < ends_at),
  CONSTRAINT staff_availability_blocks_reason_len
    CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 300),
  CONSTRAINT staff_availability_blocks_status_check
    CHECK (status IN ('active', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS staff_availability_blocks_staff_range_idx
  ON activeclinic.staff_availability_blocks (staff_member_id, starts_at, ends_at)
  WHERE status = 'active';
