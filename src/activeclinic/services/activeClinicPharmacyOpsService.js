"use strict";

/**
 * ActiveClinic V7 Phase 4 pharmacy ops: stock adjust/transfer, substitution,
 * purchase orders, medicine labels & patient instructions.
 */

const { randomUUID } = require("crypto");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const {
  authorizeStaffPermission,
} = require("./activeClinicAuthorizationService");
const {
  RESULT: BASE_RESULT,
  PERM,
} = require("./activeClinicPharmacyService");

const RESULT = Object.freeze({
  ...BASE_RESULT,
  SUBSTITUTION_NOT_ALLOWED: "substitution_not_allowed",
  PURCHASE_ORDER_NOT_FOUND: "purchase_order_not_found",
  INVALID_PO_STATUS: "invalid_po_status",
  FACILITY_MISMATCH: "facility_mismatch",
});

async function authorizeAnyPermission(pool, input) {
  const { organizationId, staffId, facilityId, permissionKeys } = input;
  let last = { ok: false, result: RESULT.ACCESS_DENIED };
  for (const permissionKey of permissionKeys) {
    const authResult = await authorizeStaffPermission(pool, {
      organizationId,
      staffMemberId: staffId,
      permissionKey,
      facilityId: facilityId || null,
    });
    if (authResult.ok) {
      return authResult;
    }
    last = authResult;
  }
  return last;
}

function mapPurchaseOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    facilityId: row.facility_id,
    poNumber: row.po_number,
    supplierName: row.supplier_name,
    status: row.status,
    notes: row.notes || null,
    createdByStaffId: row.created_by_staff_id,
    submittedAt: row.submitted_at || null,
    receivedAt: row.received_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByStaffDisplayName: row.created_by_staff_display_name || null,
    itemCount: row.item_count != null ? Number(row.item_count) : undefined,
  };
}

function mapPurchaseOrderItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    purchaseOrderId: row.purchase_order_id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    medicationCatalogueItemId: row.medication_catalogue_item_id,
    quantityOrdered: row.quantity_ordered,
    quantityReceived: row.quantity_received,
    unitCost: row.unit_cost != null ? Number(row.unit_cost) : null,
    createdAt: row.created_at,
    medicationGenericName: row.medication_generic_name || null,
    medicationStrength: row.medication_strength || null,
    medicationDosageForm: row.medication_dosage_form || null,
    medicationUnit: row.medication_unit || null,
  };
}

function buildPoNumber() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const suffix = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `PO-${y}${m}${d}-${suffix}`;
}

function isNegativeStockError(err) {
  const msg = err && err.message ? String(err.message) : "";
  return /negative inventory/i.test(msg) || /negative stock/i.test(msg);
}

/**
 * Adjust stock quantity (positive or negative delta).
 * Permission: activeclinic.inventory.manage
 */
