"use strict";

/**
 * Read-only platform-admin deployment detail + safe diagnostics.
 * Uses only catalogue fields already exposed by V5 — never secret values,
 * connection strings, cookie-identity columns, one-time auth material, or hashes.
 */

const repo = require("../repositories/platformAdminRepository");
const {
  DEPLOYMENT_CODE_PATTERN,
  getPlatformDeploymentCode,
} = require("../config/platformDeploymentCode");
const { presentDeployment } = require("./listPlatformDeployments");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  LOOKUP_ERROR: "lookup_error",
});

const DIAG_PASS = "pass";
const DIAG_FAIL = "fail";
const DIAG_UNAVAILABLE = "unavailable";

/**
 * @param {object} row
 */
function presentDomain(row) {
  if (!row) return null;
  return {
    hostname: String(row.hostname || ""),
    domainType: String(row.domain_type || ""),
    status: String(row.status || ""),
    isPrimary: Boolean(row.is_primary),
    isVerified: Boolean(row.is_verified),
    deploymentCode: String(row.deployment_code || ""),
    productKey: String(row.product_key || ""),
    productDisplayName: String(row.product_display_name || ""),
    organizationKey: row.organization_key != null ? String(row.organization_key) : null,
    organizationDisplayName:
      row.organization_display_name != null ? String(row.organization_display_name) : null,
  };
}

/**
 * @param {string} key
 * @param {string} label
 * @param {'pass'|'fail'|'unavailable'} state
 * @param {string} detail
 */
function diagnostic(key, label, state, detail) {
  return { key, label, state, detail };
}

/**
 * Pass/fail only from live catalogue + runtime identity. Everything else unavailable.
 * @param {{
 *   deployment: object,
 *   domains: object[],
 *   product: object | null,
 *   currentDeploymentCode: string | null,
 *   identityStatus: string | null,
 * }} input
 */
function buildSafeDiagnostics(input) {
  const dep = input.deployment;
  const domains = input.domains || [];
  const product = input.product;
  const current = input.currentDeploymentCode;
  const identityStatus = input.identityStatus;
  const checks = [];

  const canonical = String(dep.canonicalDomain || "").trim();
  checks.push(
    diagnostic(
      "canonical_host",
      "Canonical host",
      canonical ? DIAG_PASS : DIAG_FAIL,
      canonical ? "Canonical domain is registered on this deployment." : "Canonical domain is missing."
    )
  );

  const statusKey = String(dep.status || "").toLowerCase();
  checks.push(
    diagnostic(
      "deployment_status",
      "Deployment status",
      statusKey === "active" ? DIAG_PASS : DIAG_FAIL,
      statusKey === "active"
        ? "Status is Active in the registry."
        : `Status is ${dep.status || "unknown"} (not Active).`
    )
  );

  const appCode = String(dep.applicationCode || "").trim().toLowerCase();
  if (!appCode) {
    checks.push(
      diagnostic("product_link", "Product link", DIAG_FAIL, "Application product code is missing.")
    );
  } else if (product && product.productKey) {
    checks.push(
      diagnostic(
        "product_link",
        "Product link",
        DIAG_PASS,
        `Linked to ${product.displayName || product.productKey}.`
      )
    );
  } else {
    checks.push(
      diagnostic(
        "product_link",
        "Product link",
        DIAG_FAIL,
        `No platform.products row for application code “${appCode}”.`
      )
    );
  }

  checks.push(
    diagnostic(
      "domains_registered",
      "Domains registered",
      domains.length > 0 ? DIAG_PASS : DIAG_FAIL,
      domains.length > 0
        ? `${domains.length} hostname${domains.length === 1 ? "" : "s"} on this deployment.`
        : "No hostnames are registered for this deployment."
    )
  );

  if (!current || identityStatus !== "ok") {
    checks.push(
      diagnostic(
        "runtime_identity",
        "Runtime identity",
        DIAG_UNAVAILABLE,
        "This process has no valid PLATFORM_DEPLOYMENT_CODE for comparison."
      )
    );
  } else if (current === dep.deploymentCode) {
    checks.push(
      diagnostic(
        "runtime_identity",
        "Runtime identity",
        DIAG_PASS,
        "This registry row matches PLATFORM_DEPLOYMENT_CODE for this process."
      )
    );
  } else {
    checks.push(
      diagnostic(
        "runtime_identity",
        "Runtime identity",
        DIAG_UNAVAILABLE,
        "This row is not the current process; identity match applies only to this process."
      )
    );
  }

  // Supported only as unavailable placeholders — no backend for these in V5 platform-admin.
  checks.push(
    diagnostic("log_access", "Log access", DIAG_UNAVAILABLE, "Log streaming is not available.")
  );
  checks.push(
    diagnostic(
      "env_editing",
      "Environment editing",
      DIAG_UNAVAILABLE,
      "Environment-variable editing is not available."
    )
  );
  checks.push(
    diagnostic(
      "process_control",
      "Process control",
      DIAG_UNAVAILABLE,
      "Deploy, restart, and rollback controls are not available."
    )
  );
  checks.push(
    diagnostic(
      "health_metrics",
      "Health metrics",
      DIAG_UNAVAILABLE,
      "Live infrastructure health meters are not available."
    )
  );

  return checks;
}

