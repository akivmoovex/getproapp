"use strict";

/**
 * HQ church-wide member registration oversight + member directory (read/review).
 * Active branch filter by key; no branch UUIDs in HTML; privacy-limited fields.
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const express = require("express");

const {
  createRequireBlessBoardTenantRole,
} = require("./requireBlessBoardTenantRole");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { buildHqAdminShellLocals } = require("./hqAdminShellLocals");
const {
  listMemberRegistrations,
  getMemberRegistrationForManager,
  listChurchMembersForManager,
  getChurchMemberForManager,
  STATUS,
} = require("../services/memberRegistrationService");
const {
  listBlessBoardBranches,
  resolveBlessBoardBranchForChurch,
  STATUS: BRANCH_STATUS,
} = require("../services/listBlessBoardBranches");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAGE_LIMIT = 20;

function renderHqView(relativePath, data) {
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

function sendControlled(req, res, status, message) {
  const safe = escapeHtml(message);
  const wantsHtml = String(req.get("accept") || "").includes("text/html");
  if (!wantsHtml) {
    return res.status(status).type("text").send(String(message == null ? "" : message));
  }
  return res.status(status).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>HQ</title>
<link rel="stylesheet" href="/blessboard/v5/hq-admin.css?v=46"/></head>
<body class="bb-hq-body"><main class="bb-hq-login-unavailable">
<h1>Unavailable</h1><p>${safe}</p><p><a href="/hq">Church HQ</a></p>
</main></body></html>`);
}

function presentRegistration(reg) {
  if (!reg) return null;
  return {
    id: reg.id,
    firstName: reg.firstName,
    lastName: reg.lastName,
    preferredName: reg.preferredName,
    emailDisplay: reg.emailDisplay,
    phoneDisplay: reg.phoneDisplay,
    status: reg.status,
    reviewNotes: reg.reviewNotes,
    reviewedAt: reg.reviewedAt,
    createdAt: reg.createdAt,
    updatedAt: reg.updatedAt,
    memberId: reg.memberId || null,
    branchKey: reg.branchKey || null,
    branchDisplayName: reg.branchDisplayName || null,
  };
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 *   sendUnavailable?: Function,
 * }} deps
 */
function createHqMembersAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const isProduction = String(env.NODE_ENV || "") === "production";

  const router = express.Router();
  const requireHqAccess = createRequireBlessBoardTenantRole({
    getPool,
    allowedRoles: ["church_hq_admin", "platform_admin"],
  });

  function rejectApex(req, res, next) {
    if (isApexHost(req)) {
      if (typeof sendUnavailable === "function") return sendUnavailable(req, res);
      return res.status(503).type("text").send("Unavailable");
    }
    return next();
  }

  function gateHq(req, res, next) {
    const sessionOk = Boolean(req.v5Session && req.v5Session.authenticated);
    if (!sessionOk) {
      const wantsHtml = String(req.get("accept") || "").includes("text/html");
      if (wantsHtml) {
        return res.redirect(303, `/login?next=${encodeURIComponent(req.originalUrl || "/hq/registrations")}`);
      }
      return sendControlled(req, res, 401, "Sign-in is required.");
    }
    return requireHqAccess(req, res, next);
  }

  function shellLocals(req, res, activeNav, extra) {
    return buildHqAdminShellLocals(req, res, {
      env,
      isProduction,
      activeNav,
      extra,
    });
  }

  function hqScope(req, res) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id) {
      sendControlled(req, res, 403, "You do not have access to this site.");
      return null;
    }
    const session = req.v5Session && req.v5Session.session;
    if (!session || !session.userId) {
      sendControlled(req, res, 401, "Sign-in is required.");
      return null;
    }
    return {
      churchId: tenant.church.id,
      actorUserId: session.userId,
      tenant,
    };
  }

  async function resolveOptionalBranchFilter(scope, branchKeyRaw) {
    const key = String(branchKeyRaw || "")
      .trim()
      .toLowerCase();
    if (!key) return { ok: true, branchId: null, branchKey: "" };
    const resolved = await resolveBlessBoardBranchForChurch(getPool(), scope.churchId, key);
    if (!resolved.ok) {
      if (resolved.status === BRANCH_STATUS.LOOKUP_ERROR) {
        return { ok: false, status: 503, message: "Branch list is temporarily unavailable." };
      }
      return { ok: false, status: 404, message: "That branch is not available for this church." };
    }
    return {
      ok: true,
      branchId: resolved.branch.id,
      branchKey: resolved.branch.key,
    };
  }

  router.get("/hq/registrations", rejectApex, gateHq, async (req, res) => {
    const scope = hqScope(req, res);
    if (!scope) return;

    const q = String((req.query && req.query.q) || "").slice(0, 100);
    const status = String((req.query && req.query.status) || "")
      .trim()
      .toLowerCase();
    const branchKey = String((req.query && req.query.branch) || "")
      .trim()
      .toLowerCase();
    const page = Math.max(Number((req.query && req.query.page) || 1) || 1, 1);
    const offset = (page - 1) * PAGE_LIMIT;

    const branchFilter = await resolveOptionalBranchFilter(scope, branchKey);
    if (!branchFilter.ok) {
      return sendControlled(req, res, branchFilter.status, branchFilter.message);
    }

    const listed = await listMemberRegistrations(getPool(), {
      actorUserId: scope.actorUserId,
      churchId: scope.churchId,
      branchId: branchFilter.branchId,
      status: status || null,
      q: q || null,
      limit: PAGE_LIMIT,
      offset,
    });
    if (!listed.ok) {
      return sendControlled(
        req,
        res,
        listed.status === STATUS.FORBIDDEN ? 403 : 503,
        "Registrations are temporarily unavailable."
      );
    }

    const branches = await listBlessBoardBranches(getPool(), scope.churchId);
    const totalPages = Math.max(1, Math.ceil(listed.total / PAGE_LIMIT));
    const html = renderHqView(
      "hq/registrations.ejs",
      shellLocals(req, res, "registrations", {
        pageTitle: "Registration oversight",
        items: listed.items,
        total: listed.total,
        page,
        totalPages,
        limit: PAGE_LIMIT,
        q,
        statusFilter: status,
        branchFilter: branchFilter.branchKey,
        branches: branches.ok ? branches.branches : [],
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/hq/registrations/:registrationKey", rejectApex, gateHq, async (req, res) => {
    const scope = hqScope(req, res);
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
      return sendControlled(
        req,
        res,
        code,
        code === 404 ? "Registration not found." : "You do not have access to this registration."
      );
    }

    const html = renderHqView(
      "hq/registration-detail.ejs",
      shellLocals(req, res, "registrations", {
        pageTitle: "Registration review",
        registration: presentRegistration(loaded.registration),
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/hq/members", rejectApex, gateHq, async (req, res) => {
    const scope = hqScope(req, res);
    if (!scope) return;

    const q = String((req.query && req.query.q) || "").slice(0, 100);
    const status = String((req.query && req.query.status) || "")
      .trim()
      .toLowerCase();
    const branchKey = String((req.query && req.query.branch) || "")
      .trim()
      .toLowerCase();
    const page = Math.max(Number((req.query && req.query.page) || 1) || 1, 1);
    const offset = (page - 1) * PAGE_LIMIT;

    const branchFilter = await resolveOptionalBranchFilter(scope, branchKey);
    if (!branchFilter.ok) {
      return sendControlled(req, res, branchFilter.status, branchFilter.message);
    }

    const listed = await listChurchMembersForManager(getPool(), {
      actorUserId: scope.actorUserId,
      churchId: scope.churchId,
      branchId: branchFilter.branchId,
      status: status || null,
      q: q || null,
      limit: PAGE_LIMIT,
      offset,
    });
    if (!listed.ok) {
      return sendControlled(
        req,
        res,
        listed.status === STATUS.FORBIDDEN ? 403 : 503,
        "Members are temporarily unavailable."
      );
    }

    const branches = await listBlessBoardBranches(getPool(), scope.churchId);
    const totalPages = Math.max(1, Math.ceil(listed.total / PAGE_LIMIT));
    const html = renderHqView(
      "hq/members.ejs",
      shellLocals(req, res, "members", {
        pageTitle: "Member directory",
        items: listed.items,
        total: listed.total,
        page,
        totalPages,
        limit: PAGE_LIMIT,
        q,
        statusFilter: status,
        branchFilter: branchFilter.branchKey,
        branches: branches.ok ? branches.branches : [],
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/hq/members/:id", rejectApex, gateHq, async (req, res) => {
    const scope = hqScope(req, res);
    if (!scope) return;
    const id = String(req.params.id || "").trim();
    if (!UUID_RE.test(id)) {
      return sendControlled(req, res, 404, "Member not found.");
    }

    const loaded = await getChurchMemberForManager(getPool(), {
      memberId: id,
      actorUserId: scope.actorUserId,
      churchId: scope.churchId,
    });
    if (!loaded.ok || !loaded.member) {
      const code =
        loaded.status === STATUS.FORBIDDEN
          ? 403
          : loaded.status === STATUS.NOT_FOUND
            ? 404
            : 503;
      return sendControlled(
        req,
        res,
        code,
        code === 404 ? "Member not found." : "You do not have access to this member."
      );
    }

    const html = renderHqView(
      "hq/member-detail.ejs",
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
  createHqMembersAdminRouter,
};
