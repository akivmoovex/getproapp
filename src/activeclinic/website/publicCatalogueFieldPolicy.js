"use strict";

/**
 * PD-V204-AC-P1-02 OPTION A — public-safe doctor/services field allowlist.
 * Allowlist-driven: unknown fields are never exposed on public output.
 */

const PUBLIC_DOCTOR_FIELDS = Object.freeze([
  "id",
  "staffKey",
  "publicDisplayName",
  "displayName",
  "name",
  "publicTitle",
  "title",
  "jobTitle",
  "specialty",
  "publicBio",
  "bio",
  "photoUrl",
  "imageUrl",
  "image",
  "bookingUrl",
  "profilePath",
  "href",
]);

const PUBLIC_SERVICE_FIELDS = Object.freeze([
  "id",
  "serviceKey",
  "publicName",
  "name",
  "title",
  "publicSummary",
  "summary",
  "description",
  "publicDescription",
  "photoUrl",
  "imageUrl",
  "image",
  "href",
  "profilePath",
  "category",
  "durationLabel",
]);

const FORBIDDEN_PUBLIC_FIELD_HINTS = Object.freeze([
  "password",
  "email",
  "phone",
  "mobile",
  "private",
  "internal",
  "login",
  "userId",
  "user_id",
  "identity",
  "ssn",
  "medicare",
  "patient",
  "clinical",
  "note",
  "diagnosis",
  "salary",
  "employment",
  "homeAddress",
  "home_address",
  "hasLogin",
  "editHref",
  "editPath",
]);

/**
 * @param {object|null|undefined} row
 * @param {readonly string[]} allowlist
 * @returns {object|null}
 */
function projectPublicFields(row, allowlist) {
  if (!row || typeof row !== "object") return null;
  const allowed = new Set(allowlist);
  const out = {};
  for (const key of Object.keys(row)) {
    if (!allowed.has(key)) continue;
    const lower = key.toLowerCase();
    if (FORBIDDEN_PUBLIC_FIELD_HINTS.some((h) => lower.includes(String(h).toLowerCase()))) {
      // Defense in depth: never project forbidden-shaped keys even if listed.
      if (
        lower.includes("email") ||
        lower.includes("phone") ||
        lower.includes("login") ||
        lower.includes("patient") ||
        lower.includes("password")
      ) {
        continue;
      }
    }
    out[key] = row[key];
  }
  return out;
}

function projectPublicDoctor(row) {
  return projectPublicFields(row, PUBLIC_DOCTOR_FIELDS);
}

function projectPublicService(row) {
  return projectPublicFields(row, PUBLIC_SERVICE_FIELDS);
}

module.exports = {
  PUBLIC_DOCTOR_FIELDS,
  PUBLIC_SERVICE_FIELDS,
  FORBIDDEN_PUBLIC_FIELD_HINTS,
  projectPublicFields,
  projectPublicDoctor,
  projectPublicService,
};
