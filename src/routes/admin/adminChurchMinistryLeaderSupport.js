"use strict";

const bcrypt = require("bcryptjs");
const { requireSuperAdmin } = require("../../auth");
const { getPgPool } = require("../../db/pg");
const branchesRepo = require("../../db/pg/church/branchesRepo");
const platformMinistryLeaderSupportRepo = require("../../db/pg/church/platformMinistryLeaderSupportRepo");
const platformSupportNotesRepo = require("../../db/pg/church/platformSupportNotesRepo");
const { getLoginProtectionSummaryForAccount } = require("../../db/pg/church/loginAttemptsRepo");
const { churchPublicHost } = require("../../church/platformProvisioningValidation");
const { parseMinistryLeaderSupportParams } = require("../../church/platformMinistryLeaderSupportValidation");
const {
  validateResetMinistryLeaderPasswordBody,
  validateDeactivateMinistryLeaderBody,
  validateActivateMinistryLeaderBody,
  validateUnlockMinistryLeaderLoginBody,
} = require("../../church/platformMinistryLeaderSupportActionsValidation");

function formatDate(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { hour12: false });
}

function platformAdminId(req) {
  return req.session.adminUser && req.session.adminUser.id ? req.session.adminUser.id : null;
}

function ministryLeaderSupportNotice(req) {
  const notice = String(req.query.notice || "").trim();
  const map = {
    password_reset: "Ministry leader password reset successfully.",
    activated: "Ministry leader activated successfully.",
    already_active: "Ministry leader is already active.",
    deactivated: "Ministry leader deactivated successfully.",
    already_inactive: "Ministry leader is already inactive.",
    login_unlocked: "Ministry leader login unlocked successfully.",
    support_note_added: "Platform support note added.",
  };
  return map[notice] || null;
}

function supportNoteNotice(req) {
  if (String(req.query.notice || "").trim() === "support_note_added") {
    return "Platform support note added.";
  }
  return null;
}

function supportNoteError(req) {
  const raw = String(req.query.support_note_error || "").trim();
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).slice(0, 500);
  } catch {
    return raw.slice(0, 500);
  }
}

async function supportNotesPanelData(pool, leaderId, returnTo) {
  const supportNotes = await platformSupportNotesRepo.listSupportNotesForEntity(
    pool,
    "ministry_leader",
    leaderId,
    { limit: 20 }
  );
  return {
    supportNotes,
    supportNoteEntityType: "ministry_leader",
    supportNoteEntityId: leaderId,
    supportNoteReturnTo: returnTo,
  };
}

async function renderMinistryLeaderSupportDetail(req, res, extra = {}) {
  const parsed = parseMinistryLeaderSupportParams(req.params, req.query);
  if (!parsed.ok) {
    return res.status(404).type("text").send("Not found");
  }

  const pool = getPgPool();
  const detail = await platformMinistryLeaderSupportRepo.findMinistryLeaderSupportDetailById(
    pool,
    parsed.data.leaderId,
    { branchId: parsed.data.branchId }
  );
  if (!detail) {
    return res.status(404).type("text").send("Not found");
  }

  const hostSlug = branchesRepo.branchHostSlug(detail.branch);
  const leaderReturnTo =
    parsed.data.returnTo || `/admin/church/ministry-leaders/${parsed.data.leaderId}`;
  const notesPanel = await supportNotesPanelData(pool, parsed.data.leaderId, leaderReturnTo);

  return res.status(extra.statusCode || 200).render("admin/church/ministry_leader_support_detail", {
    detail,
    leader: detail.leader,
    organization: detail.organization,
    branch: detail.branch,
    ministry: detail.ministry,
    loginContext: detail.loginContext,
    loginAttempts: detail.loginAttempts || [],
    activitySummary: detail.activitySummary || {},
    loginProtection: getLoginProtectionSummaryForAccount(detail.leader),
    branchHostSlug: hostSlug,
    returnTo: parsed.data.returnTo,
    flashNotice: ministryLeaderSupportNotice(req) || extra.flashNotice || null,
    resetError: extra.resetError || null,
    statusActionError: extra.statusActionError || null,
    unlockError: extra.unlockError || null,
    supportNoteNotice: supportNoteNotice(req) || extra.supportNoteNotice || null,
    supportNoteError: supportNoteError(req) || extra.supportNoteError || null,
    ...notesPanel,
    formatDate,
    formatDateTime,
    churchPublicHost,
    activeNav: "church_platform_search",
  });
}

function parseLeaderId(req) {
  const leaderId = Number(req.params.leaderId);
  if (!Number.isFinite(leaderId) || leaderId <= 0) return null;
  return leaderId;
}

function parseOptionalBranchId(req) {
  if (req.params.branchId == null) return null;
  const branchId = Number(req.params.branchId);
  if (!Number.isFinite(branchId) || branchId <= 0) return null;
  return branchId;
}

function leaderDetailRedirect(leaderId, notice) {
  return `/admin/church/ministry-leaders/${leaderId}?notice=${notice}`;
}

