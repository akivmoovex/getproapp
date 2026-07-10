"use strict";

const { getPgPool } = require("../../db/pg");
const membersRepo = require("../../db/pg/church/membersRepo");
const memberRequestsRepo = require("../../db/pg/church/memberRequestsRepo");
const prayerRequestsRepo = require("../../db/pg/church/prayerRequestsRepo");
const announcementsRepo = require("../../db/pg/church/announcementsRepo");
const hqBroadcastsRepo = require("../../db/pg/church/hqBroadcastsRepo");
const feedItemReadsRepo = require("../../db/pg/church/feedItemReadsRepo");
const broadcastAttachmentsRepo = require("../../db/pg/church/broadcastAttachmentsRepo");
const memberAnnouncementFeedRepo = require("../../db/pg/church/memberAnnouncementFeedRepo");
const {
  mergeAnnouncementFeed,
  partitionAnnouncementFeed,
  isActivelyFeatured,
  priorityDisplay,
  attachmentTypeLabel,
} = require("../../church/announcementFeed");
const {
  MEMBER_HQ_AUDIENCES,
  BROADCAST_PRIORITIES,
  BROADCAST_CATEGORIES,
  priorityLabel,
} = require("../../church/hqBroadcastValidation");
const { ANNOUNCEMENT_CATEGORIES } = require("../../church/announcementsEventsValidation");
const {
  absolutePathForStoredFilename,
  absolutePathForAnnouncementStoredFilename,
} = require("../../church/hqBroadcastUploads");
const eventsRepo = require("../../db/pg/church/eventsRepo");
const givingSettingsRepo = require("../../db/pg/church/givingSettingsRepo");
const ministriesRepo = require("../../db/pg/church/ministriesRepo");
const memberMinistriesRepo = require("../../db/pg/church/memberMinistriesRepo");
const ministryJoinRequestsRepo = require("../../db/pg/church/ministryJoinRequestsRepo");
const dutyRosterRepo = require("../../db/pg/church/dutyRosterRepo");
const { prepareGivingDisplay } = require("../../services/church/givingSettingsService");
const {
  matchMinistriesByInterest,
  visibilityLabel,
  formatMinistrySchedule,
} = require("../../church/ministriesDepartmentsValidation");
const { formatDutyDate, dutyStatusLabel } = require("../../church/dutyRosterValidation");
const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const {
  requireVerifiedMemberSession,
  ensureMemberAccountActive,
  setChurchMemberSession,
  hashMemberPassword,
  verifyMemberPassword,
} = require("../../church/memberAuth");
const { requireChurchBranchHost } = require("./auth");
const {
  AGE_GROUP_OPTIONS,
  MINISTRY_INTEREST_OPTIONS,
} = require("../../church/memberRegistration");
const {
  REQUEST_TYPES,
  PRAYER_PRIVACY_LEVELS,
  PRAYER_URGENCY_LEVELS,
  validateProfileBody,
  validateMemberRequestBody,
  validatePrayerRequestBody,
  requestStatusLabel,
} = require("../../church/memberPortalValidation");
const {
  joinRequestStatusLabel,
  memberRelationshipStatusLabel,
  isMinistryVisibleToMember,
  resolveMemberRelationshipStatus,
  canMemberRequestJoin,
  validateJoinRequestBody,
} = require("../../church/ministryJoinRequestValidation");
const { validateChangePasswordBody } = require("../../church/memberAccountValidation");

function resolveMemberNavActive(req) {
  const p = String((req && req.path) || "");
  if (p.startsWith("/member/dashboard")) return "dashboard";
  if (p.startsWith("/member/profile") || p.startsWith("/member/account")) return "profile";
  if (p.startsWith("/member/announcements")) return "announcements";
  if (p.startsWith("/member/events")) return "events";
  if (p.startsWith("/member/my-ministries") || p.startsWith("/member/ministries")) return "ministries";
  if (p.startsWith("/member/forms")) return "forms";
  if (p.startsWith("/member/resources")) return "resources";
  if (p.startsWith("/member/requests") || p.startsWith("/member/prayer-request")) return "requests";
  if (p.startsWith("/member/giving")) return "giving";
  if (p.startsWith("/member/my-duties")) return "duties";
  return "";
}

function memberInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "M";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function memberShellTitle(navActive, extraTitle) {
  if (extraTitle) return extraTitle;
  const titles = {
    dashboard: "Member Dashboard",
    profile: "Member Profile",
    announcements: "Announcements",
    events: "Events",
    ministries: "My Ministries",
    resources: "Resource Library",
    forms: "Forms & Documents",
    requests: "Requests",
    giving: "Giving Information",
    duties: "My Duties",
  };
  return titles[navActive] || "Member Portal";
}

function memberPortalLocals(req, extra) {
  const org = req.churchContext.organization;
  const branch = req.churchContext.branch;
  const memberName = req.churchMember.full_name;
  const navActive = (extra && extra.navActive) || resolveMemberNavActive(req);
  const shellTitle = (extra && extra.shellTitle) || memberShellTitle(navActive, null);
  const categoryOptions = Array.from(new Set([...(ANNOUNCEMENT_CATEGORIES || []), ...(BROADCAST_CATEGORIES || [])]));
  return {
    churchName: branch.name || org.name,
    pageTitle: branch.name || org.name,
    organization: org,
    branch,
    member: req.churchMember,
    memberName,
    memberInitials: memberInitials(memberName),
    memberAvatarUrl: "/church/images/member/avatar-member.jpg",
    navActive,
    shellTitle,
    priorityDisplay,
    priorityLabel,
    attachmentTypeLabel,
    isActivelyFeatured,
    priorities: BROADCAST_PRIORITIES,
    categoryOptions,
    ...(extra || {}),
  };
}

function parseMemberAnnouncementFilters(query) {
  return memberAnnouncementFeedRepo.normalizeMemberFeedOpts({
    q: query && query.q,
    source: query && query.source,
    priority: query && query.priority,
    category: query && query.category,
    read_status: query && (query.read_status || query.read),
    pinned_only: query && (query.pinned_only || query.pinned),
    page: query && query.page,
    limit: 20,
  });
}

function buildMemberAnnouncementsQuery(filters, page) {
  const f = filters || {};
  const pageNum = page != null ? Number(page) || 1 : Number(f.page) || 1;
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.source && f.source !== "all") params.set("source", f.source);
  if (f.priority) params.set("priority", f.priority);
  if (f.category) params.set("category", f.category);
  if (f.read_status && f.read_status !== "all") params.set("read_status", f.read_status);
  if (f.pinned_only) params.set("pinned_only", "1");
  if (pageNum > 1) params.set("page", String(pageNum));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function isSafeHttpUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function attachFilesToFeedItems(pool, orgId, branchId, items) {
  const list = Array.isArray(items) ? items : [];
  return Promise.all(
    list.map(async (item) => {
      const source = item.source === "hq" ? "hq" : "branch";
      const attachments =
        source === "hq"
          ? await broadcastAttachmentsRepo.listAttachmentsForBroadcast(pool, item.id, orgId)
          : await broadcastAttachmentsRepo.listAttachmentsForAnnouncement(pool, item.id, branchId);
      return {
        ...item,
        source,
        attachments: (attachments || []).map((file) => ({
          id: file.id,
          original_filename: file.original_filename,
          mime_type: file.mime_type,
          file_type_label: attachmentTypeLabel(file.mime_type, file.original_filename),
        })),
        action_url: isSafeHttpUrl(item.action_url) ? item.action_url : null,
        action_label: item.action_label || null,
        detail_path: `/member/announcements/${source}/${item.id}`,
        priority_meta: priorityDisplay(item.priority),
        is_actively_featured: isActivelyFeatured(item),
      };
    })
  );
}

function flashFromQuery(req) {
  const notice = String((req.query && req.query.notice) || "").trim().slice(0, 200);
  const map = {
    profile_saved: "Profile updated successfully.",
    request_submitted: "Your request has been submitted.",
    prayer_submitted: "Your prayer request has been submitted.",
    join_request_submitted: "Your ministry join request has been submitted.",
    password_changed: "Password updated. Use your new password next time you log in.",
  };
  return map[notice] || null;
}

function buildAccountView(row) {
  if (!row) return null;
  return {
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    status: row.status,
    password_changed_at: row.password_changed_at || null,
  };
}

async function loadAccountView(pool, memberId, branchId) {
  const row = await membersRepo.findMemberByIdForBranch(pool, memberId, branchId);
  return buildAccountView(row);
}

async function recordMemberAudit(pool, req, action, entityType, entityId, metadata) {
  const org = req.churchContext.organization;
  const branch = req.churchContext.branch;
  const member = req.churchMember;
  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    actor_type: "member",
    actor_id: member.member_id,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata_json: metadata || {},
  });
}

