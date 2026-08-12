-- AC-V7-P04 Phase 4: schema for confirmed STITCH_NOT_IMPLEMENTED pharmacy/billing gaps.
-- Forward-only. Testing/V7 only.

-- ============================================================================
-- PHARMACY PURCHASE ORDERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS activeclinic.pharmacy_purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  po_number TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT NULL,
  created_by_staff_id UUID NOT NULL
    REFERENCES activeclinic.staff_members (id)
    ON DELETE RESTRICT,
  submitted_at TIMESTAMPTZ NULL,
  received_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pharmacy_po_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT pharmacy_po_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT pharmacy_po_number_unique UNIQUE (facility_id, po_number),
  CONSTRAINT pharmacy_po_status_check
    CHECK (status IN ('draft', 'submitted', 'partially_received', 'received', 'cancelled')),
  CONSTRAINT pharmacy_po_supplier_len CHECK (char_length(supplier_name) BETWEEN 1 AND 200),
  CONSTRAINT pharmacy_po_number_len CHECK (char_length(po_number) BETWEEN 1 AND 64),
  CONSTRAINT pharmacy_po_notes_len CHECK (notes IS NULL OR char_length(notes) <= 2000)
);

CREATE TABLE IF NOT EXISTS activeclinic.pharmacy_purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL
    REFERENCES activeclinic.pharmacy_purchase_orders (id)
    ON DELETE CASCADE,
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  medication_catalogue_item_id UUID NOT NULL,
  quantity_ordered INTEGER NOT NULL CHECK (quantity_ordered > 0),
  quantity_received INTEGER NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  unit_cost DECIMAL(12, 2) NULL CHECK (unit_cost IS NULL OR unit_cost >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pharmacy_poi_medication_fk
    FOREIGN KEY (medication_catalogue_item_id, healthcare_organization_id)
    REFERENCES activeclinic.medication_catalogue_items (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT pharmacy_poi_qty_received_lte_ordered
    CHECK (quantity_received <= quantity_ordered)
);

CREATE INDEX IF NOT EXISTS pharmacy_po_facility_status_idx
  ON activeclinic.pharmacy_purchase_orders (facility_id, status, created_at DESC);

-- ============================================================================
-- BILLING: credit notes, charge review, collections contact, price override requests
-- ============================================================================

CREATE TABLE IF NOT EXISTS activeclinic.credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES activeclinic.facilities(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES activeclinic.patients(id) ON DELETE CASCADE,
  invoice_id UUID NULL REFERENCES activeclinic.invoices(id) ON DELETE RESTRICT,
  credit_note_number VARCHAR(50) NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency_code VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'posted',
  created_by_staff_id UUID NOT NULL REFERENCES activeclinic.staff_members(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, facility_id, credit_note_number),
  CHECK (status IN ('draft', 'posted', 'void')),
  CHECK (char_length(reason) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS credit_notes_tenant_patient_idx
  ON activeclinic.credit_notes (tenant_id, patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS activeclinic.billing_collections_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES activeclinic.facilities(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES activeclinic.patients(id) ON DELETE CASCADE,
  invoice_id UUID NULL REFERENCES activeclinic.invoices(id) ON DELETE SET NULL,
  contact_method VARCHAR(30) NOT NULL,
  outcome VARCHAR(40) NOT NULL DEFAULT 'attempted',
  notes TEXT NULL,
  contacted_by_staff_id UUID NOT NULL REFERENCES activeclinic.staff_members(id),
  contacted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (contact_method IN ('phone', 'sms', 'email', 'in_person', 'other')),
  CHECK (outcome IN ('attempted', 'reached', 'promised_payment', 'disputed', 'no_answer', 'wrong_contact', 'other')),
  CHECK (notes IS NULL OR char_length(notes) <= 2000)
);

CREATE INDEX IF NOT EXISTS billing_collections_contacts_patient_idx
  ON activeclinic.billing_collections_contacts (tenant_id, patient_id, contacted_at DESC);

-- Extend patient_charges with optional review status without breaking existing rows.
ALTER TABLE activeclinic.patient_charges
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'patient_charges_review_status_check'
  ) THEN
    ALTER TABLE activeclinic.patient_charges
      ADD CONSTRAINT patient_charges_review_status_check
      CHECK (review_status IS NULL OR review_status IN ('pending_review', 'approved', 'rejected'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS activeclinic.price_override_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES activeclinic.facilities(id) ON DELETE CASCADE,
  patient_id UUID NULL REFERENCES activeclinic.patients(id) ON DELETE SET NULL,
  charge_catalogue_item_id UUID NULL REFERENCES activeclinic.charge_catalogue_items(id) ON DELETE SET NULL,
  patient_charge_id UUID NULL REFERENCES activeclinic.patient_charges(id) ON DELETE SET NULL,
  original_amount_minor BIGINT NOT NULL,
  requested_amount_minor BIGINT NOT NULL,
  currency_code VARCHAR(3) NOT NULL DEFAULT 'ZMW',
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  requested_by_staff_id UUID NOT NULL REFERENCES activeclinic.staff_members(id),
  reviewed_by_staff_id UUID NULL REFERENCES activeclinic.staff_members(id),
  reviewed_at TIMESTAMPTZ NULL,
  review_notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  CHECK (original_amount_minor >= 0),
  CHECK (requested_amount_minor >= 0),
  CHECK (char_length(reason) BETWEEN 1 AND 2000)
);

CREATE INDEX IF NOT EXISTS price_override_requests_status_idx
  ON activeclinic.price_override_requests (tenant_id, facility_id, status, created_at DESC);

COMMENT ON TABLE activeclinic.pharmacy_purchase_orders IS
  'V7 Phase 4 pharmacy purchase orders (Stitch P05).';
COMMENT ON TABLE activeclinic.credit_notes IS
  'V7 Phase 4 explicit credit notes (Stitch P07); does not silently edit invoices.';
COMMENT ON TABLE activeclinic.price_override_requests IS
  'V7 Phase 4 price override approval queue (Stitch P07).';
