"use strict";

/**
 * BlessBoard V5 church HQ shell + branch registry / additional-campus create.
 * Branch keys in URLs; church/branch identity from hostname UUID context + DB lookup.
 * No fabricated summary metrics. Active branches only.
 */

const express = require("express");
const { renderV5Ejs } = require("./v5EjsTemplateCache");

const {
  createRequireBlessBoardTenantRole,
} = require("./requireBlessBoardTenantRole");
const {
  createRequireBlessBoardPermission,
} = require("./requireBlessBoardPermission");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const { buildHqAdminShellLocals } = require("./hqAdminShellLocals");
const {
  listBlessBoardBranches,
  resolveBlessBoardBranchForChurch,
  STATUS: BRANCH_STATUS,
} = require("../services/listBlessBoardBranches");
const {
  authorizeBlessBoardTenantAccess,
  STATUS: AUTHZ_STATUS,
} = require("../services/authorizeBlessBoardTenantAccess");
const {
  getChurchSettingsPageModel,
  updateChurchSettings,
  updateBranchSettings,
  STATUS: SETTINGS_STATUS,
} = require("../services/blessBoardSettingsService");
const {
  getGrowthTrialOfferState,
  acceptGrowthTrialOffer,
  STATUS: GROWTH_TRIAL_STATUS,
} = require("../../platform/services/growthTrialOfferService");
const {
  createBlessBoardBranch,
  STATUS: CREATE_BRANCH_STATUS,
} = require("../services/createBlessBoardBranch");
const {
  appendWebsiteModeNoticeQuery,
  parseWebsiteModeNoticeCode,
  websiteModeNoticeMessage,
} = require("../services/websiteModeTransition");
const {
  assertCanCreateBranch,
  getLimit,
  FEATURE_KEYS,
  resolveOrganizationEntitlementsSafe,
} = require("../../platform/services/entitlementService");
const {
  CSRF_FIELD,
  validateCsrf,
} = require("../../platform/http/v5Csrf");
const {
  clearV5SessionCookie,
  readV5SessionCookie,
} = require("../../platform/session/v5SessionCookie");
const { revokeV5Session } = require("../../platform/session/revokeV5Session");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");
const { getApexOrigin } = require("./tenantLoginHelpers");

/**
 * @param {string} relativePath
 * @param {object} data
 */
