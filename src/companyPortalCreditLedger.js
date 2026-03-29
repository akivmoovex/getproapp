/**
 * Provider portal lead credits: ledger + cached balance on companies.portal_lead_credits_balance.
 * All writes are tenant-scoped; ledger rows are the auditable source for admin payments.
 */

const PAYMENT_METHODS = /** @type {const} */ ([
  "bank_transfer",
  "mobile_money",
  "cash",
  "card",
  "other",
]);

/** @type {Set<string>} */
const PAYMENT_METHOD_SET = new Set(PAYMENT_METHODS);

/**
 * @param {unknown} v
 * @returns {string|null}
 */
function normalizePaymentMethod(v) {
  const s = String(v || "").trim().toLowerCase();
  return PAYMENT_METHOD_SET.has(s) ? s : null;
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} tenantId
 * @param {number} companyId
 * @returns {number} account id
 */
function ensureCreditAccount(db, tenantId, companyId) {
  const tid = Number(tenantId);
  const cid = Number(companyId);
  const existing = db
    .prepare(`SELECT id FROM company_portal_credit_accounts WHERE tenant_id = ? AND company_id = ?`)
    .get(tid, cid);
  if (existing && existing.id != null) return Number(existing.id);
  db.prepare(
    `INSERT INTO company_portal_credit_accounts (tenant_id, company_id) VALUES (?, ?)`
  ).run(tid, cid);
  const row = db.prepare(`SELECT id FROM company_portal_credit_accounts WHERE tenant_id = ? AND company_id = ?`).get(tid, cid);
  return row ? Number(row.id) : 0;
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} tenantId
 * @param {number} companyId
 * @param {number} limit
 */
function listRecentLedgerEntries(db, tenantId, companyId, limit) {
  const lim = Math.min(100, Math.max(1, Math.floor(Number(limit) || 25)));
  return db
    .prepare(
      `SELECT id, amount_zmw, payment_method, transaction_reference, payment_date, approver_name,
              recorded_by_admin_user_id, notes, created_at
       FROM company_portal_credit_ledger_entries
       WHERE tenant_id = ? AND company_id = ?
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(Number(tenantId), Number(companyId), lim);
}

/**
 * @typedef {Object} RecordAdminPaymentInput
 * @property {number} tenantId
 * @property {number} companyId
 * @property {number|null|undefined} adminUserId
 * @property {number} amountZmw
 * @property {string} paymentMethod
 * @property {string} transactionReference
 * @property {string} paymentDate YYYY-MM-DD
 * @property {string} approverName
 * @property {string} [notes]
 */

/**
 * @param {import("better-sqlite3").Database} db
 * @param {RecordAdminPaymentInput} input
 * @returns {{ ok: true, newBalance: number, ledgerId: number } | { ok: false, error: string }}
 */
function recordAdminPaymentCredit(db, input) {
  const tid = Number(input.tenantId);
  const cid = Number(input.companyId);
  const uid = input.adminUserId != null && Number.isFinite(Number(input.adminUserId)) ? Number(input.adminUserId) : null;
  const amount = Number(input.amountZmw);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) {
    return { ok: false, error: "Enter a valid payment amount (ZMW)." };
  }
  const method = normalizePaymentMethod(input.paymentMethod);
  if (!method) return { ok: false, error: "Choose a payment method." };
  const ref = String(input.transactionReference || "").trim().slice(0, 200);
  if (!ref) return { ok: false, error: "Transaction / reference number is required." };
  const payDate = String(input.paymentDate || "").trim().slice(0, 32);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payDate)) return { ok: false, error: "Payment date must be YYYY-MM-DD." };
  const approver = String(input.approverName || "").trim().slice(0, 200);
  if (!approver) return { ok: false, error: "Approver name is required." };
  const notes = String(input.notes || "").trim().slice(0, 2000);

  const co = db.prepare(`SELECT id FROM companies WHERE id = ? AND tenant_id = ?`).get(cid, tid);
  if (!co) return { ok: false, error: "Company not found in this region." };

  const run = db.transaction(() => {
    const accountId = ensureCreditAccount(db, tid, cid);
    const ins = db
      .prepare(
        `INSERT INTO company_portal_credit_ledger_entries (
          tenant_id, company_id, credit_account_id, amount_zmw, payment_method,
          transaction_reference, payment_date, approver_name, recorded_by_admin_user_id, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(tid, cid, accountId, amount, method, ref, payDate, approver, uid, notes);
    db.prepare(
      `UPDATE companies SET portal_lead_credits_balance = portal_lead_credits_balance + ?, updated_at = datetime('now')
       WHERE id = ? AND tenant_id = ?`
    ).run(amount, cid, tid);
    const balRow = db.prepare(`SELECT portal_lead_credits_balance FROM companies WHERE id = ? AND tenant_id = ?`).get(cid, tid);
    return { ledgerId: Number(ins.lastInsertRowid), newBalance: Number(balRow && balRow.portal_lead_credits_balance) || 0 };
  });

  try {
    const out = run();
    return { ok: true, newBalance: out.newBalance, ledgerId: out.ledgerId };
  } catch (e) {
    return { ok: false, error: String(e && e.message) || "Could not record payment." };
  }
}

function paymentMethodLabel(code) {
  const c = String(code || "").toLowerCase();
  const map = {
    bank_transfer: "Bank transfer",
    mobile_money: "Mobile money",
    cash: "Cash",
    card: "Card",
    other: "Other",
  };
  return map[c] || c || "—";
}

module.exports = {
  PAYMENT_METHODS,
  normalizePaymentMethod,
  ensureCreditAccount,
  listRecentLedgerEntries,
  recordAdminPaymentCredit,
  paymentMethodLabel,
};
