"use strict";

/**
 * Fixed catalogue for BlessBoard platform support access (MVP).
 * No finance / pastoral / safeguarding / giving-detail / private-file scopes.
 */

const { ROLES, normalizeRole, isSuperAdmin } = require("../auth/roles");

const SUPPORT_SCOPES = Object.freeze([
  "redacted_diagnostics",
  "configuration",
  "user_support",
  "content_support",
  "job_support",
]);

const SUPPORT_SCOPE_SET = new Set(SUPPORT_SCOPES);

/** Actions allowed under each scope. */
const SCOPE_ACTIONS = Object.freeze({
  redacted_diagnostics: Object.freeze(["view_redacted_diagnostics"]),
  configuration: Object.freeze(["view_org_config", "edit_org_config"]),
  user_support: Object.freeze(["view_user_directory", "assist_user_account", "unlock_login_protection"]),
  content_support: Object.freeze(["view_broadcasts", "view_announcements"]),
  job_support: Object.freeze(["view_job_status", "retry_background_job"]),
});

/** Always denied for support-access grants in this MVP. */
const SENSITIVE_DENIED_ACTIONS = Object.freeze([
  "finance_view",
  "finance_edit",
  "pastoral_notes",
  "safeguarding",
  "giving_detail",
  "private_file_access",
  "session_takeover",
  "password_view",
  "impersonate",
]);

const SENSITIVE_DENIED_SET = new Set(SENSITIVE_DENIED_ACTIONS);

const ACCESS_STATUSES = Object.freeze([
  "pending",
  "approved",
  "rejected",
  "expired",
  "revoked",
]);

const EVENT_TYPES = Object.freeze([
  "request",
  "approval",
  "rejection",
  "use",
  "denied_use",
  "expiry",
  "revocation",
]);

/** Roles that may request support access (ordinary support + managers). */
const SUPPORT_REQUEST_ROLES = new Set([
  ROLES.CSR,
  ROLES.TENANT_EDITOR,
  ROLES.TENANT_AGENT,
  ROLES.TENANT_MANAGER,
  ROLES.SUPER_ADMIN,
]);

/** Roles eligible to be assigned as account managers. */
const ACCOUNT_MANAGER_ELIGIBLE_ROLES = new Set([
  ROLES.CSR,
  ROLES.TENANT_EDITOR,
  ROLES.TENANT_AGENT,
  ROLES.TENANT_MANAGER,
]);

/** Country / platform administrators who may assign managers and approve access. */
function canApproveSupportAccess(role) {
  const n = normalizeRole(role);
  return n === ROLES.SUPER_ADMIN || n === ROLES.TENANT_MANAGER;
}

function canAssignAccountManagers(role) {
  return canApproveSupportAccess(role);
}

function canRequestSupportAccess(role) {
  return SUPPORT_REQUEST_ROLES.has(normalizeRole(role));
}

/** Ordinary support staff who require a grant to enter tenant data. */
function isOrdinarySupportStaff(role) {
  const n = normalizeRole(role);
  return n === ROLES.CSR || n === ROLES.TENANT_EDITOR || n === ROLES.TENANT_AGENT;
}

/** Redacted diagnostics may be viewed without a tenant-entry grant. */
function canViewRedactedDiagnosticsWithoutGrant(role) {
  const n = normalizeRole(role);
  return (
    isSuperAdmin(n) ||
    n === ROLES.TENANT_MANAGER ||
    n === ROLES.CSR ||
    n === ROLES.TENANT_EDITOR ||
    n === ROLES.TENANT_AGENT
  );
}

function isValidSupportScope(scope) {
  return SUPPORT_SCOPE_SET.has(String(scope || "").trim());
}

function actionsForScope(scope) {
  return SCOPE_ACTIONS[String(scope || "").trim()] || [];
}

function scopeAllowsAction(scope, action) {
  const act = String(action || "").trim();
  if (!act || SENSITIVE_DENIED_SET.has(act)) return false;
  return actionsForScope(scope).includes(act);
}

function isSensitiveDeniedAction(action) {
  return SENSITIVE_DENIED_SET.has(String(action || "").trim());
}

module.exports = {
  SUPPORT_SCOPES,
  SCOPE_ACTIONS,
  SENSITIVE_DENIED_ACTIONS,
  ACCESS_STATUSES,
  EVENT_TYPES,
  ACCOUNT_MANAGER_ELIGIBLE_ROLES,
  canApproveSupportAccess,
  canAssignAccountManagers,
  canRequestSupportAccess,
  isOrdinarySupportStaff,
  canViewRedactedDiagnosticsWithoutGrant,
  isValidSupportScope,
  actionsForScope,
  scopeAllowsAction,
  isSensitiveDeniedAction,
  isSuperAdmin,
  normalizeRole,
  ROLES,
};
