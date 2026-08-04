"use strict";

/**
 * ActiveClinic P05 pharmacy service: medication catalogue, inventory, prescriptions, dispensing.
 * Append-only stock movements, batch/expiry tracking, partial dispense support.
 * No automated CDS — manual review only.
 */

const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const {
  authorizeStaffPermission,
} = require("./activeClinicAuthorizationService");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  ACCESS_DENIED: "access_denied",
  MEDICATION_NOT_FOUND: "medication_not_found",
  INVENTORY_ITEM_NOT_FOUND: "inventory_item_not_found",
  BATCH_NOT_FOUND: "batch_not_found",
  PRESCRIPTION_NOT_FOUND: "prescription_not_found",
  PRESCRIPTION_ITEM_NOT_FOUND: "prescription_item_not_found",
  PATIENT_NOT_FOUND: "patient_not_found",
  FACILITY_NOT_FOUND: "facility_not_found",
  INSUFFICIENT_STOCK: "insufficient_stock",
  EXPIRED_BATCH: "expired_batch",
  INVALID_STATUS: "invalid_status",
  INVALID_TRANSITION: "invalid_transition",
  STALE_VERSION: "stale_version",
  NEGATIVE_STOCK: "negative_stock",
  DUPLICATE_MEDICATION: "duplicate_medication",
  DUPLICATE_BATCH: "duplicate_batch",
});

const PERM = Object.freeze({
  PHARMACY_VIEW: "activeclinic.pharmacy.view",
  PHARMACY_DISPENSE: "activeclinic.pharmacy.dispense",
  PHARMACY_REVIEW: "activeclinic.pharmacy.review",
  INVENTORY_VIEW: "activeclinic.inventory.view",
  INVENTORY_MANAGE: "activeclinic.inventory.manage",
  PHARMACY_AUDIT_VIEW: "activeclinic.pharmacy.audit_view",
});

function mapMedication(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    medicationCode: row.medication_code || null,
    genericName: row.generic_name,
    brandNames: row.brand_names || null,
    strength: row.strength,
    dosageForm: row.dosage_form,
    unitOfMeasure: row.unit_of_measure,
    standardCost: row.standard_cost || null,
    reorderLevel: row.reorder_level || null,
    storageConditions: row.storage_conditions || null,
    notes: row.notes || null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapInventoryItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    facilityId: row.facility_id,
    medicationCatalogueItemId: row.medication_catalogue_item_id,
    currentQuantity: row.current_quantity,
    reorderLevel: row.reorder_level || null,
    reorderQuantity: row.reorder_quantity || null,
    lastRestockedAt: row.last_restocked_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    medicationGenericName: row.medication_generic_name || null,
    medicationStrength: row.medication_strength || null,
    medicationDosageForm: row.medication_dosage_form || null,
    medicationUnit: row.medication_unit || null,
  };
}

function mapInventoryBatch(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    facilityId: row.facility_id,
    inventoryItemId: row.inventory_item_id,
    batchNumber: row.batch_number,
    quantityInBatch: row.quantity_in_batch,
    manufactureDate: row.manufacture_date || null,
    expiryDate: row.expiry_date,
    supplierName: row.supplier_name || null,
    costPerUnit: row.cost_per_unit || null,
    receivedAt: row.received_at,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    medicationGenericName: row.medication_generic_name || null,
    medicationStrength: row.medication_strength || null,
  };
}

function mapStockMovement(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    facilityId: row.facility_id,
    inventoryItemId: row.inventory_item_id,
    inventoryBatchId: row.inventory_batch_id || null,
    movementType: row.movement_type,
    quantityDelta: row.quantity_delta,
    referenceId: row.reference_id || null,
    referenceType: row.reference_type || null,
    reversesMovementId: row.reverses_movement_id || null,
    reason: row.reason || null,
    performedByStaffId: row.performed_by_staff_id,
    createdAt: row.created_at,
    performedByStaffDisplayName: row.performed_by_staff_display_name || null,
    medicationGenericName: row.medication_generic_name || null,
    batchNumber: row.batch_number || null,
  };
}

