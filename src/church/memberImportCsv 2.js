"use strict";

/**
 * BlessBoard member-import CSV mapping.
 * Platform owns parse/escape/normalize; product owns aliases + domain classification.
 */

const {
  parseCsvText,
  normalizeHeader,
  stripFormulaInjection,
  escapeCsvCell,
  rowsToCsv,
} = require("../platform/jobs/dataJobFileValidation");

const FORBIDDEN_TENANT_HEADERS = new Set([
  "organization_id",
  "organisation_id",
  "org_id",
  "branch_id",
  "tenant_id",
  "platform_tenant_id",
  "platformtenantid",
  "church_id",
]);

const HEADER_ALIASES = {
  full_name: ["full_name", "fullname", "name", "member_name", "display_name"],
  email: ["email", "email_address", "e_mail"],
  phone: ["phone", "mobile", "telephone", "phone_number", "mobile_number"],
  member_type: ["member_type", "type", "status", "classification", "person_type"],
  gender: ["gender"],
  age_group: ["age_group", "agegroup", "age"],
  address_area: ["address_area", "address", "area", "location"],
  attendance_duration: ["attendance_duration", "attendance", "how_long"],
  ministry_interest: ["ministry_interest", "ministry", "interests"],
  emergency_contact_name: ["emergency_contact_name", "emergency_name"],
  emergency_contact_phone: ["emergency_contact_phone", "emergency_phone"],
  is_admin: ["is_admin", "admin", "administrator", "is_administrator", "role"],
  external_key: ["external_key", "external_id", "row_key", "import_key"],
};

function mapHeader(normalized) {
  if (FORBIDDEN_TENANT_HEADERS.has(normalized)) {
    return { kind: "forbidden_tenant", header: normalized };
  }
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(normalized)) {
      return { kind: "field", field };
    }
  }
  return { kind: "ignored", header: normalized };
}

function classifyMemberType(raw) {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (!v || ["visitor", "pending", "applicant", "guest"].includes(v)) {
    return { proposedStatus: "pending", label: "visitor" };
  }
  if (["member", "verified", "active", "active_member"].includes(v)) {
    return { proposedStatus: "verified", label: "member" };
  }
  return { proposedStatus: null, label: null, invalid: true, raw: v };
}

function parseAdminFlag(raw) {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (!v) return false;
  if (["1", "true", "yes", "y", "admin", "administrator", "hq_admin", "branch_admin"].includes(v)) {
    return true;
  }
  return false;
}

module.exports = {
  FORBIDDEN_TENANT_HEADERS,
  HEADER_ALIASES,
  normalizeHeader,
  mapHeader,
  parseCsvText,
  stripFormulaInjection,
  escapeCsvCell,
  rowsToCsv,
  classifyMemberType,
  parseAdminFlag,
};
