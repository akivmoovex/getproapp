"use strict";

const { getPgPool } = require("../../db/pg");
const branchesRepo = require("../../db/pg/church/branchesRepo");
const attendanceRepo = require("../../db/pg/church/attendanceRepo");
const { requireChurchHqAdminSession } = require("../../church/hqAuth");
const { requireChurchBranchHost } = require("./auth");
const {
  ATTENDANCE_TYPES,
  ATTENDANCE_STATUS_FILTERS,
  parseAttendanceTrackerQuery,
  resolveAttendanceListState,
  attendanceStatusLabel,
} = require("../../church/attendanceValidation");
const { assertCrossBranchMemberAccess } = require("../../services/church/growthMultiBranchService");
const { hqAdminLocals } = require("./hqAdminShared");

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

function resolveAllowedBranchId(branchId, branches) {
  if (branchId == null) return null;
  const allowed = (branches || []).some((b) => Number(b.id) === Number(branchId));
  return allowed ? branchId : null;
}

function mapDetailRecord(record) {
  return {
    ...record,
    total_attendance: attendanceRepo.totalAttendance(record),
    service_date_display: formatDateInput(record.service_date),
    service_date_label: formatDisplayDate(record.service_date),
    status_label: attendanceStatusLabel(record.status),
    created_at_label: formatDateTimeLabel(record.created_at),
    updated_at_label: formatDateTimeLabel(record.updated_at),
  };
}

module.exports = function registerHqAdminAttendanceRoutes(router) {
  router.get("/hq/attendance", requireChurchBranchHost, requireChurchHqAdminSession, async (req, res, next) => {
    try {
      const org = req.churchContext.organization;
      try {
        assertCrossBranchMemberAccess(org);
      } catch (err) {
        if (err.code === "PACKAGE_REQUIRED") {
          return res.status(403).type("text").send(err.message);
        }
        throw err;
      }

      const pool = getPgPool();
      const branches = await branchesRepo.listBranchesForOrganization(pool, org.id);
      const parsed = parseAttendanceTrackerQuery(req.query);
      const branchFilterId = resolveAllowedBranchId(parsed.branchId, branches);

      let records = [];
      let listError = null;
      try {
        records = await attendanceRepo.listAttendanceRecordsForOrganization(pool, org.id, {
          branchId: branchFilterId,
          attendanceType: parsed.attendanceType,
          status: parsed.status,
          q: parsed.q,
          month: parsed.month,
          date: parsed.date,
        });
      } catch {
        listError = "Attendance records could not be loaded. Please try again.";
      }

      const totalInScope = await attendanceRepo.countAttendanceRecordsForOrganization(pool, org.id, {
        branchId: branchFilterId,
      });

      const rows = records.map((row) => ({
        ...row,
        total_attendance: attendanceRepo.totalAttendance(row),
        service_date_display: formatDateInput(row.service_date),
        service_date_label: formatDisplayDate(row.service_date),
        status_label: attendanceStatusLabel(row.status),
      }));

      const listState = resolveAttendanceListState(
        {
          q: parsed.q,
          status: parsed.status,
          attendanceType: parsed.attendanceType,
          month: parsed.month,
          date: parsed.date,
          branchId: branchFilterId,
        },
        rows,
        { hasRecordsInScope: totalInScope > 0 }
      );

      let pendingDrafts = 0;
      let totalLast30Days = 0;
      let visitorsThisMonth = 0;
      let childrenLastService = 0;
      try {
        const overviewRows = await attendanceRepo.listAttendanceRecordsForOrganization(pool, org.id, {
          branchId: branchFilterId,
          limit: 500,
        });
        pendingDrafts = overviewRows.filter((r) => r.status === "draft").length;
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const now = new Date();
        for (const r of overviewRows) {
          const d = r.service_date instanceof Date ? r.service_date : new Date(r.service_date);
          if (!Number.isNaN(d.getTime()) && d.getTime() >= cutoff) {
            totalLast30Days += attendanceRepo.totalAttendance(r);
          }
          if (
            !Number.isNaN(d.getTime()) &&
            d.getFullYear() === now.getFullYear() &&
            d.getMonth() === now.getMonth()
          ) {
            visitorsThisMonth += Number(r.first_time_visitors_count || 0);
          }
        }
        if (overviewRows[0]) childrenLastService = Number(overviewRows[0].children_count || 0);
      } catch {
        /* keep zeros */
      }

      const overview = {
        totalLast30Days,
        visitorsThisMonth,
        childrenLastService,
        pendingDrafts,
        monthTotal: 0,
        sundayAvg: 0,
        sundayRecordCount: 0,
        monthLabel: new Date().toLocaleDateString("en-GB", { month: "short" }),
      };

      return res.render(
        "church/hq/attendance_tracker",
        hqAdminLocals(req, {
          activeNav: "attendance",
          records: rows,
          attendanceTypes: ATTENDANCE_TYPES,
          attendanceStatusFilters: ATTENDANCE_STATUS_FILTERS,
          attendanceStatusLabel,
          typeFilter: parsed.attendanceType,
          statusFilter: parsed.status,
          searchQuery: parsed.q,
          monthFilter: parsed.month,
          dateFilter: parsed.date,
          showForm: false,
          canRecord: false,
          listState,
          listError,
          overview,
          trackerAction: "/hq/attendance",
          recordDetailBase: "/hq/attendance",
          checkInHref: null,
          portalKind: "hq",
          showBranchFilter: branches.length > 1,
          branchOptions: branches,
          branchFilterId,
          error: null,
          form: {},
          notice: null,
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get(
    "/hq/attendance/:recordId",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    async (req, res, next) => {
      try {
        const org = req.churchContext.organization;
        try {
          assertCrossBranchMemberAccess(org);
        } catch (err) {
          if (err.code === "PACKAGE_REQUIRED") {
            return res.status(403).type("text").send(err.message);
          }
          throw err;
        }
        const recordId = Number(req.params.recordId);
        if (!Number.isFinite(recordId) || recordId <= 0) {
          return res.status(404).type("text").send("Attendance record not found.");
        }
        const pool = getPgPool();
        const record = await attendanceRepo.findAttendanceRecordByIdForOrganization(
          pool,
          recordId,
          org.id
        );
        if (!record) {
          return res.status(404).type("text").send("Attendance record not found.");
        }
        const mapped = mapDetailRecord(record);
        return res.render(
          "church/hq/attendance_record_detail",
          hqAdminLocals(req, {
            activeNav: "attendance",
            record: mapped,
            canEditRecord: false,
            canSubmitRecord: false,
            editMode: false,
            attendanceTypes: ATTENDANCE_TYPES,
            attendanceStatusLabel,
            trackerBackHref: "/hq/attendance",
            detailActionBase: `/hq/attendance/${mapped.id}`,
            checkInHref: null,
            form: {},
            error: null,
            notice: null,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );
};
