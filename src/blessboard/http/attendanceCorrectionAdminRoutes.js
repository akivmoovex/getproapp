"use strict";

/**
 * V2.04 attendance correction + audit HTTP (BB-A12/A13/A14 functional).
 * Fail-closed on attendance.correct — no silent overwrite.
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
  getAttendanceSessionForTenant,
  correctAttendanceCheckIn,
  RESULT: CORRECTION_RESULT,
  snapshotCheckIn,
} = require("../services/attendance");
const { createDbSessionStore } = require("../repositories/attendanceSessionRepository");
const {
  createDbCheckInStore,
  createDbCorrectionStore,
  findCheckInById,
  listCheckInsForSession,
  listCorrectionsForSession,
  findCorrectionById,
} = require("../repositories/attendanceCheckInRepository");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function renderView(relativePath, data) {
  const filename = path.join(VIEWS_ROOT, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  return ejs.render(source, data, { filename });
}

function createAttendanceCorrectionAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const isProduction = String(env.NODE_ENV || "") === "production";
  const loginNext = "/branch-admin/attendance/sessions";

  const router = express.Router();
  const requireCorrect = createRequireBlessBoardPermission(
    "attendance.correct",
    null,
    { getPool }
  );
  const requireView = createRequireBlessBoardPermission("attendance.view", null, {
    getPool,
  });

  const rejectApex = createRejectApex({
    isApexHost,
    sendUnavailable,
    mode: "unlessTenant",
  });
  const requireSession = createRequireV5AuthenticatedSession({ loginNext });

  function gateCorrect(req, res, next) {
    if (!requireSession(req, res, { loginNext: req.originalUrl || loginNext })) {
      return;
    }
    return requireCorrect(req, res, next);
  }

  function gateView(req, res, next) {
    if (!requireSession(req, res, { loginNext: req.originalUrl || loginNext })) {
      return;
    }
    return requireView(req, res, next);
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
      organizationId: tenant.organization.id,
      churchId: tenant.church.id,
      branchId: tenant.primaryBranch.id,
      branchName:
        tenant.primaryBranch.displayName ||
        tenant.primaryBranch.name ||
        "Branch",
      actorUserId: req.v5Session && req.v5Session.session && req.v5Session.session.userId,
    };
  }

  async function shellLocals(req, res, extra) {
    const base = await buildBranchAdminShellLocals(req, res, {
      getPool,
      env,
      isProduction,
      activeNav: "attendance",
      pageTitle: (extra && extra.pageTitle) || "Attendance Correction",
    });
    return {
      ...base,
      csrfField: CSRF_FIELD,
      shellKind: "branch",
      ...(extra || {}),
    };
  }

  function correctionDeps() {
    return {
      sessionStore: createDbSessionStore(),
      checkInStore: createDbCheckInStore(),
      correctionStore: createDbCorrectionStore(),
    };
  }

  async function loadSession(scope, sessionId) {
    if (!UUID_RE.test(sessionId)) return null;
    const loaded = await getAttendanceSessionForTenant(
      getPool(),
      {
        sessionId,
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        branchId: scope.branchId,
        actorUserId: scope.actorUserId,
      },
      { sessionStore: createDbSessionStore() }
    );
    return loaded.ok ? loaded.session : null;
  }

  // —— A14 History / Audit ——
  router.get(
    "/branch-admin/attendance/sessions/:id/audit",
    rejectApex,
    gateView,
    async (req, res) => {
      const scope = tenantScope(req, res);
      if (!scope) return;
      const sessionId = String(req.params.id || "");
      const session = await loadSession(scope, sessionId);
      if (!session) {
        return res.status(404).type("text").send("Session not found.");
      }

      let corrections = [];
      let checkIns = [];
      try {
        corrections = await listCorrectionsForSession(getPool(), sessionId, 100);
        checkIns = await listCheckInsForSession(getPool(), sessionId, 50);
      } catch (_e) {
        corrections = [];
        checkIns = [];
      }

      const entries = corrections.map((c) => ({
        at: c.createdAt,
        title: `Correction · ${c.memberName || "Member"}`,
        summary: `${c.reason} · ${JSON.stringify(c.originalValue && c.originalValue.status)} → ${JSON.stringify(c.correctedValue && c.correctedValue.status)} · method preserved: ${c.method || (c.originalValue && c.originalValue.method) || "—"}`,
        actorLabel: c.actorUserId ? `Actor ${String(c.actorUserId).slice(0, 8)}` : "",
        kind: "correction",
      }));

      const html = renderView(
        "attendance/correction-audit.ejs",
        await shellLocals(req, res, {
          pageTitle: "Attendance History / Audit",
          stitchScreen: "BB-A14",
          session,
          branchName: scope.branchName,
          corrections,
          checkIns,
          entries,
          canCorrect: true,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  // —— A12 Correct Attendance ——
  router.get(
    "/branch-admin/attendance/sessions/:id/check-ins/:checkInId/correct",
    rejectApex,
    gateCorrect,
    async (req, res) => {
      const scope = tenantScope(req, res);
      if (!scope) return;
      const sessionId = String(req.params.id || "");
      const checkInId = String(req.params.checkInId || "");
      if (!UUID_RE.test(sessionId) || !UUID_RE.test(checkInId)) {
        return res.status(404).type("text").send("Check-in not found.");
      }
      const session = await loadSession(scope, sessionId);
      if (!session) {
        return res.status(404).type("text").send("Session not found.");
      }

      let checkIn = null;
      try {
        checkIn = await findCheckInById(getPool(), checkInId);
      } catch (_e) {
        checkIn = null;
      }
      if (
        !checkIn ||
        checkIn.sessionId !== sessionId ||
        checkIn.organizationId !== scope.organizationId ||
        checkIn.churchId !== scope.churchId
      ) {
        return res.status(404).type("text").send("Check-in not found.");
      }

      const locked = session.status === SESSION_STATUS.LOCKED;
      const html = renderView(
        "attendance/correction-form.ejs",
        await shellLocals(req, res, {
          pageTitle: "Correct Attendance",
          stitchScreen: "BB-A12",
          session,
          checkIn,
          original: snapshotCheckIn(checkIn),
          branchName: scope.branchName,
          locked,
          error: locked
            ? "This session is locked. Corrections are not allowed."
            : null,
          values: {
            status: checkIn.status,
            late_arrival: checkIn.lateArrival ? "1" : "0",
            wrong_branch: checkIn.wrongBranch ? "1" : "0",
            reason: "",
          },
        })
      );
      return res.status(locked ? 403 : 200).type("html").send(html);
    }
  );

  router.post(
    "/branch-admin/attendance/sessions/:id/check-ins/:checkInId/correct",
    rejectApex,
    gateCorrect,
    async (req, res) => {
      const scope = tenantScope(req, res);
      if (!scope) return;
      if (!validateCsrfPost(req, res)) return;

      const sessionId = String(req.params.id || "");
      const checkInId = String(req.params.checkInId || "");
      if (!UUID_RE.test(sessionId) || !UUID_RE.test(checkInId)) {
        return res.status(404).type("text").send("Check-in not found.");
      }
      const session = await loadSession(scope, sessionId);
      if (!session) {
        return res.status(404).type("text").send("Session not found.");
      }

      let checkIn = null;
      try {
        checkIn = await findCheckInById(getPool(), checkInId);
      } catch (_e) {
        checkIn = null;
      }
      if (
        !checkIn ||
        checkIn.sessionId !== sessionId ||
        checkIn.organizationId !== scope.organizationId ||
        checkIn.churchId !== scope.churchId
      ) {
        return res.status(404).type("text").send("Check-in not found.");
      }

      const body = req.body || {};
      const original = snapshotCheckIn(checkIn);
      const result = await correctAttendanceCheckIn(
        getPool(),
        {
          checkInId,
          organizationId: scope.organizationId,
          churchId: scope.churchId,
          branchId: scope.branchId,
          actorUserId: scope.actorUserId,
          sessionStatus: session.status,
          checkIn,
          originalValue: {
            status: original.status,
            lateArrival: original.lateArrival,
            wrongBranch: original.wrongBranch,
            method: original.method,
            checkedInAt: original.checkedInAt,
          },
          correctedValue: {
            status: String(body.status || "").trim().toLowerCase(),
            lateArrival: String(body.late_arrival || "") === "1",
            wrongBranch: String(body.wrong_branch || "") === "1",
            // Attempted method/time overwrites are stripped in service
            method: body.method,
            checkedInAt: body.checked_in_at,
          },
          reason: body.reason,
        },
        correctionDeps()
      );

      if (!result.ok) {
        const html = renderView(
          "attendance/correction-form.ejs",
          await shellLocals(req, res, {
            pageTitle: "Correct Attendance",
            stitchScreen: "BB-A12",
            session,
            checkIn,
            original,
            branchName: scope.branchName,
            locked: session.status === SESSION_STATUS.LOCKED,
            error:
              result.code === CORRECTION_RESULT.UNAUTHORIZED
                ? "You are not authorized to correct attendance."
                : result.code === CORRECTION_RESULT.SESSION_LOCKED
                  ? "This session is locked. Corrections are not allowed."
                  : result.code === CORRECTION_RESULT.ORIGINAL_MISMATCH
                    ? "Attendance changed since you opened this form. Refresh and try again."
                    : "Provide a reason (min 3 characters) and a valid corrected status.",
            values: {
              status: body.status || checkIn.status,
              late_arrival: body.late_arrival || "0",
              wrong_branch: body.wrong_branch || "0",
              reason: body.reason || "",
            },
          })
        );
        return res
          .status(result.code === CORRECTION_RESULT.UNAUTHORIZED ? 403 : 400)
          .type("html")
          .send(html);
      }

      return res.redirect(
        303,
        `/branch-admin/attendance/sessions/${sessionId}/check-ins/${checkInId}/correction/${result.correction.id}`
      );
    }
  );

  // —— A13 Correction Confirmation ——
  router.get(
    "/branch-admin/attendance/sessions/:id/check-ins/:checkInId/correction/:correctionId",
    rejectApex,
    gateCorrect,
    async (req, res) => {
      const scope = tenantScope(req, res);
      if (!scope) return;
      const sessionId = String(req.params.id || "");
      const checkInId = String(req.params.checkInId || "");
      const correctionId = String(req.params.correctionId || "");
      if (
        !UUID_RE.test(sessionId) ||
        !UUID_RE.test(checkInId) ||
        !UUID_RE.test(correctionId)
      ) {
        return res.status(404).type("text").send("Correction not found.");
      }
      const session = await loadSession(scope, sessionId);
      if (!session) {
        return res.status(404).type("text").send("Session not found.");
      }

      let correction = null;
      let checkIn = null;
      try {
        correction = await findCorrectionById(getPool(), correctionId);
        checkIn = await findCheckInById(getPool(), checkInId);
      } catch (_e) {
        correction = null;
      }
      if (
        !correction ||
        correction.checkInId !== checkInId ||
        correction.organizationId !== scope.organizationId ||
        correction.churchId !== scope.churchId
      ) {
        return res.status(404).type("text").send("Correction not found.");
      }

      const html = renderView(
        "attendance/correction-confirmed.ejs",
        await shellLocals(req, res, {
          pageTitle: "Correction Confirmation",
          stitchScreen: "BB-A13",
          session,
          checkIn,
          correction,
          branchName: scope.branchName,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  return router;
}

module.exports = {
  createAttendanceCorrectionAdminRouter,
};
