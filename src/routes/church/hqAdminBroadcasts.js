"use strict";

const { getPgPool } = require("../../db/pg");
const hqBroadcastsRepo = require("../../db/pg/church/hqBroadcastsRepo");
const branchesRepo = require("../../db/pg/church/branchesRepo");
const { requireChurchHqAdminSession } = require("../../church/hqAuth");
const { requireChurchBranchHost } = require("./auth");
const {
  BROADCAST_CATEGORIES,
  BROADCAST_AUDIENCES,
  BROADCAST_TARGET_SCOPES,
  BROADCAST_FILTERS,
  broadcastStatusLabel,
  broadcastAudienceLabel,
  targetScopeLabel,
  validateBroadcastBody,
  formatDateTimeLocal,
} = require("../../church/hqBroadcastValidation");
const { hqAdminLocals, flashFromQuery, BROADCAST_NOTICES, noticeMessage, recordHqAudit } = require("./hqAdminShared");
const churchPlanService = require("../../services/church/churchPlanService");

function formFromBroadcast(item, targets) {
  if (!item) {
    return {
      title: "",
      body: "",
      category: "General",
      audience: "members",
      target_scope: "all_branches",
      branch_ids: [],
      publish_at: "",
      expires_at: "",
    };
  }
  return {
    title: item.title,
    body: item.body,
    category: item.category || "General",
    audience: item.audience || "members",
    target_scope: item.target_scope || "all_branches",
    branch_ids: (targets || []).map((t) => t.branch_id),
    publish_at: formatDateTimeLocal(item.publish_at),
    expires_at: formatDateTimeLocal(item.expires_at),
  };
}

function renderFormLocals(req, extra) {
  return hqAdminLocals(req, {
    categories: BROADCAST_CATEGORIES,
    audiences: BROADCAST_AUDIENCES,
    targetScopes: BROADCAST_TARGET_SCOPES,
    broadcastAudienceLabel,
    targetScopeLabel,
    broadcastStatusLabel,
    formatDateTimeLocal,
    ...(extra || {}),
  });
}

async function validateBranchSelection(pool, orgId, data) {
  if (data.target_scope !== "selected_branches") return { ok: true };
  const valid = await hqBroadcastsRepo.validateBranchIdsForOrganization(pool, orgId, data.branch_ids);
  if (valid.length !== data.branch_ids.length) {
    return { ok: false, error: "One or more selected branches are invalid for this organization." };
  }
  return { ok: true };
}

async function loadOrgBranches(pool, orgId) {
  return branchesRepo.listBranchesForOrganization(pool, orgId);
}

