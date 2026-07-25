"use strict";

const { getPgPool } = require("../../db/pg");
const attendanceRepo = require("../../db/pg/church/attendanceRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const {
  ATTENDANCE_TYPES,
  ATTENDANCE_STATUS_FILTERS,
  validateAttendanceBody,
  parseAttendanceTrackerQuery,
  resolveAttendanceListState,
  attendanceStatusLabel,
} = require("../../church/attendanceValidation");
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

function formatDisplayDate(d) {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function mapRecordRows(records) {
  return (records || []).map((row) => ({
    ...row,
    total_attendance: attendanceRepo.totalAttendance(row),
    service_date_display: formatDateInput(row.service_date),
    service_date_label: formatDisplayDate(row.service_date),
    status_label: attendanceStatusLabel(row.status),
  }));
}

async function loadTrackerLocals(req, extras = {}) {
  const branch = req.churchContext.branch;
  const pool = getPgPool();
  const parsed = extras.parsed || parseAttendanceTrackerQuery(req.query);
  const filters = {
    attendanceType: parsed.attendanceType,
    status: parsed.status,
    q: parsed.q,
    month: parsed.month,
    date: parsed.date,
  };

  let records = [];
  let listError = null;
  try {
    records = await attendanceRepo.listAttendanceRecordsForBranch(pool, branch.id, filters);
  } catch (err) {
    listError = "Attendance records could not be loaded. Please try again.";
  }

  const totalInScope = await attendanceRepo
    .listAttendanceRecordsForBranch(pool, branch.id, { limit: 1 })
    .then((rows) => rows.length > 0)
    .catch(() => false);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const [pendingDrafts, periodSummary, recentTotals, latest, sundayAvg] = await Promise.all([
    attendanceRepo.countAttendancePendingForBranch(pool, branch.id),
    attendanceRepo.getAttendanceSummaryForBranchPeriod(pool, branch.id, year, month),
    attendanceRepo.getAttendanceTotalsForBranchRecentDays(pool, branch.id, 30),
    attendanceRepo.findLatestAttendanceRecordForBranch(pool, branch.id),
    attendanceRepo.getSundayAttendanceAverageForBranchMonth(pool, branch.id, year, month),
  ]);

  const rows = mapRecordRows(records);
  const listState = resolveAttendanceListState(filters, rows, {
    hasRecordsInScope: Boolean(totalInScope),
  });

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const overview = {
    totalLast30Days: Number(recentTotals.total_attendance || 0),
    visitorsThisMonth: Number(periodSummary.visitors_total || 0),
    childrenLastService: latest ? Number(latest.children_count || 0) : 0,
    pendingDrafts: Number(pendingDrafts || 0),
    monthTotal: Number(periodSummary.adults_total || 0) +
      Number(periodSummary.youth_total || 0) +
      Number(periodSummary.children_total || 0),
    sundayAvg: Number(sundayAvg.avg_total || 0),
    sundayRecordCount: Number(sundayAvg.sunday_record_count || 0),
    monthLabel: now.toLocaleDateString("en-GB", { month: "short" }),
    monthKey,
  };

  return {
    records: rows,
    attendanceTypes: ATTENDANCE_TYPES,
    attendanceStatusFilters: ATTENDANCE_STATUS_FILTERS,
    attendanceStatusLabel,
    typeFilter: parsed.attendanceType,
    statusFilter: parsed.status,
    searchQuery: parsed.q,
    monthFilter: parsed.month,
    dateFilter: parsed.date,
    showForm: Boolean(parsed.showForm || extras.forceShowForm),
    canRecord: true,
    listState,
    listError: extras.listError || listError,
    overview,
    trackerAction: "/branch/attendance",
    recordDetailBase: "/branch/attendance",
    checkInHref: "/branch/attendance/check-in",
    portalKind: "branch",
    showBranchFilter: false,
    branchOptions: [],
    branchFilterId: null,
    error: extras.error != null ? extras.error : null,
    form: extras.form || { attendance_date: formatDateInput(new Date()) },
    notice: extras.notice !== undefined ? extras.notice : noticeMessage(flashFromQuery(req, ATTENDANCE_NOTICES)),
  };
}

function formatDateTimeLabel(d) {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mapDetailRecord(record, branchNameFallback) {
  return {
    ...record,
    total_attendance: attendanceRepo.totalAttendance(record),
    service_date_display: formatDateInput(record.service_date),
    service_date_label: formatDisplayDate(record.service_date),
    status_label: attendanceStatusLabel(record.status),
    created_at_label: formatDateTimeLabel(record.created_at),
    updated_at_label: formatDateTimeLabel(record.updated_at),
    branch_name: record.branch_name || branchNameFallback || "",
  };
}

module.exports = function registerBranchAdminAttendanceRoutes(router) {
  router.get("/branch/attendance", requireChurchBranchHost, requireChurchBranchAdminSession, async (req, res, next) => {
    try {
      const locals = await loadTrackerLocals(req);
      return res.render("church/branch-admin/attendance_tracker", branchAdminLocals(req, locals));
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
        const locals = await loadTrackerLocals(req, {
          error: validation.error,
          form: validation.form,
          forceShowForm: true,
          notice: null,
        });
        return res.status(400).render(
          "church/branch-admin/attendance_tracker",
          branchAdminLocals(req, locals)
        );
      }

      let saved;
      try {
        saved = await attendanceRepo.saveAttendanceRecordForBranch(pool, {
          organization_id: org.id,
          branch_id: branch.id,
          ...validation.data,
          status: validation.status,
          created_by_admin_id: req.churchBranchAdmin.admin_id,
        });
      } catch (err) {
        if (err && err.code === "ATTENDANCE_DUPLICATE") {
          const locals = await loadTrackerLocals(req, {
            error: err.message,
            form: validation.data,
            forceShowForm: true,
            notice: null,
          });
          return res.status(409).render(
            "church/branch-admin/attendance_tracker",
            branchAdminLocals(req, locals)
          );
        }
        throw err;
      }

      await recordBranchAudit(pool, req, {
        action: validation.status === "submitted"
          ? "attendance_record_submitted"
          : saved.created
            ? "attendance_record_created"
            : "attendance_record_updated",
        entityType: "attendance_record",
        entityId: saved.record.id,
        metadata: {
          attendance_type: saved.record.attendance_type,
          service_date: validation.data.attendance_date,
          created: saved.created,
        },
      });

      const notice =
        validation.status === "submitted" ? "submitted" : saved.created ? "created" : "updated";
      return res.redirect(303, `/branch/attendance/${saved.record.id}?notice=${notice}`);
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
        const mapped = mapDetailRecord(record, branch.name);
        const isDraft = mapped.status === "draft";
        const editMode = String(req.query.edit || "").trim() === "1" && isDraft;
        return res.render(
          "church/branch-admin/attendance_record_detail",
          branchAdminLocals(req, {
            record: mapped,
            canEditRecord: isDraft,
            canSubmitRecord: isDraft && !editMode,
            editMode,
            attendanceTypes: ATTENDANCE_TYPES,
            attendanceStatusLabel,
            trackerBackHref: "/branch/attendance",
            detailActionBase: `/branch/attendance/${mapped.id}`,
            checkInHref: "/branch/attendance/check-in",
            form: {
              attendance_type: mapped.attendance_type,
              service_name: mapped.service_name,
              attendance_date: mapped.service_date_display,
              adults_count: mapped.adults_count,
              youth_count: mapped.youth_count,
              children_count: mapped.children_count,
              first_time_visitors_count: mapped.first_time_visitors_count,
              new_members_count: mapped.new_members_count,
              volunteers_count: mapped.volunteers_count,
              notes: mapped.notes,
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
    "/branch/attendance/:recordId/update",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const branch = req.churchContext.branch;
        const org = req.churchContext.organization;
        const recordId = Number(req.params.recordId);
        if (!Number.isFinite(recordId) || recordId <= 0) {
          return res.status(404).type("text").send("Attendance record not found.");
        }
        const pool = getPgPool();
        const existing = await attendanceRepo.findAttendanceRecordByIdForBranch(pool, recordId, branch.id);
        if (!existing) {
          return res.status(404).type("text").send("Attendance record not found.");
        }
        if (existing.status !== "draft") {
          return res.status(403).type("text").send("Only draft attendance records can be edited.");
        }

        const validation = validateAttendanceBody(req.body || {});
        if (!validation.ok) {
          const mapped = mapDetailRecord(existing, branch.name);
          return res.status(400).render(
            "church/branch-admin/attendance_record_detail",
            branchAdminLocals(req, {
              record: mapped,
              canEditRecord: true,
              canSubmitRecord: false,
              editMode: true,
              attendanceTypes: ATTENDANCE_TYPES,
              attendanceStatusLabel,
              trackerBackHref: "/branch/attendance",
              detailActionBase: `/branch/attendance/${mapped.id}`,
              checkInHref: "/branch/attendance/check-in",
              form: validation.form,
              error: validation.error,
              notice: null,
            })
          );
        }

        // If context fields change, enforce uniqueness against other records.
        const contextChanged =
          String(existing.attendance_type) !== validation.data.attendance_type ||
          formatDateInput(existing.service_date) !== validation.data.attendance_date ||
          String(existing.service_name).trim().toLowerCase() !==
            String(validation.data.service_name).trim().toLowerCase();

        if (contextChanged) {
          const conflict = await attendanceRepo.findAttendanceRecordByContextForBranch(pool, branch.id, {
            attendance_date: validation.data.attendance_date,
            attendance_type: validation.data.attendance_type,
            service_name: validation.data.service_name,
          });
          if (conflict && Number(conflict.id) !== Number(recordId)) {
            const mapped = mapDetailRecord(existing, branch.name);
            return res.status(409).render(
              "church/branch-admin/attendance_record_detail",
              branchAdminLocals(req, {
                record: mapped,
                canEditRecord: true,
                canSubmitRecord: false,
                editMode: true,
                attendanceTypes: ATTENDANCE_TYPES,
                attendanceStatusLabel,
                trackerBackHref: "/branch/attendance",
                detailActionBase: `/branch/attendance/${mapped.id}`,
                checkInHref: "/branch/attendance/check-in",
                form: validation.data,
                error: "Another attendance record already exists for this date, type, and service name.",
                notice: null,
              })
            );
          }
        }

        const updated = await attendanceRepo.updateAttendanceRecordForBranch(pool, recordId, branch.id, {
          ...validation.data,
          status: validation.status,
        });
        if (!updated) {
          return res.status(404).type("text").send("Attendance record not found.");
        }

        await recordBranchAudit(pool, req, {
          action:
            validation.status === "submitted" ? "attendance_record_submitted" : "attendance_record_updated",
          entityType: "attendance_record",
          entityId: recordId,
          metadata: {
            attendance_type: validation.data.attendance_type,
            service_date: validation.data.attendance_date,
            organization_id: org.id,
          },
        });

        const notice = validation.status === "submitted" ? "submitted" : "updated";
        return res.redirect(303, `/branch/attendance/${recordId}?notice=${notice}`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/attendance/:recordId/update-status",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireChurchSessionCsrf,
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