function mapPharmacyPrescription(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    facilityId: row.facility_id,
    encounterId: row.encounter_id || null,
    patientId: row.patient_id,
    clinicalOrderId: row.clinical_order_id || null,
    prescriberStaffId: row.prescriber_staff_id || null,
    prescriptionNumber: row.prescription_number,
    status: row.status,
    priority: row.priority,
    reviewRequired: row.review_required,
    reviewerStaffId: row.reviewer_staff_id || null,
    reviewedAt: row.reviewed_at || null,
    notes: row.notes || null,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    patientDisplayName: row.patient_display_name || null,
    patientNumber: row.patient_number || null,
    prescriberStaffDisplayName: row.prescriber_staff_display_name || null,
    encounterNumber: row.encounter_number || null,
  };
}

function mapPharmacyPrescriptionItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    pharmacyPrescriptionId: row.pharmacy_prescription_id,
    medicationCatalogueItemId: row.medication_catalogue_item_id,
    quantityOrdered: row.quantity_ordered,
    quantityDispensed: row.quantity_dispensed,
    dosageInstructions: row.dosage_instructions || null,
    substitutionAllowed: row.substitution_allowed,
    substitutedWithMedicationId: row.substituted_with_medication_id || null,
    substitutionReason: row.substitution_reason || null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    medicationGenericName: row.medication_generic_name || null,
    medicationStrength: row.medication_strength || null,
    medicationDosageForm: row.medication_dosage_form || null,
    medicationUnit: row.medication_unit || null,
  };
}

function mapDispenseEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    facilityId: row.facility_id,
    pharmacyPrescriptionId: row.pharmacy_prescription_id,
    patientId: row.patient_id,
    dispenseType: row.dispense_type,
    dispensedByStaffId: row.dispensed_by_staff_id,
    dispensedAt: row.dispensed_at,
    patientAcknowledged: row.patient_acknowledged,
    counselingProvided: row.counseling_provided,
    counselingNotes: row.counseling_notes || null,
    createdAt: row.created_at,
    dispensedByStaffDisplayName: row.dispensed_by_staff_display_name || null,
    patientDisplayName: row.patient_display_name || null,
    prescriptionNumber: row.prescription_number || null,
  };
}

function mapDispenseItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    dispenseEventId: row.dispense_event_id,
    pharmacyPrescriptionItemId: row.pharmacy_prescription_item_id,
    inventoryBatchId: row.inventory_batch_id,
    quantityDispensed: row.quantity_dispensed,
    createdAt: row.created_at,
    medicationGenericName: row.medication_generic_name || null,
    medicationStrength: row.medication_strength || null,
    batchNumber: row.batch_number || null,
    expiryDate: row.expiry_date || null,
  };
}

/**
 * Add medication to catalogue.
 * Permission: activeclinic.inventory.manage
 */
async function addMedication(pool, input) {
  const {
    staffId,
    organizationId,
    healthcareOrganizationId,
    medicationCode,
    genericName,
    brandNames,
    strength,
    dosageForm,
    unitOfMeasure,
    standardCost,
    reorderLevel,
    storageConditions,
    notes,
  } = input;

  if (!staffId || !organizationId || !healthcareOrganizationId || !genericName || !strength || !dosageForm || !unitOfMeasure) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  const authResult = await authorizeStaffPermission(pool, {
    organizationId,
    staffMemberId: staffId,
    permissionKey: PERM.INVENTORY_MANAGE,
    facilityId: input.facilityId || null,
  });
  if (!authResult.ok) {
    return { ok: false, result: RESULT.ACCESS_DENIED };
  }

  try {
    const existing = await pool.query(
      `SELECT id FROM activeclinic.medication_catalogue_items
       WHERE healthcare_organization_id = $1
         AND generic_name = $2
         AND strength = $3
         AND dosage_form = $4`,
      [healthcareOrganizationId, genericName, strength, dosageForm]
    );

    if (existing.rows.length > 0) {
      return { ok: false, result: RESULT.DUPLICATE_MEDICATION };
    }

    const insertResult = await pool.query(
      `INSERT INTO activeclinic.medication_catalogue_items (
        organization_id, healthcare_organization_id, medication_code, generic_name,
        brand_names, strength, dosage_form, unit_of_measure, standard_cost,
        reorder_level, storage_conditions, notes, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active')
      RETURNING *`,
      [
        organizationId,
        healthcareOrganizationId,
        medicationCode || null,
        genericName,
        brandNames ? JSON.stringify(brandNames) : null,
        strength,
        dosageForm,
        unitOfMeasure,
        standardCost || null,
        reorderLevel || null,
        storageConditions || null,
        notes || null,
      ]
    );

    const medication = mapMedication(insertResult.rows[0]);

    await recordAuditEventSafe(pool, {
      organizationId,
      eventType: "activeclinic.medication_added",
      actorType: "staff_member",
      actorId: staffId,
      resourceType: "medication",
      resourceId: medication.id,
      eventMetadata: {
        genericName: medication.genericName,
        strength: medication.strength,
        dosageForm: medication.dosageForm,
      },
    });

    return { ok: true, result: RESULT.OK, medication };
  } catch (err) {
    console.error("[addMedication] Error:", err);
    return { ok: false, result: RESULT.INVALID_INPUT, error: err.message };
  }
}