async function adjustStock(pool, input) {
  const {
    staffId,
    organizationId,
    healthcareOrganizationId,
    facilityId,
    inventoryItemId,
    medicationCatalogueItemId,
    quantityDelta,
    reason,
  } = input;

  const delta = Number.parseInt(quantityDelta, 10);
  if (
    !staffId ||
    !organizationId ||
    !healthcareOrganizationId ||
    !facilityId ||
    !reason ||
    !Number.isInteger(delta) ||
    delta === 0 ||
    (!inventoryItemId && !medicationCatalogueItemId)
  ) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  if (String(reason).length < 1 || String(reason).length > 500) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  const authResult = await authorizeStaffPermission(pool, {
    organizationId,
    staffMemberId: staffId,
    permissionKey: PERM.INVENTORY_MANAGE,
    facilityId,
  });
  if (!authResult.ok) {
    return { ok: false, result: RESULT.ACCESS_DENIED };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let itemResult;
    if (inventoryItemId) {
      itemResult = await client.query(
        `SELECT * FROM activeclinic.inventory_items
         WHERE id = $1
           AND organization_id = $2
           AND healthcare_organization_id = $3
           AND facility_id = $4
         FOR UPDATE`,
        [inventoryItemId, organizationId, healthcareOrganizationId, facilityId]
      );
    } else {
      itemResult = await client.query(
        `SELECT * FROM activeclinic.inventory_items
         WHERE medication_catalogue_item_id = $1
           AND organization_id = $2
           AND healthcare_organization_id = $3
           AND facility_id = $4
         FOR UPDATE`,
        [medicationCatalogueItemId, organizationId, healthcareOrganizationId, facilityId]
      );
    }

    if (itemResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, result: RESULT.INVENTORY_ITEM_NOT_FOUND };
    }

    const item = itemResult.rows[0];
    const nextQty = item.current_quantity + delta;
    if (nextQty < 0) {
      await client.query("ROLLBACK");
      return { ok: false, result: RESULT.NEGATIVE_STOCK };
    }

    const movementResult = await client.query(
      `INSERT INTO activeclinic.stock_movements (
        organization_id, healthcare_organization_id, facility_id, inventory_item_id,
        movement_type, quantity_delta, reference_type, reason, performed_by_staff_id
      ) VALUES ($1, $2, $3, $4, 'adjustment', $5, 'adjustment', $6, $7)
      RETURNING *`,
      [
        organizationId,
        healthcareOrganizationId,
        facilityId,
        item.id,
        delta,
        reason,
        staffId,
      ]
    );

    const refreshed = await client.query(
      `SELECT * FROM activeclinic.inventory_items WHERE id = $1`,
      [item.id]
    );

    await client.query("COMMIT");

    await recordAuditEventSafe(pool, {
      organizationId,
      eventType: "activeclinic.stock_adjusted",
      actorType: "staff_member",
      actorId: staffId,
      resourceType: "inventory_item",
      resourceId: item.id,
      eventMetadata: {
        quantityDelta: delta,
        reason,
        previousQuantity: item.current_quantity,
        newQuantity: refreshed.rows[0].current_quantity,
      },
    });

    return {
      ok: true,
      result: RESULT.OK,
      inventoryItem: {
        id: refreshed.rows[0].id,
        currentQuantity: refreshed.rows[0].current_quantity,
        medicationCatalogueItemId: refreshed.rows[0].medication_catalogue_item_id,
        facilityId: refreshed.rows[0].facility_id,
      },
      movement: {
        id: movementResult.rows[0].id,
        movementType: movementResult.rows[0].movement_type,
        quantityDelta: movementResult.rows[0].quantity_delta,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (isNegativeStockError(err)) {
      return { ok: false, result: RESULT.NEGATIVE_STOCK };
    }
    console.error("[adjustStock] Error:", err);
    return { ok: false, result: RESULT.INVALID_INPUT, error: err.message };
  } finally {
    client.release();
  }
}

/**
 * Transfer stock between facilities in the same healthcare organization.
 * Permission: activeclinic.inventory.manage
 */
async function transferStock(pool, input) {
  const {
    staffId,
    organizationId,
    healthcareOrganizationId,
    sourceFacilityId,
    destinationFacilityId,
    medicationCatalogueItemId,
    quantity,
    reason,
  } = input;

  const qty = Number.parseInt(quantity, 10);
  if (
    !staffId ||
    !organizationId ||
    !healthcareOrganizationId ||
    !sourceFacilityId ||
    !destinationFacilityId ||
    !medicationCatalogueItemId ||
    !reason ||
    !Number.isInteger(qty) ||
    qty <= 0
  ) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  if (sourceFacilityId === destinationFacilityId) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  if (String(reason).length < 1 || String(reason).length > 500) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  const authResult = await authorizeStaffPermission(pool, {
    organizationId,
    staffMemberId: staffId,
    permissionKey: PERM.INVENTORY_MANAGE,
    facilityId: sourceFacilityId,
  });
  if (!authResult.ok) {
    return { ok: false, result: RESULT.ACCESS_DENIED };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const facilities = await client.query(
      `SELECT id, organization_id, healthcare_organization_id
       FROM activeclinic.facilities
       WHERE id = ANY($1::uuid[])`,
      [[sourceFacilityId, destinationFacilityId]]
    );

    if (facilities.rows.length !== 2) {
      await client.query("ROLLBACK");
      return { ok: false, result: RESULT.FACILITY_NOT_FOUND };
    }

    for (const fac of facilities.rows) {
      if (
        fac.organization_id !== organizationId ||
        fac.healthcare_organization_id !== healthcareOrganizationId
      ) {
        await client.query("ROLLBACK");
        return { ok: false, result: RESULT.FACILITY_MISMATCH };
      }
    }

    const medCheck = await client.query(
      `SELECT id FROM activeclinic.medication_catalogue_items
       WHERE id = $1 AND healthcare_organization_id = $2 AND organization_id = $3`,
      [medicationCatalogueItemId, healthcareOrganizationId, organizationId]
    );
    if (medCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, result: RESULT.MEDICATION_NOT_FOUND };
    }

    const sourceItemResult = await client.query(
      `SELECT * FROM activeclinic.inventory_items
       WHERE facility_id = $1
         AND medication_catalogue_item_id = $2
         AND organization_id = $3
         AND healthcare_organization_id = $4
       FOR UPDATE`,
      [sourceFacilityId, medicationCatalogueItemId, organizationId, healthcareOrganizationId]
    );

    if (sourceItemResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, result: RESULT.INVENTORY_ITEM_NOT_FOUND };
    }

    const sourceItem = sourceItemResult.rows[0];
    if (sourceItem.current_quantity < qty) {
      await client.query("ROLLBACK");
      return { ok: false, result: RESULT.INSUFFICIENT_STOCK };
    }

    let destItemResult = await client.query(
      `SELECT * FROM activeclinic.inventory_items
       WHERE facility_id = $1
         AND medication_catalogue_item_id = $2
         AND organization_id = $3
         AND healthcare_organization_id = $4
       FOR UPDATE`,
      [destinationFacilityId, medicationCatalogueItemId, organizationId, healthcareOrganizationId]
    );

    let destItem;
    if (destItemResult.rows.length === 0) {
      const inserted = await client.query(
        `INSERT INTO activeclinic.inventory_items (
          organization_id, healthcare_organization_id, facility_id,
          medication_catalogue_item_id, current_quantity
        ) VALUES ($1, $2, $3, $4, 0)
        RETURNING *`,
        [organizationId, healthcareOrganizationId, destinationFacilityId, medicationCatalogueItemId]
      );
      destItem = inserted.rows[0];
    } else {
      destItem = destItemResult.rows[0];
    }

    const transferRef = randomUUID();

    await client.query(
      `INSERT INTO activeclinic.stock_movements (
        organization_id, healthcare_organization_id, facility_id, inventory_item_id,
        movement_type, quantity_delta, reference_id, reference_type, reason, performed_by_staff_id
      ) VALUES ($1, $2, $3, $4, 'transfer_out', $5, $6, 'transfer', $7, $8)`,
      [
        organizationId,
        healthcareOrganizationId,
        sourceFacilityId,
        sourceItem.id,
        -qty,
        transferRef,
        reason,
        staffId,
      ]
    );

    await client.query(
      `INSERT INTO activeclinic.stock_movements (
        organization_id, healthcare_organization_id, facility_id, inventory_item_id,
        movement_type, quantity_delta, reference_id, reference_type, reason, performed_by_staff_id
      ) VALUES ($1, $2, $3, $4, 'transfer_in', $5, $6, 'transfer', $7, $8)`,
      [
        organizationId,
        healthcareOrganizationId,
        destinationFacilityId,
        destItem.id,
        qty,
        transferRef,
        reason,
        staffId,
      ]
    );

    const sourceAfter = await client.query(
      `SELECT current_quantity FROM activeclinic.inventory_items WHERE id = $1`,
      [sourceItem.id]
    );
    const destAfter = await client.query(
      `SELECT current_quantity FROM activeclinic.inventory_items WHERE id = $1`,
      [destItem.id]
    );

    await client.query("COMMIT");

    await recordAuditEventSafe(pool, {
      organizationId,
      eventType: "activeclinic.stock_transferred",
      actorType: "staff_member",
      actorId: staffId,
      resourceType: "inventory_item",
      resourceId: sourceItem.id,
      eventMetadata: {
        sourceFacilityId,
        destinationFacilityId,
        medicationCatalogueItemId,
        quantity: qty,
        reason,
        transferReferenceId: transferRef,
      },
    });

    return {
      ok: true,
      result: RESULT.OK,
      transferReferenceId: transferRef,
      sourceInventoryItem: {
        id: sourceItem.id,
        currentQuantity: sourceAfter.rows[0].current_quantity,
        facilityId: sourceFacilityId,
      },
      destinationInventoryItem: {
        id: destItem.id,
        currentQuantity: destAfter.rows[0].current_quantity,
        facilityId: destinationFacilityId,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (isNegativeStockError(err)) {
      return { ok: false, result: RESULT.NEGATIVE_STOCK };
    }
    console.error("[transferStock] Error:", err);
    return { ok: false, result: RESULT.INVALID_INPUT, error: err.message };
  } finally {
    client.release();
  }
}

/**
 * Substitute a prescription item with another medication.
 * Permission: activeclinic.pharmacy.review OR activeclinic.pharmacy.dispense
 */
async function substitutePrescriptionItem(pool, input) {
  const {
    staffId,
    organizationId,
    healthcareOrganizationId,
    facilityId,
    prescriptionId,
    prescriptionItemId,
    substitutedWithMedicationId,
    substitutionReason,
  } = input;

  if (
    !staffId ||
    !organizationId ||
    !healthcareOrganizationId ||
    !prescriptionId ||
    !prescriptionItemId ||
    !substitutedWithMedicationId ||
    !substitutionReason
  ) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  if (String(substitutionReason).length < 1 || String(substitutionReason).length > 500) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  const authResult = await authorizeAnyPermission(pool, {
    organizationId,
    staffId,
    facilityId: facilityId || null,
    permissionKeys: [PERM.PHARMACY_REVIEW, PERM.PHARMACY_DISPENSE],
  });
  if (!authResult.ok) {
    return { ok: false, result: RESULT.ACCESS_DENIED };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const rxResult = await client.query(
      `SELECT * FROM activeclinic.pharmacy_prescriptions
       WHERE id = $1
         AND organization_id = $2
         AND healthcare_organization_id = $3
       FOR UPDATE`,
      [prescriptionId, organizationId, healthcareOrganizationId]
    );
    if (rxResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, result: RESULT.PRESCRIPTION_NOT_FOUND };
    }

    if (facilityId && rxResult.rows[0].facility_id !== facilityId) {
      await client.query("ROLLBACK");
      return { ok: false, result: RESULT.FACILITY_MISMATCH };
    }

    const itemResult = await client.query(
      `SELECT * FROM activeclinic.pharmacy_prescription_items
       WHERE id = $1
         AND pharmacy_prescription_id = $2
         AND organization_id = $3
       FOR UPDATE`,
      [prescriptionItemId, prescriptionId, organizationId]
    );
    if (itemResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, result: RESULT.PRESCRIPTION_ITEM_NOT_FOUND };
    }

    const item = itemResult.rows[0];
    if (!item.substitution_allowed) {
      await client.query("ROLLBACK");
      return { ok: false, result: RESULT.SUBSTITUTION_NOT_ALLOWED };
    }

    const subMed = await client.query(
      `SELECT id FROM activeclinic.medication_catalogue_items
       WHERE id = $1 AND healthcare_organization_id = $2 AND organization_id = $3`,
      [substitutedWithMedicationId, healthcareOrganizationId, organizationId]
    );
    if (subMed.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, result: RESULT.MEDICATION_NOT_FOUND };
    }

    const updated = await client.query(
      `UPDATE activeclinic.pharmacy_prescription_items
       SET substituted_with_medication_id = $1,
           substitution_reason = $2,
           status = 'substituted'
       WHERE id = $3
       RETURNING *`,
      [substitutedWithMedicationId, substitutionReason, prescriptionItemId]
    );

    await client.query("COMMIT");

    await recordAuditEventSafe(pool, {
      organizationId,
      eventType: "activeclinic.prescription_item_substituted",
      actorType: "staff_member",
      actorId: staffId,
      resourceType: "pharmacy_prescription_item",
      resourceId: prescriptionItemId,
      eventMetadata: {
        prescriptionId,
        originalMedicationId: item.medication_catalogue_item_id,
        substitutedWithMedicationId,
        substitutionReason,
      },
    });

    return {
      ok: true,
      result: RESULT.OK,
      item: {
        id: updated.rows[0].id,
        status: updated.rows[0].status,
        substitutedWithMedicationId: updated.rows[0].substituted_with_medication_id,
        substitutionReason: updated.rows[0].substitution_reason,
        substitutionAllowed: updated.rows[0].substitution_allowed,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[substitutePrescriptionItem] Error:", err);
    return { ok: false, result: RESULT.INVALID_INPUT, error: err.message };
  } finally {
    client.release();
  }
}

