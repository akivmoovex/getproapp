"use strict";

/**
 * Phase4 Stage 8A — shared empty / error / restricted system-state helpers.
 */

const { renderV5Ejs } = require("./v5EjsTemplateCache");

const STATE_TYPES = Object.freeze({
  EMPTY: "empty",
  ERROR: "error",
  RESTRICTED: "restricted",
  LOCKED: "locked",
  NOT_FOUND: "not_found",
});

/**
 * @param {object} [opts]
 */
function buildChangeRequestsEmptyState(opts) {
  const role = String((opts && opts.viewerRole) || "hq");
  const listPath = (opts && opts.listPath) || "/hq/website/change-submissions";
  const websitePath = (opts && opts.websitePath) || "/hq/website";
  const editorPath = (opts && opts.editorPath) || null;
  const submitPath = (opts && opts.submitPath) || null;

  if (role === "branch") {
    return {
      type: STATE_TYPES.EMPTY,
      stitchLabel: "Phase4 - Website Change Requests - Empty State",
      icon: "done_all",
      heading: "All Clear",
      body:
        "No pending requests to review. You have completed all moderation tasks for the Website Change Requests.",
      primaryAction: submitPath
        ? { href: submitPath, label: "Submit an update", icon: "edit_note" }
        : editorPath
          ? { href: editorPath, label: "Open website editor", icon: "web" }
          : { href: websitePath, label: "Return to Website", icon: "arrow_back" },
      secondaryAction: { href: listPath, label: "View history", icon: "history" },
    };
  }

  // HQ / reviewer: do not offer branch submission actions.
  return {
    type: STATE_TYPES.EMPTY,
    stitchLabel: "Phase4 - Website Change Requests - Empty State",
    icon: "check_circle",
    heading: "All caught up!",
    body: "There are no pending website change requests from branches at this time.",
    primaryAction: {
      href: `${listPath}?status=published`,
      label: "View Request History",
      icon: "history",
    },
    secondaryAction: {
      href: listPath,
      label: "Refresh Queue",
      icon: "refresh",
    },
    hint: null,
  };
}

/**
 * @param {object} [opts]
 */
function buildVersionHistoryErrorState(opts) {
  const retryHref = (opts && opts.retryHref) || "/hq/website/version-history";
  const websitePath = (opts && opts.websitePath) || "/hq/website";
  return {
    type: STATE_TYPES.ERROR,
    stitchLabel: "Phase4 - Version History - Loading Error",
    icon: "cloud_off",
    heading: "Something went wrong",
    body:
      "We encountered a problem loading the version archive. This might be due to a temporary interruption. Your published website is unchanged.",
    primaryAction: { href: retryHref, label: "Try Again", icon: "refresh" },
    secondaryAction: { href: websitePath, label: "Return to Website", icon: "arrow_back" },
    hint: "You can try again in a moment.",
  };
}

/**
 * @param {object} [opts]
 */
function buildVersionHistoryEmptyState(opts) {
  const publishHref = (opts && opts.publishHref) || "/hq/website/publish/review";
  const websitePath = (opts && opts.websitePath) || "/hq/website";
  return {
    type: STATE_TYPES.EMPTY,
    icon: "history",
    heading: "No website versions yet",
    body: "No publication versions are recorded yet. Publish the website to create the first history entry.",
    primaryAction: { href: publishHref, label: "Publish Website Review", icon: "publish" },
    secondaryAction: { href: websitePath, label: "Return to Website", icon: "arrow_back" },
  };
}

/**
 * Role-restricted Network governance (not a plan upgrade).
 * @param {object} [opts]
 */
function buildNetworkGovernanceRestrictedState(opts) {
  const dashboardHref = (opts && opts.dashboardHref) || "/hq";
  const websitePath = (opts && opts.websitePath) || "/hq/website";
  return {
    type: STATE_TYPES.RESTRICTED,
    stitchLabel: "Phase4 - Network Governance - Access Restricted",
    icon: "lock_person",
    heading: "Access Restricted",
    title: "This area is restricted to Network Administrators.",
    body:
      "The Governance Hub contains high-level tools reserved for Network HQ personnel. Branch-level administrative access does not permit entry to this module at this time.",
    primaryAction: { href: dashboardHref, label: "Return to Dashboard", icon: "dashboard" },
    secondaryAction: { href: websitePath, label: "Website Overview", icon: "language" },
    hint: "Need temporary access? Ask your HQ administrator. Buying a plan does not grant a role.",
  };
}

const NETWORK_GOVERNANCE_HQ_ROLES = Object.freeze(["church_hq_admin", "platform_admin"]);

function wantsHtmlResponse(req) {
  const accept = String(req.get("accept") || "*/*").toLowerCase();
  if (!accept || accept === "*/*") return true;
  return accept.includes("text/html");
}

