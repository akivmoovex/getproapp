"use strict";

/**
 * Product adapter contract for staff-managed person workflow (V2.04 Phase 3).
 *
 * Platform owns orchestration only. Products own:
 * - product identifier (Church ID / Patient Number)
 * - required product fields
 * - product relationship creation
 * - relationship / membership / patient status
 * - organization/location assignment
 * - duplicate policy
 * - product permissions
 * - product-specific validation
 *
 * Clinical data must never enter platform orchestration.
 */

/**
 * @typedef {object} StaffPersonProductAdapter
 * @property {string} productCode
 * @property {string} relationshipKey
 * @property {string} [createPermissionKey]
 * @property {object} [duplicatePolicy]
 * @property {Function} [presentMatch]
 * @property {(db: object, ctx: object) => Promise<{ok:boolean, code?:string}>} authorize
 * @property {(input: object) => object} normalizeProductFields
 * @property {(db: object, ctx: object) => Promise<{ok:boolean, candidates?:object[], code?:string}>} loadDuplicateCandidates
 * @property {(db: object, ctx: object) => Promise<{
 *   ok: boolean,
 *   code?: string,
 *   subjectRef?: string,
 *   productRecord?: object,
 *   productIdentifier?: string|null,
 *   relationshipStatus?: string|null,
 *   portalAccessStatus?: string|null,
 *   location?: object|null,
 * }>} createProductRelationship
 */

function assertStaffPersonAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") {
    return { ok: false, code: "adapter_missing" };
  }
  const required = [
    "productCode",
    "relationshipKey",
    "authorize",
    "normalizeProductFields",
    "loadDuplicateCandidates",
    "createProductRelationship",
  ];
  for (const key of required) {
    if (adapter[key] == null) {
      return { ok: false, code: "adapter_incomplete", missing: key };
    }
  }
  if (typeof adapter.authorize !== "function") {
    return { ok: false, code: "adapter_incomplete", missing: "authorize" };
  }
  if (typeof adapter.normalizeProductFields !== "function") {
    return { ok: false, code: "adapter_incomplete", missing: "normalizeProductFields" };
  }
  if (typeof adapter.loadDuplicateCandidates !== "function") {
    return { ok: false, code: "adapter_incomplete", missing: "loadDuplicateCandidates" };
  }
  if (typeof adapter.createProductRelationship !== "function") {
    return {
      ok: false,
      code: "adapter_incomplete",
      missing: "createProductRelationship",
    };
  }
  return { ok: true };
}

module.exports = {
  assertStaffPersonAdapter,
};
