"use strict";

/**
 * Read helpers for platform.organization_products (product enrolment).
 * Writes for new enrolments go through provisionPlatformTenant / insertEnrolment.
 */

const ACTIVE_STATUS = "active";
const ENROLMENT_STATUSES = Object.freeze(["active", "inactive", "retired"]);

/**
 * @param {{ query: Function }} db
 * @param {string} productKey
 */
async function findProductIdByKey(db, productKey) {
  const r = await db.query(
    `SELECT id, product_key, display_name, status
       FROM platform.products
      WHERE product_key = $1
      LIMIT 1`,
    [productKey]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} db
 * @param {{ organizationId: string, productKey: string }} input
 */
async function findOrganizationProductByOrgAndProductKey(db, input) {
  const r = await db.query(
    `SELECT
        op.id,
        op.organization_id,
        op.product_id,
        op.status,
        op.product_tenant_key,
        op.activated_at,
        op.deactivated_at,
        op.created_at,
        op.updated_at,
        p.product_key,
        p.display_name AS product_display_name,
        p.status AS product_status,
        o.organization_key,
        o.display_name AS organization_display_name,
        o.status AS organization_status,
        o.data_environment
       FROM platform.organization_products op
       INNER JOIN platform.products p ON p.id = op.product_id
       INNER JOIN platform.organizations o ON o.id = op.organization_id
      WHERE op.organization_id = $1
        AND p.product_key = $2
      LIMIT 1`,
    [input.organizationId, input.productKey]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} db
 * @param {{ organizationKey: string, productKey: string }} input
 */
async function findOrganizationProductByOrgKeyAndProductKey(db, input) {
  const r = await db.query(
    `SELECT
        op.id,
        op.organization_id,
        op.product_id,
        op.status,
        op.product_tenant_key,
        op.activated_at,
        op.deactivated_at,
        op.created_at,
        op.updated_at,
        p.product_key,
        p.display_name AS product_display_name,
        p.status AS product_status,
        o.organization_key,
        o.display_name AS organization_display_name,
        o.status AS organization_status,
        o.data_environment
       FROM platform.organizations o
       INNER JOIN platform.organization_products op ON op.organization_id = o.id
       INNER JOIN platform.products p ON p.id = op.product_id
      WHERE o.organization_key = $1
        AND p.product_key = $2
      LIMIT 1`,
    [input.organizationKey, input.productKey]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} db
 * @param {string} organizationId
 */
async function listOrganizationProductsForOrganization(db, organizationId) {
  const r = await db.query(
    `SELECT
        op.id,
        op.organization_id,
        op.product_id,
        op.status,
        op.product_tenant_key,
        op.activated_at,
        op.deactivated_at,
        p.product_key,
        p.display_name AS product_display_name,
        p.status AS product_status
       FROM platform.organization_products op
       INNER JOIN platform.products p ON p.id = op.product_id
      WHERE op.organization_id = $1
      ORDER BY p.product_key`,
    [organizationId]
  );
  return r.rows;
}

/**
 * @param {{ query: Function }} db
 * @param {{
 *   productKey: string,
 *   enrolmentStatus?: string,
 *   dataEnvironment?: string|null,
 * }} input
 */
async function listOrganizationsByProductKey(db, input) {
  const enrolmentStatus = input.enrolmentStatus || ACTIVE_STATUS;
  const params = [input.productKey, enrolmentStatus];
  let envClause = "";
  if (input.dataEnvironment) {
    params.push(input.dataEnvironment);
    envClause = ` AND o.data_environment = $${params.length}`;
  }
  const r = await db.query(
    `SELECT
        o.id AS organization_id,
        o.organization_key,
        o.display_name AS organization_display_name,
        o.status AS organization_status,
        o.data_environment,
        op.id AS organization_product_id,
        op.status AS enrolment_status,
        op.product_tenant_key,
        p.product_key,
        p.id AS product_id
       FROM platform.organization_products op
       INNER JOIN platform.products p ON p.id = op.product_id
       INNER JOIN platform.organizations o ON o.id = op.organization_id
      WHERE p.product_key = $1
        AND op.status = $2
        AND o.status = 'active'
        ${envClause}
      ORDER BY o.organization_key`,
    params
  );
  return r.rows;
}

/**
 * Lifecycle update for an existing enrolment (suspend/restore). Does not create rows.
 * @param {{ query: Function }} db
 * @param {{ organizationProductId: string, status: string }} input
 */
async function updateOrganizationProductStatus(db, input) {
  const status = String(input.status || "");
  if (!ENROLMENT_STATUSES.includes(status)) {
    throw new Error(`invalid_organization_product_status:${status}`);
  }
  const r = await db.query(
    `UPDATE platform.organization_products
        SET status = $2,
            deactivated_at = CASE
              WHEN $2 = 'active' THEN NULL
              WHEN deactivated_at IS NULL THEN now()
              ELSE deactivated_at
            END,
            activated_at = CASE
              WHEN $2 = 'active' AND activated_at IS NULL THEN now()
              ELSE activated_at
            END,
            updated_at = now()
      WHERE id = $1
      RETURNING id, organization_id, product_id, status, product_tenant_key,
                activated_at, deactivated_at`,
    [input.organizationProductId, status]
  );
  return r.rows[0] || null;
}

module.exports = {
  ACTIVE_STATUS,
  ENROLMENT_STATUSES,
  findProductIdByKey,
  findOrganizationProductByOrgAndProductKey,
  findOrganizationProductByOrgKeyAndProductKey,
  listOrganizationProductsForOrganization,
  listOrganizationsByProductKey,
  updateOrganizationProductStatus,
};
