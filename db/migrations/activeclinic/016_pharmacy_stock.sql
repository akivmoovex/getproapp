-- AC-V6-P05: pharmacy, medication catalogue, inventory, prescriptions, dispensing.
-- Append-only stock movements, batch/expiry tracking, partial dispense support.

CREATE TABLE IF NOT EXISTS activeclinic.medication_catalogue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  medication_code TEXT NULL,
  generic_name TEXT NOT NULL,
  brand_names JSONB NULL,
  strength TEXT NOT NULL,
  dosage_form TEXT NOT NULL,
  unit_of_measure TEXT NOT NULL,
  standard_cost DECIMAL(12, 2) NULL,
  reorder_level INTEGER NULL,
  storage_conditions TEXT NULL,
  notes TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT medication_catalogue_items_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT medication_catalogue_items_id_hco_unique UNIQUE (id, healthcare_organization_id),
  CONSTRAINT medication_catalogue_items_hco_name_strength_form_unique
    UNIQUE (healthcare_organization_id, generic_name, strength, dosage_form),
  CONSTRAINT medication_catalogue_items_code_len
    CHECK (medication_code IS NULL OR char_length(medication_code) BETWEEN 1 AND 64),
  CONSTRAINT medication_catalogue_items_generic_name_len
    CHECK (char_length(generic_name) BETWEEN 1 AND 200),
  CONSTRAINT medication_catalogue_items_strength_len
    CHECK (char_length(strength) BETWEEN 1 AND 100),
  CONSTRAINT medication_catalogue_items_dosage_form_check
    CHECK (
      dosage_form IN (
        'tablet', 'capsule', 'syrup', 'suspension', 'injection',
        'cream', 'ointment', 'drops', 'inhaler', 'suppository',
        'powder', 'solution', 'patch', 'other'
      )
    ),
  CONSTRAINT medication_catalogue_items_unit_len
    CHECK (char_length(unit_of_measure) BETWEEN 1 AND 50),
  CONSTRAINT medication_catalogue_items_cost_positive
    CHECK (standard_cost IS NULL OR standard_cost >= 0),
  CONSTRAINT medication_catalogue_items_reorder_positive
    CHECK (reorder_level IS NULL OR reorder_level >= 0),
  CONSTRAINT medication_catalogue_items_storage_len
    CHECK (storage_conditions IS NULL OR char_length(storage_conditions) BETWEEN 1 AND 200),
  CONSTRAINT medication_catalogue_items_notes_len
    CHECK (notes IS NULL OR char_length(notes) BETWEEN 1 AND 1000),
  CONSTRAINT medication_catalogue_items_status_check
    CHECK (status IN ('active', 'discontinued'))
);

COMMENT ON TABLE activeclinic.medication_catalogue_items IS
  'HCO-scoped medication master catalogue. No auto-prescribing; reference only.';

CREATE INDEX IF NOT EXISTS medication_catalogue_items_hco_status_idx
  ON activeclinic.medication_catalogue_items (healthcare_organization_id, status, generic_name);

CREATE TABLE IF NOT EXISTS activeclinic.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  medication_catalogue_item_id UUID NOT NULL,
  current_quantity INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER NULL,
  reorder_quantity INTEGER NULL,
  last_restocked_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_items_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_items_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_items_medication_fk
    FOREIGN KEY (medication_catalogue_item_id, healthcare_organization_id)
    REFERENCES activeclinic.medication_catalogue_items (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_items_id_hco_unique UNIQUE (id, healthcare_organization_id),
  CONSTRAINT inventory_items_facility_medication_unique
    UNIQUE (facility_id, medication_catalogue_item_id),
  CONSTRAINT inventory_items_quantity_nonnegative
    CHECK (current_quantity >= 0),
  CONSTRAINT inventory_items_reorder_level_positive
    CHECK (reorder_level IS NULL OR reorder_level >= 0),
  CONSTRAINT inventory_items_reorder_quantity_positive
    CHECK (reorder_quantity IS NULL OR reorder_quantity > 0)
);

COMMENT ON TABLE activeclinic.inventory_items IS
  'Facility-scoped inventory stock levels per medication. Updated by stock movements.';

CREATE INDEX IF NOT EXISTS inventory_items_facility_idx
  ON activeclinic.inventory_items (facility_id, medication_catalogue_item_id);

