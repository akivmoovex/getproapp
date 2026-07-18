"use strict";

/**
 * Transactional platform tenant catalogue provisioner.
 * Creates/recognizes organization + enrolment + domain only.
 * Does not read environment variables or connection strings. Caller supplies a pool/client.
 */

const { normalizeHostname } = require("../hostname");
const repo = require("../repositories/platformProvisioningRepository");

const STATUS = Object.freeze({
  PROVISIONED: "provisioned",
  ALREADY_PROVISIONED: "already_provisioned",
  INVALID_INPUT: "invalid_input",
  PRODUCT_NOT_FOUND: "product_not_found",
  INACTIVE_PRODUCT: "inactive_product",
  DEPLOYMENT_NOT_FOUND: "deployment_not_found",
  INACTIVE_DEPLOYMENT: "inactive_deployment",
  ORGANIZATION_CONFLICT: "organization_conflict",
  ENROLMENT_CONFLICT: "enrolment_conflict",
  HOSTNAME_CONFLICT: "hostname_conflict",
  TRANSACTION_ERROR: "transaction_error",
});

const ORG_KEY_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const PRODUCT_KEY_RE = /^[a-z][a-z0-9_]{0,63}$/;
const TENANT_KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const DEPLOYMENT_CODE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATA_ENVIRONMENTS = new Set(["production", "pilot", "demo", "testing"]);
const DOMAIN_TYPES = new Set(["canonical", "custom", "alias", "apex"]);

function fail(status, message, extra) {
  return {
    ok: false,
    status,
    message: message || status,
    created: { organization: false, enrolment: false, domain: false },
    records: null,
    ...(extra || {}),
  };
}

function success(status, created, records) {
  return {
    ok: true,
    status,
    message: status,
    created,
    records,
  };
}

/**
 * @param {object} input
 */
function validateAndNormalizeInput(input) {
  const raw = input && typeof input === "object" ? input : {};
  const organizationKey = String(raw.organizationKey || "")
    .trim()
    .toLowerCase();
  const displayName = String(raw.displayName != null ? raw.displayName : "").trim();
  const legalNameRaw = raw.legalName != null ? String(raw.legalName).trim() : "";
  const legalName = legalNameRaw ? legalNameRaw : null;
  const dataEnvironment = String(raw.dataEnvironment || "")
    .trim()
    .toLowerCase();
  const productKey = String(raw.productKey || "")
    .trim()
    .toLowerCase();
  const productTenantKey = String(raw.productTenantKey || "").trim();
  const deploymentCode = String(raw.deploymentCode || "")
    .trim()
    .toLowerCase();
  const domainType = String(raw.domainType || "")
    .trim()
    .toLowerCase();
  const isPrimary = raw.isPrimary === undefined ? true : Boolean(raw.isPrimary);

  if (!organizationKey || !ORG_KEY_RE.test(organizationKey)) {
    return { ok: false, reason: "organizationKey" };
  }
  if (!displayName || displayName.length > 200) {
    return { ok: false, reason: "displayName" };
  }
  if (legalName && legalName.length > 200) {
    return { ok: false, reason: "legalName" };
  }
  if (!DATA_ENVIRONMENTS.has(dataEnvironment)) {
    return { ok: false, reason: "dataEnvironment" };
  }
  if (!productKey || !PRODUCT_KEY_RE.test(productKey)) {
    return { ok: false, reason: "productKey" };
  }
  if (!productTenantKey || !TENANT_KEY_RE.test(productTenantKey)) {
    return { ok: false, reason: "productTenantKey" };
  }
  if (!deploymentCode || !DEPLOYMENT_CODE_RE.test(deploymentCode)) {
    return { ok: false, reason: "deploymentCode" };
  }
  if (!DOMAIN_TYPES.has(domainType)) {
    return { ok: false, reason: "domainType" };
  }
  if (domainType === "apex") {
    return { ok: false, reason: "domainType_apex_not_for_tenant_provision" };
  }

  const host = normalizeHostname(raw.hostname);
  if (!host.ok) {
    return { ok: false, reason: "hostname" };
  }

  return {
    ok: true,
    value: {
      organizationKey,
      displayName,
      legalName,
      dataEnvironment,
      productKey,
      productTenantKey,
      deploymentCode,
      hostname: host.hostname,
      domainType,
      isPrimary,
    },
  };
}

