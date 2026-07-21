"use strict";

/**
 * Apex-only platform-admin shell.
 * Dashboard, org directory, plans/entitlements, deployments, settings.
 * Writes limited to plan assign, billing activation (manual external), and entitlement override
 * (CSRF + confirmation). No payment-provider APIs, card collection, DNS automation, or
 * destructive controls.
 */

const express = require("express");
const { renderV5Ejs } = require("../../blessboard/http/v5EjsTemplateCache");
const { createV5AuthLogger } = require("./v5AuthObservability");

const {
  listActiveAuthorizationRoles,
  findUserStatusById,
} = require("../../blessboard/repositories/blessBoardAuthorizationRepository");
const {
  listPlatformOrganizations,
  getPlatformAdminDashboardStats,
  STATUS: LIST_STATUS,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  ALLOWED_LIMITS,
  ALLOWED_PRODUCTS,
  ALLOWED_ONBOARDING,
  ALLOWED_FOLLOW_UP: ORG_FOLLOW_UP_FILTERS,
  ALLOWED_PUBLICATION,
  ALLOWED_PLANS,
} = require("../services/listPlatformOrganizations");
const {
  listPlatformAdminOpsAlerts,
  STATUS: OPS_ALERTS_STATUS,
  DEFAULT_LIMIT: OPS_ALERTS_DEFAULT_LIMIT,
  MAX_LIMIT: OPS_ALERTS_MAX_LIMIT,
  ALLOWED_LIMITS: OPS_ALERTS_ALLOWED_LIMITS,
} = require("../services/platformAdminOpsAlerts");
const {
  getPlatformAdminRegistrationAnalytics,
  STATUS: ANALYTICS_STATUS,
  ALLOWED_ANALYTICS_RANGES,
  DEFAULT_ANALYTICS_RANGE_DAYS,
} = require("../services/platformAdminRegistrationAnalyticsService");
const {
  getPlatformOrganizationSummary,
  STATUS: DETAIL_STATUS,
} = require("../services/getPlatformOrganizationSummary");
const {
  listPlatformPlansCatalogue,
  STATUS: PLANS_STATUS,
} = require("../services/listPlatformPlansCatalogue");
const {
  listPlatformSubscriptions,
  STATUS: SUBSCRIPTIONS_STATUS,
  DEFAULT_LIMIT: SUB_DEFAULT_LIMIT,
  MAX_LIMIT: SUB_MAX_LIMIT,
  ALLOWED_LIMITS: SUB_ALLOWED_LIMITS,
  ALLOWED_STATUSES: SUB_ALLOWED_STATUSES,
} = require("../services/listPlatformSubscriptions");
const {
  listPlatformDomains,
  STATUS: DOMAINS_STATUS,
  DEFAULT_LIMIT: DOMAIN_DEFAULT_LIMIT,
  MAX_LIMIT: DOMAIN_MAX_LIMIT,
  ALLOWED_LIMITS: DOMAIN_ALLOWED_LIMITS,
  ALLOWED_STATUSES: DOMAIN_ALLOWED_STATUSES,
  ALLOWED_DOMAIN_TYPES,
} = require("../services/listPlatformDomains");
const {
  getPlatformDomainDetail,
  updatePlatformDomainStatus,
  assignPlatformDomainOrganization,
  STATUS: DOMAIN_DETAIL_STATUS,
  ALLOWED_STATUSES: DOMAIN_DETAIL_STATUSES,
} = require("../services/platformAdminDomains");
const {
  getPlatformOrganizationEntitlementsView,
  assignOrganizationPlanByKey,
  setOrganizationEntitlementOverrideByKey,
  STATUS: ENTITLEMENTS_ADMIN_STATUS,
} = require("../services/platformAdminEntitlements");
const {
  activatePaidSubscriptionByOrganizationKey,
  STATUS: BILLING_STATUS,
} = require("../services/billingSubscriptionService");
const {
  listPlatformDeployments,
  STATUS: DEPLOY_STATUS,
} = require("../services/listPlatformDeployments");
const {
  getPlatformDeploymentDetail,
  STATUS: DEPLOY_DETAIL_STATUS,
} = require("../services/getPlatformDeploymentDetail");
const {
  listRegistrationApplicationsAdmin,
  getRegistrationApplicationDetail,
  updateRegistrationFollowUpStatus,
  markNetworkValidationComplete,
  assignRegistrationSupport,
  addRegistrationSupportContact,
  rejectRegistrationApplication,
  approveAndProvisionRegistrationApplication,
  linkRegistrationApplicationToOrganization,
  STATUS: REG_APP_STATUS,
  DEFAULT_LIMIT: REG_DEFAULT_LIMIT,
  MAX_LIMIT: REG_MAX_LIMIT,
  ALLOWED_LIMITS: REG_ALLOWED_LIMITS,
  QUEUE_FILTERS,
} = require("../../blessboard/services/registrationApplicationsAdminService");
const {
  getOrganizationOnboardingSummary,
  ONBOARDING_STATUSES,
} = require("../../blessboard/services/organizationOnboardingSummaryService");
const {
  setOrganizationSupportRequested,
  setOrganizationNextFollowUp,
  overrideOrganizationOnboardingStatus,
  updateOrganizationFollowUpStatus,
  assignOrganizationSupport,
  STATUS: ONBOARDING_ADMIN_STATUS,
} = require("../../blessboard/services/organizationOnboardingAdminService");
const registrationAppRepo = require("../../blessboard/repositories/platformChurchRegistrationRepository");
const { formatRoleLabel } = require("../../blessboard/http/renderTenantLandingPage");
const { buildPlatformAdminShellLocals } = require("./platformAdminShellLocals");
const {
  CSRF_FIELD,
  validateCsrf,
} = require("./v5Csrf");
const {
  clearV5SessionCookie,
  readV5SessionCookie,
} = require("../session/v5SessionCookie");
const { revokeV5Session } = require("../session/revokeV5Session");
const { getPlatformDeploymentCode } = require("../config/platformDeploymentCode");
const {
  createGrowthTrialOffer,
  cancelGrowthTrialOffer,
  grantGrowthTrialException,
  getGrowthTrialOfferState,
  STATUS: GROWTH_TRIAL_OFFER_STATUS,
} = require("../services/growthTrialOfferService");
const { isTestingDataMaintenanceAllowed } = require("../config/testingDataMaintenance");
const {
  loadMaintenancePageModel,
  previewTestingDataReset,
  executeTestingDataReset,
  FULL_RESET_CONFIRM_PHRASE,
  CATEGORY_ACTIONS,
  STATUS: MAINT_STATUS,
} = require("../services/testingDataResetService");
const { parseSessionSecret } = require("../config/v5EnvValidation");
const {
  ORGANIZATION_RESERVED_SLUGS,
  BRANCH_HOST_RESERVED_SLUGS,
} = require("../../church/platformProvisioningValidation");

/**
 * @param {string} relativePath
 * @param {object} data
 */
function renderPlatformAdminView(relativePath, data) {
  return renderV5Ejs(relativePath, data);
}

/**
 * @param {import('express').Response} res
 */
