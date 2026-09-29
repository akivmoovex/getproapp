"use strict";

const { getPgPool } = require("../../db/pg");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchHqAdminSession } = require("../../church/hqAuth");
const { requireChurchBranchHost } = require("./auth");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const { branchAdminLocals } = require("./branchAdminShared");
const { hqAdminLocals } = require("./hqAdminShared");
const churchPlanService = require("../../services/church/churchPlanService");
const {
  PACKAGE_FEATURES,
  resolveFeatureUi,
} = require("../../church/blessBoardPackageFeatures");
const {
  loadPlanForReq,
  requirePackageFeature,
  attachPackageFeatureLocals,
  PACKAGE_FEATURE_DENIED,
} = require("../../services/church/churchPackageFeatureGateService");

function featurePageTitle(ui) {
  return ui && ui.feature ? ui.feature.name : "Package feature";
}

async function renderBranchFeatureGate(req, res, featureId, statusCode) {
  const plan = req.churchPackagePlan || (await loadPlanForReq(req));
  const packageFeatureUi = req.packageFeatureUi || resolveFeatureUi(plan, featureId);
  const pool = getPgPool();
  const org = req.churchContext.organization;
  const planContext =
    req.churchPlanContext ||
    (await churchPlanService.loadPlanContextForOrganization(pool, org.id, { req, plan }));
  const featureLocals = await attachPackageFeatureLocals(req, "branch");
  const code = statusCode || (packageFeatureUi.state === "hidden" ? 404 : 200);
  return res.status(code).render(
    "church/branch-admin/package_feature_gate",
    branchAdminLocals(req, {
      pageTitle: featurePageTitle(packageFeatureUi),
      navActive: packageFeatureUi.feature.navKey || "account",
      shellTitle: packageFeatureUi.feature.name,
      packageFeatureUi,
      planContext,
      ...featureLocals,
    })
  );
}

async function renderHqFeatureGate(req, res, featureId, statusCode) {
  const plan = req.churchPackagePlan || (await loadPlanForReq(req));
  const packageFeatureUi = req.packageFeatureUi || resolveFeatureUi(plan, featureId);
  const pool = getPgPool();
  const org = req.churchContext.organization;
  const planContext =
    req.churchPlanContext ||
    (await churchPlanService.loadPlanContextForOrganization(pool, org.id, { req, plan }));
  const featureLocals = await attachPackageFeatureLocals(req, "hq");
  const code = statusCode || (packageFeatureUi.state === "hidden" ? 404 : 200);
  return res.status(code).render(
    "church/hq/package_feature_gate",
    hqAdminLocals(req, {
      pageTitle: featurePageTitle(packageFeatureUi),
      activeNav: packageFeatureUi.feature.navKey || "account",
      packageFeatureUi,
      planContext,
      ...featureLocals,
    })
  );
}

function registerFeatureRoute(router, feature) {
  const guard = requirePackageFeature(feature.id, { allowGetUpgradeShell: true });
  const middlewares =
    feature.portal === "hq"
      ? [requireChurchBranchHost, requireChurchHqAdminSession, guard]
      : [requireChurchBranchHost, requireChurchBranchAdminSession, guard];

  router.get(feature.path, ...middlewares, async (req, res, next) => {
    try {
      if (feature.portal === "hq") {
        return renderHqFeatureGate(req, res, feature.id);
      }
      return renderBranchFeatureGate(req, res, feature.id);
    } catch (err) {
      return next(err);
    }
  });

  router.post(
    feature.path,
    ...middlewares,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        // Mutations never succeed without entitlement; middleware already 403s when locked.
        if (req.packageFeatureUi && req.packageFeatureUi.state === "available") {
          return res.status(501).type("text").send(`${req.packageFeatureUi.feature.name} action is not enabled yet.`);
        }
        const { renderChurchFailureState } = require("../../church/churchFailureStates");
        return renderChurchFailureState(req, res, "package_restricted", {
          message: "This feature is not included in your package.",
        });
      } catch (err) {
        if (err && err.code === PACKAGE_FEATURE_DENIED) {
          const { renderChurchFailureState } = require("../../church/churchFailureStates");
          return renderChurchFailureState(req, res, "package_restricted", {
            message: err.message,
          });
        }
        return next(err);
      }
    }
  );
}

/** Features with a real workflow registered elsewhere (not stub GET/POST 501). */
const FEATURES_WITH_REAL_ROUTES = new Set([
  "reports_scheduled",
  "broadcasts_scheduled",
  "reports_cross_branch",
  "attendance_offline",
  "attendance_custom_rules",
  "care_automation",
  "appointments_calendar",
  "surveys_custom",
  "groups_management",
  "discipleship_pathways",
  "volunteers_scheduling",
  "events_advanced_logistics",
]);

module.exports = function registerPackageFeatureGateRoutes(router, portal) {
  for (const feature of PACKAGE_FEATURES) {
    if (portal && feature.portal !== portal) continue;
    if (FEATURES_WITH_REAL_ROUTES.has(feature.id)) continue;
    registerFeatureRoute(router, feature);
  }
};

module.exports.renderBranchFeatureGate = renderBranchFeatureGate;
module.exports.renderHqFeatureGate = renderHqFeatureGate;
module.exports.PACKAGE_FEATURES = PACKAGE_FEATURES;