function organizationMatches(existing, requested) {
  if (!existing) return false;
  if (String(existing.status) !== "active") return false;
  if (existing.organization_key !== requested.organizationKey) return false;
  if (String(existing.display_name) !== requested.displayName) return false;
  if (String(existing.data_environment) !== requested.dataEnvironment) return false;
  const existingLegal = existing.legal_name == null ? null : String(existing.legal_name);
  if (existingLegal !== requested.legalName) return false;
  return true;
}

function enrolmentMatches(existing, requested, organizationId, productId) {
  if (!existing) return false;
  if (String(existing.status) !== "active") return false;
  if (String(existing.organization_id) !== String(organizationId)) return false;
  if (String(existing.product_id) !== String(productId)) return false;
  if (String(existing.product_tenant_key) !== requested.productTenantKey) return false;
  return true;
}

function domainMatches(existing, requested, organizationId, productId) {
  if (!existing) return false;
  if (String(existing.status) !== "active") return false;
  if (String(existing.hostname) !== requested.hostname) return false;
  if (String(existing.organization_id) !== String(organizationId)) return false;
  if (String(existing.product_id) !== String(productId)) return false;
  if (String(existing.deployment_id) !== requested.deploymentCode) return false;
  if (String(existing.domain_type) !== requested.domainType) return false;
  if (Boolean(existing.is_primary) !== Boolean(requested.isPrimary)) return false;
  return true;
}

function mapRecords(org, enrolment, domain, product, deployment) {
  return {
    organization: {
      id: org.id,
      key: org.organization_key,
      displayName: org.display_name,
      legalName: org.legal_name,
      status: org.status,
      dataEnvironment: org.data_environment,
    },
    enrolment: {
      id: enrolment.id,
      status: enrolment.status,
      productTenantKey: enrolment.product_tenant_key,
    },
    domain: {
      id: domain.id,
      hostname: domain.hostname,
      domainType: domain.domain_type,
      status: domain.status,
      isPrimary: Boolean(domain.is_primary),
      deploymentCode: domain.deployment_id,
    },
    product: {
      id: product.id,
      key: product.product_key,
      status: product.status,
    },
    deployment: {
      code: deployment.deployment_code,
      status: deployment.status,
    },
  };
}

/**
 * @param {{ connect?: Function, query?: Function }} db — Pool (preferred) or Client
 * @param {object} input
 */
