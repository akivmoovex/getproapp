"use strict";

/**
 * BlessBoard V5 HQ / branch aggregate attendance admin.
 * Aggregate category counts only — no individual-member attendance.
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const express = require("express");

const {
  createRequireBlessBoardTenantRole,
} = require("./requireBlessBoardTenantRole");
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
  STATUS,
  EVENT_TYPES,
  CATEGORIES,
  createAttendanceEvent,
  updateAttendanceEvent,
  upsertAttendanceEntry,
  submitAttendanceEvent,
  approveAttendanceEvent,
  archiveAttendanceEvent,
  getAttendanceEvent,
  listAttendanceEvents,
  getMonthlyAttendanceSummary,
} = require("../services/attendanceService");
const {
  listBlessBoardBranches,
  resolveBlessBoardBranchForChurch,
  STATUS: BRANCH_STATUS,
} = require("../services/listBlessBoardBranches");
const {
  authorizeBlessBoardTenantAccess,
  STATUS: AUTHZ_STATUS,
} = require("../services/authorizeBlessBoardTenantAccess");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIST_LIMIT = 50;

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
<html lang="en"><head><meta charset="utf-8"/><title>Attendance</title>
<link rel="stylesheet" href="/blessboard/v5/${css}"/></head>
<body class="${bodyClass}"><main><h1>Unavailable</h1><p>${safe}</p>
<p><a href="/">Church homepage</a></p></main></body></html>`);
}

function currentYearMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formError(reason) {
  if (reason === "status_locked") {
    return "This attendance record cannot be edited in its current status.";
  }
  if (reason === "entries_required") {
    return "Add at least one category count before submitting.";
  }
  if (reason === "not_draft") {
    return "Only draft records can be submitted.";
  }
  return "Please check the form and try again.";
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
function createAttendanceAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const variant = deps.variant === "branch" ? "branch" : "hq";
  const isProduction = String(env.NODE_ENV || "") === "production";
  const shellKind = variant === "hq" ? "hq" : "branch";
  const loginNext = variant === "hq" ? "/hq/attendance" : "/branch-admin/attendance";

  const allowedRoles =
    variant === "hq"
      ? ["church_hq_admin", "platform_admin"]
      : ["platform_admin", "church_hq_admin", "branch_admin"];

  const router = express.Router();
  const requireAccess = createRequireBlessBoardTenantRole({ getPool, allowedRoles });

  const rejectApex = createRejectApex({
    isApexHost,
    sendUnavailable,
    // Branch modules must match /branch-admin shell: allow apex when session tenant resolves.
    mode: "unlessTenant",
  });

  const requireSession = createRequireV5AuthenticatedSession({
    loginNext,
  });

  function gate(req, res, next) {
    if (!requireSession(req, res, { loginNext: req.originalUrl || loginNext })) {
      return;
    }
    return requireAccess(req, res, next);
  }

  async function shellLocals(req, res, extra) {
    if (variant === "branch") {
      return buildBranchAdminShellLocals(req, res, {
        env,
        isProduction,
        activeNav: "attendance",
        pageTitle: (extra && extra.pageTitle) || "Attendance",
        extra: {
          shellKind: "branch",
          eventTypes: EVENT_TYPES,
          categories: CATEGORIES,
          ...(extra || {}),
        },
      });
    }
    return buildHqAdminShellLocals(req, res, {
      env,
      isProduction,
      getPool,
      activeNav: "attendance",
      pageTitle: (extra && extra.pageTitle) || "Attendance",
      extra: {
        shellKind: "hq",
        eventTypes: EVENT_TYPES,
        categories: CATEGORIES,
        ...(extra || {}),
      },
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
        branchKey: tenant.primaryBranch.key || null,
        branchDisplayName: tenant.primaryBranch.displayName || null,
        basePath: "/branch-admin/attendance",
        tenant,
        actorUserId: session.userId,
      };
    }
    const branchKey = req.params && req.params.branchKey ? String(req.params.branchKey) : "";
    if (branchKey) {
      const resolved = await resolveBlessBoardBranchForChurch(
        getPool(),
        tenant.church.id,
        branchKey
      );
      if (!resolved.ok || !resolved.branch) {
        const code = resolved.status === BRANCH_STATUS.LOOKUP_ERROR ? 503 : 404;
        sendControlled(
          req,
          res,
          code,
          code === 503 ? "Branch lookup is temporarily unavailable." : "Branch not found.",
          shellKind
        );
        return null;
      }
      const authz = await authorizeBlessBoardTenantAccess(getPool(), {
        userId: session.userId,
        tenant,
        branchId: resolved.branch.id,
      });
      if (authz.status === AUTHZ_STATUS.LOOKUP_ERROR) {
        sendControlled(req, res, 503, "Access check is temporarily unavailable.", shellKind);
        return null;
      }
      if (!authz.ok) {
        sendControlled(req, res, 403, "You do not have access to this branch.", shellKind);
        return null;
      }
      return {
        churchId: tenant.church.id,
        branchId: resolved.branch.id,
        branchKey: resolved.branch.key,
        branchDisplayName: resolved.branch.displayName,
        basePath: `/hq/attendance/b/${resolved.branch.key}`,
        tenant,
        actorUserId: session.userId,
      };
    }
    return {
      churchId: tenant.church.id,
      branchId: null,
      branchKey: null,
      branchDisplayName: null,
      basePath: "/hq/attendance",
      tenant,
      actorUserId: session.userId,
    };
  }

  async function loadScopedEvent(req, res, scope, id) {
    if (!UUID_RE.test(id)) {
      sendControlled(req, res, 404, "Attendance event not found.", shellKind);
      return null;
    }
    const loaded = await getAttendanceEvent(getPool(), {
      id,
      churchId: scope.churchId,
      scopeBranchId: scope.branchId,
      actorUserId: scope.actorUserId,
      tenant: scope.tenant,
    });
    if (!loaded.ok || !loaded.event) {
      sendControlled(
        req,
        res,
        loaded.status === STATUS.FORBIDDEN ? 403 : 404,
        "Attendance event not found.",
        shellKind
      );
      return null;
    }
    return loaded.event;
  }

  function registerRoutes(mountPrefix, branchScoped) {
    router.get(mountPrefix, rejectApex, gate, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      if (variant === "branch" && !scope.branchId) {
        return sendControlled(req, res, 403, "Branch scope required.", shellKind);
      }
      const yearMonthRaw = String((req.query && req.query.month) || currentYearMonth());
      const yearMonth = /^\d{4}-\d{2}$/.test(yearMonthRaw) ? yearMonthRaw : currentYearMonth();
      const status = String((req.query && req.query.status) || "").trim().toLowerCase();
      const eventType = String((req.query && req.query.event_type) || "").trim().toLowerCase();
      const listed = await listAttendanceEvents(getPool(), {
        churchId: scope.churchId,
        branchId: scope.branchId,
        actorUserId: scope.actorUserId,
        tenant: scope.tenant,
        yearMonth,
        status: ["draft", "submitted", "approved", "archived"].includes(status) ? status : null,
        eventType: EVENT_TYPES.includes(eventType) ? eventType : null,
        limit: LIST_LIMIT,
      });
      const summary = await getMonthlyAttendanceSummary(getPool(), {
        churchId: scope.churchId,
        branchId: scope.branchId,
        yearMonth,
        actorUserId: scope.actorUserId,
        tenant: scope.tenant,
      });
      if (!listed.ok) {
        return sendControlled(
          req,
          res,
          listed.status === STATUS.FORBIDDEN ? 403 : 503,
          "Attendance is temporarily unavailable.",
          shellKind
        );
      }
      let branches = [];
      if (variant === "hq" && !scope.branchId) {
        const listResult = await listBlessBoardBranches(getPool(), scope.churchId);
        branches = listResult.ok ? listResult.branches : [];
      }
      const html = renderView(
        "attendance/admin-list.ejs",
        await shellLocals(req, res, {
          basePath: scope.basePath,
          events: listed.events,
          summary: summary.ok ? summary.summary : null,
          yearMonth,
          statusFilter: status,
          eventTypeFilter: eventType,
          branchScoped,
          branchDisplayName: scope.branchDisplayName || null,
          branchKey: scope.branchKey || null,
          branches,
          isHqChurchWide: variant === "hq" && !scope.branchId,
          isHqBranchScoped: variant === "hq" && Boolean(scope.branchId),
          canCreate: Boolean(scope.branchId),
          saved: String((req.query && req.query.saved) || ""),
        })
      );
      return res.status(200).type("html").send(html);
    });

    if (branchScoped || variant === "branch") {
      router.get(`${mountPrefix}/new`, rejectApex, gate, async (req, res) => {
        const scope = await resolveScope(req, res);
        if (!scope || !scope.branchId) {
          return sendControlled(req, res, 403, "Branch scope required to create attendance.", shellKind);
        }
        const html = renderView(
          "attendance/admin-form.ejs",
          await shellLocals(req, res, {
            pageTitle: "New attendance event",
            basePath: scope.basePath,
            event: null,
            error: null,
            formMode: "create",
          })
        );
        return res.status(200).type("html").send(html);
      });

      router.post(mountPrefix, rejectApex, gate, async (req, res) => {
        if (!validateCsrfPost(req, res)) return;
        const scope = await resolveScope(req, res);
        if (!scope || !scope.branchId) {
          return sendControlled(req, res, 403, "Branch scope required.", shellKind);
        }
        const body = req.body || {};
        const created = await createAttendanceEvent(getPool(), {
          churchId: scope.churchId,
          branchId: scope.branchId,
          scopeBranchId: scope.branchId,
          actorUserId: scope.actorUserId,
          tenant: scope.tenant,
          title: body.title,
          eventType: body.event_type,
          eventDate: body.event_date,
          eventAt: body.event_at,
        });
        if (!created.ok) {
          const html = renderView(
            "attendance/admin-form.ejs",
            await shellLocals(req, res, {
              pageTitle: "New attendance event",
              basePath: scope.basePath,
              event: {
                title: body.title || "",
                eventType: body.event_type || "",
                eventDate: body.event_date || "",
              },
              error: formError(created.reason),
              formMode: "create",
            })
          );
          return res.status(400).type("html").send(html);
        }
        return res.redirect(303, `${scope.basePath}/${created.event.id}?saved=1`);
      });
    }

    router.get(`${mountPrefix}/:id/edit`, rejectApex, gate, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const id = String(req.params.id || "");
      const event = await loadScopedEvent(req, res, scope, id);
      if (!event) return;
      if (event.status !== "draft") {
        return res.redirect(303, `${scope.basePath}/${id}`);
      }
      const html = renderView(
        "attendance/admin-form.ejs",
        await shellLocals(req, res, {
          pageTitle: "Edit attendance event",
          basePath: scope.basePath,
          event,
          error: null,
          formMode: "edit",
        })
      );
      return res.status(200).type("html").send(html);
    });

    router.post(`${mountPrefix}/:id/edit`, rejectApex, gate, async (req, res) => {
      if (!validateCsrfPost(req, res)) return;
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const id = String(req.params.id || "");
      const existing = await loadScopedEvent(req, res, scope, id);
      if (!existing) return;
      const body = req.body || {};
      const updated = await updateAttendanceEvent(getPool(), {
        id,
        churchId: scope.churchId,
        scopeBranchId: scope.branchId,
        actorUserId: scope.actorUserId,
        tenant: scope.tenant,
        title: body.title,
        eventType: body.event_type,
        eventDate: body.event_date,
        eventAt: body.event_at,
      });
      if (!updated.ok) {
        const html = renderView(
          "attendance/admin-form.ejs",
          await shellLocals(req, res, {
            pageTitle: "Edit attendance event",
            basePath: scope.basePath,
            event: {
              ...existing,
              title: body.title || existing.title,
              eventType: body.event_type || existing.eventType,
              eventDate: body.event_date || existing.eventDate,
            },
            error: formError(updated.reason),
            formMode: "edit",
          })
        );
        const code =
          updated.status === STATUS.FORBIDDEN || updated.status === STATUS.POLICY ? 403 : 400;
        return res.status(code).type("html").send(html);
      }
      return res.redirect(303, `${scope.basePath}/${id}?saved=1`);
    });

    router.get(`${mountPrefix}/:id`, rejectApex, gate, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const id = String(req.params.id || "");
      const event = await loadScopedEvent(req, res, scope, id);
      if (!event) return;
      const html = renderView(
        "attendance/admin-detail.ejs",
        await shellLocals(req, res, {
          pageTitle: event.title || "Attendance",
          basePath: scope.basePath,
          event,
          isHq: variant === "hq",
          canEditMeta: event.status === "draft",
          canEditEntries:
            event.status === "draft" ||
            event.status === "submitted" ||
            (variant === "hq" && event.status === "approved"),
          saved: String((req.query && req.query.saved) || ""),
          error: null,
        })
      );
      return res.status(200).type("html").send(html);
    });

    router.post(`${mountPrefix}/:id/entries`, rejectApex, gate, async (req, res) => {
      if (!validateCsrfPost(req, res)) return;
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const id = String(req.params.id || "");
      if (!UUID_RE.test(id)) {
        return sendControlled(req, res, 404, "Attendance event not found.", shellKind);
      }
      const body = req.body || {};
      const upserted = await upsertAttendanceEntry(getPool(), {
        churchId: scope.churchId,
        attendanceEventId: id,
        scopeBranchId: scope.branchId,
        actorUserId: scope.actorUserId,
        tenant: scope.tenant,
        category: body.category,
        count: body.count,
        notes: body.notes,
      });
      if (!upserted.ok) {
        return sendControlled(
          req,
          res,
          upserted.status === STATUS.FORBIDDEN || upserted.status === STATUS.POLICY ? 403 : 400,
          formError(upserted.reason),
          shellKind
        );
      }
      return res.redirect(303, `${scope.basePath}/${id}?saved=entry`);
    });

    router.post(`${mountPrefix}/:id/submit`, rejectApex, gate, async (req, res) => {
      if (!validateCsrfPost(req, res)) return;
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const id = String(req.params.id || "");
      if (!UUID_RE.test(id)) {
        return sendControlled(req, res, 404, "Attendance event not found.", shellKind);
      }
      const submitted = await submitAttendanceEvent(getPool(), {
        id,
        churchId: scope.churchId,
        scopeBranchId: scope.branchId,
        actorUserId: scope.actorUserId,
        tenant: scope.tenant,
      });
      if (!submitted.ok) {
        const event = await loadScopedEvent(req, res, scope, id);
        if (!event) return;
        const html = renderView(
          "attendance/admin-detail.ejs",
          await shellLocals(req, res, {
            pageTitle: event.title || "Attendance",
            basePath: scope.basePath,
            event,
            isHq: variant === "hq",
            canEditMeta: event.status === "draft",
            canEditEntries:
              event.status === "draft" ||
              event.status === "submitted" ||
              (variant === "hq" && event.status === "approved"),
            saved: "",
            error: formError(submitted.reason),
          })
        );
        return res.status(400).type("html").send(html);
      }
      return res.redirect(303, `${scope.basePath}/${id}?saved=submitted`);
    });

    if (variant === "hq") {
      router.post(`${mountPrefix}/:id/approve`, rejectApex, gate, async (req, res) => {
        if (!validateCsrfPost(req, res)) return;
        const scope = await resolveScope(req, res);
        if (!scope) return;
        const id = String(req.params.id || "");
        if (!UUID_RE.test(id)) {
          return sendControlled(req, res, 404, "Attendance event not found.", shellKind);
        }
        const approved = await approveAttendanceEvent(getPool(), {
          id,
          churchId: scope.churchId,
          actorUserId: scope.actorUserId,
          tenant: scope.tenant,
        });
        if (!approved.ok) {
          return sendControlled(req, res, 400, "Could not approve attendance.", shellKind);
        }
        return res.redirect(303, `${scope.basePath}/${id}?saved=approved`);
      });

      router.post(`${mountPrefix}/:id/archive`, rejectApex, gate, async (req, res) => {
        if (!validateCsrfPost(req, res)) return;
        const scope = await resolveScope(req, res);
        if (!scope) return;
        const id = String(req.params.id || "");
        if (!UUID_RE.test(id)) {
          return sendControlled(req, res, 404, "Attendance event not found.", shellKind);
        }
        const archived = await archiveAttendanceEvent(getPool(), {
          id,
          churchId: scope.churchId,
          actorUserId: scope.actorUserId,
          tenant: scope.tenant,
        });
        if (!archived.ok) {
          return sendControlled(req, res, 400, "Could not archive attendance.", shellKind);
        }
        return res.redirect(303, `${scope.basePath}/${id}?saved=archived`);
      });
    }
  }

  if (variant === "hq") {
    registerRoutes("/hq/attendance", false);
    registerRoutes("/hq/attendance/b/:branchKey", true);
  } else {
    registerRoutes("/branch-admin/attendance", true);
  }

  return router;
}

module.exports = {
  createAttendanceAdminRouter,
};
