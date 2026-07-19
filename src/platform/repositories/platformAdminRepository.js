"use strict";

/**
 * Read-only platform-admin catalogue queries (organizations directory).
 */

/**
 * Build allowlisted WHERE for organization directory filters.
 * @param {{
 *   keyPrefix?: string | null,
 *   product?: string | null,
 *   onboarding?: string | null,
 *   followUp?: string | null,
 *   supportRequested?: boolean | null,
 *   publication?: string | null,
 *   plan?: string | null,
 * }} filters
 * @returns {{ whereSql: string, params: unknown[], joins: string }}
 */
function buildOrganizationDirectoryFilters(filters = {}) {
  const params = [];
  const clauses = [];
  const joins = [];

  const keyPrefix = filters.keyPrefix || null;
  if (keyPrefix) {
    params.push(keyPrefix);
    clauses.push(`o.organization_key LIKE $${params.length} || '%'`);
  }

  const product = filters.product ? String(filters.product).toLowerCase() : null;
  if (product === "blessboard") {
    joins.push(`INNER JOIN platform.products p_filt
         ON p_filt.product_key = 'blessboard'
       INNER JOIN platform.organization_products op_filt
         ON op_filt.organization_id = o.id
        AND op_filt.product_id = p_filt.id
        AND op_filt.status = 'active'`);
  }

  const onboarding = filters.onboarding ? String(filters.onboarding).toLowerCase() : null;
  if (onboarding === "incomplete") {
    joins.push(
      `LEFT JOIN blessboard.organization_onboarding oo_filt ON oo_filt.organization_id = o.id`
    );
    joins.push(`INNER JOIN blessboard.churches c_onb ON c_onb.organization_id = o.id`);
    clauses.push(
      `(oo_filt.organization_id IS NULL OR oo_filt.onboarding_status NOT IN ('completed', 'skipped'))`
    );
  }

  const followUp = filters.followUp ? String(filters.followUp).toLowerCase() : null;
  if (followUp) {
    if (!joins.some((j) => j.includes("oo_filt"))) {
      joins.push(
        `LEFT JOIN blessboard.organization_onboarding oo_filt ON oo_filt.organization_id = o.id`
      );
    }
    params.push(followUp);
    clauses.push(`oo_filt.follow_up_status = $${params.length}`);
  }

  if (filters.supportRequested === true) {
    if (!joins.some((j) => j.includes("oo_filt"))) {
      joins.push(
        `LEFT JOIN blessboard.organization_onboarding oo_filt ON oo_filt.organization_id = o.id`
      );
    }
    clauses.push(`oo_filt.support_requested = TRUE`);
  }

  const publication = filters.publication ? String(filters.publication).toLowerCase() : null;
  if (publication === "unpublished") {
    joins.push(`INNER JOIN blessboard.churches c_pub ON c_pub.organization_id = o.id`);
    clauses.push(`NOT EXISTS (
      SELECT 1 FROM blessboard.public_pages pp
       WHERE pp.church_id = c_pub.id AND pp.status = 'published'
    )`);
  }

  const plan = filters.plan ? String(filters.plan).toLowerCase() : null;
  if (plan) {
    params.push(plan);
    clauses.push(`EXISTS (
      SELECT 1
        FROM platform.organization_subscriptions os
        INNER JOIN platform.plans pl ON pl.id = os.plan_id
       WHERE os.organization_id = o.id
         AND os.status IN ('active', 'trialing')
         AND pl.plan_key = $${params.length}
    )`);
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
    joinsSql: joins.length ? joins.join("\n       ") : "",
  };
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   limit: number,
 *   offset: number,
 *   keyPrefix?: string | null,
 *   product?: string | null,
 *   onboarding?: string | null,
 *   followUp?: string | null,
 *   supportRequested?: boolean | null,
 *   publication?: string | null,
 *   plan?: string | null,
 * }} opts
 */