/**
 * List medications in catalogue.
 * Permission: activeclinic.inventory.view
 */
async function listMedications(pool, input) {
  const { staffId, organizationId, healthcareOrganizationId, status } = input;

  if (!staffId || !organizationId || !healthcareOrganizationId) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  const authResult = await authorizeStaffPermission(pool, {
    organizationId,
    staffMemberId: staffId,
    permissionKey: PERM.INVENTORY_VIEW,
    facilityId: input.facilityId || null,
  });
  if (!authResult.ok) {
    return { ok: false, result: RESULT.ACCESS_DENIED };
  }

  const statusFilter = status || "active";

  const result = await pool.query(
    `SELECT * FROM activeclinic.medication_catalogue_items
     WHERE healthcare_organization_id = $1
       AND status = $2
     ORDER BY generic_name, strength`,
    [healthcareOrganizationId, statusFilter]
  );

  const medications = result.rows.map(mapMedication);

  return { ok: true, result: RESULT.OK, medications };
}

/**
 * Get medication by ID.
 * Permission: activeclinic.inventory.view
 */
async function getMedicationById(pool, input) {
  const { staffId, organizationId, medicationId } = input;

  if (!staffId || !organizationId || !medicationId) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  const authResult = await authorizeStaffPermission(pool, {
    organizationId,
    staffMemberId: staffId,
    permissionKey: PERM.INVENTORY_VIEW,
    facilityId: input.facilityId || null,
  });
  if (!authResult.ok) {
    return { ok: false, result: RESULT.ACCESS_DENIED };
  }

  const result = await pool.query(
    `SELECT * FROM activeclinic.medication_catalogue_items
     WHERE id = $1 AND organization_id = $2`,
    [medicationId, organizationId]
  );

  if (result.rows.length === 0) {
    return { ok: false, result: RESULT.MEDICATION_NOT_FOUND };
  }

  const medication = mapMedication(result.rows[0]);

  return { ok: true, result: RESULT.OK, medication };
}

/**
 * Receive stock (creates/updates inventory item, creates batch, creates stock movement).
 * Permission: activeclinic.inventory.manage
 */
