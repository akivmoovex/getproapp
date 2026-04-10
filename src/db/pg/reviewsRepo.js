"use strict";

/**
 * PostgreSQL access for public.reviews.
 *
 * 90-day highlight window: matches SQLite `date(r.created_at) >= date('now', '-90 days')` by using
 * UTC calendar dates (SQLite `date()` / `date('now')` are UTC for ISO-8601 timestamps).
 */

/**
 * @param {object} row
 */
function serializeReviewRow(row) {
  if (!row) return row;
  const out = { ...row };
  if (out.created_at instanceof Date) {
    out.created_at = out.created_at.toISOString().replace("T", " ").slice(0, 19);
  }
  if (out.rating != null) out.rating = Number(out.rating);
  return out;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} companyId
 * @returns {Promise<{ avg_rating: number | null, review_count: number }>}
 */
async function getAverageAndCountForCompany(pool, companyId) {
  const r = await pool.query(
    `SELECT ROUND(AVG(rating)::numeric, 2)::float8 AS avg_rating, COUNT(*)::int AS review_count
     FROM public.reviews WHERE company_id = $1`,
    [companyId]
  );
  const row = r.rows[0];
  return {
    avg_rating: row.avg_rating != null ? Number(row.avg_rating) : null,
    review_count: row.review_count != null ? Number(row.review_count) : 0,
  };
}

/**
 * Company profile page: same shape as SQLite (id, rating, body, author_name, created_at), newest first.
 * @param {import("pg").Pool} pool
 * @param {number} companyId
 * @param {number} limit
 */
async function listForCompanyProfile(pool, companyId, limit = 60) {
  const r = await pool.query(
    `SELECT id, rating, body, author_name, created_at
     FROM public.reviews
     WHERE company_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [companyId, limit]
  );
  return r.rows.map(serializeReviewRow);
}

/**
 * Admin publish JSON + workspace: same ordering as SQLite `ORDER BY datetime(created_at) DESC`.
 * @param {import("pg").Pool} pool
 * @param {number} companyId
 */
async function listForCompanyAdminOrderByCreatedDesc(pool, companyId) {
  const r = await pool.query(
    `SELECT id, rating, body, author_name, created_at
     FROM public.reviews
     WHERE company_id = $1
     ORDER BY created_at DESC`,
    [companyId]
  );
  return r.rows.map(serializeReviewRow);
}

/**
 * Intake allocation: one row per company in tenant+category with AVG/COUNT semantics matching SQLite
 * correlated subqueries (NULL avg and 0 count when no reviews).
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} categoryId
 */
async function listAvgCountByTenantAndCategory(pool, tenantId, categoryId) {
  const r = await pool.query(
    `
    SELECT c.id AS company_id,
      ra.avg_rating AS avg_rating,
      COALESCE(ra.review_count, 0)::int AS review_count
    FROM public.companies c
    LEFT JOIN (
      SELECT company_id,
        AVG(rating) AS avg_rating,
        COUNT(*)::bigint AS review_count
      FROM public.reviews
      GROUP BY company_id
    ) ra ON ra.company_id = c.id
    WHERE c.tenant_id = $1 AND c.category_id = $2
    `,
    [tenantId, categoryId]
  );
  return r.rows.map((row) => ({
    company_id: row.company_id,
    avg_rating: row.avg_rating != null ? Number(row.avg_rating) : null,
    review_count: Number(row.review_count),
  }));
}

/**
 * Directory / category listing batch stats: all-time ROUND(AVG,2), COUNT, and one highlight row per company
 * (best rating in last 90 calendar days UTC, tie-break created_at DESC).
 * Returns a Map keyed by company id with fields matching attachReviewStatsToCompanies.
 * @param {import("pg").Pool} pool
 * @param {number[]} companyIds
 */
async function getBatchDirectoryStatsMap(pool, companyIds) {
  const ids = [...new Set(companyIds.filter((id) => id != null && Number(id) > 0))].map(Number);
  const out = new Map();
  if (ids.length === 0) return out;

  for (const id of ids) {
    out.set(id, {
      avg_rating: null,
      review_count: 0,
      highlight_review_body: null,
      highlight_review_author: null,
      highlight_review_rating: null,
    });
  }

  const agg = await pool.query(
    `
    SELECT company_id,
      ROUND(AVG(rating)::numeric, 2)::float8 AS avg_rating,
      COUNT(*)::int AS review_count
    FROM public.reviews
    WHERE company_id = ANY($1::int[])
    GROUP BY company_id
    `,
    [ids]
  );
  for (const row of agg.rows) {
    const cur = out.get(row.company_id);
    if (!cur) continue;
    cur.avg_rating = row.avg_rating != null ? Number(row.avg_rating) : null;
    cur.review_count = Number(row.review_count);
  }

  const hi = await pool.query(
    `
    SELECT DISTINCT ON (company_id)
      company_id,
      body AS highlight_review_body,
      author_name AS highlight_review_author,
      rating AS highlight_review_rating
    FROM public.reviews r
    WHERE company_id = ANY($1::int[])
      AND (r.created_at AT TIME ZONE 'UTC')::date >= ((now() AT TIME ZONE 'UTC')::date - 90)
    ORDER BY company_id, r.rating DESC, r.created_at DESC
    `,
    [ids]
  );
  for (const row of hi.rows) {
    const cur = out.get(row.company_id);
    if (!cur) continue;
    cur.highlight_review_body = row.highlight_review_body;
    cur.highlight_review_author = row.highlight_review_author;
    cur.highlight_review_rating = row.highlight_review_rating != null ? Number(row.highlight_review_rating) : null;
  }

  return out;
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ companyId: number, rating: number, body: string, authorName: string }} p
 * @returns {Promise<number>} new review id
 */
async function insertOne(pool, p) {
  const r = await pool.query(
    `INSERT INTO public.reviews (company_id, rating, body, author_name)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      p.companyId,
      Number(p.rating),
      String(p.body || "").slice(0, 8000),
      String(p.authorName || "Customer").slice(0, 120),
    ]
  );
  return Number(r.rows[0].id);
}

module.exports = {
  getAverageAndCountForCompany,
  listForCompanyProfile,
  listForCompanyAdminOrderByCreatedDesc,
  listAvgCountByTenantAndCategory,
  getBatchDirectoryStatsMap,
  serializeReviewRow,
  insertOne,
};