async function listOrganizationDirectoryPage(client, opts) {
  const limit = opts.limit;
  const offset = opts.offset;
  const built = buildOrganizationDirectoryFilters(opts);
  const params = [...built.params, limit, offset];
  const limitIdx = built.params.length + 1;
  const offsetIdx = built.params.length + 2;

  const r = await client.query(
    `SELECT
        o.organization_key,
        o.display_name,
        o.data_environment,
        o.status AS organization_status,
        op.status AS enrolment_status,
        d.hostname AS canonical_hostname,
        d.deployment_id AS deployment_code,
        c.church_key,
        c.status AS church_status,
        COALESCE(bc.active_branch_count, 0)::int AS active_branch_count,
        oo.onboarding_status,
        oo.follow_up_status,
        oo.support_requested,
        oo.next_follow_up_at,
        plan_row.plan_key,
        COALESCE(pub.published_pages, 0)::int AS published_pages,
        COALESCE(pub.draft_pages, 0)::int AS draft_pages
       FROM platform.organizations o
       ${built.joinsSql}
       LEFT JOIN platform.products p
         ON p.product_key = 'blessboard'
       LEFT JOIN platform.organization_products op
         ON op.organization_id = o.id
        AND op.product_id = p.id
       LEFT JOIN LATERAL (
         SELECT dom.hostname, dom.deployment_id
           FROM platform.domains dom
          WHERE dom.organization_id = o.id
            AND dom.product_id = p.id
            AND dom.domain_type = 'canonical'
          ORDER BY
            CASE WHEN dom.is_primary THEN 0 ELSE 1 END,
            CASE WHEN dom.status = 'active' THEN 0 ELSE 1 END,
            dom.hostname ASC
          LIMIT 1
       ) d ON TRUE
       LEFT JOIN blessboard.churches c
         ON c.organization_id = o.id
       LEFT JOIN blessboard.organization_onboarding oo
         ON oo.organization_id = o.id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS active_branch_count
           FROM blessboard.branches b
          WHERE b.church_id = c.id
            AND b.status = 'active'
       ) bc ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*) FILTER (WHERE pp.status = 'draft')::int AS draft_pages,
           COUNT(*) FILTER (WHERE pp.status = 'published')::int AS published_pages
           FROM blessboard.public_pages pp
          WHERE pp.church_id = c.id
       ) pub ON TRUE
       LEFT JOIN LATERAL (
         SELECT pl.plan_key
           FROM platform.organization_subscriptions os
           INNER JOIN platform.plans pl ON pl.id = os.plan_id
          WHERE os.organization_id = o.id
            AND os.status IN ('active', 'trialing')
          ORDER BY os.created_at DESC
          LIMIT 1
       ) plan_row ON TRUE
      ${built.whereSql}
      ORDER BY o.organization_key ASC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );
  return r.rows;
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   keyPrefix?: string | null,
 *   product?: string | null,
 *   onboarding?: string | null,
 *   followUp?: string | null,
 *   supportRequested?: boolean | null,
 *   publication?: string | null,
 *   plan?: string | null,
 * }} opts
 */
async function countOrganizationDirectory(client, opts) {
  const built = buildOrganizationDirectoryFilters(opts);
  const r = await client.query(
    `SELECT COUNT(DISTINCT o.id)::int AS total
       FROM platform.organizations o
       ${built.joinsSql}
      ${built.whereSql}`,
    built.params
  );
  return r.rows[0] ? Number(r.rows[0].total) : 0;
}

/**
 * Real directory totals for the platform-admin dashboard (no fabricated metrics).
 * @param {{ query: Function }} client
 */
async function countOrganizationDirectoryStats(client) {
  const r = await client.query(
    `SELECT
        COUNT(o.id)::int AS total_organizations,
        COUNT(c.id)::int AS organizations_with_church
       FROM platform.organizations o
       LEFT JOIN blessboard.churches c
         ON c.organization_id = o.id`
  );
  const row = r.rows[0] || {};
  return {
    totalOrganizations: Number(row.total_organizations) || 0,
    organizationsWithChurch: Number(row.organizations_with_church) || 0,
  };
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationKey
 */
async function findOrganizationDirectoryByKey(client, organizationKey) {
  const r = await client.query(
    `SELECT
        o.organization_key,
        o.display_name,
        o.data_environment,
        o.status AS organization_status,
        op.status AS enrolment_status,
        d.hostname AS canonical_hostname,
        d.deployment_id AS deployment_code,
        c.church_key,
        c.status AS church_status,
        COALESCE(bc.active_branch_count, 0)::int AS active_branch_count
       FROM platform.organizations o
       LEFT JOIN platform.products p
         ON p.product_key = 'blessboard'
       LEFT JOIN platform.organization_products op
         ON op.organization_id = o.id
        AND op.product_id = p.id
       LEFT JOIN LATERAL (
         SELECT dom.hostname, dom.deployment_id
           FROM platform.domains dom
          WHERE dom.organization_id = o.id
            AND dom.product_id = p.id
            AND dom.domain_type = 'canonical'
          ORDER BY
            CASE WHEN dom.is_primary THEN 0 ELSE 1 END,
            CASE WHEN dom.status = 'active' THEN 0 ELSE 1 END,
            dom.hostname ASC
          LIMIT 1
       ) d ON TRUE
       LEFT JOIN blessboard.churches c
         ON c.organization_id = o.id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS active_branch_count
           FROM blessboard.branches b
          WHERE b.church_id = c.id
            AND b.status = 'active'
       ) bc ON TRUE
      WHERE o.organization_key = $1
      LIMIT 1`,
    [organizationKey]
  );
  return r.rows[0] || null;
}

/**
 * Safe branch catalogue rows for an organization key (no UUIDs).
 * Bounded to 100 rows.
 * @param {{ query: Function }} client
 * @param {string} organizationKey
 */
async function listBranchesForOrganizationKey(client, organizationKey) {
  const r = await client.query(
    `SELECT
        b.branch_key,
        b.display_name,
        b.branch_type,
        b.status,
        b.is_primary,
        b.country_code
       FROM platform.organizations o
       INNER JOIN blessboard.churches c
         ON c.organization_id = o.id
       INNER JOIN blessboard.branches b
         ON b.church_id = c.id
      WHERE o.organization_key = $1
      ORDER BY
        CASE WHEN b.branch_type = 'hq' THEN 0 ELSE 1 END,
        CASE WHEN b.is_primary THEN 0 ELSE 1 END,
        b.branch_key ASC
      LIMIT 100`,
    [organizationKey]
  );
  return r.rows;
}

/**
 * Safe domain rows for an organization key (no UUIDs).
 * Bounded to 100 rows.
 * @param {{ query: Function }} client
 * @param {string} organizationKey
 */
async function listDomainsForOrganizationKey(client, organizationKey) {
  const r = await client.query(
    `SELECT
        d.hostname,
        d.domain_type,
        d.status,
        d.is_primary,
        d.deployment_id AS deployment_code,
        (d.verified_at IS NOT NULL) AS is_verified
       FROM platform.organizations o
       INNER JOIN platform.domains d
         ON d.organization_id = o.id
      WHERE o.organization_key = $1
      ORDER BY
        CASE WHEN d.is_primary THEN 0 ELSE 1 END,
        CASE WHEN d.domain_type = 'canonical' THEN 0 ELSE 1 END,
        d.hostname ASC
      LIMIT 100`,
    [organizationKey]
  );
  return r.rows;
}

/**
 * Safe deployment registry rows (no session cookie names or secrets).
 * Bounded to 100 rows.
 * @param {{ query: Function }} client
 */
async function listDeploymentsSafe(client) {
  const r = await client.query(
    `SELECT
        deployment_code,
        application_code,
        release_version,
        canonical_domain,
        environment_code,
        status,
        jobs_enabled,
        database_access_mode
       FROM platform.deployments
      ORDER BY deployment_code ASC
      LIMIT 100`
  );
  return r.rows;
}

/**
 * Single deployment row — safe catalogue columns only (no cookie-identity column).
 * @param {{ query: Function }} client
 * @param {string} deploymentCode
 */
async function findDeploymentSafeByCode(client, deploymentCode) {
  const r = await client.query(
    `SELECT
        deployment_code,
        application_code,
        release_version,
        canonical_domain,
        environment_code,
        status,
        jobs_enabled,
        database_access_mode
       FROM platform.deployments
      WHERE deployment_code = $1
      LIMIT 1`,
    [deploymentCode]
  );
  return r.rows[0] || null;
}

/**
 * Domains owned by a deployment — safe fields only (no UUIDs/secrets).
 * @param {{ query: Function }} client
 * @param {string} deploymentCode
 * @param {number} [limit]
 */
async function listDomainsForDeploymentSafe(client, deploymentCode, limit) {
  const lim = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 100;
  const r = await client.query(
    `SELECT
        d.hostname,
        d.domain_type,
        d.status,
        d.is_primary,
        d.deployment_id AS deployment_code,
        (d.verified_at IS NOT NULL) AS is_verified,
        p.product_key,
        p.display_name AS product_display_name,
        o.organization_key,
        o.display_name AS organization_display_name
       FROM platform.domains d
       INNER JOIN platform.products p
         ON p.id = d.product_id
       LEFT JOIN platform.organizations o
         ON o.id = d.organization_id
      WHERE d.deployment_id = $1
      ORDER BY
        CASE WHEN d.is_primary THEN 0 ELSE 1 END,
        CASE WHEN d.domain_type = 'canonical' THEN 0 ELSE 1 END,
        d.hostname ASC
      LIMIT $2`,
    [deploymentCode, lim]
  );
  return r.rows;
}

/**
 * Product catalogue row by product_key (safe display fields).
 * @param {{ query: Function }} client
 * @param {string} productKey
 */
async function findProductSafeByKey(client, productKey) {
  const r = await client.query(
    `SELECT product_key, display_name, status
       FROM platform.products
      WHERE product_key = $1
      LIMIT 1`,
    [productKey]
  );
  return r.rows[0] || null;
}

/**
 * Subscription directory rows (no UUIDs). Bounded page.
 * @param {{ query: Function }} client
 * @param {{
 *   limit: number,
 *   offset: number,
 *   keyPrefix?: string | null,
 *   status?: string | null,
 *   productKey?: string,
 * }} opts
 */
async function listSubscriptionsDirectoryPage(client, opts) {
  const limit = opts.limit;
  const offset = opts.offset;
  const keyPrefix = opts.keyPrefix || null;
  const status = opts.status || null;
  const productKey = opts.productKey || "blessboard";

  const r = await client.query(
    `SELECT
        o.organization_key,
        o.display_name AS organization_display_name,
        o.status AS organization_status,
        s.product_key,
        s.status AS subscription_status,
        s.starts_at,
        s.ends_at,
        s.notes,
        p.plan_key,
        p.display_name AS plan_display_name,
        p.status AS plan_status
       FROM platform.organization_subscriptions s
       INNER JOIN platform.organizations o
         ON o.id = s.organization_id
       INNER JOIN platform.plans p
         ON p.id = s.plan_id
      WHERE s.product_key = $1
        AND ($2::text IS NULL OR o.organization_key LIKE $2 || '%')
        AND ($3::text IS NULL OR s.status = $3)
      ORDER BY o.organization_key ASC, s.starts_at DESC
      LIMIT $4 OFFSET $5`,
    [productKey, keyPrefix, status, limit, offset]
  );
  return r.rows;
}

/**
 * @param {{ query: Function }} client
 * @param {{ keyPrefix?: string | null, status?: string | null, productKey?: string }} opts
 */
async function countSubscriptionsDirectory(client, opts) {
  const keyPrefix = opts.keyPrefix || null;
  const status = opts.status || null;
  const productKey = opts.productKey || "blessboard";
  const r = await client.query(
    `SELECT COUNT(*)::int AS total
       FROM platform.organization_subscriptions s
       INNER JOIN platform.organizations o
         ON o.id = s.organization_id
      WHERE s.product_key = $1
        AND ($2::text IS NULL OR o.organization_key LIKE $2 || '%')
        AND ($3::text IS NULL OR s.status = $3)`,
    [productKey, keyPrefix, status]
  );
  return r.rows[0] ? Number(r.rows[0].total) : 0;
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   limit: number,
 *   offset: number,
 *   hostnamePrefix?: string | null,
 *   orgKeyPrefix?: string | null,
 *   status?: string | null,
 *   domainType?: string | null,
 *   verified?: boolean | null,
 *   productKey?: string,
 * }} opts
 */
async function listDomainsDirectoryPage(client, opts) {
  const limit = opts.limit;
  const offset = opts.offset;
  const hostnamePrefix = opts.hostnamePrefix || null;
  const orgKeyPrefix = opts.orgKeyPrefix || null;
  const status = opts.status || null;
  const domainType = opts.domainType || null;
  const verified = opts.verified == null ? null : Boolean(opts.verified);
  const productKey = opts.productKey || "blessboard";

  const r = await client.query(
    `SELECT
        d.hostname,
        d.domain_type,
        d.status,
        d.is_primary,
        d.deployment_id AS deployment_code,
        (d.verified_at IS NOT NULL) AS is_verified,
        p.product_key,
        p.display_name AS product_display_name,
        o.organization_key,
        o.display_name AS organization_display_name,
        o.status AS organization_status
       FROM platform.domains d
       INNER JOIN platform.products p
         ON p.id = d.product_id
       LEFT JOIN platform.organizations o
         ON o.id = d.organization_id
      WHERE p.product_key = $1
        AND ($2::text IS NULL OR d.hostname LIKE $2 || '%')
        AND ($3::text IS NULL OR o.organization_key LIKE $3 || '%')
        AND ($4::text IS NULL OR d.status = $4)
        AND ($5::text IS NULL OR d.domain_type = $5)
        AND (
          $6::boolean IS NULL
          OR ($6::boolean = TRUE AND d.verified_at IS NOT NULL)
          OR ($6::boolean = FALSE AND d.verified_at IS NULL)
        )
      ORDER BY
        CASE WHEN d.is_primary THEN 0 ELSE 1 END,
        CASE WHEN d.domain_type = 'canonical' THEN 0 ELSE 1 END,
        d.hostname ASC
      LIMIT $7 OFFSET $8`,
    [productKey, hostnamePrefix, orgKeyPrefix, status, domainType, verified, limit, offset]
  );
  return r.rows;
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   hostnamePrefix?: string | null,
 *   orgKeyPrefix?: string | null,
 *   status?: string | null,
 *   domainType?: string | null,
 *   verified?: boolean | null,
 *   productKey?: string,
 * }} opts
 */
async function countDomainsDirectory(client, opts) {
  const hostnamePrefix = opts.hostnamePrefix || null;
  const orgKeyPrefix = opts.orgKeyPrefix || null;
  const status = opts.status || null;
  const domainType = opts.domainType || null;
  const verified = opts.verified == null ? null : Boolean(opts.verified);
  const productKey = opts.productKey || "blessboard";
  const r = await client.query(
    `SELECT COUNT(*)::int AS total
       FROM platform.domains d
       INNER JOIN platform.products p
         ON p.id = d.product_id
       LEFT JOIN platform.organizations o
         ON o.id = d.organization_id
      WHERE p.product_key = $1
        AND ($2::text IS NULL OR d.hostname LIKE $2 || '%')
        AND ($3::text IS NULL OR o.organization_key LIKE $3 || '%')
        AND ($4::text IS NULL OR d.status = $4)
        AND ($5::text IS NULL OR d.domain_type = $5)
        AND (
          $6::boolean IS NULL
          OR ($6::boolean = TRUE AND d.verified_at IS NOT NULL)
          OR ($6::boolean = FALSE AND d.verified_at IS NULL)
        )`,
    [productKey, hostnamePrefix, orgKeyPrefix, status, domainType, verified]
  );
  return r.rows[0] ? Number(r.rows[0].total) : 0;
}

module.exports = {
  buildOrganizationDirectoryFilters,
  listOrganizationDirectoryPage,
  countOrganizationDirectory,
  countOrganizationDirectoryStats,
  findOrganizationDirectoryByKey,
  listBranchesForOrganizationKey,
  listDomainsForOrganizationKey,
  listDeploymentsSafe,
  findDeploymentSafeByCode,
  listDomainsForDeploymentSafe,
  findProductSafeByKey,
  listSubscriptionsDirectoryPage,
  countSubscriptionsDirectory,
  listDomainsDirectoryPage,
  countDomainsDirectory,
};
