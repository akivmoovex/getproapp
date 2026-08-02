"use strict";

/**
 * Branch / HQ structured service-times editor (Stage 2 mini websites).
 * Routes:
 *   GET/POST /hq/website/branches/:branchKey/service-times
 *   GET/POST /branch-admin/website/service-times
 */

const express = require("express");
const { renderV5Ejs } = require("./v5EjsTemplateCache");
const {
  createRequireBlessBoardPermission,
} = require("./requireBlessBoardPermission");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const { buildHqAdminShellLocals } = require("./hqAdminShellLocals");
const { buildBranchAdminShellLocals } = require("./branchAdminShellLocals");
const {
  CSRF_FIELD,
  validateCsrf,
} = require("../../platform/http/v5Csrf");
const {
  resolveWebsiteScope,
  STATUS: WEBSITE_SCOPE_STATUS,
  SCOPE_TYPE,
} = require("../services/resolveWebsiteScope");
const {
  authorizeBlessBoardTenantAccess,
  STATUS: AUTHZ_STATUS,
} = require("../services/authorizeBlessBoardTenantAccess");
const {
  DAYS: SERVICE_TIME_DAYS,
  loadAdminServiceTimes,
  saveHomeServiceTimes,
  STATUS: SERVICE_TIMES_STATUS,
} = require("../services/homeServiceTimesService");

/**
 * @param {unknown} value
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
 * @param {'hq'|'branch'} shellKind
 */