function renderHqView(relativePath, data) {
  return renderV5Ejs(relativePath, data);
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
  <title>HQ · BlessBoard</title>
  <link rel="stylesheet" href="/blessboard/v5/hq-admin.css?v=56" />
</head>
<body class="bb-hq-body">
  <main class="bb-hq-login-unavailable">
    <h1>${status === 401 ? "Sign-in unavailable" : status === 404 ? "Not found" : "Unavailable"}</h1>
    <p>${safe}</p>
    <p><a href="/">Church homepage</a></p>
  </main>
</body>
</html>`);
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 *   sendUnavailable?: Function,
 * }} deps
 */
function createHqAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const isProduction = String(env.NODE_ENV || "") === "production";
  void deps.sendUnavailable;

  const router = express.Router();
  const requireHqAccess = createRequireBlessBoardTenantRole({
    getPool,
    allowedRoles: ["church_hq_admin", "platform_admin"],
  });
  const requireOrgSettingsManage = createRequireBlessBoardPermission(
    "organisation.settings.manage",
    null,
    { getPool }
  );

  function sendMissingTenantContext(req, res) {
    const reason = req.blessBoardSessionTenantReason || "tenant_context_missing";
    console.info(
      JSON.stringify({
        event: "hq_admin_missing_tenant_context",
        reason,
        path: req.originalUrl || req.path || null,
        hasSession: Boolean(req.v5Session && req.v5Session.authenticated),
        hasOrganizationId: Boolean(
          req.v5Session &&
            req.v5Session.session &&
            req.v5Session.session.organizationId
        ),
      })
    );
    return sendControlled(
      req,
      res,
      403,
      "Your account is signed in, but this church HQ workspace could not be loaded. Confirm you are assigned as a church HQ administrator for an active organization, then sign in again."
    );
  }

  const rejectApex = createRejectApex({
    isApexHost,
    mode: "unlessTenant",
    sendUnavailable: (req, res) => {
      if (!(req.v5Session && req.v5Session.authenticated)) {
        const wantsHtml = String(req.get("accept") || "").includes("text/html");
        if (wantsHtml) {
          return res.redirect(303, "/login?next=/hq");
        }
        return sendControlled(req, res, 401, "Sign-in is required.");
      }
      return sendMissingTenantContext(req, res);
    },
  });

  function gateHq(req, res, next) {
    const sessionOk = Boolean(req.v5Session && req.v5Session.authenticated);
    if (!sessionOk) {
      const wantsHtml = String(req.get("accept") || "").includes("text/html");
      if (wantsHtml) {
        return res.redirect(303, "/login?next=/hq");
      }
      return sendControlled(req, res, 401, "Sign-in is required.");
    }
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || tenant.resolved !== true) {
      return sendMissingTenantContext(req, res);
    }
    return requireHqAccess(req, res, next);
  }

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {string} activeNav
   * @param {object} [extra]
   */
  async function shellLocals(req, res, activeNav, extra) {
    return buildHqAdminShellLocals(req, res, {
      env,
      isProduction,
      activeNav,
      getPool,
      extra,
    });
  }

  async function loadBranchList(req, res) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id) {
      sendControlled(req, res, 403, "You do not have access to this site.");
      return null;
    }
    const listResult = await listBlessBoardBranches(getPool(), tenant.church.id);
    if (!listResult.ok && listResult.status === BRANCH_STATUS.LOOKUP_ERROR) {
      sendControlled(req, res, 503, "Branch list is temporarily unavailable.");
      return null;
    }
    return listResult;
  }

  /**
   * @param {string} organizationId
   */
  async function loadBranchCapacity(organizationId) {
    const pricingUrl = `${getApexOrigin(env)}/pricing`;
    const gate = await assertCanCreateBranch(getPool(), { organizationId });
    const resolved = await resolveOrganizationEntitlementsSafe(getPool(), {
      organizationId,
    });
    const planKey =
      resolved && resolved.entitlements && resolved.entitlements.planKey
        ? String(resolved.entitlements.planKey)
        : null;
    const planDisplayName =
      resolved &&
      resolved.entitlements &&
      resolved.entitlements.plan &&
      resolved.entitlements.plan.displayName
        ? String(resolved.entitlements.plan.displayName)
        : planKey;
    const current =
      gate.current != null
        ? Number(gate.current)
        : null;
    const limit =
      gate.limit !== undefined
        ? gate.limit
        : resolved && resolved.entitlements
          ? getLimit(resolved.entitlements, FEATURE_KEYS.MAX_BRANCHES)
          : null;
    return {
      canCreate: Boolean(gate.ok),
      current,
      limit,
      planKey,
      planDisplayName,
      pricingUrl,
      limitReason: gate.ok ? null : gate.reason || null,
      limitExceeded: !gate.ok && gate.status === "limit_exceeded",
    };
  }

  function emptyBranchForm(body) {
    const b = body || {};
    return {
      displayName: String(b.displayName || "").trim(),
      branchKey: String(b.branchKey || "").trim().toLowerCase(),
      branchKeyManuallyEdited: String(b.branchKeyManuallyEdited || "") === "1" ? "1" : "0",
      email: String(b.email || "").trim(),
      phone: String(b.phone || "").trim(),
      timezone: String(b.timezone || "").trim(),
      countryCode: String(b.countryCode || "").trim().toUpperCase(),
      addressLine1: String(b.addressLine1 || "").trim(),
      addressLine2: String(b.addressLine2 || "").trim(),
      city: String(b.city || "").trim(),
      provinceState: String(b.provinceState || "").trim(),
      postalCode: String(b.postalCode || "").trim(),
    };
  }

  router.get("/hq", rejectApex, gateHq, async (req, res) => {
    const listResult = await loadBranchList(req, res);
    if (!listResult) return;
    const html = renderHqView(
      "hq/dashboard.ejs",
      await shellLocals(req, res, "home", {
        branches: listResult.branches,
        activeBranchCount: listResult.activeCount || 0,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/hq/branches", rejectApex, gateHq, async (req, res) => {
    const listResult = await loadBranchList(req, res);
    if (!listResult) return;
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.organization || !tenant.organization.id) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const capacity = await loadBranchCapacity(tenant.organization.id);
    const q = String((req.query && req.query.q) || "").trim().slice(0, 100);
    const typeRaw = String((req.query && req.query.type) || "")
      .trim()
      .toLowerCase();
    const typeFilter = typeRaw === "hq" || typeRaw === "branch" ? typeRaw : "";
    const created = String((req.query && req.query.created) || "").trim();
    const websiteModeNoticeCode = parseWebsiteModeNoticeCode(
      req.query && req.query.website_mode_notice
    );
    const html = renderHqView(
      "hq/branches.ejs",
      await shellLocals(req, res, "branches", {
        branches: listResult.branches,
        activeBranchCount: listResult.activeCount || 0,
        q,
        typeFilter,
        capacity,
        createdKey: created,
        websiteModeNoticeCode,
        websiteModeNoticeMessage: websiteModeNoticeMessage(websiteModeNoticeCode),
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/hq/branches/new", rejectApex, gateHq, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id || !tenant.organization) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const capacity = await loadBranchCapacity(tenant.organization.id);
    const organizationKey =
      (tenant.organization.key && String(tenant.organization.key)) ||
      (tenant.organization.organizationKey && String(tenant.organization.organizationKey)) ||
      "";
    const html = renderHqView(
      "hq/branch-new.ejs",
      await shellLocals(req, res, "branches", {
        capacity,
        form: emptyBranchForm(null),
        error: null,
        fieldErrors: {},
        organizationKey,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.post("/hq/branches", rejectApex, gateHq, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id || !tenant.organization) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return sendControlled(req, res, 403, "Invalid or missing CSRF token.");
    }
    const session = req.v5Session && req.v5Session.session;
    const form = emptyBranchForm(req.body);
    const capacity = await loadBranchCapacity(tenant.organization.id);
    const organizationKey =
      (tenant.organization.key && String(tenant.organization.key)) ||
      (tenant.organization.organizationKey && String(tenant.organization.organizationKey)) ||
      "";

    async function renderCreateForm(status, error, fieldErrors) {
      const html = renderHqView(
        "hq/branch-new.ejs",
        await shellLocals(req, res, "branches", {
          capacity,
          form,
          error,
          fieldErrors: fieldErrors || {},
          organizationKey,
        })
      );
      return res.status(status).type("html").send(html);
    }

    if (!capacity.canCreate) {
      return renderCreateForm(
        403,
        capacity.limitExceeded
          ? `Your plan allows ${capacity.limit == null ? "unlimited" : capacity.limit} active ${
              capacity.limit === 1 ? "branch" : "branches"
            } (${capacity.current == null ? "?" : capacity.current} in use). Upgrade to add another campus.`
          : "You cannot add a branch right now.",
        {}
      );
    }

    // Ignore client-supplied organization/church IDs — scope comes from session tenant only.
    const created = await createBlessBoardBranch(getPool(), {
      churchId: tenant.church.id,
      organizationId: tenant.organization.id,
      branchKey: form.branchKey,
      displayName: form.displayName,
      email: form.email,
      phone: form.phone,
      timezone: form.timezone || null,
      countryCode: form.countryCode || null,
      addressLine1: form.addressLine1 || null,
      addressLine2: form.addressLine2 || null,
      city: form.city || null,
      provinceState: form.provinceState || null,
      postalCode: form.postalCode || null,
      actorUserId: session && session.userId,
    });

    if (!created.ok) {
      if (created.status === CREATE_BRANCH_STATUS.LIMIT_EXCEEDED) {
        const refreshed = await loadBranchCapacity(tenant.organization.id);
        const html = renderHqView(
          "hq/branch-new.ejs",
          await shellLocals(req, res, "branches", {
            capacity: refreshed,
            form,
            error:
              created.message ||
              "Your plan’s active branch limit has been reached. Upgrade to add another campus.",
            fieldErrors: {},
            organizationKey,
          })
        );
        return res.status(403).type("html").send(html);
      }
      const httpStatus =
        created.status === CREATE_BRANCH_STATUS.CONFLICT
          ? 409
          : created.status === CREATE_BRANCH_STATUS.NOT_FOUND
            ? 404
            : 400;
      return renderCreateForm(
        httpStatus,
        created.message || "Please check the branch details and try again.",
        created.fieldErrors || {}
      );
    }

    return res.redirect(
      303,
      appendWebsiteModeNoticeQuery(
        `/hq/branches/${encodeURIComponent(created.branch.branch_key)}/created`,
        created.websiteModeTransition
      )
    );
  });

  router.get("/hq/branches/:branchKey/created", rejectApex, gateHq, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id || !tenant.organization) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const resolved = await resolveBlessBoardBranchForChurch(
      getPool(),
      tenant.church.id,
      req.params.branchKey
    );
    if (!resolved.ok || !resolved.branch) {
      return sendControlled(req, res, 404, "This branch could not be found.");
    }
    const organizationKey =
      (tenant.organization.key && String(tenant.organization.key)) ||
      (tenant.organization.organizationKey && String(tenant.organization.organizationKey)) ||
      "";
    const html = renderHqView(
      "hq/branch-created.ejs",
      await shellLocals(req, res, "branches", {
        createdBranch: resolved.branch,
        organizationKey,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/hq/account", rejectApex, gateHq, async (req, res) => {
    const html = renderHqView("hq/account.ejs", await shellLocals(req, res, "account"));
    return res.status(200).type("html").send(html);
  });

  router.post("/hq/logout", rejectApex, async (req, res) => {
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
    return res.redirect(303, "/");
  });

  router.get("/hq/settings", rejectApex, gateHq, requireOrgSettingsManage, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const loaded = await getChurchSettingsPageModel(getPool(), tenant.church.id);
    if (!loaded.ok || !loaded.model) {
      const status = loaded.status === SETTINGS_STATUS.LOOKUP_ERROR ? 503 : 403;
      return sendControlled(
        req,
        res,
        status,
        status === 503 ? "Settings are temporarily unavailable." : "You do not have access to this site."
      );
    }
    let growthTrial = null;
    if (tenant.organization && tenant.organization.id) {
      const trialState = await getGrowthTrialOfferState(getPool(), tenant.organization.id);
      if (trialState.ok) growthTrial = trialState;
    }
    const html = renderHqView(
      "hq/settings.ejs",
      await shellLocals(req, res, "settings", {
        settings: loaded.model.settings,
        catalogue: loaded.model.catalogue,
        primaryBranch: loaded.model.primaryBranch,
        growthTrial,
        error: null,
        fieldError: null,
        saved: String((req.query && req.query.saved) || "") === "1",
        branchSaved: String((req.query && req.query.branch_saved) || "") === "1",
        trialAccepted: String((req.query && req.query.trial_accepted) || "") === "1",
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.post("/hq/settings", rejectApex, gateHq, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return sendControlled(req, res, 403, "Invalid or missing CSRF token.");
    }
    const body = req.body || {};
    const session = req.v5Session && req.v5Session.session;
    const action = String(body.action || "church").trim().toLowerCase();

    if (action === "accept_growth_trial") {
      if (!tenant.organization || !tenant.organization.id || !session || !session.userId) {
        return sendControlled(req, res, 403, "You do not have access to this site.");
      }
      const confirmed = String(body.confirm_accept_trial || "") === "1";
      if (!confirmed) {
        return res.redirect(303, "/hq/settings?error=trial_confirm_required");
      }
      const deployment = getPlatformDeploymentCode(env);
      const accepted = await acceptGrowthTrialOffer(getPool(), {
        organizationId: tenant.organization.id,
        actorUserId: session.userId,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
        env,
      });
      if (!accepted.ok) {
        let error = "trial_accept_failed";
        if (accepted.status === GROWTH_TRIAL_STATUS.NOT_ELIGIBLE) error = "trial_not_eligible";
        else if (accepted.status === GROWTH_TRIAL_STATUS.CONFLICT) error = "trial_conflict";
        else if (accepted.status === GROWTH_TRIAL_STATUS.FORBIDDEN) error = "trial_forbidden";
        return res.redirect(303, `/hq/settings?error=${error}`);
      }
      return res.redirect(303, "/hq/settings?trial_accepted=1");
    }

    if (action === "branch") {
      const pageModel = await getChurchSettingsPageModel(getPool(), tenant.church.id);
      const branchId =
        pageModel.ok && pageModel.model && pageModel.model.primaryBranch
          ? pageModel.model.primaryBranch.id
          : null;
      if (!branchId) {
        return sendControlled(req, res, 404, "First branch could not be found.");
      }
      const updated = await updateBranchSettings(getPool(), branchId, {
        publicName: body.publicName,
        email: body.email,
        phone: body.phone,
        timezone: body.timezone,
        countryCode: body.countryCode,
        addressLine1: body.addressLine1,
        addressLine2: body.addressLine2,
        city: body.city,
        provinceState: body.provinceState,
        postalCode: body.postalCode,
        latitude: body.latitude,
        longitude: body.longitude,
        expectedChurchId: tenant.church.id,
        actorUserId: session && session.userId,
      });
      if (!updated.ok) {
        const loaded = await getChurchSettingsPageModel(getPool(), tenant.church.id);
        const html = renderHqView(
          "hq/settings.ejs",
          await shellLocals(req, res, "settings", {
            settings: loaded.model ? loaded.model.settings : null,
            catalogue: loaded.model ? loaded.model.catalogue : null,
            primaryBranch: loaded.model ? loaded.model.primaryBranch : null,
            error: updated.message || "Please check the branch settings and try again.",
            fieldError: updated.reason || null,
            saved: false,
            branchSaved: false,
          })
        );
        return res
          .status(updated.status === SETTINGS_STATUS.CONFLICT ? 409 : 400)
          .type("html")
          .send(html);
      }
      return res.redirect(303, "/hq/settings?branch_saved=1");
    }

    const updated = await updateChurchSettings(getPool(), tenant.church.id, {
      publicName: body.publicName,
      denomination: body.denomination,
      legalName: body.legalName,
      primaryEmail: body.primaryEmail,
      primaryPhone: body.primaryPhone,
      defaultTimezone: body.defaultTimezone,
      defaultCountryCode: body.defaultCountryCode,
      websiteStatus: body.websiteStatus,
      actorUserId: session && session.userId,
    });
    if (!updated.ok) {
      if (
        updated.status === SETTINGS_STATUS.INVALID_INPUT ||
        updated.status === SETTINGS_STATUS.CONFLICT
      ) {
        const loaded = await getChurchSettingsPageModel(getPool(), tenant.church.id);
        const html = renderHqView(
          "hq/settings.ejs",
          await shellLocals(req, res, "settings", {
            settings: (loaded.model && loaded.model.settings) || {
              publicName: String(body.publicName || ""),
              denomination: body.denomination || null,
              primaryEmail: body.primaryEmail || null,
              primaryPhone: body.primaryPhone || null,
              defaultTimezone: body.defaultTimezone || null,
              defaultCountryCode: body.defaultCountryCode || null,
              websiteStatus: body.websiteStatus || "draft",
            },
            catalogue: loaded.model ? loaded.model.catalogue : null,
            primaryBranch: loaded.model ? loaded.model.primaryBranch : null,
            error: updated.message || "Please check the settings and try again.",
            fieldError: updated.reason || null,
            saved: false,
            branchSaved: false,
          })
        );
        return res.status(400).type("html").send(html);
      }
      return sendControlled(
        req,
        res,
        updated.status === SETTINGS_STATUS.LOOKUP_ERROR ? 503 : 403,
        "Settings could not be saved."
      );
    }
    return res.redirect(303, "/hq/settings?saved=1");
  });

  /**
   * Resolve branch key under current church, authorize for that branch UUID,
   * then open the existing branch-admin shell (no UUID in URL).
   */
  router.get("/hq/branches/:branchKey", rejectApex, gateHq, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }

    const resolved = await resolveBlessBoardBranchForChurch(
      getPool(),
      tenant.church.id,
      req.params.branchKey
    );

    if (!resolved.ok) {
      if (resolved.status === BRANCH_STATUS.LOOKUP_ERROR) {
        return sendControlled(req, res, 503, "Branch lookup is temporarily unavailable.");
      }
      if (resolved.status === BRANCH_STATUS.INACTIVE) {
        return sendControlled(req, res, 404, "This branch is not available.");
      }
      return sendControlled(req, res, 404, "This branch could not be found.");
    }

    const session = req.v5Session && req.v5Session.session;
    const authz = await authorizeBlessBoardTenantAccess(getPool(), {
      userId: session && session.userId,
      tenant,
      branchId: resolved.branch.id,
    });

    if (authz.status === AUTHZ_STATUS.LOOKUP_ERROR) {
      return sendControlled(req, res, 503, "Access check is temporarily unavailable.");
    }
    if (!authz.ok) {
      return sendControlled(req, res, 403, "You do not have access to this branch.");
    }

    // Preserve authorization; open existing branch-admin shell (hostname primary context).
    return res.redirect(303, "/branch-admin");
  });

  return router;
}

module.exports = {
  createHqAdminRouter,
  renderHqView,
};
