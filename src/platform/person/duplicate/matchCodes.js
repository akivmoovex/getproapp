"use strict";

/**
 * Shared person duplicate / match result contract (V2.04 Phase 2).
 *
 * Phone-alone never means two people are identical (family/shared phones).
 * Exact product identifiers (Church ID, Patient Number, NRC, …) are separate.
 * No automatic merge.
 */

const PERSON_MATCH_CODE = Object.freeze({
  EXACT_IDENTIFIER_MATCH: "EXACT_IDENTIFIER_MATCH",
  STRONG_POSSIBLE_MATCH: "STRONG_POSSIBLE_MATCH",
  POSSIBLE_MATCH: "POSSIBLE_MATCH",
  NO_MATCH: "NO_MATCH",
});

const PERSON_MATCH_RANK = Object.freeze({
  [PERSON_MATCH_CODE.EXACT_IDENTIFIER_MATCH]: 3,
  [PERSON_MATCH_CODE.STRONG_POSSIBLE_MATCH]: 2,
  [PERSON_MATCH_CODE.POSSIBLE_MATCH]: 1,
  [PERSON_MATCH_CODE.NO_MATCH]: 0,
});

const PERSON_MATCH_ACTION = Object.freeze({
  BLOCK: "BLOCK",
  WARN: "WARN",
  WARN_REVIEW: "WARN_REVIEW",
  ALLOW: "ALLOW",
});

/**
 * @param {string} a
 * @param {string} b
 */
function maxMatchCode(a, b) {
  const left = PERSON_MATCH_RANK[a] || 0;
  const right = PERSON_MATCH_RANK[b] || 0;
  return left >= right ? a : b;
}

module.exports = {
  PERSON_MATCH_CODE,
  PERSON_MATCH_RANK,
  PERSON_MATCH_ACTION,
  maxMatchCode,
};
