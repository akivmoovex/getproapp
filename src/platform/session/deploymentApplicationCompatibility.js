"use strict";

/**
 * Deployment application_code vs product isolation.
 *
 * Unified V7 deployments use application_code=platform and select the product
 * from the request hostname. Product-specific deployments still bind
 * application_code to one product (legacy / Topology B).
 *
 * Session principal type is not the same as product entitlement:
 * - platform_identity → ActiveClinic principal
 * - blessboard_user / linked → BlessBoard principal
 * ActiveClinic access is still enforced by eligibility (staff, org, product).
 */

function normalizeApplicationCode(code) {
  return String(code || "")
    .trim()
    .toLowerCase();
}

function isUnifiedPlatformApplication(code) {
  return normalizeApplicationCode(code) === "platform";
}

/**
 * ActiveClinic platform-identity sessions may live on product-specific
 * ActiveClinic deployments or on the unified platform deployment.
 */
function deploymentAllowsPlatformIdentityPrincipal(applicationCode) {
  const code = normalizeApplicationCode(applicationCode);
  return code === "activeclinic" || code === "platform";
}

/**
 * BlessBoard user/linked sessions are forbidden only on product-specific
 * ActiveClinic deployments.
 */
function deploymentAllowsBlessBoardPrincipal(applicationCode) {
  return normalizeApplicationCode(applicationCode) !== "activeclinic";
}

/**
 * expectedProduct (caller) vs deployments.application_code.
 * Unified platform deployments are compatible with any hostname-resolved product.
 */
function deploymentMatchesExpectedProduct(deploymentApplicationCode, expectedProductCode) {
  const deployment = normalizeApplicationCode(deploymentApplicationCode);
  const expected = normalizeApplicationCode(expectedProductCode);
  if (!expected || !deployment) return true;
  if (deployment === "platform") return true;
  return deployment === expected;
}

/**
 * Product the current request is serving. Hostname wins on unified runtimes;
 * product-specific deployments fall back to the profile productCode.
 */
function resolveSessionExpectedProductCode(req, env) {
  if (req && req.platform && req.platform.productKey) {
    const fromHost = normalizeApplicationCode(req.platform.productKey);
    if (fromHost && fromHost !== "platform") return fromHost;
  }
  try {
    const {
      resolveDeploymentConfiguration,
    } = require("../config/deploymentProfiles");
    const deployment = resolveDeploymentConfiguration(env || process.env);
    const code = normalizeApplicationCode(deployment && deployment.productCode);
    if (code && code !== "platform") return code;
  } catch {
    /* ignore unresolved profiles */
  }
  return null;
}

module.exports = {
  normalizeApplicationCode,
  isUnifiedPlatformApplication,
  deploymentAllowsPlatformIdentityPrincipal,
  deploymentAllowsBlessBoardPrincipal,
  deploymentMatchesExpectedProduct,
  resolveSessionExpectedProductCode,
};
