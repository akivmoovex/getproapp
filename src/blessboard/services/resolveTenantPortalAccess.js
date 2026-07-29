"use strict";

/**
 * Resolve post-login / header portal destinations for a tenant church context.
 * Reuses existing role keys and member membership rules — no second auth system.
 */

const authRepo = require("../repositories/blessBoardAuthRepository");
const {
  rolesApplicableToOrganization,
} = require("./establishBlessBoardSession");
const {
  requireActiveMemberForTenant,
} = require("./requireActiveMemberForTenant");
const { safeTenantNextPath } = require("../http/tenantLoginHelpers");

const PORTAL_KEYS = Object.freeze({
  HQ: "church_hq_admin",
  BRANCH: "branch_admin",
  MEMBER: "member",
  PLATFORM: "platform_admin",
});

const PORTAL_PATHS = Object.freeze({
  church_hq_admin: "/hq",
  branch_admin: "/branch-admin",
  member: "/member",
  platform_admin: "/hq",
  account: "/account",
});

/**
 * @param {Array<{ roleKey?: string, role_key?: string, organizationId?: string, organization_id?: string, churchId?: string, church_id?: string, branchId?: string, branch_id?: string }>} roles
 * @param {{ organizationId: string, churchId: string, branchId?: string|null, organizationStatus?: string|null, branchStatus?: string|null }} tenant
 */
function filterValidStaffRolesForTenant(roles, tenant) {
  const orgId = String((tenant && tenant.organizationId) || "");
  const churchId = String((tenant && tenant.churchId) || "");
  const branchId =
    tenant && tenant.branchId != null && String(tenant.branchId).trim() !== ""
      ? String(tenant.branchId)
      : null;
  const orgStatus = String((tenant && tenant.organizationStatus) || "active").toLowerCase();
  const branchStatus = String((tenant && tenant.branchStatus) || "active").toLowerCase();
  if (orgStatus && orgStatus !== "active") return [];

  const applicable = rolesApplicableToOrganization(
    (roles || []).map((r) => ({
      role_key: String(r.roleKey || r.role_key || ""),
      organization_id: r.organizationId || r.organization_id || null,
      church_id: r.churchId || r.church_id || null,
      branch_id: r.branchId || r.branch_id || null,
    })),
    orgId || null
  );

  return applicable.filter((r) => {
    const key = String(r.role_key || "");
    if (key === PORTAL_KEYS.PLATFORM) return true;
    if (key === PORTAL_KEYS.HQ) {
      if (!orgId || String(r.organization_id) !== orgId) return false;
      if (r.church_id && churchId && String(r.church_id) !== churchId) return false;
      return true;
    }
    if (key === PORTAL_KEYS.BRANCH) {
      if (!orgId || String(r.organization_id) !== orgId) return false;
      if (branchStatus && branchStatus !== "active") return false;
      if (branchId && r.branch_id && String(r.branch_id) !== branchId) return false;
      if (r.church_id && churchId && String(r.church_id) !== churchId) return false;
      return true;
    }
    return false;
  });
}

/**
 * @param {Array<{ role_key: string }>} staffRoles
 * @param {boolean} hasMemberAccess
 */
function buildPortalOptions(staffRoles, hasMemberAccess) {
  const options = [];
  const seen = new Set();
  const push = (key, href, label) => {
    if (seen.has(key)) return;
    seen.add(key);
    options.push({ key, href, label });
  };

  for (const r of staffRoles || []) {
    const key = String(r.role_key || "");
    if (key === PORTAL_KEYS.HQ || key === PORTAL_KEYS.PLATFORM) {
      push(PORTAL_KEYS.HQ, PORTAL_PATHS.church_hq_admin, "Church HQ");
    } else if (key === PORTAL_KEYS.BRANCH) {
      push(PORTAL_KEYS.BRANCH, PORTAL_PATHS.branch_admin, "Branch Admin");
    }
  }
  if (hasMemberAccess) {
    push(PORTAL_KEYS.MEMBER, PORTAL_PATHS.member, "Member Portal");
  }
  return options;
}

