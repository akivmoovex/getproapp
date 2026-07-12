"use strict";

/**
 * Public church directory queries (apex finder).
 * Returns only safe public fields for active organizations and active branches.
 */

const {
  buildOrganizationCard,
  buildBranchCard,
} = require("../../../church/publicDirectoryCardModel");

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MAX_QUERY_LENGTH = 80;

const PREVIEW_BRANCH_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT b.slug AS preview_branch_slug,
           b.name AS preview_branch_name,
           b.host_slug AS preview_host_slug,
           b.city AS preview_branch_city,
           b.country AS preview_branch_country,
           b.location_text AS preview_location_text,
           b.service_times AS preview_service_times,
           b.welcome_message AS preview_welcome_message,
           b.member_registration_enabled AS preview_registration_enabled,
           wc.welcome_message AS preview_published_welcome,
           wc.homepage_hero_subtitle AS preview_published_subtitle,
           wc.service_times AS preview_published_service_times,
           wc.location_text AS preview_published_location
    FROM public.church_branches b
    LEFT JOIN public.church_branch_website_content wc
      ON wc.branch_id = b.id AND wc.status = 'published'
    WHERE b.organization_id = o.id AND b.status = 'active'
    ORDER BY b.name ASC, b.slug ASC
    LIMIT 1
  ) preview ON true
`;

const BRANCH_PUBLIC_SELECT = `
  b.slug,
  b.host_slug,
  b.name,
  b.city,
  b.country,
  b.location_text,
  b.service_times,
  b.welcome_message,
  b.member_registration_enabled,
  wc.welcome_message AS published_welcome,
  wc.homepage_hero_subtitle AS published_subtitle,
  wc.service_times AS published_service_times,
  wc.location_text AS published_location
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

function mapPublicBranch(row, organizationName = null) {
  return buildBranchCard(row, organizationName);
}

/**
 * Search active organizations that have at least one active branch, or match via branch fields.
 * @param {import("pg").Pool} pool
 * @param {{ q?: string, page?: number, limit?: number }} opts
 */
