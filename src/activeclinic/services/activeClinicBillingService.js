"use strict";

/**
 * ActiveClinic P07 — Billing service
 * Charges, invoices, payments, receipts, refunds, reversals
 * Financial integrity: integer minor units, immutable history, tenant isolation
 */

const { Pool } = require("pg");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const {
  recordAuditEventSafe,
} = require("../../platform/services/auditEventService");
const {
  requireFinancePermission,
} = require("./activeClinicFinanceAuthz");

const RESULT = Object.freeze({
  OK: "ok",
  CREATED: "created",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  ACCESS_DENIED: "access_denied",
  IMMUTABLE: "immutable_record",
  OVER_ALLOCATION: "payment_over_allocation",
  INSUFFICIENT_BALANCE: "insufficient_balance",
  DUPLICATE_SUBMISSION: "duplicate_submission",
  INVALID_STATUS: "invalid_status",
  APPROVAL_REQUIRED: "approval_required",
  SESSION_REQUIRED: "cashier_session_required",
  SESSION_NOT_OPEN: "cashier_session_not_open",
  REFUND_EXCEEDS_PAYMENT: "refund_exceeds_payment",
  ALREADY_REVERSED: "already_reversed",
});

const PERM = Object.freeze({
  BILLING_VIEW: "activeclinic.billing.view",
  BILLING_CHARGE: "activeclinic.billing.charge",
  INVOICE_CREATE: "activeclinic.billing.invoice.create",
  INVOICE_POST: "activeclinic.billing.invoice.post",
  INVOICE_VOID: "activeclinic.billing.invoice.void",
  INVOICE_AMEND: "activeclinic.billing.invoice.amend",
  CATALOG_MANAGE: "activeclinic.billing.catalog.manage",
  PRICE_OVERRIDE: "activeclinic.billing.price.override",
  PAYMENT_VIEW: "activeclinic.payment.view",
  PAYMENT_COLLECT: "activeclinic.payment.collect",
  PAYMENT_REFUND: "activeclinic.payment.refund",
  PAYMENT_REVERSE: "activeclinic.payment.reverse",
  PAYMENT_ALLOCATE: "activeclinic.payment.allocate",
});

async function assertPerm(pool, params) {
  const checked = await requireFinancePermission(pool, params);
  if (!checked.ok) return { result: RESULT.ACCESS_DENIED, reason: checked.reason };
  return null;
}

async function writeFinanceAudit(pool, params) {
  await recordAuditEventSafe(pool, {
    deploymentCode: params.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: params.tenantId,
    actorUserId: params.staffId || null,
    actionKey: params.eventType,
    entityType: params.resourceType,
    entityId: params.resourceId,
    outcome: "success",
    metadata: params.metadata || {},
  });
}

const INVOICE_STATUS = {
  DRAFT: "draft",
  PENDING: "pending",
  POSTED: "posted",
  VOID: "void",
};

const PAYMENT_METHOD = {
  CASH: "cash",
  CARD: "card",
  MOBILE_MONEY: "mobile_money",
  BANK_TRANSFER: "bank_transfer",
  INSURANCE: "insurance",
  CHEQUE: "cheque",
  OTHER: "other",
};

// ============================================================================
// CHARGE CATALOG
// ============================================================================

async function listChargeCatalogItems({
  pool,
  tenantId,
  facilityId,
  staffId,
  category = null,
  activeOnly = true,
}) {
  const denied = await assertPerm(pool, {
    tenantId,
    facilityId,
    staffId,
    permissionKey: PERM.BILLING_VIEW,
  });
  if (denied) return denied;

  let query = `
    SELECT * FROM activeclinic.charge_catalogue_items
    WHERE tenant_id = $1
  `;
  const params = [tenantId];
  let idx = 2;

  if (facilityId) {
    query += ` AND (facility_id = $${idx} OR facility_id IS NULL)`;
    params.push(facilityId);
    idx++;
  }

  if (category) {
    query += ` AND category = $${idx}`;
    params.push(category);
    idx++;
  }

  if (activeOnly) {
    query += ` AND is_active = true`;
  }

  query += ` ORDER BY category, name`;

  const result = await pool.query(query, params);
  return {
    result: RESULT.OK,
    items: result.rows.map(mapCatalogItem),
  };
}

