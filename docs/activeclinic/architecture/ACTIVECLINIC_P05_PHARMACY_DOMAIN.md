# ActiveClinic P05 — Pharmacy Domain Architecture

**Phase:** P05 (Pharmacy / Medication / Stock)  
**Migration:** `db/migrations/activeclinic/016_pharmacy_stock.sql`  
**Permissions:** `db/migrations/blessboard/085_activeclinic_pharmacy_permissions.sql`  
**Authored:** 2026-08-04  

## Overview

The pharmacy domain provides prescription management, medication dispensing, and inventory control for ActiveClinic facilities. This is a **foundational implementation** that supports core workflows safely without attempting clinical decision support, drug interaction checking, or automated dose calculations.

## Core Entities

### 1. Medication Catalogue (`medication_catalogue_items`)

**Purpose:** Organization-wide medication master list.

**Ownership:** Healthcare organization level (not facility-specific).

**Fields:**
- `id`, `organization_id`, `healthcare_organization_id`
- `medication_code` (optional; facility may use local codes or none)
- `generic_name` (required; canonical medication name)
- `brand_names` (optional JSON array)
- `strength` (text; e.g., "500mg")
- `dosage_form` (e.g., tablet, capsule, syrup, injection)
- `unit_of_measure` (e.g., tablet, ml, vial)
- `standard_cost` (optional; for financial tracking)
- `reorder_level` (optional; default low-stock threshold)
- `storage_conditions` (text; e.g., "room temperature", "refrigerate")
- `notes` (optional)
- `status` (active, discontinued)
- `created_at`, `updated_at`

**Constraints:**
- Unique `(healthcare_organization_id, generic_name, strength, dosage_form)` to prevent duplicates.
- No auto-prescribing logic; catalogue is reference only.

### 2. Inventory Items (`inventory_items`)

**Purpose:** Tracks current stock level per medication per facility.

**Ownership:** Facility-specific.

**Fields:**
- `id`, `organization_id`, `healthcare_organization_id`, `facility_id`
- `medication_catalogue_item_id`
- `current_quantity` (integer; updated by stock movements)
- `reorder_level` (facility override; null = use catalogue default)
- `reorder_quantity` (suggested reorder amount)
- `last_restocked_at`
- `created_at`, `updated_at`

**Constraints:**
- Unique `(facility_id, medication_catalogue_item_id)`
- Check `current_quantity >= 0` (no negative stock)

### 3. Inventory Batches (`inventory_batches`)

**Purpose:** Tracks individual batches with expiry dates and batch numbers.

**Ownership:** Facility-specific.

**Fields:**
- `id`, `organization_id`, `healthcare_organization_id`, `facility_id`
- `inventory_item_id`
- `batch_number` (required; from supplier or internal)
- `quantity_in_batch` (integer)
- `manufacture_date` (optional)
- `expiry_date` (required for safety)
- `supplier_name` (optional)
- `cost_per_unit` (optional)
- `received_at`
- `status` (available, expired, quarantined, depleted)
- `created_at`, `updated_at`

**Constraints:**
- Unique `(facility_id, inventory_item_id, batch_number)`
- Check `quantity_in_batch >= 0`

### 4. Stock Movements (`stock_movements`)

**Purpose:** Append-only log of all inventory changes.

**Movement Types:**
- `receive` (incoming stock from supplier/transfer)
- `adjustment` (correction for count discrepancies)
- `transfer_out` (sent to another facility)
- `transfer_in` (received from another facility)
- `dispense_decrement` (dispensed to patient)
- `reversal` (reverses a previous movement)

**Fields:**
- `id`, `organization_id`, `healthcare_organization_id`, `facility_id`
- `inventory_item_id`
- `inventory_batch_id` (required for receive/dispense; optional for adjustment)
- `movement_type`
- `quantity_delta` (integer; positive for increase, negative for decrease)
- `reference_id` (links to dispense_event, purchase_order, transfer, etc.)
- `reference_type` (e.g., dispense, transfer, adjustment, purchase)
- `reverses_movement_id` (for reversal movements)
- `reason` (text; required for adjustment/reversal)
- `performed_by_staff_id`
- `created_at`

