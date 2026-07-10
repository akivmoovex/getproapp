"use strict";

const { ORG_BRANCH_STATUSES } = require("./platformStatusValidation");
const { normalizeHostFromRequest } = require("./host");

function isOperationalStatus(status) {
  return status === "active";
}

/**
 * @param {{ kind?: string, organization?: { status?: string } | null, branch?: { status?: string, name?: string } | null } | null} churchContext
 */
function getChurchAccessBlock(churchContext) {
  if (!churchContext || churchContext.kind !== "branch") return null;
  const org = churchContext.organization;
  const branch = churchContext.branch;
  if (!org || !branch) return { code: "not_found" };
  if (!isOperationalStatus(org.status)) {
    return { code: "organization", status: org.status };
  }
  if (!isOperationalStatus(branch.status)) {
    return { code: "branch", status: branch.status };
  }
  return null;
}

/**
 * @param {{ kind?: string, organization?: { status?: string, name?: string } | null, branch?: { status?: string, name?: string } | null } | null} churchContext
 */
function getHqStatusBanner(churchContext) {
  if (!churchContext || churchContext.kind !== "branch") return null;
  const org = churchContext.organization;
  const branch = churchContext.branch;
  if (!org || !branch) return null;

  const banners = [];
  if (!isOperationalStatus(org.status)) {
    banners.push({
      level: org.status === "archived" ? "danger" : "warning",
      message:
        org.status === "suspended"
          ? "This organization is suspended. Member, branch-admin, leader, and public access on branch hosts is blocked. HQ login remains available; HQ write actions are not blocked by this status gate."
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

function clearOperationalSessions(req) {
  try {
    require("./memberAuth").clearChurchMemberSession(req);
    require("./branchAdminAuth").clearChurchBranchAdminSession(req);
    require("./leaderAuth").clearChurchLeaderSession(req);
  } catch {
    /* optional in tests */
  }
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

/**
 * Blocks public, member, branch-admin, and leader routes when org/branch is not active.
 * HQ routes remain accessible (login and writes are not blocked by this gate).
 */
function isPlatformAdminPath(path) {
  return String(path || "").startsWith("/admin");
}

function churchOperationalAccessGate(req, res, next) {
  if (!req.isChurchHost || !req.churchContext) return next();
  if (req.churchContext.kind === "vertical-apex") return next();
  if (isHqPath(req.path)) return next();
  // /admin/* on branch hosts is handled by the apex-admin guard in server.js —
  // never treat it as a missing church site.
  if (isPlatformAdminPath(req.path)) return next();

  const block = getChurchAccessBlock(req.churchContext);
  if (!block) return next();
  if (block.code === "not_found") {
    return renderChurchNotFound(req, res);
  }
  clearOperationalSessions(req);
  return renderChurchUnavailable(req, res);
}

function statusBadgeClass(status) {
  const map = {
    active: "success",
    suspended: "warning",
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
  isOperationalStatus,
  getChurchAccessBlock,
  getHqStatusBanner,
  clearOperationalSessions,
  renderChurchUnavailable,
  renderChurchNotFound,
  churchOperationalAccessGate,
  statusBadgeClass,
  statusLabel,
};