async function assertLeaderForAction(req, res) {
  const leaderId = parseLeaderId(req);
  if (!leaderId) {
    res.status(404).type("text").send("Not found");
    return null;
  }
  const branchId = parseOptionalBranchId(req);
  const pool = getPgPool();
  const leader = await platformMinistryLeaderSupportRepo.findMinistryLeaderForPlatformAction(pool, leaderId);
  if (!leader) {
    res.status(404).type("text").send("Not found");
    return null;
  }
  if (branchId != null && Number(leader.branch_id) !== branchId) {
    res.status(404).type("text").send("Not found");
    return null;
  }
  return { pool, leaderId, leader };
}

function registerLeaderSupportActionRoutes(router, pathPrefix) {
  router.post(`${pathPrefix}/reset-password`, requireSuperAdmin, async (req, res, next) => {
    try {
      const ctx = await assertLeaderForAction(req, res);
      if (!ctx) return;

      const validation = validateResetMinistryLeaderPasswordBody(req.body);
      if (!validation.ok) {
        return renderMinistryLeaderSupportDetail(req, res, { statusCode: 400, resetError: validation.error });
      }

      const passwordHash = await bcrypt.hash(validation.new_password, 12);
      await platformMinistryLeaderSupportRepo.resetMinistryLeaderPasswordForPlatform(
        ctx.pool,
        ctx.leaderId,
        passwordHash,
        platformAdminId(req)
      );

      return res.redirect(leaderDetailRedirect(ctx.leaderId, "password_reset"));
    } catch (e) {
      return next(e);
    }
  });

  router.post(`${pathPrefix}/activate`, requireSuperAdmin, async (req, res, next) => {
    try {
      const ctx = await assertLeaderForAction(req, res);
      if (!ctx) return;

      const validation = validateActivateMinistryLeaderBody(req.body);
      if (!validation.ok) {
        return renderMinistryLeaderSupportDetail(req, res, { statusCode: 400, statusActionError: validation.error });
      }

      const result = await platformMinistryLeaderSupportRepo.activateMinistryLeaderForPlatform(
        ctx.pool,
        ctx.leaderId,
        validation.reason,
        platformAdminId(req)
      );
      const notice = result.alreadyActive ? "already_active" : "activated";
      return res.redirect(leaderDetailRedirect(ctx.leaderId, notice));
    } catch (e) {
      if (e && e.code === "FOUNDATION_ADMIN_LIMIT") {
        return renderMinistryLeaderSupportDetail(req, res, { statusCode: 400, statusActionError: e.message });
      }
      return next(e);
    }
  });

  router.post(`${pathPrefix}/deactivate`, requireSuperAdmin, async (req, res, next) => {
    try {
      const ctx = await assertLeaderForAction(req, res);
      if (!ctx) return;

      const validation = validateDeactivateMinistryLeaderBody(req.body);
      if (!validation.ok) {
        return renderMinistryLeaderSupportDetail(req, res, { statusCode: 400, statusActionError: validation.error });
      }

      const result = await platformMinistryLeaderSupportRepo.deactivateMinistryLeaderForPlatform(
        ctx.pool,
        ctx.leaderId,
        validation.reason,
        platformAdminId(req)
      );
      const notice = result.alreadyInactive ? "already_inactive" : "deactivated";
      return res.redirect(leaderDetailRedirect(ctx.leaderId, notice));
    } catch (e) {
      return next(e);
    }
  });

  router.post(`${pathPrefix}/unlock-login`, requireSuperAdmin, async (req, res, next) => {
    try {
      const ctx = await assertLeaderForAction(req, res);
      if (!ctx) return;

      const validation = validateUnlockMinistryLeaderLoginBody(req.body);
      if (!validation.ok) {
        return renderMinistryLeaderSupportDetail(req, res, { statusCode: 400, unlockError: validation.error });
      }

      await platformMinistryLeaderSupportRepo.unlockMinistryLeaderLoginForPlatform(
        ctx.pool,
        ctx.leaderId,
        validation.reason,
        platformAdminId(req)
      );

      return res.redirect(leaderDetailRedirect(ctx.leaderId, "login_unlocked"));
    } catch (e) {
      return next(e);
    }
  });
}

module.exports = function registerAdminChurchMinistryLeaderSupportRoutes(router) {
  router.get("/church/ministry-leaders/:leaderId", requireSuperAdmin, async (req, res, next) => {
    try {
      return renderMinistryLeaderSupportDetail(req, res);
    } catch (e) {
      return next(e);
    }
  });

  router.get(
    "/church/branches/:branchId/ministry-leaders/:leaderId",
    requireSuperAdmin,
    async (req, res, next) => {
      try {
        return renderMinistryLeaderSupportDetail(req, res);
      } catch (e) {
        return next(e);
      }
    }
  );

  registerLeaderSupportActionRoutes(router, "/church/ministry-leaders/:leaderId");
  registerLeaderSupportActionRoutes(
    router,
    "/church/branches/:branchId/ministry-leaders/:leaderId"
  );
};
