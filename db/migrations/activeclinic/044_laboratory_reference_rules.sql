-- Configurable laboratory reference rules.
-- No default clinical threshold is inserted.
-- This migration has no DELETE FROM, DROP TABLE, or TRUNCATE.

CREATE TABLE IF NOT EXISTS activeclinic.laboratory_reference_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  test_code TEXT NOT NULL,
  unit TEXT NOT NULL,
  range_low NUMERIC NOT NULL,
  range_high NUMERIC NOT NULL,
  critical_low NUMERIC NULL,
  critical_high NUMERIC NULL,
  patient_group TEXT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  effective_from TIMESTAMPTZ NOT NULL,
  effective_until TIMESTAMPTZ NULL,
  display_text TEXT NULL,
  created_by_staff_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT laboratory_reference_rules_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT laboratory_reference_rules_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT laboratory_reference_rules_author_fk
    FOREIGN KEY (created_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT laboratory_reference_rules_bounds
    CHECK (range_low < range_high),
  CONSTRAINT laboratory_reference_rules_critical_low
    CHECK (critical_low IS NULL OR critical_low < range_low),
  CONSTRAINT laboratory_reference_rules_critical_high
    CHECK (critical_high IS NULL OR critical_high > range_high),
  CONSTRAINT laboratory_reference_rules_version
    CHECK (version >= 1),
  CONSTRAINT laboratory_reference_rules_status
    CHECK (status IN ('draft', 'approved')),
  CONSTRAINT laboratory_reference_rules_window
    CHECK (effective_until IS NULL OR effective_until > effective_from),
  CONSTRAINT laboratory_reference_rules_code_len
    CHECK (char_length(test_code) BETWEEN 1 AND 80),
  CONSTRAINT laboratory_reference_rules_unit_len
    CHECK (char_length(unit) BETWEEN 1 AND 40)
);

CREATE INDEX IF NOT EXISTS laboratory_reference_rules_lookup_idx
  ON activeclinic.laboratory_reference_rules
  (organization_id, facility_id, test_code, unit, effective_from DESC);

COMMENT ON TABLE activeclinic.laboratory_reference_rules IS
  'Caller-approved ranges only. Absence of a row does not imply a normal or critical result.';
