-- P20–P26: public website publication, clinic onboarding applications,
-- public booking requests, procedures, and privacy-safe booking lookup tokens.
-- Append-only. Does not alter prior migration checksums.

-- ---------------------------------------------------------------------------
-- Healthcare organization public website fields
-- ---------------------------------------------------------------------------
ALTER TABLE activeclinic.healthcare_organizations
  ADD COLUMN IF NOT EXISTS website_published BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_booking_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS website_tagline TEXT NULL,
  ADD COLUMN IF NOT EXISTS website_about TEXT NULL,
  ADD COLUMN IF NOT EXISTS website_logo_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS public_phone_display TEXT NULL,
  ADD COLUMN IF NOT EXISTS public_email_display TEXT NULL;

ALTER TABLE activeclinic.healthcare_organizations
  DROP CONSTRAINT IF EXISTS healthcare_organizations_website_tagline_len;
ALTER TABLE activeclinic.healthcare_organizations
  ADD CONSTRAINT healthcare_organizations_website_tagline_len
  CHECK (website_tagline IS NULL OR char_length(website_tagline) BETWEEN 1 AND 280);

ALTER TABLE activeclinic.healthcare_organizations
  DROP CONSTRAINT IF EXISTS healthcare_organizations_website_about_len;
ALTER TABLE activeclinic.healthcare_organizations
  ADD CONSTRAINT healthcare_organizations_website_about_len
  CHECK (website_about IS NULL OR char_length(website_about) BETWEEN 1 AND 8000);

ALTER TABLE activeclinic.healthcare_organizations
  DROP CONSTRAINT IF EXISTS healthcare_organizations_website_logo_url_len;
ALTER TABLE activeclinic.healthcare_organizations
  ADD CONSTRAINT healthcare_organizations_website_logo_url_len
  CHECK (website_logo_url IS NULL OR char_length(website_logo_url) BETWEEN 1 AND 500);

ALTER TABLE activeclinic.healthcare_organizations
  DROP CONSTRAINT IF EXISTS healthcare_organizations_public_phone_display_len;
ALTER TABLE activeclinic.healthcare_organizations
  ADD CONSTRAINT healthcare_organizations_public_phone_display_len
  CHECK (public_phone_display IS NULL OR char_length(public_phone_display) BETWEEN 1 AND 40);

ALTER TABLE activeclinic.healthcare_organizations
  DROP CONSTRAINT IF EXISTS healthcare_organizations_public_email_display_len;
ALTER TABLE activeclinic.healthcare_organizations
  ADD CONSTRAINT healthcare_organizations_public_email_display_len
  CHECK (public_email_display IS NULL OR char_length(public_email_display) BETWEEN 3 AND 254);

COMMENT ON COLUMN activeclinic.healthcare_organizations.website_published IS
  'When true and HCO/org/product active, tenant public pages may render.';

-- ---------------------------------------------------------------------------
-- Facility directory / hours
-- ---------------------------------------------------------------------------
ALTER TABLE activeclinic.facilities
  ADD COLUMN IF NOT EXISTS show_in_directory BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS public_hours_json JSONB NULL,
  ADD COLUMN IF NOT EXISTS website_published BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN activeclinic.facilities.show_in_directory IS
  'Facility may appear in public clinic directory cards.';
COMMENT ON COLUMN activeclinic.facilities.public_hours_json IS
  'Structured public hours only. Never invent hours in application code.';

-- ---------------------------------------------------------------------------
-- Staff public profile (P23 doctors — opt-in only)
-- ---------------------------------------------------------------------------
ALTER TABLE activeclinic.staff_members
  ADD COLUMN IF NOT EXISTS public_profile_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_display_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS public_title TEXT NULL,
  ADD COLUMN IF NOT EXISTS public_bio TEXT NULL,
  ADD COLUMN IF NOT EXISTS public_profile_key TEXT NULL;

ALTER TABLE activeclinic.staff_members
  DROP CONSTRAINT IF EXISTS staff_members_public_display_name_len;
ALTER TABLE activeclinic.staff_members
  ADD CONSTRAINT staff_members_public_display_name_len
  CHECK (public_display_name IS NULL OR char_length(public_display_name) BETWEEN 1 AND 200);

ALTER TABLE activeclinic.staff_members
  DROP CONSTRAINT IF EXISTS staff_members_public_title_len;
ALTER TABLE activeclinic.staff_members
  ADD CONSTRAINT staff_members_public_title_len
  CHECK (public_title IS NULL OR char_length(public_title) BETWEEN 1 AND 120);

