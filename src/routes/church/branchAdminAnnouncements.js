"use strict";

const { getPgPool } = require("../../db/pg");
const announcementsRepo = require("../../db/pg/church/announcementsRepo");
const feedItemReadsRepo = require("../../db/pg/church/feedItemReadsRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const {
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_PRIORITIES,
  announcementStatusLabel,
  audienceLabel,
  priorityLabel,
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
      priority: "normal",
      is_pinned: false,
      is_featured: false,
      featured_until: "",
      action_url: "",
      action_label: "",
      publish_at: "",
      expires_at: "",
    };
  }
  return {
    title: item.title,
    body: item.body,
    category: item.category || "General",
    audience: item.audience || "members",
    priority: item.priority || "normal",
    is_pinned: Boolean(item.is_pinned),
    is_featured: Boolean(item.is_featured),
    featured_until: formatDateTimeLocal(item.featured_until),
    action_url: item.action_url || "",
    action_label: item.action_label || "",
    publish_at: formatDateTimeLocal(item.publish_at),
    expires_at: formatDateTimeLocal(item.expires_at),
  };
}

function renderFormLocals(req, extra) {
  return branchAdminLocals(req, {
    categories: ANNOUNCEMENT_CATEGORIES,
    audiences: ANNOUNCEMENT_AUDIENCES,
    priorities: ANNOUNCEMENT_PRIORITIES,
    audienceLabel,
    announcementStatusLabel,
    priorityLabel,
    formatDateTimeLocal,
    ...(extra || {}),
  });
}

function buildListQuery(statusFilter, q, page) {
  const params = new URLSearchParams();
  if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
  if (q) params.set("q", q);
  if (page && page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
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
        const q = String(req.query.q || "").trim().slice(0, 200);
        const page = Math.max(Number(req.query.page) || 1, 1);
        const listed = await announcementsRepo.listAnnouncementsForBranch(pool, branch.id, {
          status: statusFilter,
          q,
          page,
          limit: 20,
        });
        return res.render(
          "church/branch-admin/announcements_management",
          renderFormLocals(req, {
            announcements: listed.rows,
            statusFilter,
            searchQuery: q,
            page: listed.page,
            totalPages: listed.totalPages,
            totalCount: listed.total,
            buildListQuery,
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
        const reviewPublish = intent === "review";
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
          metadata: { status: created.status, title: created.title, priority: created.priority },
        });

        if (publishNow && created.status === "published") {
          await recordBranchAudit(pool, req, {
            action: "announcement_published",
            entityType: "announcement",
            entityId: created.id,
            metadata: { status: "published", title: created.title },
          });
        }

        if (reviewPublish) {
          return res.redirect(303, `/branch/announcements/${created.id}/confirm-publish`);
        }

        const notice = publishNow ? "announcement_published" : "announcement_created";
        return res.redirect(303, `/branch/announcements/${created.id}?notice=${notice}`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/announcements/:announcementId/confirm-publish",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const announcementId = Number(req.params.announcementId);
        if (!Number.isFinite(announcementId) || announcementId <= 0) {
          return res.status(404).type("text").send("Announcement not found.");
        }
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const item = await announcementsRepo.findAnnouncementByIdForBranch(pool, announcementId, branch.id);
        if (!item) {
          return res.status(404).type("text").send("Announcement not found.");
        }
        if (item.status === "archived" || item.status === "published") {
          return res.redirect(303, `/branch/announcements/${announcementId}`);
        }
        const audienceEstimate = await announcementsRepo.estimateAnnouncementAudience(
          pool,
          org.id,
          branch.id,
          item
        );
        return res.render(
          "church/branch-admin/announcement_confirm_publish",
          renderFormLocals(req, {
            announcement: item,
            audienceEstimate,
            error: null,
          })
        );
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
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const item = await announcementsRepo.findAnnouncementByIdForBranch(pool, announcementId, branch.id);
        if (!item) {
          return res.status(404).type("text").send("Announcement not found.");
        }
        const audienceEstimate = await announcementsRepo.estimateAnnouncementAudience(
          pool,
          org.id,
          branch.id,
          item
        );
        const readCount =
          item.status === "published"
            ? await feedItemReadsRepo.countReadsForSource(pool, org.id, "announcement", announcementId)
            : 0;
        const analytics = {
          ...audienceEstimate,
          read_count: readCount,
          read_rate:
            audienceEstimate.estimated_recipients > 0
              ? Math.min(100, Math.round((readCount / audienceEstimate.estimated_recipients) * 100))
              : null,
        };
        return res.render(
          "church/branch-admin/announcement_detail",
          renderFormLocals(req, {
            announcement: item,
            analytics,
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
        const reviewPublish = intent === "review";
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
          metadata: { status: updated.status, title: updated.title, priority: updated.priority },
        });

        if (reviewPublish) {
          return res.redirect(303, `/branch/announcements/${announcementId}/confirm-publish`);
        }

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
        const org = req.churchContext.organization;
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
          const audienceEstimate = await announcementsRepo.estimateAnnouncementAudience(
            pool,
            org.id,
            branch.id,
            existing
          );
          return res.status(400).render(
            "church/branch-admin/announcement_confirm_publish",
            renderFormLocals(req, {
              announcement: existing,
              audienceEstimate,
              error: "Announcement could not be published.",
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
              analytics: null,
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