/**
 * @param {{
 *   db: object,
 *   userId: string,
 *   organizationId: string,
 *   churchId: string,
 *   branchId?: string|null,
 *   organizationStatus?: string|null,
 *   branchStatus?: string|null,
 *   roles?: Array<object>|null,
 *   nextRaw?: unknown,
 * }} input
 */
async function resolveTenantPortalAccess(input) {
  const userId = String((input && input.userId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const branchId =
    input && input.branchId != null && String(input.branchId).trim() !== ""
      ? String(input.branchId)
      : null;

  if (!userId || !organizationId || !churchId) {
    return {
      ok: false,
      reason: "scope",
      portals: [],
      destination: null,
      label: null,
      multiRole: false,
      hasAccess: false,
    };
  }

  let roles = Array.isArray(input.roles) ? input.roles : null;
  if (!roles) {
    try {
      roles = await authRepo.listActiveRolesForUser(input.db, userId);
    } catch {
      return {
        ok: false,
        reason: "lookup",
        portals: [],
        destination: null,
        label: null,
        multiRole: false,
        hasAccess: false,
      };
    }
  }

  const staffRoles = filterValidStaffRolesForTenant(roles, {
    organizationId,
    churchId,
    branchId,
    organizationStatus: input.organizationStatus,
    branchStatus: input.branchStatus,
  });

  let hasMemberAccess = false;
  if (branchId) {
    const memberAccess = await requireActiveMemberForTenant(input.db, {
      userId,
      churchId,
      branchId,
    });
    hasMemberAccess = Boolean(memberAccess && memberAccess.ok);
  }

  const portals = buildPortalOptions(staffRoles, hasMemberAccess);
  if (!portals.length) {
    return {
      ok: true,
      reason: "no_portal",
      portals: [],
      destination: null,
      label: null,
      multiRole: false,
      hasAccess: false,
    };
  }

  const requested = safeTenantNextPath(input && input.nextRaw);
  if (requested) {
    const match = portals.find(
      (p) => requested === p.href || requested.startsWith(`${p.href}/`)
    );
    if (match) {
      return {
        ok: true,
        reason: "next",
        portals,
        destination: requested,
        label: match.label,
        multiRole: portals.length > 1,
        hasAccess: true,
      };
    }
  }

  if (portals.length === 1) {
    return {
      ok: true,
      reason: "single",
      portals,
      destination: portals[0].href,
      label: portals[0].label,
      multiRole: false,
      hasAccess: true,
    };
  }

  return {
    ok: true,
    reason: "multi",
    portals,
    destination: PORTAL_PATHS.account,
    label: "My Portal",
    multiRole: true,
    hasAccess: true,
  };
}

/**
 * Header CTA for authenticated visitors on the public mini-website.
 * @param {Awaited<ReturnType<typeof resolveTenantPortalAccess>>} access
 */
function publicPortalHeaderFromAccess(access) {
  if (!access || !access.hasAccess) {
    return {
      authenticated: true,
      portalHref: "/account",
      portalLabel: "My Portal",
      loginHref: null,
    };
  }
  if (access.multiRole) {
    return {
      authenticated: true,
      portalHref: PORTAL_PATHS.account,
      portalLabel: "My Portal",
      loginHref: null,
    };
  }
  return {
    authenticated: true,
    portalHref: access.destination || PORTAL_PATHS.account,
    portalLabel: access.label === "Member Portal" ? "Dashboard" : access.label || "Dashboard",
    loginHref: null,
  };
}

module.exports = {
  PORTAL_KEYS,
  PORTAL_PATHS,
  filterValidStaffRolesForTenant,
  buildPortalOptions,
  resolveTenantPortalAccess,
  publicPortalHeaderFromAccess,
};
