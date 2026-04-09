"use strict";

const { STAGES } = require("../../tenants/tenantStages");

/**
 * PostgreSQL access for public.tenants (read helpers for a future cutover).
 * All functions take a pg Pool as the first argument.
 */

function serializeTenantRow(row) {
  if (!row) return row;
  const o = { ...row };
  if (o.created_at instanceof Date) {
    o.created_at = o.created_at.toISOString().replace("T", " ").slice(0, 19);
  }
  return o;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} id
 * @returns {Promise<object | null>}
 */
async function getById(pool, id) {
  const r = await pool.query(`SELECT * FROM public.tenants WHERE id = $1`, [id]);
  return r.rows[0] ?? null;
}

/**
 * Full tenant row for admin settings UI (timestamps as SQLite-style strings).
 */
async function getByIdForAdminSettings(pool, id) {
  const r = await pool.query(`SELECT * FROM public.tenants WHERE id = $1`, [id]);
  const row = r.rows[0];
  return row ? serializeTenantRow(row) : null;
}

/**
 * Super-admin region list: case-insensitive name order (SQLite `COLLATE NOCASE` parity).
 */
async function listAllOrderedByNameForSettings(pool) {
  const r = await pool.query(`SELECT * FROM public.tenants ORDER BY lower(name) ASC, id ASC`);
  return r.rows.map(serializeTenantRow);
}

async function tenantExistsById(pool, id) {
  const r = await pool.query(`SELECT id FROM public.tenants WHERE id = $1 LIMIT 1`, [id]);
  return r.rows.length > 0;
}

/**
 * Tenant contact/footer fields (admin settings form).
 */
