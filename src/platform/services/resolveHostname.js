"use strict";

/**
 * Read-only platform hostname resolver.
 * Not connected to Express, sessions, auth, cookies, or jobs.
 * Distinct from authentication/authorization — returns routing context only.
 */

const { normalizeHostname } = require("../hostname");
const { findDomainContextByHostname } = require("../repositories/domainRepository");

const RESULT_TYPES = Object.freeze({
  RESOLVED_TENANT: "resolved_tenant",
  RESOLVED_APEX: "resolved_apex",
  UNKNOWN_DOMAIN: "unknown_domain",
  INACTIVE_DOMAIN: "inactive_domain",
  INACTIVE_DEPLOYMENT: "inactive_deployment",
  INACTIVE_PRODUCT: "inactive_product",
  INACTIVE_ORGANIZATION: "inactive_organization",
  INACTIVE_ENROLMENT: "inactive_enrolment",
  MISSING_ENROLMENT: "missing_enrolment",
  MISSING_ORGANIZATION: "missing_organization",
  DEPLOYMENT_MISMATCH: "deployment_mismatch",
  INVALID_HOSTNAME: "invalid_hostname",
});

const TENANT_DOMAIN_TYPES = new Set(["canonical", "custom", "alias"]);

/**
 * @param {string} type
 * @param {string | null} hostname
 * @param {object | null} [partial]
 */
function makeResult(type, hostname, partial) {
  const base = {
    type,
    hostname: hostname || null,
    domain: null,
    deployment: null,
    product: null,
    organization: null,
    organizationProduct: null,
  };
  if (!partial) return base;
  return { ...base, ...partial };
}

function isActiveStatus(status) {
  return String(status || "") === "active";
}

function mapDomain(row) {
  return {
    id: row.domain_id,
    type: row.domain_type,
    status: row.domain_status,
    isPrimary: Boolean(row.domain_is_primary),
  };
}

function mapDeployment(row) {
  if (!row.deployment_code) return null;
  return {
    code: row.deployment_code,
    status: row.deployment_status,
    jobsEnabled: Boolean(row.deployment_jobs_enabled),
  };
}

function mapProduct(row) {
  return {
    id: row.product_id,
    key: row.product_key,
    displayName: row.product_display_name,
    status: row.product_status,
  };
}

function mapOrganization(row) {
  if (!row.organization_id) return null;
  return {
    id: row.organization_id,
    key: row.organization_key,
    displayName: row.organization_display_name,
    status: row.organization_status,
    dataEnvironment: row.organization_data_environment,
  };
}

function mapOrganizationProduct(row) {
  if (!row.organization_product_id) return null;
  return {
    id: row.organization_product_id,
    status: row.organization_product_status,
    productTenantKey: row.organization_product_tenant_key,
  };
}

function contextPartial(row) {
  return {
    domain: mapDomain(row),
    deployment: mapDeployment(row),
    product: mapProduct(row),
    organization: mapOrganization(row),
    organizationProduct: mapOrganizationProduct(row),
  };
}

/**
 * Resolve a raw hostname into platform deployment/product/org/enrolment context.
 * Evaluation order:
 * 1 hostname validity
 * 2 domain existence
 * 3 domain status
 * 4 deployment presence/status where linked on the domain row
 * 5 optional expectedDeploymentCode match (deployment_mismatch when supplied and differs)
 * 6 product status
 * 7 organization presence for non-apex
 * 8 organization status
 * 9 organization-product enrolment presence
 * 10 organization-product enrolment status
 * 11 success
 *
 * deployment_mismatch means: the hostname is assigned to a platform deployment that differs
 * from the expected deployment identity supplied by the calling application.
 *
 * @param {{ query: Function }} db
 * @param {unknown} rawHostname
 * @param {{ expectedDeploymentCode?: string }} [options] — optional; do not read env here
 */
async function resolveHostname(db, rawHostname, options) {
  const opts = options && typeof options === "object" ? options : {};
  const expectedDeploymentCode = opts.expectedDeploymentCode
    ? String(opts.expectedDeploymentCode).trim()
    : "";

  const normalized = normalizeHostname(rawHostname);
  if (!normalized.ok) {
    return makeResult(RESULT_TYPES.INVALID_HOSTNAME, null);
  }

  const hostname = normalized.hostname;
  const row = await findDomainContextByHostname(db, hostname);
  if (!row) {
    return makeResult(RESULT_TYPES.UNKNOWN_DOMAIN, hostname);
  }

  const partial = contextPartial(row);

  if (!isActiveStatus(row.domain_status)) {
    return makeResult(RESULT_TYPES.INACTIVE_DOMAIN, hostname, partial);
  }

  // Deployment status when the domain row links one.
  if (row.domain_deployment_id) {
    if (!row.deployment_code) {
      return makeResult(RESULT_TYPES.INACTIVE_DEPLOYMENT, hostname, partial);
    }
    if (!isActiveStatus(row.deployment_status)) {
      return makeResult(RESULT_TYPES.INACTIVE_DEPLOYMENT, hostname, partial);
    }
  }

  if (expectedDeploymentCode) {
    const resolvedCode = row.deployment_code || row.domain_deployment_id || null;
    if (!resolvedCode || resolvedCode !== expectedDeploymentCode) {
      return makeResult(RESULT_TYPES.DEPLOYMENT_MISMATCH, hostname, partial);
    }
  }

  if (!isActiveStatus(row.product_status)) {
    return makeResult(RESULT_TYPES.INACTIVE_PRODUCT, hostname, partial);
  }

  const domainType = String(row.domain_type || "");
  const isApex = domainType === "apex";

  if (isApex) {
    // Apex: product-level root; organization and enrolment are not required.
    return makeResult(RESULT_TYPES.RESOLVED_APEX, hostname, {
      ...partial,
      organization: null,
      organizationProduct: null,
    });
  }

  if (TENANT_DOMAIN_TYPES.has(domainType)) {
    if (!row.organization_id) {
      return makeResult(RESULT_TYPES.MISSING_ORGANIZATION, hostname, partial);
    }
    if (!isActiveStatus(row.organization_status)) {
      return makeResult(RESULT_TYPES.INACTIVE_ORGANIZATION, hostname, partial);
    }
    if (!row.organization_product_id) {
      return makeResult(RESULT_TYPES.MISSING_ENROLMENT, hostname, partial);
    }
    if (!isActiveStatus(row.organization_product_status)) {
      return makeResult(RESULT_TYPES.INACTIVE_ENROLMENT, hostname, partial);
    }
    return makeResult(RESULT_TYPES.RESOLVED_TENANT, hostname, partial);
  }

  // Unknown domain_type values should not resolve as tenant/apex.
  return makeResult(RESULT_TYPES.UNKNOWN_DOMAIN, hostname, partial);
}

module.exports = {
  resolveHostname,
  RESULT_TYPES,
};
