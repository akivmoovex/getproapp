"use strict";

/**
 * BlessBoard V5 HQ / branch admin for tenant contact submissions.
 * Uses blessboard.public_contact_submissions (UUID church/branch/org scope).
 * Classic /branch/contact-submissions remains on the legacy INTEGER model.
 * Platform/apex access is denied (rejectApex + church-scoped permission).
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const express = require("express");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");

function renderView(relativePath, data) {
  const filename = path.join(VIEWS_ROOT, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  return ejs.render(source, data, { filename });
}

const {
  createRequireBlessBoardPermission,
} = require("./requireBlessBoardPermission");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const {
  createRequireV5AuthenticatedSession,
} = require("../../platform/http/v5SessionAuthGate");
const { buildBranchAdminShellLocals } = require("./branchAdminShellLocals");
const { buildHqAdminShellLocals } = require("./hqAdminShellLocals");
const {
  CSRF_FIELD,
  validateCsrf,
} = require("../../platform/http/v5Csrf");
const {
  listPublicContactSubmissionsForBranch,
  listPublicContactSubmissionsForChurch,
  findPublicContactSubmissionForBranch,
  findPublicContactSubmissionForChurch,
  updatePublicContactSubmissionStatusForBranch,
  updatePublicContactSubmissionStatusForChurch,
} = require("../repositories/publicContactSubmissionsRepository");

const VALID_STATUSES = ["new", "read", "resolved"];
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
<html lang="en"><head><meta charset="utf-8"/><title>Contact</title>
<link rel="stylesheet" href="/blessboard/v5/${css}"/></head>
<body class="${bodyClass}"><main><h1>Unavailable</h1><p>${safe}</p>
<p><a href="/">Church homepage</a></p></main></body></html>`);
}

function createContactSubmissionsAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const variant = deps.variant === "branch" ? "branch" : "hq";
  const isProduction = String(env.NODE_ENV || "") === "production";
  const shellKind = variant === "hq" ? "hq" : "branch";

  const router = express.Router();
  const requireAccess = createRequireBlessBoardPermission("requests.view", null, {
    getPool,
    scopeMode: variant === "hq" ? "church" : undefined,
  });

  const rejectApex = createRejectApex({
    isApexHost,
    sendUnavailable,
    mode: "unlessTenant",
  });

  const requireSession = createRequireV5AuthenticatedSession({
    loginNext: variant === "hq" ? "/hq/contact-submissions" : "/branch-admin/contact-submissions",
  });

  function gate(req, res, next) {
    const loginNext =
      variant === "hq" ? "/hq/contact-submissions" : "/branch-admin/contact-submissions";
    if (!requireSession(req, res, { loginNext: req.originalUrl || loginNext })) {
      return;
    }
    return requireAccess(req, res, next);
  }

  async function shellLocals(req, res, activeNav, extra) {
    const pageTitle = (extra && extra.pageTitle) || "Contact submissions";
    if (variant === "branch") {
      return buildBranchAdminShellLocals(req, res, {
        getPool,
        env,
        isProduction,
        activeNav,
        pageTitle,
        extra: { shellKind: "branch", ...(extra || {}) },
      });
    }
    return buildHqAdminShellLocals(req, res, {
      env,
      isProduction,
      getPool,
      activeNav,
      pageTitle,
      extra: { shellKind: "hq", ...(extra || {}) },
    });
  }

  function validateCsrfPost(req, res) {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      sendControlled(req, res, 403, "Invalid or missing CSRF token.", shellKind);
      return false;
    }
    return true;
  }

  async function resolveScope(req, res) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id) {
      sendControlled(req, res, 403, "You do not have access to this site.", shellKind);
      return null;
    }
    const organizationId =
      (tenant.organization && tenant.organization.id) ||
      (tenant.church && tenant.church.organizationId) ||
      null;
    if (!organizationId || !UUID_RE.test(String(organizationId))) {
      sendControlled(req, res, 403, "You do not have access to this site.", shellKind);
      return null;
    }
    const session = req.v5Session && req.v5Session.session;
    if (!session || !session.userId) {
      sendControlled(req, res, 401, "Sign-in is required.", shellKind);
      return null;
    }
    const branchId = tenant.primaryBranch ? tenant.primaryBranch.id : null;
    if (variant === "branch" && (!branchId || !UUID_RE.test(String(branchId)))) {
      sendControlled(req, res, 403, "Branch context is required.", shellKind);
      return null;
    }
    const basePath =
      variant === "hq" ? "/hq/contact-submissions" : "/branch-admin/contact-submissions";
    return {
      tenant,
      churchId: tenant.church.id,
      organizationId,
      branchId,
      basePath,
      actorUserId: session.userId,
    };
  }

  function presentSubmissions(rows) {
    return (rows || []).map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      message: row.message,
      status: row.status,
      createdAt: row.created_at,
      branchId: row.branch_id,
    }));
  }

  const listPath =
    variant === "hq" ? "/hq/contact-submissions" : "/branch-admin/contact-submissions";
  const detailPath =
    variant === "hq"
      ? "/hq/contact-submissions/:id"
      : "/branch-admin/contact-submissions/:id";
  const statusPath =
    variant === "hq"
      ? "/hq/contact-submissions/:id/status"
      : "/branch-admin/contact-submissions/:id/status";

  router.get(listPath, rejectApex, gate, async (req, res) => {
    const scope = await resolveScope(req, res);
    if (!scope) return;

    const statusFilter = String((req.query && req.query.status) || "")
      .trim()
      .toLowerCase();
    const effectiveStatusFilter = VALID_STATUSES.includes(statusFilter) ? statusFilter : "";

    let submissions = [];
    if (variant === "hq") {
      submissions = await listPublicContactSubmissionsForChurch(
        getPool(),
        scope.churchId,
        scope.organizationId,
        { status: effectiveStatusFilter || null }
      );
    } else {
      submissions = await listPublicContactSubmissionsForBranch(
        getPool(),
        scope.churchId,
        scope.branchId,
        { status: effectiveStatusFilter || null }
      );
    }

    const shell = await shellLocals(req, res, "contact", {
      submissions: presentSubmissions(submissions),
      statusFilter: effectiveStatusFilter,
      classicUnavailable: false,
      basePath: scope.basePath,
      saved: String((req.query && req.query.saved) || ""),
    });
    const html = renderView(
      variant === "hq" ? "hq-admin/contact-submissions.ejs" : "branch-admin/contact-submissions.ejs",
      shell
    );
    return res.status(200).type("html").send(html);
  });

  router.get(detailPath, rejectApex, gate, async (req, res) => {
    const scope = await resolveScope(req, res);
    if (!scope) return;

    const id = String(req.params.id || "").trim();
    if (!UUID_RE.test(id)) {
      return sendControlled(req, res, 404, "Not found.", shellKind);
    }

    let submission = null;
    if (variant === "hq") {
      submission = await findPublicContactSubmissionForChurch(
        getPool(),
        id,
        scope.churchId,
        scope.organizationId
      );
    } else {
      submission = await findPublicContactSubmissionForBranch(
        getPool(),
        id,
        scope.churchId,
        scope.branchId
      );
    }

    if (!submission) {
      return sendControlled(req, res, 404, "Not found.", shellKind);
    }

    if (submission.status === "new") {
      if (variant === "hq") {
        await updatePublicContactSubmissionStatusForChurch(
          getPool(),
          id,
          scope.churchId,
          scope.organizationId,
          { status: "read", reviewed_by_user_id: scope.actorUserId }
        );
      } else {
        await updatePublicContactSubmissionStatusForBranch(
          getPool(),
          id,
          scope.churchId,
          scope.branchId,
          { status: "read", reviewed_by_user_id: scope.actorUserId }
        );
      }
      submission.status = "read";
    }

    const shell = await shellLocals(req, res, "contact", {
      pageTitle: submission.full_name || "Contact submission",
      submission: {
        id: submission.id,
        fullName: submission.full_name,
        email: submission.email,
        phone: submission.phone,
        message: submission.message,
        status: submission.status,
        createdAt: submission.created_at,
      },
      basePath: scope.basePath,
      saved: String((req.query && req.query.saved) || ""),
      error: String((req.query && req.query.error) || ""),
    });
    const html = renderView(
      variant === "hq"
        ? "hq-admin/contact-submission-detail.ejs"
        : "branch-admin/contact-submission-detail.ejs",
      shell
    );
    return res.status(200).type("html").send(html);
  });

  router.post(statusPath, rejectApex, gate, async (req, res) => {
    if (!validateCsrfPost(req, res)) return;

    const scope = await resolveScope(req, res);
    if (!scope) return;

    const id = String(req.params.id || "").trim();
    if (!UUID_RE.test(id)) {
      return res.redirect(303, `${scope.basePath}?error=not_found`);
    }

    const newStatus = String((req.body && req.body.status) || "")
      .trim()
      .toLowerCase();
    if (!VALID_STATUSES.includes(newStatus)) {
      return res.redirect(303, `${scope.basePath}/${id}?error=invalid_status`);
    }

    let updated = null;
    if (variant === "hq") {
      updated = await updatePublicContactSubmissionStatusForChurch(
        getPool(),
        id,
        scope.churchId,
        scope.organizationId,
        { status: newStatus, reviewed_by_user_id: scope.actorUserId }
      );
    } else {
      updated = await updatePublicContactSubmissionStatusForBranch(
        getPool(),
        id,
        scope.churchId,
        scope.branchId,
        { status: newStatus, reviewed_by_user_id: scope.actorUserId }
      );
    }

    if (!updated) {
      return res.redirect(303, `${scope.basePath}/${id}?error=not_found`);
    }
    return res.redirect(303, `${scope.basePath}/${id}?saved=status`);
  });

  return router;
}

module.exports = {
  createContactSubmissionsAdminRouter,
};