**Constraints:**
- Append-only; **never** delete stock movements.
- Trigger/function updates `inventory_items.current_quantity` on insert.
- Check prevents negative stock: sum of movements for inventory_item must be non-negative.

### 5. Pharmacy Prescriptions (`pharmacy_prescriptions`)

**Purpose:** Tracks prescription orders in the pharmacy queue.

**Lifecycle:**
1. Clinical orders with type `prescription` (from P04 `clinical_orders`) are visible in pharmacy queue.
2. Pharmacy staff review and prepare prescriptions.
3. Dispense events link back to prescription.

**Fields:**
- `id`, `organization_id`, `healthcare_organization_id`, `facility_id`
- `encounter_id`, `patient_id`
- `clinical_order_id` (FK to `clinical_orders` when originating from clinical workflow)
- `prescriber_staff_id`
- `prescription_number` (facility-unique)
- `status` (pending, in_preparation, ready_for_collection, dispensed, partially_dispensed, cancelled)
- `priority` (normal, urgent)
- `review_required` (boolean; flags complex cases for manual pharmacist review)
- `reviewer_staff_id`, `reviewed_at`
- `notes` (pharmacy internal notes)
- `version`
- `created_at`, `updated_at`

**Constraints:**
- Unique `(facility_id, prescription_number)`
- Check status transitions
- FK to `clinical_orders` optional (allows standalone pharmacy prescriptions if needed in future)

### 6. Pharmacy Prescription Items (`pharmacy_prescription_items`)

**Purpose:** Individual medications in a prescription.

**Fields:**
- `id`, `organization_id`, `healthcare_organization_id`
- `pharmacy_prescription_id`
- `medication_catalogue_item_id`
- `quantity_ordered` (integer)
- `quantity_dispensed` (integer; updated by dispense events)
- `dosage_instructions` (text from clinical order or pharmacist)
- `substitution_allowed` (boolean; default false)
- `substituted_with_medication_id` (if substituted)
- `substitution_reason` (text)
- `status` (pending, dispensed, partially_dispensed, out_of_stock, substituted, cancelled)
- `created_at`, `updated_at`

**Constraints:**
- Check `quantity_dispensed <= quantity_ordered`
- Check `quantity_ordered > 0`
- `substituted_with_medication_id` must be in catalogue

### 7. Dispense Events (`dispense_events`)

**Purpose:** Records when medications are handed to patients.

**Fields:**
- `id`, `organization_id`, `healthcare_organization_id`, `facility_id`
- `pharmacy_prescription_id`
- `patient_id`
- `dispense_type` (full, partial, emergency)
- `dispensed_by_staff_id`
- `dispensed_at`
- `patient_acknowledged` (boolean; signature/confirmation)
- `counseling_provided` (boolean)
- `counseling_notes` (text)
- `created_at`

**Constraints:**
- Append-only; no updates after creation.

### 8. Dispense Items (`dispense_items`)

**Purpose:** Line items for each dispense event.

**Fields:**
- `id`, `organization_id`, `healthcare_organization_id`
- `dispense_event_id`
- `pharmacy_prescription_item_id`
- `inventory_batch_id` (which batch was used)
- `quantity_dispensed` (integer)
- `created_at`

**Constraints:**
- Check `quantity_dispensed > 0`
- Triggers stock_movements insert with `dispense_decrement`

## Workflows

### A. Add Medicine to Catalogue

1. Pharmacy admin or network admin accesses Medicine Catalogue screen.
2. Submits form with generic name, strength, dosage form, unit of measure.
3. System inserts into `medication_catalogue_items`.
4. **No auto-creation of inventory items** — facilities add stock manually.

### B. Receive Stock

1. Facility staff accesses Receive Stock screen.
2. Selects medication from catalogue (or creates new if not present).
3. Enters batch number, quantity, expiry date, supplier.
4. System creates/updates `inventory_item`, creates `inventory_batch`, and inserts `stock_movements` with type `receive`.

### C. Stock Adjustment

