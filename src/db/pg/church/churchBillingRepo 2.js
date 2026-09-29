"use strict";

/**
 * Persistence helpers for Growth billing readiness.
 */

const {
  GROWTH_PACKAGE_CODE,
  ACTIVE_BRANCH_ITEM_CODE,
  GROWTH_MONTHLY_PER_BRANCH_CENTS,
} = require("../../../church/blessBoardBillingCatalogue");

async function getCurrentPrice(db, opts = {}) {
  const packageCode = opts.packageCode || GROWTH_PACKAGE_CODE;
  const itemCode = opts.itemCode || ACTIVE_BRANCH_ITEM_CODE;
  const interval = opts.billingInterval || "monthly";
  const r = await db.query(
    `SELECT *
     FROM public.church_billing_price_book
     WHERE package_code = $1 AND item_code = $2 AND billing_interval = $3 AND is_current = true
     ORDER BY id DESC
     LIMIT 1`,
    [packageCode, itemCode, interval]
  );
  return r.rows[0] || null;
}

async function listPriceHistory(db, packageCode = GROWTH_PACKAGE_CODE) {
  const r = await db.query(
    `SELECT *
     FROM public.church_billing_package_price_history
     WHERE package_code = $1
     ORDER BY effective_from DESC, id DESC`,
    [packageCode]
  );
  return r.rows;
}

async function insertPackageHistory(db, entry) {
  const effectiveAt = entry.effective_at ? new Date(entry.effective_at) : null;
  const r = await db.query(
    `INSERT INTO public.church_organization_package_history (
       organization_id, previous_plan_code, new_plan_code,
       previous_package_code, new_package_code,
       changed_by_platform_admin_id, change_reason, effective_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8::timestamptz, now()))
     RETURNING *`,
    [
      entry.organization_id,
      entry.previous_plan_code || null,
      entry.new_plan_code,
      entry.previous_package_code || null,
      entry.new_package_code,
      entry.changed_by_platform_admin_id || null,
      entry.change_reason || null,
      effectiveAt && !Number.isNaN(effectiveAt.getTime()) ? effectiveAt.toISOString() : null,
    ]
  );
  return r.rows[0];
}

async function listPackageHistoryForOrganization(db, organizationId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 100);
  const r = await db.query(
    `SELECT *
     FROM public.church_organization_package_history
     WHERE organization_id = $1
     ORDER BY effective_at DESC, id DESC
     LIMIT $2`,
    [organizationId, limit]
  );
  return r.rows;
}

async function ensureBillingPeriod(db, organizationId, cadence, periodStart, periodEnd) {
  const r = await db.query(
    `INSERT INTO public.church_billing_periods (
       organization_id, cadence, period_start, period_end, status
     ) VALUES ($1, $2, $3::date, $4::date, 'open')
     ON CONFLICT (organization_id, cadence, period_start, period_end) DO UPDATE
       SET status = public.church_billing_periods.status
     RETURNING *`,
    [organizationId, cadence, periodStart, periodEnd]
  );
  return r.rows[0];
}

async function findInvoiceByIdempotencyKey(db, idempotencyKey) {
  const r = await db.query(
    `SELECT * FROM public.church_billing_invoices WHERE idempotency_key = $1 LIMIT 1`,
    [idempotencyKey]
  );
  return r.rows[0] || null;
}

async function insertDraftInvoice(db, row) {
  const r = await db.query(
    `INSERT INTO public.church_billing_invoices (
       organization_id, billing_period_id, idempotency_key, invoice_number,
       cadence, period_start, period_end, currency,
       subtotal_cents, discount_cents, credit_cents, tax_cents, total_cents,
       status, payment_status, annual_discount_applied, annual_discount_bps,
       is_prorated, billable_branch_count, snapshot_key,
       line_items_json, calculation_json
     ) VALUES (
       $1,$2,$3,$4,$5,$6::date,$7::date,$8,
       $9,$10,$11,$12,$13,
       'draft','awaiting_provider',$14,$15,
       $16,$17,$18,
       $19::jsonb,$20::jsonb
     )
     RETURNING *`,
    [
      row.organization_id,
      row.billing_period_id || null,
      row.idempotency_key,
      row.invoice_number || null,
      row.cadence,
      row.period_start,
      row.period_end,
      row.currency || "USD",
      row.subtotal_cents,
      row.discount_cents,
      row.credit_cents,
      row.tax_cents,
      row.total_cents,
      row.annual_discount_applied === true,
      row.annual_discount_bps || 0,
      row.is_prorated === true,
      row.billable_branch_count || 0,
      row.snapshot_key || null,
      JSON.stringify(row.line_items_json || []),
      JSON.stringify(row.calculation_json || {}),
    ]
  );
  return r.rows[0];
}

