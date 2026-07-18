"use strict";

/**
 * BlessBoard V5 HQ / branch admin views for ministry + event participation.
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const express = require("express");

const {
  createRequireBlessBoardTenantRole,
} = require("./requireBlessBoardTenantRole");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { formatRoleLabel } = require("./renderTenantLandingPage");
const {
  CSRF_FIELD,
  issueCsrfToken,
  validateCsrf,
  setCsrfCookie,
} = require("../../platform/http/v5Csrf");
const {
  STATUS,
  listAdminMinistryParticipation,
  reviewMinistryMembership,
  listAdminEventParticipation,
} = require("../services/participationService");
const {
  resolveBlessBoardBranchForChurch,
} = require("../services/listBlessBoardBranches");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function renderView(relativePath, data) {
  const filename = path.join(VIEWS_ROOT, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  return ejs.render(source, data, { filename });
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sendControlled(req, res, status, message, shellKind) {
  const safe = escapeHtml(message);
  const wantsHtml = String(req.get("accept") || "").includes("text/html");
  if (!wantsHtml) {
    return res.status(status).type("text").send(String(message == null ? "" : message));
  }
  const css = shellKind === "hq" ? "hq-admin.css" : "branch-admin.css";
  const bodyClass = shellKind === "hq" ? "bb-hq-body" : "bb-ba-body";
  return res.status(status).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Participation</title>
<link rel="stylesheet" href="/blessboard/v5/${css}"/></head>
<body class="${bodyClass}"><main><h1>Unavailable</h1><p>${safe}</p>
<p><a href="/">Church homepage</a></p></main></body></html>`);
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 *   sendUnavailable?: Function,
 *   variant: 'hq' | 'branch',
 * }} deps
 */
function createParticipationAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const variant = deps.variant === "branch" ? "branch" : "hq";
  const isProduction = String(env.NODE_ENV || "") === "production";
  const shellKind = variant === "hq" ? "hq" : "branch";
  const loginNext =
    variant === "hq" ? "/hq/participation" : "/branch-admin/participation";

  const allowedRoles =
    variant === "hq"
      ? ["church_hq_admin", "platform_admin"]
      : ["platform_admin", "church_hq_admin", "branch_admin"];

  const router = express.Router();
  const requireAccess = createRequireBlessBoardTenantRole({ getPool, allowedRoles });

  function rejectApex(req, res, next) {
    if (isApexHost(req)) {
      if (typeof sendUnavailable === "function") return sendUnavailable(req, res);
      return res.status(503).type("text").send("Unavailable");
    }
    return next();
  }

  function gate(req, res, next) {
    const sessionOk = Boolean(req.v5Session && req.v5Session.authenticated);
    if (!sessionOk) {
      const wantsHtml = String(req.get("accept") || "").includes("text/html");
      if (wantsHtml) {
        return res.redirect(303, `/login?next=${encodeURIComponent(req.originalUrl || loginNext)}`);
      }
      return sendControlled(req, res, 401, "Sign-in is required.", shellKind);
    }
    return requireAccess(req, res, next);
  }

  function primaryRoleLabel(req) {
    const roles =
      req.blessBoardAuthorizationContext && req.blessBoardAuthorizationContext.effectiveRoles
        ? req.blessBoardAuthorizationContext.effectiveRoles
        : [];
    const order =
      variant === "hq"
        ? ["church_hq_admin", "platform_admin", "branch_admin"]
        : ["branch_admin", "church_hq_admin", "platform_admin"];
    for (const key of order) {
      const hit = roles.find((r) => r.roleKey === key);
      if (hit) return formatRoleLabel(hit.roleKey);
    }
    return roles[0] ? formatRoleLabel(roles[0].roleKey) : variant === "hq" ? "HQ admin" : "Branch admin";
  }

  function shellLocals(req, res, extra) {
    const tenant = resolveTenantForAuthorization(req);
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction });
    const base = {
      pageTitle: "Participation",
      activeNav: "participation",
      shellKind,
      csrfToken,
      churchDisplayName: tenant && tenant.church ? tenant.church.displayName : "",
      roleLabel: primaryRoleLabel(req),
      displayName:
        req.v5Session && req.v5Session.session && req.v5Session.session.user
          ? req.v5Session.session.user.displayName
          : "",
      ...(extra || {}),
    };
    if (variant === "hq") {
      base.hqBranchDisplayName = tenant && tenant.hqBranch ? tenant.hqBranch.displayName : "";
    } else {
      base.branchDisplayName =
        tenant && tenant.primaryBranch ? tenant.primaryBranch.displayName : "";
    }
    return base;
  }

  async function resolveScope(req, res) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id) {
      sendControlled(req, res, 403, "You do not have access to this site.", shellKind);
      return null;
    }
    const session = req.v5Session && req.v5Session.session;
    if (!session || !session.userId) {
      sendControlled(req, res, 401, "Sign-in is required.", shellKind);
      return null;
    }
    if (variant === "branch") {
      if (!tenant.primaryBranch || !tenant.primaryBranch.id) {
        sendControlled(req, res, 403, "You do not have access to this site.", shellKind);
        return null;
      }
      return {
        churchId: tenant.church.id,
        branchId: tenant.primaryBranch.id,
        basePath: "/branch-admin/participation",
        tenant,
        actorUserId: session.userId,
      };
    }
    const branchKey = req.params && req.params.branchKey ? String(req.params.branchKey) : "";
    if (branchKey) {
      const resolved = await resolveBlessBoardBranchForChurch(getPool(), {
        churchId: tenant.church.id,
        branchKey,
      });
      if (!resolved.ok || !resolved.branch) {
        sendControlled(req, res, 404, "Branch not found.", shellKind);
        return null;
      }
      return {
        churchId: tenant.church.id,
        branchId: resolved.branch.id,
        basePath: `/hq/participation/b/${resolved.branch.key}`,
        tenant,
        actorUserId: session.userId,
      };
    }
    return {
      churchId: tenant.church.id,
      branchId: null,
      basePath: "/hq/participation",
      tenant,
      actorUserId: session.userId,
    };
  }

  function registerRoutes(mountPrefix) {
    router.get(mountPrefix, rejectApex, gate, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const ministries = await listAdminMinistryParticipation(getPool(), {
        churchId: scope.churchId,
        branchId: scope.branchId,
        actorUserId: scope.actorUserId,
        tenant: scope.tenant,
      });
      const events = await listAdminEventParticipation(getPool(), {
        churchId: scope.churchId,
        branchId: scope.branchId,
        actorUserId: scope.actorUserId,
        tenant: scope.tenant,
      });
      if (!ministries.ok || !events.ok) {
        return sendControlled(
          req,
          res,
          ministries.status === STATUS.FORBIDDEN || events.status === STATUS.FORBIDDEN ? 403 : 503,
          "Participation is temporarily unavailable.",
          shellKind
        );
      }
      const html = renderView(
        "participation/admin-overview.ejs",
        shellLocals(req, res, {
          basePath: scope.basePath,
          ministries: ministries.items,
          events: events.items,
          saved: String((req.query && req.query.saved) || ""),
        })
      );
      return res.status(200).type("html").send(html);
    });

    router.post(
      `${mountPrefix}/ministries/memberships/:id/review`,
      rejectApex,
      gate,
      async (req, res) => {
        const submitted = req.body && req.body[CSRF_FIELD];
        if (!validateCsrf(req, submitted, env)) {
          return sendControlled(req, res, 403, "Invalid or missing CSRF token.", shellKind);
        }
        const scope = await resolveScope(req, res);
        if (!scope) return;
        const id = String(req.params.id || "");
        if (!UUID_RE.test(id)) {
          return sendControlled(req, res, 404, "Membership not found.", shellKind);
        }
        const reviewed = await reviewMinistryMembership(getPool(), {
          churchId: scope.churchId,
          membershipId: id,
          actorUserId: scope.actorUserId,
          tenant: scope.tenant,
          scopeBranchId: scope.branchId,
          decision: req.body && req.body.decision,
          reviewNotes: req.body && req.body.review_notes,
        });
        if (!reviewed.ok) {
          const code =
            reviewed.status === STATUS.FORBIDDEN
              ? 403
              : reviewed.status === STATUS.NOT_FOUND
                ? 404
                : 400;
          return sendControlled(req, res, code, "Could not review membership.", shellKind);
        }
        return res.redirect(303, `${scope.basePath}?saved=reviewed`);
      }
    );
  }

  if (variant === "hq") {
    registerRoutes("/hq/participation");
    registerRoutes("/hq/participation/b/:branchKey");
  } else {
    registerRoutes("/branch-admin/participation");
  }

  return router;
}

module.exports = {
  createParticipationAdminRouter,
};
