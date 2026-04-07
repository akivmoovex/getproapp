"use strict";

const { getPgPool } = require("../db/pg");
const tenantsRepo = require("../db/pg/tenantsRepo");

/**
 * Resolves tenant for join/callback/leads APIs.
 *
 * @param {object} body
 * @returns {Promise<{ tenantId: number } | { error: string }>}
 */
async function resolveTenantIdStrict(body) {
  const pool = getPgPool();
  const rawId = body && body.tenantId != null ? Number(body.tenantId) : NaN;
  if (Number.isFinite(rawId) && rawId > 0) {
    const row = await tenantsRepo.getIdSlugById(pool, rawId);
    if (!row) return { error: "Invalid tenant id." };
    const slugFromBody = String((body && body.tenantSlug) || "")
      .trim()
      .toLowerCase();
    if (slugFromBody && row.slug !== slugFromBody) {
      return { error: "Tenant id and slug do not match." };
    }
    return { tenantId: row.id };
  }

  const slug = String((body && body.tenantSlug) || "")
    .trim()
    .toLowerCase();
  if (!slug) return { error: "tenantId or tenantSlug is required." };
  const idRow = await tenantsRepo.getIdBySlug(pool, slug);
  if (!idRow) return { error: "Unknown tenant slug." };
  return { tenantId: idRow.id };
}

module.exports = { resolveTenantIdStrict };
