"use strict";

const { getPgPool } = require("../../db/pg");
const ministriesRepo = require("../../db/pg/church/ministriesRepo");
const memberMinistriesRepo = require("../../db/pg/church/memberMinistriesRepo");
const ministryLeadersRepo = require("../../db/pg/church/ministryLeadersRepo");
const ministryJoinRequestsRepo = require("../../db/pg/church/ministryJoinRequestsRepo");
const ministryActivityNotesRepo = require("../../db/pg/church/ministryActivityNotesRepo");
const attendanceRepo = require("../../db/pg/church/attendanceRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const {
  MINISTRY_VISIBILITIES,
  ministryStatusLabel,
  visibilityLabel,
  formatMinistrySchedule,
  validateMinistryBody,
} = require("../../church/ministriesDepartmentsValidation");
const { reviewStatusLabel } = require("../../church/ministryActivityReviewValidation");
const { leaderRoleLabel } = require("../../church/leaderManagementValidation");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const {
  branchAdminLocals,
  flashFromQuery,
  MINISTRY_NOTICES,
  noticeMessage,
  recordBranchAudit,
} = require("./branchAdminShared");

const MINISTRY_FILTERS = ["all", "draft", "published", "archived"];

function formFromMinistry(item) {
  if (!item) {
    return {
      name: "",
      slug: "",
      description: "",
      leader_name: "",
      leader_phone: "",
      meeting_day: "",
      meeting_time: "",
      location: "",
      visibility: "members",
    };
  }
  return {
    name: item.name,
    slug: item.slug,
    description: item.description,
    leader_name: item.leader_name,
    leader_phone: item.leader_phone || "",
    meeting_day: item.meeting_day || "",
    meeting_time: item.meeting_time || "",
    location: item.location || "",
    visibility: item.visibility || "members",
  };
}

function renderLocals(req, extra) {
  return branchAdminLocals(req, {
    visibilities: MINISTRY_VISIBILITIES,
    visibilityLabel,
    ministryStatusLabel,
    formatMinistrySchedule,
    reviewStatusLabel,
    leaderRoleLabel,
    ...(extra || {}),
  });
}

