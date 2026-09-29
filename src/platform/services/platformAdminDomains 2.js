"use strict";

/**
 * Platform-admin domain detail (read + confirmed status / organization assignment).
 * No DNS lookup, SSL issuance, redirects, or verification jobs.
 * Mutations require CSRF (route layer) + confirm flag + current-deployment match.
 */

const { normalizeHostname } = require("../hostname");
const { getPlatformDeploymentCode } = require("../config/platformDeploymentCode");
const {
  findOrganizationByKey,
  findEnrolmentByOrgProduct,
  findProductByKey,
} = require("../repositories/platformProvisioningRepository");
const { PRODUCT_KEY_DEFAULT } = require("./entitlementService");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  LOOKUP_ERROR: "lookup_error",
  CONFIRMATION_REQUIRED: "confirmation_required",
  FORBIDDEN: "forbidden",
  DEPLOYMENT_MISMATCH: "deployment_mismatch",
});

const ALLOWED_STATUSES = Object.freeze(["active", "inactive", "retired"]);
const ORG_KEY_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const TYPES_REQUIRING_ORG = new Set(["canonical", "custom", "alias"]);

/**
 * @param {object} row
 * @param {string | null} currentDeploymentCode
 */
function presentDomainDetail(row, currentDeploymentCode) {
  if (!row) return null;
  const deploymentCode = row.deployment_code != null ? String(row.deployment_code) : "";
  const current = currentDeploymentCode ? String(currentDeploymentCode) : "";
  return {
    hostname: String(row.hostname || ""),
    domainType: String(row.domain_type || ""),
    status: String(row.status || ""),
    isPrimary: Boolean(row.is_primary),
    isVerified: Boolean(row.is_verified),
    verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null,
    deploymentCode,
    productKey: String(row.product_key || ""),
    productDisplayName: String(row.product_display_name || ""),
    organizationKey: row.organization_key != null ? String(row.organization_key) : null,
    organizationDisplayName:
      row.organization_display_name != null ? String(row.organization_display_name) : null,
    organizationStatus: row.organization_status != null ? String(row.organization_status) : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    mutableOnThisDeployment: Boolean(current && deploymentCode && deploymentCode === current),
  };
}

/**
 * @param {{ query: Function }} db
 * @param {string} hostnameRaw
 */
async function findDomainDetailRow(db, hostnameRaw) {
  const normalized = normalizeHostname(hostnameRaw);
  if (!normalized.ok) {
    return { ok: false, reason: "hostname", hostname: null };
  }
  const r = await db.query(
    `SELECT
        d.hostname,
        d.domain_type,
        d.status,
        d.is_primary,
        d.deployment_id AS deployment_code,
        d.verified_at,
        (d.verified_at IS NOT NULL) AS is_verified,
        d.created_at,
        d.updated_at,
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
      WHERE d.hostname = $1
      LIMIT 1`,
    [normalized.hostname]
  );
  return {
    ok: true,
    hostname: normalized.hostname,
    row: r.rows[0] || null,
  };
}

/**
 * @param {{ query: Function }} db
 * @param {string} hostnameRaw
 * @param {NodeJS.ProcessEnv} [env]
 */
async function getPlatformDomainDetail(db, hostnameRaw, env) {
  if (!db || typeof db.query !== "function") {
    return { ok: false, status: STATUS.LOOKUP_ERROR, domain: null };
  }
  try {
    const found = await findDomainDetailRow(db, hostnameRaw);
    if (!found.ok) {
      return { ok: false, status: STATUS.INVALID_INPUT, domain: null };
    }
    if (!found.row) {
      return { ok: false, status: STATUS.NOT_FOUND, domain: null, hostname: found.hostname };
    }
    const deployment = getPlatformDeploymentCode(env || process.env);
    const currentCode = deployment && deployment.ok ? deployment.code : null;
    return {
      ok: true,
      status: STATUS.OK,
      domain: presentDomainDetail(found.row, currentCode),
      allowedStatuses: ALLOWED_STATUSES,
      currentDeploymentCode: currentCode,
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, domain: null };
  }
}

/**
 * @param {{ query: Function }} db
 * @param {{ hostname: string, status: string, confirmed: boolean, env?: NodeJS.ProcessEnv }} input
 */
