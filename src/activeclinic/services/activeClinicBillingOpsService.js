"use strict";

/**
 * ActiveClinic V7 Phase 4 — Billing / finance operations gap-closure.
 * AR, collections, charge review, credit notes, corrections, arrangements,
 * price overrides, statements, refund receipts, revenue reports.
 */

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
  INVALID_STATUS: "invalid_status",
  CONFLICT: "conflict",
});

const PERM = Object.freeze({
  BILLING_VIEW: "activeclinic.billing.view",
  BILLING_CHARGE: "activeclinic.billing.charge",
  CHARGE_REVIEW: "activeclinic.billing.charge.review",
  PRICE_OVERRIDE: "activeclinic.billing.price.override",
  REPORTS_VIEW: "activeclinic.billing.reports.view",
  CORRECTIONS_VIEW: "activeclinic.billing.corrections.view",
  INVOICE_AMEND: "activeclinic.billing.invoice.amend",
  PAYMENT_VIEW: "activeclinic.payment.view",
  PAYMENT_REFUND: "activeclinic.payment.refund",
});

const CONTACT_METHODS = new Set([
  "phone",
  "sms",
  "email",
  "in_person",
  "other",
]);
const CONTACT_OUTCOMES = new Set([
  "attempted",
  "reached",
  "promised_payment",
  "disputed",
  "no_answer",
  "wrong_contact",
  "other",
]);
const REVIEW_STATUSES = new Set(["pending_review", "approved", "rejected"]);
const ARRANGEMENT_FREQUENCIES = new Set([
  "weekly",
  "biweekly",
  "monthly",
  "custom",
]);
const ARRANGEMENT_REVIEW_ACTIONS = new Set(["approve", "reject"]);
const OVERRIDE_REVIEW_ACTIONS = new Set(["approve", "reject"]);

async function assertPerm(pool, params) {
  const checked = await requireFinancePermission(pool, params);
  if (!checked.ok) {
    return { result: RESULT.ACCESS_DENIED, reason: checked.reason };
  }
  return null;
}

async function assertAnyPerm(pool, params, permissionKeys) {
  let lastDenied = null;
  for (const permissionKey of permissionKeys) {
    const denied = await assertPerm(pool, { ...params, permissionKey });
    if (!denied) return null;
    lastDenied = denied;
  }
  return lastDenied;
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

function toInt(value, fallback = 0) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function requireIds(input) {
  const tenantId = input && input.tenantId;
  const facilityId = input && input.facilityId;
  const staffId = input && input.staffId;
  if (!tenantId || !facilityId || !staffId) {
    return { ok: false, result: RESULT.INVALID_INPUT, reason: "missing_ids" };
  }
  return { ok: true, tenantId, facilityId, staffId };
}

async function nextDocumentNumber(client, opts) {
  const { tenantId, facilityId, table, column, prefix } = opts;
  const year = new Date().getUTCFullYear();
  const like = `${prefix}-${year}-%`;
  const res = await client.query(
    `SELECT ${column} AS num
       FROM activeclinic.${table}
      WHERE tenant_id = $1 AND facility_id = $2 AND ${column} LIKE $3
      ORDER BY ${column} DESC
      LIMIT 1`,
    [tenantId, facilityId, like]
  );
  let seq = 1;
  if (res.rows.length) {
    const parts = String(res.rows[0].num).split("-");
    const last = toInt(parts[parts.length - 1], 0);
    seq = last + 1;
  }
  return `${prefix}-${year}-${String(seq).padStart(6, "0")}`;
}

const AR_SELECT = `
  SELECT
    i.id,
    i.invoice_number,
    i.invoice_date,
    i.due_date,
    i.patient_id,
    i.status,
    i.currency_code,
    i.total_amount_minor,
    COALESCE(alloc.paid_minor, 0)::bigint AS paid_minor,
    COALESCE(cn.credit_minor, 0)::bigint AS credit_minor,
    (i.total_amount_minor
      - COALESCE(alloc.paid_minor, 0)
      - COALESCE(cn.credit_minor, 0))::bigint AS balance_minor,
    p.patient_number,
    p.first_name,
    p.last_name,
    GREATEST(
      0,
      CURRENT_DATE - COALESCE(i.due_date, i.invoice_date)
    )::int AS days_outstanding
  FROM activeclinic.invoices i
  JOIN activeclinic.patients p ON p.id = i.patient_id
  LEFT JOIN (
    SELECT invoice_id, SUM(allocated_amount_minor)::bigint AS paid_minor
      FROM activeclinic.payment_allocations
     GROUP BY invoice_id
  ) alloc ON alloc.invoice_id = i.id
  LEFT JOIN (
    SELECT invoice_id, SUM(amount_minor)::bigint AS credit_minor
      FROM activeclinic.credit_notes
     WHERE status = 'posted'
     GROUP BY invoice_id
  ) cn ON cn.invoice_id = i.id
  WHERE i.tenant_id = $1
    AND i.facility_id = $2
    AND i.status = 'posted'
    AND (i.total_amount_minor
      - COALESCE(alloc.paid_minor, 0)
      - COALESCE(cn.credit_minor, 0)) > 0
`;

function mapArRow(row) {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    patientId: row.patient_id,
    patientNumber: row.patient_number,
    patientName: `${row.first_name} ${row.last_name}`.trim(),
    status: row.status,
    currencyCode: row.currency_code,
    totalAmountMinor: toInt(row.total_amount_minor),
    paidMinor: toInt(row.paid_minor),
    creditMinor: toInt(row.credit_minor),
    balanceMinor: toInt(row.balance_minor),
    daysOutstanding: toInt(row.days_outstanding),
  };
}

// ============================================================================
// ACCOUNTS RECEIVABLE / COLLECTIONS
// ============================================================================

async function listAccountsReceivable(pool, input) {
  const ids = requireIds(input);
  if (!ids.ok) return ids;
  const denied = await assertPerm(pool, {
    tenantId: ids.tenantId,
    facilityId: ids.facilityId,
    staffId: ids.staffId,
    platformIdentityId: input.platformIdentityId,
    permissionKey: PERM.BILLING_VIEW,
  });
  if (denied) return denied;

  const params = [ids.tenantId, ids.facilityId];
  let query = AR_SELECT;
  if (input.patientId) {
    params.push(input.patientId);
    query += ` AND i.patient_id = $${params.length}`;
  }
  query += ` ORDER BY days_outstanding DESC, i.invoice_date ASC, i.invoice_number ASC
             LIMIT $${params.length + 1}`;
  params.push(Math.min(toInt(input.limit, 200), 500));

  const result = await pool.query(query, params);
  return { result: RESULT.OK, items: result.rows.map(mapArRow) };
}

