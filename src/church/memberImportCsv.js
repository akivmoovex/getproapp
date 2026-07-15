"use strict";

/**
 * CSV helpers for member import.
 * - Flexible header aliases
 * - Ignores organisation/tenant selectors from CSV
 * - Formula-injection safe error export cells
 */

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

function normalizeHeader(raw) {
  return String(raw || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function mapHeader(normalized) {
  if (FORBIDDEN_TENANT_HEADERS.has(normalized)) {
    return { kind: "forbidden_tenant", header: normalized };
  }
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(normalized)) {
      return { kind: "field", field };
    }
  }
  return { kind: "unknown", header: normalized };
}

/**
 * Minimal RFC4180-style CSV parse (UTF-8 text).
 * @param {string} text
 * @returns {{ headers: string[], rows: string[][] }}
 */
function parseCsvText(text) {
  const input = String(text || "").replace(/^\uFEFF/, "");
  if (!input.trim()) {
    return { headers: [], rows: [] };
  }

  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (ch === "\r") {
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  if (row.length > 1 || String(row[0] || "").trim() !== "") {
    rows.push(row);
  }

  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => String(h || "").trim());
  return { headers, rows: rows.slice(1) };
}

function stripFormulaInjection(value) {
  const s = String(value == null ? "" : value);
  if (/^[=+\-@\t\r]/.test(s)) {
    return `'${s}`;
  }
  return s;
}

function escapeCsvCell(value) {
  const safe = stripFormulaInjection(value);
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function rowsToCsv(headers, dataRows) {
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const r of dataRows) {
    lines.push(headers.map((h) => escapeCsvCell(r[h] != null ? r[h] : "")).join(","));
  }
  return `${lines.join("\n")}\n`;
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
