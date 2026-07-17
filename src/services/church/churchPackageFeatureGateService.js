"use strict";

/**
 * Package feature UI gates + mutation enforcement (backend of truth).
 * Do not treat EJS visibility as the only control — use assertFeatureAllowed / middleware.
 */

const { getPgPool } = require("../../db/pg");
const { getOrganisationPlan, hasEntitlement } = require("./churchEntitlementService");
const {
  resolveFeatureUi,
  listNavFeatureGates,
  getFeatureById,
  PACKAGE_FEATURES,
} = require("../../church/blessBoardPackageFeatures");
const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");

const PACKAGE_FEATURE_DENIED = "PACKAGE_FEATURE_DENIED";

function organisationIdFromReq(req) {
  const org = req.churchContext && req.churchContext.organization;
  return org && org.id ? Number(org.id) : null;
}

async function loadPlanForReq(req) {
  const organizationId = organisationIdFromReq(req);
  if (!organizationId) return null;
  if (
    req.churchPackagePlan &&
    Number(req.churchPackagePlan.organizationId) === Number(organizationId)
  ) {
    return req.churchPackagePlan;
  }
  const pool = getPgPool();
  const plan = await getOrganisationPlan(pool, organizationId);
  req.churchPackagePlan = plan;
  return plan;
}

/**
 * Request-scoped plan context (one resolve + one usage snapshot per HTTP request).
 * @param {import("express").Request} req
 * @param {{ reconcileStorage?: boolean, at?: Date }} [opts]
 */
async function loadPlanContextForReq(req, opts = {}) {
  const organizationId = organisationIdFromReq(req);
  if (!organizationId) return null;
  if (
    req.churchPlanContext &&
    Number(req._churchPlanContextOrgId) === Number(organizationId) &&
    !opts.force
  ) {
    return req.churchPlanContext;
  }
  const churchPlanService = require("./churchPlanService");
  const pool = getPgPool();
  return churchPlanService.loadPlanContextForOrganization(pool, organizationId, {
    ...opts,
    req,
    plan: req.churchPackagePlan,
  });
}

/**
 * @param {object | null} plan
 * @param {string} featureId
 */
function assertFeatureAllowed(plan, featureId) {
  const ui = resolveFeatureUi(plan, featureId);
  if (ui.state === "available") return ui;
  const err = Object.assign(new Error(`${ui.feature.name} is not included in ${ui.packageLabel}.`), {
    code: PACKAGE_FEATURE_DENIED,
    featureId,
    entitlementKey: ui.entitlementKey,
    state: ui.state,
    packageCode: ui.packageCode,
    requiredPackageLabel: ui.requiredPackageLabel,
    ui,
  });
  throw err;
}

async function recordFeatureDeniedAudit(req, ui, detail) {
  try {
    const pool = getPgPool();
    const org = req.churchContext && req.churchContext.organization;
    const branch = req.churchContext && req.churchContext.branch;
    if (!org) return;
    await auditLogsRepo.insertAuditLog(pool, {
      organization_id: org.id,
      branch_id: branch ? branch.id : null,
      actor_type: req.churchHqAdmin
        ? "hq_admin"
        : req.churchBranchAdmin
          ? "branch_admin"
          : "system",
      actor_id:
        (req.churchHqAdmin && req.churchHqAdmin.hq_admin_id) ||
        (req.churchBranchAdmin && req.churchBranchAdmin.admin_id) ||
        null,
      action: "package_feature_denied",
      entity_type: "package_feature",
      entity_id: org.id,
      target_label: ui.feature.name,
      metadata_json: {
        feature_id: ui.feature.id,
        entitlement_key: ui.entitlementKey,
        package_code: ui.packageCode,
        required_package: ui.requiredPackageLabel,
        method: req.method,
        path: req.path,
        ...(detail || {}),
      },
    });
  } catch {
    /* audit must not break denial response */
  }
}

/**
 * Attach packageFeatureNav (+ packagePlan) for authorised portal locals builders.
 */
async function attachPackageFeatureLocals(req, portal) {
  const plan = req.churchPackagePlan || (await loadPlanForReq(req));
  req.churchPackagePlan = plan;
  if (plan && req.res && req.res.locals) {
    req.res.locals.churchPackagePlan = plan;
  }
  return {
    packagePlan: plan,
    packageFeatureNav: listNavFeatureGates(plan, portal),
    packageFeaturesById: Object.fromEntries(
      PACKAGE_FEATURES.filter((f) => f.portal === portal).map((f) => [f.id, resolveFeatureUi(plan, f)])
    ),
  };
}

/**
 * Middleware: load plan once on req.churchPackagePlan (+ res.locals).
 */
function loadChurchPackagePlan(req, res, next) {
  loadPlanForReq(req)
    .then((plan) => {
      if (plan) {
        req.churchPackagePlan = plan;
        res.locals.churchPackagePlan = plan;
      }
      next();
    })
    .catch(next);
}

/**
 * Enforce entitlement for a feature id. GET upgrade/hidden → render shells via next handler flag;
 * mutations → 403 JSON/text.
 *
 * Prefer wrapping with renderPackageFeaturePage for GET discovery routes.
 */
