"use strict";

const crypto = require("crypto");
const multer = require("multer");
const { getPgPool } = require("../../db/pg");
const hqBroadcastsRepo = require("../../db/pg/church/hqBroadcastsRepo");
const broadcastAttachmentsRepo = require("../../db/pg/church/broadcastAttachmentsRepo");
const branchesRepo = require("../../db/pg/church/branchesRepo");
const { requireChurchHqAdminSession } = require("../../church/hqAuth");
const { requireChurchBranchHost } = require("./auth");
const {
  BROADCAST_CATEGORIES,
  BROADCAST_AUDIENCES,
  BROADCAST_TARGET_SCOPES,
  BROADCAST_FILTERS,
  BROADCAST_PRIORITIES,
  broadcastStatusLabel,
  broadcastAudienceLabel,
  targetScopeLabel,
  priorityLabel,
  validateBroadcastBody,
  formatDateTimeLocal,
} = require("../../church/hqBroadcastValidation");
const {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_ITEM,
  saveBroadcastAttachments,
  absolutePathForStoredFilename,
  unlinkStoredFilename,
} = require("../../church/hqBroadcastUploads");
const { hqAdminLocals, flashFromQuery, BROADCAST_NOTICES, noticeMessage, recordHqAudit } = require("./hqAdminShared");
const churchPlanService = require("../../services/church/churchPlanService");
const { loadBroadcastDeliveryAnalytics } = require("../../church/broadcastDeliveryAnalytics");

const broadcastUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: MAX_ATTACHMENTS_PER_ITEM },
}).array("attachments", MAX_ATTACHMENTS_PER_ITEM);

function withBroadcastUpload(req, res, next) {
  broadcastUpload(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      req.broadcastUploadError =
        err.code === "LIMIT_FILE_SIZE"
          ? "Each attachment must be 5 MB or smaller."
          : "Too many or invalid attachment uploads.";
      return next();
    }
    return next(err);
  });
}

