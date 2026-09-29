"use strict";

const { getPgPool } = require("../../db/pg");
const attendanceCheckInRepo = require("../../db/pg/church/attendanceCheckInRepo");
const membersRepo = require("../../db/pg/church/membersRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const { ATTENDANCE_TYPES } = require("../../church/attendanceValidation");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const { wantsJson } = require("../../church/churchFailureStates");
const { loadPlanForReq } = require("../../services/church/churchPackageFeatureGateService");
const { hasEntitlement } = require("../../services/church/churchEntitlementService");
const {
  validateOpenSessionBody,
  validateManualCheckInBody,
  validateVisitorCheckInBody,
  validateQrCheckInBody,
  validateCorrectionBody,
} = require("../../church/attendanceCheckInValidation");
const foundationAttendanceCheckInService = require("../../services/church/foundationAttendanceCheckInService");
const {
  branchAdminLocals,
  flashFromQuery,
  ATTENDANCE_NOTICES,
  noticeMessage,
  recordBranchAudit,
} = require("./branchAdminShared");

function formatDateInput(d) {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

function trustedCtx(req) {
  const branch = req.churchContext.branch;
  const org = req.churchContext.organization;
  const admin = req.churchBranchAdmin;
  return {
    organization_id: org.id,
    branch_id: branch.id,
    admin_id: admin.admin_id,
    can_correct_attendance: Boolean(admin.can_correct_attendance),
  };
}

async function requireAttendanceQrEntitlement(req, res, next) {
  try {
    const plan = req.churchPackagePlan || (await loadPlanForReq(req));
    if (!hasEntitlement(plan, "attendance.qr")) {
      const { renderChurchFailureState } = require("../../church/churchFailureStates");
      return renderChurchFailureState(req, res, "package_restricted", {
        message: "QR attendance check-in is not included in your package.",
      });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

function checkInErrorStatus(err) {
  const code = err && err.code;
  if (code === foundationAttendanceCheckInService.CHECK_IN_ERRORS.PERMISSION_DENIED) return 403;
  if (code === foundationAttendanceCheckInService.CHECK_IN_ERRORS.DUPLICATE) return 409;
  if (
    code === foundationAttendanceCheckInService.CHECK_IN_ERRORS.INVALID_QR ||
    code === foundationAttendanceCheckInService.CHECK_IN_ERRORS.WRONG_BRANCH ||
    code === foundationAttendanceCheckInService.CHECK_IN_ERRORS.MEMBER_NOT_VERIFIED
  ) {
    return 400;
  }
  if (code === foundationAttendanceCheckInService.CHECK_IN_ERRORS.SESSION_NOT_FOUND) return 404;
  return 400;
}

function respondCheckInError(req, res, err, redirectBase) {
  const status = checkInErrorStatus(err);
  const message = (err && err.message) || "Check-in failed.";
  if (wantsJson(req)) {
    return res.status(status).json({ ok: false, error: message, code: err && err.code });
  }
  return res.redirect(303, `${redirectBase}?error=${encodeURIComponent(message)}`);
}

async function loadCheckInPageData(pool, branch, sessionId) {
  const sessions = await attendanceCheckInRepo.listServiceSessionsForBranch(pool, branch.id, { limit: 30 });
  const openSession =
    (sessionId && (await attendanceCheckInRepo.findServiceSessionByIdForBranch(pool, sessionId, branch.id))) ||
    (await attendanceCheckInRepo.findOpenServiceSessionForBranch(pool, branch.id));
  const members = await membersRepo.searchMembersForBranch(pool, branch.id, "", { status: "verified" });
  let checkIns = [];
  let counts = { members: 0, visitors: 0 };
  if (openSession) {
    checkIns = await attendanceCheckInRepo.listCheckInsForSession(pool, openSession.id, branch.id, {
      limit: 100,
    });
    counts = await attendanceCheckInRepo.countCheckInsByKindForSession(pool, openSession.id, branch.id);
  }
  return {
    sessions: sessions.map((s) => ({
      ...s,
      session_date_display: formatDateInput(s.session_date),
    })),
    openSession: openSession
      ? { ...openSession, session_date_display: formatDateInput(openSession.session_date) }
      : null,
    members: members.map((m) => ({
      id: m.id,
      label: foundationAttendanceCheckInService.toUsherCheckInRow({
        check_in_kind: "member",
        member_full_name: m.full_name,
      }).display.label,
    })),
    checkIns: checkIns.map((row) => foundationAttendanceCheckInService.toUsherCheckInRow(row)),
    counts,
  };
}

module.exports = function registerBranchAdminAttendanceCheckInRoutes(router) {
  router.get(
    "/branch/attendance/check-in",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireAttendanceQrEntitlement,
    async (req, res, next) => {
      try {
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const sessionId = Number(req.query.session);
        const page = await loadCheckInPageData(
          pool,
          branch,
          Number.isFinite(sessionId) && sessionId > 0 ? sessionId : null
        );
        const error = String(req.query.error || "").trim() || null;
        return res.render(
          "church/branch-admin/attendance_check_in",
          branchAdminLocals(req, {
            attendanceTypes: ATTENDANCE_TYPES,
            ...page,
            canCorrectAttendance: Boolean(req.churchBranchAdmin.can_correct_attendance),
            form: {
              session_date: formatDateInput(new Date()),
              attendance_type: "",
              service_name: "",
            },
            error,
            notice: noticeMessage(flashFromQuery(req, ATTENDANCE_NOTICES)),
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/attendance/check-in/sessions/open",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireAttendanceQrEntitlement,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const validation = validateOpenSessionBody(req.body || {});
        if (!validation.ok) {
          if (wantsJson(req)) {
            return res.status(400).json({ ok: false, error: validation.error });
          }
          const branch = req.churchContext.branch;
          const pool = getPgPool();
          const page = await loadCheckInPageData(pool, branch, null);
          return res.status(400).render(
            "church/branch-admin/attendance_check_in",
            branchAdminLocals(req, {
              attendanceTypes: ATTENDANCE_TYPES,
              ...page,
              canCorrectAttendance: Boolean(req.churchBranchAdmin.can_correct_attendance),
              form: validation.form,
              error: validation.error,
              notice: null,
            })
          );
        }
        const pool = getPgPool();
        const session = await foundationAttendanceCheckInService.openServiceSession(
          pool,
          trustedCtx(req),
          validation.data
        );
        await recordBranchAudit(pool, req, {
          action: "attendance_session_opened",
          entityType: "attendance_session",
          entityId: session.id,
          metadata: {
            attendance_type: session.attendance_type,
            service_name: session.service_name,
            session_date: validation.data.session_date,
          },
        });
        if (wantsJson(req)) {
          return res.status(201).json({ ok: true, session_id: session.id });
        }
        return res.redirect(303, `/branch/attendance/check-in?session=${session.id}&notice=session_opened`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/attendance/check-in/sessions/:sessionId/close",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireAttendanceQrEntitlement,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const sessionId = Number(req.params.sessionId);
        if (!Number.isFinite(sessionId) || sessionId <= 0) {
          return res.status(404).type("text").send("Session not found.");
        }
        const pool = getPgPool();
        const closed = await foundationAttendanceCheckInService.closeServiceSession(
          pool,
          trustedCtx(req),
          sessionId
        );
        await recordBranchAudit(pool, req, {
          action: "attendance_session_closed",
          entityType: "attendance_session",
          entityId: closed.id,
          metadata: {},
        });
        if (wantsJson(req)) {
          return res.json({ ok: true, session_id: closed.id, status: closed.status });
        }
        return res.redirect(303, `/branch/attendance/check-in?notice=session_closed`);
      } catch (e) {
        if (e && e.code) {
          return respondCheckInError(req, res, e, "/branch/attendance/check-in");
        }
        return next(e);
      }
    }
  );

  router.post(
    "/branch/attendance/check-in/member",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireAttendanceQrEntitlement,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const validation = validateManualCheckInBody(req.body || {});
        if (!validation.ok) {
          if (wantsJson(req)) return res.status(400).json({ ok: false, error: validation.error });
          return res.redirect(
            303,
            `/branch/attendance/check-in?error=${encodeURIComponent(validation.error)}`
          );
        }
        const pool = getPgPool();
        const result = await foundationAttendanceCheckInService.manualMemberCheckIn(
          pool,
          trustedCtx(req),
          validation.data
        );
        await recordBranchAudit(pool, req, {
          action: "attendance_check_in_recorded",
          entityType: "attendance_check_in",
          entityId: result.checkIn.id,
          metadata: { method: "manual", kind: "member", session_id: result.session.id },
        });
        if (wantsJson(req)) {
          return res.status(201).json({
            ok: true,
            check_in_id: result.checkIn.id,
            display: result.display,
          });
        }
        return res.redirect(
          303,
          `/branch/attendance/check-in?session=${result.session.id}&notice=check_in_recorded`
        );
      } catch (e) {
        if (e && e.code) {
          const sessionQ = Number.parseInt(String((req.body && req.body.session_id) || "").trim(), 10);
          const base =
            Number.isFinite(sessionQ) && sessionQ > 0
              ? `/branch/attendance/check-in?session=${sessionQ}`
              : "/branch/attendance/check-in";
          return respondCheckInError(req, res, e, base);
        }
        return next(e);
      }
    }
  );

  router.post(
    "/branch/attendance/check-in/visitor",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireAttendanceQrEntitlement,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const validation = validateVisitorCheckInBody(req.body || {});
        if (!validation.ok) {
          if (wantsJson(req)) return res.status(400).json({ ok: false, error: validation.error });
          return res.redirect(
            303,
            `/branch/attendance/check-in?error=${encodeURIComponent(validation.error)}`
          );
        }
        const pool = getPgPool();
        const result = await foundationAttendanceCheckInService.visitorCheckIn(
          pool,
          trustedCtx(req),
          validation.data
        );
        await recordBranchAudit(pool, req, {
          action: "attendance_check_in_recorded",
          entityType: "attendance_check_in",
          entityId: result.checkIn.id,
          metadata: { method: "manual", kind: "visitor", session_id: result.session.id },
        });
        if (wantsJson(req)) {
          return res.status(201).json({
            ok: true,
            check_in_id: result.checkIn.id,
            display: result.display,
          });
        }
        return res.redirect(
          303,
          `/branch/attendance/check-in?session=${result.session.id}&notice=visitor_checked_in`
        );
      } catch (e) {
        if (e && e.code) {
          return respondCheckInError(req, res, e, "/branch/attendance/check-in");
        }
        return next(e);
      }
    }
  );

  router.post(
    "/branch/attendance/check-in/qr",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireAttendanceQrEntitlement,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const validation = validateQrCheckInBody(req.body || {});
        if (!validation.ok) {
          if (wantsJson(req)) return res.status(400).json({ ok: false, error: validation.error });
          return res.redirect(
            303,
            `/branch/attendance/check-in?error=${encodeURIComponent(validation.error)}`
          );
        }
        const pool = getPgPool();
        const result = await foundationAttendanceCheckInService.qrCheckIn(
          pool,
          trustedCtx(req),
          validation.data
        );
        await recordBranchAudit(pool, req, {
          action: "attendance_check_in_recorded",
          entityType: "attendance_check_in",
          entityId: result.checkIn.id,
          metadata: { method: "qr", kind: "member", session_id: result.session.id },
        });
        if (wantsJson(req)) {
          return res.status(201).json({
            ok: true,
            check_in_id: result.checkIn.id,
            display: result.display,
          });
        }
        return res.redirect(
          303,
          `/branch/attendance/check-in?session=${result.session.id}&notice=check_in_recorded`
        );
      } catch (e) {
        if (e && e.code) {
          return respondCheckInError(req, res, e, "/branch/attendance/check-in");
        }
        return next(e);
      }
    }
  );

  router.post(
    "/branch/attendance/check-in/:checkInId/correct",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireAttendanceQrEntitlement,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const checkInId = Number(req.params.checkInId);
        if (!Number.isFinite(checkInId) || checkInId <= 0) {
          return res.status(404).type("text").send("Check-in not found.");
        }
        const validation = validateCorrectionBody(req.body || {});
        if (!validation.ok) {
          if (wantsJson(req)) return res.status(400).json({ ok: false, error: validation.error });
          return res.redirect(
            303,
            `/branch/attendance/check-in?error=${encodeURIComponent(validation.error)}`
          );
        }
        const pool = getPgPool();
        const result = await foundationAttendanceCheckInService.correctCheckIn(
          pool,
          trustedCtx(req),
          checkInId,
          validation.data
        );
        await recordBranchAudit(pool, req, {
          action: "attendance_check_in_corrected",
          entityType: "attendance_check_in",
          entityId: result.voided.id,
          metadata: {
            reason: validation.data.reason,
            replacement_check_in_id: result.replacement ? result.replacement.id : null,
          },
        });
        if (wantsJson(req)) {
          return res.json({
            ok: true,
            voided_id: result.voided.id,
            replacement_id: result.replacement ? result.replacement.id : null,
          });
        }
        return res.redirect(303, `/branch/attendance/check-in?notice=check_in_corrected`);
      } catch (e) {
        if (e && e.code) {
          return respondCheckInError(req, res, e, "/branch/attendance/check-in");
        }
        return next(e);
      }
    }
  );

  router.get(
    "/branch/attendance/check-in/report",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireAttendanceQrEntitlement,
    async (req, res, next) => {
      try {
        const branch = req.churchContext.branch;
        const fromDate = String(req.query.from || "").trim() || formatDateInput(new Date());
        const toDate = String(req.query.to || "").trim() || fromDate;
        const pool = getPgPool();
        const summary = await attendanceCheckInRepo.getCheckInSummaryForBranchPeriod(
          pool,
          branch.id,
          fromDate,
          toDate
        );
        if (wantsJson(req)) {
          return res.json({ ok: true, from: fromDate, to: toDate, summary });
        }
        return res.render(
          "church/branch-admin/attendance_check_in_report",
          branchAdminLocals(req, {
            fromDate,
            toDate,
            summary,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );
};