ALTER TABLE activeclinic.staff_members
  DROP CONSTRAINT IF EXISTS staff_members_public_bio_len;
ALTER TABLE activeclinic.staff_members
  ADD CONSTRAINT staff_members_public_bio_len
  CHECK (public_bio IS NULL OR char_length(public_bio) BETWEEN 1 AND 2000);

ALTER TABLE activeclinic.staff_members
  DROP CONSTRAINT IF EXISTS staff_members_public_profile_key_format;
ALTER TABLE activeclinic.staff_members
  ADD CONSTRAINT staff_members_public_profile_key_format
  CHECK (
    public_profile_key IS NULL
    OR public_profile_key ~ '^[a-z][a-z0-9_-]{0,63}$'
  );

CREATE UNIQUE INDEX IF NOT EXISTS staff_members_hco_public_profile_key_uidx
  ON activeclinic.staff_members (healthcare_organization_id, public_profile_key)
  WHERE public_profile_key IS NOT NULL AND public_profile_enabled = true;

-- ---------------------------------------------------------------------------
-- Clinic registration applications (P21 onboarding — not auto-publish)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activeclinic.clinic_registration_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_number TEXT NOT NULL,
  clinic_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email_normalized TEXT NOT NULL,
  contact_email_display TEXT NOT NULL,
  contact_phone_normalized TEXT NOT NULL,
  contact_phone_display TEXT NOT NULL,
  province TEXT NULL,
  city TEXT NULL,
  country_code CHAR(2) NOT NULL DEFAULT 'ZM',
  notes TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review',
  duplicate_of_application_id UUID NULL
    REFERENCES activeclinic.clinic_registration_applications (id)
    ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ NULL,
  reviewed_by_platform_identity_id UUID NULL,
  CONSTRAINT clinic_registration_applications_number_unique UNIQUE (application_number),
  CONSTRAINT clinic_registration_applications_status_check
    CHECK (status IN ('pending_review', 'approved', 'rejected', 'withdrawn', 'duplicate')),
  CONSTRAINT clinic_registration_applications_clinic_name_len
    CHECK (char_length(clinic_name) BETWEEN 2 AND 200),
  CONSTRAINT clinic_registration_applications_contact_name_len
    CHECK (char_length(contact_name) BETWEEN 2 AND 120),
  CONSTRAINT clinic_registration_applications_notes_len
    CHECK (notes IS NULL OR char_length(notes) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS clinic_registration_applications_email_idx
  ON activeclinic.clinic_registration_applications (contact_email_normalized, created_at DESC);

CREATE INDEX IF NOT EXISTS clinic_registration_applications_status_idx
  ON activeclinic.clinic_registration_applications (status, created_at DESC);

COMMENT ON TABLE activeclinic.clinic_registration_applications IS
  'Public clinic onboarding applications. Never auto-publishes a clinic.';

-- ---------------------------------------------------------------------------
-- Public contact inquiries (P22)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activeclinic.public_contact_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NULL,
  sender_name TEXT NOT NULL,
  sender_email_normalized TEXT NOT NULL,
  sender_email_display TEXT NOT NULL,
  sender_phone_normalized TEXT NULL,
  sender_phone_display TEXT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT public_contact_inquiries_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT public_contact_inquiries_status_check
    CHECK (status IN ('received', 'reviewed', 'closed')),
  CONSTRAINT public_contact_inquiries_message_len
    CHECK (char_length(message) BETWEEN 1 AND 4000),
  CONSTRAINT public_contact_inquiries_sender_name_len
    CHECK (char_length(sender_name) BETWEEN 2 AND 120)
);