async function createChargeCatalogItem({
  pool,
  tenantId,
  facilityId,
  staffId,
  code,
  name,
  description,
  category,
  amountMinor,
  currencyCode = "ZMW",
  isTaxable = false,
  taxRatePercent = 0,
}) {
  const denied = await assertPerm(pool, {
    tenantId,
    facilityId,
    staffId,
    permissionKey: PERM.CATALOG_MANAGE,
  });
  if (denied) return denied;

  if (!code || !name || amountMinor < 0) {
    return { result: RESULT.INVALID_INPUT };
  }

  try {
    const insertResult = await pool.query(
      `INSERT INTO activeclinic.charge_catalogue_items (
        tenant_id, facility_id, code, name, description, category,
        amount_minor, currency_code, is_taxable, tax_rate_percent,
        created_by_staff_id, updated_by_staff_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
      RETURNING *`,
      [
        tenantId,
        facilityId,
        code,
        name,
        description,
        category,
        amountMinor,
        currencyCode,
        isTaxable,
        taxRatePercent,
        staffId,
      ]
    );

    await writeFinanceAudit(pool, {
    tenantId,
    staffId,
    eventType: "activeclinic.billing.catalog_item_created",
    resourceType: "charge_catalog_item",
    resourceId: insertResult.rows[0].id,
    metadata: { code, name, amountMinor, currencyCode },
  });

    return {
      result: RESULT.CREATED,
      item: mapCatalogItem(insertResult.rows[0]),
    };
  } catch (err) {
    if (err.code === "23505") {
      return { result: RESULT.INVALID_INPUT, reason: "duplicate_code" };
    }
    throw err;
  }
}

function mapCatalogItem(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    facilityId: row.facility_id,
    code: row.code,
    name: row.name,
    description: row.description,
    category: row.category,
    amountMinor: parseInt(row.amount_minor, 10),
    currencyCode: row.currency_code,
    isTaxable: row.is_taxable,
    taxRatePercent: parseFloat(row.tax_rate_percent),
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================================
// PATIENT CHARGES
// ============================================================================

async function createPatientCharge({
  pool,
  tenantId,
  facilityId,
  staffId,
  patientId,
  encounterId = null,
  catalogueItemId = null,
  chargeType,
  description,
  unitAmountMinor,
  quantity = 1,
  currencyCode = "ZMW",
}) {
  const denied = await assertPerm(pool, {
    tenantId,
    facilityId,
    staffId,
    permissionKey: PERM.BILLING_CHARGE,
  });
  if (denied) return denied;

  if (!patientId || !chargeType || !description || unitAmountMinor < 0 || quantity < 1) {
    return { result: RESULT.INVALID_INPUT };
  }

  if (catalogueItemId) {
    const catalog = await pool.query(
      `SELECT amount_minor FROM activeclinic.charge_catalogue_items
        WHERE id = $1 AND tenant_id = $2
          AND (facility_id = $3 OR facility_id IS NULL)
        LIMIT 1`,
      [catalogueItemId, tenantId, facilityId]
    );
    if (catalog.rows.length === 0) {
      return { result: RESULT.NOT_FOUND, reason: "catalogue_item" };
    }
    const catalogAmount = parseInt(catalog.rows[0].amount_minor, 10);
    if (catalogAmount !== unitAmountMinor) {
      const overrideDenied = await assertPerm(pool, {
        tenantId,
        facilityId,
        staffId,
        permissionKey: PERM.PRICE_OVERRIDE,
      });
      if (overrideDenied) {
        return {
          result: RESULT.ACCESS_DENIED,
          reason: "price_override_required",
        };
      }
    }
  }

  const subtotalMinor = unitAmountMinor * quantity;
  const taxAmountMinor = 0;
  const totalAmountMinor = subtotalMinor + taxAmountMinor;

  const insertResult = await pool.query(
    `INSERT INTO activeclinic.patient_charges (
      tenant_id, facility_id, patient_id, encounter_id, catalogue_item_id,
      charge_type, description, unit_amount_minor, quantity,
      subtotal_minor, tax_amount_minor, total_amount_minor, currency_code,
      charged_by_staff_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *`,
    [
      tenantId,
      facilityId,
      patientId,
      encounterId,
      catalogueItemId,
      chargeType,
      description,
      unitAmountMinor,
      quantity,
      subtotalMinor,
      taxAmountMinor,
      totalAmountMinor,
      currencyCode,
      staffId,
    ]
  );

  await writeFinanceAudit(pool, {
    tenantId,
    staffId,
    eventType: "activeclinic.billing.charge_created",
    resourceType: "patient_charge",
    resourceId: insertResult.rows[0].id,
    metadata: { patientId, description, totalAmountMinor, currencyCode },
  });

  return {
    result: RESULT.CREATED,
    charge: mapPatientCharge(insertResult.rows[0]),
  };
}

function mapPatientCharge(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    facilityId: row.facility_id,
    patientId: row.patient_id,
    encounterId: row.encounter_id,
    catalogueItemId: row.catalogue_item_id,
    chargeType: row.charge_type,
    description: row.description,
    unitAmountMinor: parseInt(row.unit_amount_minor, 10),
    quantity: row.quantity,
    subtotalMinor: parseInt(row.subtotal_minor, 10),
    taxAmountMinor: parseInt(row.tax_amount_minor, 10),
    totalAmountMinor: parseInt(row.total_amount_minor, 10),
    currencyCode: row.currency_code,
    status: row.status,
    chargedAt: row.charged_at,
    createdAt: row.created_at,
  };
}

