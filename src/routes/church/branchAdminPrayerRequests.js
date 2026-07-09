"use strict";

const { getPgPool } = require("../../db/pg");
const prayerRequestsRepo = require("../../db/pg/church/prayerRequestsRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const {
  canTransitionPrayer,
  prayerRequestStatusLabel,
  privacyLevelLabel,
  showPrayerMemberIdentity,
} = require("../../church/requestProcessingValidation");
const {
  branchAdminLocals,
  flashFromQuery,
  PRAYER_ADMIN_NOTICES,
  noticeMessage,
  recordBranchAudit,
} = require("./branchAdminShared");

async function loadPrayerDetail(pool, req, prayerRequestId, error) {
  const branch = req.churchContext.branch;
  const adminRole = req.churchBranchAdmin.role;
  const item = await prayerRequestsRepo.findPrayerRequestByIdForBranch(pool, prayerRequestId, branch.id, {
    adminRole,
  });
  if (!item) return { notFound: true };
  return {
    prayerItem: item,
    prayerStatusLabel: prayerRequestStatusLabel,
    privacyLevelLabel,
    showMemberIdentity: showPrayerMemberIdentity(item, adminRole),
    error,
    notice: noticeMessage(flashFromQuery(req, PRAYER_ADMIN_NOTICES)),
  };
}

async function handlePrayerStatus(req, res, next, newStatus, auditAction, noticeCode) {
  try {
    const prayerRequestId = Number(req.params.prayerRequestId);
    if (!Number.isFinite(prayerRequestId) || prayerRequestId <= 0) {
      return res.status(404).type("text").send("Prayer request not found.");
    }

    const branch = req.churchContext.branch;
    const pool = getPgPool();
    const adminRole = req.churchBranchAdmin.role;
    const existing = await prayerRequestsRepo.findPrayerRequestByIdForBranch(
      pool,
      prayerRequestId,
      branch.id,
      { adminRole }
    );
    if (!existing) {
      return res.status(404).type("text").send("Prayer request not found.");
    }

    if (!canTransitionPrayer(existing.status, newStatus)) {
      return res.status(400).render(
        "church/branch-admin/prayer_request_detail",
        branchAdminLocals(req, {
          ...(await loadPrayerDetail(
            pool,
            req,
            prayerRequestId,
            `Cannot move prayer request from ${prayerRequestStatusLabel(existing.status)} to ${prayerRequestStatusLabel(newStatus)}.`
          )),
        })
      );
    }

    const comment = String((req.body && req.body.admin_comment) || "").trim().slice(0, 2000);
    const updated = await prayerRequestsRepo.updatePrayerRequestStatusForBranch(
      pool,
      prayerRequestId,
      branch.id,
      {
        status: newStatus,
        from_status: existing.status,
        admin_comment: comment || existing.admin_comment || "",
        reviewed_by_admin_id: req.churchBranchAdmin.admin_id,
        set_reviewed_at: newStatus === "reviewed",
        set_closed_at: newStatus === "closed",
        admin_role: adminRole,
      }
    );

    if (!updated) {
      return res.status(400).render(
        "church/branch-admin/prayer_request_detail",
        branchAdminLocals(req, {
          ...(await loadPrayerDetail(pool, req, prayerRequestId, "Prayer request could not be updated.")),
        })
      );
    }

    await recordBranchAudit(pool, req, {
      action: auditAction,
      entityType: "prayer_request",
      entityId: prayerRequestId,
      metadata: {
        previous_status: existing.status,
        new_status: newStatus,
        comment: comment || null,
        privacy_level: existing.privacy_level,
      },
    });

    return res.redirect(303, `/branch/prayer-requests/${prayerRequestId}?notice=${noticeCode}`);
  } catch (e) {
    return next(e);
  }
}

module.exports = function registerBranchAdminPrayerRequestsRoutes(router) {
  router.get(
    "/branch/prayer-requests",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminRole = req.churchBranchAdmin.role;
        const requests = await prayerRequestsRepo.listPrayerRequestsForBranch(pool, branch.id, { adminRole });
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
    "/branch/prayer-requests/:prayerRequestId/mark-reviewed",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    (req, res, next) => handlePrayerStatus(req, res, next, "reviewed", "prayer_request_reviewed", "prayer_reviewed")
  );

  router.post(
    "/branch/prayer-requests/:prayerRequestId/close",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    (req, res, next) => handlePrayerStatus(req, res, next, "closed", "prayer_request_closed", "prayer_closed")
  );
};