async function loadMemberMinistryRelationship(pool, memberId, branchId, ministryId) {
  const [activeMembership, openRequest, latestRequest] = await Promise.all([
    memberMinistriesRepo.findActiveMemberMinistry(pool, memberId, ministryId, branchId),
    ministryJoinRequestsRepo.findOpenJoinRequestForMemberMinistry(pool, memberId, ministryId, branchId),
    ministryJoinRequestsRepo.findLatestJoinRequestForMemberMinistry(pool, memberId, ministryId, branchId),
  ]);
  const relationshipStatus = resolveMemberRelationshipStatus(
    activeMembership,
    openRequest,
    latestRequest
  );
  return {
    activeMembership,
    openRequest,
    latestRequest,
    relationshipStatus,
    canRequestJoin: canMemberRequestJoin(relationshipStatus),
  };
}

async function enrichMinistriesForMember(pool, memberId, branchId, ministries) {
  return Promise.all(
    ministries.map(async (ministry) => {
      const rel = await loadMemberMinistryRelationship(pool, memberId, branchId, ministry.id);
      return {
        ...ministry,
        member_relationship_status: rel.relationshipStatus,
        member_relationship_label: memberRelationshipStatusLabel(rel.relationshipStatus),
        can_request_join: rel.canRequestJoin,
        open_join_request: rel.openRequest,
      };
    })
  );
}

async function buildMyMinistriesView(pool, memberId, branchId, ministryInterest) {
  const activeMinistries = await memberMinistriesRepo.listMinistriesForMember(pool, memberId, branchId);
  const joinRequests = await ministryJoinRequestsRepo.listJoinRequestsForMember(pool, memberId, branchId);
  const pendingRequests = joinRequests.filter((r) =>
    ["submitted", "more_info_needed"].includes(r.status)
  );
  const closedRequests = joinRequests.filter((r) => ["rejected", "approved"].includes(r.status));

  let interestMatches = [];
  if (activeMinistries.length === 0 && pendingRequests.length === 0) {
    const visible = await ministriesRepo.listVisibleMinistriesForMember(pool, branchId);
    interestMatches = matchMinistriesByInterest(visible, ministryInterest).map((m) => ({
      ...m,
      assignment_status: "interested",
      member_relationship_status: "not_joined",
      member_relationship_label: memberRelationshipStatusLabel("not_joined"),
      can_request_join: true,
    }));
  }

  return {
    activeMinistries,
    pendingRequests,
    closedRequests,
    interestMatches,
    ministryInterest: ministryInterest || "",
  };
}

