"use strict";

/**
 * BlessBoard member duplicate evaluation against the shared person match engine.
 *
 * Phase 2: scoring + policy only. No staff UI. Caller supplies org-scoped candidates
 * (typically from blessboard.members). Does not auto-merge.
 *
 * Policy:
 * - Duplicate Church ID / member_number within organization → BLOCK
 * - Phone / email / name+DOB possibles → WARN
 */

const {
  evaluatePersonDuplicates,
  BLESSBOARD_DUPLICATE_POLICY,
  PERSON_MATCH_CODE,
  PERSON_MATCH_ACTION,
} = require("../../platform/person/duplicate");

/**
 * Minimal presenter — BB UI (later) decides richer fields.
 * Never includes another tenant's data (candidates already org-scoped).
 */
function presentBlessBoardMatch(candidate, scored, decision) {
  return {
    subjectRef: candidate.subjectRef || candidate.id || null,
    matchCode: scored.matchCode,
    reasons: scored.reasons.slice(),
    action: decision.action,
    // Masked contact hints only — products expand in UI phases.
    phonePresent: Boolean(candidate.phoneNormalized),
    emailPresent: Boolean(candidate.emailNormalized),
    nameHint: [candidate.firstName, candidate.lastName]
      .filter(Boolean)
      .join(" ")
      .trim()
      .slice(0, 80) || null,
  };
}

/**
 * @param {{
 *   trusted: { organizationId: string },
 *   probe: object,
 *   candidates: object[],
 *   excludeSubjectRef?: string|null,
 * }} input
 */
function findPotentialBlessBoardMemberDuplicates(input) {
  const src = input && typeof input === "object" ? input : {};
  const organizationId = String(
    (src.trusted && src.trusted.organizationId) || src.organizationId || ""
  ).trim();
  if (!organizationId) {
    return {
      ok: false,
      code: "invalid_input",
      overallMatchCode: PERSON_MATCH_CODE.NO_MATCH,
      action: PERSON_MATCH_ACTION.ALLOW,
      blocking: false,
      matches: [],
    };
  }

  const candidates = (Array.isArray(src.candidates) ? src.candidates : []).map(
    (c) => ({
      ...c,
      organizationId: c.organizationId || organizationId,
      productCode: "blessboard",
      subjectRef: c.subjectRef || c.id || c.memberId || null,
      productIdentifiers: Array.isArray(c.productIdentifiers)
        ? c.productIdentifiers
        : [
            ...(c.memberNumber || c.churchMemberNumber
              ? [
                  {
                    key: "member_number",
                    valueNormalized: String(
                      c.memberNumber || c.churchMemberNumber
                    ).trim(),
                    blocking: true,
                  },
                ]
              : []),
          ],
    })
  );

  return evaluatePersonDuplicates({
    trusted: { organizationId },
    productCode: "blessboard",
    probe: src.probe || {},
    candidates,
    policy: BLESSBOARD_DUPLICATE_POLICY,
    excludeSubjectRef: src.excludeSubjectRef || src.excludeMemberId || null,
    presentMatch: presentBlessBoardMatch,
  });
}

module.exports = {
  findPotentialBlessBoardMemberDuplicates,
  presentBlessBoardMatch,
  BLESSBOARD_DUPLICATE_POLICY,
};
