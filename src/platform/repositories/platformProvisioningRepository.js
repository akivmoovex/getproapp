"use strict";

/**
 * Read/write helpers for platform tenant catalogue provisioning.
 * All SQL is parameterized. Callers own the transaction (pass a client).
 */

/**
 * @param {{ query: Function }} client
 * @param {string} productKey
 */
async function findProductByKey(client, productKey) {
  const r = await client.query(
    `SELECT id, product_key, display_name, status
       FROM platform.products
      WHERE product_key = $1
      LIMIT 1`,
    [productKey]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} deploymentCode
 */
async function findDeploymentByCode(client, deploymentCode) {
  const r = await client.query(
    `SELECT deployment_code, application_code, status, jobs_enabled
       FROM platform.deployments
      WHERE deployment_code = $1
      LIMIT 1`,
    [deploymentCode]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationKey
 */
async function findOrganizationByKey(client, organizationKey) {
  const r = await client.query(
    `SELECT id, organization_key, display_name, legal_name, status, data_environment
       FROM platform.organizations
      WHERE organization_key = $1
      LIMIT 1`,
    [organizationKey]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {{ organizationKey: string, displayName: string, legalName: string | null, dataEnvironment: string }} fields
 */
async function insertOrganization(client, fields) {
  const r = await client.query(
    `INSERT INTO platform.organizations
       (organization_key, display_name, legal_name, status, data_environment)
     VALUES ($1, $2, $3, 'active', $4)
     RETURNING id, organization_key, display_name, legal_name, status, data_environment`,
    [fields.organizationKey, fields.displayName, fields.legalName, fields.dataEnvironment]
  );
  return r.rows[0];
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationId
 * @param {string} productId
 */
async function findEnrolmentByOrgProduct(client, organizationId, productId) {
  const r = await client.query(
    `SELECT id, organization_id, product_id, status, product_tenant_key
       FROM platform.organization_products
      WHERE organization_id = $1 AND product_id = $2
      LIMIT 1`,
    [organizationId, productId]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} productId
 * @param {string} productTenantKey
 */
async function findEnrolmentByProductTenantKey(client, productId, productTenantKey) {
  const r = await client.query(
    `SELECT id, organization_id, product_id, status, product_tenant_key
       FROM platform.organization_products
      WHERE product_id = $1 AND product_tenant_key = $2
      LIMIT 1`,
    [productId, productTenantKey]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {{ organizationId: string, productId: string, productTenantKey: string }} fields
 */
async function insertEnrolment(client, fields) {
  const r = await client.query(
    `INSERT INTO platform.organization_products
       (organization_id, product_id, status, product_tenant_key, activated_at)
     VALUES ($1, $2, 'active', $3, now())
     RETURNING id, organization_id, product_id, status, product_tenant_key`,
    [fields.organizationId, fields.productId, fields.productTenantKey]
  );
  return r.rows[0];
}

/**
 * @param {{ query: Function }} client
 * @param {string} hostname
 */
async function findDomainByHostname(client, hostname) {
  const r = await client.query(
    `SELECT id, organization_id, product_id, deployment_id, hostname, domain_type, status, is_primary
       FROM platform.domains
      WHERE hostname = $1
      LIMIT 1`,
    [hostname]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   organizationId: string,
 *   productId: string,
 *   deploymentCode: string,
 *   hostname: string,
 *   domainType: string,
 *   isPrimary: boolean
 * }} fields
 */
async function insertDomain(client, fields) {
  const r = await client.query(
    `INSERT INTO platform.domains
       (organization_id, product_id, deployment_id, hostname, domain_type, status, is_primary)
     VALUES ($1, $2, $3, $4, $5, 'active', $6)
     RETURNING id, organization_id, product_id, deployment_id, hostname, domain_type, status, is_primary`,
    [
      fields.organizationId,
      fields.productId,
      fields.deploymentCode,
      fields.hostname,
      fields.domainType,
      fields.isPrimary,
    ]
  );
  return r.rows[0];
}

function isUniqueViolation(err) {
  return Boolean(err && (err.code === "23505" || /unique|duplicate/i.test(String(err.message || ""))));
}

module.exports = {
  findProductByKey,
  findDeploymentByCode,
  findOrganizationByKey,
  insertOrganization,
  findEnrolmentByOrgProduct,
  findEnrolmentByProductTenantKey,
  insertEnrolment,
  findDomainByHostname,
  insertDomain,
  isUniqueViolation,
};