function registerMemberPortalRoutes(router) {
  router.use("/member", requireChurchBranchHost);

  router.get("/member/dashboard", requireVerifiedMemberSession, ensureMemberAccountActive, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const org = req.churchContext.organization;
      const pool = getPgPool();
      const [branchAnnouncements, hqBroadcasts] = await Promise.all([
        announcementsRepo.listVisibleAnnouncementsForMember(pool, branch.id, { limit: 6 }),
        hqBroadcastsRepo.listVisibleBroadcastsForBranch(pool, org.id, branch.id, {
          audiences: MEMBER_HQ_AUDIENCES,
          limit: 6,
        }),
      ]);
      const announcements = mergeAnnouncementFeed(branchAnnouncements, hqBroadcasts, 3);
      const events = await eventsRepo.listUpcomingEventsForBranch(pool, branch.id, {
        limit: 3,
        includeRecentDays: 7,
      });
      const profile = await membersRepo.findMemberByIdForBranch(
        pool,
        req.churchMember.member_id,
        branch.id
      );
      const myMinistriesView = await buildMyMinistriesView(
        pool,
        req.churchMember.member_id,
        branch.id,
        profile ? profile.ministry_interest : ""
      );
      const upcomingDuties = await dutyRosterRepo.listDutiesForMember(
        pool,
        req.churchMember.member_id,
        branch.id,
        { timeframe: "upcoming", limit: 3 }
      );
      return res.render(
        "church/member/dashboard",
        memberPortalLocals(req, {
          announcements,
          events,
          myMinistries: myMinistriesView.activeMinistries.slice(0, 3),
          memberRelationshipStatusLabel,
          ministryInterest: profile ? profile.ministry_interest : "",
          upcomingDuties,
          formatDutyDate,
          notice: flashFromQuery(req),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/member/profile", requireVerifiedMemberSession, ensureMemberAccountActive, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const profile = await membersRepo.findMemberByIdForBranch(
        pool,
        req.churchMember.member_id,
        req.churchContext.branch.id
      );
      return res.render(
        "church/member/profile",
        memberPortalLocals(req, {
          profile,
          error: null,
          ageGroupOptions: AGE_GROUP_OPTIONS,
          ministryInterestOptions: MINISTRY_INTEREST_OPTIONS,
          notice: flashFromQuery(req),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/member/account", requireVerifiedMemberSession, ensureMemberAccountActive, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const account = await loadAccountView(pool, req.churchMember.member_id, req.churchContext.branch.id);
      return res.render(
        "church/member/account",
        memberPortalLocals(req, {
          account,
          error: null,
          notice: flashFromQuery(req),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.post(
    "/member/account/change-password",
    requireVerifiedMemberSession,
    ensureMemberAccountActive,
    async (req, res, next) => {
      try {
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const memberId = req.churchMember.member_id;
        const validation = validateChangePasswordBody(req.body || {});

        if (!validation.ok) {
          const account = await loadAccountView(pool, memberId, branch.id);
          return res.status(400).render(
            "church/member/account",
            memberPortalLocals(req, {
              account,
              error: validation.error,
              notice: null,
            })
          );
        }

        const memberRow = await membersRepo.findMemberByIdForPasswordChange(pool, memberId, branch.id);
        if (!memberRow || memberRow.status !== "verified") {
          return res.redirect("/login");
        }

        const currentOk = await verifyMemberPassword(validation.current_password, memberRow.password_hash);
        if (!currentOk) {
          const account = buildAccountView(memberRow);
          return res.status(400).render(
            "church/member/account",
            memberPortalLocals(req, {
              account,
              error: "Current password is incorrect.",
              notice: null,
            })
          );
        }

        if (validation.current_password === validation.new_password) {
          const account = buildAccountView(memberRow);
          return res.status(400).render(
            "church/member/account",
            memberPortalLocals(req, {
              account,
              error: "New password must be different from your current password.",
              notice: null,
            })
          );
        }

        const passwordHash = await hashMemberPassword(validation.new_password);
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const updated = await membersRepo.updateMemberPasswordSelfService(
            client,
            memberId,
            branch.id,
            passwordHash
          );
          if (!updated) {
            throw Object.assign(new Error("Unable to update password."), { code: "UPDATE_FAILED" });
          }
          await membersRepo.recordMemberPasswordChangeAudit(client, {
            organizationId: branch.organization_id || memberRow.organization_id,
            branchId: branch.id,
            memberId,
          });
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        } finally {
          client.release();
        }

        return res.redirect(303, "/member/account?notice=password_changed");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post("/member/profile", requireVerifiedMemberSession, ensureMemberAccountActive, async (req, res, next) => {
    try {
      const validation = validateProfileBody(req.body || {});
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const memberId = req.churchMember.member_id;

      if (!validation.ok) {
        return res.status(400).render(
          "church/member/profile",
          memberPortalLocals(req, {
            profile: { ...validation.form, id: memberId },
            error: validation.error,
            ageGroupOptions: AGE_GROUP_OPTIONS,
            ministryInterestOptions: MINISTRY_INTEREST_OPTIONS,
            notice: null,
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
          "church/member/profile",
          memberPortalLocals(req, {
            profile: { ...validation.form, id: memberId },
            error: "Another member already uses this email or phone at this branch.",
            ageGroupOptions: AGE_GROUP_OPTIONS,
            ministryInterestOptions: MINISTRY_INTEREST_OPTIONS,
            notice: null,
          })
        );
      }

      const updated = await membersRepo.updateMemberProfileForMember(
        pool,
        memberId,
        branch.id,
        validation.data
      );
      if (!updated) {
        return res.redirect("/login");
      }

      setChurchMemberSession(req, {
        member_id: updated.id,
        organization_id: updated.organization_id,
        branch_id: updated.branch_id,
        status: updated.status,
        full_name: updated.full_name,
      });

      await recordMemberAudit(pool, req, "member_profile_updated", "member", updated.id, {});

      return res.redirect(303, "/member/profile?notice=profile_saved");
    } catch (e) {
      return next(e);
    }
  });

  router.get("/member/announcements", requireVerifiedMemberSession, ensureMemberAccountActive, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const org = req.churchContext.organization;
      const memberId = req.churchMember.member_id;
      const pool = getPgPool();
      const listFilters = parseMemberAnnouncementFilters(req.query || {});
      const listed = await memberAnnouncementFeedRepo.listVisibleMemberFeed(pool, {
        organizationId: org.id,
        branchId: branch.id,
        memberId,
        audiences: MEMBER_HQ_AUDIENCES,
        ...listFilters,
      });
      const withFiles = await attachFilesToFeedItems(pool, org.id, branch.id, listed.rows);
      const sections = partitionAnnouncementFeed(withFiles);
      const unreadCount = await memberAnnouncementFeedRepo.countUnreadVisibleMemberFeed(pool, {
        organizationId: org.id,
        branchId: branch.id,
        memberId,
        audiences: MEMBER_HQ_AUDIENCES,
        q: listFilters.q,
        source: listFilters.source,
        priority: listFilters.priority,
        category: listFilters.category,
        pinned_only: listFilters.pinned_only,
      });

      // List view marks seen only for the current page — full read happens on detail open.
      await feedItemReadsRepo.markFeedItemsSeen(pool, {
        organization_id: org.id,
        branch_id: branch.id,
        member_id: memberId,
        items: withFiles.map((item) => ({
          source_type: item.source === "hq" ? "hq_broadcast" : "announcement",
          source_id: item.id,
        })),
      });

      return res.render(
        "church/member/announcements",
        memberPortalLocals(req, {
          announcements: sections.list,
          featuredAnnouncements: sections.featured,
          pinnedAnnouncements: sections.pinned,
          remainingAnnouncements: sections.remaining,
          unreadCount,
          listFilters: {
            ...listFilters,
            page: listed.page,
          },
          page: listed.page,
          totalPages: listed.totalPages,
          totalCount: listed.total,
          buildMemberAnnouncementsQuery,
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get(
    "/member/announcements/:source/:announcementId",
    requireVerifiedMemberSession,
    ensureMemberAccountActive,
    async (req, res, next) => {
      try {
        const source = String(req.params.source || "").trim();
        const announcementId = Number(req.params.announcementId);
        if (!["hq", "branch"].includes(source) || !Number.isFinite(announcementId) || announcementId <= 0) {
          return res.status(404).type("text").send("Announcement not found.");
        }
        const branch = req.churchContext.branch;
        const org = req.churchContext.organization;
        const memberId = req.churchMember.member_id;
        const pool = getPgPool();

        let item = null;
        if (source === "hq") {
          item = await hqBroadcastsRepo.findVisibleBroadcastForBranch(pool, org.id, branch.id, announcementId, {
            audiences: MEMBER_HQ_AUDIENCES,
          });
        } else {
          item = await announcementsRepo.findVisibleAnnouncementForMember(pool, branch.id, announcementId);
        }
        if (!item) {
          return res.status(404).type("text").send("Announcement not found.");
        }

        const [enriched] = await attachFilesToFeedItems(pool, org.id, branch.id, [{ ...item, source }]);
        await feedItemReadsRepo.markFeedItemRead(pool, {
          organization_id: org.id,
          branch_id: branch.id,
          member_id: memberId,
          source_type: source === "hq" ? "hq_broadcast" : "announcement",
          source_id: announcementId,
        });

        return res.render(
          "church/member/announcement_detail",
          memberPortalLocals(req, {
            announcement: { ...enriched, is_read: true },
            shellTitle: "Announcement",
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/member/announcements/:source/:announcementId/attachments/:attachmentId/download",
    requireVerifiedMemberSession,
    ensureMemberAccountActive,
    async (req, res, next) => {
      try {
        const source = String(req.params.source || "").trim();
        const announcementId = Number(req.params.announcementId);
        const attachmentId = Number(req.params.attachmentId);
        if (
          !["hq", "branch"].includes(source) ||
          !Number.isFinite(announcementId) ||
          !Number.isFinite(attachmentId)
        ) {
          return res.status(404).type("text").send("Attachment not found.");
        }
        const branch = req.churchContext.branch;
        const org = req.churchContext.organization;
        const pool = getPgPool();

        let visible = null;
        if (source === "hq") {
          visible = await hqBroadcastsRepo.findVisibleBroadcastForBranch(pool, org.id, branch.id, announcementId, {
            audiences: MEMBER_HQ_AUDIENCES,
          });
        } else {
          visible = await announcementsRepo.findVisibleAnnouncementForMember(pool, branch.id, announcementId);
        }
        if (!visible) return res.status(404).type("text").send("Attachment not found.");

        let attachment = null;
        let abs = null;
        if (source === "hq") {
          attachment = await broadcastAttachmentsRepo.findBroadcastAttachmentById(pool, attachmentId, org.id);
          if (!attachment || Number(attachment.broadcast_id) !== announcementId) {
            return res.status(404).type("text").send("Attachment not found.");
          }
          abs = absolutePathForStoredFilename(attachment.stored_filename);
          await broadcastAttachmentsRepo.incrementBroadcastAttachmentDownloadCount(pool, attachmentId, org.id);
        } else {
          attachment = await broadcastAttachmentsRepo.findAnnouncementAttachmentById(pool, attachmentId, branch.id);
          if (!attachment || Number(attachment.announcement_id) !== announcementId) {
            return res.status(404).type("text").send("Attachment not found.");
          }
          abs = absolutePathForAnnouncementStoredFilename(attachment.stored_filename);
        }
        if (!abs) return res.status(404).type("text").send("Attachment not found.");
        return res.download(abs, attachment.original_filename);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get("/member/events", requireVerifiedMemberSession, ensureMemberAccountActive, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const events = await eventsRepo.listUpcomingEventsForBranch(pool, req.churchContext.branch.id, {
        includeRecentDays: 30,
      });
      return res.render("church/member/events", memberPortalLocals(req, { events }));
    } catch (e) {
      return next(e);
    }
  });

  router.get("/member/ministries", requireVerifiedMemberSession, ensureMemberAccountActive, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const branch = req.churchContext.branch;
      const memberId = req.churchMember.member_id;
      const ministries = await ministriesRepo.listVisibleMinistriesForMember(pool, branch.id);
      const enriched = await enrichMinistriesForMember(pool, memberId, branch.id, ministries);
      return res.render(
        "church/member/ministries",
        memberPortalLocals(req, {
          ministries: enriched,
          visibilityLabel,
          memberRelationshipStatusLabel,
          notice: flashFromQuery(req),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/member/ministries/:ministryId", requireVerifiedMemberSession, ensureMemberAccountActive, async (req, res, next) => {
    try {
      const ministryId = Number(req.params.ministryId);
      if (!Number.isFinite(ministryId) || ministryId <= 0) {
        return res.status(404).type("text").send("Ministry not found.");
      }
      const pool = getPgPool();
      const branch = req.churchContext.branch;
      const memberId = req.churchMember.member_id;
      const ministry = await ministriesRepo.findMinistryByIdForBranch(pool, ministryId, branch.id);
      if (!isMinistryVisibleToMember(ministry)) {
        return res.status(404).type("text").send("Ministry not found.");
      }
      const relationship = await loadMemberMinistryRelationship(pool, memberId, branch.id, ministryId);
      return res.render(
        "church/member/ministry_detail",
        memberPortalLocals(req, {
          ministry,
          relationship,
          visibilityLabel,
          formatMinistrySchedule,
          memberRelationshipStatusLabel,
          joinRequestStatusLabel,
          error: null,
          form: { message: relationship.openRequest ? relationship.openRequest.message || "" : "" },
          notice: flashFromQuery(req),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.post(
    "/member/ministries/:ministryId/request-join",
    requireVerifiedMemberSession, ensureMemberAccountActive,
    async (req, res, next) => {
      try {
        const ministryId = Number(req.params.ministryId);
        if (!Number.isFinite(ministryId) || ministryId <= 0) {
          return res.status(404).type("text").send("Ministry not found.");
        }
        const validation = validateJoinRequestBody(req.body || {});
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const memberId = req.churchMember.member_id;
        const ministry = await ministriesRepo.findMinistryByIdForBranch(pool, ministryId, branch.id);
        if (!isMinistryVisibleToMember(ministry)) {
          return res.status(404).type("text").send("Ministry not found.");
        }

        const relationship = await loadMemberMinistryRelationship(pool, memberId, branch.id, ministryId);
        const renderError = async (message) =>
          res.status(400).render(
            "church/member/ministry_detail",
            memberPortalLocals(req, {
              ministry,
              relationship,
              visibilityLabel,
              formatMinistrySchedule,
              memberRelationshipStatusLabel,
              joinRequestStatusLabel,
              error: message,
              form: validation.form,
              notice: null,
            })
          );

        if (relationship.activeMembership) {
          return renderError("You are already an active member of this ministry.");
        }

        if (relationship.openRequest && relationship.openRequest.status === "submitted") {
          return renderError("You already have a pending join request for this ministry.");
        }

        if (!relationship.canRequestJoin && relationship.openRequest?.status !== "more_info_needed") {
          return renderError("You cannot submit a join request for this ministry right now.");
        }

        let created = null;
        if (relationship.openRequest && relationship.openRequest.status === "more_info_needed") {
          created = await ministryJoinRequestsRepo.resubmitJoinRequestForMember(
            pool,
            relationship.openRequest.id,
            memberId,
            branch.id,
            validation.data.message
          );
        } else {
          created = await ministryJoinRequestsRepo.createJoinRequestForMember(pool, {
            organization_id: org.id,
            branch_id: branch.id,
            member_id: memberId,
            ministry_id: ministryId,
            message: validation.data.message,
          });
        }

        await recordMemberAudit(
          pool,
          req,
          "ministry_join_request_submitted",
          "ministry_join_request",
          created.id,
          {
            ministry_id: ministryId,
            member_id: memberId,
            status: created.status,
          }
        );

        return res.redirect(303, `/member/ministries/${ministryId}?notice=join_request_submitted`);
      } catch (e) {
        if (e.code === "23505") {
          return res.redirect(303, `/member/ministries/${req.params.ministryId}?notice=join_request_submitted`);
        }
        return next(e);
      }
    }
  );

  router.get("/member/my-ministries", requireVerifiedMemberSession, ensureMemberAccountActive, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const profile = await membersRepo.findMemberByIdForBranch(
        pool,
        req.churchMember.member_id,
        branch.id
      );
      const myMinistriesView = await buildMyMinistriesView(
        pool,
        req.churchMember.member_id,
        branch.id,
        profile ? profile.ministry_interest : ""
      );
      return res.render(
        "church/member/my_ministries",
        memberPortalLocals(req, {
          activeMinistries: myMinistriesView.activeMinistries,
          pendingRequests: myMinistriesView.pendingRequests,
          closedRequests: myMinistriesView.closedRequests,
          interestMatches: myMinistriesView.interestMatches,
          ministryInterest: myMinistriesView.ministryInterest,
          memberRelationshipStatusLabel,
          joinRequestStatusLabel,
          visibilityLabel,
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/member/my-duties", requireVerifiedMemberSession, ensureMemberAccountActive, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const memberId = req.churchMember.member_id;
      const [upcomingDuties, pastDuties] = await Promise.all([
        dutyRosterRepo.listDutiesForMember(pool, memberId, branch.id, { timeframe: "upcoming" }),
        dutyRosterRepo.listDutiesForMember(pool, memberId, branch.id, { timeframe: "past" }),
      ]);
      return res.render(
        "church/member/my_duties",
        memberPortalLocals(req, {
          upcomingDuties,
          pastDuties,
          formatDutyDate,
          dutyStatusLabel,
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/member/giving", requireVerifiedMemberSession, ensureMemberAccountActive, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const publishedGiving = await givingSettingsRepo.getPublishedGivingSettingsForBranch(pool, branch.id);
      const givingDisplay = prepareGivingDisplay(publishedGiving, null, {
        audience: "member",
        churchName: branch.name,
      });
      return res.render("church/member/giving", memberPortalLocals(req, { givingDisplay }));
    } catch (e) {
      return next(e);
    }
  });

  router.get("/member/resources", requireVerifiedMemberSession, ensureMemberAccountActive, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const resourcesRepo = require("../../db/pg/church/resourcesRepo");
      const resources = await resourcesRepo.listPublishedResourcesForBranch(pool, branch.id, {
        resource_type: "study",
        visibility: "members",
      });
      return res.render("church/member/resources", memberPortalLocals(req, { resources }));
    } catch (e) {
      return next(e);
    }
  });

  router.get("/member/forms", requireVerifiedMemberSession, ensureMemberAccountActive, async (req, res, next) => {
    try {
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const resourcesRepo = require("../../db/pg/church/resourcesRepo");
      const [documents, forms] = await Promise.all([
        resourcesRepo.listPublishedResourcesForBranch(pool, branch.id, {
          resource_type: "document",
          visibility: "members",
        }),
        resourcesRepo.listPublishedResourcesForBranch(pool, branch.id, {
          resource_type: "form",
          visibility: "members",
        }),
      ]);
      return res.render(
        "church/member/forms",
        memberPortalLocals(req, { documents, forms, formItems: [...forms, ...documents] })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/member/prayer-request", requireVerifiedMemberSession, ensureMemberAccountActive, (req, res) => {
    return res.render(
      "church/member/prayer_request",
      memberPortalLocals(req, {
        error: null,
        form: {},
        privacyLevels: PRAYER_PRIVACY_LEVELS,
        urgencyLevels: PRAYER_URGENCY_LEVELS,
        notice: flashFromQuery(req),
      })
    );
  });

  router.post("/member/prayer-request", requireVerifiedMemberSession, ensureMemberAccountActive, async (req, res, next) => {
    try {
      const validation = validatePrayerRequestBody(req.body || {});
      if (!validation.ok) {
        return res.status(400).render(
          "church/member/prayer_request",
          memberPortalLocals(req, {
            error: validation.error,
            form: validation.form,
            privacyLevels: PRAYER_PRIVACY_LEVELS,
            urgencyLevels: PRAYER_URGENCY_LEVELS,
            notice: null,
          })
        );
      }

      const org = req.churchContext.organization;
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const created = await prayerRequestsRepo.createPrayerRequest(pool, {
        organization_id: org.id,
        branch_id: branch.id,
        member_id: req.churchMember.member_id,
        ...validation.data,
      });

      await recordMemberAudit(pool, req, "prayer_request_submitted", "prayer_request", created.id, {
        privacy_level: created.privacy_level,
      });

      return res.redirect(303, "/member/prayer-request?notice=prayer_submitted");
    } catch (e) {
      return next(e);
    }
  });

  router.get("/member/requests", requireVerifiedMemberSession, ensureMemberAccountActive, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const requests = await memberRequestsRepo.listMemberRequestsForMember(
        pool,
        req.churchMember.member_id,
        req.churchContext.branch.id
      );
      return res.render(
        "church/member/requests",
        memberPortalLocals(req, {
          requests,
          requestStatusLabel,
          notice: flashFromQuery(req),
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/member/requests/new", requireVerifiedMemberSession, ensureMemberAccountActive, (req, res) => {
    return res.render(
      "church/member/request_new",
      memberPortalLocals(req, {
        error: null,
        form: {},
        requestTypes: REQUEST_TYPES,
      })
    );
  });

  router.post("/member/requests", requireVerifiedMemberSession, ensureMemberAccountActive, async (req, res, next) => {
    try {
      const validation = validateMemberRequestBody(req.body || {});
      if (!validation.ok) {
        return res.status(400).render(
          "church/member/request_new",
          memberPortalLocals(req, {
            error: validation.error,
            form: validation.form,
            requestTypes: REQUEST_TYPES,
          })
        );
      }

      const org = req.churchContext.organization;
      const branch = req.churchContext.branch;
      const pool = getPgPool();
      const created = await memberRequestsRepo.createMemberRequest(pool, {
        organization_id: org.id,
        branch_id: branch.id,
        member_id: req.churchMember.member_id,
        ...validation.data,
      });

      await recordMemberAudit(pool, req, "member_request_submitted", "member_request", created.id, {
        request_type: created.request_type,
      });

      return res.redirect(303, `/member/requests/${created.id}?notice=request_submitted`);
    } catch (e) {
      return next(e);
    }
  });

  router.get("/member/requests/:requestId", requireVerifiedMemberSession, ensureMemberAccountActive, async (req, res, next) => {
    try {
      const requestId = Number(req.params.requestId);
      if (!Number.isFinite(requestId) || requestId <= 0) {
        return res.status(404).type("text").send("Request not found.");
      }
      const pool = getPgPool();
      const item = await memberRequestsRepo.findMemberRequestByIdForMember(
        pool,
        requestId,
        req.churchMember.member_id,
        req.churchContext.branch.id
      );
      if (!item) {
        return res.status(404).type("text").send("Request not found.");
      }
      return res.render(
        "church/member/request_detail",
        memberPortalLocals(req, {
          requestItem: item,
          requestStatusLabel,
          notice: flashFromQuery(req),
        })
      );
    } catch (e) {
      return next(e);
    }
  });
}

module.exports = registerMemberPortalRoutes;