function formFromBroadcast(item, targets) {
  if (!item) {
    return {
      title: "",
      body: "",
      category: "General",
      audience: "members",
      target_scope: "all_branches",
      branch_ids: [],
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
    target_scope: item.target_scope || "all_branches",
    branch_ids: (targets || []).map((t) => t.branch_id),
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
  return hqAdminLocals(req, {
    categories: BROADCAST_CATEGORIES,
    audiences: BROADCAST_AUDIENCES,
    targetScopes: BROADCAST_TARGET_SCOPES,
    priorities: BROADCAST_PRIORITIES,
    maxAttachments: MAX_ATTACHMENTS_PER_ITEM,
    maxAttachmentMb: Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024)),
    broadcastAudienceLabel,
    targetScopeLabel,
    broadcastStatusLabel,
    priorityLabel,
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

function parseBroadcastListFilters(query) {
  const filter = String((query && query.status) || "all").trim();
  const status = BROADCAST_FILTERS.includes(filter) ? filter : "all";
  const q = String((query && query.q) || "").trim().slice(0, 200);
  const priorityRaw = String((query && query.priority) || "").trim().toLowerCase();
  const priority = BROADCAST_PRIORITIES.includes(priorityRaw) ? priorityRaw : "";
  const audienceRaw = String((query && query.audience) || "").trim().toLowerCase();
  const audience = BROADCAST_AUDIENCES.includes(audienceRaw) ? audienceRaw : "";
  const scopeRaw = String((query && query.target_scope) || "").trim().toLowerCase();
  const target_scope = BROADCAST_TARGET_SCOPES.includes(scopeRaw) ? scopeRaw : "";
  const date_from = /^\d{4}-\d{2}-\d{2}$/.test(String((query && query.date_from) || "").trim())
    ? String(query.date_from).trim()
    : "";
  const date_to = /^\d{4}-\d{2}-\d{2}$/.test(String((query && query.date_to) || "").trim())
    ? String(query.date_to).trim()
    : "";
  const page = Math.max(Number((query && query.page) || 1) || 1, 1);
  return { status, q, priority, audience, target_scope, date_from, date_to, page };
}

function buildListQuery(filters, page) {
  const f = filters || {};
  const pageNum = page != null ? Number(page) || 1 : Number(f.page) || 1;
  const params = new URLSearchParams();
  if (f.status && f.status !== "all") params.set("status", f.status);
  if (f.q) params.set("q", f.q);
  if (f.priority) params.set("priority", f.priority);
  if (f.audience) params.set("audience", f.audience);
  if (f.target_scope) params.set("target_scope", f.target_scope);
  if (f.date_from) params.set("date_from", f.date_from);
  if (f.date_to) params.set("date_to", f.date_to);
  if (pageNum > 1) params.set("page", String(pageNum));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function issuePublishToken(req, broadcastId) {
  const token = crypto.randomBytes(16).toString("hex");
  if (!req.session) return token;
  req.session.hqBroadcastPublishToken = {
    broadcastId: Number(broadcastId),
    token,
    issuedAt: Date.now(),
  };
  return token;
}

function consumePublishToken(req, broadcastId, submitted) {
  const expected = req.session && req.session.hqBroadcastPublishToken;
  if (req.session) req.session.hqBroadcastPublishToken = null;
  if (!expected || !submitted) return false;
  if (Number(expected.broadcastId) !== Number(broadcastId)) return false;
  if (String(expected.token) !== String(submitted)) return false;
  if (Date.now() - Number(expected.issuedAt || 0) > 60 * 60 * 1000) return false;
  return true;
}

function sortedIds(ids) {
  return [...new Set((ids || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))].sort(
    (a, b) => a - b
  );
}

function isAudienceExpansion(existing, data, existingTargetIds) {
  if (!existing || !data) return false;
  const audienceRank = {
    branch_admins: 1,
    leaders: 2,
    members: 3,
    all_logged_in: 4,
    public: 5,
  };
  const prevAudience = audienceRank[existing.audience] || 0;
  const nextAudience = audienceRank[data.audience] || 0;
  if (nextAudience > prevAudience) return true;
  if (existing.target_scope === "selected_branches" && data.target_scope === "all_branches") return true;
  if (data.target_scope === "selected_branches") {
    const prev = new Set(sortedIds(existingTargetIds));
    const next = sortedIds(data.branch_ids);
    return next.some((id) => !prev.has(id));
  }
  return false;
}

async function processAttachments(pool, orgId, broadcastId, adminId, files, uploadError) {
  if (uploadError) return { error: uploadError };
  if (!files || !files.length) return { error: null };
  return saveBroadcastAttachments(pool, {
    organizationId: orgId,
    broadcastId,
    adminId,
    files,
  });
}

module.exports = function registerHqAdminBroadcastsRoutes(router) {
  router.get("/hq/broadcasts", requireChurchBranchHost, requireChurchHqAdminSession, async (req, res, next) => {
    try {
      const org = req.churchContext.organization;
      const pool = getPgPool();
      const listFilters = parseBroadcastListFilters(req.query || {});
      const listed = await hqBroadcastsRepo.listBroadcastsForOrganization(pool, org.id, {
        status: listFilters.status,
        q: listFilters.q,
        priority: listFilters.priority,
        audience: listFilters.audience,
        target_scope: listFilters.target_scope,
        date_from: listFilters.date_from,
        date_to: listFilters.date_to,
        page: listFilters.page,
        limit: 20,
      });
      const planContext = await churchPlanService.loadPlanContextForOrganization(pool, org.id);
      return res.render(
        "church/hq/broadcasts",
        renderFormLocals(req, {
          broadcasts: listed.rows,
          listFilters: {
            ...listFilters,
            page: listed.page,
          },
          statusFilter: listFilters.status,
          searchQuery: listFilters.q,
          page: listed.page,
          totalPages: listed.totalPages,
          totalCount: listed.total,
          buildListQuery,
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
          attachments: [],
          error: null,
          isEdit: false,
          broadcastId: null,
          broadcastStatus: "draft",
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.post(
    "/hq/broadcasts",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    withBroadcastUpload,
    async (req, res, next) => {
      try {
        const validation = validateBroadcastBody(req.body || {});
        const intent = String(req.body._intent || "draft").trim();
        // Form never publishes immediately — publish goes through confirmation.
        const wantsPublishFlow = intent === "publish" || intent === "review";
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
              attachments: [],
              error: validation.error,
              isEdit: false,
              broadcastId: null,
              broadcastStatus: "draft",
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
              attachments: [],
              error: branchCheck.error,
              isEdit: false,
              broadcastId: null,
              broadcastStatus: "draft",
            })
          );
        }

        const created = await hqBroadcastsRepo.createBroadcastForOrganization(pool, org.id, {
          ...validation.data,
          status: "draft",
          publish_at: validation.data.publish_at,
          created_by_hq_admin_id: adminId,
        });

        await processAttachments(
          pool,
          org.id,
          created.id,
          adminId,
          req.files,
          req.broadcastUploadError
        );

        await recordHqAudit(pool, req, {
          action: "hq_broadcast_created",
          entityType: "hq_broadcast",
          entityId: created.id,
          metadata: {
            title: created.title,
            audience: created.audience,
            target_scope: created.target_scope,
            status: "draft",
            priority: created.priority,
          },
        });

        if (wantsPublishFlow) {
          return res.redirect(303, `/hq/broadcasts/${created.id}/confirm-publish`);
        }

        return res.redirect(303, `/hq/broadcasts/${created.id}?notice=broadcast_created`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/hq/broadcasts/:broadcastId/confirm-publish",
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
        const expandMode = String(req.query.mode || "").trim() === "expand";
        const pending =
          req.session &&
          req.session.hqBroadcastPendingExpansion &&
          Number(req.session.hqBroadcastPendingExpansion.broadcastId) === broadcastId
            ? req.session.hqBroadcastPendingExpansion
            : null;
        if (item.status === "published" && !(expandMode && pending)) {
          return res.redirect(303, `/hq/broadcasts/${broadcastId}`);
        }
        if (item.status === "published" && !pending) {
          return res.redirect(303, `/hq/broadcasts/${broadcastId}`);
        }

        let summary = item;
        let estimateOpts = {};
        let targets = await hqBroadcastsRepo.listBroadcastTargets(pool, broadcastId, org.id);
        if (pending && pending.data) {
          summary = {
            ...item,
            ...pending.data,
            publish_at: pending.data.publish_at ? new Date(pending.data.publish_at) : item.publish_at,
            expires_at: pending.data.expires_at ? new Date(pending.data.expires_at) : item.expires_at,
            featured_until: pending.data.featured_until
              ? new Date(pending.data.featured_until)
              : item.featured_until,
          };
          if (summary.target_scope === "selected_branches") {
            const branchIds = (pending.data.branch_ids || []).map(Number);
            estimateOpts = { branchIds };
            const allBranches = await loadOrgBranches(pool, org.id);
            targets = allBranches
              .filter((br) => branchIds.includes(Number(br.id)))
              .map((br) => ({ branch_id: br.id, branch_name: br.name }));
          } else {
            estimateOpts = {};
            targets = [];
          }
        }

        const attachments = await broadcastAttachmentsRepo.listAttachmentsForBroadcast(pool, broadcastId, org.id);
        const audienceEstimate = await hqBroadcastsRepo.estimateBroadcastAudience(
          pool,
          org.id,
          { ...summary, id: broadcastId },
          estimateOpts
        );
        const publishToken = issuePublishToken(req, broadcastId);
        return res.render(
          "church/hq/broadcast_confirm_publish",
          renderFormLocals(req, {
            broadcast: summary,
            targets,
            attachments,
            audienceEstimate,
            publishToken,
            expandMode: Boolean(pending),
            error: null,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

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
        const attachments = await broadcastAttachmentsRepo.listAttachmentsForBroadcast(pool, broadcastId, org.id);
        const accessibleBranches = await loadOrgBranches(pool, org.id);
        const analytics = await loadBroadcastDeliveryAnalytics(pool, org.id, item, {
          accessibleBranches,
        });
        return res.render(
          "church/hq/broadcast_detail",
          renderFormLocals(req, {
            broadcast: item,
            targets,
            attachments,
            analytics,
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
        const attachments = await broadcastAttachmentsRepo.listAttachmentsForBroadcast(pool, broadcastId, org.id);
        const branches = await loadOrgBranches(pool, org.id);
        return res.render(
          "church/hq/broadcast_form",
          renderFormLocals(req, {
            form: formFromBroadcast(item, targets),
            branches,
            attachments,
            error: null,
            isEdit: true,
            broadcastId: item.id,
            broadcastStatus: item.status,
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
    withBroadcastUpload,
    async (req, res, next) => {
      try {
        const broadcastId = Number(req.params.broadcastId);
        if (!Number.isFinite(broadcastId) || broadcastId <= 0) {
          return res.status(404).type("text").send("Broadcast not found.");
        }
        const validation = validateBroadcastBody(req.body || {});
        const intent = String(req.body._intent || "draft").trim();
        const wantsPublishFlow = intent === "publish" || intent === "review";
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

        const existingAttachments = await broadcastAttachmentsRepo.listAttachmentsForBroadcast(
          pool,
          broadcastId,
          org.id
        );

        if (!validation.ok) {
          return res.status(400).render(
            "church/hq/broadcast_form",
            renderFormLocals(req, {
              form: validation.form,
              branches,
              attachments: existingAttachments,
              error: validation.error,
              isEdit: true,
              broadcastId,
              broadcastStatus: existing.status,
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
              attachments: existingAttachments,
              error: branchCheck.error,
              isEdit: true,
              broadcastId,
              broadcastStatus: existing.status,
            })
          );
        }

        const existingTargets = await hqBroadcastsRepo.listBroadcastTargets(pool, broadcastId, org.id);
        const expanding =
          existing.status === "published" &&
          isAudienceExpansion(
            existing,
            validation.data,
            existingTargets.map((t) => t.branch_id)
          );

        if (expanding && !wantsPublishFlow) {
          // Save pending expansion only after explicit publish/review confirmation path.
          return res.status(400).render(
            "church/hq/broadcast_form",
            renderFormLocals(req, {
              form: validation.form,
              branches,
              attachments: existingAttachments,
              error:
                "This change expands the audience of a published broadcast. Click Publish to review the estimated audience before saving.",
              isEdit: true,
              broadcastId,
              broadcastStatus: existing.status,
            })
          );
        }

        if (expanding && wantsPublishFlow) {
          // Stash proposed update in session, then confirm before applying.
          req.session.hqBroadcastPendingExpansion = {
            broadcastId,
            data: {
              ...validation.data,
              publish_at: validation.data.publish_at ? validation.data.publish_at.toISOString() : null,
              expires_at: validation.data.expires_at ? validation.data.expires_at.toISOString() : null,
              featured_until: validation.data.featured_until
                ? validation.data.featured_until.toISOString()
                : null,
            },
            updated_by_hq_admin_id: adminId,
          };
          await processAttachments(pool, org.id, broadcastId, adminId, req.files, req.broadcastUploadError);
          return res.redirect(303, `/hq/broadcasts/${broadcastId}/confirm-publish?mode=expand`);
        }

        const updated = await hqBroadcastsRepo.updateBroadcastForOrganization(pool, broadcastId, org.id, {
          ...validation.data,
          updated_by_hq_admin_id: adminId,
        });

        await processAttachments(pool, org.id, broadcastId, adminId, req.files, req.broadcastUploadError);

        await recordHqAudit(pool, req, {
          action: "hq_broadcast_updated",
          entityType: "hq_broadcast",
          entityId: broadcastId,
          metadata: {
            title: updated.title,
            audience: updated.audience,
            target_scope: updated.target_scope,
            status: updated.status,
            priority: updated.priority,
          },
        });

        if (wantsPublishFlow && existing.status !== "published") {
          return res.redirect(303, `/hq/broadcasts/${broadcastId}/confirm-publish`);
        }

        return res.redirect(303, `/hq/broadcasts/${broadcastId}?notice=broadcast_updated`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/hq/broadcasts/:broadcastId/attachments/:attachmentId/download",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    async (req, res, next) => {
      try {
        const broadcastId = Number(req.params.broadcastId);
        const attachmentId = Number(req.params.attachmentId);
        if (!Number.isFinite(broadcastId) || !Number.isFinite(attachmentId)) {
          return res.status(404).type("text").send("Attachment not found.");
        }
        const org = req.churchContext.organization;
        const pool = getPgPool();
        const broadcast = await hqBroadcastsRepo.findBroadcastByIdForOrganization(pool, broadcastId, org.id);
        if (!broadcast) return res.status(404).type("text").send("Attachment not found.");
        const attachment = await broadcastAttachmentsRepo.findBroadcastAttachmentById(pool, attachmentId, org.id);
        if (!attachment || Number(attachment.broadcast_id) !== broadcastId) {
          return res.status(404).type("text").send("Attachment not found.");
        }
        const abs = absolutePathForStoredFilename(attachment.stored_filename);
        if (!abs) return res.status(404).type("text").send("Attachment not found.");
        return res.download(abs, attachment.original_filename);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/hq/broadcasts/:broadcastId/attachments/:attachmentId/delete",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    async (req, res, next) => {
      try {
        const broadcastId = Number(req.params.broadcastId);
        const attachmentId = Number(req.params.attachmentId);
        if (!Number.isFinite(broadcastId) || !Number.isFinite(attachmentId)) {
          return res.status(404).type("text").send("Attachment not found.");
        }
        const org = req.churchContext.organization;
        const pool = getPgPool();
        const broadcast = await hqBroadcastsRepo.findBroadcastByIdForOrganization(pool, broadcastId, org.id);
        if (!broadcast || broadcast.status === "archived") {
          return res.redirect(303, `/hq/broadcasts/${broadcastId}`);
        }
        const attachment = await broadcastAttachmentsRepo.findBroadcastAttachmentById(pool, attachmentId, org.id);
        if (!attachment || Number(attachment.broadcast_id) !== broadcastId) {
          return res.status(404).type("text").send("Attachment not found.");
        }
        const deleted = await broadcastAttachmentsRepo.deleteBroadcastAttachment(pool, attachmentId, org.id);
        if (deleted) unlinkStoredFilename(deleted.stored_filename);
        return res.redirect(303, `/hq/broadcasts/${broadcastId}/edit`);
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
        if (existing.status === "published" && !(req.session && req.session.hqBroadcastPendingExpansion)) {
          return res.redirect(303, `/hq/broadcasts/${broadcastId}`);
        }

        const tokenOk = consumePublishToken(req, broadcastId, req.body && req.body._publish_token);
        if (!tokenOk) {
          const targets = await hqBroadcastsRepo.listBroadcastTargets(pool, broadcastId, org.id);
          const attachments = await broadcastAttachmentsRepo.listAttachmentsForBroadcast(pool, broadcastId, org.id);
          const audienceEstimate = await hqBroadcastsRepo.estimateBroadcastAudience(pool, org.id, existing);
          const publishToken = issuePublishToken(req, broadcastId);
          return res.status(400).render(
            "church/hq/broadcast_confirm_publish",
            renderFormLocals(req, {
              broadcast: existing,
              targets,
              attachments,
              audienceEstimate,
              publishToken,
              error: "Confirmation expired or already used. Review again, then confirm publish.",
            })
          );
        }

        const pending = req.session && req.session.hqBroadcastPendingExpansion;
        if (pending && Number(pending.broadcastId) === broadcastId) {
          const data = { ...pending.data };
          if (data.publish_at) data.publish_at = new Date(data.publish_at);
          if (data.expires_at) data.expires_at = new Date(data.expires_at);
          if (data.featured_until) data.featured_until = new Date(data.featured_until);
          await hqBroadcastsRepo.updateBroadcastForOrganization(pool, broadcastId, org.id, {
            ...data,
            updated_by_hq_admin_id: pending.updated_by_hq_admin_id || adminId,
          });
          req.session.hqBroadcastPendingExpansion = null;
          await recordHqAudit(pool, req, {
            action: "hq_broadcast_updated",
            entityType: "hq_broadcast",
            entityId: broadcastId,
            metadata: {
              title: data.title,
              audience: data.audience,
              target_scope: data.target_scope,
              status: "published",
              audience_expanded: true,
            },
          });
          return res.redirect(303, `/hq/broadcasts/${broadcastId}?notice=broadcast_updated`);
        }

        const published = await hqBroadcastsRepo.publishBroadcastForOrganization(pool, broadcastId, org.id, {
          publish_at: existing.publish_at || new Date(),
          updated_by_hq_admin_id: adminId,
        });
        if (!published) {
          const targets = await hqBroadcastsRepo.listBroadcastTargets(pool, broadcastId, org.id);
          const attachments = await broadcastAttachmentsRepo.listAttachmentsForBroadcast(pool, broadcastId, org.id);
          const audienceEstimate = await hqBroadcastsRepo.estimateBroadcastAudience(pool, org.id, existing);
          const publishToken = issuePublishToken(req, broadcastId);
          return res.status(400).render(
            "church/hq/broadcast_confirm_publish",
            renderFormLocals(req, {
              broadcast: existing,
              targets,
              attachments,
              audienceEstimate,
              publishToken,
              error: "Broadcast could not be published.",
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
              attachments: [],
              analytics: null,
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
