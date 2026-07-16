"use strict";

const fs = require("fs");
const multer = require("multer");
const { getPgPool } = require("../../db/pg");
const prayerRequestsRepo = require("../../db/pg/church/prayerRequestsRepo");
const pastoralCareRepo = require("../../db/pg/church/pastoralCareRepo");
const branchAdminsRepo = require("../../db/pg/church/branchAdminsRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const {
  requirePastoralAccess,
  canDownloadPastoralAttachment,
  hasPastoralAccess,
} = require("../../church/foundationPastoralAccess");
const {
  canTransitionPrayer,
  prayerRequestStatusLabel,
  privacyLevelLabel,
  showPrayerMemberIdentity,
  showPrayerDetails,
} = require("../../church/requestProcessingValidation");
const {
  validateAssignPrayerBody,
  validatePrayerFollowUpBody,
  validatePrayerCloseBody,
} = require("../../church/pastoralCareValidation");
const foundationPastoralCareService = require("../../services/church/foundationPastoralCareService");
const {
  ensureUploadRoot,
  storedFilenameForUpload,
  absolutePathForStoredFilename,
  safeOriginalName,
} = require("../../church/pastoralAttachmentUploads");
const {
  branchAdminLocals,
  flashFromQuery,
  PRAYER_ADMIN_NOTICES,
  noticeMessage,
  recordBranchAudit,
} = require("./branchAdminShared");

ensureUploadRoot();
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureUploadRoot();
      cb(null, require("../../church/pastoralAttachmentUploads").UPLOAD_ROOT);
    },
    filename: (_req, file, cb) => cb(null, storedFilenameForUpload(file.originalname)),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function adminOpts(req) {
  return { admin: req.churchBranchAdmin };
}

async function loadPastoralAdmins(pool, branchId) {
  const r = await pool.query(
    `SELECT id, full_name
     FROM public.church_branch_admins
     WHERE branch_id = $1 AND status = 'active' AND can_access_pastoral = true
     ORDER BY full_name ASC`,
    [branchId]
  );
  return r.rows;
}

async function loadPrayerDetail(pool, req, prayerRequestId, error) {
  const branch = req.churchContext.branch;
  const item = await prayerRequestsRepo.findPrayerRequestByIdForBranch(
    pool,
    prayerRequestId,
    branch.id,
    adminOpts(req)
  );
  if (!item) return { notFound: true };
  const attachments = await pastoralCareRepo.listAttachmentsForEntity(
    pool,
    "prayer_request",
    prayerRequestId,
    branch.id
  );
  const pastoralAdmins = await loadPastoralAdmins(pool, branch.id);
  return {
    prayerItem: item,
    attachments,
    pastoralAdmins,
    prayerStatusLabel: prayerRequestStatusLabel,
    privacyLevelLabel,
    showMemberIdentity: showPrayerMemberIdentity(item, req.churchBranchAdmin),
    showDetails: showPrayerDetails(item, req.churchBranchAdmin),
    error,
    notice: noticeMessage(flashFromQuery(req, PRAYER_ADMIN_NOTICES)),
  };
}