module.exports = function registerBranchAdminMinistriesRoutes(router) {
  router.get("/branch/ministries", requireChurchBranchHost, requireChurchBranchAdminSession, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const filter = String(req.query.status || "all").trim();
      const statusFilter = MINISTRY_FILTERS.includes(filter) ? filter : "all";
      const ministries = await ministriesRepo.listMinistriesForBranch(pool, branch.id, { status: statusFilter });
      return res.render(
        "church/branch-admin/ministries_directory",
        renderLocals(req, {
          ministries,
          statusFilter,
          ministryFilters: MINISTRY_FILTERS,
          notice: noticeMessage(flashFromQuery(req, MINISTRY_NOTICES)),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/branch/ministries/new", requireChurchBranchHost, requireChurchBranchAdminSession, (req, res) => {
    return res.render(
      "church/branch-admin/ministry_form",
      renderLocals(req, { form: formFromMinistry(null), error: null, isEdit: false, ministryId: null })
    );
  });

  router.post("/branch/ministries", requireChurchBranchHost, requireChurchBranchAdminSession, requireChurchSessionCsrf, async (req, res, next) => {
    try {
      const intent = String(req.body._intent || "draft").trim();
      const validation = validateMinistryBody(req.body, { forPublish: intent === "publish" });
      const org = req.churchContext.organization;
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const adminId = req.churchBranchAdmin.admin_id;

      if (!validation.ok) {
        return res.status(400).render(
          "church/branch-admin/ministry_form",
          renderLocals(req, { form: validation.form, error: validation.error, isEdit: false, ministryId: null })
        );
      }

      const created = await ministriesRepo.createMinistryForBranch(pool, {
        organization_id: org.id,
        branch_id: branch.id,
        ...validation.data,
        status: intent === "publish" ? "published" : "draft",
        created_by_admin_id: adminId,
      });

      await recordBranchAudit(pool, req, {
        action: "ministry_created",
        entityType: "ministry",
        entityId: created.id,
        metadata: { name: created.name, status: created.status },
      });

      if (intent === "publish") {
        await recordBranchAudit(pool, req, {
          action: "ministry_published",
          entityType: "ministry",
          entityId: created.id,
          metadata: { name: created.name, status: "published" },
        });
      }

      const notice = intent === "publish" ? "ministry_published" : "ministry_created";
      return res.redirect(303, `/branch/ministries/${created.id}?notice=${notice}`);
    } catch (e) {
      return next(e);
    }
  });

  router.get(
    "/branch/ministries/:ministryId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const ministryId = Number(req.params.ministryId);
        if (!Number.isFinite(ministryId) || ministryId <= 0) {
          return res.status(404).type("text").send("Ministry not found.");
        }
        const pool = getPgPool();
        const branch = req.churchContext.branch;
        const ministry = await ministriesRepo.findMinistryByIdForBranch(pool, ministryId, branch.id);
        if (!ministry) return res.status(404).type("text").send("Ministry not found.");
        const roster = await memberMinistriesRepo.listMembersForMinistry(pool, ministryId, branch.id, {
          status: "active",
        });
        const ministryLeaders = await ministryLeadersRepo.listLeadersForMinistry(pool, ministryId, branch.id);
        const pendingJoinRequestsCount = await ministryJoinRequestsRepo.countPendingJoinRequestsForMinistry(
          pool,
          branch.id,
          ministryId
        );
        const [latestActivityNotes, latestMinistryAttendance] = await Promise.all([
          ministryActivityNotesRepo.listActivityNotesForMinistry(pool, ministryId, branch.id, { limit: 3 }),
          attendanceRepo.listMinistryAttendanceForMinistry(pool, branch.id, ministryId, { limit: 3 }),
        ]);
        return res.render(
          "church/branch-admin/ministry_profile",
          renderLocals(req, {
            ministry,
            roster,
            ministryLeaders,
            pendingJoinRequestsCount,
            latestActivityNotes,
            latestMinistryAttendance,
            error: null,
            notice: noticeMessage(flashFromQuery(req, MINISTRY_NOTICES)),
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/ministries/:ministryId/edit",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const ministryId = Number(req.params.ministryId);
        if (!Number.isFinite(ministryId) || ministryId <= 0) {
          return res.status(404).type("text").send("Ministry not found.");
        }
        const pool = getPgPool();
        const ministry = await ministriesRepo.findMinistryByIdForBranch(
          pool,
          ministryId,
          req.churchContext.branch.id
        );
        if (!ministry) return res.status(404).type("text").send("Ministry not found.");
        if (ministry.status === "archived") {
          return res.redirect(303, `/branch/ministries/${ministryId}`);
        }
        return res.render(
          "church/branch-admin/ministry_form",
          renderLocals(req, {
            form: formFromMinistry(ministry),
            error: null,
            isEdit: true,
            ministryId,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/ministries/:ministryId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const ministryId = Number(req.params.ministryId);
        if (!Number.isFinite(ministryId) || ministryId <= 0) {
          return res.status(404).type("text").send("Ministry not found.");
        }
        const intent = String(req.body._intent || "draft").trim();
        const validation = validateMinistryBody(req.body, { forPublish: intent === "publish" });
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;

        const existing = await ministriesRepo.findMinistryByIdForBranch(pool, ministryId, branch.id);
        if (!existing) return res.status(404).type("text").send("Ministry not found.");
        if (existing.status === "archived") {
          return res.redirect(303, `/branch/ministries/${ministryId}`);
        }

        if (!validation.ok) {
          return res.status(400).render(
            "church/branch-admin/ministry_form",
            renderLocals(req, {
              form: validation.form,
              error: validation.error,
              isEdit: true,
              ministryId,
            })
          );
        }

        const updated = await ministriesRepo.updateMinistryForBranch(pool, ministryId, branch.id, {
          ...validation.data,
          updated_by_admin_id: adminId,
        });

        await recordBranchAudit(pool, req, {
          action: "ministry_updated",
          entityType: "ministry",
          entityId: ministryId,
          metadata: { name: updated.name, status: updated.status },
        });

        if (intent === "publish") {
          const published = await ministriesRepo.publishMinistryForBranch(pool, ministryId, branch.id, adminId);
          if (published) {
            await recordBranchAudit(pool, req, {
              action: "ministry_published",
              entityType: "ministry",
              entityId: ministryId,
              metadata: { name: published.name, status: "published" },
            });
          }
          return res.redirect(303, `/branch/ministries/${ministryId}?notice=ministry_published`);
        }

        return res.redirect(303, `/branch/ministries/${ministryId}?notice=ministry_updated`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/ministries/:ministryId/publish",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const ministryId = Number(req.params.ministryId);
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;
        const existing = await ministriesRepo.findMinistryByIdForBranch(pool, ministryId, branch.id);
        if (!existing) return res.status(404).type("text").send("Ministry not found.");
        if (!existing.description || !existing.name) {
          return res.status(400).render(
            "church/branch-admin/ministry_profile",
            renderLocals(req, {
              ministry: existing,
              roster: [],
              error: "Name and description are required before publishing.",
              notice: null,
            })
          );
        }
        const published = await ministriesRepo.publishMinistryForBranch(pool, ministryId, branch.id, adminId);
        if (!published) {
          return res.status(400).render(
            "church/branch-admin/ministry_profile",
            renderLocals(req, {
              ministry: existing,
              roster: [],
              error: "Ministry could not be published.",
              notice: null,
            })
          );
        }
        await recordBranchAudit(pool, req, {
          action: "ministry_published",
          entityType: "ministry",
          entityId: ministryId,
          metadata: { name: published.name, status: "published" },
        });
        return res.redirect(303, `/branch/ministries/${ministryId}?notice=ministry_published`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/ministries/:ministryId/archive",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const ministryId = Number(req.params.ministryId);
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;
        const existing = await ministriesRepo.findMinistryByIdForBranch(pool, ministryId, branch.id);
        if (!existing) return res.status(404).type("text").send("Ministry not found.");
        const archived = await ministriesRepo.archiveMinistryForBranch(pool, ministryId, branch.id, adminId);
        if (!archived) {
          return res.status(400).render(
            "church/branch-admin/ministry_profile",
            renderLocals(req, {
              ministry: existing,
              roster: [],
              error: "Ministry could not be archived.",
              notice: null,
            })
          );
        }
        await recordBranchAudit(pool, req, {
          action: "ministry_archived",
          entityType: "ministry",
          entityId: ministryId,
          metadata: { name: archived.name, status: "archived" },
        });
        return res.redirect(303, `/branch/ministries?notice=ministry_archived`);
      } catch (e) {
        return next(e);
      }
    }
  );
};