async function updatePlatformDomainStatus(db, input) {
  const raw = input && typeof input === "object" ? input : {};
  if (!raw.confirmed) {
    return { ok: false, status: STATUS.CONFIRMATION_REQUIRED };
  }
  const status = String(raw.status || "")
    .trim()
    .toLowerCase();
  if (!ALLOWED_STATUSES.includes(status)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "status" };
  }
  if (!db || typeof db.query !== "function") {
    return { ok: false, status: STATUS.LOOKUP_ERROR };
  }

  try {
    const found = await findDomainDetailRow(db, raw.hostname);
    if (!found.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: "hostname" };
    if (!found.row) return { ok: false, status: STATUS.NOT_FOUND };

    const deployment = getPlatformDeploymentCode(raw.env || process.env);
    const currentCode = deployment && deployment.ok ? deployment.code : null;
    const domainCode = found.row.deployment_code != null ? String(found.row.deployment_code) : "";
    if (!currentCode || !domainCode || domainCode !== currentCode) {
      return { ok: false, status: STATUS.DEPLOYMENT_MISMATCH };
    }

    const updated = await db.query(
      `UPDATE platform.domains
          SET status = $2,
              updated_at = now()
        WHERE hostname = $1
          AND deployment_id = $3
      RETURNING hostname, status, deployment_id AS deployment_code`,
      [found.hostname, status, currentCode]
    );
    if (!updated.rows.length) {
      return { ok: false, status: STATUS.DEPLOYMENT_MISMATCH };
    }
    return {
      ok: true,
      status: STATUS.OK,
      hostname: updated.rows[0].hostname,
      domainStatus: updated.rows[0].status,
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR };
  }
}

/**
 * @param {{ query: Function }} db
 * @param {{
 *   hostname: string,
 *   organizationKey: string | null,
 *   confirmed: boolean,
 *   env?: NodeJS.ProcessEnv
 * }} input
 */
async function assignPlatformDomainOrganization(db, input) {
  const raw = input && typeof input === "object" ? input : {};
  if (!raw.confirmed) {
    return { ok: false, status: STATUS.CONFIRMATION_REQUIRED };
  }
  if (!db || typeof db.query !== "function") {
    return { ok: false, status: STATUS.LOOKUP_ERROR };
  }

  let organizationKey = null;
  if (raw.organizationKey != null && String(raw.organizationKey).trim() !== "") {
    organizationKey = String(raw.organizationKey).trim().toLowerCase();
    if (!ORG_KEY_RE.test(organizationKey)) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: "organization_key" };
    }
  }

  try {
    const found = await findDomainDetailRow(db, raw.hostname);
    if (!found.ok) return { ok: false, status: STATUS.INVALID_INPUT, reason: "hostname" };
    if (!found.row) return { ok: false, status: STATUS.NOT_FOUND };

    const domainType = String(found.row.domain_type || "");
    if (TYPES_REQUIRING_ORG.has(domainType) && !organizationKey) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: "organization_required" };
    }

    const deployment = getPlatformDeploymentCode(raw.env || process.env);
    const currentCode = deployment && deployment.ok ? deployment.code : null;
    const domainCode = found.row.deployment_code != null ? String(found.row.deployment_code) : "";
    if (!currentCode || !domainCode || domainCode !== currentCode) {
      return { ok: false, status: STATUS.DEPLOYMENT_MISMATCH };
    }

    let organizationId = null;
    if (organizationKey) {
      const org = await findOrganizationByKey(db, organizationKey);
      if (!org) {
        return { ok: false, status: STATUS.NOT_FOUND, reason: "organization" };
      }
      const product = await findProductByKey(db, PRODUCT_KEY_DEFAULT);
      if (!product) {
        return { ok: false, status: STATUS.LOOKUP_ERROR };
      }
      const enrolment = await findEnrolmentByOrgProduct(db, org.id, product.id);
      if (!enrolment || String(enrolment.status || "") !== "active") {
        return { ok: false, status: STATUS.INVALID_INPUT, reason: "enrolment" };
      }
      organizationId = org.id;

      // Custom domains require Network custom_domain — same gate as provision insert.
      if (domainType === "custom") {
        const { assertFeature, FEATURE_KEYS } = require("./entitlementService");
        const domainGate = await assertFeature(db, {
          organizationId,
          productKey: PRODUCT_KEY_DEFAULT,
          featureKey: FEATURE_KEYS.CUSTOM_DOMAIN,
        });
        if (!domainGate.ok) {
          return {
            ok: false,
            status: STATUS.FORBIDDEN,
            reason: "custom_domain_not_entitled",
          };
        }
      }
    }

    const updated = await db.query(
      `UPDATE platform.domains
          SET organization_id = $2,
              updated_at = now()
        WHERE hostname = $1
          AND deployment_id = $3
      RETURNING hostname, organization_id, deployment_id AS deployment_code`,
      [found.hostname, organizationId, currentCode]
    );
    if (!updated.rows.length) {
      return { ok: false, status: STATUS.DEPLOYMENT_MISMATCH };
    }
    return {
      ok: true,
      status: STATUS.OK,
      hostname: updated.rows[0].hostname,
      organizationKey,
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR };
  }
}

module.exports = {
  STATUS,
  ALLOWED_STATUSES,
  presentDomainDetail,
  getPlatformDomainDetail,
  updatePlatformDomainStatus,
  assignPlatformDomainOrganization,
};
