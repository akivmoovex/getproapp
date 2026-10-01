"use strict";

/**
 * PD-V204-BB-P1-02 — dual-role shell cross-links (temporary V2.04).
 * Same identity; existing Member Portal + Church Management shells only.
 */

/**
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function sessionHasChurchManagementAccess(req) {
  const roles =
    (req.blessBoardAuthorizationContext &&
      req.blessBoardAuthorizationContext.effectiveRoles) ||
    [];
  const keys = new Set(
    (Array.isArray(roles) ? roles : []).map((r) => String((r && r.roleKey) || "").trim())
  );
  if (
    keys.has("church_hq_admin") ||
    keys.has("branch_admin") ||
    keys.has("platform_admin")
  ) {
    return true;
  }
  const session = req.v5Session && req.v5Session.session ? req.v5Session.session : null;
  const sessionRoles = (session && session.roles) || [];
  return (Array.isArray(sessionRoles) ? sessionRoles : []).some((r) => {
    const k = String(r || "").trim();
    return k === "church_hq_admin" || k === "branch_admin" || k === "platform_admin";
  });
}

/**
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function sessionHasActiveMemberAccess(req) {
  if (req.blessBoardMemberAccess && req.blessBoardMemberAccess.member) return true;
  const session = req.v5Session && req.v5Session.session ? req.v5Session.session : null;
  if (session && session.memberId) return true;
  const roles =
    (req.blessBoardAuthorizationContext &&
      req.blessBoardAuthorizationContext.effectiveRoles) ||
    [];
  return (Array.isArray(roles) ? roles : []).some(
    (r) => String((r && r.roleKey) || "").trim() === "member"
  );
}

/**
 * @param {Array<{ key?: string, label: string, href: string, nav?: boolean, enabled?: boolean }>} navItems
 * @param {{ key: string, label: string, href: string }} link
 */
function appendDualRoleNavItem(navItems, link) {
  if (!link || !link.href) {
    return Array.isArray(navItems) ? navItems.slice() : [];
  }
  const items = Array.isArray(navItems) ? navItems.slice() : [];
  if (items.some((i) => i && (i.key === link.key || i.href === link.href))) {
    return items;
  }
  items.push({
    key: link.key,
    label: link.label,
    href: link.href,
    nav: true,
    enabled: true,
    dualRole: true,
  });
  return items;
}

module.exports = {
  sessionHasChurchManagementAccess,
  sessionHasActiveMemberAccess,
  appendDualRoleNavItem,
};
