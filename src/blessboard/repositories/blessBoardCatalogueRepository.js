"use strict";

/**
 * Read/write helpers for BlessBoard church/branch catalogue.
 * All SQL is parameterized. Callers own the transaction (pass a client).
 */

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
 * @param {string} organizationId
 */
async function findBlessBoardEnrolment(client, organizationId) {
  const r = await client.query(
    `SELECT op.id, op.organization_id, op.product_id, op.status, op.product_tenant_key,
            p.product_key, p.status AS product_status
       FROM platform.organization_products op
       JOIN platform.products p ON p.id = op.product_id
      WHERE op.organization_id = $1
        AND p.product_key = 'blessboard'
      LIMIT 1`,
    [organizationId]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} churchKey
 */
async function findChurchByKey(client, churchKey) {
  const r = await client.query(
    `SELECT id, organization_id, church_key, display_name, legal_name, status, data_environment
       FROM blessboard.churches
      WHERE church_key = $1
      LIMIT 1`,
    [churchKey]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationId
 */
async function findChurchByOrganizationId(client, organizationId) {
  const r = await client.query(
    `SELECT id, organization_id, church_key, display_name, legal_name, status, data_environment
       FROM blessboard.churches
      WHERE organization_id = $1
      LIMIT 1`,
    [organizationId]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   organizationId: string,
 *   churchKey: string,
 *   displayName: string,
 *   legalName: string | null,
 *   dataEnvironment: string
 * }} fields
 */
async function insertChurch(client, fields) {
  const r = await client.query(
    `INSERT INTO blessboard.churches
       (organization_id, church_key, display_name, legal_name, status, data_environment)
     VALUES ($1, $2, $3, $4, 'active', $5)
     RETURNING id, organization_id, church_key, display_name, legal_name, status, data_environment`,
    [
      fields.organizationId,
      fields.churchKey,
      fields.displayName,
      fields.legalName,
      fields.dataEnvironment,
    ]
  );
  return r.rows[0];
}

/**
 * @param {{ query: Function }} client
 * @param {string} churchId
 * @param {string} branchKey
 */
async function findBranchByChurchAndKey(client, churchId, branchKey) {
  const r = await client.query(
    `SELECT id, church_id, branch_key, display_name, short_name, branch_type, status,
            is_primary, timezone, country_code
       FROM blessboard.branches
      WHERE church_id = $1 AND branch_key = $2
      LIMIT 1`,
    [churchId, branchKey]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} churchId
 */
async function findHqBranch(client, churchId) {
  const r = await client.query(
    `SELECT id, church_id, branch_key, display_name, short_name, branch_type, status,
            is_primary, timezone, country_code
       FROM blessboard.branches
      WHERE church_id = $1 AND branch_type = 'hq'
      LIMIT 1`,
    [churchId]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} churchId
 */
async function findPrimaryBranch(client, churchId) {
  const r = await client.query(
    `SELECT id, church_id, branch_key, display_name, short_name, branch_type, status,
            is_primary, timezone, country_code
       FROM blessboard.branches
      WHERE church_id = $1 AND is_primary = true
      LIMIT 1`,
    [churchId]
  );
  return r.rows[0] || null;
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   churchId: string,
 *   branchKey: string,
 *   displayName: string,
 *   timezone: string | null,
 *   countryCode: string | null
 * }} fields
 */
async function insertHqBranch(client, fields) {
  const {
    prepareBranchDisplayName,
  } = require("../services/normalizeBranchDisplayName");
  const prepared = prepareBranchDisplayName(fields.displayName, {
    field: "displayName",
    required: true,
  });
  if (!prepared.ok) {
    const err = new Error(prepared.error || "invalid_branch_display_name");
    err.code = "invalid_branch_display_name";
    throw err;
  }
  const r = await client.query(
    `INSERT INTO blessboard.branches
       (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
     VALUES ($1, $2, $3, 'hq', 'active', true, $4, $5)
     RETURNING id, church_id, branch_key, display_name, display_name_normalized, short_name, branch_type, status,
               is_primary, timezone, country_code`,
    [
      fields.churchId,
      fields.branchKey,
      prepared.display,
      fields.timezone,
      fields.countryCode,
    ]
  );
  return r.rows[0];
}

/**
 * Joined read-only catalogue context for an organization UUID.
 * @param {{ query: Function }} client
 * @param {string} organizationId
 */
async function findCatalogueContextByOrganizationId(client, organizationId) {
  const r = await client.query(
    `SELECT
        o.id AS organization_id,
        o.organization_key,
        o.display_name AS organization_display_name,
        o.status AS organization_status,
        o.data_environment AS organization_data_environment,
        c.id AS church_id,
        c.church_key,
        c.display_name AS church_display_name,
        c.legal_name AS church_legal_name,
        c.status AS church_status,
        c.data_environment AS church_data_environment,
        hq.id AS hq_branch_id,
        hq.branch_key AS hq_branch_key,
        hq.display_name AS hq_branch_display_name,
        hq.status AS hq_branch_status,
        hq.is_primary AS hq_is_primary,
        hq.timezone AS hq_timezone,
        hq.country_code AS hq_country_code,
        primary_b.id AS primary_branch_id,
        primary_b.branch_key AS primary_branch_key,
        primary_b.display_name AS primary_branch_display_name,
        primary_b.branch_type AS primary_branch_type,
        primary_b.status AS primary_branch_status
       FROM platform.organizations o
       LEFT JOIN blessboard.churches c ON c.organization_id = o.id
       LEFT JOIN blessboard.branches hq
         ON hq.church_id = c.id AND hq.branch_type = 'hq'
       LEFT JOIN blessboard.branches primary_b
         ON primary_b.church_id = c.id AND primary_b.is_primary = true
      WHERE o.id = $1
      LIMIT 1`,
    [organizationId]
  );
  return r.rows[0] || null;
}

function isUniqueViolation(err) {
  return Boolean(
    err && (err.code === "23505" || /unique|duplicate/i.test(String(err.message || "")))
  );
}

function isCheckOrTriggerViolation(err) {
  return Boolean(
    err &&
      (err.code === "23514" ||
        err.code === "23503" ||
        /integrity_constraint_violation|check constraint|violates/i.test(
          String(err.message || "")
        ))
  );
}

module.exports = {
  findOrganizationByKey,
  findBlessBoardEnrolment,
  findChurchByKey,
  findChurchByOrganizationId,
  insertChurch,
  findBranchByChurchAndKey,
  findHqBranch,
  findPrimaryBranch,
  insertHqBranch,
  findCatalogueContextByOrganizationId,
  isUniqueViolation,
  isCheckOrTriggerViolation,
};
