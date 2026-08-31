"use strict";

/**
 * Shared organization_key allocation for BlessBoard, ActiveClinic, and future products.
 */

const {
  normalizeOrganizationKey,
  resolveBaseOrganizationKey,
  withOrganizationKeySuffix,
} = require("../../blessboard/services/organizationKey");

class OrganizationKeyAllocationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OrganizationKeyAllocationError";
    this.code = code;
  }
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationKey
 */
async function assertOrganizationKeyAvailable(client, organizationKey) {
  const r = await client.query(
    `SELECT id FROM platform.organizations WHERE organization_key = $1 LIMIT 1`,
    [organizationKey]
  );
  if (r.rows[0]) {
    throw new OrganizationKeyAllocationError("slug_unavailable", "slug_unavailable");
  }
}

/**
 * @param {{ query: Function }} client
 * @param {{ preferredKey?: string|null, displayName?: string|null, exactPreferred?: boolean }} input
 * @returns {Promise<string>}
 */
async function allocateUniqueOrganizationKey(client, input) {
  const preferred = String((input && input.preferredKey) || "").trim();
  const displayName = String((input && (input.displayName || input.churchName || input.clinicName)) || "").trim();
  const exactPreferred = Boolean(input && input.exactPreferred && preferred);

  if (exactPreferred) {
    const keyNorm = normalizeOrganizationKey(preferred);
    if (!keyNorm.ok) {
      throw new OrganizationKeyAllocationError(
        keyNorm.reason === "reserved_key" ? "slug_unavailable" : "invalid_input",
        keyNorm.reason
      );
    }
    await assertOrganizationKeyAvailable(client, keyNorm.key);
    return keyNorm.key;
  }

  const base = resolveBaseOrganizationKey(preferred || displayName);
  if (!base.ok) {
    throw new OrganizationKeyAllocationError(
      base.reason === "reserved_key" ? "slug_unavailable" : "invalid_input",
      base.reason
    );
  }

  for (let n = 1; n <= 200; n += 1) {
    const candidateRaw = withOrganizationKeySuffix(base.key, n);
    const candidate = normalizeOrganizationKey(candidateRaw);
    if (!candidate.ok) continue;
    const r = await client.query(
      `SELECT id FROM platform.organizations WHERE organization_key = $1 LIMIT 1`,
      [candidate.key]
    );
    if (!r.rows[0]) return candidate.key;
  }
  throw new OrganizationKeyAllocationError("slug_unavailable", "slug_unavailable");
}

module.exports = {
  OrganizationKeyAllocationError,
  allocateUniqueOrganizationKey,
  assertOrganizationKeyAvailable,
};
