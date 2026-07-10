"use strict";

const { getPgPool } = require("../../db/pg");
const ministryActivityNotesRepo = require("../../db/pg/church/ministryActivityNotesRepo");
const attendanceRepo = require("../../db/pg/church/attendanceRepo");
const ministriesRepo = require("../../db/pg/church/ministriesRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const {
  REVIEW_STATUSES,
  reviewStatusLabel,
  validateMarkReviewedBody,
  validateFollowUpBody,
} = require("../../church/ministryActivityReviewValidation");
const {
  branchAdminLocals,
  flashFromQuery,
  MINISTRY_ACTIVITY_NOTICES,
  noticeMessage,
  recordBranchAudit,
} = require("./branchAdminShared");

const REVIEW_FILTERS = ["all", "submitted", "reviewed", "follow_up_requested"];

function formatDateInput(d) {
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleDateString("en-GB");
}

function renderLocals(req, extra) {
  return branchAdminLocals(req, {
    reviewStatusLabel,
    formatDateInput,
    ...(extra || {}),
  });
}

module.exports = function registerBranchAdminMinistryActivityRoutes(router) {
  router.get(
    "/branch/ministry-activity",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const filter = String(req.query.review_status || "all").trim();
        const reviewFilter = REVIEW_FILTERS.includes(filter) ? filter : "all";
        const notes = await ministryActivityNotesRepo.listActivityNotesForBranch(pool, branch.id, {
          reviewStatus: reviewFilter,
        });
        return res.render(
          "church/branch-admin/ministry_activity_queue",
          renderLocals(req, {
            notes,
            reviewFilter,
            reviewFilters: REVIEW_FILTERS,
            notice: noticeMessage(flashFromQuery(req, MINISTRY_ACTIVITY_NOTICES)),
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/ministry-activity/:noteId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const noteId = Number(req.params.noteId);
        if (!Number.isFinite(noteId) || noteId <= 0) {
          return res.status(404).type("text").send("Activity note not found.");
        }
        const pool = getPgPool();
        const note = await ministryActivityNotesRepo.findActivityNoteByIdForBranch(
          pool,
          noteId,
          req.churchContext.branch.id
        );
        if (!note) return res.status(404).type("text").send("Activity note not found.");
        if (note.status !== "submitted") {
          return res.status(404).type("text").send("Activity note not found.");
        }
        return res.render(
          "church/branch-admin/ministry_activity_detail",
          renderLocals(req, {
            note,
            error: null,
            notice: noticeMessage(flashFromQuery(req, MINISTRY_ACTIVITY_NOTICES)),
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/ministry-activity/:noteId/mark-reviewed",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const noteId = Number(req.params.noteId);
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;
        const existing = await ministryActivityNotesRepo.findActivityNoteByIdForBranch(pool, noteId, branch.id);
        if (!existing || existing.status !== "submitted") {
          return res.status(404).type("text").send("Activity note not found.");
        }
        const validation = validateMarkReviewedBody(req.body);
        const reviewed = await ministryActivityNotesRepo.markActivityNoteReviewedForBranch(
          pool,
          noteId,
          branch.id,
          adminId,
          validation.adminComment
        );
        if (!reviewed) {
          return res.status(400).render(
            "church/branch-admin/ministry_activity_detail",
            renderLocals(req, {
              note: existing,
              error: "Note could not be marked as reviewed.",
              notice: null,
            })
          );
        }
        await recordBranchAudit(pool, req, {
          action: "ministry_activity_note_reviewed",
          entityType: "ministry_activity_note",
          entityId: noteId,
          metadata: {
            ministry_id: reviewed.ministry_id,
            period_month: reviewed.period_month,
            review_status: "reviewed",
            comment: validation.adminComment || "",
          },
        });
        return res.redirect(303, `/branch/ministry-activity/${noteId}?notice=activity_note_reviewed`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/ministry-activity/:noteId/request-follow-up",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const noteId = Number(req.params.noteId);
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;
        const existing = await ministryActivityNotesRepo.findActivityNoteByIdForBranch(pool, noteId, branch.id);
        if (!existing || existing.status !== "submitted") {
          return res.status(404).type("text").send("Activity note not found.");
        }
        const validation = validateFollowUpBody(req.body);
        if (!validation.ok) {
          return res.status(400).render(
            "church/branch-admin/ministry_activity_detail",
            renderLocals(req, {
              note: existing,
              error: validation.error,
              notice: null,
            })
          );
        }
        const updated = await ministryActivityNotesRepo.requestActivityNoteFollowUpForBranch(
          pool,
          noteId,
          branch.id,
          adminId,
          validation.adminComment
        );
        if (!updated) {
          return res.status(400).render(
            "church/branch-admin/ministry_activity_detail",
            renderLocals(req, {
              note: existing,
              error: "Follow-up could not be requested.",
              notice: null,
            })
          );
        }
        await recordBranchAudit(pool, req, {
          action: "ministry_activity_follow_up_requested",
          entityType: "ministry_activity_note",
          entityId: noteId,
          metadata: {
            ministry_id: updated.ministry_id,
            period_month: updated.period_month,
            review_status: "follow_up_requested",
            comment: validation.adminComment,
          },
        });
        return res.redirect(303, `/branch/ministry-activity/${noteId}?notice=activity_follow_up_requested`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/ministry-attendance",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const records = await attendanceRepo.listMinistryAttendanceForBranch(pool, branch.id);
        const rows = records.map((row) => ({
          ...row,
          total_attendance: attendanceRepo.totalAttendance(row),
          service_date_display: formatDateInput(row.service_date),
        }));
        return res.render(
          "church/branch-admin/ministry_attendance",
          renderLocals(req, { records: rows })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/ministries/:ministryId/activity",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const ministryId = Number(req.params.ministryId);
        if (!Number.isFinite(ministryId) || ministryId <= 0) {
          return res.status(404).type("text").send("Ministry not found.");
        }
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const ministry = await ministriesRepo.findMinistryByIdForBranch(pool, ministryId, branch.id);
        if (!ministry) return res.status(404).type("text").send("Ministry not found.");
        const [notes, records] = await Promise.all([
          ministryActivityNotesRepo.listActivityNotesForMinistry(pool, ministryId, branch.id, { limit: 20 }),
          attendanceRepo.listMinistryAttendanceForMinistry(pool, branch.id, ministryId, { limit: 20 }),
        ]);
        const attendanceRows = records.map((row) => ({
          ...row,
          total_attendance: attendanceRepo.totalAttendance(row),
          service_date_display: formatDateInput(row.service_date),
        }));
        return res.render(
          "church/branch-admin/ministry_activity_overview",
          renderLocals(req, {
            ministry,
            notes,
            records: attendanceRows,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );
};