/**
 * Create a draft purchase order.
 * Permission: activeclinic.inventory.manage
 */
async function createPurchaseOrder(pool, input) {
  const {
    staffId,
    organizationId,
    healthcareOrganizationId,
    facilityId,
    supplierName,
    notes,
    items,
  } = input;

  if (
    !staffId ||
    !organizationId ||
    !healthcareOrganizationId ||
    !facilityId ||
    !supplierName ||
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  if (String(supplierName).length < 1 || String(supplierName).length > 200) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  const authResult = await authorizeStaffPermission(pool, {
    organizationId,
    staffMemberId: staffId,
    permissionKey: PERM.INVENTORY_MANAGE,
    facilityId,
  });
  if (!authResult.ok) {
    return { ok: false, result: RESULT.ACCESS_DENIED };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let poNumber = buildPoNumber();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const clash = await client.query(
        `SELECT 1 FROM activeclinic.pharmacy_purchase_orders
         WHERE facility_id = $1 AND po_number = $2`,
        [facilityId, poNumber]
      );
      if (clash.rows.length === 0) break;
      poNumber = buildPoNumber();
    }

    const poResult = await client.query(
      `INSERT INTO activeclinic.pharmacy_purchase_orders (
        organization_id, healthcare_organization_id, facility_id,
        po_number, supplier_name, status, notes, created_by_staff_id
      ) VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7)
      RETURNING *`,
      [
        organizationId,
        healthcareOrganizationId,
        facilityId,
        poNumber,
        supplierName,
        notes || null,
        staffId,
      ]
    );

    const po = poResult.rows[0];
    const mappedItems = [];

    for (const line of items) {
      const medicationCatalogueItemId = line.medicationCatalogueItemId;
      const quantityOrdered = Number.parseInt(line.quantityOrdered, 10);
      const unitCost =
        line.unitCost != null && line.unitCost !== ""
          ? Number.parseFloat(line.unitCost)
          : null;

      if (!medicationCatalogueItemId || !Number.isInteger(quantityOrdered) || quantityOrdered <= 0) {
        await client.query("ROLLBACK");
        return { ok: false, result: RESULT.INVALID_INPUT };
      }

      const medCheck = await client.query(
        `SELECT id FROM activeclinic.medication_catalogue_items
         WHERE id = $1 AND healthcare_organization_id = $2 AND organization_id = $3`,
        [medicationCatalogueItemId, healthcareOrganizationId, organizationId]
      );
      if (medCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return { ok: false, result: RESULT.MEDICATION_NOT_FOUND };
      }

      const itemInsert = await client.query(
        `INSERT INTO activeclinic.pharmacy_purchase_order_items (
          purchase_order_id, organization_id, healthcare_organization_id,
          medication_catalogue_item_id, quantity_ordered, unit_cost
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [
          po.id,
          organizationId,
          healthcareOrganizationId,
          medicationCatalogueItemId,
          quantityOrdered,
          unitCost,
        ]
      );
      mappedItems.push(mapPurchaseOrderItem(itemInsert.rows[0]));
    }

    await client.query("COMMIT");

    await recordAuditEventSafe(pool, {
      organizationId,
      eventType: "activeclinic.purchase_order_created",
      actorType: "staff_member",
      actorId: staffId,
      resourceType: "pharmacy_purchase_order",
      resourceId: po.id,
      eventMetadata: {
        poNumber: po.po_number,
        supplierName: po.supplier_name,
        itemCount: mappedItems.length,
      },
    });

    return {
      ok: true,
      result: RESULT.OK,
      purchaseOrder: mapPurchaseOrder(po),
      items: mappedItems,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[createPurchaseOrder] Error:", err);
    return { ok: false, result: RESULT.INVALID_INPUT, error: err.message };
  } finally {
    client.release();
  }
}

/**
 * List purchase orders for a facility.
 * Permission: activeclinic.inventory.view
 */
async function listPurchaseOrders(pool, input) {
  const { staffId, organizationId, healthcareOrganizationId, facilityId, status } = input;

  if (!staffId || !organizationId || !healthcareOrganizationId || !facilityId) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  const authResult = await authorizeStaffPermission(pool, {
    organizationId,
    staffMemberId: staffId,
    permissionKey: PERM.INVENTORY_VIEW,
    facilityId,
  });
  if (!authResult.ok) {
    return { ok: false, result: RESULT.ACCESS_DENIED };
  }

  const params = [facilityId, organizationId, healthcareOrganizationId];
  let statusClause = "";
  if (status) {
    params.push(status);
    statusClause = ` AND po.status = $${params.length}`;
  }

  const result = await pool.query(
    `SELECT po.*,
       sm.display_name AS created_by_staff_display_name,
       (SELECT COUNT(*)::int FROM activeclinic.pharmacy_purchase_order_items poi
         WHERE poi.purchase_order_id = po.id) AS item_count
     FROM activeclinic.pharmacy_purchase_orders po
     LEFT JOIN activeclinic.staff_members sm ON po.created_by_staff_id = sm.id
     WHERE po.facility_id = $1
       AND po.organization_id = $2
       AND po.healthcare_organization_id = $3
       ${statusClause}
     ORDER BY po.created_at DESC`,
    params
  );

  return {
    ok: true,
    result: RESULT.OK,
    purchaseOrders: result.rows.map(mapPurchaseOrder),
  };
}

/**
 * Get a purchase order with line items.
 * Permission: activeclinic.inventory.view
 */
async function getPurchaseOrder(pool, input) {
  const { staffId, organizationId, healthcareOrganizationId, purchaseOrderId, facilityId } = input;

  if (!staffId || !organizationId || !healthcareOrganizationId || !purchaseOrderId) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  const authResult = await authorizeStaffPermission(pool, {
    organizationId,
    staffMemberId: staffId,
    permissionKey: PERM.INVENTORY_VIEW,
    facilityId: facilityId || null,
  });
  if (!authResult.ok) {
    return { ok: false, result: RESULT.ACCESS_DENIED };
  }

  const poResult = await pool.query(
    `SELECT po.*,
       sm.display_name AS created_by_staff_display_name
     FROM activeclinic.pharmacy_purchase_orders po
     LEFT JOIN activeclinic.staff_members sm ON po.created_by_staff_id = sm.id
     WHERE po.id = $1
       AND po.organization_id = $2
       AND po.healthcare_organization_id = $3`,
    [purchaseOrderId, organizationId, healthcareOrganizationId]
  );

  if (poResult.rows.length === 0) {
    return { ok: false, result: RESULT.PURCHASE_ORDER_NOT_FOUND };
  }

  const itemsResult = await pool.query(
    `SELECT poi.*,
       mci.generic_name AS medication_generic_name,
       mci.strength AS medication_strength,
       mci.dosage_form AS medication_dosage_form,
       mci.unit_of_measure AS medication_unit
     FROM activeclinic.pharmacy_purchase_order_items poi
     JOIN activeclinic.medication_catalogue_items mci ON poi.medication_catalogue_item_id = mci.id
     WHERE poi.purchase_order_id = $1
     ORDER BY poi.created_at`,
    [purchaseOrderId]
  );

  return {
    ok: true,
    result: RESULT.OK,
    purchaseOrder: mapPurchaseOrder(poResult.rows[0]),
    items: itemsResult.rows.map(mapPurchaseOrderItem),
  };
}

/**
 * Submit a draft purchase order.
 * Permission: activeclinic.inventory.manage
 */
async function submitPurchaseOrder(pool, input) {
  const {
    staffId,
    organizationId,
    healthcareOrganizationId,
    purchaseOrderId,
    facilityId,
  } = input;

  if (!staffId || !organizationId || !healthcareOrganizationId || !purchaseOrderId) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  const authResult = await authorizeStaffPermission(pool, {
    organizationId,
    staffMemberId: staffId,
    permissionKey: PERM.INVENTORY_MANAGE,
    facilityId: facilityId || null,
  });
  if (!authResult.ok) {
    return { ok: false, result: RESULT.ACCESS_DENIED };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const poResult = await client.query(
      `SELECT * FROM activeclinic.pharmacy_purchase_orders
       WHERE id = $1
         AND organization_id = $2
         AND healthcare_organization_id = $3
       FOR UPDATE`,
      [purchaseOrderId, organizationId, healthcareOrganizationId]
    );

    if (poResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, result: RESULT.PURCHASE_ORDER_NOT_FOUND };
    }

    const po = poResult.rows[0];
    if (facilityId && po.facility_id !== facilityId) {
      await client.query("ROLLBACK");
      return { ok: false, result: RESULT.FACILITY_MISMATCH };
    }

    if (po.status !== "draft") {
      await client.query("ROLLBACK");
      return { ok: false, result: RESULT.INVALID_PO_STATUS };
    }

    const updated = await client.query(
      `UPDATE activeclinic.pharmacy_purchase_orders
       SET status = 'submitted', submitted_at = now(), updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [purchaseOrderId]
    );

    await client.query("COMMIT");

    await recordAuditEventSafe(pool, {
      organizationId,
      eventType: "activeclinic.purchase_order_submitted",
      actorType: "staff_member",
      actorId: staffId,
      resourceType: "pharmacy_purchase_order",
      resourceId: purchaseOrderId,
      eventMetadata: {
        poNumber: updated.rows[0].po_number,
      },
    });

    return {
      ok: true,
      result: RESULT.OK,
      purchaseOrder: mapPurchaseOrder(updated.rows[0]),
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[submitPurchaseOrder] Error:", err);
    return { ok: false, result: RESULT.INVALID_INPUT, error: err.message };
  } finally {
    client.release();
  }
}

async function loadPrescriptionLabelSource(pool, input) {
  const { organizationId, healthcareOrganizationId, prescriptionId } = input;

  const prescriptionResult = await pool.query(
    `SELECT pp.*,
       p.patient_number,
       COALESCE(p.first_name || ' ' || p.last_name, p.first_name, p.last_name) AS patient_display_name
     FROM activeclinic.pharmacy_prescriptions pp
     JOIN activeclinic.patients p ON pp.patient_id = p.id
     WHERE pp.id = $1
       AND pp.organization_id = $2
       AND ($3::uuid IS NULL OR pp.healthcare_organization_id = $3)`,
    [prescriptionId, organizationId, healthcareOrganizationId || null]
  );

  if (prescriptionResult.rows.length === 0) {
    return { ok: false, result: RESULT.PRESCRIPTION_NOT_FOUND };
  }

  const row = prescriptionResult.rows[0];
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

  return {
    ok: true,
    prescription: {
      id: row.id,
      organizationId: row.organization_id,
      healthcareOrganizationId: row.healthcare_organization_id,
      facilityId: row.facility_id,
      prescriptionNumber: row.prescription_number,
      status: row.status,
      patientDisplayName: row.patient_display_name || null,
      patientNumber: row.patient_number || null,
    },
    items: itemsResult.rows.map((item) => ({
      id: item.id,
      medicationGenericName: item.medication_generic_name || null,
      medicationStrength: item.medication_strength || null,
      medicationDosageForm: item.medication_dosage_form || null,
      medicationUnit: item.medication_unit || null,
      quantityOrdered: item.quantity_ordered,
      dosageInstructions: item.dosage_instructions || null,
      substitutedWithMedicationId: item.substituted_with_medication_id || null,
      status: item.status,
    })),
  };
}

/**
 * Structured medicine label payload for print (uses existing dosage_instructions only).
 * Permission: activeclinic.pharmacy.view OR activeclinic.pharmacy.dispense
 */
async function getMedicineLabel(pool, input) {
  const { staffId, organizationId, healthcareOrganizationId, facilityId, prescriptionId } = input;

  if (!staffId || !organizationId || !prescriptionId) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  const authResult = await authorizeAnyPermission(pool, {
    organizationId,
    staffId,
    facilityId: facilityId || null,
    permissionKeys: [PERM.PHARMACY_VIEW, PERM.PHARMACY_DISPENSE],
  });
  if (!authResult.ok) {
    return { ok: false, result: RESULT.ACCESS_DENIED };
  }

  const loaded = await loadPrescriptionLabelSource(pool, {
    organizationId,
    healthcareOrganizationId,
    prescriptionId,
  });
  if (!loaded.ok) {
    return loaded;
  }

  const labels = loaded.items.map((item) => ({
    prescriptionId: loaded.prescription.id,
    prescriptionNumber: loaded.prescription.prescriptionNumber,
    prescriptionItemId: item.id,
    patientDisplayName: loaded.prescription.patientDisplayName,
    patientNumber: loaded.prescription.patientNumber,
    medicationGenericName: item.medicationGenericName,
    medicationStrength: item.medicationStrength,
    medicationDosageForm: item.medicationDosageForm,
    medicationUnit: item.medicationUnit,
    quantityOrdered: item.quantityOrdered,
    dosageInstructions: item.dosageInstructions || null,
    substitutedWithMedicationId: item.substitutedWithMedicationId || null,
  }));

  return {
    ok: true,
    result: RESULT.OK,
    prescription: loaded.prescription,
    labels,
  };
}

/**
 * Patient-facing medicine instructions from prescription data.
 * Permission: activeclinic.pharmacy.view
 */
async function getPatientMedicineInstructions(pool, input) {
  const { staffId, organizationId, healthcareOrganizationId, facilityId, prescriptionId } = input;

  if (!staffId || !organizationId || !prescriptionId) {
    return { ok: false, result: RESULT.INVALID_INPUT };
  }

  const authResult = await authorizeStaffPermission(pool, {
    organizationId,
    staffMemberId: staffId,
    permissionKey: PERM.PHARMACY_VIEW,
    facilityId: facilityId || null,
  });
  if (!authResult.ok) {
    return { ok: false, result: RESULT.ACCESS_DENIED };
  }

  const loaded = await loadPrescriptionLabelSource(pool, {
    organizationId,
    healthcareOrganizationId,
    prescriptionId,
  });
  if (!loaded.ok) {
    return loaded;
  }

  const instructions = loaded.items.map((item) => ({
    prescriptionItemId: item.id,
    medicationGenericName: item.medicationGenericName,
    medicationStrength: item.medicationStrength,
    medicationDosageForm: item.medicationDosageForm,
    dosageInstructions: item.dosageInstructions || null,
    quantityOrdered: item.quantityOrdered,
    status: item.status,
  }));

  return {
    ok: true,
    result: RESULT.OK,
    prescription: {
      id: loaded.prescription.id,
      prescriptionNumber: loaded.prescription.prescriptionNumber,
      patientDisplayName: loaded.prescription.patientDisplayName,
      patientNumber: loaded.prescription.patientNumber,
    },
    instructions,
  };
}

module.exports = {
  RESULT,
  PERM,
  adjustStock,
  transferStock,
  substitutePrescriptionItem,
  createPurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrder,
  submitPurchaseOrder,
  getMedicineLabel,
  getPatientMedicineInstructions,
};
