"use strict";

/**
 * Product duplicate policies for the shared person match engine.
 *
 * Platform owns scoring; products own BLOCK vs WARN semantics.
 * AC policy preserves stronger override-required behavior for demographic matches.
 */

const {
  PERSON_MATCH_CODE,
  PERSON_MATCH_ACTION,
} = require("./matchCodes");

/**
 * BlessBoard:
 * - Duplicate Church ID within organization → BLOCK
 * - Possible match by phone / email / name+DOB → WARN
 * - Name-only → WARN (informational; not block)
 */
const BLESSBOARD_DUPLICATE_POLICY = Object.freeze({
  productCode: "blessboard",
  blockingIdentifierKeys: Object.freeze(["church_id", "member_number", "bb.church_id"]),
  decide(match) {
    if (!match || match.matchCode === PERSON_MATCH_CODE.NO_MATCH) {
      return {
        action: PERSON_MATCH_ACTION.ALLOW,
        blocking: false,
        overrideAllowed: false,
      };
    }
    if (match.matchCode === PERSON_MATCH_CODE.EXACT_IDENTIFIER_MATCH) {
      return {
        action: PERSON_MATCH_ACTION.BLOCK,
        blocking: true,
        overrideAllowed: false,
        reason: "duplicate_church_id",
      };
    }
    // Phone / email / name+DOB / name-only → warn, never auto-merge.
    return {
      action: PERSON_MATCH_ACTION.WARN,
      blocking: false,
      overrideAllowed: true,
    };
  },
});

/**
 * ActiveClinic:
 * - Duplicate Patient Number / authoritative identifier → BLOCK (exact)
 * - Strong possible (phone) + probable demographic → WARN_REVIEW with
 *   override required (preserves existing AC stronger gate)
 * - Name-only → non-blocking informational
 */
const ACTIVECLINIC_DUPLICATE_POLICY = Object.freeze({
  productCode: "activeclinic",
  blockingIdentifierKeys: Object.freeze([
    "patient_number",
    "ac.patient_number",
    "nrc",
    "passport",
    "national_id",
  ]),
  decide(match) {
    if (!match || match.matchCode === PERSON_MATCH_CODE.NO_MATCH) {
      return {
        action: PERSON_MATCH_ACTION.ALLOW,
        blocking: false,
        overrideAllowed: false,
      };
    }
    if (match.matchCode === PERSON_MATCH_CODE.EXACT_IDENTIFIER_MATCH) {
      return {
        action: PERSON_MATCH_ACTION.BLOCK,
        blocking: true,
        // Authoritative ID / patient number conflicts are not soft-overridable
        // at the match layer (AC also has separate identifier_conflict path).
        overrideAllowed: false,
        reason: "duplicate_patient_identifier",
      };
    }
    const reasons = Array.isArray(match.reasons) ? match.reasons : [];
    const nameOnly =
      reasons.includes("name_only") || reasons.includes("name_normalized");
    if (
      match.matchCode === PERSON_MATCH_CODE.POSSIBLE_MATCH &&
      nameOnly &&
      reasons.length === 1
    ) {
      return {
        action: PERSON_MATCH_ACTION.WARN,
        blocking: false,
        overrideAllowed: true,
      };
    }
    // Phone exact + email/name + name/DOB: preserve AC override-required gate.
    return {
      action: PERSON_MATCH_ACTION.WARN_REVIEW,
      blocking: true,
      overrideAllowed: true,
      reason: "duplicate_override_required",
    };
  },
});

/**
 * Baseline (product-neutral) — warn on possibles, block only exact identifiers.
 */
const BASELINE_DUPLICATE_POLICY = Object.freeze({
  productCode: "platform",
  blockingIdentifierKeys: Object.freeze([]),
  decide(match) {
    if (!match || match.matchCode === PERSON_MATCH_CODE.NO_MATCH) {
      return {
        action: PERSON_MATCH_ACTION.ALLOW,
        blocking: false,
        overrideAllowed: false,
      };
    }
    if (match.matchCode === PERSON_MATCH_CODE.EXACT_IDENTIFIER_MATCH) {
      return {
        action: PERSON_MATCH_ACTION.BLOCK,
        blocking: true,
        overrideAllowed: false,
      };
    }
    return {
      action: PERSON_MATCH_ACTION.WARN,
      blocking: false,
      overrideAllowed: true,
    };
  },
});

module.exports = {
  BLESSBOARD_DUPLICATE_POLICY,
  ACTIVECLINIC_DUPLICATE_POLICY,
  BASELINE_DUPLICATE_POLICY,
};
