"use strict";

const { getPgPool } = require("../../db/pg");
const attendanceRepo = require("../../db/pg/church/attendanceRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const { ATTENDANCE_TYPES, validateAttendanceBody } = require("../../church/attendanceValidation");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
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

module.exports = function registerBranchAdminAttendanceRoutes(router) {
  router.get("/branch/attendance", requireChurchBranchHost, requireChurchBranchAdminSession, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const records = await attendanceRepo.listAttendanceRecordsForBranch(pool, branch.id);
      const rows = records.map((row) => ({
        ...row,
        total_attendance: attendanceRepo.totalAttendance(row),
        service_date_display: formatDateInput(row.service_date),
      }));
      return res.render(
        "church/branch-admin/attendance_tracker",
        branchAdminLocals(req, {
          records: rows,
          attendanceTypes: ATTENDANCE_TYPES,
          error: null,
          form: { attendance_date: formatDateInput(new Date()) },
          notice: noticeMessage(flashFromQuery(req, ATTENDANCE_NOTICES)),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.post("/branch/attendance", requireChurchBranchHost, requireChurchBranchAdminSession, requireChurchSessionCsrf, async (req, res, next) => {
    try {
      const validation = validateAttendanceBody(req.body || {});
      const branch = req.churchContext.branch;
      const org = req.churchContext.organization;
      const pool = getPgPool();

      if (!validation.ok) {
        const records = await attendanceRepo.listAttendanceRecordsForBranch(pool, branch.id);
        return res.status(400).render(
          "church/branch-admin/attendance_tracker",
          branchAdminLocals(req, {
            records: records.map((row) => ({
              ...row,
              total_attendance: attendanceRepo.totalAttendance(row),
              service_date_display: formatDateInput(row.service_date),
            })),
            attendanceTypes: ATTENDANCE_TYPES,
            error: validation.error,
            form: validation.form,
            notice: null,
          })
        );
      }

      const created = await attendanceRepo.createAttendanceRecord(pool, {
        organization_id: org.id,
        branch_id: branch.id,
        ...validation.data,
        status: validation.status,
        created_by_admin_id: req.churchBranchAdmin.admin_id,
      });

      await recordBranchAudit(pool, req, {
        action: validation.status === "submitted" ? "attendance_record_submitted" : "attendance_record_created",
        entityType: "attendance_record",
        entityId: created.id,
        metadata: { attendance_type: created.attendance_type, service_date: validation.data.attendance_date },
      });

      const notice = validation.status === "submitted" ? "submitted" : "created";
      return res.redirect(303, `/branch/attendance/${created.id}?notice=${notice}`);
    } catch (e) {
      return next(e);
    }
  });

  router.get(
    "/branch/attendance/:recordId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const branch = req.churchContext.branch;
        const recordId = Number(req.params.recordId);
        if (!Number.isFinite(recordId) || recordId <= 0) {
          return res.status(404).type("text").send("Attendance record not found.");
        }
        const pool = getPgPool();
        const record = await attendanceRepo.findAttendanceRecordByIdForBranch(pool, recordId, branch.id);
        if (!record) {
          return res.status(404).type("text").send("Attendance record not found.");
        }
        return res.render(
          "church/branch-admin/attendance_record_detail",
          branchAdminLocals(req, {
            record: {
              ...record,
              total_attendance: attendanceRepo.totalAttendance(record),
              service_date_display: formatDateInput(record.service_date),
            },
            error: null,
            notice: noticeMessage(flashFromQuery(req, ATTENDANCE_NOTICES)),
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/attendance/:recordId/update-status",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const branch = req.churchContext.branch;
        const recordId = Number(req.params.recordId);
        const newStatus = String((req.body && req.body.status) || "").trim();
        if (!Number.isFinite(recordId) || recordId <= 0) {
          return res.status(404).type("text").send("Attendance record not found.");
        }
        if (newStatus !== "submitted") {
          return res.status(400).type("text").send("Invalid status update.");
        }
        const pool = getPgPool();
        const existing = await attendanceRepo.findAttendanceRecordByIdForBranch(pool, recordId, branch.id);
        if (!existing) {
          return res.status(404).type("text").send("Attendance record not found.");
        }
        if (existing.status !== "draft") {
          return res.redirect(303, `/branch/attendance/${recordId}?notice=status_updated`);
        }
        await attendanceRepo.updateAttendanceStatusForBranch(pool, recordId, branch.id, "submitted");
        await recordBranchAudit(pool, req, {
          action: "attendance_record_submitted",
          entityType: "attendance_record",
          entityId: recordId,
          metadata: {},
        });
        return res.redirect(303, `/branch/attendance/${recordId}?notice=submitted`);
      } catch (e) {
        return next(e);
      }
    }
  );
};