async function receiveStock(pool, input) {
  const {
    staffId,
    organizationId,
    healthcareOrganizationId,
    facilityId,
    medicationCatalogueItemId,
    batchNumber,
    quantity,
    manufactureDate,
    expiryDate,
    supplierName,
    costPerUnit,
  } = input;

  if (!staffId || !organizationId || !healthcareOrganizationId || !facilityId || !medicationCatalogueItemId || !batchNumber || !quantity || !expiryDate) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  if (quantity <= 0) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  const authResult = await authorizeStaffPermission(pool, {
    organizationId,
    staffMemberId: staffId,
    permissionKey: PERM.INVENTORY_MANAGE,
    facilityId: input.facilityId || null,
  });
  if (!authResult.ok) {
    return { ok: false, result: RESULT.ACCESS_DENIED };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Check medication exists.
    const medicationCheck = await client.query(
      `SELECT id FROM activeclinic.medication_catalogue_items
       WHERE id = $1 AND healthcare_organization_id = $2`,
      [medicationCatalogueItemId, healthcareOrganizationId]
    );

    if (medicationCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, result: RESULT.MEDICATION_NOT_FOUND };
    }

    // Check batch uniqueness.
    const batchCheck = await client.query(
      `SELECT id FROM activeclinic.inventory_batches
       WHERE facility_id = $1 AND inventory_item_id IN (
         SELECT id FROM activeclinic.inventory_items WHERE medication_catalogue_item_id = $2
       ) AND batch_number = $3`,
      [facilityId, medicationCatalogueItemId, batchNumber]
    );

    if (batchCheck.rows.length > 0) {
      await client.query("ROLLBACK");
      return { ok: false, result: RESULT.DUPLICATE_BATCH };
    }

    // Get or create inventory item.
    let inventoryItemResult = await client.query(
      `SELECT * FROM activeclinic.inventory_items
       WHERE facility_id = $1 AND medication_catalogue_item_id = $2`,
      [facilityId, medicationCatalogueItemId]
    );

    let inventoryItem;

    if (inventoryItemResult.rows.length === 0) {
      const insertInventoryItem = await client.query(
        `INSERT INTO activeclinic.inventory_items (
          organization_id, healthcare_organization_id, facility_id, medication_catalogue_item_id, current_quantity
        ) VALUES ($1, $2, $3, $4, 0)
        RETURNING *`,
        [organizationId, healthcareOrganizationId, facilityId, medicationCatalogueItemId]
      );
      inventoryItem = mapInventoryItem(insertInventoryItem.rows[0]);
    } else {
      inventoryItem = mapInventoryItem(inventoryItemResult.rows[0]);
    }

    // Create batch.
    const batchResult = await client.query(
      `INSERT INTO activeclinic.inventory_batches (
        organization_id, healthcare_organization_id, facility_id, inventory_item_id,
        batch_number, quantity_in_batch, manufacture_date, expiry_date, supplier_name, cost_per_unit, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'available')
      RETURNING *`,
      [
        organizationId,
        healthcareOrganizationId,
        facilityId,
        inventoryItem.id,
        batchNumber,
        quantity,
        manufactureDate || null,
        expiryDate,
        supplierName || null,
        costPerUnit || null,
      ]
    );

    const batch = mapInventoryBatch(batchResult.rows[0]);

    // Create stock movement.
    const movementResult = await client.query(
      `INSERT INTO activeclinic.stock_movements (
        organization_id, healthcare_organization_id, facility_id, inventory_item_id,
        inventory_batch_id, movement_type, quantity_delta, reference_type, performed_by_staff_id
      ) VALUES ($1, $2, $3, $4, $5, 'receive', $6, 'purchase', $7)
      RETURNING *`,
      [organizationId, healthcareOrganizationId, facilityId, inventoryItem.id, batch.id, quantity, staffId]
    );

    const movement = mapStockMovement(movementResult.rows[0]);

    // Update last_restocked_at.
    await client.query(
      `UPDATE activeclinic.inventory_items SET last_restocked_at = now() WHERE id = $1`,
      [inventoryItem.id]
    );

    await client.query("COMMIT");

    await recordAuditEventSafe(pool, {
      organizationId,
      eventType: "activeclinic.stock_received",
      actorType: "staff_member",
      actorId: staffId,
      resourceType: "inventory_item",
      resourceId: inventoryItem.id,
      eventMetadata: {
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        quantity,
      },
    });

    return { ok: true, result: RESULT.OK, inventoryItem, batch, movement };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[receiveStock] Error:", err);
    return { ok: false, result: RESULT.INVALID_INPUT, error: err.message };
  } finally {
    client.release();
  }
}

/**
 * List inventory items for a facility.
 * Permission: activeclinic.inventory.view
 */
async function listInventoryItems(pool, input) {
  const { staffId, organizationId, facilityId } = input;

  if (!staffId || !organizationId || !facilityId) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  const authResult = await authorizeStaffPermission(pool, {
    organizationId,
    staffMemberId: staffId,
    permissionKey: PERM.INVENTORY_VIEW,
    facilityId: input.facilityId || null,
  });
  if (!authResult.ok) {
    return { ok: false, result: RESULT.ACCESS_DENIED };
  }

  const result = await pool.query(
    `SELECT ii.*,
       mci.generic_name AS medication_generic_name,
       mci.strength AS medication_strength,
       mci.dosage_form AS medication_dosage_form,
       mci.unit_of_measure AS medication_unit
     FROM activeclinic.inventory_items ii
     JOIN activeclinic.medication_catalogue_items mci ON ii.medication_catalogue_item_id = mci.id
     WHERE ii.facility_id = $1
     ORDER BY mci.generic_name, mci.strength`,
    [facilityId]
  );

  const inventoryItems = result.rows.map(mapInventoryItem);

  return { ok: true, result: RESULT.OK, inventoryItems };
}

/**
 * List low stock items.
 * Permission: activeclinic.inventory.view
 */