1. Staff accesses Stock Adjustment screen (for physical count corrections).
2. Selects inventory item, enters quantity delta (positive or negative), reason.
3. System inserts `stock_movements` with type `adjustment`.
4. Trigger updates `inventory_items.current_quantity`.

### D. Stock Transfer

1. Source facility staff initiates transfer to destination facility.
2. System creates `stock_movements` with type `transfer_out` (negative delta) at source.
3. System creates `stock_movements` with type `transfer_in` (positive delta) at destination.
4. **Product decision:** Transfer approval workflow is out of scope for P05; assume instant transfer.

### E. Prescription Queue

1. Clinical orders with type `prescription` (from P04) appear in pharmacy queue.
2. Pharmacy staff views queue, selects prescription.
3. System loads `pharmacy_prescriptions` linked to clinical order.
4. Pharmacist reviews prescription items, checks inventory availability.

### F. Dispense Prescription (Full)

1. Pharmacist confirms all items in stock.
2. System checks `inventory_items` and `inventory_batches` for sufficient quantity.
3. For each prescription item, system selects batch(es) with nearest expiry (FEFO logic optional in UI, required in tests).
4. Pharmacist confirms dispense.
5. System creates `dispense_event` and `dispense_items`, inserts `stock_movements` with type `dispense_decrement`.
6. System updates `pharmacy_prescription_items.quantity_dispensed` and status.
7. Prescription status → `dispensed`.

### G. Dispense Prescription (Partial)

1. Some items unavailable.
2. Pharmacist dispenses available items only.
3. System creates `dispense_event` with type `partial`.
4. Updates prescription item statuses individually (some `dispensed`, others `pending` or `out_of_stock`).
5. Prescription status → `partially_dispensed`.
6. Patient can return for remaining items when restocked.

### H. Low Stock Alerts

1. Query-based: `SELECT * FROM inventory_items WHERE current_quantity <= reorder_level AND current_quantity > 0`.
2. Display on Low Stock Alerts screen.
3. **No automated ordering** — staff manually initiates purchase or transfer.

### I. Expiry Alerts

1. Query-based: `SELECT * FROM inventory_batches WHERE expiry_date <= (now() + interval '90 days') AND status = 'available'`.
2. Display on Expiry Alerts screen.
3. Staff reviews and decides to use, transfer, or quarantine.

### J. Batch Detail

1. Staff clicks on batch in inventory list.
2. System displays batch details: batch number, expiry, quantity, manufacture date, supplier, movement history.

### K. Patient Medicine Instructions (Mobile)

1. After dispensing, patient (or staff on behalf of patient) accesses mobile screen.
2. System displays dispensed medications with dosage instructions, warnings, counseling notes.
3. Read-only; no clinical modification.

## Unsupported Clinical Decision Support

**The following features are explicitly BLOCKED for safety reasons:**

1. **Auto-prescribe / Template Prescriptions:** No automated prescription generation. Prescriptions must originate from clinical orders created by licensed staff.
2. **Drug Interaction Checking:** No automated interaction alerts. Manual review flag only.
3. **Allergy Checking:** Not implemented in P05. Clinicians must check allergies manually in patient record.
4. **Dose Inference / Calculation:** No automated dose calculation based on weight/age. Dosage must be explicitly entered.
5. **Controlled Substances Tracking (Specialized):** Basic tracking supported via batch/movement audit, but no DEA-style register or dual-signature workflows in P05.

## Permissions

**Permission Catalogue (085):**

- `activeclinic.pharmacy.view` — View pharmacy queue, prescriptions, dispensing screens.
- `activeclinic.pharmacy.dispense` — Dispense medications to patients.
- `activeclinic.pharmacy.review` — Perform pharmacist review of complex prescriptions.
- `activeclinic.inventory.view` — View inventory levels, batches, alerts.
- `activeclinic.inventory.manage` — Receive stock, adjust stock, transfer stock, manage catalogue.
- `activeclinic.pharmacy.audit_view` — View pharmacy audit trail (stock movements, dispense history).

**Default Assignments:**

- `activeclinic_network_admin` → all permissions.
- `activeclinic_facility_admin` → all permissions except `audit_view` (add if facility admins should audit).
- `activeclinic_staff` → **none by default** (explicit assignment required for pharmacy roles).

