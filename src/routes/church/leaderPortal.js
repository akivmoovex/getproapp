"use strict";

const { getPgPool } = require("../../db/pg");
const ministryLeadersRepo = require("../../db/pg/church/ministryLeadersRepo");
const ministriesRepo = require("../../db/pg/church/ministriesRepo");
const memberMinistriesRepo = require("../../db/pg/church/memberMinistriesRepo");
const dutyRosterRepo = require("../../db/pg/church/dutyRosterRepo");
const attendanceRepo = require("../../db/pg/church/attendanceRepo");
const ministryActivityNotesRepo = require("../../db/pg/church/ministryActivityNotesRepo");
const hqBroadcastsRepo = require("../../db/pg/church/hqBroadcastsRepo");
const { LEADER_HQ_AUDIENCES } = require("../../church/hqBroadcastValidation");
const {
  getChurchLeaderSession,
  setChurchLeaderSession,
  clearChurchLeaderSession,
  requireChurchLeaderSession,
  verifyLeaderPassword,
} = require("../../church/leaderAuth");
const { requireChurchBranchHost } = require("./auth");
const { validateAttendanceBody } = require("../../church/attendanceValidation");
const {
  validateActivityNoteBody,
  currentPeriodMonth,
} = require("../../church/leaderActivityNotesValidation");
const { formatDutyDate, assignedMemberDisplay, dutyStatusLabel } = require("../../church/dutyRosterValidation");
const { leaderPortalLocals, flashFromQuery, recordLeaderAudit } = require("./leaderShared");
const { authenticateWithLoginProtection } = require("../../services/church/churchLoginProtectionService");
const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const ministryLeaderPasswordResetRequestsRepo = require("../../db/pg/church/ministryLeaderPasswordResetRequestsRepo");
const { maskLoginIdentifier } = require("../../church/loginProtection");
const {
  validatePublicLeaderForgotPasswordBody,
  PUBLIC_SUCCESS_MESSAGE,
} = require("../../church/ministryLeaderPasswordResetRequestValidation");
const {
  gatePasswordResetRequest,
  recordPasswordResetSubmission,
} = require("../../services/church/passwordResetRateLimitService");