async function listLowStockItems(pool, input) {
  const { staffId, organizationId, facilityId } = input;

  if (!staffId || !organizationId || !facilityId) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  const authResult = await authorizeStaffPermission(pool, {
    organizationId,
    staffMemberId: staffId,
    permissionKey: PERM.INVENTORY_VIEW,
    facilityId: input.facilityId || null,
  });
  if (!authResult.ok) {
    return { ok: false, result: RESULT.ACCESS_DENIED };
  }

  const result = await pool.query(
    `SELECT ii.*,
       mci.generic_name AS medication_generic_name,
       mci.strength AS medication_strength,
       mci.dosage_form AS medication_dosage_form,
       mci.unit_of_measure AS medication_unit
     FROM activeclinic.inventory_items ii
     JOIN activeclinic.medication_catalogue_items mci ON ii.medication_catalogue_item_id = mci.id
     WHERE ii.facility_id = $1
       AND ii.reorder_level IS NOT NULL
       AND ii.current_quantity <= ii.reorder_level
       AND ii.current_quantity > 0
     ORDER BY ii.current_quantity ASC, mci.generic_name`,
    [facilityId]
  );

  const lowStockItems = result.rows.map(mapInventoryItem);

  return { ok: true, result: RESULT.OK, lowStockItems };
}

/**
 * List expiring batches (next 90 days).
 * Permission: activeclinic.inventory.view
 */
async function listExpiringBatches(pool, input) {
  const { staffId, organizationId, facilityId } = input;

  if (!staffId || !organizationId || !facilityId) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  const authResult = await authorizeStaffPermission(pool, {
    organizationId,
    staffMemberId: staffId,
    permissionKey: PERM.INVENTORY_VIEW,
    facilityId: input.facilityId || null,
  });
  if (!authResult.ok) {
    return { ok: false, result: RESULT.ACCESS_DENIED };
  }

  const result = await pool.query(
    `SELECT ib.*,
       mci.generic_name AS medication_generic_name,
       mci.strength AS medication_strength
     FROM activeclinic.inventory_batches ib
     JOIN activeclinic.inventory_items ii ON ib.inventory_item_id = ii.id
     JOIN activeclinic.medication_catalogue_items mci ON ii.medication_catalogue_item_id = mci.id
     WHERE ib.facility_id = $1
       AND ib.status = 'available'
       AND ib.expiry_date <= (now() + interval '90 days')
     ORDER BY ib.expiry_date ASC`,
    [facilityId]
  );

  const expiringBatches = result.rows.map(mapInventoryBatch);

  return { ok: true, result: RESULT.OK, expiringBatches };
}

/**
 * List prescription queue for facility.
 * Permission: activeclinic.pharmacy.view
 */
async function listPrescriptionQueue(pool, input) {
  const { staffId, organizationId, facilityId, status } = input;

  if (!staffId || !organizationId || !facilityId) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  const authResult = await authorizeStaffPermission(pool, {
    organizationId,
    staffMemberId: staffId,
    permissionKey: PERM.PHARMACY_VIEW,
    facilityId: input.facilityId || null,
  });
  if (!authResult.ok) {
    return { ok: false, result: RESULT.ACCESS_DENIED };
  }

  const statusFilter = status || "pending";

  const result = await pool.query(
    `SELECT pp.*,
       p.patient_number,
       COALESCE(p.first_name || ' ' || p.last_name, p.first_name, p.last_name) AS patient_display_name,
       sm.display_name AS prescriber_staff_display_name,
       e.encounter_number
     FROM activeclinic.pharmacy_prescriptions pp
     JOIN activeclinic.patients p ON pp.patient_id = p.id
     LEFT JOIN activeclinic.staff_members sm ON pp.prescriber_staff_id = sm.id
     LEFT JOIN activeclinic.encounters e ON pp.encounter_id = e.id
     WHERE pp.facility_id = $1
       AND pp.status = $2
     ORDER BY pp.priority DESC, pp.created_at ASC`,
    [facilityId, statusFilter]
  );

  const prescriptions = result.rows.map(mapPharmacyPrescription);

  return { ok: true, result: RESULT.OK, prescriptions };
}

/**
 * Get prescription by ID with items.
 * Permission: activeclinic.pharmacy.view
 */
