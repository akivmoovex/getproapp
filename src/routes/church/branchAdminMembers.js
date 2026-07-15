"use strict";

const { getPgPool } = require("../../db/pg");
const membersRepo = require("../../db/pg/church/membersRepo");
const memberMinistriesRepo = require("../../db/pg/church/memberMinistriesRepo");
const memberRequestsRepo = require("../../db/pg/church/memberRequestsRepo");
const prayerRequestsRepo = require("../../db/pg/church/prayerRequestsRepo");
const dutyRosterRepo = require("../../db/pg/church/dutyRosterRepo");
const ministryJoinRequestsRepo = require("../../db/pg/church/ministryJoinRequestsRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const {
  AGE_GROUP_OPTIONS,
  ATTENDANCE_DURATION_OPTIONS,
  MINISTRY_INTEREST_OPTIONS,
} = require("../../church/memberRegistration");
const {
  MEMBER_STATUS_FILTERS,
  memberStatusLabel,
  validateMemberProfileForAdmin,
  validateAdminNoteBody,
} = require("../../church/memberDirectoryValidation");
const { memberRequestStatusLabel } = require("../../church/memberPortalValidation");
const churchPlanService = require("../../services/church/churchPlanService");
const {
  prayerRequestStatusLabel,
  privacyLevelLabel,
  showPrayerDetails,
} = require("../../church/requestProcessingValidation");
const { joinRequestStatusLabel } = require("../../church/ministryJoinRequestValidation");
const { formatDutyDate, dutyStatusLabel } = require("../../church/dutyRosterValidation");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const {
  branchAdminLocals,
  flashFromQuery,
  MEMBER_NOTICES,
  noticeMessage,
  recordBranchAudit,
} = require("./branchAdminShared");
const branchesRepo = require("../../db/pg/church/branchesRepo");
const {
  transferMemberToBranch,
  listMemberBranchHistory,
} = require("../../services/church/memberBranchTransferService");
const { organisationAllowsBranchPaths } = require("../../services/church/branchPathRoutingService");

async function recordMemberAudit(pool, req, action, memberId, metadata) {
  await recordBranchAudit(pool, req, {
    action,
    entityType: "member",
    entityId: memberId,
    metadata: metadata && typeof metadata === "object" ? metadata : {},
  });
}

function formFromMember(member) {
  return {
    full_name: member.full_name || "",
    email: member.email || "",
    phone: member.phone || "",
    gender: member.gender || "",
    age_group: member.age_group || "",
    address_area: member.address_area || "",
    attendance_duration: member.attendance_duration || "",
    ministry_interest: member.ministry_interest || "",
    emergency_contact_name: member.emergency_contact_name || "",
    emergency_contact_phone: member.emergency_contact_phone || "",
  };
}

async function loadMemberProfileSummary(pool, memberId, branchId, adminRole) {
  const [
    activeMinistries,
    joinRequests,
    memberRequests,
    prayerRequests,
    upcomingDuties,
    pastDutyCount,
  ] = await Promise.all([
    memberMinistriesRepo.listMinistriesForMember(pool, memberId, branchId),
    ministryJoinRequestsRepo.listJoinRequestsForMember(pool, memberId, branchId),
    memberRequestsRepo.listMemberRequestsForMember(pool, memberId, branchId),
    prayerRequestsRepo.listPrayerRequestsForMember(pool, memberId, branchId),
    dutyRosterRepo.listDutiesForMember(pool, memberId, branchId, {
      timeframe: "upcoming",
      limit: 5,
    }),
    dutyRosterRepo.countDutiesForMember(pool, memberId, branchId, { timeframe: "past" }),
  ]);

  const pendingJoinRequests = joinRequests.filter((r) =>
    ["submitted", "more_info_needed"].includes(r.status)
  );
  const closedJoinRequests = joinRequests.filter((r) =>
    ["approved", "rejected"].includes(r.status)
  );

  const prayerSummary = { submitted: 0, reviewed: 0, closed: 0 };
  for (const p of prayerRequests) {
    if (Object.prototype.hasOwnProperty.call(prayerSummary, p.status)) {
      prayerSummary[p.status] += 1;
    }
  }

  const prayerItems = prayerRequests.slice(0, 5).map((row) => {
    const mapped = prayerRequestsRepo.mapPrayerRow(
      { ...row, member_name: row.member_id ? "Member" : "Anonymous" },
      adminRole
    );
    const showDetails = showPrayerDetails(row, adminRole);
    return {
      id: row.id,
      prayer_topic: row.prayer_topic,
      status: row.status,
      urgency: row.urgency,
      privacy_level: row.privacy_level,
      privacy_label: privacyLevelLabel(row.privacy_level),
      created_at: row.created_at,
      details_preview:
        row.privacy_level === "anonymous_summary"
          ? "Anonymous summary — details withheld on member profile."
          : showDetails
            ? row.details
            : "Details available in prayer request queue.",
      identity_masked: row.privacy_level === "anonymous_summary",
    };
  });

  return {
    activeMinistries,
    pendingJoinRequests,
    closedJoinRequests,
    memberRequests: memberRequests.slice(0, 5),
    prayerSummary,
    prayerItems,
    upcomingDuties,
    pastDutyCount,
  };
}

