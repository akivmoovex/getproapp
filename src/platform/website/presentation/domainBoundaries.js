"use strict";

/**
 * Domain-boundary rules for website presentation adapters.
 *
 * Products may map domain entities → presentation DTOs.
 * Products must NEVER merge distinct domain catalogues into one table or
 * identity space.
 */

const FORBIDDEN_DOMAIN_MERGES = Object.freeze([
  Object.freeze({
    id: "doctor_pastor",
    left: Object.freeze({ product: "activeclinic", domain: "doctor", source: "staff/ops + cms.library" }),
    right: Object.freeze({ product: "blessboard", domain: "pastor_leader", source: "blessboard.leaders" }),
    presentation: "person",
    rule: "Share PersonPresentation only — never merge clinical and pastoral records",
  }),
  Object.freeze({
    id: "service_ministry",
    left: Object.freeze({ product: "activeclinic", domain: "clinical_service", source: "ops + cms.library" }),
    right: Object.freeze({ product: "blessboard", domain: "ministry", source: "ministries entity" }),
    presentation: "collection_card",
    rule: "Share CollectionCardPresentation only — never unify catalogues",
  }),
  Object.freeze({
    id: "appointment_event",
    left: Object.freeze({ product: "activeclinic", domain: "appointment_booking", source: "booking domain" }),
    right: Object.freeze({ product: "blessboard", domain: "church_event", source: "events entity" }),
    presentation: null,
    rule: "Do not share calendar identity; dated presentation cards stay product-local when needed",
  }),
  Object.freeze({
    id: "sermon_clinical",
    left: Object.freeze({ product: "blessboard", domain: "sermon", source: "sermons entity" }),
    right: Object.freeze({ product: "activeclinic", domain: "clinical_content", source: "patient/clinical pages" }),
    presentation: null,
    rule: "Sermon and clinical content remain product-owned Class C",
  }),
]);

const FORBIDDEN_MERGE_ID_SET = new Set(FORBIDDEN_DOMAIN_MERGES.map((m) => m.id));

/**
 * @param {string} mergeId
 * @returns {boolean}
 */
function isForbiddenDomainMerge(mergeId) {
  return FORBIDDEN_MERGE_ID_SET.has(String(mergeId || "").trim());
}

/**
 * Assert two domain kinds must not share identity storage.
 * @param {string} leftDomain
 * @param {string} rightDomain
 * @returns {{ ok: boolean, code?: string, rule?: string }}
 */
function assertDomainBoundary(leftDomain, rightDomain) {
  const left = String(leftDomain || "").trim().toLowerCase();
  const right = String(rightDomain || "").trim().toLowerCase();
  if (!left || !right || left === right) {
    return { ok: true };
  }
  for (const merge of FORBIDDEN_DOMAIN_MERGES) {
    const a = merge.left.domain;
    const b = merge.right.domain;
    if ((left === a && right === b) || (left === b && right === a)) {
      return { ok: false, code: "forbidden_domain_merge", rule: merge.rule, mergeId: merge.id };
    }
  }
  return { ok: true };
}

module.exports = {
  FORBIDDEN_DOMAIN_MERGES,
  isForbiddenDomainMerge,
  assertDomainBoundary,
};