async function provisionPlatformTenant(db, input) {
  const validated = validateAndNormalizeInput(input);
  if (!validated.ok) {
    return fail(STATUS.INVALID_INPUT, `invalid_input:${validated.reason}`);
  }
  const req = validated.value;

  if (!db || (typeof db.connect !== "function" && typeof db.query !== "function")) {
    return fail(STATUS.TRANSACTION_ERROR, "database client or pool required");
  }

  let client = null;
  let owned = false;
  try {
    if (typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }

    await client.query("BEGIN");

    const product = await repo.findProductByKey(client, req.productKey);
    if (!product) {
      await client.query("ROLLBACK");
      return fail(STATUS.PRODUCT_NOT_FOUND, "product_not_found");
    }
    if (product.status !== "active") {
      await client.query("ROLLBACK");
      return fail(STATUS.INACTIVE_PRODUCT, "inactive_product");
    }

    const deployment = await repo.findDeploymentByCode(client, req.deploymentCode);
    if (!deployment) {
      await client.query("ROLLBACK");
      return fail(STATUS.DEPLOYMENT_NOT_FOUND, "deployment_not_found");
    }
    if (deployment.status !== "active") {
      await client.query("ROLLBACK");
      return fail(STATUS.INACTIVE_DEPLOYMENT, "inactive_deployment");
    }

    const created = { organization: false, enrolment: false, domain: false };

    let organization = await repo.findOrganizationByKey(client, req.organizationKey);
    if (organization) {
      if (!organizationMatches(organization, req)) {
        await client.query("ROLLBACK");
        return fail(STATUS.ORGANIZATION_CONFLICT, "organization_conflict");
      }
    } else {
      try {
        organization = await repo.insertOrganization(client, req);
        created.organization = true;
      } catch (err) {
        if (!repo.isUniqueViolation(err)) {
          await client.query("ROLLBACK");
          return fail(STATUS.TRANSACTION_ERROR, "organization_insert_failed");
        }
        organization = await repo.findOrganizationByKey(client, req.organizationKey);
        if (!organizationMatches(organization, req)) {
          await client.query("ROLLBACK");
          return fail(STATUS.ORGANIZATION_CONFLICT, "organization_conflict");
        }
      }
    }

    // Default Free plan subscription (no billing). Never deletes existing resources on later plan changes.
    if (req.productKey === "blessboard") {
      const entitlementRepo = require("../repositories/entitlementRepository");
      const existingSub = await entitlementRepo.findCurrentSubscription(
        client,
        organization.id,
        "blessboard",
        new Date().toISOString()
      );
      if (!existingSub) {
        const { assignOrganizationPlan } = require("./entitlementService");
        await assignOrganizationPlan(client, {
          organizationId: organization.id,
          productKey: "blessboard",
          planKey: "free",
        });
      }
    }

    const byTenantKey = await repo.findEnrolmentByProductTenantKey(
      client,
      product.id,
      req.productTenantKey
    );
    if (byTenantKey && String(byTenantKey.organization_id) !== String(organization.id)) {
      await client.query("ROLLBACK");
      return fail(STATUS.ENROLMENT_CONFLICT, "enrolment_conflict");
    }

    let enrolment = await repo.findEnrolmentByOrgProduct(client, organization.id, product.id);
    if (enrolment) {
      if (!enrolmentMatches(enrolment, req, organization.id, product.id)) {
        await client.query("ROLLBACK");
        return fail(STATUS.ENROLMENT_CONFLICT, "enrolment_conflict");
      }
    } else {
      try {
        enrolment = await repo.insertEnrolment(client, {
          organizationId: organization.id,
          productId: product.id,
          productTenantKey: req.productTenantKey,
        });
        created.enrolment = true;
      } catch (err) {
        if (!repo.isUniqueViolation(err)) {
          await client.query("ROLLBACK");
          return fail(STATUS.TRANSACTION_ERROR, "enrolment_insert_failed");
        }
        enrolment = await repo.findEnrolmentByOrgProduct(client, organization.id, product.id);
        if (!enrolment) {
          enrolment = await repo.findEnrolmentByProductTenantKey(
            client,
            product.id,
            req.productTenantKey
          );
        }
        if (!enrolmentMatches(enrolment, req, organization.id, product.id)) {
          await client.query("ROLLBACK");
          return fail(STATUS.ENROLMENT_CONFLICT, "enrolment_conflict");
        }
      }
    }

    let domain = await repo.findDomainByHostname(client, req.hostname);
    if (domain) {
      if (!domainMatches(domain, req, organization.id, product.id)) {
        await client.query("ROLLBACK");
        return fail(STATUS.HOSTNAME_CONFLICT, "hostname_conflict");
      }
    } else {
      if (req.domainType === "custom" && req.productKey === "blessboard") {
        const { assertFeature } = require("./entitlementService");
        const domainGate = await assertFeature(client, {
          organizationId: organization.id,
          productKey: "blessboard",
          featureKey: "custom_domain",
        });
        if (!domainGate.ok) {
          await client.query("ROLLBACK");
          return fail(STATUS.INVALID_INPUT, "custom_domain_not_entitled");
        }
      }
      try {
        domain = await repo.insertDomain(client, {
          organizationId: organization.id,
          productId: product.id,
          deploymentCode: req.deploymentCode,
          hostname: req.hostname,
          domainType: req.domainType,
          isPrimary: req.isPrimary,
        });
        created.domain = true;
      } catch (err) {
        if (!repo.isUniqueViolation(err)) {
          await client.query("ROLLBACK");
          return fail(STATUS.TRANSACTION_ERROR, "domain_insert_failed");
        }
        domain = await repo.findDomainByHostname(client, req.hostname);
        if (!domainMatches(domain, req, organization.id, product.id)) {
          await client.query("ROLLBACK");
          return fail(STATUS.HOSTNAME_CONFLICT, "hostname_conflict");
        }
      }
    }

    await client.query("COMMIT");

    const anyCreated = created.organization || created.enrolment || created.domain;
    return success(
      anyCreated ? STATUS.PROVISIONED : STATUS.ALREADY_PROVISIONED,
      created,
      mapRecords(organization, enrolment, domain, product, deployment)
    );
  } catch (err) {
    try {
      if (client) await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    return fail(STATUS.TRANSACTION_ERROR, "transaction_error");
  } finally {
    if (owned && client && typeof client.release === "function") {
      client.release();
    }
  }
}

module.exports = {
  STATUS,
  validateAndNormalizeInput,
  provisionPlatformTenant,
};