function formatDateInput(d) {
  if (!d) return "";
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

function requireLeaderMinistry(req, res, next) {
  const leader = req.churchLeader;
  if (!leader || !leader.ministry_id) {
    return res.status(403).type("text").send("No ministry assigned to this leader account.");
  }
  return next();
}

async function loadMinistryContext(pool, leader) {
  const ministry = await ministriesRepo.findMinistryByIdForBranch(
    pool,
    leader.ministry_id,
    leader.branch_id
  );
  return ministry;
}

function validateLeaderAttendanceBody(body) {
  const merged = { ...(body || {}), attendance_type: "Ministry meeting" };
  return validateAttendanceBody(merged);
}

async function ensureLeaderStillActive(req, res, next) {
  try {
    const pool = getPgPool();
    const row = await ministryLeadersRepo.findLeaderByIdForBranch(
      pool,
      req.churchLeader.leader_id,
      req.churchLeader.branch_id
    );
    if (!row || row.status !== "active") {
      clearChurchLeaderSession(req);
      return res.redirect("/leader/login");
    }
    req.churchLeader = {
      leader_id: row.id,
      organization_id: row.organization_id,
      branch_id: row.branch_id,
      ministry_id: row.ministry_id != null ? Number(row.ministry_id) : null,
      full_name: row.full_name,
      role: row.role,
      status: row.status,
    };
    return next();
  } catch (e) {
    return next(e);
  }
}
function registerLeaderPortalRoutes(router) {
  router.use("/leader", requireChurchBranchHost);

  router.get("/leader/login", (req, res) => {
    const leader = getChurchLeaderSession(req);
    if (leader && Number(leader.branch_id) === Number(req.churchContext.branch.id)) {
      return res.redirect("/leader/dashboard");
    }
    return res.render(
      "church/leader/login",
      leaderPortalLocals(req, { error: null, identifier: "" })
    );
  });

  router.post("/leader/login", async (req, res, next) => {
    try {
      const identifier = String((req.body && req.body.identifier) || "").trim();
      const password = String((req.body && req.body.password) || "");
      const branch = req.churchContext.branch;
      const org = req.churchContext.organization;
      const pool = getPgPool();

      const renderError = (message) =>
        res.status(400).render(
          "church/leader/login",
          leaderPortalLocals(req, { error: message, identifier })
        );

      const auth = await authenticateWithLoginProtection(pool, req, {
        accountType: "ministry_leader",
        organizationId: org.id,
        branchId: branch.id,
        identifier,
        password,
        findAccount: (db, ident) =>
          ministryLeadersRepo.findLeaderByEmailOrPhoneForBranch(db, branch.id, ident),
        verifyPassword: verifyLeaderPassword,
        validateAccountStatus(row) {
          if (row.status === "inactive") {
            return {
              ok: false,
              error:
                "Your ministry leader access is currently inactive. Please contact the church office for assistance.",
              clearSession: true,
            };
          }
          if (row.status !== "active") {
            return {
              ok: false,
              error: "Unable to sign in right now. Please contact the church office.",
              clearSession: true,
            };
          }
          return { ok: true };
        },
      });

      if (!auth.ok) {
        return renderError(auth.error);
      }

      const row = auth.account;
      setChurchLeaderSession(req, {
        leader_id: row.id,
        organization_id: row.organization_id,
        branch_id: row.branch_id,
        ministry_id: row.ministry_id,
        full_name: row.full_name,
        role: row.role,
        status: row.status,
      });

      return res.redirect(303, "/leader/dashboard");
    } catch (e) {
      return next(e);
    }
  });

  router.post("/leader/logout", requireChurchLeaderSession, (req, res) => {
    clearChurchLeaderSession(req);
    return res.redirect(303, "/leader/login");
  });

  router.get("/leader/forgot-password", (req, res) => {
    return res.render(
      "church/leader/forgot_password",
      leaderPortalLocals(req, {
        error: null,
        form: {},
      })
    );
  });

  router.post("/leader/forgot-password", async (req, res, next) => {
    try {
      const validation = validatePublicLeaderForgotPasswordBody(req.body || {});
      if (!validation.ok) {
        return res.status(400).render(
          "church/leader/forgot_password",
          leaderPortalLocals(req, {
            error: validation.error,
            form: validation.form,
          })
        );
      }

      const org = req.churchContext.organization;
      const branch = req.churchContext.branch;
      const pool = getPgPool();

      const rateGate = await gatePasswordResetRequest(pool, req, {
        requestType: "ministry_leader",
        organizationId: org.id,
        branchId: branch.id,
        identifier: validation.data.identifier,
      });
      if (!rateGate.allowed) {
        return res.redirect(303, "/leader/forgot-password-submitted");
      }

      const matched =
        await ministryLeaderPasswordResetRequestsRepo.findPossibleMinistryLeaderByIdentifierForBranch(
          pool,
          branch.id,
          validation.data.identifier
        );

      const requestRow = await ministryLeaderPasswordResetRequestsRepo.createMinistryLeaderPasswordResetRequest(
        pool,
        {
          organizationId: org.id,
          branchId: branch.id,
          ministryLeaderId: matched ? matched.id : null,
          ministryId: matched && matched.ministry_id ? matched.ministry_id : null,
          identifierSubmitted: validation.data.identifier,
          fullNameSubmitted: validation.data.full_name,
          phoneSubmitted: validation.data.phone,
          emailSubmitted: validation.data.email,
        }
      );

      await auditLogsRepo.insertAuditLog(pool, {
        organization_id: org.id,
        branch_id: branch.id,
        actor_type: "public",
        actor_id: null,
        action: "ministry_leader_password_reset_requested",
        entity_type: "ministry_leader_password_reset_request",
        entity_id: requestRow.id,
        metadata_json: {
          request_id: requestRow.id,
          ministry_leader_id: requestRow.ministry_leader_id ?? null,
          ministry_id: requestRow.ministry_id ?? null,
          organization_id: org.id,
          branch_id: branch.id,
          identifier_masked: maskLoginIdentifier(validation.data.identifier),
          status: requestRow.status,
          action_source: "ministry_leader_forgot_password_request",
        },
      });

      await recordPasswordResetSubmission(pool, req, {
        requestType: "ministry_leader",
        organizationId: org.id,
        branchId: branch.id,
        identifier: validation.data.identifier,
      });

      return res.redirect(303, "/leader/forgot-password-submitted");
    } catch (e) {
      return next(e);
    }
  });

  router.get("/leader/forgot-password-submitted", (req, res) => {
    return res.render(
      "church/leader/forgot_password_submitted",
      leaderPortalLocals(req, {
        successMessage: PUBLIC_SUCCESS_MESSAGE,
      })
    );
  });

  router.get("/leader/dashboard", requireChurchLeaderSession, ensureLeaderStillActive, requireLeaderMinistry, async (req, res, next) => {
    try {
      const leader = req.churchLeader;
      const pool = getPgPool();
      const ministry = await loadMinistryContext(pool, leader);
      if (!ministry) {
        return res.status(404).type("text").send("Assigned ministry not found.");
      }
      const rosterCount = await memberMinistriesRepo.countMembersForMinistry(
        pool,
        leader.ministry_id,
        leader.branch_id
      );
      const upcomingDuties = await dutyRosterRepo.listConfirmedDutiesForMinistry(
        pool,
        leader.branch_id,
        leader.ministry_id,
        { timeframe: "upcoming", limit: 5 }
      );
      const now = new Date();
      const attendanceThisMonth = await attendanceRepo.countAttendanceRecordsForLeaderMinistryMonth(
        pool,
        leader.branch_id,
        leader.ministry_id,
        leader.leader_id,
        now.getFullYear(),
        now.getMonth() + 1
      );
      const periodMonth = currentPeriodMonth();
      const currentNote = await ministryActivityNotesRepo.findActivityNoteForLeaderPeriod(
        pool,
        leader.leader_id,
        periodMonth
      );
      const hqBroadcasts = await hqBroadcastsRepo.listVisibleBroadcastsForBranch(
        pool,
        req.churchContext.organization.id,
        leader.branch_id,
        { audiences: LEADER_HQ_AUDIENCES, limit: 5 }
      );
      return res.render(
        "church/leader/dashboard",
        leaderPortalLocals(req, {
          ministry,
          rosterCount,
          upcomingDuties,
          attendanceThisMonth,
          currentNote,
          periodMonth,
          hqBroadcasts,
          formatDutyDate,
          assignedMemberDisplay,
          notice: flashFromQuery(req),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/leader/roster", requireChurchLeaderSession, ensureLeaderStillActive, requireLeaderMinistry, async (req, res, next) => {
    try {
      const leader = req.churchLeader;
      const pool = getPgPool();
      const ministry = await loadMinistryContext(pool, leader);
      const roster = await memberMinistriesRepo.listMembersForMinistry(
        pool,
        leader.ministry_id,
        leader.branch_id
      );
      return res.render(
        "church/leader/roster",
        leaderPortalLocals(req, { ministry, roster })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/leader/duties", requireChurchLeaderSession, ensureLeaderStillActive, requireLeaderMinistry, async (req, res, next) => {
    try {
      const leader = req.churchLeader;
      const pool = getPgPool();
      const ministry = await loadMinistryContext(pool, leader);
      const [upcomingDuties, pastDuties] = await Promise.all([
        dutyRosterRepo.listConfirmedDutiesForMinistry(pool, leader.branch_id, leader.ministry_id, {
          timeframe: "upcoming",
        }),
        dutyRosterRepo.listConfirmedDutiesForMinistry(pool, leader.branch_id, leader.ministry_id, {
          timeframe: "past",
        }),
      ]);
      return res.render(
        "church/leader/duties",
        leaderPortalLocals(req, {
          ministry,
          upcomingDuties,
          pastDuties,
          formatDutyDate,
          assignedMemberDisplay,
          dutyStatusLabel,
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/leader/attendance", requireChurchLeaderSession, ensureLeaderStillActive, requireLeaderMinistry, async (req, res, next) => {
    try {
      const leader = req.churchLeader;
      const pool = getPgPool();
      const ministry = await loadMinistryContext(pool, leader);
      const records = await attendanceRepo.listAttendanceRecordsForLeaderMinistry(
        pool,
        leader.branch_id,
        leader.ministry_id
      );
      const rows = records.map((row) => ({
        ...row,
        total_attendance: attendanceRepo.totalAttendance(row),
        service_date_display: formatDateInput(row.service_date),
      }));
      return res.render(
        "church/leader/attendance",
        leaderPortalLocals(req, {
          ministry,
          records: rows,
          error: null,
          form: { attendance_date: formatDateInput(new Date()), service_name: ministry ? ministry.name + " meeting" : "" },
          notice: flashFromQuery(req),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.post("/leader/attendance", requireChurchLeaderSession, ensureLeaderStillActive, requireLeaderMinistry, async (req, res, next) => {
    try {
      const leader = req.churchLeader;
      const org = req.churchContext.organization;
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const ministry = await loadMinistryContext(pool, leader);
      const validation = validateLeaderAttendanceBody(req.body || {});

      if (!validation.ok) {
        const records = await attendanceRepo.listAttendanceRecordsForLeaderMinistry(
          pool,
          leader.branch_id,
          leader.ministry_id
        );
        return res.status(400).render(
          "church/leader/attendance",
          leaderPortalLocals(req, {
            ministry,
            records: records.map((row) => ({
              ...row,
              total_attendance: attendanceRepo.totalAttendance(row),
              service_date_display: formatDateInput(row.service_date),
            })),
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
        status: "submitted",
        ministry_id: leader.ministry_id,
        created_by_leader_id: leader.leader_id,
        created_by_admin_id: null,
      });

      await recordLeaderAudit(pool, req, {
        action: "leader_attendance_record_created",
        entityType: "attendance_record",
        entityId: created.id,
        metadata: {
          ministry_id: leader.ministry_id,
          service_date: validation.data.attendance_date,
        },
      });

      return res.redirect(303, "/leader/attendance?notice=attendance_saved");
    } catch (e) {
      return next(e);
    }
  });

  router.get(
    "/leader/activity-notes",
    requireChurchLeaderSession,
    ensureLeaderStillActive,
    requireLeaderMinistry,
    async (req, res, next) => {
      try {
        const leader = req.churchLeader;
        const pool = getPgPool();
        const ministry = await loadMinistryContext(pool, leader);
        const periodMonth = String(req.query.period || currentPeriodMonth()).trim().slice(0, 7);
        const notes = await ministryActivityNotesRepo.listActivityNotesForLeader(pool, leader.leader_id);
        const current =
          notes.find((n) => n.period_month === periodMonth) ||
          (await ministryActivityNotesRepo.findActivityNoteForLeaderPeriod(pool, leader.leader_id, periodMonth));
        const form = current
          ? {
              period_month: current.period_month,
              title: current.title,
              activity_summary: current.activity_summary,
              challenges: current.challenges,
              support_needed: current.support_needed,
            }
          : {
              period_month: periodMonth,
              title: ministry ? `${ministry.name} — ${periodMonth}` : periodMonth,
              activity_summary: "",
              challenges: "",
              support_needed: "",
            };
        return res.render(
          "church/leader/activity_notes",
          leaderPortalLocals(req, {
            ministry,
            notes,
            form,
            error: null,
            notice: flashFromQuery(req),
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/leader/activity-notes",
    requireChurchLeaderSession,
    ensureLeaderStillActive,
    requireLeaderMinistry,
    async (req, res, next) => {
      try {
        const leader = req.churchLeader;
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const ministry = await loadMinistryContext(pool, leader);
        const intent = String(req.body._intent || "draft").trim();
        const validation = validateActivityNoteBody(req.body || {});

        const renderForm = async (error, form) => {
          const notes = await ministryActivityNotesRepo.listActivityNotesForLeader(pool, leader.leader_id);
          return res.status(error ? 400 : 200).render(
            "church/leader/activity_notes",
            leaderPortalLocals(req, { ministry, notes, form, error, notice: null })
          );
        };

        if (!validation.ok) {
          return renderForm(validation.error, validation.form);
        }

        if (validation.data.period_month !== currentPeriodMonth() && intent === "submit") {
          return renderForm("You can only submit the current month's note from this form.", validation.form);
        }

        const saved = await ministryActivityNotesRepo.createOrUpdateActivityNote(pool, {
          organization_id: org.id,
          branch_id: branch.id,
          ministry_id: leader.ministry_id,
          leader_id: leader.leader_id,
          ...validation.data,
          status: intent === "submit" ? "submitted" : "draft",
        });

        await recordLeaderAudit(pool, req, {
          action: intent === "submit" ? "leader_activity_note_submitted" : "leader_activity_note_saved",
          entityType: "ministry_activity_note",
          entityId: saved.id,
          metadata: {
            ministry_id: leader.ministry_id,
            period_month: saved.period_month,
            status: saved.status,
          },
        });

        const notice = intent === "submit" ? "activity_note_submitted" : "activity_note_saved";
        return res.redirect(303, `/leader/activity-notes?period=${saved.period_month}&notice=${notice}`);
      } catch (e) {
        return next(e);
      }
    }
  );
}

module.exports = registerLeaderPortalRoutes;
