"use strict";

/**
 * BlessBoard V5 manual giving repository (SQL only).
 * Amounts stay NUMERIC / string — never float.
 */

const CATEGORY_COLS = `id, church_id, category_key, label, sort_order, status, created_at, updated_at`;

const ENTRY_COLS = `id, church_id, branch_id, category_id, giving_date, amount::text AS amount, currency,
  reference, notes, status, recorded_by_user_id, submitted_by_user_id, submitted_at,
  approved_by_user_id, approved_at, voided_by_user_id, voided_at, void_reason,
  created_at, updated_at`;

const DEFAULT_CATEGORIES = Object.freeze([
  { key: "tithes", label: "Tithes", sort: 10 },
  { key: "offerings", label: "Offerings", sort: 20 },
  { key: "building", label: "Building fund", sort: 30 },
  { key: "missions", label: "Missions", sort: 40 },
  { key: "special", label: "Special", sort: 50 },
  { key: "other", label: "Other", sort: 60 },
]);

function mapCategory(row) {
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    categoryKey: row.category_key,
    label: row.label,
    sortOrder: Number(row.sort_order) || 0,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEntry(row) {
  if (!row) return null;
  let givingDate = row.giving_date;
  if (givingDate instanceof Date) {
    givingDate = givingDate.toISOString().slice(0, 10);
  } else if (givingDate != null) {
    givingDate = String(givingDate).slice(0, 10);
  }
  return {
    id: row.id,
    churchId: row.church_id,
    branchId: row.branch_id,
    categoryId: row.category_id,
    givingDate,
    amount: String(row.amount),
    currency: row.currency,
    reference: row.reference || null,
    notes: row.notes || null,
    status: row.status,
    recordedByUserId: row.recorded_by_user_id,
    submittedByUserId: row.submitted_by_user_id || null,
    submittedAt: row.submitted_at || null,
    approvedByUserId: row.approved_by_user_id || null,
    approvedAt: row.approved_at || null,
    voidedByUserId: row.voided_by_user_id || null,
    voidedAt: row.voided_at || null,
    voidReason: row.void_reason || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findCategoryById(client, id) {
  const { rows } = await client.query(
    `SELECT ${CATEGORY_COLS} FROM blessboard.giving_categories WHERE id = $1`,
    [id]
  );
  return mapCategory(rows[0] || null);
}

async function findCategoryByKey(client, churchId, categoryKey) {
  const { rows } = await client.query(
    `SELECT ${CATEGORY_COLS}
       FROM blessboard.giving_categories
      WHERE church_id = $1 AND category_key = $2`,
    [churchId, categoryKey]
  );
  return mapCategory(rows[0] || null);
}

async function listCategories(client, churchId) {
  const { rows } = await client.query(
    `SELECT ${CATEGORY_COLS}
       FROM blessboard.giving_categories
      WHERE church_id = $1 AND status = 'active'
      ORDER BY sort_order ASC, label ASC`,
    [churchId]
  );
  return rows.map(mapCategory);
}

async function ensureDefaultCategories(client, churchId) {
  for (const cat of DEFAULT_CATEGORIES) {
    await client.query(
      `INSERT INTO blessboard.giving_categories
         (church_id, category_key, label, sort_order, status)
       VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT (church_id, category_key) DO NOTHING`,
      [churchId, cat.key, cat.label, cat.sort]
    );
  }
  return listCategories(client, churchId);
}

async function findEntryById(client, id) {
  const { rows } = await client.query(
    `SELECT ${ENTRY_COLS} FROM blessboard.giving_entries WHERE id = $1`,
    [id]
  );
  return mapEntry(rows[0] || null);
}

async function listEntries(client, opts) {
  const params = [opts.churchId];
  let where = `e.church_id = $1`;
  if (opts.branchId) {
    params.push(opts.branchId);
    where += ` AND e.branch_id = $${params.length}`;
  }
  if (opts.status) {
    params.push(opts.status);
    where += ` AND e.status = $${params.length}`;
  }
  if (opts.yearMonth) {
    params.push(opts.yearMonth);
    where += ` AND to_char(e.giving_date, 'YYYY-MM') = $${params.length}`;
  }
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 50);
  params.push(limit);
  const { rows } = await client.query(
    `SELECT e.id, e.church_id, e.branch_id, e.category_id, e.giving_date,
            e.amount::text AS amount, e.currency, e.reference, e.notes, e.status,
            e.recorded_by_user_id, e.submitted_by_user_id, e.submitted_at,
            e.approved_by_user_id, e.approved_at, e.voided_by_user_id, e.voided_at,
            e.void_reason, e.created_at, e.updated_at,
            c.category_key, c.label AS category_label
       FROM blessboard.giving_entries e
       INNER JOIN blessboard.giving_categories c ON c.id = e.category_id
      WHERE ${where}
      ORDER BY e.giving_date DESC, e.created_at DESC
      LIMIT $${params.length}`,
    params
  );
  return rows.map((row) => ({
    ...mapEntry(row),
    categoryKey: row.category_key,
    categoryLabel: row.category_label,
  }));
}

async function insertEntry(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO blessboard.giving_entries
       (church_id, branch_id, category_id, giving_date, amount, currency,
        reference, notes, status, recorded_by_user_id)
     VALUES ($1, $2, $3, $4::date, $5::numeric, $6, $7, $8, 'draft', $9)
     RETURNING ${ENTRY_COLS}`,
    [
      fields.churchId,
      fields.branchId,
      fields.categoryId,
      fields.givingDate,
      fields.amount,
      fields.currency,
      fields.reference || null,
      fields.notes || null,
      fields.recordedByUserId,
    ]
  );
  return mapEntry(rows[0]);
}

async function updateDraftEntry(client, id, patch) {
  const { rows } = await client.query(
    `UPDATE blessboard.giving_entries
        SET category_id = COALESCE($2, category_id),
            giving_date = COALESCE($3::date, giving_date),
            amount = COALESCE($4::numeric, amount),
            currency = COALESCE($5, currency),
            reference = CASE WHEN $6::boolean THEN NULL ELSE COALESCE($7, reference) END,
            notes = CASE WHEN $8::boolean THEN NULL ELSE COALESCE($9, notes) END,
            updated_at = now()
      WHERE id = $1 AND status = 'draft'
      RETURNING ${ENTRY_COLS}`,
    [
      id,
      patch.categoryId || null,
      patch.givingDate || null,
      patch.amount || null,
      patch.currency || null,
      patch.clearReference === true,
      patch.reference != null ? patch.reference : null,
      patch.clearNotes === true,
      patch.notes != null ? patch.notes : null,
    ]
  );
  return mapEntry(rows[0] || null);
}

async function updateEntryStatus(client, id, patch) {
  const { rows } = await client.query(
    `UPDATE blessboard.giving_entries
        SET status = $2,
            submitted_by_user_id = COALESCE($3, submitted_by_user_id),
            submitted_at = COALESCE($4, submitted_at),
            approved_by_user_id = COALESCE($5, approved_by_user_id),
            approved_at = COALESCE($6, approved_at),
            voided_by_user_id = COALESCE($7, voided_by_user_id),
            voided_at = COALESCE($8, voided_at),
            void_reason = COALESCE($9, void_reason),
            updated_at = now()
      WHERE id = $1
      RETURNING ${ENTRY_COLS}`,
    [
      id,
      patch.status,
      patch.submittedByUserId || null,
      patch.submittedAt || null,
      patch.approvedByUserId || null,
      patch.approvedAt || null,
      patch.voidedByUserId || null,
      patch.voidedAt || null,
      patch.voidReason || null,
    ]
  );
  return mapEntry(rows[0] || null);
}

/**
 * Monthly aggregates via SQL SUM(NUMERIC). Draft and void excluded.
 * @returns {{ yearMonth, branchId?, categoryKey, categoryLabel, entryCount, totalAmount: string, currency }[]}
 */
async function monthlySummary(client, opts) {
  const params = [opts.churchId, opts.yearMonth];
  let branchClause = "";
  if (opts.branchId) {
    params.push(opts.branchId);
    branchClause = ` AND e.branch_id = $${params.length}`;
  }
  const { rows } = await client.query(
    `SELECT
        to_char(e.giving_date, 'YYYY-MM') AS year_month,
        e.branch_id,
        c.category_key,
        c.label AS category_label,
        e.currency,
        COUNT(e.id)::int AS entry_count,
        COALESCE(SUM(e.amount), 0)::text AS total_amount
       FROM blessboard.giving_entries e
       INNER JOIN blessboard.giving_categories c ON c.id = e.category_id
      WHERE e.church_id = $1
        AND to_char(e.giving_date, 'YYYY-MM') = $2
        AND e.status IN ('submitted', 'approved')
        ${branchClause}
      GROUP BY to_char(e.giving_date, 'YYYY-MM'), e.branch_id, c.category_key, c.label, e.currency
      ORDER BY e.branch_id, c.category_key, e.currency`,
    params
  );
  return rows.map((row) => ({
    yearMonth: row.year_month,
    branchId: row.branch_id,
    categoryKey: row.category_key,
    categoryLabel: row.category_label,
    currency: row.currency,
    entryCount: Number(row.entry_count) || 0,
    totalAmount: String(row.total_amount),
  }));
}

async function monthlyChurchTotals(client, opts) {
  const { rows } = await client.query(
    `SELECT
        to_char(e.giving_date, 'YYYY-MM') AS year_month,
        c.category_key,
        c.label AS category_label,
        e.currency,
        COUNT(e.id)::int AS entry_count,
        COALESCE(SUM(e.amount), 0)::text AS total_amount
       FROM blessboard.giving_entries e
       INNER JOIN blessboard.giving_categories c ON c.id = e.category_id
      WHERE e.church_id = $1
        AND to_char(e.giving_date, 'YYYY-MM') = $2
        AND e.status IN ('submitted', 'approved')
      GROUP BY to_char(e.giving_date, 'YYYY-MM'), c.category_key, c.label, e.currency
      ORDER BY c.category_key, e.currency`,
    [opts.churchId, opts.yearMonth]
  );
  return rows.map((row) => ({
    yearMonth: row.year_month,
    categoryKey: row.category_key,
    categoryLabel: row.category_label,
    currency: row.currency,
    entryCount: Number(row.entry_count) || 0,
    totalAmount: String(row.total_amount),
  }));
}

async function findBranchScope(client, branchId) {
  const { rows } = await client.query(
    `SELECT id, church_id, status, branch_key, display_name
       FROM blessboard.branches WHERE id = $1`,
    [branchId]
  );
  return rows[0] || null;
}

module.exports = {
  DEFAULT_CATEGORIES,
  mapCategory,
  mapEntry,
  findCategoryById,
  findCategoryByKey,
  listCategories,
  ensureDefaultCategories,
  findEntryById,
  listEntries,
  insertEntry,
  updateDraftEntry,
  updateEntryStatus,
  monthlySummary,
  monthlyChurchTotals,
  findBranchScope,
};