CREATE INDEX IF NOT EXISTS inventory_items_hco_medication_idx
  ON activeclinic.inventory_items (healthcare_organization_id, medication_catalogue_item_id);

CREATE INDEX IF NOT EXISTS inventory_items_low_stock_idx
  ON activeclinic.inventory_items (facility_id, current_quantity)
  WHERE reorder_level IS NOT NULL AND current_quantity <= reorder_level;

CREATE TABLE IF NOT EXISTS activeclinic.inventory_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  inventory_item_id UUID NOT NULL,
  batch_number TEXT NOT NULL,
  quantity_in_batch INTEGER NOT NULL,
  manufacture_date DATE NULL,
  expiry_date DATE NOT NULL,
  supplier_name TEXT NULL,
  cost_per_unit DECIMAL(12, 2) NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_batches_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_batches_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_batches_inventory_item_fk
    FOREIGN KEY (inventory_item_id, healthcare_organization_id)
    REFERENCES activeclinic.inventory_items (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT inventory_batches_id_hco_unique UNIQUE (id, healthcare_organization_id),
  CONSTRAINT inventory_batches_facility_item_batch_unique
    UNIQUE (facility_id, inventory_item_id, batch_number),
  CONSTRAINT inventory_batches_batch_number_len
    CHECK (char_length(batch_number) BETWEEN 1 AND 100),
  CONSTRAINT inventory_batches_quantity_nonnegative
    CHECK (quantity_in_batch >= 0),
  CONSTRAINT inventory_batches_supplier_len
    CHECK (supplier_name IS NULL OR char_length(supplier_name) BETWEEN 1 AND 200),
  CONSTRAINT inventory_batches_cost_positive
    CHECK (cost_per_unit IS NULL OR cost_per_unit >= 0),
  CONSTRAINT inventory_batches_status_check
    CHECK (status IN ('available', 'expired', 'quarantined', 'depleted'))
);

COMMENT ON TABLE activeclinic.inventory_batches IS
  'Batch-level tracking with expiry dates. FEFO dispensing logic enforced in application.';

CREATE INDEX IF NOT EXISTS inventory_batches_inventory_item_expiry_idx
  ON activeclinic.inventory_batches (inventory_item_id, expiry_date, status);

CREATE INDEX IF NOT EXISTS inventory_batches_facility_expiry_idx
  ON activeclinic.inventory_batches (facility_id, expiry_date)
  WHERE status = 'available';