function setAdminNoStore(res) {
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {number} status
 * @param {string} message
 */
function sendControlled(req, res, status, message) {
  const safe = escapeHtml(message);
  const wantsHtml = String(req.get("accept") || "").includes("text/html");
  if (!wantsHtml) {
    return res.status(status).type("text").send(String(message == null ? "" : message));
  }
  return res.status(status).type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Platform admin · BlessBoard</title>
  <link rel="stylesheet" href="/blessboard/v5/platform-admin.css?v=31" />
</head>
<body class="bb-pa-body">
  <main class="bb-pa-notice">
    <h1>${status === 401 ? "Sign in required" : status === 404 ? "Not found" : "Unavailable"}</h1>
    <p>${safe}</p>
    <p><a href="/">Home</a>${status === 401 ? ' · <a href="/login">Sign in</a>' : ""}</p>
  </main>
</body>
</html>`);
}

/**
 * @param {import('express').Request} req
 * @returns {{ notice: string | null, error: string | null }}
 */
function readFlash(req) {
  const notice = String((req.query && req.query.notice) || "").trim() || null;
  const error = String((req.query && req.query.error) || "").trim() || null;
  return { notice, error };
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 *   sendUnavailable?: Function,
 * }} deps
 */
function createPlatformAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const isProduction = String(env.NODE_ENV || "") === "production";
  const authLog = createV5AuthLogger({
    log: typeof deps.log === "function" ? deps.log : undefined,
  });
  const router = express.Router();

  function requireApex(req, res, next) {
    if (!isApexHost(req)) {
      if (typeof sendUnavailable === "function") {
        return sendUnavailable(req, res);
      }
      return res.status(503).type("text").send("Unavailable");
    }
    return next();
  }

  async function requirePlatformAdmin(req, res, next) {
    try {
      const session =
        req.v5Session && req.v5Session.authenticated && req.v5Session.session
          ? req.v5Session.session
          : null;
      if (!session) {
        authLog.logAuthEvent(req, "platform_admin_denied", {
          outcome: "denied",
          failureCategory: "unauthenticated",
          cookieHeaderPresent: Boolean(req.headers && req.headers.cookie),
          sessionFound: false,
        });
        const wantsHtml = String(req.get("accept") || "").includes("text/html");
        if (wantsHtml) {
          return res.redirect(
            303,
            `/login?next=${encodeURIComponent(req.originalUrl || "/admin")}`
          );
        }
        return sendControlled(req, res, 401, "Sign-in is required.");
      }

      const pool = getPool();
      if (!pool || typeof pool.query !== "function") {
        authLog.logAuthEvent(req, "platform_admin_unexpected_error", {
          outcome: "error",
          failureCategory: "pool_unavailable",
          sessionFound: true,
        });
        return sendControlled(req, res, 503, "Platform admin is temporarily unavailable.");
      }

      const user = await findUserStatusById(pool, session.userId);
      if (!user || String(user.status) !== "active") {
        authLog.logAuthEvent(req, "platform_admin_denied", {
          outcome: "denied",
          failureCategory: "inactive_user",
          sessionFound: true,
        });
        return sendControlled(req, res, 401, "Sign-in is required.");
      }

      const roles = await listActiveAuthorizationRoles(pool, session.userId);
      const isPlatformAdmin = roles.some((r) => r.roleKey === "platform_admin");
      if (!isPlatformAdmin) {
        authLog.logAuthEvent(req, "platform_admin_denied", {
          outcome: "denied",
          failureCategory: "missing_platform_admin_role",
          sessionFound: true,
          roleKeys: roles,
        });
        return sendControlled(req, res, 403, "You do not have access to platform administration.");
      }

      req.platformAdminContext = {
        authenticated: true,
        authorized: true,
        userId: session.userId,
        displayName: session.user && session.user.displayName ? session.user.displayName : "",
        roleLabel: formatRoleLabel("platform_admin"),
      };
      authLog.logAuthEvent(req, "platform_admin_authorized", {
        outcome: "ok",
        sessionFound: true,
        roleKeys: ["platform_admin"],
      });
      return next();
    } catch (err) {
      authLog.logAuthEvent(req, "platform_admin_unexpected_error", {
        outcome: "error",
        failureCategory: "unexpected",
        sessionFound: Boolean(req.v5Session && req.v5Session.authenticated),
      });
      // eslint-disable-next-line no-console
      console.error("[platform-admin] requirePlatformAdmin unexpected failure", {
        path: String(req.originalUrl || req.path || "").slice(0, 200),
        message: err && err.message ? String(err.message).slice(0, 200) : "unknown",
      });
      return sendControlled(req, res, 503, "Platform admin is temporarily unavailable.");
    }
  }

  function shellLocals(req, res, activeNav, extra) {
    return buildPlatformAdminShellLocals(req, res, {
      env,
      isProduction,
      activeNav,
      pageTitle: extra && extra.pageTitle,
      extra,
    });
  }

  router.get("/admin", requireApex, requirePlatformAdmin, async (req, res) => {
    const startedAt = Date.now();
    const [statsResult, list, alertsResult, analyticsResult] = await Promise.all([
      getPlatformAdminDashboardStats(getPool()),
      listPlatformOrganizations(getPool(), { page: 1, limit: 5 }),
      listPlatformAdminOpsAlerts(getPool(), {
        page: req.query.alerts_page,
        limit: req.query.alerts_limit,
      }),
      getPlatformAdminRegistrationAnalytics(getPool(), {
        analyticsRange: req.query.analytics_range,
      }),
    ]);
    if (analyticsResult.status === ANALYTICS_STATUS.INVALID_INPUT) {
      return sendControlled(req, res, 400, "Invalid analytics date range.");
    }

    // Organization list is required for the dashboard shell. Stats/alerts/analytics
    // soft-degrade so platform-admin authentication is never blocked by optional metrics.
    if (!list.ok && list.status === LIST_STATUS.LOOKUP_ERROR) {
      authLog.logAuthEvent(req, "apex_login_directory_lookup_failed", {
        outcome: "failed",
        failureCategory: "organization_list_lookup",
        operation: "listPlatformOrganizations",
        durationMs: Date.now() - startedAt,
      });
      return sendControlled(req, res, 503, "Organization directory is temporarily unavailable.");
    }

    let directoryWarning = null;
    if (!statsResult.ok && statsResult.status === LIST_STATUS.LOOKUP_ERROR) {
      authLog.logAuthEvent(req, "apex_login_directory_lookup_failed", {
        outcome: "failed",
        failureCategory: "dashboard_stats_lookup",
        operation: "getPlatformAdminDashboardStats",
        pgCode: statsResult.pgCode || null,
        schema: statsResult.schema || null,
        relation: statsResult.relation || null,
        column: statsResult.column || null,
        durationMs: Date.now() - startedAt,
      });
      directoryWarning =
        "Some platform overview metrics are temporarily unavailable. Sign-in and organization management remain available.";
    } else if (
      !alertsResult.ok &&
      alertsResult.status === OPS_ALERTS_STATUS.LOOKUP_ERROR
    ) {
      authLog.logAuthEvent(req, "apex_login_directory_lookup_failed", {
        outcome: "failed",
        failureCategory: "ops_alerts_lookup",
        operation: "listPlatformAdminOpsAlerts",
        durationMs: Date.now() - startedAt,
      });
      directoryWarning =
        "Registration operations alerts are temporarily unavailable. Sign-in and organization management remain available.";
    } else if (
      !analyticsResult.ok &&
      analyticsResult.status === ANALYTICS_STATUS.LOOKUP_ERROR
    ) {
      authLog.logAuthEvent(req, "apex_login_directory_lookup_failed", {
        outcome: "failed",
        failureCategory: "registration_analytics_lookup",
        operation: "getPlatformAdminRegistrationAnalytics",
        durationMs: Date.now() - startedAt,
      });
      directoryWarning =
        "Registration analytics are temporarily unavailable. Sign-in and organization management remain available.";
    }

    const orgTotal =
      (statsResult.stats && statsResult.stats.totalOrganizations) || list.total || 0;
    if (list.ok && Number(orgTotal) === 0) {
      authLog.logAuthEvent(req, "apex_login_directory_empty", {
        outcome: "ok",
        failureCategory: "empty_directory",
        operation: "listPlatformOrganizations",
        durationMs: Date.now() - startedAt,
      });
    }

    const stats = statsResult.stats || {};
    const html = renderPlatformAdminView(
      "platform-admin/dashboard.ejs",
      shellLocals(req, res, "home", {
        pageTitle: "Platform admin",
        directorySample: list.organizations || [],
        directoryWarning,
        totalOrganizations: stats.totalOrganizations || list.total || 0,
        organizationsWithChurch: stats.organizationsWithChurch || 0,
        recentFoundationRegistrations: stats.recentFoundationRegistrations || 0,
        activeGrowthTrials: stats.activeGrowthTrials || 0,
        growthTrialsEndingSoon: stats.growthTrialsEndingSoon || 0,
        growthSubscriptionsInGrace: stats.growthSubscriptionsInGrace || 0,
        registrationsRequiringReview: stats.registrationsRequiringReview || 0,
        pendingNetworkSupportRequests: stats.pendingNetworkSupportRequests || 0,
        newRegistrations7d: stats.newRegistrations7d || 0,
        provisioningFailures: stats.provisioningFailures || 0,
        foundationEligibleForGrowthTrial: stats.foundationEligibleForGrowthTrial || 0,
        growthTrialOffersPending: stats.growthTrialOffersPending || 0,
        foundationOriginActiveTrials: stats.foundationOriginActiveTrials || 0,
        foundationTrialOffersConsumed: stats.foundationTrialOffersConsumed || 0,
        paidGrowthSubscriptions: stats.paidGrowthSubscriptions || 0,
        networkValidationPending: stats.networkValidationPending || 0,
        networkValidationInProgress: stats.networkValidationInProgress || 0,
        networkAwaitingApplicant: stats.networkAwaitingApplicant || 0,
        networkApprovedNotProvisioned: stats.networkApprovedNotProvisioned || 0,
        networkFirstContactOverdue: stats.networkFirstContactOverdue || 0,
        opsAlerts: alertsResult.alerts || [],
        opsAlertsPage: alertsResult.page || 1,
        opsAlertsLimit: alertsResult.limit || OPS_ALERTS_DEFAULT_LIMIT,
        opsAlertsTotal: alertsResult.total || 0,
        opsAlertsTotalPages: alertsResult.totalPages || 0,
        opsAlertsAllowedLimits: OPS_ALERTS_ALLOWED_LIMITS,
        opsAlertsMaxLimit: OPS_ALERTS_MAX_LIMIT,
        registrationAnalytics: analyticsResult.analytics || null,
        analyticsAllowedRanges: ALLOWED_ANALYTICS_RANGES,
        analyticsDefaultRange: DEFAULT_ANALYTICS_RANGE_DAYS,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/admin/account", requireApex, requirePlatformAdmin, (req, res) => {
    const deployment = getPlatformDeploymentCode(env);
    const html = renderPlatformAdminView(
      "platform-admin/account.ejs",
      shellLocals(req, res, "account", {
        pageTitle: "Account",
        deploymentCode: deployment && deployment.ok ? deployment.code : "",
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.post("/admin/logout", requireApex, async (req, res) => {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return res.status(403).type("text").send("Invalid or missing CSRF token.");
    }
    const deployment = getPlatformDeploymentCode(env);
    const rawToken = readV5SessionCookie(req, env);
    try {
      if (deployment.ok && deployment.code && rawToken) {
        await revokeV5Session(getPool(), {
          rawToken,
          deploymentCode: deployment.code,
        });
      }
    } catch {
      /* fail-open clear cookie */
    }
    clearV5SessionCookie(res, { secure: isProduction, env });
    return res.redirect(303, "/login");
  });

  router.get("/admin/organizations", requireApex, requirePlatformAdmin, async (req, res) => {
    setAdminNoStore(res);
    const list = await listPlatformOrganizations(getPool(), {
      page: req.query.page,
      limit: req.query.limit,
      q: req.query.q,
      product: req.query.product,
      onboarding: req.query.onboarding,
      follow_up: req.query.follow_up,
      support_requested: req.query.support_requested,
      publication: req.query.publication,
      plan: req.query.plan,
    });
    if (!list.ok) {
      if (list.status === LIST_STATUS.INVALID_INPUT) {
        return sendControlled(req, res, 400, "Invalid list parameters.");
      }
      return sendControlled(req, res, 503, "Organization directory is temporarily unavailable.");
    }
    const html = renderPlatformAdminView(
      "platform-admin/organizations.ejs",
      shellLocals(req, res, "organizations", {
        pageTitle: "Organizations",
        organizations: list.organizations,
        page: list.page,
        limit: list.limit,
        total: list.total,
        totalPages: list.totalPages,
        keyPrefix: list.keyPrefix || "",
        filters: list.filters || {},
        defaultLimit: DEFAULT_LIMIT,
        maxLimit: MAX_LIMIT,
        allowedLimits: ALLOWED_LIMITS,
        allowedProducts: ALLOWED_PRODUCTS,
        allowedOnboarding: ALLOWED_ONBOARDING,
        allowedFollowUp: ORG_FOLLOW_UP_FILTERS,
        allowedPublication: ALLOWED_PUBLICATION,
        allowedPlans: ALLOWED_PLANS,
        rangeFrom: list.total === 0 ? 0 : (list.page - 1) * list.limit + 1,
        rangeTo: Math.min(list.page * list.limit, list.total),
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get(
    "/admin/registration-applications",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const list = await listRegistrationApplicationsAdmin(getPool(), {
        page: req.query.page,
        limit: req.query.limit,
        q: req.query.q,
        application_status: req.query.application_status,
        provisioning_status: req.query.provisioning_status,
        follow_up_status: req.query.follow_up_status,
        selected_plan: req.query.selected_plan || req.query.plan,
        support_requested: req.query.support_requested,
        requires_review: req.query.requires_review,
        overdue_follow_up: req.query.overdue_follow_up || req.query.overdue,
        queue: req.query.queue,
        linked: req.query.linked,
        from: req.query.from,
        to: req.query.to,
      });
      if (!list.ok) {
        if (list.status === REG_APP_STATUS.INVALID_INPUT) {
          return sendControlled(req, res, 400, "Invalid registration application filters.");
        }
        return sendControlled(
          req,
          res,
          503,
          "Registration applications are temporarily unavailable."
        );
      }
      const html = renderPlatformAdminView(
        "platform-admin/registration-applications.ejs",
        shellLocals(req, res, "registration-applications", {
          pageTitle: "Registration Applications",
          applications: list.applications,
          page: list.page,
          limit: list.limit,
          total: list.total,
          totalPages: list.totalPages,
          filters: list.filters || {},
          queueFilters: list.queueFilters || QUEUE_FILTERS,
          defaultLimit: REG_DEFAULT_LIMIT,
          maxLimit: REG_MAX_LIMIT,
          allowedLimits: REG_ALLOWED_LIMITS,
          allowedPlans: ["foundation", "growth", "network"],
          applicationStatuses: registrationAppRepo.APPLICATION_STATUSES,
          provisioningStatuses: registrationAppRepo.PROVISIONING_STATUSES,
          followUpStatuses: registrationAppRepo.FOLLOW_UP_STATUSES,
          rangeFrom: list.total === 0 ? 0 : (list.page - 1) * list.limit + 1,
          rangeTo: Math.min(list.page * list.limit, list.total),
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  router.get(
    "/admin/registration-applications/:id",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const detail = await getRegistrationApplicationDetail(getPool(), req.params.id, env);
      if (!detail.ok) {
        if (detail.status === REG_APP_STATUS.INVALID_INPUT) {
          return sendControlled(req, res, 400, "Invalid application id.");
        }
        if (detail.status === REG_APP_STATUS.NOT_FOUND) {
          return sendControlled(req, res, 404, "This registration application could not be found.");
        }
        return sendControlled(
          req,
          res,
          503,
          "Registration application detail is temporarily unavailable."
        );
      }
      const flash = readFlash(req);
      let onboardingSummary = null;
      if (detail.application && detail.application.organizationId) {
        const onboard = await getOrganizationOnboardingSummary(getPool(), {
          organizationId: detail.application.organizationId,
        });
        if (onboard.ok && onboard.summary) onboardingSummary = onboard.summary;
      }
      const html = renderPlatformAdminView(
        "platform-admin/registration-application-detail.ejs",
        shellLocals(req, res, "registration-applications", {
          pageTitle: detail.application.churchName || "Registration application",
          application: detail.application,
          contacts: detail.contacts || [],
          auditEvents: detail.auditEvents || [],
          platformAdmins: detail.platformAdmins || [],
          followUpStatuses: detail.followUpStatuses || registrationAppRepo.FOLLOW_UP_STATUSES,
          contactMethods: detail.contactMethods || registrationAppRepo.CONTACT_METHODS,
          contactOutcomes: detail.contactOutcomes || registrationAppRepo.CONTACT_OUTCOMES,
          onboardingSummary,
          notice: flash.notice,
          error: flash.error,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  router.post(
    "/admin/registration-applications/:id/follow-up-status",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const id = String(req.params.id || "");
      const detailPath = `/admin/registration-applications/${encodeURIComponent(id)}`;
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const result = await updateRegistrationFollowUpStatus(getPool(), {
        applicationId: id,
        followUpStatus: req.body && req.body.follow_up_status,
        actorUserId: req.platformAdminContext.userId,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
      });
      if (!result.ok) {
        let error = "follow_up_failed";
        if (result.status === REG_APP_STATUS.INVALID_INPUT) error = "invalid";
        else if (result.status === REG_APP_STATUS.NOT_FOUND) error = "not_found";
        else if (result.status === REG_APP_STATUS.NOT_PROVISIONED) error = "not_provisioned";
        return res.redirect(303, `${detailPath}?error=${error}`);
      }
      return res.redirect(303, `${detailPath}?notice=follow_up_saved`);
    }
  );

  router.post(
    "/admin/registration-applications/:id/assign-support",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const id = String(req.params.id || "");
      const detailPath = `/admin/registration-applications/${encodeURIComponent(id)}`;
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const rawSupport = req.body && req.body.support_user_id;
      const result = await assignRegistrationSupport(getPool(), {
        applicationId: id,
        supportUserId: rawSupport === "" || rawSupport == null ? null : rawSupport,
        actorUserId: req.platformAdminContext.userId,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
      });
      if (!result.ok) {
        let error = "assign_failed";
        if (result.status === REG_APP_STATUS.INVALID_INPUT) error = "invalid";
        else if (result.status === REG_APP_STATUS.NOT_FOUND) error = "not_found";
        else if (result.status === REG_APP_STATUS.NOT_PROVISIONED) error = "not_provisioned";
        else if (result.status === REG_APP_STATUS.FORBIDDEN) error = "not_platform_admin";
        return res.redirect(303, `${detailPath}?error=${error}`);
      }
      return res.redirect(303, `${detailPath}?notice=support_assigned`);
    }
  );

  router.post(
    "/admin/registration-applications/:id/contact",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const id = String(req.params.id || "");
      const detailPath = `/admin/registration-applications/${encodeURIComponent(id)}`;
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const result = await addRegistrationSupportContact(getPool(), {
        applicationId: id,
        actorUserId: req.platformAdminContext.userId,
        contactMethod: req.body && req.body.contact_method,
        outcome: req.body && req.body.outcome,
        note: req.body && req.body.note,
        followUpStatus: req.body && req.body.follow_up_status,
        nextFollowUpAt: req.body && req.body.next_follow_up_at,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
      });
      if (!result.ok) {
        let error = "contact_failed";
        if (result.status === REG_APP_STATUS.INVALID_INPUT) error = "invalid";
        else if (result.status === REG_APP_STATUS.NOT_FOUND) error = "not_found";
        else if (result.status === REG_APP_STATUS.NOT_PROVISIONED) error = "not_provisioned";
        return res.redirect(303, `${detailPath}?error=${error}`);
      }
      return res.redirect(303, `${detailPath}?notice=contact_saved`);
    }
  );

  router.post(
    "/admin/registration-applications/:id/reject",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const id = String(req.params.id || "");
      const detailPath = `/admin/registration-applications/${encodeURIComponent(id)}`;
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf`);
      }
      const result = await rejectRegistrationApplication(getPool(), {
        applicationId: id,
        actorUserId: req.platformAdminContext.userId,
        reason: req.body && req.body.rejection_reason,
        deploymentCode: (() => {
          const deployment = getPlatformDeploymentCode(env);
          return deployment && deployment.ok ? deployment.code : "blessboard-org-v5";
        })(),
      });
      if (!result.ok) {
        let error = "reject_failed";
        if (result.status === REG_APP_STATUS.INVALID_INPUT) error = "invalid";
        else if (result.status === REG_APP_STATUS.NOT_FOUND) error = "not_found";
        else if (result.status === REG_APP_STATUS.NOT_ELIGIBLE) error = "not_eligible";
        return res.redirect(303, `${detailPath}?error=${error}`);
      }
      return res.redirect(303, `${detailPath}?notice=rejected`);
    }
  );

  router.post(
    "/admin/registration-applications/:id/approve",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const id = String(req.params.id || "");
      const detailPath = `/admin/registration-applications/${encodeURIComponent(id)}`;
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const result = await approveAndProvisionRegistrationApplication(getPool(), {
        applicationId: id,
        actorUserId: req.platformAdminContext.userId,
        administratorPassword: req.body && req.body.administrator_password,
        administratorPasswordConfirm: req.body && req.body.administrator_password_confirm,
        organizationKey: req.body && req.body.organization_key,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
        dataEnvironment: "testing",
      });
      if (!result.ok) {
        let error = "approve_failed";
        if (result.status === REG_APP_STATUS.INVALID_INPUT) error = "invalid";
        else if (result.status === REG_APP_STATUS.NOT_FOUND) error = "not_found";
        else if (result.status === REG_APP_STATUS.NOT_ELIGIBLE) {
          error =
            result.message === "network_validation_required"
              ? "network_validation_required"
              : "not_eligible";
        } else if (result.status === REG_APP_STATUS.PROVISION_FAILED) error = "provision_failed";
        return res.redirect(303, `${detailPath}?error=${error}`);
      }
      if (result.alreadyProvisioned) {
        return res.redirect(303, `${detailPath}?notice=already_provisioned`);
      }
      if (result.networkOrganizationCreated) {
        return res.redirect(303, `${detailPath}?notice=network_organization_created`);
      }
      return res.redirect(303, `${detailPath}?notice=approved`);
    }
  );

  router.post(
    "/admin/registration-applications/:id/mark-validation-complete",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const id = String(req.params.id || "");
      const detailPath = `/admin/registration-applications/${encodeURIComponent(id)}`;
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const result = await markNetworkValidationComplete(getPool(), {
        applicationId: id,
        actorUserId: req.platformAdminContext.userId,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
      });
      if (!result.ok) {
        let error = "follow_up_failed";
        if (result.status === REG_APP_STATUS.INVALID_INPUT) error = "invalid";
        else if (result.status === REG_APP_STATUS.NOT_FOUND) error = "not_found";
        else if (result.status === REG_APP_STATUS.NOT_ELIGIBLE) error = "not_eligible";
        else if (result.status === REG_APP_STATUS.NOT_PROVISIONED) error = "not_eligible";
        return res.redirect(303, `${detailPath}?error=${error}`);
      }
      return res.redirect(303, `${detailPath}?notice=validation_complete`);
    }
  );

  router.post(
    "/admin/registration-applications/:id/retry-provision",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const id = String(req.params.id || "");
      const detailPath = `/admin/registration-applications/${encodeURIComponent(id)}`;
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const result = await approveAndProvisionRegistrationApplication(getPool(), {
        applicationId: id,
        actorUserId: req.platformAdminContext.userId,
        administratorPassword: req.body && req.body.administrator_password,
        administratorPasswordConfirm: req.body && req.body.administrator_password_confirm,
        organizationKey: req.body && req.body.organization_key,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
        dataEnvironment: "testing",
      });
      if (!result.ok) {
        let error = "retry_failed";
        if (result.status === REG_APP_STATUS.INVALID_INPUT) error = "invalid";
        else if (result.status === REG_APP_STATUS.NOT_FOUND) error = "not_found";
        else if (result.status === REG_APP_STATUS.NOT_ELIGIBLE) error = "not_eligible";
        else if (result.status === REG_APP_STATUS.PROVISION_FAILED) error = "provision_failed";
        return res.redirect(303, `${detailPath}?error=${error}`);
      }
      if (result.alreadyProvisioned) {
        return res.redirect(303, `${detailPath}?notice=already_provisioned`);
      }
      return res.redirect(303, `${detailPath}?notice=retry_succeeded`);
    }
  );

  router.post(
    "/admin/registration-applications/:id/link-organization",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const id = String(req.params.id || "");
      const detailPath = `/admin/registration-applications/${encodeURIComponent(id)}`;
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const result = await linkRegistrationApplicationToOrganization(getPool(), {
        applicationId: id,
        actorUserId: req.platformAdminContext.userId,
        organizationKey: req.body && req.body.organization_key,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
      });
      if (!result.ok) {
        let error = "link_failed";
        if (result.status === REG_APP_STATUS.INVALID_INPUT) error = "invalid";
        else if (result.status === REG_APP_STATUS.NOT_FOUND) {
          error =
            result.message === "organization_not_found" ? "organization_not_found" : "not_found";
        } else if (result.status === REG_APP_STATUS.NOT_ELIGIBLE) error = "not_eligible";
        return res.redirect(303, `${detailPath}?error=${error}`);
      }
      return res.redirect(303, `${detailPath}?notice=organization_linked`);
    }
  );

  router.get("/admin/plans", requireApex, requirePlatformAdmin, async (req, res) => {
    const catalogue = await listPlatformPlansCatalogue(getPool(), { includeInactive: true });
    if (!catalogue.ok || catalogue.status === PLANS_STATUS.LOOKUP_ERROR) {
      return sendControlled(req, res, 503, "Plan catalogue is temporarily unavailable.");
    }
    const html = renderPlatformAdminView(
      "platform-admin/plans.ejs",
      shellLocals(req, res, "plans", {
        pageTitle: "Plans",
        plans: catalogue.plans || [],
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/admin/subscriptions", requireApex, requirePlatformAdmin, async (req, res) => {
    const list = await listPlatformSubscriptions(getPool(), {
      page: req.query.page,
      limit: req.query.limit,
      q: req.query.q,
      status: req.query.status,
      plan: req.query.plan,
      ending_soon: req.query.ending_soon,
      trial_source: req.query.trial_source,
    });
    if (!list.ok && list.status === SUBSCRIPTIONS_STATUS.LOOKUP_ERROR) {
      return sendControlled(req, res, 503, "Subscription directory is temporarily unavailable.");
    }
    if (!list.ok && list.status === SUBSCRIPTIONS_STATUS.INVALID_INPUT) {
      return sendControlled(req, res, 400, "Invalid subscription directory filters.");
    }
    const html = renderPlatformAdminView(
      "platform-admin/subscriptions.ejs",
      shellLocals(req, res, "subscriptions", {
        pageTitle: "Subscriptions",
        subscriptions: list.subscriptions || [],
        page: list.page,
        limit: list.limit,
        total: list.total,
        totalPages: list.totalPages,
        keyPrefix: list.keyPrefix || "",
        statusFilter: list.statusFilter || "",
        planFilter: list.planFilter || "",
        endingSoon: Boolean(list.endingSoon),
        trialSourceFilter: list.trialSourceFilter || "",
        defaultLimit: SUB_DEFAULT_LIMIT,
        maxLimit: SUB_MAX_LIMIT,
        allowedLimits: SUB_ALLOWED_LIMITS,
        allowedStatuses: SUB_ALLOWED_STATUSES,
        allowedPlans: ["free", "growth", "network"],
        rangeFrom: list.total === 0 ? 0 : (list.page - 1) * list.limit + 1,
        rangeTo: Math.min(list.page * list.limit, list.total),
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/admin/domains", requireApex, requirePlatformAdmin, async (req, res) => {
    const list = await listPlatformDomains(getPool(), {
      page: req.query.page,
      limit: req.query.limit,
      q: req.query.q,
      org: req.query.org,
      status: req.query.status,
      type: req.query.type,
      verified: req.query.verified,
    });
    if (!list.ok && list.status === DOMAINS_STATUS.LOOKUP_ERROR) {
      return sendControlled(req, res, 503, "Domain directory is temporarily unavailable.");
    }
    if (!list.ok && list.status === DOMAINS_STATUS.INVALID_INPUT) {
      return sendControlled(req, res, 400, "Invalid domain directory filters.");
    }
    const html = renderPlatformAdminView(
      "platform-admin/domains.ejs",
      shellLocals(req, res, "domains", {
        pageTitle: "Domains",
        domains: list.domains || [],
        page: list.page,
        limit: list.limit,
        total: list.total,
        totalPages: list.totalPages,
        hostnamePrefix: list.hostnamePrefix || "",
        orgKeyPrefix: list.orgKeyPrefix || "",
        statusFilter: list.statusFilter || "",
        typeFilter: list.typeFilter || "",
        verifiedFilter: list.verifiedFilter || "",
        defaultLimit: DOMAIN_DEFAULT_LIMIT,
        maxLimit: DOMAIN_MAX_LIMIT,
        allowedLimits: DOMAIN_ALLOWED_LIMITS,
        allowedStatuses: DOMAIN_ALLOWED_STATUSES,
        allowedDomainTypes: ALLOWED_DOMAIN_TYPES,
        rangeFrom: list.total === 0 ? 0 : (list.page - 1) * list.limit + 1,
        rangeTo: Math.min(list.page * list.limit, list.total),
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/admin/domains/:hostname", requireApex, requirePlatformAdmin, async (req, res) => {
    const detail = await getPlatformDomainDetail(getPool(), req.params.hostname, env);
    if (!detail.ok) {
      if (detail.status === DOMAIN_DETAIL_STATUS.LOOKUP_ERROR) {
        return sendControlled(req, res, 503, "Domain detail is temporarily unavailable.");
      }
      if (detail.status === DOMAIN_DETAIL_STATUS.INVALID_INPUT) {
        return sendControlled(req, res, 400, "Invalid hostname.");
      }
      return sendControlled(req, res, 404, "This domain could not be found.");
    }
    const flash = readFlash(req);
    const html = renderPlatformAdminView(
      "platform-admin/domain-detail.ejs",
      shellLocals(req, res, "domains", {
        pageTitle: detail.domain.hostname,
        domain: detail.domain,
        allowedStatuses: detail.allowedStatuses || DOMAIN_DETAIL_STATUSES,
        currentDeploymentCode: detail.currentDeploymentCode || "",
        notice: flash.notice,
        error: flash.error,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.post(
    "/admin/domains/:hostname/status",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      const hostname = String(req.params.hostname || "");
      const detailPath = `/admin/domains/${encodeURIComponent(hostname)}`;
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf`);
      }
      const confirmed = String((req.body && req.body.confirm_status) || "") === "1";
      const result = await updatePlatformDomainStatus(getPool(), {
        hostname,
        status: req.body && req.body.status,
        confirmed,
        env,
      });
      if (!result.ok) {
        let error = "status_failed";
        if (result.status === DOMAIN_DETAIL_STATUS.CONFIRMATION_REQUIRED) error = "confirm_required";
        else if (result.status === DOMAIN_DETAIL_STATUS.INVALID_INPUT) error = "invalid";
        else if (result.status === DOMAIN_DETAIL_STATUS.NOT_FOUND) error = "not_found";
        else if (result.status === DOMAIN_DETAIL_STATUS.DEPLOYMENT_MISMATCH) {
          error = "deployment_mismatch";
        }
        return res.redirect(303, `${detailPath}?error=${error}`);
      }
      return res.redirect(303, `${detailPath}?notice=status_saved`);
    }
  );

  router.post(
    "/admin/domains/:hostname/organization",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      const hostname = String(req.params.hostname || "");
      const detailPath = `/admin/domains/${encodeURIComponent(hostname)}`;
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf`);
      }
      const confirmed = String((req.body && req.body.confirm_organization) || "") === "1";
      const result = await assignPlatformDomainOrganization(getPool(), {
        hostname,
        organizationKey: req.body && req.body.organization_key,
        confirmed,
        env,
      });
      if (!result.ok) {
        let error = "organization_failed";
        if (result.status === DOMAIN_DETAIL_STATUS.CONFIRMATION_REQUIRED) error = "confirm_required";
        else if (result.status === DOMAIN_DETAIL_STATUS.INVALID_INPUT) error = "invalid";
        else if (result.status === DOMAIN_DETAIL_STATUS.NOT_FOUND) error = "not_found";
        else if (result.status === DOMAIN_DETAIL_STATUS.FORBIDDEN) error = "not_entitled";
        else if (result.status === DOMAIN_DETAIL_STATUS.DEPLOYMENT_MISMATCH) {
          error = "deployment_mismatch";
        }
        return res.redirect(303, `${detailPath}?error=${error}`);
      }
      return res.redirect(303, `${detailPath}?notice=organization_saved`);
    }
  );

  router.get("/admin/deployments", requireApex, requirePlatformAdmin, async (req, res) => {
    const list = await listPlatformDeployments(getPool(), env);
    if (!list.ok || list.status === DEPLOY_STATUS.LOOKUP_ERROR) {
      return sendControlled(req, res, 503, "Deployment registry is temporarily unavailable.");
    }
    const html = renderPlatformAdminView(
      "platform-admin/deployments.ejs",
      shellLocals(req, res, "deployments", {
        pageTitle: "Deployments",
        deployments: list.deployments || [],
        currentDeploymentCode: list.currentDeploymentCode || "",
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/admin/deployments/:deploymentCode", requireApex, requirePlatformAdmin, async (req, res) => {
    const detail = await getPlatformDeploymentDetail(getPool(), req.params.deploymentCode, env);
    if (!detail.ok) {
      if (detail.status === DEPLOY_DETAIL_STATUS.LOOKUP_ERROR) {
        return sendControlled(req, res, 503, "Deployment detail is temporarily unavailable.");
      }
      if (detail.status === DEPLOY_DETAIL_STATUS.INVALID_INPUT) {
        return sendControlled(req, res, 400, "Invalid deployment code.");
      }
      return sendControlled(req, res, 404, "This deployment could not be found.");
    }
    const html = renderPlatformAdminView(
      "platform-admin/deployment-detail.ejs",
      shellLocals(req, res, "deployments", {
        pageTitle: detail.deployment.deploymentCode,
        deployment: detail.deployment,
        domains: detail.domains || [],
        products: detail.products || [],
        diagnostics: detail.diagnostics || [],
        currentDeploymentCode: detail.currentDeploymentCode || "",
        isCurrentProcess: Boolean(detail.isCurrentProcess),
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/admin/settings", requireApex, requirePlatformAdmin, async (req, res) => {
    const list = await listPlatformDeployments(getPool(), env);
    if (!list.ok || list.status === DEPLOY_STATUS.LOOKUP_ERROR) {
      return sendControlled(req, res, 503, "Platform settings are temporarily unavailable.");
    }
    const current =
      (list.deployments || []).find((d) => d.deploymentCode === list.currentDeploymentCode) ||
      null;
    const orgReserved = Array.from(ORGANIZATION_RESERVED_SLUGS).sort();
    const hostReserved = Array.from(BRANCH_HOST_RESERVED_SLUGS).sort();
    const html = renderPlatformAdminView(
      "platform-admin/settings.ejs",
      shellLocals(req, res, "settings", {
        pageTitle: "Settings",
        currentDeployment: current,
        currentDeploymentCode: list.currentDeploymentCode || "",
        hostnamePattern: current && current.canonicalDomain
          ? `{organization}.${current.canonicalDomain}`
          : "{organization}.blessboard.org",
        organizationReserved: orgReserved,
        hostReserved,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get(
    "/admin/organizations/:organizationKey",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const detail = await getPlatformOrganizationSummary(getPool(), req.params.organizationKey);
      if (!detail.ok) {
        if (detail.status === DETAIL_STATUS.LOOKUP_ERROR) {
          return sendControlled(req, res, 503, "Organization lookup is temporarily unavailable.");
        }
        if (detail.status === DETAIL_STATUS.INVALID_INPUT) {
          return sendControlled(req, res, 404, "This organization could not be found.");
        }
        return sendControlled(req, res, 404, "This organization could not be found.");
      }
      const entitlementsView = await getPlatformOrganizationEntitlementsView(
        getPool(),
        req.params.organizationKey
      );
      if (!entitlementsView.ok && entitlementsView.status === ENTITLEMENTS_ADMIN_STATUS.LOOKUP_ERROR) {
        return sendControlled(req, res, 503, "Entitlements lookup is temporarily unavailable.");
      }
      const flash = readFlash(req);
      let registrationApplicationId = null;
      let onboardingSummary = null;
      let supportContacts = [];
      let platformAdmins = [];
      try {
        const onboard = await getOrganizationOnboardingSummary(getPool(), {
          organizationKey: detail.organization.organizationKey,
        });
        if (onboard.ok && onboard.summary) {
          onboardingSummary = onboard.summary;
          registrationApplicationId = onboard.summary.registrationApplicationId;
          const [contacts, admins] = await Promise.all([
            registrationAppRepo.listOrganizationSupportContacts(
              getPool(),
              onboard.summary.organizationId,
              { limit: 20 }
            ),
            registrationAppRepo.listActivePlatformAdministrators(getPool()),
          ]);
          supportContacts = (contacts || []).map((c) => ({
            id: String(c.id),
            contactMethod: String(c.contact_method),
            outcome: String(c.outcome),
            note: String(c.note || ""),
            contactedAt: c.contacted_at,
            nextFollowUpAt: c.next_follow_up_at,
            createdByDisplayName:
              c.created_by_display_name != null ? String(c.created_by_display_name) : "",
          }));
          platformAdmins = (admins || []).map((u) => ({
            id: String(u.id),
            displayName: String(u.display_name || ""),
            email: String(u.email_normalized || ""),
          }));
        } else if (!registrationApplicationId) {
          registrationApplicationId = await registrationAppRepo.findApplicationIdForOrganizationKey(
            getPool(),
            detail.organization.organizationKey
          );
        }
      } catch {
        registrationApplicationId = null;
        onboardingSummary = null;
      }
      let growthTrial = null;
      try {
        const organizationId = await resolveOrganizationIdByKey(
          getPool(),
          detail.organization.organizationKey
        );
        if (organizationId) {
          const trialState = await getGrowthTrialOfferState(getPool(), organizationId);
          if (trialState.ok) growthTrial = trialState;
        }
      } catch {
        growthTrial = null;
      }
      const html = renderPlatformAdminView(
        "platform-admin/organization-detail.ejs",
        shellLocals(req, res, "organizations", {
          pageTitle: detail.organization.displayName || "Organization",
          organization: detail.organization,
          branches: detail.branches || [],
          entitlements: entitlementsView.entitlements || null,
          usage: entitlementsView.usage || null,
          domains: entitlementsView.domains || [],
          plans: entitlementsView.plans || [],
          featureKeys: entitlementsView.featureKeys || [],
          registrationApplicationId,
          onboardingSummary,
          supportContacts,
          platformAdmins,
          growthTrial,
          followUpStatuses: registrationAppRepo.FOLLOW_UP_STATUSES,
          onboardingStatuses: ONBOARDING_STATUSES,
          notice: flash.notice,
          error: flash.error,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  function orgDetailPath(organizationKey) {
    return `/admin/organizations/${encodeURIComponent(String(organizationKey || "").trim().toLowerCase())}`;
  }

  async function resolveOrganizationIdByKey(pool, organizationKey) {
    const r = await pool.query(
      `SELECT id FROM platform.organizations WHERE organization_key = $1 LIMIT 1`,
      [organizationKey]
    );
    return r.rows[0] ? String(r.rows[0].id) : null;
  }

  router.post(
    "/admin/organizations/:organizationKey/support-requested",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const organizationKey = String(req.params.organizationKey || "")
        .trim()
        .toLowerCase();
      const detailPath = orgDetailPath(organizationKey);
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf#pa-org-onboarding`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const raw = String((req.body && req.body.support_requested) || "").toLowerCase();
      const result = await setOrganizationSupportRequested(getPool(), {
        organizationKey,
        supportRequested: raw === "1" || raw === "true",
        actorUserId: req.platformAdminContext.userId,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
      });
      if (!result.ok) {
        let error = "support_request_failed";
        if (result.status === ONBOARDING_ADMIN_STATUS.INVALID_INPUT) error = "invalid";
        else if (result.status === ONBOARDING_ADMIN_STATUS.NOT_FOUND) error = "not_found";
        else if (result.status === ONBOARDING_ADMIN_STATUS.NOT_BLESSBOARD) error = "not_blessboard";
        return res.redirect(303, `${detailPath}?error=${error}#pa-org-onboarding`);
      }
      return res.redirect(303, `${detailPath}?notice=support_request_saved#pa-org-onboarding`);
    }
  );

  router.post(
    "/admin/organizations/:organizationKey/next-follow-up",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const organizationKey = String(req.params.organizationKey || "")
        .trim()
        .toLowerCase();
      const detailPath = orgDetailPath(organizationKey);
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf#pa-org-onboarding`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const clear = String((req.body && req.body.clear_next_follow_up) || "") === "1";
      const result = await setOrganizationNextFollowUp(getPool(), {
        organizationKey,
        nextFollowUpAt: clear ? null : req.body && req.body.next_follow_up_at,
        clear,
        actorUserId: req.platformAdminContext.userId,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
      });
      if (!result.ok) {
        let error = "follow_up_schedule_failed";
        if (result.status === ONBOARDING_ADMIN_STATUS.INVALID_INPUT) {
          error =
            result.message === "next_follow_up_must_be_future"
              ? "next_follow_up_past"
              : "invalid";
        } else if (result.status === ONBOARDING_ADMIN_STATUS.NOT_FOUND) error = "not_found";
        else if (result.status === ONBOARDING_ADMIN_STATUS.NOT_BLESSBOARD) error = "not_blessboard";
        return res.redirect(303, `${detailPath}?error=${error}#pa-org-onboarding`);
      }
      return res.redirect(303, `${detailPath}?notice=next_follow_up_saved#pa-org-onboarding`);
    }
  );

  router.post(
    "/admin/organizations/:organizationKey/follow-up-status",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const organizationKey = String(req.params.organizationKey || "")
        .trim()
        .toLowerCase();
      const detailPath = orgDetailPath(organizationKey);
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf#pa-org-onboarding`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const result = await updateOrganizationFollowUpStatus(getPool(), {
        organizationKey,
        followUpStatus: req.body && req.body.follow_up_status,
        actorUserId: req.platformAdminContext.userId,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
      });
      if (!result.ok) {
        let error = "follow_up_failed";
        if (result.status === ONBOARDING_ADMIN_STATUS.INVALID_INPUT) error = "invalid";
        else if (result.status === ONBOARDING_ADMIN_STATUS.NOT_FOUND) error = "not_found";
        else if (result.status === ONBOARDING_ADMIN_STATUS.NOT_BLESSBOARD) error = "not_blessboard";
        return res.redirect(303, `${detailPath}?error=${error}#pa-org-onboarding`);
      }
      return res.redirect(303, `${detailPath}?notice=follow_up_saved#pa-org-onboarding`);
    }
  );

  router.post(
    "/admin/organizations/:organizationKey/assign-support",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const organizationKey = String(req.params.organizationKey || "")
        .trim()
        .toLowerCase();
      const detailPath = orgDetailPath(organizationKey);
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf#pa-org-onboarding`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const rawSupport = req.body && req.body.support_user_id;
      const result = await assignOrganizationSupport(getPool(), {
        organizationKey,
        supportUserId: rawSupport === "" || rawSupport == null ? null : rawSupport,
        actorUserId: req.platformAdminContext.userId,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
      });
      if (!result.ok) {
        let error = "assign_failed";
        if (result.status === ONBOARDING_ADMIN_STATUS.INVALID_INPUT) error = "invalid";
        else if (result.status === ONBOARDING_ADMIN_STATUS.NOT_FOUND) error = "not_found";
        else if (result.status === ONBOARDING_ADMIN_STATUS.NOT_BLESSBOARD) error = "not_blessboard";
        else if (result.status === ONBOARDING_ADMIN_STATUS.FORBIDDEN) error = "not_platform_admin";
        return res.redirect(303, `${detailPath}?error=${error}#pa-org-onboarding`);
      }
      return res.redirect(303, `${detailPath}?notice=support_assigned#pa-org-onboarding`);
    }
  );

  router.post(
    "/admin/organizations/:organizationKey/onboarding-status",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const organizationKey = String(req.params.organizationKey || "")
        .trim()
        .toLowerCase();
      const detailPath = orgDetailPath(organizationKey);
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf#pa-org-onboarding`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const result = await overrideOrganizationOnboardingStatus(getPool(), {
        organizationKey,
        onboardingStatus: req.body && req.body.onboarding_status,
        reason: req.body && req.body.reason,
        actorUserId: req.platformAdminContext.userId,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
      });
      if (!result.ok) {
        let error = "onboarding_status_failed";
        if (result.status === ONBOARDING_ADMIN_STATUS.INVALID_INPUT) {
          error = result.message === "reason_required" ? "reason_required" : "invalid";
        } else if (result.status === ONBOARDING_ADMIN_STATUS.NOT_FOUND) error = "not_found";
        else if (result.status === ONBOARDING_ADMIN_STATUS.NOT_BLESSBOARD) error = "not_blessboard";
        return res.redirect(303, `${detailPath}?error=${error}#pa-org-onboarding`);
      }
      return res.redirect(303, `${detailPath}?notice=onboarding_status_saved#pa-org-onboarding`);
    }
  );

  router.post(
    "/admin/organizations/:organizationKey/growth-trial/offer",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      const organizationKey = String(req.params.organizationKey || "")
        .trim()
        .toLowerCase();
      const detailPath = orgDetailPath(organizationKey);
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf#pa-org-growth-trial`);
      }
      const organizationId = await resolveOrganizationIdByKey(getPool(), organizationKey);
      if (!organizationId) {
        return res.redirect(303, `${detailPath}?error=not_found#pa-org-growth-trial`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const result = await createGrowthTrialOffer(getPool(), {
        organizationId,
        actorUserId: req.platformAdminContext.userId,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
      });
      if (!result.ok) {
        return res.redirect(303, `${detailPath}?error=growth_trial_offer_failed#pa-org-growth-trial`);
      }
      return res.redirect(303, `${detailPath}?notice=growth_trial_offered#pa-org-growth-trial`);
    }
  );

  router.post(
    "/admin/organizations/:organizationKey/growth-trial/cancel",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      const organizationKey = String(req.params.organizationKey || "")
        .trim()
        .toLowerCase();
      const detailPath = orgDetailPath(organizationKey);
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf#pa-org-growth-trial`);
      }
      const organizationId = await resolveOrganizationIdByKey(getPool(), organizationKey);
      if (!organizationId) {
        return res.redirect(303, `${detailPath}?error=not_found#pa-org-growth-trial`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const result = await cancelGrowthTrialOffer(getPool(), {
        organizationId,
        actorUserId: req.platformAdminContext.userId,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
      });
      if (!result.ok) {
        return res.redirect(303, `${detailPath}?error=growth_trial_cancel_failed#pa-org-growth-trial`);
      }
      return res.redirect(303, `${detailPath}?notice=growth_trial_canceled#pa-org-growth-trial`);
    }
  );

  router.post(
    "/admin/organizations/:organizationKey/growth-trial/exception",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      const organizationKey = String(req.params.organizationKey || "")
        .trim()
        .toLowerCase();
      const detailPath = orgDetailPath(organizationKey);
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf#pa-org-growth-trial`);
      }
      const confirmed = String((req.body && req.body.confirm_exception) || "") === "1";
      if (!confirmed) {
        return res.redirect(303, `${detailPath}?error=confirm_required#pa-org-growth-trial`);
      }
      const organizationId = await resolveOrganizationIdByKey(getPool(), organizationKey);
      if (!organizationId) {
        return res.redirect(303, `${detailPath}?error=not_found#pa-org-growth-trial`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const result = await grantGrowthTrialException(getPool(), {
        organizationId,
        actorUserId: req.platformAdminContext.userId,
        reason: req.body && req.body.exception_reason,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
      });
      if (!result.ok) {
        const error =
          result.reason === "exception_reason_required" ? "reason_required" : "growth_trial_exception_failed";
        return res.redirect(303, `${detailPath}?error=${error}#pa-org-growth-trial`);
      }
      return res.redirect(303, `${detailPath}?notice=growth_trial_exception#pa-org-growth-trial`);
    }
  );

  router.post(
    "/admin/organizations/:organizationKey/plan",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      const organizationKey = String(req.params.organizationKey || "")
        .trim()
        .toLowerCase();
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.status(403).type("text").send("Invalid or missing CSRF token.");
      }
      const confirmed = String((req.body && req.body.confirm_plan_change) || "") === "1";
      const result = await assignOrganizationPlanByKey(getPool(), {
        organizationKey,
        planKey: req.body && req.body.plan_key,
        notes: req.body && req.body.notes,
        confirmed,
      });
      if (!result.ok) {
        let error = "plan_failed";
        if (result.status === ENTITLEMENTS_ADMIN_STATUS.CONFIRMATION_REQUIRED) {
          error = "confirm_required";
        } else if (result.status === ENTITLEMENTS_ADMIN_STATUS.NOT_FOUND) {
          error = "not_found";
        } else if (result.status === ENTITLEMENTS_ADMIN_STATUS.INVALID_INPUT) {
          error = "invalid";
        } else if (result.status === ENTITLEMENTS_ADMIN_STATUS.LIMIT_EXCEEDED) {
          error = "branch_limit";
        }
        return res.redirect(
          303,
          `/admin/organizations/${encodeURIComponent(organizationKey)}?error=${error}#pa-org-subscription`
        );
      }
      return res.redirect(
        303,
        `/admin/organizations/${encodeURIComponent(organizationKey)}?notice=plan_saved#pa-org-subscription`
      );
    }
  );

  router.post(
    "/admin/organizations/:organizationKey/billing/activate-paid",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      const organizationKey = String(req.params.organizationKey || "")
        .trim()
        .toLowerCase();
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.status(403).type("text").send("Invalid or missing CSRF token.");
      }
      const confirmed = String((req.body && req.body.confirm_billing_activation) || "") === "1";
      const result = await activatePaidSubscriptionByOrganizationKey(getPool(), {
        organizationKey,
        planKey: req.body && req.body.plan_key,
        reason: req.body && req.body.reason,
        billingCustomerRef: req.body && req.body.billing_customer_ref,
        billingSubscriptionRef: req.body && req.body.billing_subscription_ref,
        billingProvider: (req.body && req.body.billing_provider) || "manual_external",
        confirmed,
        actorUserId: req.platformAdminContext && req.platformAdminContext.userId,
        env,
      });
      if (!result.ok) {
        let error = "billing_failed";
        if (result.status === BILLING_STATUS.CONFIRMATION_REQUIRED) {
          error = "confirm_required";
        } else if (result.status === BILLING_STATUS.NOT_FOUND) {
          error = "not_found";
        } else if (result.status === BILLING_STATUS.INVALID_INPUT) {
          error = "invalid";
        } else if (result.status === BILLING_STATUS.CONFLICT) {
          error = "branch_limit";
        }
        return res.redirect(
          303,
          `/admin/organizations/${encodeURIComponent(organizationKey)}?error=${error}#pa-org-billing`
        );
      }
      return res.redirect(
        303,
        `/admin/organizations/${encodeURIComponent(organizationKey)}?notice=billing_activated#pa-org-billing`
      );
    }
  );

  router.post(
    "/admin/organizations/:organizationKey/entitlement-override",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      const organizationKey = String(req.params.organizationKey || "")
        .trim()
        .toLowerCase();
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.status(403).type("text").send("Invalid or missing CSRF token.");
      }
      const confirmed = String((req.body && req.body.confirm_override) || "") === "1";
      const booleanRaw = String((req.body && req.body.boolean_value) || "").toLowerCase();
      const result = await setOrganizationEntitlementOverrideByKey(getPool(), {
        organizationKey,
        featureKey: req.body && req.body.feature_key,
        featureKind: req.body && req.body.feature_kind,
        booleanValue: booleanRaw === "1" || booleanRaw === "true" || booleanRaw === "on",
        limitValue: req.body && req.body.limit_value,
        reason: req.body && req.body.reason,
        confirmed,
        createdByUserId: req.platformAdminContext && req.platformAdminContext.userId,
      });
      if (!result.ok) {
        let error = "override_failed";
        if (result.status === ENTITLEMENTS_ADMIN_STATUS.CONFIRMATION_REQUIRED) {
          error = "confirm_required";
        } else if (result.status === ENTITLEMENTS_ADMIN_STATUS.NOT_FOUND) {
          error = "not_found";
        } else if (result.status === ENTITLEMENTS_ADMIN_STATUS.INVALID_INPUT) {
          error = "invalid";
        }
        return res.redirect(
          303,
          `/admin/organizations/${encodeURIComponent(organizationKey)}?error=${error}#pa-org-overrides`
        );
      }
      return res.redirect(
        303,
        `/admin/organizations/${encodeURIComponent(organizationKey)}?notice=override_saved#pa-org-overrides`
      );
    }
  );

  function rejectMaintenanceUnlessTesting(req, res) {
    if (!isTestingDataMaintenanceAllowed(env)) {
      return sendControlled(req, res, 404, "This page could not be found.");
    }
    return null;
  }

  router.get("/admin/maintenance", requireApex, requirePlatformAdmin, async (req, res) => {
    setAdminNoStore(res);
    const blocked = rejectMaintenanceUnlessTesting(req, res);
    if (blocked) return blocked;

    const model = await loadMaintenancePageModel(getPool(), { env });
    if (!model.ok) {
      if (model.status === MAINT_STATUS.FORBIDDEN || model.status === MAINT_STATUS.IDENTITY_BLOCKED) {
        return sendControlled(req, res, 404, "This page could not be found.");
      }
      return sendControlled(req, res, 503, "Maintenance tools are temporarily unavailable.");
    }

    const flash = readFlash(req);
    const html = renderPlatformAdminView(
      "platform-admin/maintenance.ejs",
      shellLocals(req, res, "maintenance", {
        pageTitle: "Maintenance",
        maintenance: model,
        confirmPhraseFull: FULL_RESET_CONFIRM_PHRASE,
        categoryActions: CATEGORY_ACTIONS,
        notice: flash.notice,
        error: flash.error,
        previewJson: null,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.post(
    "/admin/maintenance/preview",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const blocked = rejectMaintenanceUnlessTesting(req, res);
      if (blocked) return blocked;

      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, "/admin/maintenance?error=csrf");
      }

      const secret = parseSessionSecret(env);
      if (!secret.ok) {
        return res.redirect(303, "/admin/maintenance?error=unavailable");
      }
      const sessionSecret = String(env.SESSION_SECRET || "").trim();

      const action = String((req.body && req.body.action) || "clear_all").trim();
      const preview = await previewTestingDataReset(getPool(), {
        env,
        actorUserId: req.platformAdminContext.userId,
        action,
        sessionSecret,
      });
      if (!preview.ok) {
        return res.redirect(303, "/admin/maintenance?error=preview_failed");
      }

      const model = await loadMaintenancePageModel(getPool(), { env });
      if (!model.ok) {
        return sendControlled(req, res, 503, "Maintenance tools are temporarily unavailable.");
      }

      const html = renderPlatformAdminView(
        "platform-admin/maintenance.ejs",
        shellLocals(req, res, "maintenance", {
          pageTitle: "Maintenance",
          maintenance: model,
          confirmPhraseFull: FULL_RESET_CONFIRM_PHRASE,
          categoryActions: CATEGORY_ACTIONS,
          notice: "preview_ready",
          error: null,
          previewResult: preview,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  router.post(
    "/admin/maintenance/reset",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      // Hard gate before any mutation / DB work beyond auth already done.
      if (!isTestingDataMaintenanceAllowed(env)) {
        return sendControlled(req, res, 404, "This page could not be found.");
      }

      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, "/admin/maintenance?error=csrf");
      }

      const secret = parseSessionSecret(env);
      if (!secret.ok) {
        return res.redirect(303, "/admin/maintenance?error=unavailable");
      }
      const sessionSecret = String(env.SESSION_SECRET || "").trim();

      const deployment = getPlatformDeploymentCode(env);
      const action = String((req.body && req.body.action) || "").trim();
      const confirmPhrase = String((req.body && req.body.confirm_phrase) || "");
      const confirmChecked = String((req.body && req.body.confirm_destructive) || "") === "1";
      const previewToken = String((req.body && req.body.preview_token) || "");
      const session =
        req.v5Session && req.v5Session.authenticated && req.v5Session.session
          ? req.v5Session.session
          : null;

      const result = await executeTestingDataReset(getPool(), {
        env,
        actorUserId: req.platformAdminContext.userId,
        action,
        confirmPhrase,
        confirmChecked,
        previewToken,
        sessionSecret,
        deploymentCode: deployment.ok ? deployment.code : "blessboard-org-v5",
        keepSessionId: session && session.id ? session.id : null,
        dryRun: false,
      });

      if (!result.ok) {
        let error = "reset_failed";
        if (result.status === MAINT_STATUS.INVALID_INPUT) error = "confirm_invalid";
        else if (result.status === MAINT_STATUS.PREVIEW_REQUIRED) error = "preview_required";
        else if (result.status === MAINT_STATUS.PREVIEW_STALE) error = "preview_stale";
        else if (result.status === MAINT_STATUS.IDENTITY_BLOCKED) error = "identity_blocked";
        else if (result.status === MAINT_STATUS.LOCK_BUSY) error = "busy";
        else if (result.status === MAINT_STATUS.FORBIDDEN) error = "forbidden";
        return res.redirect(303, `/admin/maintenance?error=${error}`);
      }

      const model = await loadMaintenancePageModel(getPool(), { env });
      const html = renderPlatformAdminView(
        "platform-admin/maintenance.ejs",
        shellLocals(req, res, "maintenance", {
          pageTitle: "Maintenance",
          maintenance: model.ok ? model : null,
          confirmPhraseFull: FULL_RESET_CONFIRM_PHRASE,
          categoryActions: CATEGORY_ACTIONS,
          notice: "reset_complete",
          error: null,
          resetResult: result,
          previewResult: null,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  return router;
}

module.exports = {
  createPlatformAdminRouter,
  renderPlatformAdminView,
};
