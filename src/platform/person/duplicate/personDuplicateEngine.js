"use strict";

/**
 * Shared person duplicate / match engine (V2.04 Phase 2).
 *
 * Caller supplies tenant-scoped candidates. The engine never queries other
 * tenants and never auto-merges. Product adapters decide presentation + policy.
 */

const {
  PERSON_MATCH_CODE,
  PERSON_MATCH_RANK,
  PERSON_MATCH_ACTION,
  maxMatchCode,
} = require("./matchCodes");
const { scorePersonMatch } = require("./scorePersonMatch");
const { BASELINE_DUPLICATE_POLICY } = require("./duplicatePolicies");

/**
 * Default presenter — strips PII. Products replace via adapter.presentMatch.
 * @param {object} candidate
 * @param {object} scored
 */
function defaultPresentMatch(candidate, scored) {
  return {
    subjectRef: candidate.subjectRef || candidate.id || null,
    matchCode: scored.matchCode,
    reasons: scored.reasons.slice(),
    // Intentionally no phone/email/name — products must opt in via adapter.
  };
}

/**
 * Ensure every candidate belongs to the trusted organization.
 * @param {object} trusted
 * @param {object[]} candidates
 */
function assertCandidateTenantIsolation(trusted, candidates) {
  const organizationId = String(
    (trusted && trusted.organizationId) || ""
  ).trim();
  if (!organizationId) {
    return {
      ok: false,
      code: "tenant_unresolved",
      reasonCode: "RBAC_TENANT_UNRESOLVED",
    };
  }
  const list = Array.isArray(candidates) ? candidates : [];
  for (const c of list) {
    const candOrg = String((c && c.organizationId) || "").trim();
    if (!candOrg || candOrg.toLowerCase() !== organizationId.toLowerCase()) {
      return {
        ok: false,
        code: "cross_tenant_candidate_rejected",
        reasonCode: "PERSON_MATCH_TENANT_ISOLATION",
      };
    }
  }
  return { ok: true, organizationId };
}

/**
 * Reject candidates from a different product unless explicitly allowed.
 * @param {string} productCode
 * @param {object[]} candidates
 * @param {{ allowCrossProduct?: boolean }} [options]
 */
function assertCandidateProductIsolation(productCode, candidates, options) {
  if (options && options.allowCrossProduct === true) {
    return { ok: true };
  }
  const expected = String(productCode || "")
    .trim()
    .toLowerCase();
  if (!expected) {
    return { ok: false, code: "product_code_required" };
  }
  const list = Array.isArray(candidates) ? candidates : [];
  for (const c of list) {
    const candProduct = String((c && c.productCode) || "")
      .trim()
      .toLowerCase();
    if (candProduct && candProduct !== expected) {
      return {
        ok: false,
        code: "cross_product_candidate_rejected",
        reasonCode: "PERSON_MATCH_PRODUCT_ISOLATION",
      };
    }
  }
  return { ok: true };
}

/**
 * Evaluate probe against pre-scoped candidates.
 *
 * @param {{
 *   trusted: { organizationId: string },
 *   productCode: string,
 *   probe: object,
 *   candidates: object[],
 *   policy?: object,
 *   presentMatch?: Function,
 *   excludeSubjectRef?: string|null,
 *   allowCrossProduct?: boolean,
 * }} input
 */
function evaluatePersonDuplicates(input) {
  const src = input && typeof input === "object" ? input : {};
  const candidates = Array.isArray(src.candidates) ? src.candidates : [];

  const tenant = assertCandidateTenantIsolation(src.trusted, candidates);
  if (!tenant.ok) {
    return {
      ok: false,
      code: tenant.code,
      reasonCode: tenant.reasonCode,
      overallMatchCode: PERSON_MATCH_CODE.NO_MATCH,
      action: PERSON_MATCH_ACTION.ALLOW,
      blocking: false,
      matches: [],
    };
  }

  const productGate = assertCandidateProductIsolation(
    src.productCode,
    candidates,
    { allowCrossProduct: src.allowCrossProduct === true }
  );
  if (!productGate.ok) {
    return {
      ok: false,
      code: productGate.code,
      reasonCode: productGate.reasonCode,
      overallMatchCode: PERSON_MATCH_CODE.NO_MATCH,
      action: PERSON_MATCH_ACTION.ALLOW,
      blocking: false,
      matches: [],
    };
  }

  const policy =
    src.policy && typeof src.policy.decide === "function"
      ? src.policy
      : BASELINE_DUPLICATE_POLICY;
  const present =
    typeof src.presentMatch === "function"
      ? src.presentMatch
      : defaultPresentMatch;

  const exclude = src.excludeSubjectRef
    ? String(src.excludeSubjectRef).trim()
    : "";

  const matches = [];
  let overallMatchCode = PERSON_MATCH_CODE.NO_MATCH;

  for (const candidate of candidates) {
    const subjectRef = String(
      (candidate && (candidate.subjectRef || candidate.id)) || ""
    ).trim();
    if (exclude && subjectRef === exclude) continue;

    const scored = scorePersonMatch(src.probe, candidate);
    if (scored.matchCode === PERSON_MATCH_CODE.NO_MATCH) continue;

    const decision = policy.decide(scored);
    const presentation = present(candidate, scored, decision) || {};

    matches.push({
      subjectRef: subjectRef || null,
      matchCode: scored.matchCode,
      reasons: scored.reasons.slice(),
      signals: { ...scored.signals },
      action: decision.action,
      blocking: decision.blocking === true,
      overrideAllowed: decision.overrideAllowed === true,
      decisionReason: decision.reason || null,
      display: presentation,
    });

    overallMatchCode = maxMatchCode(overallMatchCode, scored.matchCode);
  }

  matches.sort(
    (a, b) =>
      (PERSON_MATCH_RANK[b.matchCode] || 0) - (PERSON_MATCH_RANK[a.matchCode] || 0)
  );

  const overallDecision = policy.decide({
    matchCode: overallMatchCode,
    reasons: matches[0] ? matches[0].reasons : [],
  });

  // If any match is blocking under policy, overall blocks.
  const anyBlocking = matches.some((m) => m.blocking);
  const action = anyBlocking
    ? matches.find((m) => m.blocking).action
    : overallDecision.action;

  return {
    ok: true,
    code: "ok",
    organizationId: tenant.organizationId,
    productCode: String(src.productCode || "")
      .trim()
      .toLowerCase(),
    overallMatchCode,
    action: anyBlocking ? action : overallDecision.action || PERSON_MATCH_ACTION.ALLOW,
    blocking: anyBlocking,
    overrideAllowed:
      anyBlocking
        ? matches.some((m) => m.blocking && m.overrideAllowed)
        : overallDecision.overrideAllowed === true,
    matches,
  };
}

module.exports = {
  evaluatePersonDuplicates,
  assertCandidateTenantIsolation,
  assertCandidateProductIsolation,
  defaultPresentMatch,
};
