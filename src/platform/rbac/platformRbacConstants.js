"use strict";

/**
 * Platform RBAC catalogue constants (V2.02 foundation).
 *
 * Physical storage remains blessboard.roles / permissions / role_permissions
 * until consolidation Phase F (see V2_02_SHARED_RBAC_CONSOLIDATION_PLAN).
 * Platform owns lookup, validation, effective-permission, and audit primitives.
 */

/** Logical catalogue product keys for validation / filtering. */
const RBAC_PRODUCT = Object.freeze({
  PLATFORM: "platform",
  BLESSBOARD: "blessboard",
  ACTIVECLINIC: "activeclinic",
  SHARED: "shared",
});

/**
 * Role categories allowed by DB CHECK (057 + 077).
 * BlessBoard product roles use non-activeclinic categories.
 */
const ROLE_CATEGORY = Object.freeze({
  PLATFORM: "platform",
  ORGANISATION: "organisation",
  CHURCH: "church",
  BRANCH: "branch",
  MINISTRY: "ministry",
  FINANCE: "finance",
  PASTORAL: "pastoral",
  COMMUNICATIONS: "communications",
  WEBSITE: "website",
  AUDIT: "audit",
  MEMBER: "member",
  VISITOR: "visitor",
  ACTIVECLINIC: "activeclinic",
});

const ALL_ROLE_CATEGORIES = Object.freeze(Object.values(ROLE_CATEGORY));

/** Categories that belong to BlessBoard product surfaces (not ActiveClinic). */
const BLESSBOARD_ROLE_CATEGORIES = Object.freeze(
  ALL_ROLE_CATEGORIES.filter((c) => c !== ROLE_CATEGORY.ACTIVECLINIC)
);

/** Categories that belong to ActiveClinic product surfaces. */
const ACTIVECLINIC_ROLE_CATEGORIES = Object.freeze([ROLE_CATEGORY.ACTIVECLINIC]);

/**
 * Map product key → allowed role categories.
 * `platform` includes only the platform category for platform_administrator.
 */
const PRODUCT_ROLE_CATEGORIES = Object.freeze({
  [RBAC_PRODUCT.PLATFORM]: Object.freeze([ROLE_CATEGORY.PLATFORM]),
  [RBAC_PRODUCT.BLESSBOARD]: BLESSBOARD_ROLE_CATEGORIES,
  [RBAC_PRODUCT.ACTIVECLINIC]: ACTIVECLINIC_ROLE_CATEGORIES,
  [RBAC_PRODUCT.SHARED]: ALL_ROLE_CATEGORIES,
});

/**
 * V2.02 / V8-002 — roles that may hold activeclinic.patient.create by policy.
 * Owner decision: reception, clinical/records, and clinic/organization management.
 * Facility admin, finance, diagnostics, website, and bare staff are excluded.
 */
const PATIENT_CREATE_ROLE_FAMILIES = Object.freeze({
  reception: Object.freeze(["activeclinic_receptionist"]),
  clinical: Object.freeze(["activeclinic_medical_records_officer"]),
  manager: Object.freeze([
    "activeclinic_clinic_manager",
    "activeclinic_organization_admin",
    "activeclinic_network_admin",
  ]),
});

const PATIENT_CREATE_ALLOWED_ROLE_KEYS = Object.freeze([
  ...PATIENT_CREATE_ROLE_FAMILIES.reception,
  ...PATIENT_CREATE_ROLE_FAMILIES.clinical,
  ...PATIENT_CREATE_ROLE_FAMILIES.manager,
]);

const PATIENT_CREATE_PERMISSION_KEY = "activeclinic.patient.create";

/** Assignment audit event keys (BB events table CHECK + future platform audit). */
const RBAC_ASSIGNMENT_EVENT = Object.freeze({
  CREATED: "rbac.assignment.created",
  REVOKED: "rbac.assignment.revoked",
  EXPIRED: "rbac.assignment.expired",
  UPDATED: "rbac.assignment.updated",
});

const RBAC_ASSIGNMENT_STATUSES = Object.freeze(["active", "revoked", "expired"]);

/** Physical schema holding the shared catalogue until Phase F relocate. */
const CATALOGUE_SCHEMA = "blessboard";
const CATALOGUE_ROLES_TABLE = `${CATALOGUE_SCHEMA}.roles`;
const CATALOGUE_PERMISSIONS_TABLE = `${CATALOGUE_SCHEMA}.permissions`;
const CATALOGUE_ROLE_PERMISSIONS_TABLE = `${CATALOGUE_SCHEMA}.role_permissions`;
const BB_ASSIGNMENT_EVENTS_TABLE = `${CATALOGUE_SCHEMA}.user_role_assignment_events`;

const ROLE_KEY_RE = /^[a-z][a-z0-9_]{1,63}$/;
const PERMISSION_KEY_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

module.exports = {
  RBAC_PRODUCT,
  ROLE_CATEGORY,
  ALL_ROLE_CATEGORIES,
  BLESSBOARD_ROLE_CATEGORIES,
  ACTIVECLINIC_ROLE_CATEGORIES,
  PRODUCT_ROLE_CATEGORIES,
  PATIENT_CREATE_ROLE_FAMILIES,
  PATIENT_CREATE_ALLOWED_ROLE_KEYS,
  PATIENT_CREATE_PERMISSION_KEY,
  RBAC_ASSIGNMENT_EVENT,
  RBAC_ASSIGNMENT_STATUSES,
  CATALOGUE_SCHEMA,
  CATALOGUE_ROLES_TABLE,
  CATALOGUE_PERMISSIONS_TABLE,
  CATALOGUE_ROLE_PERMISSIONS_TABLE,
  BB_ASSIGNMENT_EVENTS_TABLE,
  ROLE_KEY_RE,
  PERMISSION_KEY_RE,
};