module.exports = function registerHqAdminBroadcastsRoutes(router) {
  router.get("/hq/broadcasts", requireChurchBranchHost, requireChurchHqAdminSession, async (req, res, next) => {
    try {
      const org = req.churchContext.organization;
      const pool = getPgPool();
      const filter = String(req.query.status || "all").trim();
      const statusFilter = BROADCAST_FILTERS.includes(filter) ? filter : "all";
      const broadcasts = await hqBroadcastsRepo.listBroadcastsForOrganization(pool, org.id, {
        status: statusFilter,
      });
      const planContext = await churchPlanService.loadPlanContextForOrganization(pool, org.id);
      return res.render(
        "church/hq/broadcasts",
        renderFormLocals(req, {
          broadcasts,
          statusFilter,
          broadcastFilters: BROADCAST_FILTERS,
          planContext,
          premiumNotice: planContext ? planContext.premiumBroadcastNotice : null,
          notice: noticeMessage(flashFromQuery(req, BROADCAST_NOTICES)),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/hq/broadcasts/new", requireChurchBranchHost, requireChurchHqAdminSession, async (req, res, next) => {
    try {
      const org = req.churchContext.organization;
      const pool = getPgPool();
      const branches = await loadOrgBranches(pool, org.id);
      return res.render(
        "church/hq/broadcast_form",
        renderFormLocals(req, {
          form: formFromBroadcast(null),
          branches,
          error: null,
          isEdit: false,
          broadcastId: null,
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.post("/hq/broadcasts", requireChurchBranchHost, requireChurchHqAdminSession, async (req, res, next) => {
    try {
      const validation = validateBroadcastBody(req.body || {});
      const intent = String(req.body._intent || "draft").trim();
      const publishNow = intent === "publish";
      const org = req.churchContext.organization;
      const pool = getPgPool();
      const adminId = req.churchHqAdmin.hq_admin_id;
      const branches = await loadOrgBranches(pool, org.id);

      if (!validation.ok) {
        return res.status(400).render(
          "church/hq/broadcast_form",
          renderFormLocals(req, {
            form: validation.form,
            branches,
            error: validation.error,
            isEdit: false,
            broadcastId: null,
          })
        );
      }

      const branchCheck = await validateBranchSelection(pool, org.id, validation.data);
      if (!branchCheck.ok) {
        return res.status(400).render(
          "church/hq/broadcast_form",
          renderFormLocals(req, {
            form: validation.form,
            branches,
            error: branchCheck.error,
            isEdit: false,
            broadcastId: null,
          })
        );
      }

      const created = await hqBroadcastsRepo.createBroadcastForOrganization(pool, org.id, {
        ...validation.data,
        status: publishNow ? "published" : "draft",
        publish_at: publishNow ? validation.data.publish_at || new Date() : validation.data.publish_at,
        created_by_hq_admin_id: adminId,
      });

      await recordHqAudit(pool, req, {
        action: "hq_broadcast_created",
        entityType: "hq_broadcast",
        entityId: created.id,
        metadata: {
          title: created.title,
          audience: created.audience,
          target_scope: created.target_scope,
          status: created.status,
        },
      });

      if (publishNow && created.status === "published") {
        await recordHqAudit(pool, req, {
          action: "hq_broadcast_published",
          entityType: "hq_broadcast",
          entityId: created.id,
          metadata: {
            title: created.title,
            audience: created.audience,
            target_scope: created.target_scope,
            status: "published",
          },
        });
      }

      const notice = publishNow ? "broadcast_published" : "broadcast_created";
      return res.redirect(303, `/hq/broadcasts/${created.id}?notice=${notice}`);
    } catch (e) {
      return next(e);
    }
  });

  router.get(
    "/hq/broadcasts/:broadcastId",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    async (req, res, next) => {
      try {
        const broadcastId = Number(req.params.broadcastId);
        if (!Number.isFinite(broadcastId) || broadcastId <= 0) {
          return res.status(404).type("text").send("Broadcast not found.");
        }
        const org = req.churchContext.organization;
        const pool = getPgPool();
        const item = await hqBroadcastsRepo.findBroadcastByIdForOrganization(pool, broadcastId, org.id);
        if (!item) {
          return res.status(404).type("text").send("Broadcast not found.");
        }
        const targets = await hqBroadcastsRepo.listBroadcastTargets(pool, broadcastId, org.id);
        return res.render(
          "church/hq/broadcast_detail",
          renderFormLocals(req, {
            broadcast: item,
            targets,
            notice: noticeMessage(flashFromQuery(req, BROADCAST_NOTICES)),
            error: null,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/hq/broadcasts/:broadcastId/edit",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    async (req, res, next) => {
      try {
        const broadcastId = Number(req.params.broadcastId);
        if (!Number.isFinite(broadcastId) || broadcastId <= 0) {
          return res.status(404).type("text").send("Broadcast not found.");
        }
        const org = req.churchContext.organization;
        const pool = getPgPool();
        const item = await hqBroadcastsRepo.findBroadcastByIdForOrganization(pool, broadcastId, org.id);
        if (!item) {
          return res.status(404).type("text").send("Broadcast not found.");
        }
        if (item.status === "archived") {
          return res.redirect(303, `/hq/broadcasts/${broadcastId}`);
        }
        const targets = await hqBroadcastsRepo.listBroadcastTargets(pool, broadcastId, org.id);
        const branches = await loadOrgBranches(pool, org.id);
        return res.render(
          "church/hq/broadcast_form",
          renderFormLocals(req, {
            form: formFromBroadcast(item, targets),
            branches,
            error: null,
            isEdit: true,
            broadcastId: item.id,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/hq/broadcasts/:broadcastId",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    async (req, res, next) => {
      try {
        const broadcastId = Number(req.params.broadcastId);
        if (!Number.isFinite(broadcastId) || broadcastId <= 0) {
          return res.status(404).type("text").send("Broadcast not found.");
        }
        const validation = validateBroadcastBody(req.body || {});
        const intent = String(req.body._intent || "draft").trim();
        const publishNow = intent === "publish";
        const org = req.churchContext.organization;
        const pool = getPgPool();
        const adminId = req.churchHqAdmin.hq_admin_id;
        const branches = await loadOrgBranches(pool, org.id);

        const existing = await hqBroadcastsRepo.findBroadcastByIdForOrganization(pool, broadcastId, org.id);
        if (!existing) {
          return res.status(404).type("text").send("Broadcast not found.");
        }
        if (existing.status === "archived") {
          return res.redirect(303, `/hq/broadcasts/${broadcastId}`);
        }

        if (!validation.ok) {
          return res.status(400).render(
            "church/hq/broadcast_form",
            renderFormLocals(req, {
              form: validation.form,
              branches,
              error: validation.error,
              isEdit: true,
              broadcastId,
            })
          );
        }

        const branchCheck = await validateBranchSelection(pool, org.id, validation.data);
        if (!branchCheck.ok) {
          return res.status(400).render(
            "church/hq/broadcast_form",
            renderFormLocals(req, {
              form: validation.form,
              branches,
              error: branchCheck.error,
              isEdit: true,
              broadcastId,
            })
          );
        }

        const updated = await hqBroadcastsRepo.updateBroadcastForOrganization(pool, broadcastId, org.id, {
          ...validation.data,
          updated_by_hq_admin_id: adminId,
        });

        await recordHqAudit(pool, req, {
          action: "hq_broadcast_updated",
          entityType: "hq_broadcast",
          entityId: broadcastId,
          metadata: {
            title: updated.title,
            audience: updated.audience,
            target_scope: updated.target_scope,
            status: updated.status,
          },
        });

        if (publishNow) {
          const published = await hqBroadcastsRepo.publishBroadcastForOrganization(
            pool,
            broadcastId,
            org.id,
            {
              publish_at: validation.data.publish_at || new Date(),
              updated_by_hq_admin_id: adminId,
            }
          );
          if (published) {
            await recordHqAudit(pool, req, {
              action: "hq_broadcast_published",
              entityType: "hq_broadcast",
              entityId: broadcastId,
              metadata: {
                title: published.title,
                audience: published.audience,
                target_scope: published.target_scope,
                status: "published",
              },
            });
          }
          return res.redirect(303, `/hq/broadcasts/${broadcastId}?notice=broadcast_published`);
        }

        return res.redirect(303, `/hq/broadcasts/${broadcastId}?notice=broadcast_updated`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/hq/broadcasts/:broadcastId/publish",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    async (req, res, next) => {
      try {
        const broadcastId = Number(req.params.broadcastId);
        if (!Number.isFinite(broadcastId) || broadcastId <= 0) {
          return res.status(404).type("text").send("Broadcast not found.");
        }
        const org = req.churchContext.organization;
        const pool = getPgPool();
        const adminId = req.churchHqAdmin.hq_admin_id;
        const existing = await hqBroadcastsRepo.findBroadcastByIdForOrganization(pool, broadcastId, org.id);
        if (!existing) {
          return res.status(404).type("text").send("Broadcast not found.");
        }
        if (existing.status === "archived") {
          return res.redirect(303, `/hq/broadcasts/${broadcastId}`);
        }

        const published = await hqBroadcastsRepo.publishBroadcastForOrganization(pool, broadcastId, org.id, {
          publish_at: new Date(),
          updated_by_hq_admin_id: adminId,
        });
        if (!published) {
          const targets = await hqBroadcastsRepo.listBroadcastTargets(pool, broadcastId, org.id);
          return res.status(400).render(
            "church/hq/broadcast_detail",
            renderFormLocals(req, {
              broadcast: existing,
              targets,
              error: "Broadcast could not be published.",
              notice: null,
            })
          );
        }

        await recordHqAudit(pool, req, {
          action: "hq_broadcast_published",
          entityType: "hq_broadcast",
          entityId: broadcastId,
          metadata: {
            title: published.title,
            audience: published.audience,
            target_scope: published.target_scope,
            status: "published",
          },
        });

        return res.redirect(303, `/hq/broadcasts/${broadcastId}?notice=broadcast_published`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/hq/broadcasts/:broadcastId/archive",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    async (req, res, next) => {
      try {
        const broadcastId = Number(req.params.broadcastId);
        if (!Number.isFinite(broadcastId) || broadcastId <= 0) {
          return res.status(404).type("text").send("Broadcast not found.");
        }
        const org = req.churchContext.organization;
        const pool = getPgPool();
        const adminId = req.churchHqAdmin.hq_admin_id;
        const existing = await hqBroadcastsRepo.findBroadcastByIdForOrganization(pool, broadcastId, org.id);
        if (!existing) {
          return res.status(404).type("text").send("Broadcast not found.");
        }

        const archived = await hqBroadcastsRepo.archiveBroadcastForOrganization(
          pool,
          broadcastId,
          org.id,
          adminId
        );
        if (!archived) {
          const targets = await hqBroadcastsRepo.listBroadcastTargets(pool, broadcastId, org.id);
          return res.status(400).render(
            "church/hq/broadcast_detail",
            renderFormLocals(req, {
              broadcast: existing,
              targets,
              error: "Broadcast could not be archived.",
              notice: null,
            })
          );
        }

        await recordHqAudit(pool, req, {
          action: "hq_broadcast_archived",
          entityType: "hq_broadcast",
          entityId: broadcastId,
          metadata: {
            title: archived.title,
            audience: archived.audience,
            target_scope: archived.target_scope,
            status: "archived",
          },
        });

        return res.redirect(303, `/hq/broadcasts?notice=broadcast_archived`);
      } catch (e) {
        return next(e);
      }
    }
  );
};