function sendControlled(req, res, status, message, shellKind) {
  const safe = escapeHtml(message);
  const wantsHtml = String(req.get("accept") || "").includes("text/html");
  if (!wantsHtml) {
    return res.status(status).type("text").send(String(message == null ? "" : message));
  }
  const css =
    shellKind === "hq"
      ? "/blessboard/v5/hq-admin.css?v=58"
      : "/blessboard/v5/branch-admin.css?v=39";
  const bodyClass = shellKind === "hq" ? "bb-hq-body" : "bb-ba-body";
  const homeHref = shellKind === "hq" ? "/hq" : "/branch-admin";
  return res.status(status).type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Service times · BlessBoard</title>
  <link rel="stylesheet" href="${css}" />
</head>
<body class="${bodyClass}">
  <main class="bb-ca-unavailable">
    <h1>${status === 401 ? "Sign-in required" : status === 404 ? "Not found" : "Unavailable"}</h1>
    <p>${safe}</p>
    <p><a href="${homeHref}">Back</a></p>
  </main>
</body>
</html>`);
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 * }} deps
 */
function createWebsiteServiceTimesAdminRouter(deps) {
  const router = express.Router();
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const isProduction = String(env.NODE_ENV || "") === "production";

  const rejectApex = createRejectApex({
    isApexHost,
    mode: "unlessTenant",
    sendUnavailable: (req, res) =>
      sendControlled(req, res, 404, "Not found on this host.", "hq"),
  });

  const requireHq = createRequireBlessBoardPermission("website.edit", null, { getPool, scopeMode: "church" });
  const requireBranchSurface = createRequireBlessBoardPermission("website.edit", null, { getPool });

  function gateSession(req, res, next, loginNext, shellKind) {
    const sessionOk = Boolean(req.v5Session && req.v5Session.authenticated);
    if (!sessionOk) {
      const wantsHtml = String(req.get("accept") || "").includes("text/html");
      if (wantsHtml) {
        return res.redirect(303, `/login?next=${encodeURIComponent(loginNext)}`);
      }
      return sendControlled(req, res, 401, "Sign-in is required.", shellKind);
    }
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || tenant.resolved !== true) {
      return sendControlled(req, res, 403, "You do not have access to this site.", shellKind);
    }
    return next();
  }

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {object} resolved
   * @param {'hq'|'branch'} shellKind
   */
  function sendScopeFailure(req, res, resolved, shellKind) {
    const status = resolved && resolved.httpStatus ? resolved.httpStatus : 403;
    if (status === 401) {
      return sendControlled(req, res, 401, "Sign-in is required.", shellKind);
    }
    if (status === 503 || (resolved && resolved.status === WEBSITE_SCOPE_STATUS.LOOKUP_ERROR)) {
      return sendControlled(
        req,
        res,
        503,
        "Service times are temporarily unavailable.",
        shellKind
      );
    }
    if (status === 404 || (resolved && resolved.status === WEBSITE_SCOPE_STATUS.NOT_FOUND)) {
      return sendControlled(req, res, 404, "This branch could not be found.", shellKind);
    }
    return sendControlled(req, res, 403, "You do not have access to this site.", shellKind);
  }

  async function resolveHqBranchWebsiteScope(req, res) {
    const tenant = resolveTenantForAuthorization(req);
    const session = req.v5Session && req.v5Session.session;
    const resolved = await resolveWebsiteScope(getPool(), {
      tenant,
      authenticatedUser: session && session.userId,
      requestedBranchKey: req.params.branchKey,
      organizationId: tenant && tenant.organization ? tenant.organization.id : null,
      churchId: tenant && tenant.church ? tenant.church.id : null,
    });
    if (!resolved.ok || resolved.scopeType !== SCOPE_TYPE.BRANCH || !resolved.branchId) {
      sendScopeFailure(req, res, resolved, "hq");
      return null;
    }
    return {
      ...resolved,
      formAction: `/hq/website/branches/${encodeURIComponent(resolved.branchKey)}/service-times`,
      backHref: "/hq/website",
      shellKind: "hq",
      scopeLabel: (resolved.branch && resolved.branch.displayName) || resolved.branchKey,
    };
  }

  async function resolveBranchAdminWebsiteScope(req, res) {
    const tenant = resolveTenantForAuthorization(req);
    const session = req.v5Session && req.v5Session.session;
    const userId = session && session.userId;
    const base = {
      tenant,
      authenticatedUser: userId,
      organizationId: tenant && tenant.organization ? tenant.organization.id : null,
      churchId: tenant && tenant.church ? tenant.church.id : null,
    };

    const assignedOrChurch = await resolveWebsiteScope(getPool(), {
      ...base,
      requestedBranchKey: null,
    });

    let resolved = assignedOrChurch;
    if (assignedOrChurch.ok && assignedOrChurch.scopeType === SCOPE_TYPE.CHURCH) {
      const primaryKey =
        tenant && tenant.primaryBranch && tenant.primaryBranch.key
          ? tenant.primaryBranch.key
          : null;
      if (!primaryKey) {
        sendControlled(req, res, 403, "You do not have access to this site.", "branch");
        return null;
      }
      resolved = await resolveWebsiteScope(getPool(), {
        ...base,
        requestedBranchKey: primaryKey,
      });
    }

    if (!resolved.ok || resolved.scopeType !== SCOPE_TYPE.BRANCH || !resolved.branchId) {
      sendScopeFailure(req, res, resolved, "branch");
      return null;
    }

    // Re-authorize against assigned branch (never trust form branch ids).
    const authz = await authorizeBlessBoardTenantAccess(getPool(), {
      userId,
      tenant,
      branchId: resolved.branchId,
    });
    if (authz.status === AUTHZ_STATUS.LOOKUP_ERROR) {
      sendControlled(req, res, 503, "Access check is temporarily unavailable.", "branch");
      return null;
    }
    if (!authz.ok) {
      sendControlled(req, res, 403, "You do not have access to this site.", "branch");
      return null;
    }
    req.blessBoardAuthorizationContext = { ...authz.context, reason: authz.status };

    return {
      ...resolved,
      formAction: "/branch-admin/website/service-times",
      backHref: "/branch-admin/website",
      shellKind: "branch",
      scopeLabel: (resolved.branch && resolved.branch.displayName) || resolved.branchKey,
    };
  }

  async function shellLocals(req, res, scope, extras) {
    if (scope.shellKind === "hq") {
      return buildHqAdminShellLocals(req, res, {
        env,
        isProduction,
        activeNav: "content",
        pageTitle: "Service times",
        getPool,
        extra: {
          shellKind: "hq",
          formClass: "bb-hq-form",
          ...(extras || {}),
        },
      });
    }
    return buildBranchAdminShellLocals(req, res, {
      getPool,
      env,
      isProduction,
      activeNav: "website_submissions",
      pageTitle: "Service times",
      extra: {
        shellKind: "branch",
        formClass: "bb-ba-form",
        ...(extras || {}),
      },
    });
  }

  function actorUserId(req) {
    const session = req.v5Session && req.v5Session.session;
    return session && session.userId ? String(session.userId) : null;
  }

  function parseAction(body) {
    const raw = String((body && body.action) || "").trim();
    if (raw === "save_publish") return "save_publish";
    return "save_draft";
  }

  async function renderEditor(req, res, scope, opts) {
    const html = renderV5Ejs(
      "website/service-times-editor.ejs",
      await shellLocals(req, res, scope, {
        scope,
        entries: opts.entries || [],
        section: opts.section || null,
        serviceTimeDays: SERVICE_TIME_DAYS,
        error: opts.error || null,
        saved: Boolean(opts.saved),
        published: Boolean(opts.published),
        notice: opts.notice || null,
      })
    );
    return res.status(opts.statusCode || 200).type("html").send(html);
  }

  async function handleGet(req, res, scope) {
    const loaded = await loadAdminServiceTimes(getPool(), {
      churchId: scope.churchId,
      branchId: scope.branchId,
    });
    if (!loaded.ok) {
      return renderEditor(req, res, scope, {
        entries: [],
        section: null,
        error:
          loaded.status === SERVICE_TIMES_STATUS.LOOKUP_ERROR
            ? "Service times could not be loaded. Try again shortly."
            : "Service times could not be prepared for this branch.",
        statusCode: loaded.status === SERVICE_TIMES_STATUS.LOOKUP_ERROR ? 503 : 400,
      });
    }
    return renderEditor(req, res, scope, {
      entries: loaded.entries,
      section: loaded.section,
      saved: String((req.query && req.query.saved) || "") === "1",
      published: String((req.query && req.query.published) || "") === "1",
      notice:
        String((req.query && req.query.saved) || "") === "1"
          ? String((req.query && req.query.published) || "") === "1"
            ? "Service times published."
            : "Service times saved as draft."
          : null,
    });
  }

  async function handlePost(req, res, scope) {
    const body = req.body || {};
    const submitted = body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return sendControlled(req, res, 403, "Invalid or missing CSRF token.", scope.shellKind);
    }

    const action = parseAction(body);
    const tenant = resolveTenantForAuthorization(req);
    const saved = await saveHomeServiceTimes(getPool(), {
      churchId: scope.churchId,
      branchId: scope.branchId,
      organizationId:
        (scope.organizationId ||
          (tenant && tenant.organization && tenant.organization.id)) ||
        null,
      actorUserId: actorUserId(req),
      formBody: body,
      action,
    });

    if (!saved.ok) {
      const loaded = await loadAdminServiceTimes(getPool(), {
        churchId: scope.churchId,
        branchId: scope.branchId,
      });
      return renderEditor(req, res, scope, {
        entries: [],
        section: (loaded && loaded.section) || null,
        error:
          saved.message ||
          (saved.status === SERVICE_TIMES_STATUS.LOOKUP_ERROR
            ? "Could not save service times. Try again shortly."
            : "Check the service times and try again."),
        statusCode:
          saved.status === SERVICE_TIMES_STATUS.INVALID_INPUT
            ? 400
            : saved.status === SERVICE_TIMES_STATUS.LOOKUP_ERROR
              ? 503
              : 400,
      });
    }

    const qs =
      action === "save_publish" ? "saved=1&published=1" : "saved=1&published=0";
    return res.redirect(303, `${scope.formAction}?${qs}`);
  }

  router.get(
    "/hq/website/branches/:branchKey/service-times",
    rejectApex,
    (req, res, next) =>
      gateSession(req, res, next, req.originalUrl || "/hq/website", "hq"),
    requireHq,
    async (req, res) => {
      const scope = await resolveHqBranchWebsiteScope(req, res);
      if (!scope) return;
      return handleGet(req, res, scope);
    }
  );

  router.post(
    "/hq/website/branches/:branchKey/service-times",
    rejectApex,
    (req, res, next) =>
      gateSession(req, res, next, req.originalUrl || "/hq/website", "hq"),
    requireHq,
    async (req, res) => {
      const scope = await resolveHqBranchWebsiteScope(req, res);
      if (!scope) return;
      return handlePost(req, res, scope);
    }
  );

  router.get(
    "/branch-admin/website/service-times",
    rejectApex,
    (req, res, next) =>
      gateSession(
        req,
        res,
        next,
        req.originalUrl || "/branch-admin/website/service-times",
        "branch"
      ),
    async (req, res, next) => {
      const tenant = resolveTenantForAuthorization(req);
      const session = req.v5Session && req.v5Session.session;
      try {
        const websiteScope = await resolveWebsiteScope(getPool(), {
          tenant,
          authenticatedUser: session && session.userId,
          requestedBranchKey: null,
        });
        let authzBranchId = null;
        if (websiteScope.ok && websiteScope.scopeType === SCOPE_TYPE.BRANCH) {
          authzBranchId = websiteScope.branchId;
        } else if (websiteScope.ok && websiteScope.scopeType === SCOPE_TYPE.CHURCH) {
          authzBranchId =
            tenant && tenant.primaryBranch && tenant.primaryBranch.id
              ? tenant.primaryBranch.id
              : null;
        }
        const authz = await authorizeBlessBoardTenantAccess(getPool(), {
          userId: session && session.userId,
          tenant,
          branchId: authzBranchId,
        });
        req.blessBoardAuthorizationContext = {
          ...authz.context,
          reason: authz.status,
        };
      } catch {
        /* requireBranchSurface will fail closed */
      }
      return requireBranchSurface(req, res, next);
    },
    async (req, res) => {
      const scope = await resolveBranchAdminWebsiteScope(req, res);
      if (!scope) return;
      return handleGet(req, res, scope);
    }
  );

  router.post(
    "/branch-admin/website/service-times",
    rejectApex,
    (req, res, next) =>
      gateSession(
        req,
        res,
        next,
        req.originalUrl || "/branch-admin/website/service-times",
        "branch"
      ),
    async (req, res, next) => {
      const tenant = resolveTenantForAuthorization(req);
      const session = req.v5Session && req.v5Session.session;
      try {
        const websiteScope = await resolveWebsiteScope(getPool(), {
          tenant,
          authenticatedUser: session && session.userId,
          requestedBranchKey: null,
        });
        let authzBranchId = null;
        if (websiteScope.ok && websiteScope.scopeType === SCOPE_TYPE.BRANCH) {
          authzBranchId = websiteScope.branchId;
        } else if (websiteScope.ok && websiteScope.scopeType === SCOPE_TYPE.CHURCH) {
          authzBranchId =
            tenant && tenant.primaryBranch && tenant.primaryBranch.id
              ? tenant.primaryBranch.id
              : null;
        }
        const authz = await authorizeBlessBoardTenantAccess(getPool(), {
          userId: session && session.userId,
          tenant,
          branchId: authzBranchId,
        });
        req.blessBoardAuthorizationContext = {
          ...authz.context,
          reason: authz.status,
        };
      } catch {
        /* requireBranchSurface will fail closed */
      }
      return requireBranchSurface(req, res, next);
    },
    async (req, res) => {
      const scope = await resolveBranchAdminWebsiteScope(req, res);
      if (!scope) return;
      return handlePost(req, res, scope);
    }
  );

  return router;
}

module.exports = {
  createWebsiteServiceTimesAdminRouter,
};
