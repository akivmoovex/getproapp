"use strict";

/**
 * PostgreSQL access for public.content_pages (public reads, Wave 2).
 */

function serializeContentRow(row) {
  if (!row) return row;
  const out = { ...row };
  for (const k of ["created_at", "updated_at"]) {
    if (out[k] instanceof Date) {
      out[k] = out[k].toISOString().replace("T", " ").slice(0, 19);
    }
  }
  if (out.published != null) {
    out.published = Boolean(out.published);
  }
  return out;
}

/**
 * Admin list/edit: full row (ordering: sort_order, title — matches historical SQLite admin helpers).
 */
async function listAllByKindAdmin(pool, tenantId, kind) {
  const r = await pool.query(
    `SELECT * FROM public.content_pages
     WHERE tenant_id = $1 AND kind = $2
     ORDER BY sort_order ASC, title ASC`,
    [tenantId, kind]
  );
  return r.rows.map(serializeContentRow);
}

async function getByIdAndTenantAdmin(pool, id, tenantId) {
  const r = await pool.query(`SELECT * FROM public.content_pages WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  const row = r.rows[0];
  return row ? serializeContentRow(row) : null;
}

async function insertForAdmin(pool, p) {
  const published = p.published === 1 || p.published === true;
  const ins = await pool.query(
    `INSERT INTO public.content_pages (
      tenant_id, kind, slug, title, excerpt, body, hero_image_url, hero_image_alt,
      seo_title, seo_description, published, sort_order, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
    RETURNING id`,
    [
      p.tenantId,
      p.kind,
      p.slug,
      p.title,
      p.excerpt,
      p.body,
      p.heroImageUrl,
      p.heroImageAlt,
      p.seoTitle,
      p.seoDescription,
      published,
      p.sortOrder,
    ]
  );
  return Number(ins.rows[0].id);
}

async function updateForAdmin(pool, p) {
  const published = p.published === 1 || p.published === true;
  const u = await pool.query(
    `UPDATE public.content_pages SET
      slug = $1, title = $2, excerpt = $3, body = $4, hero_image_url = $5, hero_image_alt = $6,
      seo_title = $7, seo_description = $8, published = $9, sort_order = $10, updated_at = now()
     WHERE id = $11 AND tenant_id = $12`,
    [
      p.slug,
      p.title,
      p.excerpt,
      p.body,
      p.heroImageUrl,
      p.heroImageAlt,
      p.seoTitle,
      p.seoDescription,
      published,
      p.sortOrder,
      p.id,
      p.tenantId,
    ]
  );
  return u.rowCount > 0;
}

async function setPublishedForAdmin(pool, tenantId, id, published) {
  const u = await pool.query(
    `UPDATE public.content_pages SET published = $1, updated_at = now() WHERE id = $2 AND tenant_id = $3`,
    [published, id, tenantId]
  );
  return u.rowCount > 0;
}

async function deleteByIdAndTenantAdmin(pool, id, tenantId) {
  const d = await pool.query(`DELETE FROM public.content_pages WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  return d.rowCount > 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {string} kind
 */
async function listPublishedByKind(pool, tenantId, kind) {
  const r = await pool.query(
    `
    SELECT id, slug, title, excerpt, sort_order, updated_at, hero_image_url, hero_image_alt,
           LEFT(body::text, 320) AS body_preview
    FROM public.content_pages
    WHERE tenant_id = $1 AND kind = $2 AND published = true
    ORDER BY sort_order ASC, title ASC
    `,
    [tenantId, kind]
  );
  return r.rows.map(serializeContentRow);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 */
async function listPublishedKindSlugForSitemap(pool, tenantId) {
  const r = await pool.query(
    `SELECT kind, slug FROM public.content_pages WHERE tenant_id = $1 AND published = true`,
    [tenantId]
  );
  return r.rows;
}

/**
 * Published row only (same as legacy `getBySlug` without allowDraft).
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {string} kind
 * @param {string} slug
 */
async function getBySlugPublished(pool, tenantId, kind, slug) {
  const r = await pool.query(
    `SELECT * FROM public.content_pages WHERE tenant_id = $1 AND kind = $2 AND slug = $3`,
    [tenantId, kind, slug]
  );
  const row = r.rows[0];
  if (!row) return null;
  const out = serializeContentRow(row);
  if (!out.published) return null;
  return out;
}

/**
 * Includes drafts (preview).
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {string} kind
 * @param {string} slug
 */
async function getRowBySlug(pool, tenantId, kind, slug) {
  const r = await pool.query(
    `SELECT * FROM public.content_pages WHERE tenant_id = $1 AND kind = $2 AND slug = $3`,
    [tenantId, kind, slug]
  );
  const row = r.rows[0];
  return row ? serializeContentRow(row) : null;
}

module.exports = {
  listPublishedByKind,
  listPublishedKindSlugForSitemap,
  getBySlugPublished,
  getRowBySlug,
  listAllByKindAdmin,
  getByIdAndTenantAdmin,
  insertForAdmin,
  updateForAdmin,
  setPublishedForAdmin,
  deleteByIdAndTenantAdmin,
};
