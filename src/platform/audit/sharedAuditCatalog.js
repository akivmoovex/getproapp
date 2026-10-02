"use strict";

/**
 * Shared platform audit action catalogue (BlessBoard + ActiveClinic + platform).
 * Writers should prefer these keys to avoid duplicate/misleading event names.
 */

const SHARED_AUDIT_ACTION = Object.freeze({
  // Authentication / security
  AUTH_LOGIN_SUCCESS: "auth.login.succeeded",
  AUTH_LOGIN_FAILURE: "auth.login.failed",
  AUTH_LOGIN_DENIED: "auth.login.denied",
  AUTH_LOGOUT: "auth.logout",
  AUTH_PASSWORD_CHANGED: "auth.password.changed",
  AUTH_PASSWORD_RESET_REQUESTED: "auth.password_reset.requested",
  AUTH_PASSWORD_RESET_COMPLETED: "auth.password_reset.completed",
  AUTH_SESSION_REVOKED: "auth.session.revoked",

  // Verification / invitation
  VERIFY_EMAIL_SENT: "verification.email.sent",
  VERIFY_EMAIL_COMPLETED: "verification.email.completed",
  VERIFY_PHONE_SENT: "verification.phone.sent",
  VERIFY_PHONE_COMPLETED: "verification.phone.completed",
  VERIFY_FAILED: "verification.failed",
  INVITE_CREATED: "invite.created",
  INVITE_ACCEPTED: "invite.accepted",
  INVITE_REVOKED: "invite.revoked",
  INVITE_RESENT: "invite.resent",

  // RBAC
  ROLE_ASSIGNED: "role.assigned",
  ROLE_REVOKED: "role.revoked",
  PERMISSION_DENIED: "authz.permission_denied",

  // Website lifecycle (platform mirror; detailed trail stays in website_audit_events)
  WEBSITE_DRAFT_SAVED: "website.draft.saved",
  WEBSITE_PUBLISHED: "website.published",
  WEBSITE_RESTORED: "website.restored",
  WEBSITE_UNPUBLISHED: "website.unpublished",

  // Admin / registration
  ADMIN_STATE_CHANGED: "admin.state.changed",
  REGISTRATION_APPROVED: "registration.approved",
  REGISTRATION_REJECTED: "registration.rejected",
  REGISTRATION_PROVISIONED: "registration.provisioning_completed",

  // V2.03 shared foundation
  DATA_JOB_CREATED: "data_job.created",
  DATA_JOB_STATUS_CHANGED: "data_job.status_changed",
  DATA_JOB_FAILED: "data_job.failed",
  POLICY_ACCEPTED: "policy.accepted",
  COMMUNICATION_PREFERENCE_UPDATED: "communication_preference.updated",
  NOTIFICATION_DISPATCHED: "notification.dispatched",

  // V2.04 person foundation (demographic person — not member/patient semantics)
  PERSON_CREATED: "person.created",
  PERSON_UPDATED: "person.updated",
  PERSON_PRODUCT_LINKED: "person.product_linked",
  PERSON_VERIFICATION_UPDATED: "person.verification_updated",
  PERSON_ADDRESS_ADDED: "person.address_added",
  PERSON_RELATED_CONTACT_ADDED: "person.related_contact_added",
  STAFF_PERSON_WORKFLOW_COMPLETED: "person.staff_workflow.completed",
  STAFF_PERSON_WORKFLOW_DENIED: "person.staff_workflow.denied",
});

const SHARED_AUDIT_ENTITY = Object.freeze({
  USER: "user",
  IDENTITY: "identity",
  SESSION: "session",
  INVITE: "invite",
  ROLE: "role",
  ORGANIZATION: "organization",
  WEBSITE: "website",
  WEBSITE_VERSION: "website_version",
  APPLICATION: "application",
  FACILITY: "facility",
  BRANCH: "branch",
  DATA_JOB: "data_job",
  POLICY_ACCEPTANCE: "policy_acceptance",
  COMMUNICATION_PREFERENCE: "communication_preference",
  NOTIFICATION: "notification",
  PERSON: "person",
  PERSON_PRODUCT_LINK: "person_product_link",
  PERSON_ADDRESS: "person_address",
  PERSON_RELATED_CONTACT: "person_related_contact",
});

const SHARED_AUDIT_OUTCOME = Object.freeze({
  SUCCESS: "success",
  FAILURE: "failure",
  DENIED: "denied",
});

const SHARED_AUDIT_PRODUCT = Object.freeze({
  BLESSBOARD: "blessboard",
  ACTIVECLINIC: "activeclinic",
  PLATFORM: "platform",
});

/** Actions that must not use best-effort/safe writes when mutating security state. */
const CRITICAL_AUDIT_ACTIONS = Object.freeze(
  new Set([
    SHARED_AUDIT_ACTION.AUTH_PASSWORD_CHANGED,
    SHARED_AUDIT_ACTION.AUTH_PASSWORD_RESET_COMPLETED,
    SHARED_AUDIT_ACTION.AUTH_SESSION_REVOKED,
    SHARED_AUDIT_ACTION.ROLE_ASSIGNED,
    SHARED_AUDIT_ACTION.ROLE_REVOKED,
    SHARED_AUDIT_ACTION.INVITE_CREATED,
    SHARED_AUDIT_ACTION.INVITE_ACCEPTED,
    SHARED_AUDIT_ACTION.INVITE_REVOKED,
    SHARED_AUDIT_ACTION.WEBSITE_PUBLISHED,
    SHARED_AUDIT_ACTION.WEBSITE_RESTORED,
  ])
);

module.exports = {
  SHARED_AUDIT_ACTION,
  SHARED_AUDIT_ENTITY,
  SHARED_AUDIT_OUTCOME,
  SHARED_AUDIT_PRODUCT,
  CRITICAL_AUDIT_ACTIONS,
};
