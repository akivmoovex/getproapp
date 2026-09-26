"use strict";

/**
 * Patient-portal read projection for invoices & receipts (AC-P06).
 * Ownership: patient_id + tenant (organization) only.
 * Does not use staff billing RBAC, cashier sessions, or staff billing EJS.
 */

const { formatMoney } = require("../../platform/money/formatMoney");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  ACCESS_DENIED: "access_denied",
  NOT_FOUND: "not_found",
  NO_PATIENT: "no_patient",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PATIENT_VISIBLE_INVOICE_STATUSES = Object.freeze(["pending", "posted"]);

const STATUS_LABELS = Object.freeze({
  pending: "Awaiting payment",
  posted: "Issued",
  paid: "Paid in full",
  partial: "Balance due",
});

function mapInvoiceRow(row) {
  const totalMinor = parseInt(row.total_amount_minor, 10) || 0;
  const paidMinor = parseInt(row.paid_minor, 10) || 0;
  const creditMinor = parseInt(row.credit_minor, 10) || 0;
  const balanceMinor = Math.max(0, totalMinor - paidMinor - creditMinor);
  const currencyCode = row.currency_code || "ZMW";
  let displayStatus = row.status;
  if (row.status === "posted" || row.status === "pending") {
    displayStatus = balanceMinor <= 0 ? "paid" : paidMinor > 0 ? "partial" : row.status;
  }
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    status: row.status,
    displayStatus,
    statusLabel: STATUS_LABELS[displayStatus] || displayStatus,
    totalMinor,
    paidMinor,
    creditMinor,
    balanceMinor,
    currencyCode,
    totalFormatted: formatMoney(totalMinor, currencyCode),
    balanceFormatted: formatMoney(balanceMinor, currencyCode),
    paidFormatted: formatMoney(paidMinor, currencyCode),
    facilityDisplayName: row.facility_display_name || null,
    notes: row.notes || null,
  };
}

function mapReceiptRow(row) {
  const amountMinor = parseInt(row.amount_minor, 10) || 0;
  const currencyCode = row.currency_code || "ZMW";
  return {
    id: row.id,
    receiptNumber: row.receipt_number,
    receiptDate: row.receipt_date,
    amountMinor,
    currencyCode,
    amountFormatted: formatMoney(amountMinor, currencyCode),
    paymentNumber: row.payment_number || null,
    paymentMethod: row.payment_method || null,
    facilityDisplayName: row.facility_display_name || null,
    issuedToPatientName: row.issued_to_patient_name || null,
  };
}

/**
 * List patient-visible invoices for the authenticated portal patient.
 */
async function listPatientInvoices(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const patientId = String((input && input.patientId) || "").trim();
  if (!UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, invoices: [], summary: null };
  }
  if (!patientId) {
    return { ok: false, code: RESULT.NO_PATIENT, invoices: [], summary: null };
  }
  if (!UUID_RE.test(patientId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, invoices: [], summary: null };
  }

  const statusFilter = String((input && input.statusFilter) || "").trim();
  const params = [organizationId, patientId];
  const clauses = [
    "i.tenant_id = $1",
    "i.patient_id = $2",
    `i.status = ANY($${params.length + 1}::text[])`,
  ];
  params.push([...PATIENT_VISIBLE_INVOICE_STATUSES]);

  const result = await db.query(
    `SELECT i.id, i.invoice_number, i.invoice_date, i.due_date, i.status,
            i.total_amount_minor, i.currency_code, i.notes,
            f.display_name AS facility_display_name,
            COALESCE(alloc.paid_minor, 0)::bigint AS paid_minor,
            0::bigint AS credit_minor
       FROM activeclinic.invoices i
       JOIN activeclinic.facilities f ON f.id = i.facility_id
       LEFT JOIN (
         SELECT invoice_id, SUM(allocated_amount_minor)::bigint AS paid_minor
           FROM activeclinic.payment_allocations
          GROUP BY invoice_id
       ) alloc ON alloc.invoice_id = i.id
      WHERE ${clauses.join(" AND ")}
      ORDER BY i.invoice_date DESC, i.created_at DESC
      LIMIT 100`,
    params
  );

  let invoices = result.rows.map(mapInvoiceRow);
  if (statusFilter === "outstanding") {
    invoices = invoices.filter((inv) => inv.balanceMinor > 0);
  } else if (statusFilter === "paid") {
    invoices = invoices.filter((inv) => inv.balanceMinor <= 0);
  }

  const outstandingMinor = invoices.reduce(
    (sum, inv) => sum + (inv.balanceMinor > 0 ? inv.balanceMinor : 0),
    0
  );
  const currencyCode = (invoices[0] && invoices[0].currencyCode) || "ZMW";

  return {
    ok: true,
    code: RESULT.OK,
    invoices,
    summary: {
      outstandingMinor,
      outstandingFormatted: formatMoney(outstandingMinor, currencyCode),
      currencyCode,
      invoiceCount: invoices.length,
      outstandingCount: invoices.filter((i) => i.balanceMinor > 0).length,
    },
  };
}

/**
 * List official receipts for payments belonging to the portal patient.
 */
async function listPatientReceipts(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const patientId = String((input && input.patientId) || "").trim();
  if (!UUID_RE.test(organizationId) || !patientId || !UUID_RE.test(patientId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, receipts: [] };
  }

  const result = await db.query(
    `SELECT r.id, r.receipt_number, r.receipt_date, r.amount_minor, r.currency_code,
            r.issued_to_patient_name,
            pay.payment_number, pay.payment_method,
            f.display_name AS facility_display_name
       FROM activeclinic.receipts r
       JOIN activeclinic.payments pay ON pay.id = r.payment_id
       JOIN activeclinic.facilities f ON f.id = r.facility_id
      WHERE r.tenant_id = $1
        AND pay.patient_id = $2
        AND pay.tenant_id = $1
      ORDER BY r.receipt_date DESC, r.created_at DESC
      LIMIT 100`,
    [organizationId, patientId]
  );

  return {
    ok: true,
    code: RESULT.OK,
    receipts: result.rows.map(mapReceiptRow),
  };
}

module.exports = {
  RESULT,
  PATIENT_VISIBLE_INVOICE_STATUSES,
  listPatientInvoices,
  listPatientReceipts,
};