/**
 * Gate HQ Network-governance HTML routes: wrong permission → restricted system state;
 * unauthorized / cross-tenant → plain denial (no upgrade / lock screen).
 *
 * Product policy: network governance remains HQ church-scoped (organisation.settings.manage
 * or website.publish). Not granted to branch-only editors.
 *
 * @param {{
 *   getPool: () => { query: Function },
 *   shellLocalsFn: Function,
 *   sendControlled: Function,
 *   loginNext?: string,
 *   createRequireBlessBoardTenantRole?: Function,
 *   createRequireBlessBoardPermission?: Function,
 * }} deps
 */
function createNetworkGovernanceRoleGate(deps) {
  const getPool = deps.getPool;
  const shellLocalsFn = deps.shellLocalsFn;
  const sendControlled = deps.sendControlled;
  const loginNext = deps.loginNext || "/hq/website";
  const {
    createRequireBlessBoardPermission,
  } = require("./requireBlessBoardPermission");
  const { authorize } = require("../services/blessBoardRbacAuthorizationService");
  const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
  // Prefer organisation.settings.manage (HQ signal); website.publish also admits publishers.
  const requireTenantMember = createRequireBlessBoardPermission("website.view", null, { getPool, scopeMode: "church" });

  return function gateNetworkGovernanceRole(req, res, next) {
    const sessionOk = Boolean(req.v5Session && req.v5Session.authenticated);
    if (!sessionOk) {
      if (wantsHtmlResponse(req)) {
        return res.redirect(
          303,
          `/login?next=${encodeURIComponent(req.originalUrl || loginNext)}`
        );
      }
      return sendControlled(req, res, 401, "Sign-in is required.");
    }

    return requireTenantMember(req, res, async () => {
      try {
        const tenant = resolveTenantForAuthorization(req);
        const session = req.v5Session && req.v5Session.session;
        if (!tenant || !session || !session.userId) {
          return sendControlled(req, res, 403, "You do not have access to this site.");
        }
        const hq = await authorize(getPool(), {
          actor: { userId: session.userId },
          permission: "organisation.settings.manage",
          tenantContext: tenant,
          resourceContext: {
            organizationId: tenant.organization.id,
            churchId: tenant.church.id,
            branchId: null,
          },
        });
        const publish = hq.allowed
          ? hq
          : await authorize(getPool(), {
              actor: { userId: session.userId },
              permission: "website.publish",
              tenantContext: tenant,
              resourceContext: {
                organizationId: tenant.organization.id,
                churchId: tenant.church.id,
                branchId: null,
              },
            });
        if (hq.allowed || publish.allowed) return next();

        if (!wantsHtmlResponse(req)) {
          return sendControlled(req, res, 403, "You do not have access to this site.");
        }
        return renderSystemStatePage(
          req,
          res,
          shellLocalsFn,
          buildNetworkGovernanceRestrictedState(),
          { statusCode: 403, pageTitle: "Access Restricted" }
        );
      } catch {
        return sendControlled(req, res, 503, "Access check is temporarily unavailable.");
      }
    });
  };
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {(req: any, res: any, extras: object) => Promise<object>|object} shellLocalsFn
 * @param {object} systemState
 * @param {{ statusCode?: number, pageTitle?: string }} [opts]
 */
async function renderSystemStatePage(req, res, shellLocalsFn, systemState, opts) {
  const statusCode = (opts && opts.statusCode) || (systemState.type === "error" ? 503 : 200);
  const pageTitle =
    (opts && opts.pageTitle) ||
    systemState.heading ||
    (systemState.type === "error"
      ? "Something went wrong"
      : systemState.type === "restricted"
        ? "Access Restricted"
        : "Website");
  const locals = await shellLocalsFn(req, res, {
    pageTitle,
    systemState,
  });
  const html = renderV5Ejs("hq/phase4-system-state-page.ejs", locals);
  return res.status(statusCode).type("html").send(html);
}

/**
 * Preserve query string for retry links.
 * @param {import('express').Request} req
 * @param {string} basePath
 */
function retryHrefFromRequest(req, basePath) {
  const url = String(req.originalUrl || basePath);
  if (url.indexOf(basePath) === 0) return url;
  const qs = req.url && req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  return basePath + qs;
}

module.exports = {
  STATE_TYPES,
  NETWORK_GOVERNANCE_HQ_ROLES,
  buildChangeRequestsEmptyState,
  buildVersionHistoryErrorState,
  buildVersionHistoryEmptyState,
  buildNetworkGovernanceRestrictedState,
  createNetworkGovernanceRoleGate,
  renderSystemStatePage,
  retryHrefFromRequest,
};