async function listCollectionsQueue(pool, input) {
  const listed = await listAccountsReceivable(pool, input);
  if (listed.result !== RESULT.OK) return listed;
  const minDays = Math.max(0, toInt(input.minDaysOutstanding, 0));
  const items = listed.items.filter((row) => row.daysOutstanding >= minDays);
  return { result: RESULT.OK, items };
}

async function recordCollectionsContact(pool, input) {
  const ids = requireIds(input);
  if (!ids.ok) return ids;
  const denied = await assertPerm(pool, {
    tenantId: ids.tenantId,
    facilityId: ids.facilityId,
    staffId: ids.staffId,
    platformIdentityId: input.platformIdentityId,
    permissionKey: PERM.BILLING_VIEW,
  });
  if (denied) return denied;

  const patientId = input.patientId;
  const contactMethod = String(input.contactMethod || "").trim();
  const outcome = String(input.outcome || "attempted").trim();
  const notes =
    input.notes != null ? String(input.notes).trim().slice(0, 2000) : null;
  if (!patientId || !CONTACT_METHODS.has(contactMethod)) {
    return { result: RESULT.INVALID_INPUT, reason: "contact_method" };
  }
  if (!CONTACT_OUTCOMES.has(outcome)) {
    return { result: RESULT.INVALID_INPUT, reason: "outcome" };
  }

  const patientRes = await pool.query(
    `SELECT id FROM activeclinic.patients
      WHERE id = $1 AND organization_id = $2`,
    [patientId, ids.tenantId]
  );
  if (!patientRes.rows.length) {
    return { result: RESULT.NOT_FOUND, reason: "patient" };
  }

  if (input.invoiceId) {
    const inv = await pool.query(
      `SELECT id FROM activeclinic.invoices
        WHERE id = $1 AND tenant_id = $2 AND facility_id = $3 AND patient_id = $4`,
      [input.invoiceId, ids.tenantId, ids.facilityId, patientId]
    );
    if (!inv.rows.length) {
      return { result: RESULT.NOT_FOUND, reason: "invoice" };
    }
  }

  const inserted = await pool.query(
    `INSERT INTO activeclinic.billing_collections_contacts (
       tenant_id, facility_id, patient_id, invoice_id,
       contact_method, outcome, notes, contacted_by_staff_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      ids.tenantId,
      ids.facilityId,
      patientId,
      input.invoiceId || null,
      contactMethod,
      outcome,
      notes || null,
      ids.staffId,
    ]
  );

  await writeFinanceAudit(pool, {
    tenantId: ids.tenantId,
    staffId: ids.staffId,
    eventType: "activeclinic.billing.collections_contact_recorded",
    resourceType: "billing_collections_contact",
    resourceId: inserted.rows[0].id,
    metadata: {
      patientId,
      invoiceId: input.invoiceId || null,
      contactMethod,
      outcome,
    },
  });

  return {
    result: RESULT.CREATED,
    contact: mapCollectionsContact(inserted.rows[0]),
  };
}

function mapCollectionsContact(row) {
  return {
    id: row.id,
    patientId: row.patient_id,
    invoiceId: row.invoice_id,
    contactMethod: row.contact_method,
    outcome: row.outcome,
    notes: row.notes,
    contactedByStaffId: row.contacted_by_staff_id,
    contactedAt: row.contacted_at,
  };
}

// ============================================================================
// CHARGE REVIEW
// ============================================================================

async function listPendingChargeReviews(pool, input) {
  const ids = requireIds(input);
  if (!ids.ok) return ids;
  const denied = await assertPerm(pool, {
    tenantId: ids.tenantId,
    facilityId: ids.facilityId,
    staffId: ids.staffId,
    platformIdentityId: input.platformIdentityId,
    permissionKey: PERM.CHARGE_REVIEW,
  });
  if (denied) return denied;

  const status = input.status || "pending_review";
  if (status !== "all" && !REVIEW_STATUSES.has(status)) {
    return { result: RESULT.INVALID_INPUT, reason: "review_status" };
  }

  const params = [ids.tenantId, ids.facilityId];
  let statusClause = `AND pc.review_status = $3`;
  if (status === "all") {
    statusClause = `AND pc.review_status IS NOT NULL`;
  } else {
    params.push(status);
  }

  const result = await pool.query(
    `SELECT pc.*, p.patient_number, p.first_name, p.last_name
       FROM activeclinic.patient_charges pc
       JOIN activeclinic.patients p ON p.id = pc.patient_id
      WHERE pc.tenant_id = $1
        AND pc.facility_id = $2
        ${statusClause}
        AND pc.status <> 'cancelled'
      ORDER BY pc.charged_at DESC
      LIMIT 200`,
    params
  );

  return {
    result: RESULT.OK,
    items: result.rows.map((row) => ({
      id: row.id,
      patientId: row.patient_id,
      patientNumber: row.patient_number,
      patientName: `${row.first_name} ${row.last_name}`.trim(),
      description: row.description,
      chargeType: row.charge_type,
      totalAmountMinor: toInt(row.total_amount_minor),
      currencyCode: row.currency_code,
      status: row.status,
      reviewStatus: row.review_status,
      chargedAt: row.charged_at,
    })),
  };
}

async function reviewPatientCharge(pool, input) {
  const ids = requireIds(input);
  if (!ids.ok) return ids;
  const denied = await assertPerm(pool, {
    tenantId: ids.tenantId,
    facilityId: ids.facilityId,
    staffId: ids.staffId,
    platformIdentityId: input.platformIdentityId,
    permissionKey: PERM.CHARGE_REVIEW,
  });
  if (denied) return denied;

  const chargeId = input.chargeId || input.id;
  const decision = String(input.decision || input.reviewStatus || "").trim();
  const nextStatus =
    decision === "approve" || decision === "approved"
      ? "approved"
      : decision === "reject" || decision === "rejected"
        ? "rejected"
        : null;
  if (!chargeId || !nextStatus) {
    return { result: RESULT.INVALID_INPUT };
  }

  const updated = await pool.query(
    `UPDATE activeclinic.patient_charges
        SET review_status = $1,
            updated_at = now()
      WHERE id = $2
        AND tenant_id = $3
        AND facility_id = $4
        AND review_status = 'pending_review'
      RETURNING *`,
    [nextStatus, chargeId, ids.tenantId, ids.facilityId]
  );
  if (!updated.rows.length) {
    const existing = await pool.query(
      `SELECT id, review_status FROM activeclinic.patient_charges
        WHERE id = $1 AND tenant_id = $2 AND facility_id = $3`,
      [chargeId, ids.tenantId, ids.facilityId]
    );
    if (!existing.rows.length) return { result: RESULT.NOT_FOUND };
    return {
      result: RESULT.INVALID_STATUS,
      reason: existing.rows[0].review_status,
    };
  }

  await writeFinanceAudit(pool, {
    tenantId: ids.tenantId,
    staffId: ids.staffId,
    eventType: "activeclinic.billing.charge_reviewed",
    resourceType: "patient_charge",
    resourceId: chargeId,
    metadata: { reviewStatus: nextStatus },
  });

  return {
    result: RESULT.OK,
    charge: {
      id: updated.rows[0].id,
      reviewStatus: updated.rows[0].review_status,
    },
  };
}

// ============================================================================
// CREDIT NOTES
// ============================================================================

async function createCreditNote(pool, input) {
  const ids = requireIds(input);
  if (!ids.ok) return ids;
  const denied = await assertPerm(pool, {
    tenantId: ids.tenantId,
    facilityId: ids.facilityId,
    staffId: ids.staffId,
    platformIdentityId: input.platformIdentityId,
    permissionKey: PERM.INVOICE_AMEND,
  });
  if (denied) return denied;

  const patientId = input.patientId;
  const amountMinor = toInt(input.amountMinor, -1);
  const reason = String(input.reason || "").trim();
  if (!patientId || !(amountMinor > 0) || reason.length < 1 || reason.length > 2000) {
    return { result: RESULT.INVALID_INPUT };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const patientRes = await client.query(
      `SELECT id FROM activeclinic.patients
        WHERE id = $1 AND organization_id = $2
        FOR SHARE`,
      [patientId, ids.tenantId]
    );
    if (!patientRes.rows.length) {
      await client.query("ROLLBACK");
      return { result: RESULT.NOT_FOUND, reason: "patient" };
    }

    let invoiceId = input.invoiceId || null;
    if (invoiceId) {
      const inv = await client.query(
        `SELECT id, patient_id, status, total_amount_minor
           FROM activeclinic.invoices
          WHERE id = $1 AND tenant_id = $2 AND facility_id = $3
          FOR SHARE`,
        [invoiceId, ids.tenantId, ids.facilityId]
      );
      if (!inv.rows.length) {
        await client.query("ROLLBACK");
        return { result: RESULT.NOT_FOUND, reason: "invoice" };
      }
      if (inv.rows[0].patient_id !== patientId) {
        await client.query("ROLLBACK");
        return { result: RESULT.INVALID_INPUT, reason: "invoice_patient_mismatch" };
      }
      if (inv.rows[0].status !== "posted") {
        await client.query("ROLLBACK");
        return { result: RESULT.INVALID_STATUS, reason: "invoice_not_posted" };
      }
    }

    const creditNoteNumber =
      input.creditNoteNumber ||
      (await nextDocumentNumber(client, {
        tenantId: ids.tenantId,
        facilityId: ids.facilityId,
        table: "credit_notes",
        column: "credit_note_number",
        prefix: "CN",
      }));

    const inserted = await client.query(
      `INSERT INTO activeclinic.credit_notes (
         tenant_id, facility_id, patient_id, invoice_id,
         credit_note_number, amount_minor, currency_code, reason, status,
         created_by_staff_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'posted', $9)
       RETURNING *`,
      [
        ids.tenantId,
        ids.facilityId,
        patientId,
        invoiceId,
        creditNoteNumber,
        amountMinor,
        input.currencyCode || "ZMW",
        reason,
        ids.staffId,
      ]
    );

    await client.query("COMMIT");

    await writeFinanceAudit(pool, {
      tenantId: ids.tenantId,
      staffId: ids.staffId,
      eventType: "activeclinic.billing.credit_note_created",
      resourceType: "credit_note",
      resourceId: inserted.rows[0].id,
      metadata: {
        creditNoteNumber,
        amountMinor,
        invoiceId,
        patientId,
      },
    });

    return {
      result: RESULT.CREATED,
      creditNote: mapCreditNote(inserted.rows[0]),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    if (err && err.code === "23505") {
      return { result: RESULT.CONFLICT, reason: "duplicate_number" };
    }
    throw err;
  } finally {
    client.release();
  }
}

async function listCreditNotes(pool, input) {
  const ids = requireIds(input);
  if (!ids.ok) return ids;
  const denied = await assertAnyPerm(
    pool,
    {
      tenantId: ids.tenantId,
      facilityId: ids.facilityId,
      staffId: ids.staffId,
      platformIdentityId: input.platformIdentityId,
    },
    [PERM.BILLING_VIEW, PERM.INVOICE_AMEND]
  );
  if (denied) return denied;

  const params = [ids.tenantId, ids.facilityId];
  let query = `
    SELECT cn.*, p.patient_number, p.first_name, p.last_name,
           i.invoice_number
      FROM activeclinic.credit_notes cn
      JOIN activeclinic.patients p ON p.id = cn.patient_id
      LEFT JOIN activeclinic.invoices i ON i.id = cn.invoice_id
     WHERE cn.tenant_id = $1 AND cn.facility_id = $2
  `;
  if (input.patientId) {
    params.push(input.patientId);
    query += ` AND cn.patient_id = $${params.length}`;
  }
  query += ` ORDER BY cn.created_at DESC LIMIT 200`;

  const result = await pool.query(query, params);
  return {
    result: RESULT.OK,
    items: result.rows.map((row) => ({
      ...mapCreditNote(row),
      patientNumber: row.patient_number,
      patientName: `${row.first_name} ${row.last_name}`.trim(),
      invoiceNumber: row.invoice_number || null,
    })),
  };
}

async function getCreditNote(pool, input) {
  const ids = requireIds(input);
  if (!ids.ok) return ids;
  const denied = await assertAnyPerm(
    pool,
    {
      tenantId: ids.tenantId,
      facilityId: ids.facilityId,
      staffId: ids.staffId,
      platformIdentityId: input.platformIdentityId,
    },
    [PERM.BILLING_VIEW, PERM.INVOICE_AMEND]
  );
  if (denied) return denied;

  const creditNoteId = input.creditNoteId || input.id;
  if (!creditNoteId) return { result: RESULT.INVALID_INPUT };

  const result = await pool.query(
    `SELECT cn.*, p.patient_number, p.first_name, p.last_name,
            i.invoice_number
       FROM activeclinic.credit_notes cn
       JOIN activeclinic.patients p ON p.id = cn.patient_id
       LEFT JOIN activeclinic.invoices i ON i.id = cn.invoice_id
      WHERE cn.id = $1 AND cn.tenant_id = $2 AND cn.facility_id = $3`,
    [creditNoteId, ids.tenantId, ids.facilityId]
  );
  if (!result.rows.length) return { result: RESULT.NOT_FOUND };

  const row = result.rows[0];
  return {
    result: RESULT.OK,
    creditNote: {
      ...mapCreditNote(row),
      patientNumber: row.patient_number,
      patientName: `${row.first_name} ${row.last_name}`.trim(),
      invoiceNumber: row.invoice_number || null,
    },
  };
}

function mapCreditNote(row) {
  return {
    id: row.id,
    patientId: row.patient_id,
    invoiceId: row.invoice_id,
    creditNoteNumber: row.credit_note_number,
    amountMinor: toInt(row.amount_minor),
    currencyCode: row.currency_code,
    reason: row.reason,
    status: row.status,
    createdByStaffId: row.created_by_staff_id,
    createdAt: row.created_at,
  };
}

// ============================================================================
// FINANCIAL CORRECTIONS
// ============================================================================

async function listFinancialCorrections(pool, input) {
  const ids = requireIds(input);
  if (!ids.ok) return ids;
  const denied = await assertPerm(pool, {
    tenantId: ids.tenantId,
    facilityId: ids.facilityId,
    staffId: ids.staffId,
    platformIdentityId: input.platformIdentityId,
    permissionKey: PERM.CORRECTIONS_VIEW,
  });
  if (denied) return denied;

  const limit = Math.min(toInt(input.limit, 200), 500);
  const result = await pool.query(
    `
    SELECT * FROM (
      SELECT
        fr.id,
        'reversal'::text AS correction_type,
        fr.reversal_type AS subtype,
        fr.reason,
        fr.status,
        fr.reversal_date::timestamptz AS occurred_at,
        fr.requested_by_staff_id AS actor_staff_id,
        fr.original_record_id AS related_id,
        fr.original_record_type AS related_type,
        NULL::bigint AS amount_minor,
        NULL::varchar AS currency_code
      FROM activeclinic.financial_reversals fr
      WHERE fr.tenant_id = $1 AND fr.facility_id = $2

      UNION ALL

      SELECT
        r.id,
        'refund'::text AS correction_type,
        r.status AS subtype,
        r.reason,
        r.status,
        r.refund_date::timestamptz AS occurred_at,
        r.requested_by_staff_id AS actor_staff_id,
        r.original_payment_id AS related_id,
        'payment'::text AS related_type,
        r.refund_amount_minor AS amount_minor,
        r.currency_code
      FROM activeclinic.refunds r
      WHERE r.tenant_id = $1 AND r.facility_id = $2

      UNION ALL

      SELECT
        cn.id,
        'credit_note'::text AS correction_type,
        cn.status AS subtype,
        cn.reason,
        cn.status,
        cn.created_at AS occurred_at,
        cn.created_by_staff_id AS actor_staff_id,
        cn.invoice_id AS related_id,
        'invoice'::text AS related_type,
        cn.amount_minor,
        cn.currency_code
      FROM activeclinic.credit_notes cn
      WHERE cn.tenant_id = $1 AND cn.facility_id = $2
    ) corrections
    ORDER BY occurred_at DESC NULLS LAST
    LIMIT $3
    `,
    [ids.tenantId, ids.facilityId, limit]
  );

  return {
    result: RESULT.OK,
    items: result.rows.map((row) => ({
      id: row.id,
      correctionType: row.correction_type,
      subtype: row.subtype,
      reason: row.reason,
      status: row.status,
      occurredAt: row.occurred_at,
      actorStaffId: row.actor_staff_id,
      relatedId: row.related_id,
      relatedType: row.related_type,
      amountMinor: row.amount_minor != null ? toInt(row.amount_minor) : null,
      currencyCode: row.currency_code,
    })),
  };
}

// ============================================================================
// PAYMENT ARRANGEMENTS
// ============================================================================

async function createPaymentArrangement(pool, input) {
  const ids = requireIds(input);
  if (!ids.ok) return ids;
  const denied = await assertPerm(pool, {
    tenantId: ids.tenantId,
    facilityId: ids.facilityId,
    staffId: ids.staffId,
    platformIdentityId: input.platformIdentityId,
    permissionKey: PERM.BILLING_VIEW,
  });
  if (denied) return denied;

  const patientId = input.patientId;
  const totalAmountMinor = toInt(input.totalAmountMinor, -1);
  const numberOfInstallments = toInt(input.numberOfInstallments, -1);
  const installmentAmountMinor = toInt(
    input.installmentAmountMinor,
    numberOfInstallments > 0
      ? Math.ceil(totalAmountMinor / numberOfInstallments)
      : -1
  );
  const frequency = String(input.installmentFrequency || "monthly").trim();
  const startDate = input.startDate || new Date().toISOString().slice(0, 10);
  const notes =
    input.notes != null ? String(input.notes).trim().slice(0, 2000) : null;

  if (
    !patientId ||
    !(totalAmountMinor > 0) ||
    !(numberOfInstallments > 0) ||
    !(installmentAmountMinor > 0) ||
    !ARRANGEMENT_FREQUENCIES.has(frequency)
  ) {
    return { result: RESULT.INVALID_INPUT };
  }

  const patientRes = await pool.query(
    `SELECT id FROM activeclinic.patients
      WHERE id = $1 AND organization_id = $2`,
    [patientId, ids.tenantId]
  );
  if (!patientRes.rows.length) {
    return { result: RESULT.NOT_FOUND, reason: "patient" };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const arrangementNumber =
      input.arrangementNumber ||
      (await nextDocumentNumber(client, {
        tenantId: ids.tenantId,
        facilityId: ids.facilityId,
        table: "payment_arrangements",
        column: "arrangement_number",
        prefix: "PA",
      }));

    const inserted = await client.query(
      `INSERT INTO activeclinic.payment_arrangements (
         tenant_id, facility_id, patient_id, arrangement_number,
         total_amount_minor, currency_code, number_of_installments,
         installment_amount_minor, installment_frequency, start_date,
         status, requested_by_staff_id, notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11, $12)
       RETURNING *`,
      [
        ids.tenantId,
        ids.facilityId,
        patientId,
        arrangementNumber,
        totalAmountMinor,
        input.currencyCode || "ZMW",
        numberOfInstallments,
        installmentAmountMinor,
        frequency,
        startDate,
        ids.staffId,
        notes,
      ]
    );
    await client.query("COMMIT");

    await writeFinanceAudit(pool, {
      tenantId: ids.tenantId,
      staffId: ids.staffId,
      eventType: "activeclinic.billing.payment_arrangement_created",
      resourceType: "payment_arrangement",
      resourceId: inserted.rows[0].id,
      metadata: { arrangementNumber, totalAmountMinor, patientId },
    });

    return {
      result: RESULT.CREATED,
      arrangement: mapArrangement(inserted.rows[0]),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    if (err && err.code === "23505") {
      return { result: RESULT.CONFLICT, reason: "duplicate_number" };
    }
    throw err;
  } finally {
    client.release();
  }
}

async function listPaymentArrangements(pool, input) {
  const ids = requireIds(input);
  if (!ids.ok) return ids;
  const denied = await assertPerm(pool, {
    tenantId: ids.tenantId,
    facilityId: ids.facilityId,
    staffId: ids.staffId,
    platformIdentityId: input.platformIdentityId,
    permissionKey: PERM.BILLING_VIEW,
  });
  if (denied) return denied;

  const params = [ids.tenantId, ids.facilityId];
  let query = `
    SELECT pa.*, p.patient_number, p.first_name, p.last_name
      FROM activeclinic.payment_arrangements pa
      JOIN activeclinic.patients p ON p.id = pa.patient_id
     WHERE pa.tenant_id = $1 AND pa.facility_id = $2
  `;
  if (input.status) {
    params.push(input.status);
    query += ` AND pa.status = $${params.length}`;
  }
  if (input.patientId) {
    params.push(input.patientId);
    query += ` AND pa.patient_id = $${params.length}`;
  }
  query += ` ORDER BY pa.created_at DESC LIMIT 200`;

  const result = await pool.query(query, params);
  return {
    result: RESULT.OK,
    items: result.rows.map((row) => ({
      ...mapArrangement(row),
      patientNumber: row.patient_number,
      patientName: `${row.first_name} ${row.last_name}`.trim(),
    })),
  };
}

async function getPaymentArrangement(pool, input) {
  const ids = requireIds(input);
  if (!ids.ok) return ids;
  const denied = await assertPerm(pool, {
    tenantId: ids.tenantId,
    facilityId: ids.facilityId,
    staffId: ids.staffId,
    platformIdentityId: input.platformIdentityId,
    permissionKey: PERM.BILLING_VIEW,
  });
  if (denied) return denied;

  const arrangementId = input.arrangementId || input.id;
  if (!arrangementId) return { result: RESULT.INVALID_INPUT };

  const result = await pool.query(
    `SELECT pa.*, p.patient_number, p.first_name, p.last_name
       FROM activeclinic.payment_arrangements pa
       JOIN activeclinic.patients p ON p.id = pa.patient_id
      WHERE pa.id = $1 AND pa.tenant_id = $2 AND pa.facility_id = $3`,
    [arrangementId, ids.tenantId, ids.facilityId]
  );
  if (!result.rows.length) return { result: RESULT.NOT_FOUND };
  const row = result.rows[0];
  return {
    result: RESULT.OK,
    arrangement: {
      ...mapArrangement(row),
      patientNumber: row.patient_number,
      patientName: `${row.first_name} ${row.last_name}`.trim(),
    },
  };
}

async function reviewPaymentArrangement(pool, input) {
  const ids = requireIds(input);
  if (!ids.ok) return ids;
  const denied = await assertPerm(pool, {
    tenantId: ids.tenantId,
    facilityId: ids.facilityId,
    staffId: ids.staffId,
    platformIdentityId: input.platformIdentityId,
    permissionKey: PERM.INVOICE_AMEND,
  });
  if (denied) return denied;

  const arrangementId = input.arrangementId || input.id;
  const action = String(input.action || input.decision || "").trim().toLowerCase();
  if (!arrangementId || !ARRANGEMENT_REVIEW_ACTIONS.has(action)) {
    return { result: RESULT.INVALID_INPUT };
  }

  const nextStatus = action === "approve" ? "approved" : "rejected";
  const updated = await pool.query(
    `UPDATE activeclinic.payment_arrangements
        SET status = $1::text,
            approved_by_staff_id = CASE WHEN $1::text = 'approved' THEN $2::uuid ELSE approved_by_staff_id END,
            approved_at = CASE WHEN $1::text = 'approved' THEN now() ELSE approved_at END,
            notes = COALESCE($3::text, notes),
            updated_at = now()
      WHERE id = $4::uuid
        AND tenant_id = $5::uuid
        AND facility_id = $6::uuid
        AND status = 'pending'
      RETURNING *`,
    [
      nextStatus,
      ids.staffId,
      input.reviewNotes != null ? String(input.reviewNotes).trim() : null,
      arrangementId,
      ids.tenantId,
      ids.facilityId,
    ]
  );
  if (!updated.rows.length) {
    const existing = await pool.query(
      `SELECT id, status FROM activeclinic.payment_arrangements
        WHERE id = $1 AND tenant_id = $2 AND facility_id = $3`,
      [arrangementId, ids.tenantId, ids.facilityId]
    );
    if (!existing.rows.length) return { result: RESULT.NOT_FOUND };
    return { result: RESULT.INVALID_STATUS, reason: existing.rows[0].status };
  }

  await writeFinanceAudit(pool, {
    tenantId: ids.tenantId,
    staffId: ids.staffId,
    eventType: "activeclinic.billing.payment_arrangement_reviewed",
    resourceType: "payment_arrangement",
    resourceId: arrangementId,
    metadata: { status: nextStatus },
  });

  return {
    result: RESULT.OK,
    arrangement: mapArrangement(updated.rows[0]),
  };
}

function mapArrangement(row) {
  return {
    id: row.id,
    patientId: row.patient_id,
    arrangementNumber: row.arrangement_number,
    totalAmountMinor: toInt(row.total_amount_minor),
    currencyCode: row.currency_code,
    numberOfInstallments: toInt(row.number_of_installments),
    installmentAmountMinor: toInt(row.installment_amount_minor),
    installmentFrequency: row.installment_frequency,
    startDate: row.start_date,
    status: row.status,
    requestedByStaffId: row.requested_by_staff_id,
    approvedByStaffId: row.approved_by_staff_id,
    approvedAt: row.approved_at,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

// ============================================================================
// PRICE OVERRIDE REQUESTS
// ============================================================================

async function createPriceOverrideRequest(pool, input) {
  const ids = requireIds(input);
  if (!ids.ok) return ids;
  const denied = await assertPerm(pool, {
    tenantId: ids.tenantId,
    facilityId: ids.facilityId,
    staffId: ids.staffId,
    platformIdentityId: input.platformIdentityId,
    permissionKey: PERM.BILLING_CHARGE,
  });
  if (denied) return denied;

  const originalAmountMinor = toInt(input.originalAmountMinor, -1);
  const requestedAmountMinor = toInt(input.requestedAmountMinor, -1);
  const reason = String(input.reason || "").trim();
  if (
    originalAmountMinor < 0 ||
    requestedAmountMinor < 0 ||
    reason.length < 1 ||
    reason.length > 2000
  ) {
    return { result: RESULT.INVALID_INPUT };
  }

  if (input.patientId) {
    const patientRes = await pool.query(
      `SELECT id FROM activeclinic.patients
        WHERE id = $1 AND organization_id = $2`,
      [input.patientId, ids.tenantId]
    );
    if (!patientRes.rows.length) {
      return { result: RESULT.NOT_FOUND, reason: "patient" };
    }
  }

  const inserted = await pool.query(
    `INSERT INTO activeclinic.price_override_requests (
       tenant_id, facility_id, patient_id, charge_catalogue_item_id,
       patient_charge_id, original_amount_minor, requested_amount_minor,
       currency_code, reason, status, requested_by_staff_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10)
     RETURNING *`,
    [
      ids.tenantId,
      ids.facilityId,
      input.patientId || null,
      input.chargeCatalogueItemId || null,
      input.patientChargeId || null,
      originalAmountMinor,
      requestedAmountMinor,
      input.currencyCode || "ZMW",
      reason,
      ids.staffId,
    ]
  );

  await writeFinanceAudit(pool, {
    tenantId: ids.tenantId,
    staffId: ids.staffId,
    eventType: "activeclinic.billing.price_override_requested",
    resourceType: "price_override_request",
    resourceId: inserted.rows[0].id,
    metadata: { originalAmountMinor, requestedAmountMinor },
  });

  return {
    result: RESULT.CREATED,
    request: mapPriceOverride(inserted.rows[0]),
  };
}

async function listPriceOverrideRequests(pool, input) {
  const ids = requireIds(input);
  if (!ids.ok) return ids;
  const denied = await assertAnyPerm(
    pool,
    {
      tenantId: ids.tenantId,
      facilityId: ids.facilityId,
      staffId: ids.staffId,
      platformIdentityId: input.platformIdentityId,
    },
    [PERM.BILLING_VIEW, PERM.PRICE_OVERRIDE, PERM.BILLING_CHARGE]
  );
  if (denied) return denied;

  const params = [ids.tenantId, ids.facilityId];
  let query = `
    SELECT por.*, p.patient_number, p.first_name, p.last_name
      FROM activeclinic.price_override_requests por
      LEFT JOIN activeclinic.patients p ON p.id = por.patient_id
     WHERE por.tenant_id = $1 AND por.facility_id = $2
  `;
  if (input.status) {
    params.push(input.status);
    query += ` AND por.status = $${params.length}`;
  }
  query += ` ORDER BY por.created_at DESC LIMIT 200`;

  const result = await pool.query(query, params);
  return {
    result: RESULT.OK,
    items: result.rows.map((row) => ({
      ...mapPriceOverride(row),
      patientNumber: row.patient_number || null,
      patientName: row.first_name
        ? `${row.first_name} ${row.last_name}`.trim()
        : null,
    })),
  };
}

async function reviewPriceOverrideRequest(pool, input) {
  const ids = requireIds(input);
  if (!ids.ok) return ids;
  const denied = await assertPerm(pool, {
    tenantId: ids.tenantId,
    facilityId: ids.facilityId,
    staffId: ids.staffId,
    platformIdentityId: input.platformIdentityId,
    permissionKey: PERM.PRICE_OVERRIDE,
  });
  if (denied) return denied;

  const requestId = input.requestId || input.id;
  const action = String(input.action || input.decision || "").trim().toLowerCase();
  if (!requestId || !OVERRIDE_REVIEW_ACTIONS.has(action)) {
    return { result: RESULT.INVALID_INPUT };
  }
  const nextStatus = action === "approve" ? "approved" : "rejected";
  const reviewNotes =
    input.reviewNotes != null ? String(input.reviewNotes).trim().slice(0, 2000) : null;

  const updated = await pool.query(
    `UPDATE activeclinic.price_override_requests
        SET status = $1,
            reviewed_by_staff_id = $2,
            reviewed_at = now(),
            review_notes = $3,
            updated_at = now()
      WHERE id = $4
        AND tenant_id = $5
        AND facility_id = $6
        AND status = 'pending'
      RETURNING *`,
    [nextStatus, ids.staffId, reviewNotes, requestId, ids.tenantId, ids.facilityId]
  );
  if (!updated.rows.length) {
    const existing = await pool.query(
      `SELECT id, status FROM activeclinic.price_override_requests
        WHERE id = $1 AND tenant_id = $2 AND facility_id = $3`,
      [requestId, ids.tenantId, ids.facilityId]
    );
    if (!existing.rows.length) return { result: RESULT.NOT_FOUND };
    return { result: RESULT.INVALID_STATUS, reason: existing.rows[0].status };
  }

  await writeFinanceAudit(pool, {
    tenantId: ids.tenantId,
    staffId: ids.staffId,
    eventType: "activeclinic.billing.price_override_reviewed",
    resourceType: "price_override_request",
    resourceId: requestId,
    metadata: { status: nextStatus },
  });

  return {
    result: RESULT.OK,
    request: mapPriceOverride(updated.rows[0]),
  };
}

function mapPriceOverride(row) {
  return {
    id: row.id,
    patientId: row.patient_id,
    chargeCatalogueItemId: row.charge_catalogue_item_id,
    patientChargeId: row.patient_charge_id,
    originalAmountMinor: toInt(row.original_amount_minor),
    requestedAmountMinor: toInt(row.requested_amount_minor),
    currencyCode: row.currency_code,
    reason: row.reason,
    status: row.status,
    requestedByStaffId: row.requested_by_staff_id,
    reviewedByStaffId: row.reviewed_by_staff_id,
    reviewedAt: row.reviewed_at,
    reviewNotes: row.review_notes,
    createdAt: row.created_at,
  };
}

// ============================================================================
// PATIENT STATEMENT / REFUND RECEIPT
// ============================================================================

async function getPatientAccountStatement(pool, input) {
  const ids = requireIds(input);
  if (!ids.ok) return ids;
  const denied = await assertPerm(pool, {
    tenantId: ids.tenantId,
    facilityId: ids.facilityId,
    staffId: ids.staffId,
    platformIdentityId: input.platformIdentityId,
    permissionKey: PERM.BILLING_VIEW,
  });
  if (denied) return denied;

  const patientNumber = input.patientNumber;
  const patientId = input.patientId;
  if (!patientNumber && !patientId) {
    return { result: RESULT.INVALID_INPUT, reason: "patient" };
  }

  const patientRes = await pool.query(
    patientId
      ? `SELECT id, patient_number, first_name, last_name, date_of_birth
           FROM activeclinic.patients
          WHERE id = $1 AND organization_id = $2`
      : `SELECT id, patient_number, first_name, last_name, date_of_birth
           FROM activeclinic.patients
          WHERE patient_number = $1 AND organization_id = $2`,
    [patientId || patientNumber, ids.tenantId]
  );
  if (!patientRes.rows.length) return { result: RESULT.NOT_FOUND };
  const patient = patientRes.rows[0];

  const [charges, invoices, payments, creditNotes] = await Promise.all([
    pool.query(
      `SELECT id, description, charge_type, total_amount_minor, currency_code,
              status, review_status, charged_at
         FROM activeclinic.patient_charges
        WHERE tenant_id = $1 AND facility_id = $2 AND patient_id = $3
        ORDER BY charged_at DESC`,
      [ids.tenantId, ids.facilityId, patient.id]
    ),
    pool.query(
      `SELECT i.*,
              COALESCE(alloc.paid_minor, 0)::bigint AS paid_minor,
              COALESCE(cn.credit_minor, 0)::bigint AS credit_minor,
              (i.total_amount_minor
                - COALESCE(alloc.paid_minor, 0)
                - COALESCE(cn.credit_minor, 0))::bigint AS balance_minor
         FROM activeclinic.invoices i
         LEFT JOIN (
           SELECT invoice_id, SUM(allocated_amount_minor)::bigint AS paid_minor
             FROM activeclinic.payment_allocations
            GROUP BY invoice_id
         ) alloc ON alloc.invoice_id = i.id
         LEFT JOIN (
           SELECT invoice_id, SUM(amount_minor)::bigint AS credit_minor
             FROM activeclinic.credit_notes
            WHERE status = 'posted'
            GROUP BY invoice_id
         ) cn ON cn.invoice_id = i.id
        WHERE i.tenant_id = $1 AND i.facility_id = $2 AND i.patient_id = $3
        ORDER BY i.invoice_date DESC, i.created_at DESC`,
      [ids.tenantId, ids.facilityId, patient.id]
    ),
    pool.query(
      `SELECT id, payment_number, payment_date, amount_minor, currency_code,
              payment_method, notes
         FROM activeclinic.payments
        WHERE tenant_id = $1 AND facility_id = $2 AND patient_id = $3
        ORDER BY payment_date DESC, created_at DESC`,
      [ids.tenantId, ids.facilityId, patient.id]
    ),
    pool.query(
      `SELECT id, credit_note_number, amount_minor, currency_code, reason,
              status, invoice_id, created_at
         FROM activeclinic.credit_notes
        WHERE tenant_id = $1 AND facility_id = $2 AND patient_id = $3
        ORDER BY created_at DESC`,
      [ids.tenantId, ids.facilityId, patient.id]
    ),
  ]);

  let chargesTotal = 0;
  let paymentsTotal = 0;
  let creditsTotal = 0;
  let openBalance = 0;

  for (const row of charges.rows) {
    if (row.status !== "cancelled") chargesTotal += toInt(row.total_amount_minor);
  }
  for (const row of payments.rows) {
    paymentsTotal += toInt(row.amount_minor);
  }
  for (const row of creditNotes.rows) {
    if (row.status === "posted") creditsTotal += toInt(row.amount_minor);
  }
  for (const row of invoices.rows) {
    if (row.status === "posted") {
      openBalance += Math.max(0, toInt(row.balance_minor));
    }
  }

  return {
    result: RESULT.OK,
    statement: {
      patient: {
        id: patient.id,
        patientNumber: patient.patient_number,
        name: `${patient.first_name} ${patient.last_name}`.trim(),
        dateOfBirth: patient.date_of_birth,
      },
      generatedAt: new Date().toISOString(),
      facilityId: ids.facilityId,
      charges: charges.rows.map((row) => ({
        id: row.id,
        description: row.description,
        chargeType: row.charge_type,
        totalAmountMinor: toInt(row.total_amount_minor),
        currencyCode: row.currency_code,
        status: row.status,
        reviewStatus: row.review_status,
        chargedAt: row.charged_at,
      })),
      invoices: invoices.rows.map((row) => ({
        id: row.id,
        invoiceNumber: row.invoice_number,
        invoiceDate: row.invoice_date,
        status: row.status,
        totalAmountMinor: toInt(row.total_amount_minor),
        paidMinor: toInt(row.paid_minor),
        creditMinor: toInt(row.credit_minor),
        balanceMinor: toInt(row.balance_minor),
        currencyCode: row.currency_code,
      })),
      payments: payments.rows.map((row) => ({
        id: row.id,
        paymentNumber: row.payment_number,
        paymentDate: row.payment_date,
        amountMinor: toInt(row.amount_minor),
        currencyCode: row.currency_code,
        paymentMethod: row.payment_method,
        notes: row.notes,
      })),
      creditNotes: creditNotes.rows.map((row) => ({
        id: row.id,
        creditNoteNumber: row.credit_note_number,
        amountMinor: toInt(row.amount_minor),
        currencyCode: row.currency_code,
        reason: row.reason,
        status: row.status,
        invoiceId: row.invoice_id,
        createdAt: row.created_at,
      })),
      summary: {
        chargesTotalMinor: chargesTotal,
        paymentsTotalMinor: paymentsTotal,
        creditsTotalMinor: creditsTotal,
        openBalanceMinor: openBalance,
      },
    },
  };
}

async function getRefundReceipt(pool, input) {
  const ids = requireIds(input);
  if (!ids.ok) return ids;
  const denied = await assertAnyPerm(
    pool,
    {
      tenantId: ids.tenantId,
      facilityId: ids.facilityId,
      staffId: ids.staffId,
      platformIdentityId: input.platformIdentityId,
    },
    [PERM.PAYMENT_REFUND, PERM.PAYMENT_VIEW]
  );
  if (denied) return denied;

  const refundId = input.refundId || input.id;
  if (!refundId) return { result: RESULT.INVALID_INPUT };

  const result = await pool.query(
    `SELECT r.*,
            op.payment_number AS original_payment_number,
            op.amount_minor AS original_payment_amount_minor,
            op.payment_method AS original_payment_method,
            op.payment_date AS original_payment_date,
            op.patient_id,
            p.patient_number, p.first_name, p.last_name,
            rp.payment_number AS refund_payment_number
       FROM activeclinic.refunds r
       JOIN activeclinic.payments op ON op.id = r.original_payment_id
       LEFT JOIN activeclinic.payments rp ON rp.id = r.refund_payment_id
       JOIN activeclinic.patients p ON p.id = op.patient_id
      WHERE r.id = $1 AND r.tenant_id = $2 AND r.facility_id = $3`,
    [refundId, ids.tenantId, ids.facilityId]
  );
  if (!result.rows.length) return { result: RESULT.NOT_FOUND };
  const row = result.rows[0];

  return {
    result: RESULT.OK,
    receipt: {
      refundId: row.id,
      refundDate: row.refund_date,
      refundAmountMinor: toInt(row.refund_amount_minor),
      currencyCode: row.currency_code,
      reason: row.reason,
      status: row.status,
      originalPayment: {
        id: row.original_payment_id,
        paymentNumber: row.original_payment_number,
        amountMinor: toInt(row.original_payment_amount_minor),
        paymentMethod: row.original_payment_method,
        paymentDate: row.original_payment_date,
      },
      refundPaymentNumber: row.refund_payment_number || null,
      patient: {
        id: row.patient_id,
        patientNumber: row.patient_number,
        name: `${row.first_name} ${row.last_name}`.trim(),
      },
    },
  };
}

// ============================================================================
// REVENUE REPORTS
// ============================================================================

function parseDateRange(input) {
  const today = new Date().toISOString().slice(0, 10);
  const dateFrom = input.dateFrom || input.from || today;
  const dateTo = input.dateTo || input.to || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return { ok: false, result: RESULT.INVALID_INPUT, reason: "date_range" };
  }
  if (dateFrom > dateTo) {
    return { ok: false, result: RESULT.INVALID_INPUT, reason: "date_order" };
  }
  return { ok: true, dateFrom, dateTo };
}

async function getRevenueReportSummary(pool, input) {
  const ids = requireIds(input);
  if (!ids.ok) return ids;
  const denied = await assertPerm(pool, {
    tenantId: ids.tenantId,
    facilityId: ids.facilityId,
    staffId: ids.staffId,
    platformIdentityId: input.platformIdentityId,
    permissionKey: PERM.REPORTS_VIEW,
  });
  if (denied) return denied;

  const range = parseDateRange(input);
  if (!range.ok) return range;

  const [invoices, payments, refunds, creditNotes] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS count,
              COALESCE(SUM(total_amount_minor), 0)::bigint AS total_minor
         FROM activeclinic.invoices
        WHERE tenant_id = $1 AND facility_id = $2
          AND status = 'posted'
          AND invoice_date BETWEEN $3 AND $4`,
      [ids.tenantId, ids.facilityId, range.dateFrom, range.dateTo]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count,
              COALESCE(SUM(amount_minor), 0)::bigint AS total_minor
         FROM activeclinic.payments
        WHERE tenant_id = $1 AND facility_id = $2
          AND payment_date BETWEEN $3 AND $4`,
      [ids.tenantId, ids.facilityId, range.dateFrom, range.dateTo]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count,
              COALESCE(SUM(refund_amount_minor), 0)::bigint AS total_minor
         FROM activeclinic.refunds
        WHERE tenant_id = $1 AND facility_id = $2
          AND status IN ('completed', 'approved')
          AND refund_date BETWEEN $3 AND $4`,
      [ids.tenantId, ids.facilityId, range.dateFrom, range.dateTo]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count,
              COALESCE(SUM(amount_minor), 0)::bigint AS total_minor
         FROM activeclinic.credit_notes
        WHERE tenant_id = $1 AND facility_id = $2
          AND status = 'posted'
          AND created_at::date BETWEEN $3 AND $4`,
      [ids.tenantId, ids.facilityId, range.dateFrom, range.dateTo]
    ),
  ]);

  const postedInvoicesMinor = toInt(invoices.rows[0].total_minor);
  const paymentsMinor = toInt(payments.rows[0].total_minor);
  const refundsMinor = toInt(refunds.rows[0].total_minor);
  const creditsMinor = toInt(creditNotes.rows[0].total_minor);

  return {
    result: RESULT.OK,
    summary: {
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      facilityId: ids.facilityId,
      postedInvoices: {
        count: toInt(invoices.rows[0].count),
        totalMinor: postedInvoicesMinor,
      },
      payments: {
        count: toInt(payments.rows[0].count),
        totalMinor: paymentsMinor,
      },
      refunds: {
        count: toInt(refunds.rows[0].count),
        totalMinor: refundsMinor,
      },
      creditNotes: {
        count: toInt(creditNotes.rows[0].count),
        totalMinor: creditsMinor,
      },
      netCollectionsMinor: paymentsMinor - refundsMinor,
    },
  };
}

async function getRevenueReportDetailed(pool, input) {
  const ids = requireIds(input);
  if (!ids.ok) return ids;
  const denied = await assertPerm(pool, {
    tenantId: ids.tenantId,
    facilityId: ids.facilityId,
    staffId: ids.staffId,
    platformIdentityId: input.platformIdentityId,
    permissionKey: PERM.REPORTS_VIEW,
  });
  if (denied) return denied;

  const range = parseDateRange(input);
  if (!range.ok) return range;

  const summaryResult = await getRevenueReportSummary(pool, input);
  if (summaryResult.result !== RESULT.OK) return summaryResult;

  const [invoiceRows, paymentRows] = await Promise.all([
    pool.query(
      `SELECT i.id, i.invoice_number, i.invoice_date, i.total_amount_minor,
              i.currency_code, i.patient_id, p.patient_number,
              p.first_name, p.last_name
         FROM activeclinic.invoices i
         JOIN activeclinic.patients p ON p.id = i.patient_id
        WHERE i.tenant_id = $1 AND i.facility_id = $2
          AND i.status = 'posted'
          AND i.invoice_date BETWEEN $3 AND $4
        ORDER BY i.invoice_date, i.invoice_number`,
      [ids.tenantId, ids.facilityId, range.dateFrom, range.dateTo]
    ),
    pool.query(
      `SELECT pay.id, pay.payment_number, pay.payment_date, pay.amount_minor,
              pay.currency_code, pay.payment_method, pay.patient_id,
              p.patient_number, p.first_name, p.last_name
         FROM activeclinic.payments pay
         JOIN activeclinic.patients p ON p.id = pay.patient_id
        WHERE pay.tenant_id = $1 AND pay.facility_id = $2
          AND pay.payment_date BETWEEN $3 AND $4
        ORDER BY pay.payment_date, pay.payment_number`,
      [ids.tenantId, ids.facilityId, range.dateFrom, range.dateTo]
    ),
  ]);

  return {
    result: RESULT.OK,
    summary: summaryResult.summary,
    invoices: invoiceRows.rows.map((row) => ({
      id: row.id,
      invoiceNumber: row.invoice_number,
      invoiceDate: row.invoice_date,
      totalAmountMinor: toInt(row.total_amount_minor),
      currencyCode: row.currency_code,
      patientId: row.patient_id,
      patientNumber: row.patient_number,
      patientName: `${row.first_name} ${row.last_name}`.trim(),
    })),
    payments: paymentRows.rows.map((row) => ({
      id: row.id,
      paymentNumber: row.payment_number,
      paymentDate: row.payment_date,
      amountMinor: toInt(row.amount_minor),
      currencyCode: row.currency_code,
      paymentMethod: row.payment_method,
      patientId: row.patient_id,
      patientNumber: row.patient_number,
      patientName: `${row.first_name} ${row.last_name}`.trim(),
    })),
  };
}

module.exports = {
  RESULT,
  PERM,
  listAccountsReceivable,
  listCollectionsQueue,
  recordCollectionsContact,
  listPendingChargeReviews,
  reviewPatientCharge,
  createCreditNote,
  listCreditNotes,
  getCreditNote,
  listFinancialCorrections,
  createPaymentArrangement,
  listPaymentArrangements,
  getPaymentArrangement,
  reviewPaymentArrangement,
  createPriceOverrideRequest,
  listPriceOverrideRequests,
  reviewPriceOverrideRequest,
  getPatientAccountStatement,
  getRefundReceipt,
  getRevenueReportSummary,
  getRevenueReportDetailed,
};
