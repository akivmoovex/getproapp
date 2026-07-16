"use strict";

const fs = require("fs");
const multer = require("multer");
const { getPgPool } = require("../../db/pg");
const pastoralCareRepo = require("../../db/pg/church/pastoralCareRepo");
const membersRepo = require("../../db/pg/church/membersRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const {
  requirePastoralAccess,
  canDownloadPastoralAttachment,
  hasPastoralAccess,
} = require("../../church/foundationPastoralAccess");
const {
  validateOpenPastoralCaseBody,
  validateCaseFollowUpBody,
  validateClosePastoralCaseBody,
  pastoralCaseStatusLabel,
  CONTACT_ATTEMPTS,
} = require("../../church/pastoralCareValidation");
const foundationPastoralCareService = require("../../services/church/foundationPastoralCareService");
const growthPastoralAutomationService = require("../../services/church/growthPastoralAutomationService");
const { loadPlanForReq } = require("../../services/church/churchPackageFeatureGateService");
const { getEntitlement } = require("../../services/church/churchEntitlementService");
const {
  ensureUploadRoot,
  storedFilenameForUpload,
  absolutePathForStoredFilename,
  safeOriginalName,
  UPLOAD_ROOT,
} = require("../../church/pastoralAttachmentUploads");
const {
  branchAdminLocals,
  flashFromQuery,
  PASTORAL_NOTICES,
  noticeMessage,
  recordBranchAudit,
} = require("./branchAdminShared");

ensureUploadRoot();
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureUploadRoot();
      cb(null, UPLOAD_ROOT);
    },
    filename: (_req, file, cb) => cb(null, storedFilenameForUpload(file.originalname)),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

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

async function loadCaseDetail(pool, req, caseId, error) {
  const branch = req.churchContext.branch;
  const pastoralCase = await pastoralCareRepo.findPastoralCaseByIdForBranch(pool, caseId, branch.id);
  if (!pastoralCase) return { notFound: true };
  const followUps = await pastoralCareRepo.listFollowUpsForCase(pool, caseId, branch.id);
  const attachments = await pastoralCareRepo.listAttachmentsForEntity(pool, "pastoral_case", caseId, branch.id);
  const pastoralAdmins = await loadPastoralAdmins(pool, branch.id);
  const plan = req.churchPackagePlan || (await loadPlanForReq(req));
  const growthAutomation =
    plan && getEntitlement(plan, "care.automation") === "advanced";
  const mappedCase = growthAutomation
    ? growthPastoralAutomationService.mapCaseForViewer(pastoralCase, req.churchBranchAdmin)
    : pastoralCase;
  const audit = await pool.query(
    `SELECT action, created_at, metadata_json
     FROM public.church_audit_logs
     WHERE branch_id = $1
       AND entity_type IN ('pastoral_case', 'prayer_request')
       AND (
         entity_id = $2
         OR (metadata_json->>'pastoral_case_id')::int = $2
       )
     ORDER BY created_at DESC
     LIMIT 50`,
    [branch.id, caseId]
  );
  return {
    pastoralCase: mappedCase,
    followUps,
    attachments,
    pastoralAdmins,
    growthAutomation,
    auditHistory: audit.rows,
    contactAttempts: CONTACT_ATTEMPTS,
    pastoralCaseStatusLabel,
    error,
    notice: noticeMessage(flashFromQuery(req, PASTORAL_NOTICES)),
  };
}

