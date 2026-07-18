"use strict";

/**
 * Read-only platform-admin catalogue queries (organizations directory).
 */

/**
 * @param {{ query: Function }} client
 * @param {{
 *   limit: number,
 *   offset: number,
 *   keyPrefix?: string | null,
 * }} opts
 */
async function listOrganizationDirectoryPage(client, opts) {
  const limit = opts.limit;
  const offset = opts.offset;
  const keyPrefix = opts.keyPrefix || null;

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
      WHERE ($1::text IS NULL OR o.organization_key LIKE $1 || '%')
      ORDER BY o.organization_key ASC
      LIMIT $2 OFFSET $3`,
    [keyPrefix, limit, offset]
  );
  return r.rows;
}

/**
 * @param {{ query: Function }} client
 * @param {{ keyPrefix?: string | null }} opts
 */
async function countOrganizationDirectory(client, opts) {
  const keyPrefix = opts.keyPrefix || null;
  const r = await client.query(
    `SELECT COUNT(*)::int AS total
       FROM platform.organizations o
      WHERE ($1::text IS NULL OR o.organization_key LIKE $1 || '%')`,
    [keyPrefix]
  );
  return r.rows[0] ? Number(r.rows[0].total) : 0;
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

module.exports = {
  listOrganizationDirectoryPage,
  countOrganizationDirectory,
  findOrganizationDirectoryByKey,
};