// ============================================================================
// INVOICES
// ============================================================================

async function createInvoice({
  pool,
  tenantId,
  facilityId,
  staffId,
  patientId,
  chargeIds = [],
  dueDate = null,
  notes = null,
}) {
  const denied = await assertPerm(pool, {
    tenantId,
    facilityId,
    staffId,
    permissionKey: PERM.INVOICE_CREATE,
  });
  if (denied) return denied;

  if (!patientId || chargeIds.length === 0) {
    return { result: RESULT.INVALID_INPUT };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const invoiceNumber = await generateInvoiceNumber(client, tenantId, facilityId);

    const chargesResult = await client.query(
      `SELECT * FROM activeclinic.patient_charges
       WHERE tenant_id = $1 AND facility_id = $2 AND id = ANY($3) AND status = 'pending'`,
      [tenantId, facilityId, chargeIds]
    );

    if (chargesResult.rows.length !== chargeIds.length) {
      await client.query("ROLLBACK");
      return { result: RESULT.INVALID_INPUT, reason: "invalid_charges" };
    }

    let subtotalMinor = 0;
    let taxAmountMinor = 0;
    chargesResult.rows.forEach((c) => {
      subtotalMinor += parseInt(c.subtotal_minor, 10);
      taxAmountMinor += parseInt(c.tax_amount_minor, 10);
    });
    const totalAmountMinor = subtotalMinor + taxAmountMinor;

    const invoiceResult = await client.query(
      `INSERT INTO activeclinic.invoices (
        tenant_id, facility_id, patient_id, invoice_number, due_date,
        subtotal_minor, tax_amount_minor, total_amount_minor,
        currency_code, notes, created_by_staff_id, updated_by_staff_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
      RETURNING *`,
      [
        tenantId,
        facilityId,
        patientId,
        invoiceNumber,
        dueDate,
        subtotalMinor,
        taxAmountMinor,
        totalAmountMinor,
        "ZMW",
        notes,
        staffId,
      ]
    );

    const invoiceId = invoiceResult.rows[0].id;
    let lineNumber = 1;
    for (const charge of chargesResult.rows) {
      await client.query(
        `INSERT INTO activeclinic.invoice_lines (
          invoice_id, charge_id, line_number, description, quantity,
          unit_amount_minor, subtotal_minor, tax_amount_minor, line_total_minor, currency_code
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          invoiceId,
          charge.id,
          lineNumber++,
          charge.description,
          charge.quantity,
          charge.unit_amount_minor,
          charge.subtotal_minor,
          charge.tax_amount_minor,
          charge.total_amount_minor,
          charge.currency_code,
        ]
      );

      await client.query(
        `UPDATE activeclinic.patient_charges SET status = 'invoiced' WHERE id = $1`,
        [charge.id]
      );
    }

    await client.query("COMMIT");

    await writeFinanceAudit(pool, {
    tenantId,
    staffId,
    eventType: "activeclinic.billing.invoice_created",
    resourceType: "invoice",
    resourceId: invoiceId,
    metadata: { invoiceNumber, patientId, totalAmountMinor },
  });

    return {
      result: RESULT.CREATED,
      invoice: mapInvoice(invoiceResult.rows[0]),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function postInvoice({ pool, tenantId, facilityId, staffId, invoiceId }) {
  const denied = await assertPerm(pool, {
    tenantId,
    facilityId,
    staffId,
    permissionKey: PERM.INVOICE_POST,
  });
  if (denied) return denied;

  const invoiceResult = await pool.query(
    `SELECT * FROM activeclinic.invoices WHERE id = $1 AND tenant_id = $2`,
    [invoiceId, tenantId]
  );

  if (invoiceResult.rows.length === 0) {
    return { result: RESULT.NOT_FOUND };
  }

  const invoice = invoiceResult.rows[0];
  if (invoice.status !== INVOICE_STATUS.DRAFT && invoice.status !== INVOICE_STATUS.PENDING) {
    return { result: RESULT.IMMUTABLE, reason: "already_posted_or_void" };
  }

  const updateResult = await pool.query(
    `UPDATE activeclinic.invoices
     SET status = $1, posted_at = now(), posted_by_staff_id = $2, updated_at = now()
     WHERE id = $3 AND tenant_id = $4
     RETURNING *`,
    [INVOICE_STATUS.POSTED, staffId, invoiceId, tenantId]
  );

  await writeFinanceAudit(pool, {
    tenantId,
    staffId,
    eventType: "activeclinic.billing.invoice_posted",
    resourceType: "invoice",
    resourceId: invoiceId,
    metadata: { invoiceNumber: invoice.invoice_number },
  });

  return {
    result: RESULT.OK,
    invoice: mapInvoice(updateResult.rows[0]),
  };
}

async function generateInvoiceNumber(client, tenantId, facilityId) {
  const year = new Date().getFullYear();
  const facilityResult = await client.query(
    `SELECT facility_key FROM activeclinic.facilities WHERE id = $1`,
    [facilityId]
  );
  const facilityCode = String(facilityResult.rows[0]?.facility_key || "fac")
    .toUpperCase()
    .slice(0, 8);

  const countResult = await client.query(
    `SELECT COUNT(*) FROM activeclinic.invoices
     WHERE tenant_id = $1 AND facility_id = $2 AND EXTRACT(YEAR FROM invoice_date) = $3`,
    [tenantId, facilityId, year]
  );

  const sequence = parseInt(countResult.rows[0].count, 10) + 1;
  return `INV-${facilityCode}-${year}-${sequence.toString().padStart(6, "0")}`;
}

function mapInvoice(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    facilityId: row.facility_id,
    patientId: row.patient_id,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    subtotalMinor: parseInt(row.subtotal_minor, 10),
    taxAmountMinor: parseInt(row.tax_amount_minor, 10),
    adjustmentMinor: parseInt(row.adjustment_minor, 10),
    totalAmountMinor: parseInt(row.total_amount_minor, 10),
    currencyCode: row.currency_code,
    status: row.status,
    postedAt: row.posted_at,
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================================
// PAYMENTS
// ============================================================================

async function recordPayment({
  pool,
  tenantId,
  facilityId,
  staffId,
  patientId,
  amountMinor,
  paymentMethod,
  referenceNumber = null,
  notes = null,
  cashierSessionId = null,
  invoiceAllocations = [],
  idempotencyKey = null,
}) {
  const denied = await assertPerm(pool, {
    tenantId,
    facilityId,
    staffId,
    permissionKey: PERM.PAYMENT_COLLECT,
  });
  if (denied) return denied;

  if (!patientId || amountMinor <= 0 || !paymentMethod) {
    return { result: RESULT.INVALID_INPUT };
  }

  if (paymentMethod === PAYMENT_METHOD.CASH && !cashierSessionId) {
    return { result: RESULT.SESSION_REQUIRED };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (paymentMethod === PAYMENT_METHOD.CASH) {
      const sessionResult = await client.query(
        `SELECT status FROM activeclinic.cashier_sessions WHERE id = $1 AND tenant_id = $2`,
        [cashierSessionId, tenantId]
      );
      if (sessionResult.rows.length === 0 || sessionResult.rows[0].status !== "open") {
        await client.query("ROLLBACK");
        return { result: RESULT.SESSION_NOT_OPEN };
      }
    }

    if (idempotencyKey) {
      const dupCheck = await client.query(
        `SELECT id FROM activeclinic.payments WHERE idempotency_key = $1`,
        [idempotencyKey]
      );
      if (dupCheck.rows.length > 0) {
        await client.query("ROLLBACK");
        return { result: RESULT.DUPLICATE_SUBMISSION };
      }
    }

    const paymentNumber = await generatePaymentNumber(client, tenantId, facilityId);

    const paymentResult = await client.query(
      `INSERT INTO activeclinic.payments (
        tenant_id, facility_id, patient_id, payment_number, amount_minor,
        currency_code, payment_method, reference_number, notes,
        cashier_session_id, received_by_staff_id, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        tenantId,
        facilityId,
        patientId,
        paymentNumber,
        amountMinor,
        "ZMW",
        paymentMethod,
        referenceNumber,
        notes,
        cashierSessionId,
        staffId,
        idempotencyKey,
      ]
    );

    const paymentId = paymentResult.rows[0].id;

    let allocatedTotal = 0;
    for (const alloc of invoiceAllocations) {
      await client.query(
        `INSERT INTO activeclinic.payment_allocations (
          payment_id, invoice_id, allocated_amount_minor, currency_code, created_by_staff_id
        ) VALUES ($1, $2, $3, $4, $5)`,
        [paymentId, alloc.invoiceId, alloc.amountMinor, "ZMW", staffId]
      );
      allocatedTotal += alloc.amountMinor;
    }

    if (allocatedTotal > amountMinor) {
      await client.query("ROLLBACK");
      return { result: RESULT.OVER_ALLOCATION };
    }

    const receiptNumber = await generateReceiptNumber(client, tenantId, facilityId);
    const patientName = await getPatientName(client, patientId);

    await client.query(
      `INSERT INTO activeclinic.receipts (
        tenant_id, facility_id, payment_id, receipt_number, amount_minor,
        currency_code, issued_to_patient_name, issued_by_staff_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [tenantId, facilityId, paymentId, receiptNumber, amountMinor, "ZMW", patientName, staffId]
    );

    if (cashierSessionId) {
      await client.query(
        `INSERT INTO activeclinic.cashier_session_events (
          session_id, event_type, event_data, created_by_staff_id
        ) VALUES ($1, $2, $3, $4)`,
        [cashierSessionId, "payment_received", { paymentId, amountMinor }, staffId]
      );
    }

    await client.query("COMMIT");

    await writeFinanceAudit(pool, {
    tenantId,
    staffId,
    eventType: "activeclinic.billing.payment_recorded",
    resourceType: "payment",
    resourceId: paymentId,
    metadata: { paymentNumber, patientId, amountMinor, paymentMethod },
  });

    return {
      result: RESULT.CREATED,
      payment: mapPayment(paymentResult.rows[0]),
      receiptNumber,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function generatePaymentNumber(client, tenantId, facilityId) {
  const year = new Date().getFullYear();
  const countResult = await client.query(
    `SELECT COUNT(*) FROM activeclinic.payments
     WHERE tenant_id = $1 AND facility_id = $2 AND EXTRACT(YEAR FROM payment_date) = $3`,
    [tenantId, facilityId, year]
  );
  const sequence = parseInt(countResult.rows[0].count, 10) + 1;
  return `PAY-${year}-${sequence.toString().padStart(6, "0")}`;
}

async function generateReceiptNumber(client, tenantId, facilityId) {
  const year = new Date().getFullYear();
  const facilityResult = await client.query(
    `SELECT facility_key FROM activeclinic.facilities WHERE id = $1`,
    [facilityId]
  );
  const facilityCode = String(facilityResult.rows[0]?.facility_key || "fac")
    .toUpperCase()
    .slice(0, 8);
  const countResult = await client.query(
    `SELECT COUNT(*) FROM activeclinic.receipts
     WHERE tenant_id = $1 AND facility_id = $2 AND EXTRACT(YEAR FROM receipt_date) = $3`,
    [tenantId, facilityId, year]
  );
  const sequence = parseInt(countResult.rows[0].count, 10) + 1;
  return `${facilityCode}-${year}-${sequence.toString().padStart(6, "0")}`;
}

async function getPatientName(client, patientId) {
  const result = await client.query(
    `SELECT first_name, last_name FROM activeclinic.patients WHERE id = $1`,
    [patientId]
  );
  if (result.rows.length === 0) return "Unknown";
  const { first_name, last_name } = result.rows[0];
  return `${first_name} ${last_name}`;
}

function mapPayment(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    facilityId: row.facility_id,
    patientId: row.patient_id,
    paymentNumber: row.payment_number,
    paymentDate: row.payment_date,
    amountMinor: parseInt(row.amount_minor, 10),
    currencyCode: row.currency_code,
    paymentMethod: row.payment_method,
    referenceNumber: row.reference_number,
    notes: row.notes,
    cashierSessionId: row.cashier_session_id,
    createdAt: row.created_at,
  };
}

// ============================================================================
// ELEVATED CORRECTIONS (finance supervisor)
// ============================================================================

async function refundPayment({
  pool,
  tenantId,
  facilityId,
  staffId,
  paymentId,
  amountMinor,
  reason,
}) {
  const denied = await assertPerm(pool, {
    tenantId,
    facilityId,
    staffId,
    permissionKey: PERM.PAYMENT_REFUND,
  });
  if (denied) return denied;

  if (!paymentId || !reason || !(amountMinor > 0)) {
    return { result: RESULT.INVALID_INPUT };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const paymentRes = await client.query(
      `SELECT * FROM activeclinic.payments
        WHERE id = $1 AND tenant_id = $2 AND facility_id = $3
        FOR UPDATE`,
      [paymentId, tenantId, facilityId]
    );
    if (paymentRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return { result: RESULT.NOT_FOUND };
    }
    const payment = paymentRes.rows[0];

    const reversed = await client.query(
      `SELECT 1 FROM activeclinic.financial_reversals
        WHERE tenant_id = $1
          AND original_record_id = $2
          AND original_record_type = 'payment'
          AND reversal_type = 'payment_reverse'
          AND status = 'completed'
        LIMIT 1`,
      [tenantId, paymentId]
    );
    if (reversed.rows.length) {
      await client.query("ROLLBACK");
      return { result: RESULT.ALREADY_REVERSED };
    }

    const refundedRes = await client.query(
      `SELECT COALESCE(SUM(refund_amount_minor), 0) AS refunded
         FROM activeclinic.refunds
        WHERE original_payment_id = $1
          AND tenant_id = $2
          AND status = 'completed'`,
      [paymentId, tenantId]
    );
    const alreadyRefunded = parseInt(refundedRes.rows[0].refunded, 10);
    const originalAmount = parseInt(payment.amount_minor, 10);
    if (alreadyRefunded + amountMinor > originalAmount) {
      await client.query("ROLLBACK");
      return { result: RESULT.REFUND_EXCEEDS_PAYMENT };
    }

    const refundPaymentNumber = await generatePaymentNumber(client, tenantId, facilityId);
    const refundPay = await client.query(
      `INSERT INTO activeclinic.payments (
         tenant_id, facility_id, patient_id, payment_number, amount_minor,
         currency_code, payment_method, reference_number, notes,
         received_by_staff_id
       ) VALUES ($1, $2, $3, $4, $5, $6, 'other', $7, $8, $9)
       RETURNING id`,
      [
        tenantId,
        facilityId,
        payment.patient_id,
        refundPaymentNumber,
        amountMinor,
        payment.currency_code || "ZMW",
        `REFUND:${payment.payment_number}`,
        `Refund of ${payment.payment_number}: ${reason}`,
        staffId,
      ]
    );

    const refundRow = await client.query(
      `INSERT INTO activeclinic.refunds (
         tenant_id, facility_id, original_payment_id, refund_payment_id,
         refund_amount_minor, currency_code, reason, status,
         requested_by_staff_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', $8)
       RETURNING id`,
      [
        tenantId,
        facilityId,
        paymentId,
        refundPay.rows[0].id,
        amountMinor,
        payment.currency_code || "ZMW",
        reason,
        staffId,
      ]
    );

    if (payment.cashier_session_id) {
      await client.query(
        `INSERT INTO activeclinic.cashier_session_events (
           session_id, event_type, event_data, created_by_staff_id
         ) VALUES ($1, 'refund_issued', $2, $3)`,
        [payment.cashier_session_id, { paymentId, amountMinor, reason }, staffId]
      );
    }

    await client.query("COMMIT");

    await writeFinanceAudit(pool, {
      tenantId,
      staffId,
      eventType: "activeclinic.billing.payment_refund",
      resourceType: "payment",
      resourceId: paymentId,
      metadata: { refundId: refundRow.rows[0].id, amountMinor, reason },
    });

    return {
      result: RESULT.OK,
      refundId: refundRow.rows[0].id,
      refundPaymentId: refundPay.rows[0].id,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function reversePayment({
  pool,
  tenantId,
  facilityId,
  staffId,
  paymentId,
  reason,
}) {
  const denied = await assertPerm(pool, {
    tenantId,
    facilityId,
    staffId,
    permissionKey: PERM.PAYMENT_REVERSE,
  });
  if (denied) return denied;

  if (!paymentId || !reason) {
    return { result: RESULT.INVALID_INPUT };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const paymentRes = await client.query(
      `SELECT * FROM activeclinic.payments
        WHERE id = $1 AND tenant_id = $2 AND facility_id = $3
        FOR UPDATE`,
      [paymentId, tenantId, facilityId]
    );
    if (paymentRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return { result: RESULT.NOT_FOUND };
    }

    const existing = await client.query(
      `SELECT id FROM activeclinic.financial_reversals
        WHERE tenant_id = $1
          AND original_record_id = $2
          AND original_record_type = 'payment'
          AND reversal_type = 'payment_reverse'
          AND status = 'completed'
        LIMIT 1`,
      [tenantId, paymentId]
    );
    if (existing.rows.length) {
      await client.query("ROLLBACK");
      return { result: RESULT.ALREADY_REVERSED };
    }

    const rev = await client.query(
      `INSERT INTO activeclinic.financial_reversals (
         tenant_id, facility_id, reversal_type, original_record_id,
         original_record_type, reason, status, requested_by_staff_id,
         reversal_data
       ) VALUES ($1, $2, 'payment_reverse', $3, 'payment', $4, 'completed', $5, $6)
       RETURNING id`,
      [
        tenantId,
        facilityId,
        paymentId,
        reason,
        staffId,
        JSON.stringify({ paymentNumber: paymentRes.rows[0].payment_number }),
      ]
    );

    await client.query("COMMIT");

    await writeFinanceAudit(pool, {
      tenantId,
      staffId,
      eventType: "activeclinic.billing.payment_reverse",
      resourceType: "payment",
      resourceId: paymentId,
      metadata: { reversalId: rev.rows[0].id, reason },
    });

    return { result: RESULT.OK, reversalId: rev.rows[0].id };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function voidInvoice({
  pool,
  tenantId,
  facilityId,
  staffId,
  invoiceId,
  reason,
}) {
  const denied = await assertPerm(pool, {
    tenantId,
    facilityId,
    staffId,
    permissionKey: PERM.INVOICE_VOID,
  });
  if (denied) return denied;

  if (!invoiceId || !reason) {
    return { result: RESULT.INVALID_INPUT };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const invRes = await client.query(
      `SELECT * FROM activeclinic.invoices
        WHERE id = $1 AND tenant_id = $2 AND facility_id = $3
        FOR UPDATE`,
      [invoiceId, tenantId, facilityId]
    );
    if (invRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return { result: RESULT.NOT_FOUND };
    }
    const invoice = invRes.rows[0];
    if (invoice.status !== INVOICE_STATUS.POSTED) {
      await client.query("ROLLBACK");
      return { result: RESULT.INVALID_STATUS, reason: "must_be_posted" };
    }

    await client.query(
      `UPDATE activeclinic.invoices
          SET status = $1,
              voided_at = now(),
              voided_by_staff_id = $2,
              void_reason = $3,
              updated_at = now(),
              updated_by_staff_id = $2
        WHERE id = $4`,
      [INVOICE_STATUS.VOID, staffId, reason, invoiceId]
    );

    const rev = await client.query(
      `INSERT INTO activeclinic.financial_reversals (
         tenant_id, facility_id, reversal_type, original_record_id,
         original_record_type, reason, status, requested_by_staff_id,
         reversal_data
       ) VALUES ($1, $2, 'invoice_void', $3, 'invoice', $4, 'completed', $5, $6)
       RETURNING id`,
      [
        tenantId,
        facilityId,
        invoiceId,
        reason,
        staffId,
        JSON.stringify({ invoiceNumber: invoice.invoice_number }),
      ]
    );

    await client.query("COMMIT");

    await writeFinanceAudit(pool, {
      tenantId,
      staffId,
      eventType: "activeclinic.billing.invoice_void",
      resourceType: "invoice",
      resourceId: invoiceId,
      metadata: { reversalId: rev.rows[0].id, reason },
    });

    return { result: RESULT.OK, reversalId: rev.rows[0].id };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function amendPostedInvoice({
  pool,
  tenantId,
  facilityId,
  staffId,
  invoiceId,
  notes = null,
  adjustmentMinor = null,
  reason,
}) {
  const denied = await assertPerm(pool, {
    tenantId,
    facilityId,
    staffId,
    permissionKey: PERM.INVOICE_AMEND,
  });
  if (denied) return denied;

  if (!invoiceId || !reason) {
    return { result: RESULT.INVALID_INPUT };
  }

  const invRes = await pool.query(
    `SELECT * FROM activeclinic.invoices
      WHERE id = $1 AND tenant_id = $2 AND facility_id = $3`,
    [invoiceId, tenantId, facilityId]
  );
  if (invRes.rows.length === 0) {
    return { result: RESULT.NOT_FOUND };
  }
  const invoice = invRes.rows[0];
  if (invoice.status !== INVOICE_STATUS.POSTED) {
    return { result: RESULT.INVALID_STATUS, reason: "must_be_posted" };
  }

  const nextNotes = notes != null ? String(notes) : invoice.notes;
  const nextAdj =
    adjustmentMinor != null
      ? parseInt(adjustmentMinor, 10)
      : parseInt(invoice.adjustment_minor, 10);
  if (!Number.isFinite(nextAdj)) {
    return { result: RESULT.INVALID_INPUT };
  }
  const subtotal = parseInt(invoice.subtotal_minor, 10);
  const tax = parseInt(invoice.tax_amount_minor, 10);
  const nextTotal = subtotal + tax + nextAdj;
  if (nextTotal < 0) {
    return { result: RESULT.INVALID_INPUT, reason: "negative_total" };
  }

  const updated = await pool.query(
    `UPDATE activeclinic.invoices
        SET notes = $1,
            adjustment_minor = $2,
            total_amount_minor = $3,
            updated_at = now(),
            updated_by_staff_id = $4
      WHERE id = $5
      RETURNING *`,
    [nextNotes, nextAdj, nextTotal, staffId, invoiceId]
  );

  await writeFinanceAudit(pool, {
    tenantId,
    staffId,
    eventType: "activeclinic.billing.invoice_amend",
    resourceType: "invoice",
    resourceId: invoiceId,
    metadata: { reason, adjustmentMinor: nextAdj },
  });

  return { result: RESULT.OK, invoice: mapInvoice(updated.rows[0]) };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  RESULT,
  PERM,
  INVOICE_STATUS,
  PAYMENT_METHOD,
  listChargeCatalogItems,
  createChargeCatalogItem,
  createPatientCharge,
  createInvoice,
  postInvoice,
  recordPayment,
  refundPayment,
  reversePayment,
  voidInvoice,
  amendPostedInvoice,
};