/**
 * @param {string} raw
 */
function normalizeDeploymentCode(raw) {
  const code = String(raw || "")
    .trim()
    .toLowerCase();
  if (!code || !DEPLOYMENT_CODE_PATTERN.test(code)) {
    return { ok: false, code: null };
  }
  return { ok: true, code };
}

/**
 * @param {{ query: Function }} db
 * @param {string} deploymentCodeRaw
 * @param {NodeJS.ProcessEnv} [env]
 */
async function getPlatformDeploymentDetail(db, deploymentCodeRaw, env) {
  const normalized = normalizeDeploymentCode(deploymentCodeRaw);
  if (!normalized.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, deployment: null };
  }
  if (!db || typeof db.query !== "function") {
    return { ok: false, status: STATUS.LOOKUP_ERROR, deployment: null };
  }

  try {
    const row = await repo.findDeploymentSafeByCode(db, normalized.code);
    if (!row) {
      return {
        ok: false,
        status: STATUS.NOT_FOUND,
        deployment: null,
        deploymentCode: normalized.code,
      };
    }

    const deployment = presentDeployment(row);
    const domainRows = await repo.listDomainsForDeploymentSafe(db, normalized.code, 100);
    const domains = (domainRows || []).map(presentDomain).filter(Boolean);

    const appCode = String(deployment.applicationCode || "")
      .trim()
      .toLowerCase();
    let product = null;
    if (appCode) {
      const productRow = await repo.findProductSafeByKey(db, appCode);
      if (productRow) {
        product = {
          productKey: String(productRow.product_key || ""),
          displayName: String(productRow.display_name || ""),
          status: String(productRow.status || ""),
          source: "application",
        };
      }
    }

    const productsByKey = new Map();
    if (product) {
      productsByKey.set(product.productKey, product);
    }
    for (const d of domains) {
      const key = String(d.productKey || "").toLowerCase();
      if (!key || productsByKey.has(key)) continue;
      productsByKey.set(key, {
        productKey: key,
        displayName: d.productDisplayName || key,
        status: "",
        source: "domain",
      });
    }
    const products = Array.from(productsByKey.values());

    const identity = getPlatformDeploymentCode(env || process.env);
    const currentDeploymentCode = identity && identity.ok ? identity.code : null;
    const isCurrentProcess = Boolean(
      currentDeploymentCode && currentDeploymentCode === deployment.deploymentCode
    );

    const diagnostics = buildSafeDiagnostics({
      deployment,
      domains,
      product,
      currentDeploymentCode,
      identityStatus: identity ? identity.status : null,
    });

    return {
      ok: true,
      status: STATUS.OK,
      deployment,
      domains,
      products,
      diagnostics,
      currentDeploymentCode,
      isCurrentProcess,
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, deployment: null };
  }
}

module.exports = {
  STATUS,
  DIAG_PASS,
  DIAG_FAIL,
  DIAG_UNAVAILABLE,
  normalizeDeploymentCode,
  buildSafeDiagnostics,
  getPlatformDeploymentDetail,
};
