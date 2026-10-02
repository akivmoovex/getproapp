"use strict";

/**
 * Additive ActiveClinic product/tenant context loader.
 * Sequence: deployment → product → platform org → enrolment → healthcare org (optional).
 * Facility is never resolved globally here.
 */

const {
  resolveDeploymentConfiguration,
} = require("../../platform/config/deploymentProfiles");
const { getProduct } = require("../../platform/config/productRegistry");
const {
  isUnifiedPlatformApplication,
} = require("../../platform/session/deploymentApplicationCompatibility");
const {
  resolveOrganizationForProduct,
  RESULT,
} = require("../../platform/services/organizationProductService");
const {
  getHealthcareOrganizationByOrganizationId,
  requireActiveHealthcareOrganization,
} = require("../services/healthcareOrganizationService");

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   env?: NodeJS.ProcessEnv,
 * }} options
 */
function createLoadActiveClinicProductContext(options) {
  const getPool = options.getPool;
  const env = options.env || process.env;

  return async function loadActiveClinicProductContext(req, res, next) {
    try {
      const deployment = resolveDeploymentConfiguration(env);
      const product = getProduct("activeclinic");

      req.activeClinicContext = {
        deployment: {
          code: deployment.code,
          environment: deployment.environment,
          canonicalDomain: deployment.canonicalDomain,
          sessionCookieName: deployment.sessionCookieName,
          csrfCookieName: deployment.csrfCookieName,
          productCode: deployment.productCode,
        },
        product: product
          ? {
              key: product.productCode,
              displayName: product.displayName,
              routeModule: product.routeModule,
            }
          : null,
        organization: null,
        organizationProduct: null,
        healthcareOrganization: null,
        facility: null,
        environment: deployment.expectedDatabaseEnvironment || deployment.environment,
        resolution: "deployment_only",
      };

      const hostProduct =
        req.platform && req.platform.productKey
          ? String(req.platform.productKey).toLowerCase()
          : "";
      const deploymentProduct = String(deployment.productCode || "").toLowerCase();
      const activeClinicRuntime =
        deploymentProduct === "activeclinic" ||
        isUnifiedPlatformApplication(deploymentProduct) ||
        hostProduct === "activeclinic";
      if (!activeClinicRuntime || (hostProduct && hostProduct !== "activeclinic")) {
        req.activeClinicContext.resolution = "product_mismatch";
        return next();
      }

      const orgKeyRaw =
        (req.query && req.query.organizationKey) ||
        (req.headers && req.headers["x-activeclinic-organization-key"]) ||
        "";
      const organizationKey = String(orgKeyRaw || "")
        .trim()
        .toLowerCase();
      if (!organizationKey) {
        return next();
      }

      const pool = getPool();
      const resolved = await resolveOrganizationForProduct(pool, {
        organizationKey,
        applicationCode: "activeclinic",
        environment: null,
      });

      if (!resolved.ok) {
        req.activeClinicContext.resolution =
          resolved.code === RESULT.INVALID_PRODUCT ? "invalid_product" : "denied";
        return next();
      }

      req.activeClinicContext.organization = resolved.organization;
      req.activeClinicContext.organizationProduct = resolved.organizationProduct;
      req.activeClinicContext.environment = resolved.organization.dataEnvironment;
      req.activeClinicContext.resolution = "tenant_resolved";

      const requireActive =
        String((req.query && req.query.requireActiveHealthcare) || "") === "1";
      const hcoResult = requireActive
        ? await requireActiveHealthcareOrganization(pool, {
            organizationId: resolved.organization.id,
          })
        : await getHealthcareOrganizationByOrganizationId(pool, {
            organizationId: resolved.organization.id,
          });

      if (hcoResult.ok) {
        req.activeClinicContext.healthcareOrganization = {
          id: hcoResult.healthcareOrganization.id,
          publicName: hcoResult.healthcareOrganization.publicName,
          organizationType: hcoResult.healthcareOrganization.organizationType,
          status: hcoResult.healthcareOrganization.status,
          countryCode: hcoResult.healthcareOrganization.countryCode,
          timezone: hcoResult.healthcareOrganization.timezone,
        };
        req.activeClinicContext.resolution = "healthcare_organization_resolved";
      } else if (requireActive) {
        req.activeClinicContext.resolution = "healthcare_organization_denied";
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = {
  createLoadActiveClinicProductContext,
};