module.exports = function registerBranchAdminPrayerRequestsRoutes(router) {
  router.get(
    "/branch/prayer-requests",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requirePastoralAccess,
    async (req, res, next) => {
      try {
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const requests = await prayerRequestsRepo.listPrayerRequestsForBranch(pool, branch.id, adminOpts(req));
        return res.render(
          "church/branch-admin/prayer_requests_queue",
          branchAdminLocals(req, {
            requests,
            prayerStatusLabel: prayerRequestStatusLabel,
            privacyLevelLabel,
            notice: noticeMessage(flashFromQuery(req, PRAYER_ADMIN_NOTICES)),
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/prayer-requests/:prayerRequestId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requirePastoralAccess,
    async (req, res, next) => {
      try {
        const prayerRequestId = Number(req.params.prayerRequestId);
        if (!Number.isFinite(prayerRequestId) || prayerRequestId <= 0) {
          return res.status(404).type("text").send("Prayer request not found.");
        }
        const pool = getPgPool();
        const locals = await loadPrayerDetail(pool, req, prayerRequestId, null);
        if (locals.notFound) {
          return res.status(404).type("text").send("Prayer request not found.");
        }
        return res.render("church/branch-admin/prayer_request_detail", branchAdminLocals(req, locals));
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/prayer-requests/:prayerRequestId/acknowledge",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requirePastoralAccess,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const prayerRequestId = Number(req.params.prayerRequestId);
        const pool = getPgPool();
        const result = await foundationPastoralCareService.acknowledgePrayerRequest(
          pool,
          foundationPastoralCareService.trustedCtx(req),
          prayerRequestId
        );
        await recordBranchAudit(pool, req, {
          action: "prayer_request_acknowledged",
          entityType: "prayer_request",
          entityId: prayerRequestId,
          metadata: { notification_subject: result.notificationSubject },
        });
        return res.redirect(303, `/branch/prayer-requests/${prayerRequestId}?notice=prayer_acknowledged`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/prayer-requests/:prayerRequestId/assign",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requirePastoralAccess,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const prayerRequestId = Number(req.params.prayerRequestId);
        const validation = validateAssignPrayerBody(req.body || {});
        if (!validation.ok) {
          const pool = getPgPool();
          return res.status(400).render(
            "church/branch-admin/prayer_request_detail",
            branchAdminLocals(req, {
              ...(await loadPrayerDetail(pool, req, prayerRequestId, validation.error)),
            })
          );
        }
        const pool = getPgPool();
        const result = await foundationPastoralCareService.assignPrayerRequest(
          pool,
          foundationPastoralCareService.trustedCtx(req),
          prayerRequestId,
          validation.data.assigned_admin_id
        );
        await recordBranchAudit(pool, req, {
          action: "prayer_request_assigned",
          entityType: "prayer_request",
          entityId: prayerRequestId,
          metadata: {
            assigned_admin_id: validation.data.assigned_admin_id,
            notification_subject: result.notificationSubject,
          },
        });
        return res.redirect(303, `/branch/prayer-requests/${prayerRequestId}?notice=prayer_assigned`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/prayer-requests/:prayerRequestId/follow-up",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requirePastoralAccess,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const prayerRequestId = Number(req.params.prayerRequestId);
        const validation = validatePrayerFollowUpBody(req.body || {});
        if (!validation.ok) {
          const pool = getPgPool();
          return res.status(400).render(
            "church/branch-admin/prayer_request_detail",
            branchAdminLocals(req, {
              ...(await loadPrayerDetail(pool, req, prayerRequestId, validation.error)),
            })
          );
        }
        const pool = getPgPool();
        const result = await foundationPastoralCareService.recordPrayerFollowUp(
          pool,
          foundationPastoralCareService.trustedCtx(req),
          prayerRequestId,
          validation.data
        );
        await recordBranchAudit(pool, req, {
          action: "prayer_request_follow_up",
          entityType: "prayer_request",
          entityId: prayerRequestId,
          metadata: { notification_subject: result.notificationSubject },
        });
        return res.redirect(303, `/branch/prayer-requests/${prayerRequestId}?notice=prayer_follow_up`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/prayer-requests/:prayerRequestId/mark-reviewed",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requirePastoralAccess,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const prayerRequestId = Number(req.params.prayerRequestId);
        const pool = getPgPool();
        const existing = await prayerRequestsRepo.findPrayerRequestByIdForBranch(
          pool,
          prayerRequestId,
          req.churchContext.branch.id,
          adminOpts(req)
        );
        if (!existing) return res.status(404).type("text").send("Prayer request not found.");
        if (!canTransitionPrayer(existing.status, "reviewed")) {
          return res.status(400).render(
            "church/branch-admin/prayer_request_detail",
            branchAdminLocals(req, {
              ...(await loadPrayerDetail(pool, req, prayerRequestId, "Invalid status transition.")),
            })
          );
        }
        const comment = String((req.body && req.body.admin_comment) || "").trim().slice(0, 2000);
        await prayerRequestsRepo.updatePrayerRequestForBranch(pool, prayerRequestId, req.churchContext.branch.id, {
          status: "reviewed",
          from_status: existing.status,
          admin_comment: comment || existing.admin_comment || "",
          reviewed_by_admin_id: req.churchBranchAdmin.admin_id,
          set_reviewed_at: true,
        });
        await recordBranchAudit(pool, req, {
          action: "prayer_request_reviewed",
          entityType: "prayer_request",
          entityId: prayerRequestId,
          metadata: { previous_status: existing.status },
        });
        return res.redirect(303, `/branch/prayer-requests/${prayerRequestId}?notice=prayer_reviewed`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/prayer-requests/:prayerRequestId/close",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requirePastoralAccess,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const prayerRequestId = Number(req.params.prayerRequestId);
        const validation = validatePrayerCloseBody(req.body || {});
        if (!validation.ok) {
          const pool = getPgPool();
          return res.status(400).render(
            "church/branch-admin/prayer_request_detail",
            branchAdminLocals(req, {
              ...(await loadPrayerDetail(pool, req, prayerRequestId, validation.error)),
            })
          );
        }
        const pool = getPgPool();
        const result = await foundationPastoralCareService.closePrayerRequest(
          pool,
          foundationPastoralCareService.trustedCtx(req),
          prayerRequestId,
          validation.data
        );
        await recordBranchAudit(pool, req, {
          action: "prayer_request_closed",
          entityType: "prayer_request",
          entityId: prayerRequestId,
          metadata: { notification_subject: result.notificationSubject },
        });
        return res.redirect(303, `/branch/prayer-requests/${prayerRequestId}?notice=prayer_closed`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/prayer-requests/:prayerRequestId/attachments",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requirePastoralAccess,
    requireChurchSessionCsrf,
    upload.single("attachment"),
    async (req, res, next) => {
      try {
        const prayerRequestId = Number(req.params.prayerRequestId);
        const pool = getPgPool();
        const branch = req.churchContext.branch;
        const existing = await prayerRequestsRepo.findPrayerRequestByIdForBranch(
          pool,
          prayerRequestId,
          branch.id,
          adminOpts(req)
        );
        if (!existing) return res.status(404).type("text").send("Prayer request not found.");
        if (!req.file) {
          return res.redirect(303, `/branch/prayer-requests/${prayerRequestId}?error=${encodeURIComponent("Please choose a file.")}`);
        }
        await pastoralCareRepo.createAttachment(pool, {
          organization_id: branch.organization_id || req.churchContext.organization.id,
          branch_id: branch.id,
          entity_type: "prayer_request",
          entity_id: prayerRequestId,
          stored_filename: req.file.filename,
          original_filename: safeOriginalName(req.file.originalname),
          mime_type: req.file.mimetype,
          visibility: "pastoral_only",
          uploaded_by_admin_id: req.churchBranchAdmin.admin_id,
        });
        await recordBranchAudit(pool, req, {
          action: "pastoral_attachment_uploaded",
          entityType: "prayer_request",
          entityId: prayerRequestId,
          metadata: { filename: safeOriginalName(req.file.originalname) },
        });
        return res.redirect(303, `/branch/prayer-requests/${prayerRequestId}?notice=attachment_uploaded`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/prayer-requests/:prayerRequestId/attachments/:attachmentId/download",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        if (!hasPastoralAccess(req.churchBranchAdmin)) {
          return res.status(403).type("text").send("Pastoral access required.");
        }
        const prayerRequestId = Number(req.params.prayerRequestId);
        const attachmentId = Number(req.params.attachmentId);
        const pool = getPgPool();
        const branch = req.churchContext.branch;
        const attachment = await pastoralCareRepo.findAttachmentByIdForBranch(pool, attachmentId, branch.id);
        if (
          !attachment ||
          attachment.entity_type !== "prayer_request" ||
          Number(attachment.entity_id) !== prayerRequestId
        ) {
          return res.status(404).type("text").send("Attachment not found.");
        }
        if (!canDownloadPastoralAttachment(req.churchBranchAdmin, attachment)) {
          return res.status(403).type("text").send("Not authorised to download this attachment.");
        }
        const abs = absolutePathForStoredFilename(attachment.stored_filename);
        if (!abs || !fs.existsSync(abs)) {
          return res.status(404).type("text").send("Attachment not found.");
        }
        return res.download(abs, attachment.original_filename);
      } catch (e) {
        return next(e);
      }
    }
  );
};