module.exports = function registerBranchAdminPastoralCasesRoutes(router) {
  router.get(
    "/branch/pastoral-cases",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requirePastoralAccess,
    async (req, res, next) => {
      try {
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const cases = await pastoralCareRepo.listPastoralCasesForBranch(pool, branch.id);
        const members = await membersRepo.listMembersForBranch(pool, branch.id, { status: "verified" });
        const pastoralAdmins = await loadPastoralAdmins(pool, branch.id);
        return res.render(
          "church/branch-admin/pastoral_cases",
          branchAdminLocals(req, {
            cases,
            members,
            pastoralAdmins,
            pastoralCaseStatusLabel,
            form: {
              member_id: String(req.query.member_id || "").trim(),
              prayer_request_id: String(req.query.prayer_request_id || "").trim(),
            },
            notice: noticeMessage(flashFromQuery(req, PASTORAL_NOTICES)),
            error: String(req.query.error || "").trim() || null,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/pastoral-cases",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requirePastoralAccess,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const validation = validateOpenPastoralCaseBody(req.body || {});
        const pool = getPgPool();
        const branch = req.churchContext.branch;
        if (!validation.ok) {
          const cases = await pastoralCareRepo.listPastoralCasesForBranch(pool, branch.id);
          const members = await membersRepo.listMembersForBranch(pool, branch.id, { status: "verified" });
          const pastoralAdmins = await loadPastoralAdmins(pool, branch.id);
          return res.status(400).render(
            "church/branch-admin/pastoral_cases",
            branchAdminLocals(req, {
              cases,
              members,
              pastoralAdmins,
              pastoralCaseStatusLabel,
              form: validation.form || req.body,
              error: validation.error,
              notice: null,
            })
          );
        }
        const result = await foundationPastoralCareService.openPastoralCase(
          pool,
          foundationPastoralCareService.trustedCtx(req),
          validation.data
        );
        await recordBranchAudit(pool, req, {
          action: "pastoral_case_opened",
          entityType: "pastoral_case",
          entityId: result.pastoralCase.id,
          metadata: {
            member_id: validation.data.member_id,
            notification_subject: result.notificationSubject,
          },
        });
        return res.redirect(303, `/branch/pastoral-cases/${result.pastoralCase.id}?notice=case_opened`);
      } catch (e) {
        if (e && e.code === foundationPastoralCareService.PASTORAL_ERRORS.DUPLICATE_CASE) {
          return res.redirect(303, `/branch/pastoral-cases?error=${encodeURIComponent(e.message)}`);
        }
        return next(e);
      }
    }
  );

  router.get(
    "/branch/pastoral-cases/:caseId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requirePastoralAccess,
    async (req, res, next) => {
      try {
        const caseId = Number(req.params.caseId);
        if (!Number.isFinite(caseId) || caseId <= 0) {
          return res.status(404).type("text").send("Pastoral case not found.");
        }
        const pool = getPgPool();
        const locals = await loadCaseDetail(pool, req, caseId, null);
        if (locals.notFound) return res.status(404).type("text").send("Pastoral case not found.");
        return res.render("church/branch-admin/pastoral_case_detail", branchAdminLocals(req, locals));
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/pastoral-cases/:caseId/follow-up",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requirePastoralAccess,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const caseId = Number(req.params.caseId);
        const validation = validateCaseFollowUpBody(req.body || {});
        if (!validation.ok) {
          const pool = getPgPool();
          return res.status(400).render(
            "church/branch-admin/pastoral_case_detail",
            branchAdminLocals(req, {
              ...(await loadCaseDetail(pool, req, caseId, validation.error)),
            })
          );
        }
        const pool = getPgPool();
        const result = await foundationPastoralCareService.recordCaseFollowUp(
          pool,
          foundationPastoralCareService.trustedCtx(req),
          caseId,
          validation.data
        );
        await recordBranchAudit(pool, req, {
          action: "pastoral_case_follow_up",
          entityType: "pastoral_case",
          entityId: caseId,
          metadata: {
            contact_attempt: validation.data.contact_attempt,
            pastoral_case_id: caseId,
            notification_subject: result.notificationSubject,
          },
        });
        return res.redirect(303, `/branch/pastoral-cases/${caseId}?notice=case_follow_up`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/pastoral-cases/:caseId/close",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requirePastoralAccess,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const caseId = Number(req.params.caseId);
        const validation = validateClosePastoralCaseBody(req.body || {});
        if (!validation.ok) {
          const pool = getPgPool();
          return res.status(400).render(
            "church/branch-admin/pastoral_case_detail",
            branchAdminLocals(req, {
              ...(await loadCaseDetail(pool, req, caseId, validation.error)),
            })
          );
        }
        const pool = getPgPool();
        const result = await foundationPastoralCareService.closePastoralCase(
          pool,
          foundationPastoralCareService.trustedCtx(req),
          caseId,
          validation.data
        );
        await recordBranchAudit(pool, req, {
          action: "pastoral_case_closed",
          entityType: "pastoral_case",
          entityId: caseId,
          metadata: { notification_subject: result.notificationSubject },
        });
        return res.redirect(303, `/branch/pastoral-cases/${caseId}?notice=case_closed`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/pastoral-cases/:caseId/attachments/:attachmentId/download",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        if (!hasPastoralAccess(req.churchBranchAdmin)) {
          return res.status(403).type("text").send("Pastoral access required.");
        }
        const caseId = Number(req.params.caseId);
        const attachmentId = Number(req.params.attachmentId);
        const pool = getPgPool();
        const branch = req.churchContext.branch;
        const attachment = await pastoralCareRepo.findAttachmentByIdForBranch(pool, attachmentId, branch.id);
        if (
          !attachment ||
          attachment.entity_type !== "pastoral_case" ||
          Number(attachment.entity_id) !== caseId
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
