"use strict";

/**
 * Deterministic identity merge categories for unified V7 DB imports.
 */

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function normalizePhoneE164(phone) {
  const s = String(phone || "").trim();
  if (!s) return "";
  if (/^\+[1-9]\d{6,14}$/.test(s)) return s;
  return s.replace(/\s+/g, "");
}

/**
 * @param {Map<string, object>} byEmail
 * @param {Map<string, object>} byPhone
 * @param {{ email?: string, phone?: string, source: string, legacyId: string }} candidate
 */
function classifyIdentityCollision(indexes, candidate) {
  const email = normalizeEmail(candidate.email);
  const phone = normalizePhoneE164(candidate.phone);
  if (!email && !phone) {
    return { category: "no_match", action: "create_new" };
  }

  const byEmail = indexes.byEmail || new Map();
  const byPhone = indexes.byPhone || new Map();
  const byEmailRow = email ? byEmail.get(email) : null;
  const byPhoneRow = phone ? byPhone.get(phone) : null;

  if (byEmailRow && byPhoneRow && byEmailRow.identityId !== byPhoneRow.identityId) {
    return {
      category: "ambiguous_match",
      action: "operator_review",
      reason: "email_phone_cross_conflict",
      existingSource: byEmailRow.source,
    };
  }

  const existing = byEmailRow || byPhoneRow;
  if (existing) {
    if (email && byEmailRow && phone && byEmailRow.phone && byEmailRow.phone !== phone) {
      return {
        category: "ambiguous_match",
        action: "operator_review",
        reason: "email_match_phone_mismatch",
        existingSource: byEmailRow.source,
      };
    }
    if (phone && byPhoneRow && email && byPhoneRow.email && byPhoneRow.email !== email) {
      return {
        category: "ambiguous_match",
        action: "operator_review",
        reason: "phone_match_email_mismatch",
        existingSource: byPhoneRow.source,
      };
    }
    return {
      category: "exact_safe_match",
      action: "reuse_identity",
      targetIdentityId: existing.identityId,
      existingSource: existing.source,
    };
  }

  return { category: "no_match", action: "create_new" };
}

/**
 * @param {Array<{ email?: string, phone?: string, source: string, legacyId: string, identityId?: string }>} rows
 */
function buildIdentityIndex(rows) {
  return buildIdentityIndexes(rows);
}

function buildIdentityIndexes(rows) {
  const byEmail = new Map();
  const byPhone = new Map();
  const normalizedRows = [];
  for (const row of rows) {
    const email = normalizeEmail(row.email);
    const phone = normalizePhoneE164(row.phone);
    const entry = {
      identityId: row.identityId,
      email,
      phone,
      source: row.source,
      legacyId: row.legacyId,
    };
    normalizedRows.push(entry);
    if (email) byEmail.set(email, entry);
    if (phone && !byPhone.has(phone)) byPhone.set(phone, entry);
  }
  return { byEmail, byPhone, rows: normalizedRows };
}

function summarizeCollisions(results) {
  const counts = { exact_safe_match: 0, ambiguous_match: 0, no_match: 0 };
  for (const r of results) counts[r.category] = (counts[r.category] || 0) + 1;
  return counts;
}

module.exports = {
  normalizeEmail,
  normalizePhoneE164,
  classifyIdentityCollision,
  buildIdentityIndex,
  buildIdentityIndexes,
  summarizeCollisions,
};
