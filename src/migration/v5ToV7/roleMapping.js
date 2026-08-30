"use strict";

/**
 * BlessBoard V5 role_key → V7 catalogue mapping (no invented roles).
 * Legacy blessboard.user_roles rows map via role_id join; keys listed for operator review.
 */

const BB_ROLE_MAP = Object.freeze({
  organisation_administrator: {
    v7RoleKey: "organisation_administrator",
    scope: "organisation",
    action: "migrate_direct",
  },
  branch_administrator: {
    v7RoleKey: "branch_administrator",
    scope: "branch",
    action: "migrate_direct",
  },
  hq_administrator: {
    v7RoleKey: "organisation_administrator",
    scope: "organisation",
    action: "migrate_alias",
    note: "legacy hq_administrator → organisation_administrator",
  },
  church_administrator: {
    v7RoleKey: "organisation_administrator",
    scope: "organisation",
    action: "migrate_alias",
  },
  content_editor: {
    v7RoleKey: "content_editor",
    scope: "church",
    action: "migrate_direct",
  },
  website_editor: {
    v7RoleKey: "website_editor",
    scope: "church",
    action: "migrate_direct",
  },
  finance_administrator: {
    v7RoleKey: "finance_administrator",
    scope: "organisation",
    action: "migrate_direct",
  },
  member: {
    v7RoleKey: null,
    scope: "personal",
    action: "exclude_v1",
    note: "member portal not required for V1 admin cutover",
  },
  platform_support: {
    v7RoleKey: "platform_support",
    scope: "platform",
    action: "migrate_direct",
  },
});

const AC_ROLE_MAP = Object.freeze({
  activeclinic_organization_admin: { action: "migrate_direct" },
  activeclinic_facility_admin: { action: "migrate_direct" },
  activeclinic_network_admin: { action: "migrate_direct" },
  activeclinic_receptionist: { action: "migrate_direct" },
  activeclinic_clinician: { action: "migrate_direct" },
  activeclinic_nurse: { action: "migrate_direct" },
});

function mapBlessBoardRoleKey(roleKey) {
  const key = String(roleKey || "").trim().toLowerCase();
  return BB_ROLE_MAP[key] || { v7RoleKey: key, scope: "organisation", action: "review_required" };
}

function mapActiveClinicRoleKey(roleKey) {
  const key = String(roleKey || "").trim().toLowerCase();
  return AC_ROLE_MAP[key] || { action: "review_required" };
}

function roleMappingTable() {
  return Object.entries(BB_ROLE_MAP).map(([v5Role, meta]) => ({
    v5Role,
    v7Role: meta.v7RoleKey,
    scope: meta.scope,
    action: meta.action,
    note: meta.note || null,
  }));
}

module.exports = {
  BB_ROLE_MAP,
  AC_ROLE_MAP,
  mapBlessBoardRoleKey,
  mapActiveClinicRoleKey,
  roleMappingTable,
};
