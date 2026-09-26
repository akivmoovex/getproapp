"use strict";

/**
 * Standardized BlessBoard QA role users for demo-church (testing only).
 *
 * V2.02: Catalogue roles alone establish staff sessions via user_role_assignments.
 * Legacy blessboard.user_roles is not required for login.
 */

const DEMO_ORGANIZATION_KEY = "demo-church";
const DEMO_CHURCH_KEY = "demo-church";
const DEMO_HQ_BRANCH_KEY = "hq";
const DEMO_CAMPUS_BRANCH_KEY = "demo-church-lusaka";

/** Shared requested QA password (policy-compliant length 10). */
const QA_PASSWORD = "1234567890";

/**
 * Reserved BlessBoard testing phone range (Zambia).
 * ActiveClinic QA uses +260970000001–015 — do not collide.
 * DEMO PHONE — DO NOT SEND (SMS/WhatsApp/OTP).
 */
const QA_PHONE_PREFIX = "+26097100";
const QA_PHONE_START = 1; // +260971000001
const EXISTING_USER_PHONE_START = 101; // +260971000101 …

const QA_EMAIL_DOMAIN = "demo-church.example.test";

/** Roles excluded from church staff-access catalogue / non-staff login targets. */
const NON_HUMAN_ASSIGNABLE_ROLE_KEYS = Object.freeze([
  "visitor", // excluded from staff-access UI
  "member", // member portal membership identity, not staff login role
]);

/**
 * Platform administrator is assignable for platform QA shells (catalogue-only).
 * Seeded separately from church staff-access UI.
 */
const PLATFORM_QA_ROLE_KEY = "platform_administrator";

/**
 * @param {{ roleKey: string, roleCategory: string, isActive: boolean }} role
 * @returns {'HUMAN_ASSIGNABLE'|'SYSTEM_ONLY'|'INACTIVE'|'LEGACY'}
 */
function classifyCatalogueRole(role) {
  const key = String(role.roleKey || role.role_key || "");
  const category = String(role.roleCategory || role.role_category || "");
  const isActive = role.isActive !== false && role.is_active !== false;
  if (!isActive) return "INACTIVE";
  if (category === "activeclinic") return "SYSTEM_ONLY";
  if (key === PLATFORM_QA_ROLE_KEY) return "HUMAN_ASSIGNABLE";
  if (NON_HUMAN_ASSIGNABLE_ROLE_KEYS.includes(key)) return "SYSTEM_ONLY";
  return "HUMAN_ASSIGNABLE";
}

/**
 * Map catalogue role → catalogue assignment scope (no legacy companion).
 * @param {string} roleKey
 * @param {string} roleCategory
 */
function resolveQaAssignmentPlan(roleKey, roleCategory) {
  const key = String(roleKey || "");
  const category = String(roleCategory || "");

  if (key === "platform_administrator") {
    return {
      legacyRoleKey: null,
      catalogueRoleKey: "platform_administrator",
      catalogueScopeType: "platform",
      branchKey: null,
      baselineReason: "Catalogue-only login: platform_administrator at platform scope.",
    };
  }
  if (key === "organisation_administrator") {
    return {
      legacyRoleKey: null,
      catalogueRoleKey: "organisation_administrator",
      catalogueScopeType: "organisation",
      branchKey: null,
      baselineReason: "Catalogue-only login: organisation_administrator at organisation scope.",
    };
  }
  if (key === "church_system_administrator") {
    return {
      legacyRoleKey: null,
      catalogueRoleKey: "church_system_administrator",
      catalogueScopeType: "church",
      branchKey: null,
      baselineReason: "Catalogue-only login: church_system_administrator at church scope.",
    };
  }
  if (category === "branch" || key === "branch_administrator" || key === "branch_pastor") {
    return {
      legacyRoleKey: null,
      catalogueRoleKey: key,
      catalogueScopeType: "branch",
      branchKey: DEMO_CAMPUS_BRANCH_KEY,
      baselineReason: "Catalogue-only login: branch-scoped catalogue role.",
    };
  }
  return {
    legacyRoleKey: null,
    catalogueRoleKey: key,
    catalogueScopeType: "church",
    branchKey: null,
    baselineReason: "Catalogue-only login: church-scoped catalogue role.",
  };
}

/**
 * Legacy persona → catalogue mapping for seedBlessBoardTestUsers migration.
 */
const LEGACY_PERSONA_TO_CATALOGUE = Object.freeze({
  platform_admin: {
    catalogueRoleKey: "platform_administrator",
    catalogueScopeType: "platform",
  },
  church_hq_admin: {
    catalogueRoleKey: "organisation_administrator",
    catalogueScopeType: "organisation",
  },
  branch_admin: {
    catalogueRoleKey: "branch_administrator",
    catalogueScopeType: "branch",
  },
});

/**
 * @param {number} index 1-based
 * @returns {string} E.164 e.g. +260971000001
 */
function formatQaPhone(index) {
  const n = Number(index);
  if (!Number.isInteger(n) || n < 1 || n > 999999) {
    throw new Error(`invalid_qa_phone_index:${index}`);
  }
  return `+260971${String(n).padStart(6, "0")}`;
}

/**
 * @param {string} roleKey
 */
function qaEmailForRole(roleKey) {
  return `qa.${String(roleKey).trim().toLowerCase()}@${QA_EMAIL_DOMAIN}`;
}

/**
 * @param {string} displayName
 */
function qaDisplayName(displayName) {
  return `QA ${String(displayName || "").trim()}`.trim();
}

/** Catalogue login personas (replaces legacy user_roles login list). */
const CATALOGUE_LOGIN_PERSONAS = Object.freeze([
  {
    roleKey: "platform_administrator",
    displayName: "Platform Administrator",
    classification: "HUMAN_ASSIGNABLE",
    scope: "platform",
  },
  {
    roleKey: "organisation_administrator",
    displayName: "Organisation Administrator",
    classification: "HUMAN_ASSIGNABLE",
    scope: "organisation",
  },
  {
    roleKey: "church_system_administrator",
    displayName: "Church System Administrator",
    classification: "HUMAN_ASSIGNABLE",
    scope: "church",
  },
  {
    roleKey: "branch_administrator",
    displayName: "Branch Administrator",
    classification: "HUMAN_ASSIGNABLE",
    scope: "branch",
  },
]);

/** @deprecated Use CATALOGUE_LOGIN_PERSONAS — retained name for older tests. */
const LEGACY_LOGIN_ROLES = CATALOGUE_LOGIN_PERSONAS;

module.exports = {
  DEMO_ORGANIZATION_KEY,
  DEMO_CHURCH_KEY,
  DEMO_HQ_BRANCH_KEY,
  DEMO_CAMPUS_BRANCH_KEY,
  QA_PASSWORD,
  QA_PHONE_PREFIX,
  QA_PHONE_START,
  EXISTING_USER_PHONE_START,
  QA_EMAIL_DOMAIN,
  NON_HUMAN_ASSIGNABLE_ROLE_KEYS,
  PLATFORM_QA_ROLE_KEY,
  LEGACY_LOGIN_ROLES,
  CATALOGUE_LOGIN_PERSONAS,
  LEGACY_PERSONA_TO_CATALOGUE,
  classifyCatalogueRole,
  resolveQaAssignmentPlan,
  formatQaPhone,
  qaEmailForRole,
  qaDisplayName,
};