CREATE TABLE IF NOT EXISTS activeclinic.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  inventory_item_id UUID NOT NULL,
  inventory_batch_id UUID NULL,
  movement_type TEXT NOT NULL,
  quantity_delta INTEGER NOT NULL,
  reference_id UUID NULL,
  reference_type TEXT NULL,
  reverses_movement_id UUID NULL,
  reason TEXT NULL,
  performed_by_staff_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT stock_movements_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT stock_movements_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT stock_movements_inventory_item_fk
    FOREIGN KEY (inventory_item_id, healthcare_organization_id)
    REFERENCES activeclinic.inventory_items (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT stock_movements_inventory_batch_fk
    FOREIGN KEY (inventory_batch_id, healthcare_organization_id)
    REFERENCES activeclinic.inventory_batches (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT stock_movements_reverses_fk
    FOREIGN KEY (reverses_movement_id)
    REFERENCES activeclinic.stock_movements (id)
    ON DELETE RESTRICT,
  CONSTRAINT stock_movements_performed_by_fk
    FOREIGN KEY (performed_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT stock_movements_type_check
    CHECK (
      movement_type IN (
        'receive', 'adjustment', 'transfer_out', 'transfer_in',
        'dispense_decrement', 'reversal'
      )
    ),
  CONSTRAINT stock_movements_reference_type_check
    CHECK (
      reference_type IS NULL OR
      reference_type IN ('dispense', 'transfer', 'adjustment', 'purchase', 'other')
    ),
  CONSTRAINT stock_movements_reason_len
    CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 500),
  CONSTRAINT stock_movements_delta_nonzero
    CHECK (quantity_delta <> 0)
);

COMMENT ON TABLE activeclinic.stock_movements IS
  'Append-only stock movement log. Never delete. Trigger updates inventory_items.current_quantity.';

CREATE INDEX IF NOT EXISTS stock_movements_inventory_item_created_idx
  ON activeclinic.stock_movements (inventory_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS stock_movements_facility_created_idx
  ON activeclinic.stock_movements (facility_id, created_at DESC);

CREATE INDEX IF NOT EXISTS stock_movements_batch_idx
  ON activeclinic.stock_movements (inventory_batch_id)
  WHERE inventory_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS stock_movements_reference_idx
  ON activeclinic.stock_movements (reference_type, reference_id)
  WHERE reference_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS activeclinic.pharmacy_prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  encounter_id UUID NULL,
  patient_id UUID NOT NULL,
  clinical_order_id UUID NULL,
  prescriber_staff_id UUID NULL,
  prescription_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'normal',
  review_required BOOLEAN NOT NULL DEFAULT false,
  reviewer_staff_id UUID NULL,
  reviewed_at TIMESTAMPTZ NULL,
  notes TEXT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pharmacy_prescriptions_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT pharmacy_prescriptions_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT pharmacy_prescriptions_encounter_fk
    FOREIGN KEY (encounter_id, healthcare_organization_id)
    REFERENCES activeclinic.encounters (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT pharmacy_prescriptions_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT pharmacy_prescriptions_clinical_order_fk
    FOREIGN KEY (clinical_order_id)
    REFERENCES activeclinic.clinical_orders (id)
    ON DELETE RESTRICT,
  CONSTRAINT pharmacy_prescriptions_prescriber_fk
    FOREIGN KEY (prescriber_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT pharmacy_prescriptions_reviewer_fk
    FOREIGN KEY (reviewer_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT pharmacy_prescriptions_id_hco_unique UNIQUE (id, healthcare_organization_id),
  CONSTRAINT pharmacy_prescriptions_facility_number_unique
    UNIQUE (facility_id, prescription_number),
  CONSTRAINT pharmacy_prescriptions_number_len
    CHECK (char_length(prescription_number) BETWEEN 1 AND 64),
  CONSTRAINT pharmacy_prescriptions_status_check
    CHECK (
      status IN (
        'pending', 'in_preparation', 'ready_for_collection',
        'dispensed', 'partially_dispensed', 'cancelled'
      )
    ),
  CONSTRAINT pharmacy_prescriptions_priority_check
    CHECK (priority IN ('normal', 'urgent')),
  CONSTRAINT pharmacy_prescriptions_notes_len
    CHECK (notes IS NULL OR char_length(notes) BETWEEN 1 AND 2000),
  CONSTRAINT pharmacy_prescriptions_version_positive
    CHECK (version >= 1)
);

COMMENT ON TABLE activeclinic.pharmacy_prescriptions IS
  'Pharmacy prescription queue. Links to clinical_orders when originating from clinical workflow.';

CREATE INDEX IF NOT EXISTS pharmacy_prescriptions_facility_status_idx
  ON activeclinic.pharmacy_prescriptions (facility_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS pharmacy_prescriptions_patient_idx
  ON activeclinic.pharmacy_prescriptions (patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS pharmacy_prescriptions_clinical_order_idx
  ON activeclinic.pharmacy_prescriptions (clinical_order_id)
  WHERE clinical_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pharmacy_prescriptions_encounter_idx
  ON activeclinic.pharmacy_prescriptions (encounter_id)
  WHERE encounter_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS activeclinic.pharmacy_prescription_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  pharmacy_prescription_id UUID NOT NULL,
  medication_catalogue_item_id UUID NOT NULL,
  quantity_ordered INTEGER NOT NULL,
  quantity_dispensed INTEGER NOT NULL DEFAULT 0,
  dosage_instructions TEXT NULL,
  substitution_allowed BOOLEAN NOT NULL DEFAULT false,
  substituted_with_medication_id UUID NULL,
  substitution_reason TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pharmacy_prescription_items_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT pharmacy_prescription_items_prescription_fk
    FOREIGN KEY (pharmacy_prescription_id, healthcare_organization_id)
    REFERENCES activeclinic.pharmacy_prescriptions (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT pharmacy_prescription_items_medication_fk
    FOREIGN KEY (medication_catalogue_item_id, healthcare_organization_id)
    REFERENCES activeclinic.medication_catalogue_items (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT pharmacy_prescription_items_substituted_medication_fk
    FOREIGN KEY (substituted_with_medication_id, healthcare_organization_id)
    REFERENCES activeclinic.medication_catalogue_items (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT pharmacy_prescription_items_quantity_ordered_positive
    CHECK (quantity_ordered > 0),
  CONSTRAINT pharmacy_prescription_items_quantity_dispensed_nonnegative
    CHECK (quantity_dispensed >= 0),
  CONSTRAINT pharmacy_prescription_items_quantity_dispensed_lte_ordered
    CHECK (quantity_dispensed <= quantity_ordered),
  CONSTRAINT pharmacy_prescription_items_instructions_len
    CHECK (dosage_instructions IS NULL OR char_length(dosage_instructions) BETWEEN 1 AND 1000),
  CONSTRAINT pharmacy_prescription_items_substitution_reason_len
    CHECK (substitution_reason IS NULL OR char_length(substitution_reason) BETWEEN 1 AND 500),
  CONSTRAINT pharmacy_prescription_items_status_check
    CHECK (
      status IN (
        'pending', 'dispensed', 'partially_dispensed',
        'out_of_stock', 'substituted', 'cancelled'
      )
    )
);

COMMENT ON TABLE activeclinic.pharmacy_prescription_items IS
  'Individual medications in a prescription. Tracks partial dispensing and substitution.';

CREATE INDEX IF NOT EXISTS pharmacy_prescription_items_prescription_idx
  ON activeclinic.pharmacy_prescription_items (pharmacy_prescription_id);

CREATE INDEX IF NOT EXISTS pharmacy_prescription_items_medication_idx
  ON activeclinic.pharmacy_prescription_items (medication_catalogue_item_id);

CREATE TABLE IF NOT EXISTS activeclinic.dispense_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  facility_id UUID NOT NULL,
  pharmacy_prescription_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  dispense_type TEXT NOT NULL,
  dispensed_by_staff_id UUID NOT NULL,
  dispensed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  patient_acknowledged BOOLEAN NOT NULL DEFAULT false,
  counseling_provided BOOLEAN NOT NULL DEFAULT false,
  counseling_notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dispense_events_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT dispense_events_facility_fk
    FOREIGN KEY (facility_id, healthcare_organization_id)
    REFERENCES activeclinic.facilities (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT dispense_events_prescription_fk
    FOREIGN KEY (pharmacy_prescription_id, healthcare_organization_id)
    REFERENCES activeclinic.pharmacy_prescriptions (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT dispense_events_patient_fk
    FOREIGN KEY (patient_id, healthcare_organization_id)
    REFERENCES activeclinic.patients (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT dispense_events_dispensed_by_fk
    FOREIGN KEY (dispensed_by_staff_id, organization_id)
    REFERENCES activeclinic.staff_members (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT dispense_events_type_check
    CHECK (dispense_type IN ('full', 'partial', 'emergency')),
  CONSTRAINT dispense_events_counseling_notes_len
    CHECK (counseling_notes IS NULL OR char_length(counseling_notes) BETWEEN 1 AND 2000)
);

COMMENT ON TABLE activeclinic.dispense_events IS
  'Append-only dispense event log. Records when medications handed to patients.';

CREATE INDEX IF NOT EXISTS dispense_events_prescription_idx
  ON activeclinic.dispense_events (pharmacy_prescription_id, dispensed_at DESC);

CREATE INDEX IF NOT EXISTS dispense_events_patient_idx
  ON activeclinic.dispense_events (patient_id, dispensed_at DESC);

CREATE INDEX IF NOT EXISTS dispense_events_facility_idx
  ON activeclinic.dispense_events (facility_id, dispensed_at DESC);

CREATE TABLE IF NOT EXISTS activeclinic.dispense_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES platform.organizations (id)
    ON DELETE RESTRICT,
  healthcare_organization_id UUID NOT NULL,
  dispense_event_id UUID NOT NULL,
  pharmacy_prescription_item_id UUID NOT NULL,
  inventory_batch_id UUID NOT NULL,
  quantity_dispensed INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dispense_items_hco_org_fk
    FOREIGN KEY (healthcare_organization_id, organization_id)
    REFERENCES activeclinic.healthcare_organizations (id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT dispense_items_dispense_event_fk
    FOREIGN KEY (dispense_event_id)
    REFERENCES activeclinic.dispense_events (id)
    ON DELETE RESTRICT,
  CONSTRAINT dispense_items_prescription_item_fk
    FOREIGN KEY (pharmacy_prescription_item_id)
    REFERENCES activeclinic.pharmacy_prescription_items (id)
    ON DELETE RESTRICT,
  CONSTRAINT dispense_items_inventory_batch_fk
    FOREIGN KEY (inventory_batch_id, healthcare_organization_id)
    REFERENCES activeclinic.inventory_batches (id, healthcare_organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT dispense_items_quantity_positive
    CHECK (quantity_dispensed > 0)
);

COMMENT ON TABLE activeclinic.dispense_items IS
  'Line items for dispense events. Links to batch used and prescription item.';

CREATE INDEX IF NOT EXISTS dispense_items_dispense_event_idx
  ON activeclinic.dispense_items (dispense_event_id);

CREATE INDEX IF NOT EXISTS dispense_items_prescription_item_idx
  ON activeclinic.dispense_items (pharmacy_prescription_item_id);

CREATE INDEX IF NOT EXISTS dispense_items_batch_idx
  ON activeclinic.dispense_items (inventory_batch_id);

-- Trigger to update inventory_items.current_quantity on stock_movements insert.
CREATE OR REPLACE FUNCTION activeclinic.update_inventory_quantity_on_movement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE activeclinic.inventory_items
     SET current_quantity = current_quantity + NEW.quantity_delta,
         updated_at = now()
   WHERE id = NEW.inventory_item_id;

  -- Prevent negative stock.
  IF (SELECT current_quantity FROM activeclinic.inventory_items WHERE id = NEW.inventory_item_id) < 0 THEN
    RAISE EXCEPTION 'Stock movement would result in negative inventory for item %', NEW.inventory_item_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stock_movements_update_quantity ON activeclinic.stock_movements;
CREATE TRIGGER stock_movements_update_quantity
  AFTER INSERT ON activeclinic.stock_movements
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.update_inventory_quantity_on_movement();

-- Trigger to update batch quantity_in_batch on stock_movements (optional; P05 keeps batch quantity static, updates via movements).
-- For simplicity, we track batch initial quantity and rely on movements for audit.
-- If depleted, mark batch status via application logic or scheduled job.

-- Trigger to update pharmacy_prescriptions.updated_at.
CREATE OR REPLACE FUNCTION activeclinic.touch_pharmacy_prescriptions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pharmacy_prescriptions_touch ON activeclinic.pharmacy_prescriptions;
CREATE TRIGGER pharmacy_prescriptions_touch
  BEFORE INSERT OR UPDATE ON activeclinic.pharmacy_prescriptions
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_pharmacy_prescriptions();

CREATE OR REPLACE FUNCTION activeclinic.touch_pharmacy_prescription_items()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pharmacy_prescription_items_touch ON activeclinic.pharmacy_prescription_items;
CREATE TRIGGER pharmacy_prescription_items_touch
  BEFORE INSERT OR UPDATE ON activeclinic.pharmacy_prescription_items
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_pharmacy_prescription_items();

CREATE OR REPLACE FUNCTION activeclinic.touch_medication_catalogue_items()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.generic_name := trim(NEW.generic_name);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS medication_catalogue_items_touch ON activeclinic.medication_catalogue_items;
CREATE TRIGGER medication_catalogue_items_touch
  BEFORE INSERT OR UPDATE ON activeclinic.medication_catalogue_items
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_medication_catalogue_items();

CREATE OR REPLACE FUNCTION activeclinic.touch_inventory_items()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_items_touch ON activeclinic.inventory_items;
CREATE TRIGGER inventory_items_touch
  BEFORE INSERT OR UPDATE ON activeclinic.inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_inventory_items();

CREATE OR REPLACE FUNCTION activeclinic.touch_inventory_batches()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_batches_touch ON activeclinic.inventory_batches;
CREATE TRIGGER inventory_batches_touch
  BEFORE INSERT OR UPDATE ON activeclinic.inventory_batches
  FOR EACH ROW
  EXECUTE FUNCTION activeclinic.touch_inventory_batches();
