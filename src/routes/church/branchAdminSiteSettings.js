"use strict";

const { getPgPool } = require("../../db/pg");
const contactSubmissionsRepo = require("../../db/pg/church/contactSubmissionsRepo");
const branchesRepo = require("../../db/pg/church/branchesRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const {
  validateContactStatusUpdate,
  contactStatusLabel,
} = require("../../church/contactSubmissionValidation");
const {
  branchAdminLocals,
  flashFromQuery,
  CONTACT_NOTICES,
  noticeMessage,
  recordBranchAudit,
} = require("./branchAdminShared");

module.exports = function registerBranchAdminSiteSettingsRoutes(router) {
  router.post(
    "/branch/site-settings",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        if (!pool) {
          return res.redirect(303, "/branch/website-editor?notice=settings_error");
        }
        const enabled = req.body.member_registration_enabled === "on";
        await branchesRepo.updateBranchMemberRegistrationEnabled(
          pool,
          branch.id,
          enabled,
          req.churchBranchAdmin.admin_id
        );
        await recordBranchAudit(pool, req, {
          action: "branch_member_registration_toggled",
          entityType: "church_branch",
          entityId: branch.id,
          metadata: { member_registration_enabled: enabled },
        });
        return res.redirect(303, "/branch/website-editor?notice=registration_updated");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/contact-submissions",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const status = String(req.query.status || "all");
        let submissions = [];
        if (pool) {
          submissions = await contactSubmissionsRepo.listContactSubmissionsForBranch(pool, branch.id, {
            status,
          });
        }
        return res.render(
          "church/branch-admin/contact_submissions",
          branchAdminLocals(req, {
            submissions,
            statusFilter: status,
            contactStatusLabel,
            notice: noticeMessage(flashFromQuery(req, CONTACT_NOTICES)),
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/contact-submissions/:submissionId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const submissionId = Number(req.params.submissionId);
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        if (!pool) {
          return res.status(503).type("text").send("Service unavailable.");
        }
        const submission = await contactSubmissionsRepo.findContactSubmissionByIdForBranch(
          pool,
          submissionId,
          branch.id
        );
        if (!submission) {
          return res.status(404).type("text").send("Submission not found.");
        }
        if (submission.status === "new") {
          await contactSubmissionsRepo.updateContactSubmissionStatusForBranch(pool, submissionId, branch.id, {
            status: "read",
            reviewed_by_admin_id: req.churchBranchAdmin.admin_id,
          });
          submission.status = "read";
        }
        return res.render(
          "church/branch-admin/contact_submission_detail",
          branchAdminLocals(req, {
            submission,
            contactStatusLabel,
            error: null,
            notice: noticeMessage(flashFromQuery(req, CONTACT_NOTICES)),
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/contact-submissions/:submissionId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const submissionId = Number(req.params.submissionId);
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const validation = validateContactStatusUpdate(req.body);
        if (!validation.ok) {
          const submission = await contactSubmissionsRepo.findContactSubmissionByIdForBranch(
            pool,
            submissionId,
            branch.id
          );
          if (!submission) {
            return res.status(404).type("text").send("Submission not found.");
          }
          return res.status(400).render(
            "church/branch-admin/contact_submission_detail",
            branchAdminLocals(req, {
              submission,
              contactStatusLabel,
              error: validation.error,
              notice: null,
            })
          );
        }
        const updated = await contactSubmissionsRepo.updateContactSubmissionStatusForBranch(
          pool,
          submissionId,
          branch.id,
          {
            status: validation.status,
            reviewed_by_admin_id: req.churchBranchAdmin.admin_id,
          }
        );
        if (!updated) {
          return res.status(404).type("text").send("Submission not found.");
        }
        return res.redirect(303, `/branch/contact-submissions/${submissionId}?notice=contact_updated`);
      } catch (e) {
        return next(e);
      }
    }
  );
};