async function getPrescriptionById(pool, input) {
  const { staffId, organizationId, prescriptionId } = input;

  if (!staffId || !organizationId || !prescriptionId) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  const authResult = await authorizeStaffPermission(pool, {
    organizationId,
    staffMemberId: staffId,
    permissionKey: PERM.PHARMACY_VIEW,
    facilityId: input.facilityId || null,
  });
  if (!authResult.ok) {
    return { ok: false, result: RESULT.ACCESS_DENIED };
  }

  const prescriptionResult = await pool.query(
    `SELECT pp.*,
       p.patient_number,
       COALESCE(p.first_name || ' ' || p.last_name, p.first_name, p.last_name) AS patient_display_name,
       sm.display_name AS prescriber_staff_display_name,
       e.encounter_number
     FROM activeclinic.pharmacy_prescriptions pp
     JOIN activeclinic.patients p ON pp.patient_id = p.id
     LEFT JOIN activeclinic.staff_members sm ON pp.prescriber_staff_id = sm.id
     LEFT JOIN activeclinic.encounters e ON pp.encounter_id = e.id
     WHERE pp.id = $1 AND pp.organization_id = $2`,
    [prescriptionId, organizationId]
  );

  if (prescriptionResult.rows.length === 0) {
    return { ok: false, result: RESULT.PRESCRIPTION_NOT_FOUND };
  }

  const prescription = mapPharmacyPrescription(prescriptionResult.rows[0]);

  const itemsResult = await pool.query(
    `SELECT ppi.*,
       mci.generic_name AS medication_generic_name,
       mci.strength AS medication_strength,
       mci.dosage_form AS medication_dosage_form,
       mci.unit_of_measure AS medication_unit
     FROM activeclinic.pharmacy_prescription_items ppi
     JOIN activeclinic.medication_catalogue_items mci ON ppi.medication_catalogue_item_id = mci.id
     WHERE ppi.pharmacy_prescription_id = $1
     ORDER BY ppi.created_at`,
    [prescriptionId]
  );

  const items = itemsResult.rows.map(mapPharmacyPrescriptionItem);

  return { ok: true, result: RESULT.OK, prescription, items };
}

/**
 * Dispense prescription (full or partial).
 * Permission: activeclinic.pharmacy.dispense
 * 
 * Input: { itemDispenses: [ { prescriptionItemId, quantityToDispense, batchId }, ... ] }
 */
