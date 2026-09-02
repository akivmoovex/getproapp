"use strict";

/**
 * Public church directory queries for V5 apex `/directory`.
 * Lists only active, published BlessBoard churches safe for the current deployment env.
 */

const {
  buildOrganizationCard,
} = require("../../church/publicDirectoryCardModel");

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MAX_QUERY_LENGTH = 80;

const PREVIEW_BRANCH_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT b.branch_key AS preview_branch_slug,
           b.display_name AS preview_branch_name,
           b.branch_key AS preview_host_slug,
           bs.city AS preview_branch_city,
           COALESCE(bs.country_code, b.country_code) AS preview_branch_country,
           NULLIF(trim(concat_ws(', ',
             NULLIF(trim(bs.address_line_1), ''),
             NULLIF(trim(bs.address_line_2), '')
           )), '') AS preview_location_text,
           NULL::text AS preview_service_times,
           NULL::text AS preview_welcome_message,
           false AS preview_registration_enabled,
           NULL::text AS preview_published_welcome,
           NULL::text AS preview_published_subtitle,
           NULL::text AS preview_published_service_times,
           NULL::text AS preview_published_location
    FROM blessboard.branches b
    LEFT JOIN blessboard.branch_settings bs ON bs.branch_id = b.id
    WHERE b.church_id = c.id AND b.status = 'active'
    ORDER BY
      CASE
        WHEN b.is_primary THEN 0
        WHEN b.branch_type = 'hq' OR b.branch_key = 'hq' THEN 1
        ELSE 2
      END,
      b.display_name ASC,
      b.branch_key ASC
    LIMIT 1
  ) preview ON true
`;

function normalizeSearchQuery(raw) {
  return String(raw || "")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

function ilikePattern(q) {
  const escaped = String(q || "")
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
  return `%${escaped}%`;
}

function clampPage(page) {
  const n = Number(page);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), 10000);
}

function clampLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), MAX_PAGE_SIZE);
}

/**
 * Search active published churches allowed in the public directory.
 * @param {import("pg").Pool} pool
 * @param {{ q?: string, page?: number, limit?: number, env?: NodeJS.ProcessEnv }} opts
 */
async function searchPublicOrganizations(pool, opts = {}) {
  const q = normalizeSearchQuery(opts.q);
  const page = clampPage(opts.page);
  const limit = clampLimit(opts.limit);
  const offset = (page - 1) * limit;

  const params = [];
  const {
    sqlPublicDirectoryEnvironmentFilter,
    sqlPublicDirectoryProductionDemoNameExclusion,
  } = require("../../church/orgDataEnvironment");
  const clauses = [
    `o.status = 'active'`,
    `c.status = 'active'`,
    sqlPublicDirectoryEnvironmentFilter("o", opts.env),
    sqlPublicDirectoryProductionDemoNameExclusion(opts.env),
    // Missing church_settings is not an explicit unpublish (provisioning may omit the row).
    // Explicit draft/suspended remain hidden.
    `(cs.website_status IS NULL OR cs.website_status = 'published')`,
    `EXISTS (
      SELECT 1 FROM blessboard.branches b_active
      WHERE b_active.church_id = c.id AND b_active.status = 'active'
    )`,
    `EXISTS (
      SELECT 1
        FROM platform.organization_products op
        INNER JOIN platform.products p ON p.id = op.product_id
       WHERE op.organization_id = o.id
         AND p.product_key = 'blessboard'
         AND op.status = 'active'
    )`,
  ];

  if (q) {
    params.push(ilikePattern(q));
    const p = `$${params.length}`;
    clauses.push(`(
      lower(o.display_name) LIKE lower(${p}) ESCAPE '\\'
      OR lower(o.organization_key) LIKE lower(${p}) ESCAPE '\\'
      OR lower(c.display_name) LIKE lower(${p}) ESCAPE '\\'
      OR lower(c.church_key) LIKE lower(${p}) ESCAPE '\\'
      OR lower(COALESCE(cs.public_name, '')) LIKE lower(${p}) ESCAPE '\\'
      OR EXISTS (
        SELECT 1
          FROM blessboard.branches b
          LEFT JOIN blessboard.branch_settings bs ON bs.branch_id = b.id
         WHERE b.church_id = c.id
           AND b.status = 'active'
           AND (
             lower(b.display_name) LIKE lower(${p}) ESCAPE '\\'
             OR lower(b.branch_key) LIKE lower(${p}) ESCAPE '\\'
             OR lower(COALESCE(bs.city, '')) LIKE lower(${p}) ESCAPE '\\'
             OR lower(COALESCE(bs.country_code, b.country_code, '')) LIKE lower(${p}) ESCAPE '\\'
             OR lower(COALESCE(bs.address_line_1, '')) LIKE lower(${p}) ESCAPE '\\'
             OR lower(COALESCE(bs.public_name, '')) LIKE lower(${p}) ESCAPE '\\'
           )
      )
    )`);
  }

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const r = await pool.query(
    `SELECT o.organization_key AS slug,
            COALESCE(NULLIF(trim(cs.public_name), ''), c.display_name, o.display_name) AS name,
            preview.preview_branch_city AS city,
            preview.preview_branch_country AS country,
            (
              SELECT COUNT(*)::int FROM blessboard.branches b
              WHERE b.church_id = c.id AND b.status = 'active'
            ) AS active_branch_count,
            false AS registration_available,
            preview.preview_branch_slug,
            preview.preview_branch_name,
            preview.preview_host_slug,
            preview.preview_branch_city,
            preview.preview_branch_country,
            preview.preview_location_text,
            preview.preview_service_times,
            preview.preview_welcome_message,
            preview.preview_registration_enabled,
            preview.preview_published_welcome,
            preview.preview_published_subtitle,
            preview.preview_published_service_times,
            preview.preview_published_location,
            COUNT(*) OVER()::int AS total_count
     FROM platform.organizations o
     INNER JOIN blessboard.churches c ON c.organization_id = o.id
     LEFT JOIN blessboard.church_settings cs ON cs.church_id = c.id
     ${PREVIEW_BRANCH_LATERAL}
     WHERE ${clauses.join(" AND ")}
     ORDER BY name ASC, o.organization_key ASC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  const total = r.rows[0] ? Number(r.rows[0].total_count) || 0 : 0;
  return {
    items: r.rows.map(buildOrganizationCard),
    total,
    page,
    limit,
    totalPages: total > 0 ? Math.ceil(total / limit) : 0,
    q,
  };
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  normalizeSearchQuery,
  searchPublicOrganizations,
};
