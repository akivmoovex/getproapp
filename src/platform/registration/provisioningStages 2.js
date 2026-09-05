"use strict";

/**
 * Canonical organization-provisioning stages shared by ActiveClinic and BlessBoard.
 * Detection and retry use these names. Product orchestrators may keep internal
 * stage labels and map them here before persistence.
 */

const STAGE = Object.freeze({
  ORGANIZATION: "organization",
  ADMINISTRATOR: "administrator",
  ROLE_ASSIGNMENT: "role_assignment",
  FACILITY_HQ: "facility_hq",
  MEMBERSHIPS: "memberships",
  DEFAULT_DEPARTMENTS: "default_departments",
  WEBSITE_INSTANCE: "website_instance",
  TEMPLATE_CONTENT: "template_content",
  AUDIT_COMPLETION: "audit_completion",
  COMPLETE: "complete",
});

const ORDER = Object.freeze([
  STAGE.ORGANIZATION,
  STAGE.ADMINISTRATOR,
  STAGE.ROLE_ASSIGNMENT,
  STAGE.FACILITY_HQ,
  STAGE.MEMBERSHIPS,
  STAGE.DEFAULT_DEPARTMENTS,
  STAGE.WEBSITE_INSTANCE,
  STAGE.TEMPLATE_CONTENT,
  STAGE.AUDIT_COMPLETION,
]);

const CORE_LOGIN_STAGES = Object.freeze([
  STAGE.ORGANIZATION,
  STAGE.ADMINISTRATOR,
  STAGE.ROLE_ASSIGNMENT,
  STAGE.FACILITY_HQ,
  STAGE.MEMBERSHIPS,
]);

const BLESSBOARD_INTERNAL_TO_CANONICAL = Object.freeze({
  start: STAGE.ORGANIZATION,
  lock_application: STAGE.ORGANIZATION,
  validate_plan: STAGE.ORGANIZATION,
  resolve_organization_key: STAGE.ORGANIZATION,
  provision_platform_tenant: STAGE.ORGANIZATION,
  organization_created: STAGE.ORGANIZATION,
  organization_key_created: STAGE.ORGANIZATION,
  resolve_administrator_identity: STAGE.ADMINISTRATOR,
  prepare_administrator_invitation: STAGE.ADMINISTRATOR,
  create_administrator_user: STAGE.ADMINISTRATOR,
  create_administrator_invitation: STAGE.ADMINISTRATOR,
  assign_administrator_roles: STAGE.ROLE_ASSIGNMENT,
  provision_church_branch: STAGE.FACILITY_HQ,
  church_created: STAGE.FACILITY_HQ,
  hq_branch_created: STAGE.FACILITY_HQ,
  ensure_organization_onboarding: STAGE.MEMBERSHIPS,
  website_created: STAGE.WEBSITE_INSTANCE,
  default_pages_seeded: STAGE.TEMPLATE_CONTENT,
  website_published: STAGE.WEBSITE_INSTANCE,
  public_route_verified: STAGE.WEBSITE_INSTANCE,
  close_application: STAGE.AUDIT_COMPLETION,
  write_success_audits: STAGE.AUDIT_COMPLETION,
  committed: STAGE.COMPLETE,
  already_provisioned: STAGE.COMPLETE,
});

function isCanonicalStage(value) {
  return ORDER.includes(String(value || ""));
}

function mapBlessBoardInternalStage(internalStage) {
  const raw = String(internalStage || "").trim();
  if (!raw) return STAGE.ORGANIZATION;
  if (isCanonicalStage(raw)) return raw;
  return BLESSBOARD_INTERNAL_TO_CANONICAL[raw] || STAGE.ORGANIZATION;
}

function isCoreLoginStage(stage) {
  return CORE_LOGIN_STAGES.includes(String(stage || ""));
}

module.exports = {
  STAGE,
  ORDER,
  CORE_LOGIN_STAGES,
  BLESSBOARD_INTERNAL_TO_CANONICAL,
  isCanonicalStage,
  mapBlessBoardInternalStage,
  isCoreLoginStage,
};