async function updateContactSupportFields(pool, tenantId, fields) {
  const u = await pool.query(
    `UPDATE public.tenants SET
      callcenter_phone = $1, support_help_phone = $2, whatsapp_phone = $3, callcenter_email = $4
     WHERE id = $5`,
    [fields.callcenter_phone, fields.support_help_phone, fields.whatsapp_phone, fields.callcenter_email, tenantId]
  );
  return u.rowCount > 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {string} slug
 * @returns {Promise<object | null>}
 */
async function getBySlug(pool, slug) {
  const r = await pool.query(`SELECT * FROM public.tenants WHERE slug = $1`, [slug]);
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @returns {Promise<object[]>}
 */
async function listOrderedById(pool) {
  const r = await pool.query(`SELECT * FROM public.tenants ORDER BY id ASC`);
  return r.rows;
}

/**
 * Nav / switcher: minimal rows for a set of tenant ids (dedupe in caller if needed).
 * @param {import("pg").Pool} pool
 * @param {number[]} ids
 * @returns {Promise<{ id: number, slug: string, name: string }[]>}
 */
async function listIdSlugNameByIds(pool, ids) {
  const clean = [...new Set(ids.map((n) => Number(n)))].filter((n) => Number.isFinite(n) && n > 0);
  if (clean.length === 0) return [];
  const r = await pool.query(
    `SELECT id, slug, name FROM public.tenants WHERE id = ANY($1::int[]) ORDER BY id ASC`,
    [clean]
  );
  return r.rows;
}

/**
 * Contact / footer fields used by tenant-scoped pages.
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @returns {Promise<object | null>}
 */
async function getContactFieldsById(pool, tenantId) {
  const r = await pool.query(
    `SELECT callcenter_phone, support_help_phone, whatsapp_phone, callcenter_email, intake_code_prefix
     FROM public.tenants WHERE id = $1`,
    [tenantId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {string} slug
 * @returns {Promise<boolean>}
 */
async function slugExists(pool, slug) {
  const s = String(slug || "").toLowerCase().trim();
  if (!s) return false;
  const r = await pool.query(`SELECT 1 FROM public.tenants WHERE slug = $1 LIMIT 1`, [s]);
  return r.rows.length > 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} id
 * @returns {Promise<{ id: number, slug: string } | null>}
 */
async function getIdSlugById(pool, id) {
  const r = await pool.query(`SELECT id, slug FROM public.tenants WHERE id = $1`, [id]);
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {string} slug
 * @returns {Promise<{ id: number } | null>}
 */
async function getIdBySlug(pool, slug) {
  const s = String(slug || "").toLowerCase().trim();
  if (!s) return null;
  const r = await pool.query(`SELECT id FROM public.tenants WHERE slug = $1`, [s]);
  return r.rows[0] ?? null;
}

/**
 * Enabled-gated tenant id for super-admin default scope (matches SQLite login fallback chain).
 * @param {import("pg").Pool} pool
 * @param {string} slug
 * @param {string} stage
 */
async function getIdBySlugAndStage(pool, slug, stage) {
  const s = String(slug || "").toLowerCase().trim();
  if (!s) return null;
  const r = await pool.query(`SELECT id FROM public.tenants WHERE lower(slug) = lower($1) AND stage = $2 LIMIT 1`, [
    s,
    stage,
  ]);
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {string} slug
 * @returns {Promise<{ stage: string } | null>}
 */
async function getStageBySlug(pool, slug) {
  const r = await pool.query(`SELECT stage FROM public.tenants WHERE slug = $1`, [slug]);
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {string} enabledStage
 * @returns {Promise<{ slug: string } | null>}
 */
async function firstEnabledNonDemoSlug(pool, enabledStage) {
  const r = await pool.query(
    `
    SELECT slug FROM public.tenants
    WHERE stage = $1 AND slug != 'global' AND slug != 'demo'
    ORDER BY id ASC LIMIT 1
    `,
    [enabledStage]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @returns {Promise<{ slug: string }[]>}
 */
async function listSlugsOrdered(pool) {
  const r = await pool.query(`SELECT slug FROM public.tenants ORDER BY id ASC`);
  return r.rows;
}

/**
 * Region picker rows (enabled, excluding global/demo).
 * @param {import("pg").Pool} pool
 * @param {string} enabledStage
 */
async function listEnabledRegionRows(pool, enabledStage) {
  const r = await pool.query(
    `
    SELECT slug, name FROM public.tenants
    WHERE stage = $1 AND slug != 'global' AND slug != 'demo'
    ORDER BY id ASC
    `,
    [enabledStage]
  );
  return r.rows;
}

/**
 * Next integer id for explicit tenant insert (same as legacy MAX(id)+1 semantics).
 * @param {import("pg").Pool} pool
 */
async function getNextTenantId(pool) {
  const r = await pool.query(`SELECT (COALESCE(MAX(id), 0) + 1)::int AS n FROM public.tenants`);
  return r.rows[0]?.n ?? 1;
}

/**
 * Canonical tenant seed rows (ids 1–8). Single source for bootstrap + tests.
 * @type {ReadonlyArray<readonly [number, string, string, string]>}
 */
const CANONICAL_TENANT_SEED_ROWS = Object.freeze([
  [1, "global", "Global", STAGES.ENABLED],
  [2, "demo", "Demo", STAGES.ENABLED],
  [3, "il", "Israel", STAGES.ENABLED],
  [4, "zm", "Zambia", STAGES.ENABLED],
  [5, "zw", "Zimbabwe", STAGES.ENABLED],
  [6, "bw", "Botswana", STAGES.ENABLED],
  [7, "za", "South Africa", STAGES.DISABLED],
  [8, "na", "Namibia", STAGES.ENABLED],
]);

/**
 * Idempotent: insert canonical region rows (ids 1–8) if missing. Required for FK on admin_users.tenant_id
 * and for tenant-scoped bootstrap when ADMIN_ROLE is a tenant role. Safe on already-initialized DBs.
 * @param {import("pg").Pool} pool
 * @returns {Promise<number>} number of rows inserted (0–8)
 */
async function ensureCanonicalTenantsIfMissing(pool) {
  const rows = CANONICAL_TENANT_SEED_ROWS;
  let inserted = 0;
  for (const [id, slug, name, stage] of rows) {
    const r = await pool.query(
      `INSERT INTO public.tenants (id, slug, name, stage)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [id, slug, name, stage]
    );
    inserted += r.rowCount;
  }
  if (inserted > 0) {
    // eslint-disable-next-line no-console
    console.log(`[getpro] Canonical tenants: created ${inserted} missing row(s) (ids 1–8, idempotent)`);
  } else {
    // eslint-disable-next-line no-console
    console.log("[getpro] Canonical tenants: already present (bootstrap skipped)");
  }
  return inserted;
}

/**
 * Super-admin create region (explicit id, matches SQLite tenant bootstrap).
 * @param {import("pg").Pool} pool
 * @param {{ id: number, slug: string, name: string, stage: string, callcenter_phone: string, support_help_phone: string, whatsapp_phone: string, callcenter_email: string }} row
 */
async function insertWithExplicitId(pool, row) {
  await pool.query(
    `INSERT INTO public.tenants (id, slug, name, stage, callcenter_phone, support_help_phone, whatsapp_phone, callcenter_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      row.id,
      row.slug,
      row.name,
      row.stage,
      row.callcenter_phone,
      row.support_help_phone,
      row.whatsapp_phone,
      row.callcenter_email,
    ]
  );
}

/**
 * Super-admin tenant form update (core columns only).
 * @param {import("pg").Pool} pool
 */
async function updateSuperTenantForm(pool, id, fields) {
  const u = await pool.query(
    `UPDATE public.tenants SET
      name = $1, slug = $2, stage = $3,
      callcenter_phone = $4, support_help_phone = $5, whatsapp_phone = $6, callcenter_email = $7
     WHERE id = $8`,
    [
      fields.name,
      fields.slug,
      fields.stage,
      fields.callcenter_phone,
      fields.support_help_phone,
      fields.whatsapp_phone,
      fields.callcenter_email,
      id,
    ]
  );
  return u.rowCount > 0;
}

/**
 * @param {import("pg").Pool} pool
 */
async function updateStageById(pool, id, stage) {
  const u = await pool.query(`UPDATE public.tenants SET stage = $1 WHERE id = $2`, [stage, id]);
  return u.rowCount > 0;
}

/**
 * Slug taken by another tenant (edit form duplicate check).
 * @param {import("pg").Pool} pool
 */
async function slugExistsExcludingId(pool, slug, excludeId) {
  const s = String(slug || "").toLowerCase().trim();
  const r = await pool.query(`SELECT 1 FROM public.tenants WHERE slug = $1 AND id != $2 LIMIT 1`, [s, excludeId]);
  return r.rows.length > 0;
}

module.exports = {
  CANONICAL_TENANT_SEED_ROWS,
  serializeTenantRow,
  getById,
  getByIdForAdminSettings,
  listAllOrderedByNameForSettings,
  tenantExistsById,
  updateContactSupportFields,
  getBySlug,
  listOrderedById,
  listIdSlugNameByIds,
  getContactFieldsById,
  slugExists,
  getIdSlugById,
  getIdBySlug,
  getIdBySlugAndStage,
  getStageBySlug,
  firstEnabledNonDemoSlug,
  listSlugsOrdered,
  listEnabledRegionRows,
  getNextTenantId,
  ensureCanonicalTenantsIfMissing,
  insertWithExplicitId,
  updateSuperTenantForm,
  updateStageById,
  slugExistsExcludingId,
};
