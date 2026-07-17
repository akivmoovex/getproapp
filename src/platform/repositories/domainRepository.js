"use strict";

/**
 * Read-only platform.domains lookup.
 * Single joined query; never writes, migrates, or reads legacy public tables.
 * Caller must pass a pool or query-capable client — this module does not read DATABASE_URL.
 */

const LOOKUP_SQL = `
SELECT
  d.id AS domain_id,
  d.hostname AS domain_hostname,
  d.domain_type AS domain_type,
  d.status AS domain_status,
  d.is_primary AS domain_is_primary,
  d.organization_id AS domain_organization_id,
  d.product_id AS domain_product_id,
  d.deployment_id AS domain_deployment_id,
  dep.deployment_code AS deployment_code,
  dep.status AS deployment_status,
  dep.jobs_enabled AS deployment_jobs_enabled,
  dep.application_code AS deployment_application_code,
  p.id AS product_id,
  p.product_key AS product_key,
  p.display_name AS product_display_name,
  p.status AS product_status,
  o.id AS organization_id,
  o.organization_key AS organization_key,
  o.display_name AS organization_display_name,
  o.status AS organization_status,
  o.data_environment AS organization_data_environment,
  op.id AS organization_product_id,
  op.status AS organization_product_status,
  op.product_tenant_key AS organization_product_tenant_key
FROM platform.domains d
INNER JOIN platform.products p
  ON p.id = d.product_id
LEFT JOIN platform.deployments dep
  ON dep.deployment_code = d.deployment_id
LEFT JOIN platform.organizations o
  ON o.id = d.organization_id
LEFT JOIN platform.organization_products op
  ON op.organization_id = d.organization_id
 AND op.product_id = d.product_id
WHERE d.hostname = $1
LIMIT 1
`;

/**
 * @param {{ query: Function }} db — pg Pool or Client
 * @param {string} normalizedHostname — already normalized hostname
 * @returns {Promise<object | null>}
 */
async function findDomainContextByHostname(db, normalizedHostname) {
  if (!db || typeof db.query !== "function") {
    throw new Error("findDomainContextByHostname requires a database pool or client with query()");
  }
  const hostname = String(normalizedHostname || "");
  if (!hostname) return null;

  const result = await db.query(LOOKUP_SQL, [hostname]);
  if (!result.rows.length) return null;
  return result.rows[0];
}

module.exports = {
  findDomainContextByHostname,
  LOOKUP_SQL,
};
