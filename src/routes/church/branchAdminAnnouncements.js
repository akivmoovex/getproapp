"use strict";

const { getPgPool } = require("../../db/pg");
const announcementsRepo = require("../../db/pg/church/announcementsRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const {
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_AUDIENCES,
  announcementStatusLabel,
  audienceLabel,
  validateAnnouncementBody,
  formatDateTimeLocal,
} = require("../../church/announcementsEventsValidation");
const {
  branchAdminLocals,
  flashFromQuery,
  ANNOUNCEMENT_NOTICES,
  noticeMessage,
  recordBranchAudit,
} = require("./branchAdminShared");

const ANNOUNCEMENT_FILTERS = ["all", "draft", "published", "archived"];

function formFromAnnouncement(item) {
  if (!item) {
    return {
      title: "",
      body: "",
      category: "General",
      audience: "members",
      publish_at: "",
      expires_at: "",
    };
  }
  return {
    title: item.title,
    body: item.body,
    category: item.category || "General",
    audience: item.audience || "members",
    publish_at: formatDateTimeLocal(item.publish_at),
    expires_at: formatDateTimeLocal(item.expires_at),
  };
}

function renderFormLocals(req, extra) {
  return branchAdminLocals(req, {
    categories: ANNOUNCEMENT_CATEGORIES,
    audiences: ANNOUNCEMENT_AUDIENCES,
    audienceLabel,
    announcementStatusLabel,
    formatDateTimeLocal,
    ...(extra || {}),
  });
}

