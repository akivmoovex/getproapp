"use strict";

/**
 * Standardized BlessBoard QA role users for demo-church (testing only).
 *
 * Catalogue roles alone cannot establish a staff session — login requires a
 * legacy blessboard.user_roles row (platform_admin | church_hq_admin | branch_admin).
 * Dedicated QA users therefore receive the proven baseline login role plus
 * exactly one catalogue assignment.
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
  "platform_administrator", // platform shell; use legacy platform_admin
  "visitor", // excluded from staff-access UI
  "member", // member portal membership identity, not staff login role
]);

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
  if (NON_HUMAN_ASSIGNABLE_ROLE_KEYS.includes(key)) return "SYSTEM_ONLY";
  return "HUMAN_ASSIGNABLE";
}

/**
 * Map catalogue role → legacy login baseline + catalogue assignment scope.
 * @param {string} roleKey
 * @param {string} roleCategory
 */
function resolveQaAssignmentPlan(roleKey, roleCategory) {
  const key = String(roleKey || "");
  const category = String(roleCategory || "");

  if (key === "organisation_administrator") {
    return {
      legacyRoleKey: "church_hq_admin",
      catalogueScopeType: "organisation",
      branchKey: null,
      baselineReason:
        "Staff sessions require blessboard.user_roles; church_hq_admin is the HQ login baseline.",
    };
  }
  if (key === "church_system_administrator") {
    return {
      legacyRoleKey: "church_hq_admin",
      catalogueScopeType: "church",
      branchKey: null,
      baselineReason:
        "Staff sessions require blessboard.user_roles; church_hq_admin is the HQ login baseline.",
    };
  }
  if (category === "branch" || key === "branch_administrator" || key === "branch_pastor") {
    return {
      legacyRoleKey: "branch_admin",
      catalogueScopeType: "branch",
      branchKey: DEMO_CAMPUS_BRANCH_KEY,
      baselineReason:
        "Staff sessions require blessboard.user_roles; branch_admin is the branch login baseline.",
    };
  }
  return {
    legacyRoleKey: "church_hq_admin",
    catalogueScopeType: "church",
    branchKey: null,
    baselineReason:
      "Staff sessions require blessboard.user_roles; church_hq_admin is the HQ login baseline for church-scoped catalogue roles.",
  };
}

/**
 * @param {number} index 1-based
 * @returns {string} E.164 e.g. +260971000001
 */
function formatQaPhone(index) {
  const n = Number(index);
  if (!Number.isInteger(n) || n < 1 || n > 999999) {
    throw new Error(`invalid_qa_phone_index:${index}`);
  }
  // +260 + 971 + 6-digit sequence → Zambia-length national mobile form
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

/** Legacy login roles (blessboard.user_roles CHECK) — human-assignable for login. */
const LEGACY_LOGIN_ROLES = Object.freeze([
  {
    roleKey: "platform_admin",
    displayName: "Platform Admin (legacy login)",
    classification: "HUMAN_ASSIGNABLE",
    scope: "platform",
  },
  {
    roleKey: "church_hq_admin",
    displayName: "Church HQ Admin (legacy login)",
    classification: "HUMAN_ASSIGNABLE",
    scope: "church",
  },
  {
    roleKey: "branch_admin",
    displayName: "Branch Admin (legacy login)",
    classification: "HUMAN_ASSIGNABLE",
    scope: "branch",
  },
]);

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
  LEGACY_LOGIN_ROLES,
  classifyCatalogueRole,
  resolveQaAssignmentPlan,
  formatQaPhone,
  qaEmailForRole,
  qaDisplayName,
};
