"use strict";

const { ORG_BRANCH_STATUSES, ORG_STATUSES } = require("./platformStatusValidation");
const { normalizeHostFromRequest } = require("./host");

function isOperationalStatus(status) {
  return status === "active";
}

/** Admins may sign in and recover accounts while Foundation-dormant (not suspended). */
function isAdminAccessibleOrgStatus(status) {
  return status === "active" || status === "dormant";
}

function isDormantStatus(status) {
  return status === "dormant";
}

/**
 * @param {{ kind?: string, organization?: { status?: string } | null, branch?: { status?: string, name?: string } | null } | null} churchContext
 */
function getChurchAccessBlock(churchContext) {
  if (!churchContext || churchContext.kind !== "branch") return null;
  const org = churchContext.organization;
  const branch = churchContext.branch;
  if (!org || !branch) return { code: "not_found" };
  if (isDormantStatus(org.status)) {
    return { code: "organization_dormant", status: org.status };
  }
  if (!isOperationalStatus(org.status)) {
    return { code: "organization", status: org.status };
  }
  if (!isOperationalStatus(branch.status)) {
    return { code: "branch", status: branch.status };
  }
  return null;
}

async function resolveOperationalTenantStatus(req, opts = {}) {
  if (req._churchOperationalStatus && !opts.forceRefresh) {
    return req._churchOperationalStatus;
  }

  const ctx = req.churchContext;
  let organization = ctx && ctx.organization ? ctx.organization : null;
  let branch = ctx && ctx.branch ? ctx.branch : null;

  if (opts.forceRefresh && organization && organization.id != null) {
    try {
      const { getPgPool } = require("../db/pg");
      const organizationsRepo = require("../db/pg/church/organizationsRepo");
      const hqBranchesRepo = require("../db/pg/church/hqBranchesRepo");
      const pool = getPgPool();
      if (pool) {
        const freshOrg = await organizationsRepo.findOrganizationById(pool, organization.id);
        if (freshOrg) {
          organization = freshOrg;
          if (ctx) ctx.organization = freshOrg;
        }
        if (branch && branch.id != null) {
          const freshBranch = await hqBranchesRepo.findBranchByIdForOrganization(
            pool,
            branch.id,
            organization.id
          );
          if (freshBranch) {
            branch = freshBranch;
            if (ctx) ctx.branch = freshBranch;
          }
        }
      }
    } catch {
      /* fall through to context values */
    }
  }

  const orgStatus = organization && organization.status;
  const result = {
    organization,
    branch,
    orgActive: isOperationalStatus(orgStatus),
    orgDormant: isDormantStatus(orgStatus),
    orgAdminAccessible: isAdminAccessibleOrgStatus(orgStatus),
    branchActive: isOperationalStatus(branch && branch.status),
  };
  req._churchOperationalStatus = result;
  return result;
}

function getHqStatusBanner(churchContext) {
  if (!churchContext || churchContext.kind !== "branch") return null;
  const org = churchContext.organization;
  const branch = churchContext.branch;
  if (!org || !branch) return null;

  const banners = [];
  if (isDormantStatus(org.status)) {
    banners.push({
      level: "warning",
      message:
        "This organisation is dormant due to Foundation inactivity. The public site is unpublished. HQ and branch administrators may sign in to reactivate. Member access is paused. Data is preserved; deletion is not enabled.",
    });
  } else if (!isOperationalStatus(org.status)) {
    banners.push({
      level: org.status === "archived" ? "danger" : "warning",
      message:
        org.status === "suspended"
          ? "This organization is suspended. Public, member, leader, branch-admin, and HQ access on tenant hosts are blocked. Platform administrators use the dedicated Admin Console login."
          : "This organization is archived. Operational access is limited.",
    });
  }
  if (!isOperationalStatus(branch.status)) {
    banners.push({
      level: branch.status === "archived" ? "danger" : "warning",
      message:
        branch.status === "suspended"
          ? `Branch "${branch.name}" is suspended. Public and branch-admin access on this host is blocked.`
          : `Branch "${branch.name}" is archived.`,
    });
  }
  if (banners.length === 0) return null;
  return { banners };
}

function clearAllChurchPortalSessions(req) {
  try {
    require("./memberAuth").clearChurchMemberSession(req);
    require("./branchAdminAuth").clearChurchBranchAdminSession(req);
    require("./leaderAuth").clearChurchLeaderSession(req);
    require("./hqAuth").clearChurchHqAdminSession(req);
    require("./tenantLoginSession").clearPortalChoice(req);
  } catch {
    /* optional in tests */
  }
}

function clearMemberAndLeaderSessions(req) {
  try {
    require("./memberAuth").clearChurchMemberSession(req);
    require("./leaderAuth").clearChurchLeaderSession(req);
  } catch {
    /* optional */
  }
}

/** @deprecated use clearAllChurchPortalSessions */
function clearOperationalSessions(req) {
  clearAllChurchPortalSessions(req);
}

