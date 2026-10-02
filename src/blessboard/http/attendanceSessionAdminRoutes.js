"use strict";

/**
 * V2.04 attendance session operations (BB-A01/A02/A03 + close/lock).
 * Additive to aggregate /branch-admin/attendance — does not replace it.
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const express = require("express");

const {
  createRequireBlessBoardPermission,
} = require("./requireBlessBoardPermission");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const {
  createRequireV5AuthenticatedSession,
} = require("../../platform/http/v5SessionAuthGate");
const { buildBranchAdminShellLocals } = require("./branchAdminShellLocals");
const { CSRF_FIELD, validateCsrf } = require("../../platform/http/v5Csrf");
const {
  SESSION_STATUS,
  SESSION_STATUSES,
  createAttendanceSession,
  transitionAttendanceSession,
  listAttendanceSessionsForTenant,
  getAttendanceSessionForTenant,
  RESULT: SESSION_RESULT,
  issueSessionCheckInQr,
} = require("../services/attendance");
const {
  countCheckInsBySession,
  listRecentCheckIns,
  createDbSessionStore,
} = require("../repositories/attendanceSessionRepository");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SERVICE_EVENT_OPTIONS = Object.freeze([
  { value: "sunday_morning_worship", label: "Sunday Morning Worship" },
  { value: "midweek_communion", label: "Midweek Communion Service" },
  { value: "youth_encounter", label: "Youth Church Encounter" },
  { value: "pastoral_vigil", label: "Pastoral Workers Vigil" },
  { value: "special_thanksgiving", label: "Special Thanksgiving" },
  { value: "other", label: "Other / Custom" },
]);

function renderView(relativePath, data) {
  const filename = path.join(VIEWS_ROOT, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  return ejs.render(source, data, { filename });
}

function serviceEventLabel(ref) {
  const key = String(ref || "").trim();
  const hit = SERVICE_EVENT_OPTIONS.find((o) => o.value === key);
  return hit ? hit.label : key || "Service session";
}

function presentSession(session) {
  if (!session) return null;
  return {
    ...session,
    serviceEventLabel: serviceEventLabel(session.serviceEventRef),
    statusLabel: String(session.status || "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()),
  };
}

function createAttendanceSessionAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const isProduction = String(env.NODE_ENV || "") === "production";
  const loginNext = "/branch-admin/attendance/sessions";

  const router = express.Router();
  const requireView = createRequireBlessBoardPermission("attendance.view", null, {
    getPool,
  });
  const requireManage = createRequireBlessBoardPermission(
    "attendance.manage_session",
    null,
    { getPool }
  );

  const rejectApex = createRejectApex({
    isApexHost,
    sendUnavailable,
    mode: "unlessTenant",
  });
  const requireSession = createRequireV5AuthenticatedSession({ loginNext });

  function gateView(req, res, next) {
    if (!requireSession(req, res, { loginNext: req.originalUrl || loginNext })) {
      return;
    }
    return requireView(req, res, next);
  }

  function gateManage(req, res, next) {
    if (!requireSession(req, res, { loginNext: req.originalUrl || loginNext })) {
      return;
    }
    return requireManage(req, res, next);
  }

  function validateCsrfPost(req, res) {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      res.status(403).type("text").send("Invalid security token. Refresh and try again.");
      return false;
    }
    return true;
  }

  function tenantScope(req, res) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.organization || !tenant.primaryBranch) {
      res.status(403).type("text").send("Church context is required.");
      return null;
    }
    return {
      tenant,
      organizationId: tenant.organization.id,
      churchId: tenant.church.id,
      branchId: tenant.primaryBranch.id,
      branchName:
        tenant.primaryBranch.displayName ||
        tenant.primaryBranch.name ||
        "Branch",
      churchName: tenant.church.displayName || tenant.church.name || "Church",
      actorUserId: req.v5Session && req.v5Session.session && req.v5Session.session.userId,
    };
  }

  async function shellLocals(req, res, extra) {
    const base = await buildBranchAdminShellLocals(req, res, {
      getPool,
      env,
      isProduction,
      activeNav: "attendance",
      pageTitle: (extra && extra.pageTitle) || "Attendance Sessions",
    });
    return {
      ...base,
      csrfField: CSRF_FIELD,
      shellKind: "branch",
      ...(extra || {}),
    };
  }

  function sessionStore() {
    return createDbSessionStore();
  }

  // —— A01 list ——
  router.get(
    "/branch-admin/attendance/sessions",
    rejectApex,
    gateView,
    async (req, res) => {
      const scope = tenantScope(req, res);
      if (!scope) return;
      const status = String((req.query && req.query.status) || "")
        .trim()
        .toLowerCase();
      const listed = await listAttendanceSessionsForTenant(
        getPool(),
        {
          organizationId: scope.organizationId,
          churchId: scope.churchId,
          branchId: scope.branchId,
          actorUserId: scope.actorUserId,
          status: SESSION_STATUSES.includes(status) ? status : null,
        },
        { sessionStore: sessionStore() }
      );
      const sessions = (listed.ok ? listed.sessions : []).map(presentSession);
      const openSessions = sessions.filter((s) => s.status === SESSION_STATUS.OPEN);
      const draftSessions = sessions.filter((s) => s.status === SESSION_STATUS.DRAFT);
      const closedSessions = sessions.filter(
        (s) =>
          s.status === SESSION_STATUS.CLOSED || s.status === SESSION_STATUS.LOCKED
      );
      const html = renderView(
        "attendance/sessions.ejs",
        await shellLocals(req, res, {
          pageTitle: "Attendance Sessions",
          stitchScreen: "BB-A01",
          sessions,
          openSessions,
          draftSessions,
          closedSessions,
          openCount: openSessions.length,
          statusFilter: SESSION_STATUSES.includes(status) ? status : "",
          branchName: scope.branchName,
          saved: String((req.query && req.query.saved) || ""),
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  // —— A02 create ——
  router.get(
    "/branch-admin/attendance/sessions/new",
    rejectApex,
    gateManage,
    async (req, res) => {
      const scope = tenantScope(req, res);
      if (!scope) return;
      const html = renderView(
        "attendance/session-new.ejs",
        await shellLocals(req, res, {
          pageTitle: "Create Attendance Session",
          stitchScreen: "BB-A02",
          branchName: scope.branchName,
          serviceEventOptions: SERVICE_EVENT_OPTIONS,
          values: {
            session_date: new Date().toISOString().slice(0, 10),
            start_time: "08:00",
            late_threshold_minutes: "15",
            service_event_ref: "sunday_morning_worship",
            title: "",
            notes: "",
          },
          error: null,
          fieldErrors: {},
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  router.post(
    "/branch-admin/attendance/sessions/new",
    rejectApex,
    gateManage,
    async (req, res) => {
      const scope = tenantScope(req, res);
      if (!scope) return;
      if (!validateCsrfPost(req, res)) return;
      const body = req.body || {};
      const openNow = String(body.action || "") === "save_open";
      const sessionDate = String(body.session_date || "").trim();
      const startClock = String(body.start_time || "").trim();
      const startTime = `${sessionDate}T${startClock || "08:00"}:00`;

      const created = await createAttendanceSession(
        getPool(),
        {
          organizationId: scope.organizationId,
          churchId: scope.churchId,
          branchId: scope.branchId,
          actorUserId: scope.actorUserId,
          sessionDate,
          startTime,
          lateThresholdMinutes: body.late_threshold_minutes,
          serviceEventRef: body.service_event_ref,
          title: body.title,
          notes: body.notes,
        },
        { sessionStore: sessionStore() }
      );

      if (!created.ok) {
        const html = renderView(
          "attendance/session-new.ejs",
          await shellLocals(req, res, {
            pageTitle: "Create Attendance Session",
            stitchScreen: "BB-A02",
            branchName: scope.branchName,
            serviceEventOptions: SERVICE_EVENT_OPTIONS,
            values: {
              session_date: body.session_date || "",
              start_time: body.start_time || "",
              late_threshold_minutes: body.late_threshold_minutes || "15",
              service_event_ref: body.service_event_ref || "",
              title: body.title || "",
              notes: body.notes || "",
            },
            error:
              created.code === SESSION_RESULT.UNAUTHORIZED
                ? "You are not authorized to manage attendance sessions."
                : "Please check the session details and try again.",
            fieldErrors: {},
          })
        );
        return res.status(400).type("html").send(html);
      }

      if (openNow) {
        const opened = await transitionAttendanceSession(
          getPool(),
          {
            sessionId: created.session.id,
            toStatus: SESSION_STATUS.OPEN,
            actorUserId: scope.actorUserId,
            organizationId: scope.organizationId,
            churchId: scope.churchId,
            branchId: scope.branchId,
          },
          { sessionStore: sessionStore() }
        );
        if (opened.ok) {
          return res.redirect(
            303,
            `/branch-admin/attendance/sessions/${created.session.id}?saved=opened`
          );
        }
      }

      return res.redirect(
        303,
        `/branch-admin/attendance/sessions/${created.session.id}?saved=draft`
      );
    }
  );

  async function loadDashboard(req, res, scope, sessionId, extras) {
    const loaded = await getAttendanceSessionForTenant(
      getPool(),
      {
        sessionId,
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        branchId: scope.branchId,
        actorUserId: scope.actorUserId,
      },
      { sessionStore: sessionStore() }
    );
    if (!loaded.ok) {
      const code =
        loaded.code === SESSION_RESULT.UNAUTHORIZED ||
        loaded.code === SESSION_RESULT.NOT_FOUND
          ? 404
          : 403;
      return res.status(code).type("text").send("Session not found.");
    }

    const session = presentSession(loaded.session);
    let stats = { total: 0, present: 0, late: 0 };
    let recent = [];
    try {
      stats = await countCheckInsBySession(getPool(), sessionId);
      recent = await listRecentCheckIns(getPool(), sessionId, 8);
    } catch (_e) {
      /* table may be empty / unavailable in some test envs */
    }

    let qrToken = null;
    if (session.status === SESSION_STATUS.OPEN) {
      try {
        const issued = await issueSessionCheckInQr(
          getPool(),
          {
            sessionId: session.id,
            organizationId: session.organizationId,
            churchId: session.churchId,
            actorUserId: scope.actorUserId,
          },
          {}
        );
        qrToken = issued && issued.ok ? issued.token : null;
      } catch (_e) {
        qrToken = null;
      }
    }

    const stitchScreen =
      session.status === SESSION_STATUS.LOCKED
        ? "BB-A11"
        : session.status === SESSION_STATUS.CLOSED
          ? "BB-A10"
          : "BB-A03";

    const html = renderView(
      "attendance/session-dashboard.ejs",
      await shellLocals(req, res, {
        pageTitle:
          session.status === SESSION_STATUS.LOCKED
            ? "Locked Session Summary"
            : session.status === SESSION_STATUS.CLOSED
              ? "Closed Session"
              : "Open Session Dashboard",
        stitchScreen,
        session,
        stats,
        recent,
        qrToken,
        branchName: scope.branchName,
        ...(extras || {}),
      })
    );
    return res.status(200).type("html").send(html);
  }

  // —— A03 / A10 / A11 dashboard ——
  router.get(
    "/branch-admin/attendance/sessions/:id",
    rejectApex,
    gateView,
    async (req, res) => {
      const scope = tenantScope(req, res);
      if (!scope) return;
      const id = String(req.params.id || "");
      if (!UUID_RE.test(id)) {
        return res.status(404).type("text").send("Session not found.");
      }
      return loadDashboard(req, res, scope, id, {
        saved: String((req.query && req.query.saved) || ""),
        error: null,
      });
    }
  );

  router.get(
    "/branch-admin/attendance/sessions/:id/close",
    rejectApex,
    gateManage,
    async (req, res) => {
      const scope = tenantScope(req, res);
      if (!scope) return;
      const id = String(req.params.id || "");
      if (!UUID_RE.test(id)) {
        return res.status(404).type("text").send("Session not found.");
      }
      const loaded = await getAttendanceSessionForTenant(
        getPool(),
        {
          sessionId: id,
          organizationId: scope.organizationId,
          churchId: scope.churchId,
          branchId: scope.branchId,
          actorUserId: scope.actorUserId,
        },
        { sessionStore: sessionStore() }
      );
      if (!loaded.ok || loaded.session.status !== SESSION_STATUS.OPEN) {
        return res.redirect(303, `/branch-admin/attendance/sessions/${id}`);
      }
      const html = renderView(
        "attendance/session-close.ejs",
        await shellLocals(req, res, {
          pageTitle: "Close Session",
          stitchScreen: "BB-A10",
          session: presentSession(loaded.session),
          branchName: scope.branchName,
          error: null,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  router.post(
    "/branch-admin/attendance/sessions/:id/transition",
    rejectApex,
    gateManage,
    async (req, res) => {
      const scope = tenantScope(req, res);
      if (!scope) return;
      if (!validateCsrfPost(req, res)) return;
      const id = String(req.params.id || "");
      if (!UUID_RE.test(id)) {
        return res.status(404).type("text").send("Session not found.");
      }
      const toStatus = String((req.body && req.body.to_status) || "")
        .trim()
        .toLowerCase();
      const result = await transitionAttendanceSession(
        getPool(),
        {
          sessionId: id,
          toStatus,
          actorUserId: scope.actorUserId,
          organizationId: scope.organizationId,
          churchId: scope.churchId,
          branchId: scope.branchId,
        },
        { sessionStore: sessionStore() }
      );
      if (!result.ok) {
        return loadDashboard(req, res, scope, id, {
          saved: "",
          error:
            result.code === SESSION_RESULT.INVALID_TRANSITION
              ? `Cannot move session from ${result.from || "current"} to ${toStatus}.`
              : result.code === SESSION_RESULT.UNAUTHORIZED
                ? "You are not authorized for this session action."
                : "Session update failed.",
        });
      }
      const saved =
        toStatus === SESSION_STATUS.OPEN
          ? "opened"
          : toStatus === SESSION_STATUS.CLOSED
            ? "closed"
            : toStatus === SESSION_STATUS.LOCKED
              ? "locked"
              : "updated";
      return res.redirect(303, `/branch-admin/attendance/sessions/${id}?saved=${saved}`);
    }
  );

  return router;
}

module.exports = {
  createAttendanceSessionAdminRouter,
  SERVICE_EVENT_OPTIONS,
};
