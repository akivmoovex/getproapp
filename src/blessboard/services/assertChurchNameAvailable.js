"use strict";

/**
 * Server-side church name uniqueness (normalized name + country code).
 * Idempotent retries of the same linked application/organization are allowed.
 */

const {
  prepareChurchIdentityForUniqueness,
  DUPLICATE_CHURCH_NAME_MESSAGE,
} = require("./normalizeChurchIdentity");

const LIVE_STATUSES = Object.freeze(["active", "inactive", "suspended"]);

/**
 * @param {{ query: Function }} db
 * @param {{
 *   churchName: unknown,
 *   country?: unknown,
 *   countryCode?: unknown,
 *   excludeChurchId?: string|null,
 *   excludeOrganizationId?: string|null,
 *   linkedApplicationId?: string|null,
 * }} input
 * @returns {Promise<
 *   | { ok: true, countryCode: string, normalizedName: string }
 *   | { ok: false, reason: string, message: string, status?: string }
 * >}
 */
async function assertChurchNameAvailable(db, input) {
  const prepared = prepareChurchIdentityForUniqueness(input);
  if (!prepared.ok) {
    return prepared;
  }

  const excludeChurchId =
    input && input.excludeChurchId != null ? String(input.excludeChurchId).trim() : null;
  const excludeOrganizationId =
    input && input.excludeOrganizationId != null
      ? String(input.excludeOrganizationId).trim()
      : null;
  const linkedApplicationId =
    input && input.linkedApplicationId != null
      ? String(input.linkedApplicationId).trim()
      : null;

  // Same application already linked to a church with this identity → idempotent OK.
  if (linkedApplicationId) {
    const linked = await db.query(
      `SELECT c.id, c.organization_id, c.country_code, c.name_uniqueness_key
         FROM blessboard.platform_church_registration_applications a
         JOIN blessboard.churches c ON c.organization_id = a.organization_id
        WHERE a.id = $1
          AND a.organization_id IS NOT NULL
        LIMIT 1`,
      [linkedApplicationId]
    );
    if (linked.rows[0]) {
      return {
        ok: true,
        countryCode: prepared.countryCode,
        normalizedName: prepared.normalizedName,
        idempotent: true,
        churchId: String(linked.rows[0].id),
      };
    }
  }

  const params = [prepared.countryCode, prepared.normalizedName, LIVE_STATUSES];
  let excludeClause = "";
  if (excludeChurchId) {
    params.push(excludeChurchId);
    excludeClause += ` AND c.id <> $${params.length}`;
  }
  if (excludeOrganizationId) {
    params.push(excludeOrganizationId);
    excludeClause += ` AND c.organization_id <> $${params.length}`;
  }

  const existing = await db.query(
    `SELECT c.id, c.display_name, c.country_code, c.status, o.organization_key
       FROM blessboard.churches c
       JOIN platform.organizations o ON o.id = c.organization_id
      WHERE c.country_code = $1
        AND c.name_uniqueness_key = $2
        AND c.status = ANY($3::text[])
        ${excludeClause}
      LIMIT 1`,
    params
  );

  if (existing.rows[0]) {
    return {
      ok: false,
      reason: "duplicate_church_name",
      message: DUPLICATE_CHURCH_NAME_MESSAGE,
      status: "conflict",
    };
  }

  return {
    ok: true,
    countryCode: prepared.countryCode,
    normalizedName: prepared.normalizedName,
  };
}

/**
 * Report live churches sharing the same (country_code, display_name_normalized).
 * Read-only. Never mutates.
 * @param {{ query: Function }} db
 */
async function listChurchNameDuplicateGroups(db) {
  const { rows } = await db.query(
    `SELECT c.country_code,
            c.name_uniqueness_key,
            COUNT(*)::int AS group_count,
            json_agg(json_build_object(
              'churchId', c.id,
              'displayName', c.display_name,
              'countryCode', c.country_code,
              'normalizedName', c.name_uniqueness_key,
              'status', c.status,
              'organizationKey', o.organization_key,
              'dataEnvironment', c.data_environment,
              'appearsTestFixture', (
                c.data_environment = 'testing'
                OR o.data_environment = 'testing'
                OR lower(o.organization_key) LIKE 'test%'
                OR lower(o.organization_key) LIKE '%-test-%'
                OR lower(c.display_name) LIKE '%test%'
              )
            ) ORDER BY c.created_at) AS churches
       FROM blessboard.churches c
       JOIN platform.organizations o ON o.id = c.organization_id
      WHERE c.country_code IS NOT NULL
        AND c.name_uniqueness_key IS NOT NULL
        AND c.name_uniqueness_key <> ''
        AND c.status = ANY($1::text[])
      GROUP BY c.country_code, c.name_uniqueness_key
     HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC, c.country_code, c.name_uniqueness_key`,
    [LIVE_STATUSES]
  );
  return rows.map((r) => ({
    countryCode: r.country_code,
    normalizedName: r.name_uniqueness_key,
    count: Number(r.group_count) || 0,
    churches: Array.isArray(r.churches) ? r.churches : [],
  }));
}

module.exports = {
  LIVE_STATUSES,
  DUPLICATE_CHURCH_NAME_MESSAGE,
  assertChurchNameAvailable,
  listChurchNameDuplicateGroups,
};