function requirePackageFeature(featureId, opts = {}) {
  const allowGetUpgradeShell = opts.allowGetUpgradeShell !== false;
  return async function packageFeatureMiddleware(req, res, next) {
    try {
      const plan = req.churchPackagePlan || (await loadPlanForReq(req));
      req.churchPackagePlan = plan;
      if (res.locals) res.locals.churchPackagePlan = plan;
      const ui = resolveFeatureUi(plan, featureId);
      req.packageFeatureUi = ui;

      if (ui.state === "available") {
        const orgId = organisationIdFromReq(req);
        const pilotKey =
          require("../../church/blessBoardPilotFeatureFlags").PACKAGE_FEATURE_TO_PILOT_FLAG[
            featureId
          ];
        if (pilotKey && orgId) {
          const churchPilotFeatureFlagService = require("./churchPilotFeatureFlagService");
          const pilot = await churchPilotFeatureFlagService.isPilotFeatureAvailable(getPgPool(), {
            organizationId: orgId,
            flagKey: pilotKey,
            plan,
          });
          if (!pilot.available) {
            const blockedUi = {
              ...ui,
              state: "upgrade",
              pilotBlocked: true,
              pilotReason: pilot.reason,
              pilotSource: pilot.source,
            };
            req.packageFeatureUi = blockedUi;
            const method = String(req.method || "GET").toUpperCase();
            if (method !== "GET" && method !== "HEAD") {
              await recordFeatureDeniedAudit(req, blockedUi, {
                reason: "pilot_flag_blocked",
                pilot_source: pilot.source,
              });
              if (opts.onDenied) return opts.onDenied(req, res, blockedUi);
              const { renderChurchFailureState } = require("../../church/churchFailureStates");
              return renderChurchFailureState(req, res, "package_restricted", {
                message:
                  pilot.reason ||
                  `${ui.feature.name} is not enabled for this organisation (pilot flag).`,
              });
            }
            req.packageFeatureGate = blockedUi;
            return next();
          }
        }
        return next();
      }

      const method = String(req.method || "GET").toUpperCase();
      if (method !== "GET" && method !== "HEAD") {
        await recordFeatureDeniedAudit(req, ui, { reason: "mutation_blocked" });
        if (opts.onDenied) return opts.onDenied(req, res, ui);
        const { renderChurchFailureState } = require("../../church/churchFailureStates");
        return renderChurchFailureState(req, res, "package_restricted", {
          message: `${ui.feature.name} requires ${ui.requiredPackageLabel}. Current package: ${ui.packageLabel}.`,
        });
      }

      if (ui.state === "hidden" && !allowGetUpgradeShell) {
        await recordFeatureDeniedAudit(req, ui, { reason: "hidden_get" });
        return res.status(404).type("text").send("Not found.");
      }

      // GET: let route render upgrade/hidden shell (never blank 500).
      req.packageFeatureGate = ui;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * Block scheduled broadcast mutations when broadcasts.scheduled is missing.
 * Call when publish_at is a future (or any non-null schedule) datetime.
 */
async function assertScheduledBroadcastAllowed(req, publishAt) {
  if (publishAt == null || publishAt === "") return;
  const when = publishAt instanceof Date ? publishAt : new Date(publishAt);
  if (Number.isNaN(when.getTime())) return;
  // Treat any explicit schedule (including "now" via picker) as scheduled publish path:
  // only block when publish_at is in the future (> 2 minutes).
  if (when.getTime() <= Date.now() + 2 * 60 * 1000) return;

  const plan = req.churchPackagePlan || (await loadPlanForReq(req));
  req.churchPackagePlan = plan;
  if (!hasEntitlement(plan, "broadcasts.scheduled")) {
    const ui = resolveFeatureUi(plan, "broadcasts_scheduled");
    await recordFeatureDeniedAudit(req, ui, { reason: "scheduled_broadcast", publish_at: when.toISOString() });
    throw Object.assign(
      new Error(
        `Scheduled broadcasts require ${ui.requiredPackageLabel}. Current package: ${ui.packageLabel}. Publish immediately, or upgrade.`
      ),
      { code: PACKAGE_FEATURE_DENIED, featureId: "broadcasts_scheduled", ui }
    );
  }

  const orgId = organisationIdFromReq(req);
  if (orgId) {
    const churchPilotFeatureFlagService = require("./churchPilotFeatureFlagService");
    await churchPilotFeatureFlagService.assertPilotFeatureAvailable(getPgPool(), {
      organizationId: orgId,
      flagKey: "broadcasts_scheduled",
      plan,
    });
  }
}

module.exports = {
  PACKAGE_FEATURE_DENIED,
  loadPlanForReq,
  loadPlanContextForReq,
  loadChurchPackagePlan,
  assertFeatureAllowed,
  requirePackageFeature,
  attachPackageFeatureLocals,
  resolveFeatureUi,
  listNavFeatureGates,
  getFeatureById,
  assertScheduledBroadcastAllowed,
  recordFeatureDeniedAudit,
};