## Reversal Rules

### Stock Movement Reversal

- **Use case:** Incorrect dispense recorded, batch entry error, physical count correction.
- **Mechanism:**
  1. Create new `stock_movements` row with `movement_type = 'reversal'` and `reverses_movement_id = <original_movement_id>`.
  2. `quantity_delta` is opposite sign of original movement.
  3. `reason` is required.
- **Constraints:**
  - Original movement cannot be deleted.
  - Reversals are append-only.
  - System prevents reversal if it would cause negative stock.

### Dispense Reversal

- **Product decision for P05:** Dispense reversal not implemented in UI.
- **Manual workaround:** Staff creates stock adjustment with reason "dispense reversal for event X", manually updates prescription status if needed.
- **Future:** P06 or later may implement formal dispense reversal workflow with return-to-stock logic.

## Audit Trail

All pharmacy transactions are auditable via:

1. `stock_movements` (append-only)
2. `dispense_events` and `dispense_items` (append-only)
3. `pharmacy_prescriptions` and `pharmacy_prescription_items` (versioned for updates)

**Audit queries:**
- "Who dispensed medication X to patient Y on date Z?"
- "What stock movements occurred for inventory item X in date range?"
- "Which batches were used for dispense event X?"

## Integration with P04 Clinical

**Link:** `clinical_orders` (type = prescription) → `pharmacy_prescriptions`

**When clinical order is submitted:**
1. Clinical service creates `clinical_orders` row with `status = 'submitted'`.
2. Pharmacy service queries `clinical_orders` where `order_type = 'prescription' AND status = 'submitted'` to populate pharmacy queue.
3. When pharmacy creates `pharmacy_prescriptions`, it sets `clinical_order_id`.
4. Optional: Pharmacy service updates `clinical_orders.status` to `'in_progress'` or custom pharmacy fulfillment status (out of scope for minimal P05; document as PRODUCT_DECISION).

## Purchase Orders

**Status:** PRODUCT_DECISION / PARTIAL

**Rationale:** Stitch includes "Pharmacy Purchase Orders" screen (`0f1976955fc14d8c97f1f8c728b4e1da`), but full procurement workflow (supplier catalogue, PO approval, receiving against PO) is large scope.

**P05 Approach:**
- **If PO tracking is needed:** Create minimal `purchase_orders` table with fields: `id`, `organization_id`, `healthcare_organization_id`, `facility_id`, `po_number`, `supplier_name`, `requested_by_staff_id`, `status` (draft, submitted, received, cancelled), `created_at`, `updated_at`.
- **Link to stock receive:** `stock_movements.reference_type = 'purchase'` and `reference_id = <purchase_order_id>`.
- **No PO line items table** in P05 unless Stitch screen absolutely requires it (inspect during implementation).
- **Alternative:** If Stitch PO screen is read-only or summary-only, mark PRODUCT_DECISION and defer full procurement to later phase.

## Medicine Substitution

**Status:** PRODUCT_DECISION unless simple swap-with-reason is safe.

**Rationale:** Stitch includes "Medicine Substitution" screen (`e237cd030fb241deb15ed8eb0f4f895e`), but therapeutic substitution requires clinical knowledge and regulatory compliance.

**P05 Approach:**
- **If screen is for generic swap only:** Allow `pharmacy_prescription_items.substituted_with_medication_id` and `substitution_reason`.
- **Workflow:**
  1. Pharmacist selects prescription item.
  2. Searches catalogue for alternative (same generic name, different brand).
  3. Confirms substitution with reason (e.g., "original out of stock").
  4. System updates prescription item with substitution.
- **Block therapeutic substitution** (different generic name) unless explicitly requested by user and signed off by clinical lead.

## Advanced Features (Blocked in P05)

**Drug Interaction Checking:** BLOCKED — No automated CDS in P05. Manual review flag supported.

**Controlled Drug Register:** BLOCKED — Basic audit trail present, but no specialized controlled substance workflows (dual signature, lockbox tracking) in P05.