async function renderMemberProfile(pool, req, member, extra = {}) {
  const adminRole = req.churchBranchAdmin.role || "branch_admin";
  const org = req.churchContext.organization;
  const branch = req.churchContext.branch;
  const summary = await loadMemberProfileSummary(pool, member.id, branch.id, adminRole);
  const allowsTransfer = organisationAllowsBranchPaths(org);
  let transferTargets = [];
  let transferHistory = [];
  if (allowsTransfer) {
    const allBranches = await branchesRepo.listBranchesForOrganization(pool, org.id);
    transferTargets = allBranches.filter(
      (b) => b.status === "active" && Number(b.id) !== Number(branch.id)
    );
    transferHistory = await listMemberBranchHistory(pool, member.id);
  }
  return branchAdminLocals(req, {
    member,
    summary,
    memberStatusLabel,
    memberRequestStatusLabel,
    joinRequestStatusLabel,
    prayerRequestStatusLabel,
    formatDutyDate,
    dutyStatusLabel,
    error: null,
    notice: noticeMessage(flashFromQuery(req, MEMBER_NOTICES)),
    allowsTransfer,
    transferTargets,
    transferHistory,
    ...extra,
  });
}

module.exports = function registerBranchAdminMembersRoutes(router) {
  router.get("/branch/members", requireChurchBranchHost, requireChurchBranchAdminSession, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const filter = String(req.query.status || "all").trim();
      const statusFilter = MEMBER_STATUS_FILTERS.includes(filter) ? filter : "all";
      const q = String(req.query.q || "").trim();
      const members = q
        ? await membersRepo.searchMembersForBranch(pool, branch.id, q, { status: statusFilter })
        : await membersRepo.listMembersForBranch(pool, branch.id, { status: statusFilter });
      const planContext = await churchPlanService.loadPlanContextForOrganization(
        pool,
        req.churchContext.organization.id
      );
      return res.render(
        "church/branch-admin/members_directory",
        branchAdminLocals(req, {
          members,
          statusFilter,
          memberFilters: MEMBER_STATUS_FILTERS,
          memberStatusLabel,
          searchQuery: q,
          planContext,
          notice: noticeMessage(flashFromQuery(req, MEMBER_NOTICES)),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/branch/member-verification", requireChurchBranchHost, requireChurchBranchAdminSession, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const pendingMembers = await membersRepo.listPendingMembersForBranch(pool, branch.id);
      const planContext = await churchPlanService.loadPlanContextForOrganization(
        pool,
        req.churchContext.organization.id
      );
      return res.render(
        "church/branch-admin/verification_queue",
        branchAdminLocals(req, {
          pendingMembers,
          planContext,
          notice: noticeMessage(flashFromQuery(req, MEMBER_NOTICES)),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/branch/members/:memberId", requireChurchBranchHost, requireChurchBranchAdminSession, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const memberId = Number(req.params.memberId);
      if (!Number.isFinite(memberId) || memberId <= 0) {
        return res.status(404).type("text").send("Member not found.");
      }
      const pool = getPgPool();
      const member = await membersRepo.findMemberByIdForBranch(pool, memberId, branch.id);
      if (!member) {
        return res.status(404).type("text").send("Member not found.");
      }
      return res.render("church/branch-admin/member_profile", await renderMemberProfile(pool, req, member));
    } catch (e) {
      return next(e);
    }
  });

  router.get(
    "/branch/members/:memberId/edit",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const memberId = Number(req.params.memberId);
        if (!Number.isFinite(memberId) || memberId <= 0) {
          return res.status(404).type("text").send("Member not found.");
        }
        const pool = getPgPool();
        const branch = req.churchContext.branch;
        const member = await membersRepo.findMemberByIdForBranch(pool, memberId, branch.id);
        if (!member) return res.status(404).type("text").send("Member not found.");
        return res.render(
          "church/branch-admin/member_edit",
          branchAdminLocals(req, {
            member,
            form: formFromMember(member),
            error: null,
            ageGroupOptions: AGE_GROUP_OPTIONS,
            attendanceDurationOptions: ATTENDANCE_DURATION_OPTIONS,
            ministryInterestOptions: MINISTRY_INTEREST_OPTIONS,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/members/:memberId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const memberId = Number(req.params.memberId);
        if (!Number.isFinite(memberId) || memberId <= 0) {
          return res.status(404).type("text").send("Member not found.");
        }
        const pool = getPgPool();
        const branch = req.churchContext.branch;
        const existing = await membersRepo.findMemberByIdForBranch(pool, memberId, branch.id);
        if (!existing) return res.status(404).type("text").send("Member not found.");

        const validation = validateMemberProfileForAdmin(req.body || {});
        if (!validation.ok) {
          return res.status(400).render(
            "church/branch-admin/member_edit",
            branchAdminLocals(req, {
              member: existing,
              form: validation.form,
              error: validation.error,
              ageGroupOptions: AGE_GROUP_OPTIONS,
              attendanceDurationOptions: ATTENDANCE_DURATION_OPTIONS,
              ministryInterestOptions: MINISTRY_INTEREST_OPTIONS,
            })
          );
        }

        const conflict = await membersRepo.findProfileConflictForBranch(
          pool,
          branch.id,
          memberId,
          validation.data.email,
          validation.data.phone
        );
        if (conflict) {
          return res.status(400).render(
            "church/branch-admin/member_edit",
            branchAdminLocals(req, {
              member: existing,
              form: validation.form,
              error: "Another member already uses this email or phone at this branch.",
              ageGroupOptions: AGE_GROUP_OPTIONS,
              attendanceDurationOptions: ATTENDANCE_DURATION_OPTIONS,
              ministryInterestOptions: MINISTRY_INTEREST_OPTIONS,
            })
          );
        }

        const updated = await membersRepo.updateMemberProfileForBranchAdmin(
          pool,
          memberId,
          branch.id,
          validation.data
        );
        if (!updated) return res.status(404).type("text").send("Member not found.");

        await recordMemberAudit(pool, req, "member_profile_updated_by_admin", memberId, {
          previous_status: existing.status,
          new_status: updated.status,
        });

        return res.redirect(303, `/branch/members/${memberId}?notice=profile_updated`);
      } catch (e) {
        return next(e);
      }
    }
  );

  async function handleMemberAction(req, res, next, action) {
    try {
      const branch = req.churchContext.branch;
      const memberId = Number(req.params.memberId);
      if (!Number.isFinite(memberId) || memberId <= 0) {
        return res.status(404).type("text").send("Member not found.");
      }
      const pool = getPgPool();
      const adminId = req.churchBranchAdmin.admin_id;
      const member = await membersRepo.findMemberByIdForBranch(pool, memberId, branch.id);
      if (!member) {
        return res.status(404).type("text").send("Member not found.");
      }

      const comment = String((req.body && req.body.review_comment) || "").trim().slice(0, 2000);
      let redirectNotice = "";
      let auditAction = "";

      if (action === "approve") {
        if (member.status !== "pending") {
          return res.status(400).render(
            "church/branch-admin/member_profile",
            await renderMemberProfile(pool, req, member, {
              error: "Only pending members can be approved.",
              notice: null,
            })
          );
        }
        const updated = await membersRepo.updateMemberStatusForBranch(pool, memberId, branch.id, "verified", {
          reviewComment: comment || undefined,
          actorType: "branch_admin",
          actorId: adminId,
        });
        if (!updated) return res.status(404).type("text").send("Member not found.");
        auditAction = "member_verified_by_admin";
        redirectNotice = "approved";
      } else if (action === "reject") {
        if (member.status !== "pending") {
          return res.status(400).render(
            "church/branch-admin/member_profile",
            await renderMemberProfile(pool, req, member, {
              error: "Only pending members can be rejected.",
              notice: null,
            })
          );
        }
        const updated = await membersRepo.updateMemberStatusForBranch(pool, memberId, branch.id, "rejected", {
          reviewComment: comment || undefined,
        });
        if (!updated) return res.status(404).type("text").send("Member not found.");
        auditAction = "member_rejected";
        redirectNotice = "rejected";
      } else if (action === "request-more-info") {
        if (member.status !== "pending") {
          return res.status(400).render(
            "church/branch-admin/member_profile",
            await renderMemberProfile(pool, req, member, {
              error: "Only pending members can receive an information request.",
              notice: null,
            })
          );
        }
        if (!comment) {
          return res.status(400).render(
            "church/branch-admin/member_profile",
            await renderMemberProfile(pool, req, member, {
              error: "Please enter a comment explaining what information is needed.",
              notice: null,
            })
          );
        }
        await membersRepo.updateMemberStatusForBranch(pool, memberId, branch.id, "pending", {
          reviewComment: comment,
        });
        auditAction = "member_more_info_requested";
        redirectNotice = "more_info";
      }

      await recordMemberAudit(pool, req, auditAction, memberId, {
        previous_status: member.status,
        comment: comment || null,
      });

      const redirectTo = String((req.body && req.body.redirect_to) || "queue").trim();
      if (redirectTo === "profile") {
        return res.redirect(303, `/branch/members/${memberId}?notice=${redirectNotice}`);
      }
      return res.redirect(303, `/branch/member-verification?notice=${redirectNotice}`);
    } catch (e) {
      if (e && e.code === "FOUNDATION_MEMBER_LIMIT") {
        try {
          const branch = req.churchContext.branch;
          const memberId = Number(req.params.memberId);
          const pool = getPgPool();
          const member = await membersRepo.findMemberByIdForBranch(pool, memberId, branch.id);
          return res.status(400).render(
            "church/branch-admin/member_profile",
            await renderMemberProfile(pool, req, member || { id: memberId, status: "pending" }, {
              error: e.message,
              notice: null,
            })
          );
        } catch {
          return res.status(400).type("text").send(e.message);
        }
      }
      return next(e);
    }
  }

  router.post("/branch/members/:memberId/approve", requireChurchBranchHost, requireChurchBranchAdminSession, requireChurchSessionCsrf, (req, res, next) =>
    handleMemberAction(req, res, next, "approve")
  );
  router.post("/branch/members/:memberId/reject", requireChurchBranchHost, requireChurchBranchAdminSession, requireChurchSessionCsrf, (req, res, next) =>
    handleMemberAction(req, res, next, "reject")
  );
  router.post(
    "/branch/members/:memberId/request-more-info",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    (req, res, next) => handleMemberAction(req, res, next, "request-more-info")
  );

  router.post(
    "/branch/members/:memberId/verify",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const memberId = Number(req.params.memberId);
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;
        const member = await membersRepo.findMemberByIdForBranch(pool, memberId, branch.id);
        if (!member) return res.status(404).type("text").send("Member not found.");
        if (member.status === "verified") {
          return res.redirect(303, `/branch/members/${memberId}?notice=already_verified`);
        }
        const updated = await membersRepo.verifyMemberForBranch(pool, memberId, branch.id, adminId);
        if (!updated) {
          return res.status(400).render(
            "church/branch-admin/member_profile",
            await renderMemberProfile(pool, req, member, {
              error: "Member cannot be verified from current status.",
              notice: null,
            })
          );
        }
        await recordMemberAudit(pool, req, "member_verified_by_admin", memberId, {
          previous_status: member.status,
          new_status: "verified",
        });
        return res.redirect(303, `/branch/members/${memberId}?notice=verified`);
      } catch (e) {
        if (e && e.code === "FOUNDATION_MEMBER_LIMIT") {
          try {
            const memberId = Number(req.params.memberId);
            const branch = req.churchContext.branch;
            const pool = getPgPool();
            const member = await membersRepo.findMemberByIdForBranch(pool, memberId, branch.id);
            return res.status(400).render(
              "church/branch-admin/member_profile",
              await renderMemberProfile(pool, req, member, {
                error: e.message,
                notice: null,
              })
            );
          } catch {
            return res.status(400).type("text").send(e.message);
          }
        }
        return next(e);
      }
    }
  );

  router.post(
    "/branch/members/:memberId/suspend",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const memberId = Number(req.params.memberId);
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;
        const member = await membersRepo.findMemberByIdForBranch(pool, memberId, branch.id);
        if (!member) return res.status(404).type("text").send("Member not found.");
        const reason = String((req.body && req.body.suspend_reason) || "").trim().slice(0, 2000);
        const updated = await membersRepo.suspendMemberForBranch(
          pool,
          memberId,
          branch.id,
          adminId,
          reason || null
        );
        if (!updated) {
          return res.status(400).render(
            "church/branch-admin/member_profile",
            await renderMemberProfile(pool, req, member, {
              error: "Only verified members can be suspended.",
              notice: null,
            })
          );
        }
        await recordMemberAudit(pool, req, "member_suspended", memberId, {
          previous_status: member.status,
          new_status: "suspended",
          note_preview: reason || null,
        });
        return res.redirect(303, `/branch/members/${memberId}?notice=suspended`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/members/:memberId/reactivate",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const memberId = Number(req.params.memberId);
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const adminId = req.churchBranchAdmin.admin_id;
        const member = await membersRepo.findMemberByIdForBranch(pool, memberId, branch.id);
        if (!member) return res.status(404).type("text").send("Member not found.");
        const updated = await membersRepo.reactivateMemberForBranch(pool, memberId, branch.id, adminId);
        if (!updated) {
          return res.status(400).render(
            "church/branch-admin/member_profile",
            await renderMemberProfile(pool, req, member, {
              error: "Only suspended members can be reactivated.",
              notice: null,
            })
          );
        }
        await recordMemberAudit(pool, req, "member_reactivated", memberId, {
          previous_status: member.status,
          new_status: "verified",
        });
        return res.redirect(303, `/branch/members/${memberId}?notice=reactivated`);
      } catch (e) {
        if (e && e.code === "FOUNDATION_MEMBER_LIMIT") {
          try {
            const memberId = Number(req.params.memberId);
            const branch = req.churchContext.branch;
            const pool = getPgPool();
            const member = await membersRepo.findMemberByIdForBranch(pool, memberId, branch.id);
            return res.status(400).render(
              "church/branch-admin/member_profile",
              await renderMemberProfile(pool, req, member, {
                error: e.message,
                notice: null,
              })
            );
          } catch {
            return res.status(400).type("text").send(e.message);
          }
        }
        return next(e);
      }
    }
  );

  router.post(
    "/branch/members/:memberId/add-note",
    requireChurchBranchHost,
    requireChurchBranchAdminSession, requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const memberId = Number(req.params.memberId);
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const member = await membersRepo.findMemberByIdForBranch(pool, memberId, branch.id);
        if (!member) return res.status(404).type("text").send("Member not found.");

        const validation = validateAdminNoteBody(req.body);
        if (!validation.ok) {
          return res.status(400).render(
            "church/branch-admin/member_profile",
            await renderMemberProfile(pool, req, member, {
              error: validation.error,
              notice: null,
            })
          );
        }

        const updated = await membersRepo.addAdminNoteForMember(
          pool,
          memberId,
          branch.id,
          validation.note
        );
        if (!updated) return res.status(404).type("text").send("Member not found.");

        await recordMemberAudit(pool, req, "member_admin_note_added", memberId, {
          note_preview: validation.note.slice(0, 120),
        });

        return res.redirect(303, `/branch/members/${memberId}?notice=admin_note_added`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/members/:memberId/transfer",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const memberId = Number(req.params.memberId);
        const branch = req.churchContext.branch;
        const org = req.churchContext.organization;
        const pool = getPgPool();
        const member = await membersRepo.findMemberByIdForBranch(pool, memberId, branch.id);
        if (!member) return res.status(404).type("text").send("Member not found.");

        const toBranchId = Number(req.body && req.body.to_branch_id);
        try {
          await transferMemberToBranch(pool, {
            memberId,
            fromBranchId: branch.id,
            toBranchId,
            organizationId: org.id,
            organization: org,
            actorType: "branch_admin",
            actorId: req.churchBranchAdmin.admin_id,
            reason: req.body && req.body.transfer_reason,
          });
        } catch (err) {
          return res.status(400).render(
            "church/branch-admin/member_profile",
            await renderMemberProfile(pool, req, member, {
              error: err.message || "Transfer failed.",
              notice: null,
            })
          );
        }

        return res.redirect(303, `/branch/members?notice=transferred`);
      } catch (e) {
        return next(e);
      }
    }
  );
};
