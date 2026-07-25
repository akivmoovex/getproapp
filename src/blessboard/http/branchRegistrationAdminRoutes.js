"use strict";

/**
 * Branch-admin member registration review + member directory (hostname primary branch scope).
 * HQ/platform may open registrations by key within the same church.
 */

const express = require("express");

const {
  createRequireBlessBoardTenantRole,
} = require("./requireBlessBoardTenantRole");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const { CSRF_FIELD, validateCsrf } = require("../../platform/http/v5Csrf");
const {
  listMemberRegistrations,
  getMemberRegistrationForManager,
  approveMemberRegistration,
  rejectMemberRegistration,
  reviewMemberRegistration,
  listBranchMembersForManager,
  getBranchMemberForManager,
  STATUS,
} = require("../services/memberRegistrationService");
const {
  renderBranchAdminView,
  sendLoginUnavailable,
} = require("./branchAdminRoutes");
const { buildBranchAdminShellLocals } = require("./branchAdminShellLocals");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const isProduction = String(env.NODE_ENV || "") === "production";

  const router = express.Router();
  const requireAccess = createRequireBlessBoardTenantRole({
    getPool,
    allowedRoles: ["platform_admin", "church_hq_admin", "branch_admin"],
  });

  function sendMissingTenantContext(req, res) {
    return sendLoginUnavailable(
      req,
      res,
      403,
      "Your account is signed in, but this branch workspace could not be loaded. Confirm you are assigned to an active organization and branch, then sign in again."
    );
  }

  const rejectApex = createRejectApex({
    isApexHost,
    mode: "unlessTenant",
    sendUnavailable: (req, res) => {
      if (!(req.v5Session && req.v5Session.authenticated)) {
        const wantsHtml = String(req.get("accept") || "").includes("text/html");
        if (wantsHtml) {
          return res.redirect(303, "/login?next=/branch-admin/registrations");
        }
        return sendLoginUnavailable(req, res, 401, "Sign-in is required.");
      }
      return sendMissingTenantContext(req, res);
    },
  });

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
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || tenant.resolved !== true) {
      return sendMissingTenantContext(req, res);
    }
    return requireAccess(req, res, next);
  }

  function shellLocals(req, res, activeNav, extra) {
    return buildBranchAdminShellLocals(req, res, {
      env,
      isProduction,
      activeNav,
      extra,
    });
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

  // --- registrations ---
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
      shellLocals(req, res, "registrations", {
        pageTitle: "Verification queue",
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

      const html = renderBranchAdminView(
        "branch-admin/registration-detail.ejs",
        shellLocals(req, res, "registrations", {
          pageTitle: "Registration review",
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
        shellLocals(req, res, "registrations", {
          pageTitle: "Registration review",
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

  // --- members directory (read-only; privacy-limited) ---
  router.get("/branch-admin/members", rejectApex, gateAccess, async (req, res) => {
    const scope = hostScope(req, res);
    if (!scope) return;

    const q = String((req.query && req.query.q) || "").slice(0, 100);
    const status = String((req.query && req.query.status) || "").trim().toLowerCase();
    const page = Math.max(Number((req.query && req.query.page) || 1) || 1, 1);
    const limit = 20;
    const offset = (page - 1) * limit;

    const listed = await listBranchMembersForManager(getPool(), {
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
        op: "members_list",
        outcome: "denied",
        churchId: scope.churchId,
        branchId: scope.branchId,
        reason: listed.reason,
      });
      return sendLoginUnavailable(
        req,
        res,
        listed.status === STATUS.FORBIDDEN ? 403 : 503,
        "Members are temporarily unavailable."
      );
    }

    const totalPages = Math.max(1, Math.ceil(listed.total / limit));
    const html = renderBranchAdminView(
      "branch-admin/members.ejs",
      shellLocals(req, res, "members", {
        pageTitle: "Member directory",
        items: listed.items,
        total: listed.total,
        page,
        totalPages,
        limit,
        q,
        statusFilter: status,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/branch-admin/members/:id", rejectApex, gateAccess, async (req, res) => {
    const scope = hostScope(req, res);
    if (!scope) return;
    const id = String(req.params.id || "").trim();
    if (!UUID_RE.test(id)) {
      return sendLoginUnavailable(req, res, 404, "Member not found.");
    }

    const loaded = await getBranchMemberForManager(getPool(), {
      memberId: id,
      actorUserId: scope.actorUserId,
      churchId: scope.churchId,
      branchId: scope.branchId,
    });

    if (!loaded.ok || !loaded.member) {
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
        code === 404 ? "Member not found." : "You do not have access to this member."
      );
    }

    const html = renderBranchAdminView(
      "branch-admin/member-detail.ejs",
      shellLocals(req, res, "members", {
        pageTitle: "Member profile",
        member: loaded.member,
      })
    );
    return res.status(200).type("html").send(html);
  });

  return router;
}

module.exports = {
  createBranchRegistrationAdminRouter,
};