async function replaceBranchSnapshots(db, organizationId, snapshotKey, periodId, lines) {
  await db.query(
    `DELETE FROM public.church_billing_branch_snapshots
     WHERE organization_id = $1 AND snapshot_key = $2`,
    [organizationId, snapshotKey]
  );
  const inserted = [];
  for (const line of lines) {
    const r = await db.query(
      `INSERT INTO public.church_billing_branch_snapshots (
         organization_id, billing_period_id, snapshot_key, branch_id,
         branch_slug, branch_name, billing_started_at, billing_ends_at,
         billable_from, billable_to, billable_days, period_days, is_prorated,
         unit_amount_cents, line_amount_cents, currency, metadata_json
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10::date,$11,$12,$13,$14,$15,$16,$17::jsonb
       )
       RETURNING *`,
      [
        organizationId,
        periodId || null,
        snapshotKey,
        line.branchId,
        line.branchSlug || null,
        line.branchName || null,
        line.billingStartedAt || null,
        line.billingEndsAt || null,
        line.billableFrom,
        line.billableTo,
        line.billableDays,
        line.periodDays,
        line.isProrated === true,
        line.unitAmountCents,
        line.lineAmountCents,
        line.currency || "USD",
        JSON.stringify(line.metadata || {}),
      ]
    );
    inserted.push(r.rows[0]);
  }
  return inserted;
}

async function listOpenCredits(db, organizationId) {
  const r = await db.query(
    `SELECT * FROM public.church_billing_credits
     WHERE organization_id = $1 AND status = 'open' AND remaining_cents > 0
     ORDER BY id ASC`,
    [organizationId]
  );
  return r.rows;
}

async function listActiveDiscounts(db, organizationId, at = new Date()) {
  const r = await db.query(
    `SELECT * FROM public.church_billing_discounts
     WHERE organization_id = $1 AND status = 'active'
       AND (starts_at IS NULL OR starts_at <= $2)
       AND (ends_at IS NULL OR ends_at >= $2)
     ORDER BY id ASC`,
    [organizationId, at]
  );
  return r.rows;
}

async function listBillableBranchesForOrganization(db, organizationId, periodStart, periodEnd) {
  // Branch is billable if billing_started_at is set and overlaps period.
  // Includes deactivated branches still within billing_ends_at (end of paid period).
  const r = await db.query(
    `SELECT id, slug, name, status, billing_ready, billing_started_at, billing_ends_at
     FROM public.church_branches
     WHERE organization_id = $1
       AND billing_started_at IS NOT NULL
       AND billing_started_at::date <= $3::date
       AND (billing_ends_at IS NULL OR billing_ends_at::date >= $2::date)
     ORDER BY id ASC`,
    [organizationId, periodStart, periodEnd]
  );
  return r.rows;
}

async function setBranchBillingWindow(db, branchId, fields) {
  const sets = ["updated_at = now()"];
  const params = [branchId];
  let idx = 2;
  if (fields.billing_started_at !== undefined) {
    sets.push(`billing_started_at = $${idx++}`);
    params.push(fields.billing_started_at);
  }
  if (fields.billing_ends_at !== undefined) {
    sets.push(`billing_ends_at = $${idx++}`);
    params.push(fields.billing_ends_at);
  }
  const r = await db.query(
    `UPDATE public.church_branches SET ${sets.join(", ")} WHERE id = $1 RETURNING *`,
    params
  );
  return r.rows[0] || null;
}

module.exports = {
  GROWTH_MONTHLY_PER_BRANCH_CENTS,
  getCurrentPrice,
  listPriceHistory,
  insertPackageHistory,
  listPackageHistoryForOrganization,
  ensureBillingPeriod,
  findInvoiceByIdempotencyKey,
  insertDraftInvoice,
  replaceBranchSnapshots,
  listOpenCredits,
  listActiveDiscounts,
  listBillableBranchesForOrganization,
  setBranchBillingWindow,
};
