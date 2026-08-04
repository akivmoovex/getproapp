-- AC-V6-P27: Patient portal identity linking and audit.
-- Append-only. Does not alter prior migration checksums.

-- ---------------------------------------------------------------------------
-- Link patients to platform identities
-- ---------------------------------------------------------------------------
ALTER TABLE activeclinic.patients
  ADD COLUMN IF NOT EXISTS platform_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE SET NULL;

COMMENT ON COLUMN activeclinic.patients.platform_identity_id IS
  'Optional link to platform identity for patient portal access.';

-- One active patient link per identity per HCO (cross-org patients allowed but rare).
CREATE UNIQUE INDEX IF NOT EXISTS patients_identity_hco_uidx
  ON activeclinic.patients (platform_identity_id, healthcare_organization_id)
  WHERE platform_identity_id IS NOT NULL AND status = 'active';

COMMENT ON INDEX activeclinic.patients_identity_hco_uidx IS
  'One active patient per identity per healthcare organization.';

CREATE INDEX IF NOT EXISTS patients_identity_org_idx
  ON activeclinic.patients (platform_identity_id, organization_id)
  WHERE platform_identity_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Patient portal link audit events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activeclinic.patient_portal_link_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  patient_id UUID NULL,
  platform_identity_id UUID NULL
    REFERENCES platform.identities (id)
    ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  booking_request_id UUID NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT patient_portal_link_events_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT patient_portal_link_events_patient_fk
    FOREIGN KEY (patient_id, organization_id)
    REFERENCES activeclinic.patients (id, organization_id)
    ON DELETE SET NULL,
  CONSTRAINT patient_portal_link_events_event_type_check
    CHECK (
      event_type IN (
        'linked_via_guest_token',
        'linked_via_phone_match',
        'link_conflict',
        'profile_updated',
        'login',
        'logout'
      )
    )
);

CREATE INDEX IF NOT EXISTS patient_portal_link_events_org_created_idx
  ON activeclinic.patient_portal_link_events (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS patient_portal_link_events_patient_idx
  ON activeclinic.patient_portal_link_events (patient_id, created_at DESC)
  WHERE patient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS patient_portal_link_events_identity_idx
  ON activeclinic.patient_portal_link_events (platform_identity_id, created_at DESC)
  WHERE platform_identity_id IS NOT NULL;

COMMENT ON TABLE activeclinic.patient_portal_link_events IS
  'Audit trail for patient portal identity linking and authentication events.';