module.exports = function registerBranchAdminAnnouncementsRoutes(router) {
  router.get(
    "/branch/announcements",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const filter = String(req.query.status || "all").trim();
        const statusFilter = ANNOUNCEMENT_FILTERS.includes(filter) ? filter : "all";
        const announcements = await announcementsRepo.listAnnouncementsForBranch(pool, branch.id, {
          status: statusFilter,
        });
        return res.render(
          "church/branch-admin/announcements_management",
          renderFormLocals(req, {
            announcements,
            statusFilter,
            announcementFilters: ANNOUNCEMENT_FILTERS,
            notice: noticeMessage(flashFromQuery(req, ANNOUNCEMENT_NOTICES)),
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/announcements/new",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    (req, res) => {
      return res.render(
        "church/branch-admin/announcement_form",
        renderFormLocals(req, {
          form: formFromAnnouncement(null),
          error: null,
          isEdit: false,
          announcementId: null,
        })
      );
    }
  );

  router.post(
    "/branch/announcements",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const validation = validateAnnouncementBody(req.body || {});
        const intent = String(req.body._intent || "draft").trim();
        const publishNow = intent === "publish";
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;

        if (!validation.ok) {
          return res.status(400).render(
            "church/branch-admin/announcement_form",
            renderFormLocals(req, {
              form: validation.form,
              error: validation.error,
              isEdit: false,
              announcementId: null,
            })
          );
        }

        const created = await announcementsRepo.createAnnouncementForBranch(pool, {
          organization_id: org.id,
          branch_id: branch.id,
          ...validation.data,
          status: publishNow ? "published" : "draft",
          publish_at: publishNow ? validation.data.publish_at || new Date() : validation.data.publish_at,
          created_by_admin_id: adminId,
        });

        await recordBranchAudit(pool, req, {
          action: "announcement_created",
          entityType: "announcement",
          entityId: created.id,
          metadata: { status: created.status, title: created.title },
        });

        if (publishNow && created.status === "published") {
          await recordBranchAudit(pool, req, {
            action: "announcement_published",
            entityType: "announcement",
            entityId: created.id,
            metadata: { status: "published", title: created.title },
          });
        }

        const notice = publishNow ? "announcement_published" : "announcement_created";
        return res.redirect(303, `/branch/announcements/${created.id}?notice=${notice}`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/announcements/:announcementId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const announcementId = Number(req.params.announcementId);
        if (!Number.isFinite(announcementId) || announcementId <= 0) {
          return res.status(404).type("text").send("Announcement not found.");
        }
        const pool = getPgPool();
        const item = await announcementsRepo.findAnnouncementByIdForBranch(
          pool,
          announcementId,
          req.churchContext.branch.id
        );
        if (!item) {
          return res.status(404).type("text").send("Announcement not found.");
        }
        return res.render(
          "church/branch-admin/announcement_detail",
          renderFormLocals(req, {
            announcement: item,
            notice: noticeMessage(flashFromQuery(req, ANNOUNCEMENT_NOTICES)),
            error: null,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/announcements/:announcementId/edit",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const announcementId = Number(req.params.announcementId);
        if (!Number.isFinite(announcementId) || announcementId <= 0) {
          return res.status(404).type("text").send("Announcement not found.");
        }
        const pool = getPgPool();
        const item = await announcementsRepo.findAnnouncementByIdForBranch(
          pool,
          announcementId,
          req.churchContext.branch.id
        );
        if (!item) {
          return res.status(404).type("text").send("Announcement not found.");
        }
        if (item.status === "archived") {
          return res.redirect(303, `/branch/announcements/${announcementId}`);
        }
        return res.render(
          "church/branch-admin/announcement_form",
          renderFormLocals(req, {
            form: formFromAnnouncement(item),
            error: null,
            isEdit: true,
            announcementId: item.id,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/announcements/:announcementId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const announcementId = Number(req.params.announcementId);
        if (!Number.isFinite(announcementId) || announcementId <= 0) {
          return res.status(404).type("text").send("Announcement not found.");
        }
        const validation = validateAnnouncementBody(req.body || {});
        const intent = String(req.body._intent || "draft").trim();
        const publishNow = intent === "publish";
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;

        const existing = await announcementsRepo.findAnnouncementByIdForBranch(pool, announcementId, branch.id);
        if (!existing) {
          return res.status(404).type("text").send("Announcement not found.");
        }
        if (existing.status === "archived") {
          return res.redirect(303, `/branch/announcements/${announcementId}`);
        }

        if (!validation.ok) {
          return res.status(400).render(
            "church/branch-admin/announcement_form",
            renderFormLocals(req, {
              form: validation.form,
              error: validation.error,
              isEdit: true,
              announcementId,
            })
          );
        }

        const updated = await announcementsRepo.updateAnnouncementForBranch(pool, announcementId, branch.id, {
          ...validation.data,
          updated_by_admin_id: adminId,
        });

        await recordBranchAudit(pool, req, {
          action: "announcement_updated",
          entityType: "announcement",
          entityId: announcementId,
          metadata: { status: updated.status, title: updated.title },
        });

        if (publishNow) {
          const published = await announcementsRepo.publishAnnouncementForBranch(
            pool,
            announcementId,
            branch.id,
            {
              publish_at: validation.data.publish_at || new Date(),
              updated_by_admin_id: adminId,
            }
          );
          if (published) {
            await recordBranchAudit(pool, req, {
              action: "announcement_published",
              entityType: "announcement",
              entityId: announcementId,
              metadata: { status: "published", title: published.title },
            });
          }
          return res.redirect(303, `/branch/announcements/${announcementId}?notice=announcement_published`);
        }

        return res.redirect(303, `/branch/announcements/${announcementId}?notice=announcement_updated`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/announcements/:announcementId/publish",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const announcementId = Number(req.params.announcementId);
        if (!Number.isFinite(announcementId) || announcementId <= 0) {
          return res.status(404).type("text").send("Announcement not found.");
        }
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;
        const existing = await announcementsRepo.findAnnouncementByIdForBranch(pool, announcementId, branch.id);
        if (!existing) {
          return res.status(404).type("text").send("Announcement not found.");
        }
        if (existing.status === "archived") {
          return res.redirect(303, `/branch/announcements/${announcementId}`);
        }

        const published = await announcementsRepo.publishAnnouncementForBranch(pool, announcementId, branch.id, {
          publish_at: new Date(),
          updated_by_admin_id: adminId,
        });
        if (!published) {
          return res.status(400).render(
            "church/branch-admin/announcement_detail",
            renderFormLocals(req, {
              announcement: existing,
              error: "Announcement could not be published.",
              notice: null,
            })
          );
        }

        await recordBranchAudit(pool, req, {
          action: "announcement_published",
          entityType: "announcement",
          entityId: announcementId,
          metadata: { status: "published", title: published.title },
        });

        return res.redirect(303, `/branch/announcements/${announcementId}?notice=announcement_published`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/announcements/:announcementId/archive",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const announcementId = Number(req.params.announcementId);
        if (!Number.isFinite(announcementId) || announcementId <= 0) {
          return res.status(404).type("text").send("Announcement not found.");
        }
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;
        const existing = await announcementsRepo.findAnnouncementByIdForBranch(pool, announcementId, branch.id);
        if (!existing) {
          return res.status(404).type("text").send("Announcement not found.");
        }

        const archived = await announcementsRepo.archiveAnnouncementForBranch(
          pool,
          announcementId,
          branch.id,
          adminId
        );
        if (!archived) {
          return res.status(400).render(
            "church/branch-admin/announcement_detail",
            renderFormLocals(req, {
              announcement: existing,
              error: "Announcement could not be archived.",
              notice: null,
            })
          );
        }

        await recordBranchAudit(pool, req, {
          action: "announcement_archived",
          entityType: "announcement",
          entityId: announcementId,
          metadata: { status: "archived", title: archived.title },
        });

        return res.redirect(303, `/branch/announcements?notice=announcement_archived`);
      } catch (e) {
        return next(e);
      }
    }
  );
};