async function dispensePrescription(pool, input) {
  const {
    staffId,
    organizationId,
    prescriptionId,
    itemDispenses, // Array of { prescriptionItemId, quantityToDispense, batchId }
    dispenseType, // 'full' or 'partial'
    patientAcknowledged,
    counselingProvided,
    counselingNotes,
  } = input;

  if (!staffId || !organizationId || !prescriptionId || !itemDispenses || itemDispenses.length === 0) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  const authResult = await authorizeStaffPermission(pool, {
    organizationId,
    staffMemberId: staffId,
    permissionKey: PERM.PHARMACY_DISPENSE,
    facilityId: input.facilityId || null,
  });
  if (!authResult.ok) {
    return { ok: false, result: RESULT.ACCESS_DENIED };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Load prescription.
    const prescriptionResult = await client.query(
      `SELECT * FROM activeclinic.pharmacy_prescriptions
       WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      [prescriptionId, organizationId]
    );

    if (prescriptionResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, result: RESULT.PRESCRIPTION_NOT_FOUND };
    }

    const prescription = mapPharmacyPrescription(prescriptionResult.rows[0]);

    if (!["pending", "in_preparation", "partially_dispensed"].includes(prescription.status)) {
      await client.query("ROLLBACK");
      return { ok: false, result: RESULT.INVALID_STATUS };
    }

    // Create dispense event.
    const dispenseEventResult = await client.query(
      `INSERT INTO activeclinic.dispense_events (
        organization_id, healthcare_organization_id, facility_id, pharmacy_prescription_id, patient_id,
        dispense_type, dispensed_by_staff_id, dispensed_at, patient_acknowledged, counseling_provided, counseling_notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8, $9, $10)
      RETURNING *`,
      [
        organizationId,
        prescription.healthcareOrganizationId,
        prescription.facilityId,
        prescriptionId,
        prescription.patientId,
        dispenseType || "full",
        staffId,
        patientAcknowledged || false,
        counselingProvided || false,
        counselingNotes || null,
      ]
    );

    const dispenseEvent = mapDispenseEvent(dispenseEventResult.rows[0]);

    // Process each item dispense.
    for (const itemDispense of itemDispenses) {
      const { prescriptionItemId, quantityToDispense, batchId } = itemDispense;

      if (!prescriptionItemId || !quantityToDispense || !batchId || quantityToDispense <= 0) {
        await client.query("ROLLBACK");
        return { ok: false, result: RESULT.INVALID_INPUT };
      }

      // Load prescription item.
      const itemResult = await client.query(
        `SELECT * FROM activeclinic.pharmacy_prescription_items
         WHERE id = $1 AND pharmacy_prescription_id = $2 FOR UPDATE`,
        [prescriptionItemId, prescriptionId]
      );

      if (itemResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return { ok: false, result: RESULT.PRESCRIPTION_ITEM_NOT_FOUND };
      }

      const prescriptionItem = mapPharmacyPrescriptionItem(itemResult.rows[0]);

      const remainingQuantity = prescriptionItem.quantityOrdered - prescriptionItem.quantityDispensed;

      if (quantityToDispense > remainingQuantity) {
        await client.query("ROLLBACK");
        return { ok: false, result: RESULT.INVALID_INPUT };
      }

      // Load batch.
      const batchResult = await client.query(
        `SELECT * FROM activeclinic.inventory_batches
         WHERE id = $1 AND healthcare_organization_id = $2`,
        [batchId, prescription.healthcareOrganizationId]
      );

      if (batchResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return { ok: false, result: RESULT.BATCH_NOT_FOUND };
      }

      const batch = mapInventoryBatch(batchResult.rows[0]);

      if (batch.status !== "available") {
        await client.query("ROLLBACK");
        return { ok: false, result: RESULT.EXPIRED_BATCH };
      }

      if (new Date(batch.expiryDate) < new Date()) {
        await client.query("ROLLBACK");
        return { ok: false, result: RESULT.EXPIRED_BATCH };
      }

      // Load inventory item to check stock.
      const inventoryItemResult = await client.query(
        `SELECT * FROM activeclinic.inventory_items
         WHERE id = $1 FOR UPDATE`,
        [batch.inventoryItemId]
      );

      if (inventoryItemResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return { ok: false, result: RESULT.INVENTORY_ITEM_NOT_FOUND };
      }

      const inventoryItem = mapInventoryItem(inventoryItemResult.rows[0]);

      if (inventoryItem.currentQuantity < quantityToDispense) {
        await client.query("ROLLBACK");
        return { ok: false, result: RESULT.INSUFFICIENT_STOCK };
      }

      // Create dispense item.
      await client.query(
        `INSERT INTO activeclinic.dispense_items (
          organization_id, healthcare_organization_id, dispense_event_id, pharmacy_prescription_item_id,
          inventory_batch_id, quantity_dispensed
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [organizationId, prescription.healthcareOrganizationId, dispenseEvent.id, prescriptionItemId, batchId, quantityToDispense]
      );

      // Create stock movement (dispense_decrement).
      await client.query(
        `INSERT INTO activeclinic.stock_movements (
          organization_id, healthcare_organization_id, facility_id, inventory_item_id,
          inventory_batch_id, movement_type, quantity_delta, reference_id, reference_type, performed_by_staff_id
        ) VALUES ($1, $2, $3, $4, $5, 'dispense_decrement', $6, $7, 'dispense', $8)`,
        [
          organizationId,
          prescription.healthcareOrganizationId,
          prescription.facilityId,
          inventoryItem.id,
          batchId,
          -quantityToDispense,
          dispenseEvent.id,
          staffId,
        ]
      );

      // Update prescription item quantity_dispensed.
      const newQuantityDispensed = prescriptionItem.quantityDispensed + quantityToDispense;
      const newItemStatus = newQuantityDispensed >= prescriptionItem.quantityOrdered ? "dispensed" : "partially_dispensed";

      await client.query(
        `UPDATE activeclinic.pharmacy_prescription_items
         SET quantity_dispensed = $1, status = $2
         WHERE id = $3`,
        [newQuantityDispensed, newItemStatus, prescriptionItemId]
      );
    }

    // Update prescription status.
    const allItemsResult = await client.query(
      `SELECT status FROM activeclinic.pharmacy_prescription_items WHERE pharmacy_prescription_id = $1`,
      [prescriptionId]
    );

    const allItemStatuses = allItemsResult.rows.map((r) => r.status);
    const allDispensed = allItemStatuses.every((s) => s === "dispensed");
    const anyDispensed = allItemStatuses.some((s) => s === "dispensed" || s === "partially_dispensed");

    let newPrescriptionStatus = prescription.status;
    if (allDispensed) {
      newPrescriptionStatus = "dispensed";
    } else if (anyDispensed) {
      newPrescriptionStatus = "partially_dispensed";
    }

    await client.query(
      `UPDATE activeclinic.pharmacy_prescriptions
       SET status = $1, version = version + 1
       WHERE id = $2`,
      [newPrescriptionStatus, prescriptionId]
    );

    await client.query("COMMIT");

    await recordAuditEventSafe(pool, {
      organizationId,
      eventType: "activeclinic.prescription_dispensed",
      actorType: "staff_member",
      actorId: staffId,
      resourceType: "pharmacy_prescription",
      resourceId: prescriptionId,
      eventMetadata: {
        dispenseEventId: dispenseEvent.id,
        dispenseType: dispenseEvent.dispenseType,
        itemCount: itemDispenses.length,
      },
    });

    return { ok: true, result: RESULT.OK, dispenseEvent };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[dispensePrescription] Error:", err);
    return { ok: false, result: RESULT.INVALID_INPUT, error: err.message };
  } finally {
    client.release();
  }
}

