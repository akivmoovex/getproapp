"use strict";

/**
 * Branch-admin member registration review (hostname primary branch scope).
 * HQ/platform may act on other branches in the same church when opening a registration by key.
 */

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
  listMemberRegistrations,
  getMemberRegistrationForManager,
  approveMemberRegistration,
  rejectMemberRegistration,
  reviewMemberRegistration,
  STATUS,
} = require("../services/memberRegistrationService");
const {
  renderBranchAdminView,
  sendLoginUnavailable,
} = require("./branchAdminRoutes");

/**
 * Safe structured log — no PII / no rejection notes.
 * @param {object} fields
 */
function logReviewEvent(fields) {
  try {
    // eslint-disable-next-line no-console
    console.info(
      JSON.stringify({
        scope: "blessboard.member_registration_review",
        ...fields,
      })
    );
  } catch {
    /* ignore */
  }
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 *   sendUnavailable?: Function,
 * }} deps
 */
function createBranchRegistrationAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const isProduction = String(env.NODE_ENV || "") === "production";

  const router = express.Router();
  const requireAccess = createRequireBlessBoardTenantRole({
    getPool,
    allowedRoles: ["platform_admin", "church_hq_admin", "branch_admin"],
  });

  function rejectApex(req, res, next) {
    if (isApexHost(req)) {
      if (typeof sendUnavailable === "function") return sendUnavailable(req, res);
      return res.status(503).type("text").send("Unavailable");
    }
    return next();
  }

  function gateAccess(req, res, next) {
    const sessionOk = Boolean(req.v5Session && req.v5Session.authenticated);
    if (!sessionOk) {
      const wantsHtml = String(req.get("accept") || "").includes("text/html");
      if (wantsHtml) {
        const nextUrl = encodeURIComponent(req.originalUrl || "/branch-admin/registrations");
        return res.redirect(303, `/login?next=${nextUrl}`);
      }
      return sendLoginUnavailable(req, res, 401, "Sign-in is required.");
    }
    return requireAccess(req, res, next);
  }

  function primaryRoleLabel(req) {
    const roles =
      req.blessBoardAuthorizationContext && req.blessBoardAuthorizationContext.effectiveRoles
        ? req.blessBoardAuthorizationContext.effectiveRoles
        : [];
    const order = ["branch_admin", "church_hq_admin", "platform_admin"];
    for (const key of order) {
      const hit = roles.find((r) => r.roleKey === key);
      if (hit) return formatRoleLabel(hit.roleKey);
    }
    return roles[0] ? formatRoleLabel(roles[0].roleKey) : "Branch admin";
  }

  function shellLocals(req, res, extra) {
    const tenant = resolveTenantForAuthorization(req);
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction });
    const session = req.v5Session && req.v5Session.session ? req.v5Session.session : null;
    return {
      pageTitle: "Registrations",
      activeNav: "registrations",
      csrfToken,
      churchDisplayName: tenant && tenant.church ? tenant.church.displayName : "",
      branchDisplayName:
        tenant && tenant.primaryBranch ? tenant.primaryBranch.displayName : "",
      roleLabel: primaryRoleLabel(req),
      displayName: session && session.user ? session.user.displayName : "",
      ...(extra || {}),
    };
  }

  function hostScope(req, res) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id || !tenant.primaryBranch) {
      sendLoginUnavailable(req, res, 403, "You do not have access to this site.");
      return null;
    }
    const session = req.v5Session && req.v5Session.session;
    if (!session || !session.userId) {
      sendLoginUnavailable(req, res, 401, "Sign-in is required.");
      return null;
    }
    return {
      churchId: tenant.church.id,
      branchId: tenant.primaryBranch.id,
      actorUserId: session.userId,
    };
  }

  function validateCsrfPost(req, res) {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      sendLoginUnavailable(req, res, 403, "Invalid or missing CSRF token.");
      return false;
    }
    return true;
  }

  router.get("/branch-admin/registrations", rejectApex, gateAccess, async (req, res) => {
    const scope = hostScope(req, res);
    if (!scope) return;

    const q = String((req.query && req.query.q) || "").slice(0, 100);
    const status = String((req.query && req.query.status) || "").trim().toLowerCase();
    const page = Math.max(Number((req.query && req.query.page) || 1) || 1, 1);
    const limit = 20;
    const offset = (page - 1) * limit;

    const listed = await listMemberRegistrations(getPool(), {
      actorUserId: scope.actorUserId,
      churchId: scope.churchId,
      branchId: scope.branchId,
      status: status || null,
      q: q || null,
      limit,
      offset,
    });

    if (!listed.ok) {
      logReviewEvent({
        op: "list",
        outcome: "denied",
        churchId: scope.churchId,
        branchId: scope.branchId,
        reason: listed.reason,
      });
      return sendLoginUnavailable(
        req,
        res,
        listed.status === STATUS.FORBIDDEN ? 403 : 503,
        "Registrations are temporarily unavailable."
      );
    }

    const totalPages = Math.max(1, Math.ceil(listed.total / limit));
    const html = renderBranchAdminView(
      "branch-admin/registrations.ejs",
      shellLocals(req, res, {
        items: listed.items,
        total: listed.total,
        page,
        totalPages,
        limit,
        q,
        statusFilter: status,
        error: null,
        saved: String((req.query && req.query.saved) || ""),
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get(
    "/branch-admin/registrations/:registrationKey",
    rejectApex,
    gateAccess,
    async (req, res) => {
      const scope = hostScope(req, res);
      if (!scope) return;
      const registrationKey = String(req.params.registrationKey || "").trim();

      const loaded = await getMemberRegistrationForManager(getPool(), {
        registrationId: registrationKey,
        actorUserId: scope.actorUserId,
        churchId: scope.churchId,
      });

      if (!loaded.ok || !loaded.registration) {
        const code =
          loaded.status === STATUS.FORBIDDEN
            ? 403
            : loaded.status === STATUS.NOT_FOUND
              ? 404
              : 503;
        return sendLoginUnavailable(
          req,
          res,
          code,
          code === 404 ? "Registration not found." : "You do not have access to this registration."
        );
      }

      // Branch-admin hostname list is primary-branch scoped; detail for another branch
      // is only allowed when getMemberRegistrationForManager already authorized (HQ/platform).
      const html = renderBranchAdminView(
        "branch-admin/registration-detail.ejs",
        shellLocals(req, res, {
          registration: loaded.registration,
          hostBranchId: scope.branchId,
          error: null,
          saved: String((req.query && req.query.saved) || ""),
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  async function postDecision(req, res, action) {
    const scope = hostScope(req, res);
    if (!scope) return;
    if (!validateCsrfPost(req, res)) return;

    const registrationKey = String(req.params.registrationKey || "").trim();
    const reviewNotes =
      req.body && req.body.review_notes != null ? String(req.body.review_notes) : null;

    const loaded = await getMemberRegistrationForManager(getPool(), {
      registrationId: registrationKey,
      actorUserId: scope.actorUserId,
      churchId: scope.churchId,
    });
    if (!loaded.ok || !loaded.registration) {
      return sendLoginUnavailable(req, res, 403, "You do not have access to this registration.");
    }

    let result;
    if (action === "approve") {
      // Account creation is not offered in this phase — ignore any client flag.
      result = await approveMemberRegistration(getPool(), {
        registrationId: registrationKey,
        actorUserId: scope.actorUserId,
        reviewNotes,
      });
    } else if (action === "reject") {
      result = await rejectMemberRegistration(getPool(), {
        registrationId: registrationKey,
        actorUserId: scope.actorUserId,
        reviewNotes,
      });
    } else {
      result = await reviewMemberRegistration(getPool(), {
        registrationId: registrationKey,
        actorUserId: scope.actorUserId,
      });
    }

    logReviewEvent({
      op: action,
      outcome: result.ok ? "ok" : "fail",
      churchId: scope.churchId,
      branchId: loaded.registration.branchId,
      registrationId: registrationKey,
      reason: result.ok ? null : result.reason || result.status,
    });

    if (!result.ok) {
      const html = renderBranchAdminView(
        "branch-admin/registration-detail.ejs",
        shellLocals(req, res, {
          registration: loaded.registration,
          hostBranchId: scope.branchId,
          error: "This registration could not be updated. It may have already been decided.",
          saved: "",
        })
      );
      return res.status(409).type("html").send(html);
    }

    return res.redirect(
      303,
      `/branch-admin/registrations/${encodeURIComponent(registrationKey)}?saved=${action}`
    );
  }

  router.post(
    "/branch-admin/registrations/:registrationKey/approve",
    rejectApex,
    gateAccess,
    (req, res, next) => {
      Promise.resolve(postDecision(req, res, "approve")).catch(next);
    }
  );

  router.post(
    "/branch-admin/registrations/:registrationKey/reject",
    rejectApex,
    gateAccess,
    (req, res, next) => {
      Promise.resolve(postDecision(req, res, "reject")).catch(next);
    }
  );

  return router;
}

module.exports = {
  createBranchRegistrationAdminRouter,
};