CREATE INDEX IF NOT EXISTS public_contact_inquiries_org_created_idx
  ON activeclinic.public_contact_inquiries (organization_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Public procedures (P25 catalogue — config, not clinical coding)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activeclinic.public_procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NULL,
  procedure_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  summary TEXT NULL,
  category TEXT NOT NULL DEFAULT 'procedure',
  referral_required BOOLEAN NOT NULL DEFAULT false,
  preparation_instructions TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  estimated_duration_minutes INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT public_procedures_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT public_procedures_hco_key_unique
    UNIQUE (healthcare_organization_id, procedure_key),
  CONSTRAINT public_procedures_key_format
    CHECK (procedure_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  CONSTRAINT public_procedures_category_check
    CHECK (category IN ('procedure', 'diagnostic', 'imaging', 'other')),
  CONSTRAINT public_procedures_status_check
    CHECK (status IN ('active', 'inactive', 'archived')),
  CONSTRAINT public_procedures_display_name_len
    CHECK (char_length(display_name) BETWEEN 1 AND 200),
  CONSTRAINT public_procedures_summary_len
    CHECK (summary IS NULL OR char_length(summary) BETWEEN 1 AND 2000),
  CONSTRAINT public_procedures_prep_len
    CHECK (
      preparation_instructions IS NULL
      OR char_length(preparation_instructions) BETWEEN 1 AND 4000
    )
);

CREATE INDEX IF NOT EXISTS public_procedures_hco_status_idx
  ON activeclinic.public_procedures (healthcare_organization_id, status);

COMMENT ON TABLE activeclinic.public_procedures IS
  'Public procedure/diagnostic catalogue for booking UX. Not a clinical order catalogue.';

-- ---------------------------------------------------------------------------
-- Public booking requests (P24–P26)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activeclinic.public_booking_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  request_number TEXT NOT NULL,
  booking_kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted_pending_confirmation',
  service_type_id UUID NULL,
  procedure_id UUID NULL,
  preferred_staff_id UUID NULL,
  patient_id UUID NULL,
  patient_first_name TEXT NOT NULL,
  patient_last_name TEXT NOT NULL,
  patient_phone_normalized TEXT NOT NULL,
  patient_phone_display TEXT NOT NULL,
  patient_email_normalized TEXT NULL,
  patient_email_display TEXT NULL,
  visit_reason TEXT NULL,
  preferred_starts_at TIMESTAMPTZ NULL,
  preferred_ends_at TIMESTAMPTZ NULL,
  timezone TEXT NOT NULL DEFAULT 'Africa/Lusaka',
  referral_status TEXT NOT NULL DEFAULT 'not_required',
  referral_notes TEXT NULL,
  preparation_acknowledged BOOLEAN NOT NULL DEFAULT false,
  appointment_id UUID NULL,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT public_booking_requests_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT public_booking_requests_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT public_booking_requests_request_number_unique UNIQUE (request_number),
  CONSTRAINT public_booking_requests_idempotency_unique UNIQUE (organization_id, idempotency_key),
  CONSTRAINT public_booking_requests_kind_check
    CHECK (booking_kind IN ('consultation', 'procedure')),
  CONSTRAINT public_booking_requests_status_check
    CHECK (
      status IN (
        'submitted_pending_confirmation',
        'confirmed',
        'cancelled',
        'expired',
        'unavailable',
        'reschedule_requested',
        'cancellation_requested',
        'completed',
        'no_show'
      )
    ),
  CONSTRAINT public_booking_requests_referral_status_check
    CHECK (
      referral_status IN (
        'not_required',
        'required_missing',
        'submitted_pending_review',
        'accepted',
        'rejected',
        'clinic_follow_up'
      )
    ),
  CONSTRAINT public_booking_requests_names_len
    CHECK (
      char_length(patient_first_name) BETWEEN 1 AND 80
      AND char_length(patient_last_name) BETWEEN 1 AND 80
    )
);

CREATE INDEX IF NOT EXISTS public_booking_requests_org_status_idx
  ON activeclinic.public_booking_requests (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS public_booking_requests_phone_idx
  ON activeclinic.public_booking_requests (organization_id, patient_phone_normalized);

COMMENT ON TABLE activeclinic.public_booking_requests IS
  'Public booking requests. submitted_pending_confirmation is not a confirmed appointment.';

-- ---------------------------------------------------------------------------
-- Opaque booking access tokens (P26) — hashed at rest
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activeclinic.public_booking_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  booking_request_id UUID NOT NULL
    REFERENCES activeclinic.public_booking_requests (id)
    ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ NULL,
  CONSTRAINT public_booking_access_tokens_hash_unique UNIQUE (token_hash),
  CONSTRAINT public_booking_access_tokens_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS public_booking_access_tokens_booking_idx
  ON activeclinic.public_booking_access_tokens (booking_request_id)
  WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- Appointment service types: public visibility flag
-- ---------------------------------------------------------------------------
ALTER TABLE activeclinic.appointment_service_types
  ADD COLUMN IF NOT EXISTS public_bookable BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_summary TEXT NULL;

ALTER TABLE activeclinic.appointment_service_types
  DROP CONSTRAINT IF EXISTS appointment_service_types_public_summary_len;
ALTER TABLE activeclinic.appointment_service_types
  ADD CONSTRAINT appointment_service_types_public_summary_len
  CHECK (public_summary IS NULL OR char_length(public_summary) BETWEEN 1 AND 1000);
