"use strict";

/**
 * PostgreSQL access for `categories` (tenant-scoped).
 */

function serializeCategoryRow(row) {
  if (!row) return row;
  const out = { ...row };
  if (out.created_at instanceof Date) {
    out.created_at = out.created_at.toISOString().replace("T", " ").slice(0, 19);
  }
  return out;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 */
async function listByTenantId(pool, tenantId) {
  const { rows } = await pool.query(
    `SELECT id, tenant_id, slug, name, sort, created_at
     FROM public.categories
     WHERE tenant_id = $1
     ORDER BY sort ASC, name ASC`,
    [tenantId]
  );
  return rows.map(serializeCategoryRow);
}

/**
 * @param {import("pg").Pool} pool
 * @param {string} slug
 * @param {number} tenantId
 */
async function getBySlugAndTenantId(pool, slug, tenantId) {
  const { rows } = await pool.query(
    `SELECT id, tenant_id, slug, name, sort, created_at
     FROM public.categories
     WHERE slug = $1 AND tenant_id = $2`,
    [slug, tenantId]
  );
  return rows[0] ? serializeCategoryRow(rows[0]) : null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} id
 * @param {number} tenantId
 */
async function getByIdAndTenantId(pool, id, tenantId) {
  const { rows } = await pool.query(
    `SELECT id, tenant_id, slug, name, sort, created_at
     FROM public.categories
     WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return rows[0] ? serializeCategoryRow(rows[0]) : null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 */
async function countForTenant(pool, tenantId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM public.categories WHERE tenant_id = $1`,
    [tenantId]
  );
  return rows[0]?.n ?? 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 */
async function listSlugsForSitemap(pool, tenantId) {
  const { rows } = await pool.query(
    `SELECT slug FROM public.categories WHERE tenant_id = $1 ORDER BY slug ASC`,
    [tenantId]
  );
  return rows.map((r) => r.slug);
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, slug: string, name: string }} params
 */
async function insert(pool, { tenantId, slug, name }) {
  const { rows } = await pool.query(
    `INSERT INTO public.categories (tenant_id, slug, name)
     VALUES ($1, $2, $3)
     RETURNING id, tenant_id, slug, name, sort, created_at`,
    [tenantId, slug, name]
  );
  return serializeCategoryRow(rows[0]);
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ id: number, tenantId: number, slug: string, name: string }} params
 */
async function update(pool, { id, tenantId, slug, name }) {
  const { rows } = await pool.query(
    `UPDATE public.categories SET slug = $1, name = $2
     WHERE id = $3 AND tenant_id = $4
     RETURNING id, tenant_id, slug, name, sort, created_at`,
    [slug, name, id, tenantId]
  );
  return serializeCategoryRow(rows[0]) || null;
}

/**
 * Unlinks companies then deletes the category (matches SQLite admin behavior).
 * @param {import("pg").Pool} pool
 * @param {number} id
 * @param {number} tenantId
 */
async function deleteByIdAndTenantId(pool, id, tenantId) {
  await pool.query(
    `UPDATE public.companies SET category_id = NULL WHERE category_id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  const { rowCount } = await pool.query(
    `DELETE FROM public.categories WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return rowCount > 0;
}

/**
 * Copy category rows from src tenant into dest when dest has none (super-admin new region seed; SQLite parity).
 * @param {import("pg").Pool} pool
 * @param {number} destTenantId
 * @param {number} srcTenantId
 */
/**
 * Public search typeahead: category names matching term (tenant-scoped).
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {string} term — raw user fragment (sanitized before call)
 * @param {number} limit
 * @returns {Promise<{ slug: string, name: string }[]>}
 */
async function suggestByNameIlike(pool, tenantId, term, limit = 5) {
  const t = String(term || "")
    .trim()
    .replace(/[%_\\]/g, "");
  if (t.length < 2) return [];
  const like = `%${t}%`;
  const prefix = `${t}%`;
  const { rows } = await pool.query(
    `SELECT slug, name
     FROM public.categories
     WHERE tenant_id = $1 AND name ILIKE $2
     ORDER BY (name ILIKE $3) DESC, name ASC
     LIMIT $4`,
    [tenantId, like, prefix, limit]
  );
  return rows.map((r) => ({ slug: r.slug, name: r.name }));
}

/**
 * Categories with the most public directory listings (company count), tenant-scoped.
 * Lightweight proxy for "trending" without separate analytics tables.
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} limit
 * @returns {Promise<{ slug: string, name: string, listing_count: number }[]>}
 */
async function listTopByCompanyCount(pool, tenantId, limit = 5) {
  const lim = Math.min(Math.max(Number(limit) || 5, 1), 20);
  const { rows } = await pool.query(
    `SELECT cat.slug, cat.name, COUNT(c.id)::int AS listing_count
     FROM public.companies c
     INNER JOIN public.categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
     WHERE c.tenant_id = $1 AND c.listing_disabled = false
     GROUP BY cat.id, cat.slug, cat.name
     ORDER BY listing_count DESC, cat.name ASC
     LIMIT $2`,
    [tenantId, lim]
  );
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    listing_count: r.listing_count != null ? Number(r.listing_count) : 0,
  }));
}

async function copyFromTenantIfDestEmpty(pool, destTenantId, srcTenantId) {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM public.categories WHERE tenant_id = $1`, [
    destTenantId,
  ]);
  if ((rows[0]?.n ?? 0) > 0) return;
  await pool.query(
    `INSERT INTO public.categories (tenant_id, slug, name, sort)
     SELECT $1, slug, name, sort FROM public.categories WHERE tenant_id = $2 ORDER BY sort ASC`,
    [destTenantId, srcTenantId]
  );
}

module.exports = {
  serializeCategoryRow,
  listByTenantId,
  getBySlugAndTenantId,
  getByIdAndTenantId,
  countForTenant,
  listSlugsForSitemap,
  insert,
  update,
  deleteByIdAndTenantId,
  copyFromTenantIfDestEmpty,
  suggestByNameIlike,
  listTopByCompanyCount,
};
