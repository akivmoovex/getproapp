"use strict";

/**
 * Trusted org / location scope for person primitives.
 * Never trust client-supplied organization / branch / facility IDs.
 */

const {
  rejectForgedTenantIdentifiers,
} = require("../rbac/sharedTenantScope");
const { PRODUCT_CODES } = require("./personConstants");

/**
 * @param {string} productCode
 */
function assertProductCode(productCode) {
  const code = String(productCode || "")
    .trim()
    .toLowerCase();
  if (!PRODUCT_CODES.includes(code)) {
    return { ok: false, code: "invalid_product_code", productCode: code };
  }
  return { ok: true, code: "ok", productCode: code };
}

/**
 * @param {{
 *   trusted: {
 *     organizationId: string,
 *     branchId?: string|null,
 *     facilityId?: string|null,
 *   },
 *   body?: object|null,
 *   query?: object|null,
 * }} input
 */
function assertTrustedPersonScope(input) {
  const trusted = (input && input.trusted) || null;
  const organizationId =
    trusted && trusted.organizationId
      ? String(trusted.organizationId).trim()
      : "";
  if (!organizationId) {
    return {
      ok: false,
      code: "tenant_unresolved",
      reasonCode: "RBAC_TENANT_UNRESOLVED",
      httpStatus: 403,
    };
  }
  const forged = rejectForgedTenantIdentifiers({
    body: input && input.body,
    query: input && input.query,
    trusted: {
      organizationId,
      facilityId: trusted.facilityId || null,
      branchId: trusted.branchId || null,
    },
    allowMatchingTrusted: true,
  });
  if (!forged.ok) return forged;
  return {
    ok: true,
    code: "ok",
    organizationId,
    branchId: trusted.branchId ? String(trusted.branchId) : null,
    facilityId: trusted.facilityId ? String(trusted.facilityId) : null,
  };
}

module.exports = {
  assertProductCode,
  assertTrustedPersonScope,
};
