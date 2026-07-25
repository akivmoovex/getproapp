"use strict";

/**
 * Shared HQ helpers for Phase4 website plan entitlement gates.
 */

const { renderV5Ejs } = require("./v5EjsTemplateCache");
const planEntitlementSvc = require("../services/websitePlanEntitlementService");

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {(req: any, res: any, extras: object) => Promise<object>|object} shellLocalsFn
 * @param {object} entitlementResult from assertWebsiteCapability
 * @param {{ featureTitle?: string, featureDescription?: string, returnHref?: string }} [extras]
 */
async function renderWebsiteFeatureLocked(req, res, shellLocalsFn, entitlementResult, extras) {
  const lockKind =
    entitlementResult.lockKind ||
    (entitlementResult.requiredPlanKey === "network" ? "network" : "growth");
  const lockModel = planEntitlementSvc.buildFeatureLockModel({
    lockKind,
    planKey: entitlementResult.planKey,
    featureTitle: extras && extras.featureTitle,
    featureDescription: extras && extras.featureDescription,
    returnHref: (extras && extras.returnHref) || "/hq/website",
  });
  const view =
    lockKind === "network"
      ? "hq/phase4-advanced-website-feature-locked.ejs"
      : "hq/phase4-growth-website-feature-locked.ejs";
  const locals = await shellLocalsFn(req, res, {
    pageTitle: lockModel.screenTitle,
    lockModel,
  });
  const html = renderV5Ejs(view, locals);
  return res.status(200).type("html").send(html);
}

/**
 * @param {() => { query: Function }} getPool
 * @param {object} tenant
 * @param {string} capability
 * @param {object} [env]
 */
async function checkWebsiteCapability(getPool, tenant, capability, env) {
  if (!tenant || !tenant.organization || !tenant.church) {
    return {
      ok: false,
      status: planEntitlementSvc.STATUS.INVALID_INPUT,
      reason: "tenant",
    };
  }
  return planEntitlementSvc.assertWebsiteCapability(getPool(), {
    organizationId: tenant.organization.id,
    churchId: tenant.church.id,
    capability,
    env,
  });
}

module.exports = {
  renderWebsiteFeatureLocked,
  checkWebsiteCapability,
  planEntitlementSvc,
};