/**
 * Create pharmacy prescription from clinical order (for testing/manual creation).
 * Permission: activeclinic.pharmacy.view (for manual queue creation; in production, automated from clinical orders).
 */
async function createPharmacyPrescription(pool, input) {
  const {
    staffId,
    organizationId,
    healthcareOrganizationId,
    facilityId,
    patientId,
    encounterId,
    clinicalOrderId,
    prescriberStaffId,
    priority,
    reviewRequired,
    items, // Array of { medicationCatalogueItemId, quantityOrdered, dosageInstructions }
  } = input;

  if (!staffId || !organizationId || !healthcareOrganizationId || !facilityId || !patientId || !items || items.length === 0) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  const authResult = await authorizeStaffPermission(pool, {
    organizationId,
    staffMemberId: staffId,
    permissionKey: PERM.PHARMACY_VIEW,
    facilityId: input.facilityId || null,
  });
  if (!authResult.ok) {
    return { ok: false, result: RESULT.ACCESS_DENIED };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Generate prescription number.
    const countResult = await client.query(
      `SELECT COUNT(*) FROM activeclinic.pharmacy_prescriptions WHERE facility_id = $1`,
      [facilityId]
    );
    const prescriptionNumber = `RX${String(parseInt(countResult.rows[0].count, 10) + 1).padStart(6, "0")}`;

    // Create prescription.
    const prescriptionResult = await client.query(
      `INSERT INTO activeclinic.pharmacy_prescriptions (
        organization_id, healthcare_organization_id, facility_id, encounter_id, patient_id,
        clinical_order_id, prescriber_staff_id, prescription_number, status, priority, review_required
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10)
      RETURNING *`,
      [
        organizationId,
        healthcareOrganizationId,
        facilityId,
        encounterId || null,
        patientId,
        clinicalOrderId || null,
        prescriberStaffId || null,
        prescriptionNumber,
        priority || "normal",
        reviewRequired || false,
      ]
    );

    const prescription = mapPharmacyPrescription(prescriptionResult.rows[0]);

    // Create prescription items.
    for (const item of items) {
      const { medicationCatalogueItemId, quantityOrdered, dosageInstructions } = item;

      if (!medicationCatalogueItemId || !quantityOrdered || quantityOrdered <= 0) {
        await client.query("ROLLBACK");
        return { ok: false, result: RESULT.INVALID_INPUT };
      }

      await client.query(
        `INSERT INTO activeclinic.pharmacy_prescription_items (
          organization_id, healthcare_organization_id, pharmacy_prescription_id, medication_catalogue_item_id,
          quantity_ordered, dosage_instructions, status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
        [organizationId, healthcareOrganizationId, prescription.id, medicationCatalogueItemId, quantityOrdered, dosageInstructions || null]
      );
    }

    await client.query("COMMIT");

    await recordAuditEventSafe(pool, {
      organizationId,
      eventType: "activeclinic.prescription_created",
      actorType: "staff_member",
      actorId: staffId,
      resourceType: "pharmacy_prescription",
      resourceId: prescription.id,
      eventMetadata: {
        prescriptionNumber: prescription.prescriptionNumber,
        itemCount: items.length,
      },
    });

    return { ok: true, result: RESULT.OK, prescription };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[createPharmacyPrescription] Error:", err);
    return { ok: false, result: RESULT.INVALID_INPUT, error: err.message };
  } finally {
    client.release();
  }
}

module.exports = {
  RESULT,
  PERM,
  addMedication,
  listMedications,
  getMedicationById,
  receiveStock,
  listInventoryItems,
  listLowStockItems,
  listExpiringBatches,
  listPrescriptionQueue,
  getPrescriptionById,
  dispensePrescription,
  createPharmacyPrescription,
};