**Automated Reordering:** BLOCKED — Low stock alerts supported, but no automated PO generation.

**Barcode Scanning:** Out of scope for P05 (no device integration). Manual entry only.

**Patient Medication History (Longitudinal):** Minimal — Dispense events are recorded, but no cross-facility medication reconciliation in P05.

## Testing Requirements

**`tests/activeclinic-pharmacy-foundation.test.js` must cover:**

1. **Catalogue Management:**
   - Add medication to catalogue.
   - Prevent duplicate (same generic, strength, form).

2. **Stock Receive:**
   - Receive stock creates inventory item, batch, movement.
   - Inventory quantity updated correctly.

3. **Stock Adjustment:**
   - Positive adjustment increases stock.
   - Negative adjustment decreases stock.
   - Prevents negative stock.

4. **Stock Transfer:**
   - Transfer out decrements source.
   - Transfer in increments destination.
   - Tenant isolation (cannot transfer between different HCOs).

5. **Prescription Load:**
   - Clinical order with type prescription appears in pharmacy queue.

6. **Dispense Auth:**
   - User without `activeclinic.pharmacy.dispense` permission cannot dispense.
   - User with permission can dispense.

7. **Full Dispense:**
   - All prescription items in stock.
   - Dispense event created, stock decremented.
   - Prescription status → `dispensed`.

8. **Partial Dispense:**
   - Some items unavailable.
   - Dispense partial quantity.
   - Prescription status → `partially_dispensed`.

9. **Insufficient Stock:**
   - Attempt to dispense more than available.
   - System rejects or allows partial.

10. **Expired Batch Handling:**
    - System alerts or blocks dispense from expired batch.

11. **Movement History:**
    - Query stock movements for inventory item.
    - Verify append-only (no deletes).

12. **Reversal:**
    - Create reversal movement.
    - Verify quantity updated correctly.
    - Prevents reversal causing negative stock.

13. **Tenant Isolation:**
    - Tenant A cannot view/dispense Tenant B's prescriptions.
    - Tenant A cannot access Tenant B's inventory.

14. **CSRF:**
    - POST requests without CSRF token rejected.

15. **Audit:**
    - Dispense event records `dispensed_by_staff_id`.
    - Stock movements record `performed_by_staff_id`.

16. **No BlessBoard Mutation:**
    - Pharmacy operations do not modify BlessBoard church data.

**Light UI Smoke Test:**
- Navigate to `/app/pharmacy` (dashboard).
- Verify pharmacy nav item visible with permission.
- Load prescription queue screen.
- Load inventory list screen.

## Screen Status Tracking

**Honest statuses in `ACTIVECLINIC_STITCH_PHASE_05.md`:**

- `COMPLETE` — Only if implemented route, loader, view, form handling, and browser-verified parity with Stitch.
- `PARTIAL` — Implemented backend/route but UI incomplete or not all variants (D/M) done.
- `PRODUCT_DECISION` — Stitch screen present but workflow unsafe or requires product decision (e.g., medicine substitution, PO approval).
- `BLOCKED` — Advanced clinical feature that cannot be safely implemented without external systems (e.g., drug interaction API).
- `SCHEMA_BLOCKED` — Removed after P05 migration; use PARTIAL/BLOCKED only.

**Never claim COMPLETE without browser parity.**

## Future Enhancements (Post-P05)

1. **Barcode Scanning:** Device integration for batch/medication lookup.
2. **Automated Interaction Checking:** Integration with external drug database API.
3. **Controlled Substance Register:** Dual-signature workflows, lockbox tracking.
4. **Medication Reconciliation:** Cross-facility/cross-encounter medication history.
5. **Advanced Procurement:** PO line items, supplier catalogue, approval workflows, receiving matching.
6. **Formulary Management:** Organization-specific drug formulary with usage policies.
7. **Batch Recall:** Workflow for recalling specific batches due to quality issues.

## Summary

P05 Pharmacy Domain provides a safe, auditable foundation for medication dispensing and inventory management without attempting clinical decision support or advanced medication safety features that require external systems or specialized clinical oversight. All workflows emphasize manual review, append-only audit logs, and conservative permission defaults.
