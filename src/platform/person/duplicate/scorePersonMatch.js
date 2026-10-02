"use strict";

/**
 * Pure person-pair match scoring (no DB, no product requires).
 *
 * Extracted from ActiveClinic duplicate rules and generalized:
 * - authoritative / product identifier exact → EXACT_IDENTIFIER_MATCH
 * - phone exact alone → STRONG_POSSIBLE_MATCH (shared phones remain possible)
 * - email + similar name → POSSIBLE_MATCH (AC treated as moderate)
 * - name + DOB → POSSIBLE_MATCH
 * - name only → POSSIBLE_MATCH (informational; policies decide warn vs ignore)
 *
 * Does not merge. Does not fetch candidates.
 */

const {
  PERSON_MATCH_CODE,
  maxMatchCode,
} = require("./matchCodes");

function similarName(a, b) {
  return (
    String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase()
  );
}

function toDateOnly(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return null;
}

function normalizeNamePart(value) {
  const s = String(value || "")
    .trim()
    .replace(/\s+/g, " ");
  return s || null;
}

/**
 * Score one probe against one candidate.
 *
 * @param {{
 *   phoneNormalized?: string|null,
 *   emailNormalized?: string|null,
 *   firstName?: string|null,
 *   lastName?: string|null,
 *   nameNormalized?: string|null,
 *   dateOfBirth?: string|Date|null,
 *   productIdentifiers?: Array<{
 *     key: string,
 *     valueNormalized: string,
 *     blocking?: boolean,
 *   }>,
 * }} probe
 * @param {{
 *   id?: string,
 *   subjectRef?: string,
 *   organizationId?: string,
 *   productCode?: string,
 *   phoneNormalized?: string|null,
 *   emailNormalized?: string|null,
 *   firstName?: string|null,
 *   lastName?: string|null,
 *   nameNormalized?: string|null,
 *   dateOfBirth?: string|Date|null,
 *   productIdentifiers?: Array<{
 *     key: string,
 *     valueNormalized: string,
 *     blocking?: boolean,
 *   }>,
 * }} candidate
 * @returns {{
 *   matchCode: string,
 *   reasons: string[],
 *   signals: object,
 * }}
 */
function scorePersonMatch(probe, candidate) {
  const p = probe && typeof probe === "object" ? probe : {};
  const c = candidate && typeof candidate === "object" ? candidate : {};
  const reasons = [];
  let matchCode = PERSON_MATCH_CODE.NO_MATCH;
  const signals = {
    exactIdentifier: false,
    phoneExact: false,
    emailAndName: false,
    nameAndDob: false,
    nameOnly: false,
    samePhoneDifferentIdentityHint: false,
  };

  const probeIds = Array.isArray(p.productIdentifiers) ? p.productIdentifiers : [];
  const candIds = Array.isArray(c.productIdentifiers) ? c.productIdentifiers : [];
  for (const pid of probeIds) {
    const key = String((pid && pid.key) || "").trim();
    const value = String((pid && pid.valueNormalized) || "").trim();
    if (!key || !value) continue;
    const hit = candIds.find(
      (x) =>
        String((x && x.key) || "").trim() === key &&
        String((x && x.valueNormalized) || "").trim() === value
    );
    if (hit) {
      signals.exactIdentifier = true;
      reasons.push(`identifier:${key}`);
      matchCode = maxMatchCode(matchCode, PERSON_MATCH_CODE.EXACT_IDENTIFIER_MATCH);
    }
  }

  const probePhone = p.phoneNormalized ? String(p.phoneNormalized).trim() : "";
  const candPhone = c.phoneNormalized ? String(c.phoneNormalized).trim() : "";
  if (probePhone && candPhone && probePhone === candPhone) {
    signals.phoneExact = true;
    reasons.push("phone_exact");
    // Shared / family phones are legitimate — never EXACT_IDENTIFIER_MATCH.
    matchCode = maxMatchCode(matchCode, PERSON_MATCH_CODE.STRONG_POSSIBLE_MATCH);

    const namesDiffer =
      (normalizeNamePart(p.firstName) &&
        normalizeNamePart(c.firstName) &&
        !similarName(p.firstName, c.firstName)) ||
      (normalizeNamePart(p.lastName) &&
        normalizeNamePart(c.lastName) &&
        !similarName(p.lastName, c.lastName));
    if (namesDiffer) {
      signals.samePhoneDifferentIdentityHint = true;
      reasons.push("shared_phone_possible");
    }
  }

  const probeEmail = p.emailNormalized
    ? String(p.emailNormalized).trim().toLowerCase()
    : "";
  const candEmail = c.emailNormalized
    ? String(c.emailNormalized).trim().toLowerCase()
    : "";
  if (
    probeEmail &&
    candEmail &&
    probeEmail === candEmail &&
    (similarName(p.firstName, c.firstName) || similarName(p.lastName, c.lastName))
  ) {
    signals.emailAndName = true;
    reasons.push("email_and_name");
    matchCode = maxMatchCode(matchCode, PERSON_MATCH_CODE.POSSIBLE_MATCH);
  }

  const probeDob = toDateOnly(p.dateOfBirth);
  const candDob = toDateOnly(c.dateOfBirth);
  if (
    probeDob &&
    candDob &&
    probeDob === candDob &&
    similarName(p.firstName, c.firstName) &&
    similarName(p.lastName, c.lastName)
  ) {
    signals.nameAndDob = true;
    reasons.push("name_and_dob");
    matchCode = maxMatchCode(matchCode, PERSON_MATCH_CODE.POSSIBLE_MATCH);
  }

  if (
    similarName(p.firstName, c.firstName) &&
    similarName(p.lastName, c.lastName) &&
    !reasons.length
  ) {
    signals.nameOnly = true;
    reasons.push("name_only");
    matchCode = maxMatchCode(matchCode, PERSON_MATCH_CODE.POSSIBLE_MATCH);
  }

  // Optional full-name normalized equality when first/last parts absent on one side.
  if (
    !reasons.length &&
    p.nameNormalized &&
    c.nameNormalized &&
    String(p.nameNormalized).trim().toLowerCase() ===
      String(c.nameNormalized).trim().toLowerCase()
  ) {
    signals.nameOnly = true;
    reasons.push("name_normalized");
    matchCode = maxMatchCode(matchCode, PERSON_MATCH_CODE.POSSIBLE_MATCH);
  }

  return {
    matchCode,
    reasons,
    signals,
  };
}

/**
 * Map shared match code + reasons onto legacy AC strength labels
 * so ActiveClinic UI / tests keep working.
 *
 * @param {string} matchCode
 * @param {string[]} reasons
 * @returns {"strong"|"moderate"|"weak"|null}
 */
function toActiveClinicMatchStrength(matchCode, reasons) {
  const list = Array.isArray(reasons) ? reasons : [];
  if (matchCode === PERSON_MATCH_CODE.EXACT_IDENTIFIER_MATCH) return "strong";
  if (matchCode === PERSON_MATCH_CODE.STRONG_POSSIBLE_MATCH) return "strong";
  if (matchCode === PERSON_MATCH_CODE.POSSIBLE_MATCH) {
    if (list.includes("name_only") || list.includes("name_normalized")) {
      return "weak";
    }
    return "moderate";
  }
  return null;
}

module.exports = {
  similarName,
  toDateOnly,
  scorePersonMatch,
  toActiveClinicMatchStrength,
};
