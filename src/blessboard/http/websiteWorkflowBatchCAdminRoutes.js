"use strict";

/**
 * Phase3 Batch C — Approval settings + Website workflow dashboard routes.
 */

const express = require("express");
const { renderV5Ejs } = require("./v5EjsTemplateCache");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const { buildHqAdminShellLocals } = require("./hqAdminShellLocals");
const { CSRF_FIELD, validateCsrf } = require("../../platform/http/v5Csrf");
const approvalSettingsSvc = require("../services/websiteApprovalSettingsService");
const dashboardSvc = require("../services/websiteWorkflowDashboardService");
const advancedSvc = require("../services/websiteAdvancedManagementService");
const {
  renderWebsiteFeatureLocked,
  checkWebsiteCapability,
  planEntitlementSvc,
} = require("./websitePlanEntitlementHttp");
const { createNetworkGovernanceRoleGate } = require("./websiteSystemStateHttp");
const {
  publicChurchHomePath,
  hqPreviewPagePath,
} = require("../urls/churchUrlHelper");

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sendControlled(req, res, status, message) {
  const safe = escapeHtml(message);
  const wantsHtml = String(req.get("accept") || "").includes("text/html");
  if (!wantsHtml) {
    return res.status(status).type("text").send(String(message == null ? "" : message));
  }
  return res.status(status).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Website workflow</title>
<link rel="stylesheet" href="/blessboard/v5/hq-admin.css?v=61"/></head>
<body class="bb-hq-body"><main class="bb-hq-login-unavailable">
<h1>${status === 401 ? "Sign-in required" : status === 404 ? "Not found" : "Unavailable"}</h1>
<p>${safe}</p><p><a href="/hq">HQ home</a></p></main></body></html>`);
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 * }} deps
 */
function createWebsiteWorkflowBatchCAdminRouter(deps) {
  const router = express.Router();
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const isProduction = String(env.NODE_ENV || "") === "production";

  const rejectApex = createRejectApex({
    isApexHost,
    mode: "unlessTenant",
    sendUnavailable: (req, res) => sendControlled(req, res, 404, "Not found on this host."),
  });

  async function shellLocals(req, res, extras) {
    return buildHqAdminShellLocals(req, res, {
      env,
      isProduction,
      activeNav: "content",
      pageTitle: extras.pageTitle || "Website",
      getPool,
      extra: extras,
    });
  }

  const gateHq = createNetworkGovernanceRoleGate({
    getPool,
    shellLocalsFn: shellLocals,
    sendControlled,
    loginNext: "/hq/website/advanced",
  });

  async function actorUserId(req) {
    const session = req.v5Session && req.v5Session.session;
    return session && session.userId ? String(session.userId) : null;
  }

  async function renderApprovalSettings(req, res, opts) {
    const formActionPath =
      (opts && opts.formActionPath) || "/hq/website/network-approval-settings";
    const html = renderV5Ejs(
      "hq/phase4-network-approval-settings.ejs",
      await shellLocals(req, res, {
        pageTitle: "Network Approval Settings",
        settings: opts.settings,
        branchEditModeLabels: opts.branchEditModeLabels || {},
        contentTypeLabels: opts.contentTypeLabels || {},
        trustedBranchPublishActive: Boolean(opts.trustedBranchPublishActive),
        branchAdmins: opts.branchAdmins || [],
        formActionPath,
        error: opts.error || null,
        notice: opts.notice || null,
        message: opts.message || null,
      })
    );
    return res.status(opts.statusCode || 200).type("html").send(html);
  }

  async function handleApprovalSettingsGet(req, res, formActionPath) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.organization || !tenant.organization.id || !tenant.church) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const capability =
      formActionPath && formActionPath.indexOf("network-approval") >= 0
        ? "website.network_approval_settings"
        : "website.approval_workflow";
    const entitled = await checkWebsiteCapability(getPool, tenant, capability, env);
    if (!entitled.ok && entitled.status === planEntitlementSvc.STATUS.NOT_ENTITLED) {
      return renderWebsiteFeatureLocked(req, res, shellLocals, entitled, {
        featureTitle:
          capability === "website.network_approval_settings"
            ? "Network Approval Settings"
            : "Website Approval Settings",
        returnHref: "/hq/website",
      });
    }
    if (!entitled.ok) {
      return sendControlled(req, res, 503, "Approval settings are temporarily unavailable.");
    }
    const result = await approvalSettingsSvc.loadEffectiveSettings(
      getPool(),
      tenant.organization.id
    );
    if (!result.ok) {
      return sendControlled(req, res, 503, "Approval settings are temporarily unavailable.");
    }
    const branchAdmins = await approvalSettingsSvc.listBranchAdministrators(
      getPool(),
      tenant.organization.id
    );
    return renderApprovalSettings(req, res, {
      settings: result.settings,
      branchEditModeLabels: result.branchEditModeLabels,
      contentTypeLabels: result.contentTypeLabels,
      trustedBranchPublishActive: result.trustedBranchPublishActive,
      branchAdmins,
      formActionPath,
      notice: String((req.query && req.query.notice) || "") || null,
    });
  }

  async function handleApprovalSettingsPost(req, res, formActionPath) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.organization || !tenant.organization.id || !tenant.church) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const capability =
      formActionPath && formActionPath.indexOf("network-approval") >= 0
        ? "website.network_approval_settings"
        : "website.approval_workflow";
    const entitled = await checkWebsiteCapability(getPool, tenant, capability, env);
    if (!entitled.ok) {
      return sendControlled(req, res, 403, "This action is not available on your current plan.");
    }
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return sendControlled(req, res, 403, "Invalid or missing CSRF token.");
    }
    const body = req.body || {};
    const contentTypes = [].concat(body.approval_content_types || []);
    const result = await approvalSettingsSvc.saveSettings(getPool(), {
      organizationId: tenant.organization.id,
      actorUserId: await actorUserId(req),
      branchEditMode: body.branch_edit_mode,
      requirePreviewBeforePublish: body.require_preview_before_publish,
      requireMobilePreviewConfirmation: body.require_mobile_preview_confirmation,
      preventSelfApproval: body.prevent_self_approval,
      requireRequestChangesComment: body.require_request_changes_comment,
      requireRejectionReason: body.require_rejection_reason,
      requireRestoreApproval: body.require_restore_approval,
      hqDirectPublishEnabled: body.hq_direct_publish_enabled,
      notifyBranchAdmins: body.notify_branch_admins,
      notifyHqTeam: body.notify_hq_team,
      approvalContentTypes: contentTypes,
      trustedBranchPublishEnabled: body.trusted_branch_publish_enabled,
    });
    if (!result.ok) {
      if (result.reason === "branch_edit_mode" || result.reason === "ids") {
        const loaded = await approvalSettingsSvc.loadEffectiveSettings(
          getPool(),
          tenant.organization.id
        );
        const branchAdmins = await approvalSettingsSvc.listBranchAdministrators(
          getPool(),
          tenant.organization.id
        );
        return renderApprovalSettings(req, res, {
          statusCode: 400,
          settings: (loaded && loaded.settings) || body,
          branchEditModeLabels: (loaded && loaded.branchEditModeLabels) || {},
          contentTypeLabels: (loaded && loaded.contentTypeLabels) || {},
          trustedBranchPublishActive: false,
          branchAdmins,
          formActionPath,
          error:
            result.reason === "branch_edit_mode"
              ? "Choose a valid branch edit mode."
              : "Could not save approval settings.",
        });
      }
      return sendControlled(req, res, 503, "Approval settings could not be saved.");
    }
    return res.redirect(303, `${formActionPath}?notice=saved`);
  }

  router.get("/hq/website/approval-settings", rejectApex, gateHq, (req, res) =>
    handleApprovalSettingsGet(req, res, "/hq/website/approval-settings")
  );
  router.post("/hq/website/approval-settings", rejectApex, gateHq, (req, res) =>
    handleApprovalSettingsPost(req, res, "/hq/website/approval-settings")
  );
  router.get("/hq/website/network-approval-settings", rejectApex, gateHq, (req, res) =>
    handleApprovalSettingsGet(req, res, "/hq/website/network-approval-settings")
  );
  router.post("/hq/website/network-approval-settings", rejectApex, gateHq, (req, res) =>
    handleApprovalSettingsPost(req, res, "/hq/website/network-approval-settings")
  );

  router.get("/hq/website/advanced", rejectApex, gateHq, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.organization || !tenant.organization.id || !tenant.church) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const entitled = await checkWebsiteCapability(
      getPool,
      tenant,
      "website.advanced_management",
      env
    );
    if (!entitled.ok && entitled.status === planEntitlementSvc.STATUS.NOT_ENTITLED) {
      return renderWebsiteFeatureLocked(req, res, shellLocals, entitled, {
        featureTitle: "Advanced Website Management",
        returnHref: "/hq/website",
      });
    }
    if (!entitled.ok) {
      return sendControlled(req, res, 503, "Advanced website management is temporarily unavailable.");
    }
    const result = await advancedSvc.loadAdvancedWebsiteManagementHub(
      getPool(),
      tenant.organization.id
    );
    if (!result.ok) {
      return sendControlled(req, res, 503, "Advanced website management is temporarily unavailable.");
    }
    const html = renderV5Ejs(
      "hq/phase4-advanced-website-management.ejs",
      await shellLocals(req, res, {
        pageTitle: "Advanced Website Management",
        hub: result.hub,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/hq/website/plan-features", rejectApex, gateHq, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.organization || !tenant.organization.id || !tenant.church) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const ctx = await planEntitlementSvc.resolveWebsitePlanContext(getPool(), {
      organizationId: tenant.organization.id,
      churchId: tenant.church.id,
      env,
    });
    if (!ctx.ok) {
      return sendControlled(req, res, 503, "Plan features are temporarily unavailable.");
    }
    const planFeatures = planEntitlementSvc.buildWebsitePlanFeaturesModel({
      planKey: ctx.planKey,
    });
    const html = renderV5Ejs(
      "hq/phase4-website-plan-features.ejs",
      await shellLocals(req, res, {
        pageTitle: "Website Plan Features",
        planFeatures,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/hq/website/workflow", rejectApex, gateHq, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.organization || !tenant.organization.id || !tenant.church) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const result = await dashboardSvc.loadWebsiteWorkflowDashboard(getPool(), {
      organizationId: tenant.organization.id,
      churchId: tenant.church.id,
      env,
    });
    if (!result.ok) {
      return sendControlled(req, res, 503, "Website workflow dashboard is temporarily unavailable.");
    }
    const orgKey = (tenant.organization && tenant.organization.key) || null;
    const html = renderV5Ejs(
      "hq/phase3-website-workflow-dashboard.ejs",
      await shellLocals(req, res, {
        pageTitle: "Website Workflow Dashboard",
        dashboard: result,
        previewPath: hqPreviewPagePath("home"),
        publicPath: publicChurchHomePath(orgKey),
        editPath: "/hq/content",
      })
    );
    return res.status(200).type("html").send(html);
  });

  return router;
}

module.exports = {
  createWebsiteWorkflowBatchCAdminRouter,
};