async function searchPublicOrganizations(pool, opts = {}) {
  const q = normalizeSearchQuery(opts.q);
  const page = clampPage(opts.page);
  const limit = clampLimit(opts.limit);
  const offset = (page - 1) * limit;

  const params = [];
  const clauses = [`o.status = 'active'`];

  clauses.push(`EXISTS (
    SELECT 1 FROM public.church_branches b_active
    WHERE b_active.organization_id = o.id AND b_active.status = 'active'
  )`);

  if (q) {
    params.push(ilikePattern(q));
    const p = `$${params.length}`;
    clauses.push(`(
      lower(o.name) LIKE lower(${p}) ESCAPE '\\'
      OR lower(o.slug) LIKE lower(${p}) ESCAPE '\\'
      OR lower(COALESCE(o.city, '')) LIKE lower(${p}) ESCAPE '\\'
      OR lower(COALESCE(o.country, '')) LIKE lower(${p}) ESCAPE '\\'
      OR EXISTS (
        SELECT 1 FROM public.church_branches b
        WHERE b.organization_id = o.id
          AND b.status = 'active'
          AND (
            lower(b.name) LIKE lower(${p}) ESCAPE '\\'
            OR lower(b.slug) LIKE lower(${p}) ESCAPE '\\'
            OR lower(COALESCE(NULLIF(trim(b.host_slug), ''), b.slug)) LIKE lower(${p}) ESCAPE '\\'
            OR lower(COALESCE(b.city, '')) LIKE lower(${p}) ESCAPE '\\'
            OR lower(COALESCE(b.country, '')) LIKE lower(${p}) ESCAPE '\\'
            OR lower(COALESCE(b.location_text, '')) LIKE lower(${p}) ESCAPE '\\'
          )
      )
    )`);
  }

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const r = await pool.query(
    `SELECT o.slug, o.name, o.city, o.country,
            (
              SELECT COUNT(*)::int FROM public.church_branches b
              WHERE b.organization_id = o.id AND b.status = 'active'
            ) AS active_branch_count,
            EXISTS (
              SELECT 1 FROM public.church_branches rb
              WHERE rb.organization_id = o.id
                AND rb.status = 'active'
                AND rb.member_registration_enabled = true
            ) AS registration_available,
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
     FROM public.church_organizations o
     ${PREVIEW_BRANCH_LATERAL}
     WHERE ${clauses.join(" AND ")}
     ORDER BY o.name ASC, o.slug ASC
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

/**
 * Active organization by public slug, or null.
 * @param {import("pg").Pool} pool
 * @param {string} orgSlug
 */
async function findActivePublicOrganizationBySlug(pool, orgSlug) {
  const slug = String(orgSlug || "")
    .toLowerCase()
    .trim();
  if (!slug) return null;
  const r = await pool.query(
    `SELECT o.slug, o.name, o.city, o.country, o.id,
            (
              SELECT COUNT(*)::int FROM public.church_branches b
              WHERE b.organization_id = o.id AND b.status = 'active'
            ) AS active_branch_count
     FROM public.church_organizations o
     WHERE o.slug = $1 AND o.status = 'active'
     LIMIT 1`,
    [slug]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    city: row.city || null,
    country: row.country || null,
    active_branch_count: Number(row.active_branch_count) || 0,
  };
}

/**
 * Active public branches for an organization (safe fields only).
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {{ q?: string, organizationName?: string }} [opts]
 */
async function listActivePublicBranchesForOrganization(pool, organizationId, opts = {}) {
  const orgId = Number(organizationId);
  if (!Number.isFinite(orgId) || orgId <= 0) return [];

  const q = normalizeSearchQuery(opts.q);
  const organizationName = String(opts.organizationName || "").trim() || null;
  const params = [orgId];
  const clauses = [`b.organization_id = $1`, `b.status = 'active'`];

  if (q) {
    params.push(ilikePattern(q));
    const p = `$${params.length}`;
    clauses.push(`(
      lower(b.name) LIKE lower(${p}) ESCAPE '\\'
      OR lower(b.slug) LIKE lower(${p}) ESCAPE '\\'
      OR lower(COALESCE(NULLIF(trim(b.host_slug), ''), b.slug)) LIKE lower(${p}) ESCAPE '\\'
      OR lower(COALESCE(b.city, '')) LIKE lower(${p}) ESCAPE '\\'
      OR lower(COALESCE(b.country, '')) LIKE lower(${p}) ESCAPE '\\'
      OR lower(COALESCE(b.location_text, '')) LIKE lower(${p}) ESCAPE '\\'
    )`);
  }

  const r = await pool.query(
    `SELECT ${BRANCH_PUBLIC_SELECT}
     FROM public.church_branches b
     LEFT JOIN public.church_branch_website_content wc
       ON wc.branch_id = b.id AND wc.status = 'published'
     WHERE ${clauses.join(" AND ")}
     ORDER BY b.name ASC, b.slug ASC`,
    params
  );
  return r.rows.map((row) => mapPublicBranch(row, organizationName));
}

/**
 * Resolve an active branch that belongs to an active organization (by public slugs).
 * @param {import("pg").Pool} pool
 * @param {string} orgSlug
 * @param {string} branchSlug
 */
async function findActivePublicBranchForOrganization(pool, orgSlug, branchSlug) {
  const oSlug = String(orgSlug || "")
    .toLowerCase()
    .trim();
  const bSlug = String(branchSlug || "")
    .toLowerCase()
    .trim();
  if (!oSlug || !bSlug) return null;

  const r = await pool.query(
    `SELECT o.slug AS organization_slug, o.name AS organization_name,
            b.slug AS branch_slug, b.host_slug, b.name AS branch_name,
            b.city, b.country, b.location_text, b.service_times,
            b.welcome_message, b.member_registration_enabled,
            wc.welcome_message AS published_welcome,
            wc.homepage_hero_subtitle AS published_subtitle,
            wc.service_times AS published_service_times,
            wc.location_text AS published_location
     FROM public.church_organizations o
     INNER JOIN public.church_branches b ON b.organization_id = o.id
     LEFT JOIN public.church_branch_website_content wc
       ON wc.branch_id = b.id AND wc.status = 'published'
     WHERE o.slug = $1
       AND o.status = 'active'
       AND b.status = 'active'
       AND (b.slug = $2 OR lower(trim(COALESCE(b.host_slug, ''))) = $2)
     LIMIT 1`,
    [oSlug, bSlug]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    organization_slug: row.organization_slug,
    organization_name: row.organization_name,
    branch_slug: row.branch_slug,
    host_slug: row.host_slug || row.branch_slug,
    branch_name: row.branch_name,
    city: row.city || null,
    country: row.country || null,
    location_text: row.location_text || null,
    service_times: row.service_times || null,
  };
}

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  normalizeSearchQuery,
  searchPublicOrganizations,
  findActivePublicOrganizationBySlug,
  listActivePublicBranchesForOrganization,
  findActivePublicBranchForOrganization,
};
