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

function serializeLedgerRow(row) {
  if (!row) return row;
  const o = { ...row };
  if (o.created_at instanceof Date) {
    o.created_at = o.created_at.toISOString().replace("T", " ").slice(0, 19);
  }
  return o;
}

/**
 * @param {import("pg").Pool} pool
 */
async function listRecentLedgerEntriesAsync(pool, tenantId, companyId, limit) {
  const lim = Math.min(100, Math.max(1, Math.floor(Number(limit) || 25)));
  const r = await pool.query(
    `SELECT id, amount_zmw, payment_method, transaction_reference, payment_date, approver_name,
            recorded_by_admin_user_id, notes, created_at
     FROM public.company_portal_credit_ledger_entries
     WHERE tenant_id = $1 AND company_id = $2
     ORDER BY id DESC
     LIMIT $3`,
    [Number(tenantId), Number(companyId), lim]
  );
  return r.rows.map(serializeLedgerRow);
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
 * @param {import("pg").Pool} pool
 * @param {RecordAdminPaymentInput} input
 * @returns {Promise<{ ok: true, newBalance: number, ledgerId: number } | { ok: false, error: string }>}
 */
async function recordAdminPaymentCreditAsync(pool, input) {
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

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const co = await client.query(`SELECT id FROM public.companies WHERE id = $1 AND tenant_id = $2`, [cid, tid]);
    if (co.rowCount === 0) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Company not found in this region." };
    }

    let acc = await client.query(
      `SELECT id FROM public.company_portal_credit_accounts WHERE tenant_id = $1 AND company_id = $2`,
      [tid, cid]
    );
    let accountId;
    if (acc.rows.length === 0) {
      const insA = await client.query(
        `INSERT INTO public.company_portal_credit_accounts (tenant_id, company_id) VALUES ($1, $2) RETURNING id`,
        [tid, cid]
      );
      accountId = Number(insA.rows[0].id);
    } else {
      accountId = Number(acc.rows[0].id);
    }

    const ins = await client.query(
      `INSERT INTO public.company_portal_credit_ledger_entries (
        tenant_id, company_id, credit_account_id, amount_zmw, payment_method,
        transaction_reference, payment_date, approver_name, recorded_by_admin_user_id, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id`,
      [tid, cid, accountId, amount, method, ref, payDate, approver, uid, notes]
    );
    await client.query(
      `UPDATE public.companies SET portal_lead_credits_balance = portal_lead_credits_balance + $1, updated_at = now()
       WHERE id = $2 AND tenant_id = $3`,
      [amount, cid, tid]
    );
    const balRow = await client.query(
      `SELECT portal_lead_credits_balance FROM public.companies WHERE id = $1 AND tenant_id = $2`,
      [cid, tid]
    );
    await client.query("COMMIT");
    const newBalance = Number(balRow.rows[0] && balRow.rows[0].portal_lead_credits_balance) || 0;
    return { ok: true, newBalance, ledgerId: Number(ins.rows[0].id) };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    return { ok: false, error: String(e && e.message) || "Could not record payment." };
  } finally {
    client.release();
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
  listRecentLedgerEntriesAsync,
  recordAdminPaymentCreditAsync,
  paymentMethodLabel,
};