function renderChurchUnavailable(req, res) {
  const branch = req.churchContext && req.churchContext.branch;
  const org = req.churchContext && req.churchContext.organization;
  const churchName = (branch && branch.name) || (org && org.name) || "Church";
  return res.status(503).render("church/public/unavailable", {
    churchName,
    pageTitle: churchName,
  });
}

function renderChurchNotFound(req, res) {
  const ctx = req.churchContext || {};
  const requestedSlug = ctx.hostSlug || ctx.orgSlug || null;
  return res.status(404).render("church/public/not_found", {
    pageTitle: "Church not found",
    requestedSlug,
    requestedHost: ctx.host || normalizeHostFromRequest(req),
  });
}

function isHqPath(path) {
  return String(path || "").startsWith("/hq");
}

function isBranchAdminPath(path) {
  return String(path || "").startsWith("/branch");
}

function isPlatformAdminPath(path) {
  return String(path || "").startsWith("/admin");
}

function isChurchLogoutPath(path) {
  const p = String(path || "");
  return (
    p === "/logout" ||
    p === "/hq/logout" ||
    p === "/leader/logout" ||
    p === "/branch/logout"
  );
}

function isHqPublicAuthPath(path) {
  const p = String(path || "");
  return p === "/hq/login" || p.startsWith("/hq/forgot-password");
}

function isBranchPublicAuthPath(path) {
  const p = String(path || "");
  return p === "/branch/login" || p.startsWith("/branch/forgot-password");
}

function isAccountRecoveryPath(path) {
  const p = String(path || "");
  return (
    isHqPublicAuthPath(p) ||
    isBranchPublicAuthPath(p) ||
    p === "/forgot-password" ||
    p.startsWith("/forgot-password") ||
    p === "/reset-password" ||
    p.startsWith("/reset-password")
  );
}

function hasAnyChurchPortalSession(req) {
  try {
    if (require("./memberAuth").getChurchMemberSession(req)) return true;
    if (require("./leaderAuth").getChurchLeaderSession(req)) return true;
    if (require("./branchAdminAuth").getChurchBranchAdminSession(req)) return true;
    if (require("./hqAuth").getChurchHqAdminSession(req)) return true;
  } catch {
    /* optional */
  }
  return false;
}

function hasAdminPortalSession(req) {
  try {
    if (require("./branchAdminAuth").getChurchBranchAdminSession(req)) return true;
    if (require("./hqAuth").getChurchHqAdminSession(req)) return true;
  } catch {
    /* optional */
  }
  return false;
}

/**
 * Blocks public and authenticated church portal access when org/branch is not active.
 * Foundation dormant: public/member blocked; HQ/branch admin + recovery remain available.
 */
function churchOperationalAccessGate(req, res, next) {
  if (!req.isChurchHost || !req.churchContext) return next();
  if (req.churchContext.kind === "vertical-apex") return next();
  if (isPlatformAdminPath(req.path)) return next();
  if (isChurchLogoutPath(req.path)) return next();
  if (isAccountRecoveryPath(req.path)) return next();

  const authed = hasAnyChurchPortalSession(req);
  const hqPortal = isHqPath(req.path);
  const branchAdminPortal = isBranchAdminPath(req.path);

  return resolveOperationalTenantStatus(req, { forceRefresh: authed })
    .then((status) => {
      if (!status.organization || !status.branch) {
        if (authed) clearAllChurchPortalSessions(req);
        return renderChurchNotFound(req, res);
      }

      // Dormancy ≠ suspension: admins may sign in / recover / reactivate.
      if (status.orgDormant) {
        clearMemberAndLeaderSessions(req);
        if (hqPortal || branchAdminPortal) {
          return next();
        }
        return renderChurchUnavailable(req, res);
      }

      if (!status.orgActive) {
        clearAllChurchPortalSessions(req);
        return renderChurchUnavailable(req, res);
      }

      if (!status.branchActive && !hqPortal) {
        clearAllChurchPortalSessions(req);
        return renderChurchUnavailable(req, res);
      }

      return next();
    })
    .catch((err) => next(err));
}

function statusBadgeClass(status) {
  const map = {
    active: "success",
    suspended: "warning",
    dormant: "warning",
    archived: "muted",
  };
  return map[status] || "default";
}

function statusLabel(status) {
  const s = String(status || "active");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

module.exports = {
  ORG_BRANCH_STATUSES,
  ORG_STATUSES,
  isOperationalStatus,
  isAdminAccessibleOrgStatus,
  isDormantStatus,
  getChurchAccessBlock,
  getHqStatusBanner,
  resolveOperationalTenantStatus,
  clearOperationalSessions,
  clearAllChurchPortalSessions,
  clearMemberAndLeaderSessions,
  hasAnyChurchPortalSession,
  hasAdminPortalSession,
  renderChurchUnavailable,
  renderChurchNotFound,
  churchOperationalAccessGate,
  isChurchLogoutPath,
  isHqPublicAuthPath,
  isBranchPublicAuthPath,
  isAccountRecoveryPath,
  statusBadgeClass,
  statusLabel,
};
