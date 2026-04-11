"use strict";

const { getDefaultPortalLeadCreditsBalanceForNewCompany } = require("../../companyPortal/companyPortalLeadCredits");

/**
 * PostgreSQL access for public.companies (tenant-scoped, joins with categories).
 */

/**
 * Match SQLite datetime strings for EJS / filters that use String(created_at).
 * @param {object | null} row
 */
function serializeCompanyRow(row) {
  if (!row) return row;
  const out = { ...row };
  for (const k of ["created_at", "updated_at"]) {
    if (out[k] instanceof Date) {
      out[k] = out[k].toISOString().replace("T", " ").slice(0, 19);
    }
  }
  if (out.portal_lead_credits_balance != null) {
    out.portal_lead_credits_balance = Number(out.portal_lead_credits_balance);
  }
  return out;
}

function mapRows(rows) {
  return (rows || []).map(serializeCompanyRow);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} id
 * @returns {Promise<object | null>}
 */
async function getById(pool, id) {
  const r = await pool.query(`SELECT * FROM public.companies WHERE id = $1`, [id]);
  return serializeCompanyRow(r.rows[0] ?? null);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} id
 * @param {number} tenantId
 * @returns {Promise<object | null>}
 */
async function getByIdAndTenantId(pool, id, tenantId) {
  const r = await pool.query(
    `SELECT * FROM public.companies WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return serializeCompanyRow(r.rows[0] ?? null);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} companyId
 * @param {number} tenantId
 * @returns {Promise<object | null>}
 */
async function getPortalLeadCreditFields(pool, companyId, tenantId) {
  const r = await pool.query(
    `SELECT id, name, portal_lead_credits_balance FROM public.companies WHERE id = $1 AND tenant_id = $2`,
    [companyId, tenantId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} id
 * @param {number} tenantId
 */
async function getWithCategoryByIdAndTenantId(pool, id, tenantId) {
  const r = await pool.query(
    `
    SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
    FROM public.companies c
    LEFT JOIN public.categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
    WHERE c.id = $1 AND c.tenant_id = $2
    `,
    [id, tenantId]
  );
  return serializeCompanyRow(r.rows[0] ?? null);
}

/**
 * @param {import("pg").Pool} pool
 * @param {string} subdomain
 * @param {number} tenantId
 */
async function getWithCategoryBySubdomainAndTenantId(pool, subdomain, tenantId) {
  const r = await pool.query(
    `
    SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
    FROM public.companies c
    LEFT JOIN public.categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
    WHERE c.subdomain = $1 AND c.tenant_id = $2
    `,
    [subdomain, tenantId]
  );
  return serializeCompanyRow(r.rows[0] ?? null);
}

/**
 * Legacy host mini-site: subdomain is globally unique in PG (matches SQLite UNIQUE on subdomain).
 * @param {import("pg").Pool} pool
 * @param {string} subdomain
 */
async function getWithCategoryBySubdomain(pool, subdomain) {
  const r = await pool.query(
    `
    SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
    FROM public.companies c
    LEFT JOIN public.categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
    WHERE c.subdomain = $1
    `,
    [subdomain]
  );
  return serializeCompanyRow(r.rows[0] ?? null);
}

/** Minimal row for legacy host redirects (tenant + subdomain only). */
async function getTenantIdAndSubdomainBySubdomain(pool, subdomain) {
  const r = await pool.query(`SELECT tenant_id, subdomain FROM public.companies WHERE subdomain = $1`, [subdomain]);
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 */
async function listAdminWithCategory(pool, tenantId) {
  const r = await pool.query(
    `
    SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
    FROM public.companies c
    LEFT JOIN public.categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
    WHERE c.tenant_id = $1
    ORDER BY c.updated_at DESC
    `,
    [tenantId]
  );
  return mapRows(r.rows);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} limit
 */
async function listIdsForSitemap(pool, tenantId, limit = 500) {
  const r = await pool.query(
    `SELECT id FROM public.companies WHERE tenant_id = $1 ORDER BY updated_at DESC LIMIT $2`,
    [tenantId, limit]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 */
async function countForTenant(pool, tenantId) {
  const r = await pool.query(`SELECT COUNT(*)::int AS n FROM public.companies WHERE tenant_id = $1`, [tenantId]);
  return r.rows[0]?.n ?? 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 */
async function listIdNameSubdomainForTenant(pool, tenantId) {
  const r = await pool.query(
    `SELECT id, name, subdomain FROM public.companies WHERE tenant_id = $1 ORDER BY name ASC`,
    [tenantId]
  );
  return r.rows;
}

/**
 * Directory: companies in a category (by category slug), optional city ILIKE on location.
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {string} categorySlug
 * @param {string | null} cityLike — e.g. `%Lusaka%` or null
 */
async function listDirectoryByCategorySlug(pool, tenantId, categorySlug, cityLike) {
  const params = [tenantId, categorySlug];
  let cityClause = "";
  if (cityLike) {
    cityClause = ` AND c.location ILIKE $3`;
    params.push(cityLike);
  }
  const r = await pool.query(
    `
    SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
    FROM public.companies c
    INNER JOIN public.categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
    WHERE cat.slug = $2 AND c.tenant_id = $1
    ${cityClause}
    ORDER BY c.name ASC
    `,
    params
  );
  return mapRows(r.rows);
}

/**
 * Default directory listing (no search/category filter).
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} limit
 */
async function listDirectoryDefault(pool, tenantId, limit = 24) {
  const r = await pool.query(
    `
    SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
    FROM public.companies c
    LEFT JOIN public.categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
    WHERE c.tenant_id = $1
    ORDER BY c.updated_at DESC
    LIMIT $2
    `,
    [tenantId, limit]
  );
  return mapRows(r.rows);
}

/**
 * Directory text search (PostgreSQL): case-insensitive substring match on name, headline, about;
 * optional city filter on location; tenant-scoped; `ORDER BY c.name ASC`.
 * Matches SQLite local-dev path in `src/routes/public.js` (LIKE … COLLATE NOCASE).
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {string | null} searchPattern — `%term%` or null
 * @param {string | null} cityPattern — `%city%` or null
 * @param {number} limit
 */
async function listDirectorySearchIlike(pool, tenantId, searchPattern, cityPattern, limit = 48) {
  const parts = [`c.tenant_id = $1`];
  const params = [tenantId];
  let i = 2;
  if (searchPattern) {
    parts.push(
      `(c.name ILIKE $${i} OR c.headline ILIKE $${i + 1} OR c.about ILIKE $${i + 2})`
    );
    params.push(searchPattern, searchPattern, searchPattern);
    i += 3;
  }
  if (cityPattern) {
    parts.push(`c.location ILIKE $${i}`);
    params.push(cityPattern);
    i += 1;
  }
  const where = parts.join(" AND ");
  params.push(limit);
  const r = await pool.query(
    `
    SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
    FROM public.companies c
    LEFT JOIN public.categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
    WHERE ${where}
    ORDER BY c.name ASC
    LIMIT $${i}
    `,
    params
  );
  return mapRows(r.rows);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {string} subdomain
 */
async function existsSubdomainForTenant(pool, tenantId, subdomain) {
  const r = await pool.query(
    `SELECT 1 FROM public.companies WHERE tenant_id = $1 AND subdomain = $2 LIMIT 1`,
    [tenantId, subdomain]
  );
  return r.rows.length > 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} row — fields matching INSERT
 */
async function insertFull(pool, row) {
  const {
    tenantId,
    subdomain,
    name,
    categoryId,
    headline,
    about,
    services,
    phone,
    email,
    location,
    featuredCtaLabel,
    featuredCtaPhone,
    yearsExperience,
    serviceAreas,
    hoursText,
    galleryJson,
    logoUrl,
    portalLeadCreditsBalance,
  } = row;
  let balance = portalLeadCreditsBalance;
  if (balance === undefined || balance === null) {
    balance = await getDefaultPortalLeadCreditsBalanceForNewCompany(pool, Number(tenantId));
  }
  const b = Number(balance);
  const portalBalance = Number.isFinite(b) ? b : 0;
  const r = await pool.query(
    `
    INSERT INTO public.companies (
      tenant_id, subdomain, name, category_id, headline, about, services, phone, email, location,
      featured_cta_label, featured_cta_phone, years_experience, service_areas, hours_text, gallery_json, logo_url,
      portal_lead_credits_balance
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
    )
    RETURNING *
    `,
    [
      tenantId,
      subdomain,
      name,
      categoryId,
      headline,
      about,
      services,
      phone,
      email,
      location,
      featuredCtaLabel,
      featuredCtaPhone,
      yearsExperience,
      serviceAreas,
      hoursText,
      galleryJson,
      logoUrl,
      portalBalance,
    ]
  );
  return serializeCompanyRow(r.rows[0]);
}

/**
 * Same column set as admin form POST update.
 * @param {import("pg").Pool} pool
 * @param {object} row
 */
async function updateFullByIdAndTenantId(pool, row) {
  const {
    id,
    tenantId,
    subdomain,
    name,
    categoryId,
    headline,
    about,
    services,
    phone,
    email,
    location,
    featuredCtaLabel,
    featuredCtaPhone,
    yearsExperience,
    serviceAreas,
    hoursText,
    galleryJson,
    logoUrl,
  } = row;
  const r = await pool.query(
    `
    UPDATE public.companies SET
      subdomain = $3,
      name = $4,
      category_id = $5,
      headline = $6,
      about = $7,
      services = $8,
      phone = $9,
      email = $10,
      location = $11,
      featured_cta_label = $12,
      featured_cta_phone = $13,
      years_experience = $14,
      service_areas = $15,
      hours_text = $16,
      gallery_json = $17,
      logo_url = $18,
      updated_at = now()
    WHERE id = $1 AND tenant_id = $2
    RETURNING *
    `,
    [
      id,
      tenantId,
      subdomain,
      name,
      categoryId,
      headline,
      about,
      services,
      phone,
      email,
      location,
      featuredCtaLabel,
      featuredCtaPhone,
      yearsExperience,
      serviceAreas,
      hoursText,
      galleryJson,
      logoUrl,
    ]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} id
 * @param {number} tenantId
 */
async function deleteByIdAndTenantId(pool, id, tenantId) {
  const r = await pool.query(`DELETE FROM public.companies WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  return r.rowCount > 0;
}

module.exports = {
  serializeCompanyRow,
  getById,
  getByIdAndTenantId,
  getPortalLeadCreditFields,
  getWithCategoryByIdAndTenantId,
  getWithCategoryBySubdomainAndTenantId,
  getWithCategoryBySubdomain,
  getTenantIdAndSubdomainBySubdomain,
  listAdminWithCategory,
  listIdsForSitemap,
  countForTenant,
  listIdNameSubdomainForTenant,
  listDirectoryByCategorySlug,
  listDirectoryDefault,
  listDirectorySearchIlike,
  existsSubdomainForTenant,
  insertFull,
  updateFullByIdAndTenantId,
  deleteByIdAndTenantId,
};
