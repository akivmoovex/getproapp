"use strict";

const { normalizeLocationName, canonicalLocationName } = require("./locationNormalization");

/**
 * @param {{ query: Function }} db
 */
async function tableExists(db) {
  try {
    const r = await db.query(
      `SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'platform'
          AND table_name = 'geographic_locations'
        LIMIT 1`
    );
    return Boolean(r.rows[0]);
  } catch {
    return false;
  }
}

/**
 * @param {{ query: Function }} db
 * @param {{ countryCode: string, query: string, limit?: number }} input
 */
async function searchLocations(db, input) {
  const countryCode = String((input && input.countryCode) || "")
    .trim()
    .toUpperCase();
  const q = normalizeLocationName(input && input.query);
  const limit = Math.min(Math.max(Number(input && input.limit) || 12, 1), 25);
  if (!countryCode || !/^[A-Z]{2}$/.test(countryCode)) {
    return [];
  }
  if (!(await tableExists(db))) return [];

  const params = [countryCode];
  let where = `country_code = $1 AND approval_status IN ('approved', 'pending')`;
  if (q) {
    params.push(`${q}%`);
    params.push(`%${q}%`);
    where += ` AND (normalized_name LIKE $2 OR normalized_name LIKE $3 OR name ILIKE $3)`;
  }
  params.push(limit);
  const limitParam = `$${params.length}`;
  const prefixParam = q ? "$2" : "''";
  const r = await db.query(
    `SELECT id, country_code, name, normalized_name, province_region, source, approval_status
       FROM platform.geographic_locations
      WHERE ${where}
      ORDER BY
        CASE approval_status WHEN 'approved' THEN 0 ELSE 1 END,
        CASE WHEN ${prefixParam} <> '' AND normalized_name LIKE ${prefixParam} THEN 0 ELSE 1 END,
        name ASC
      LIMIT ${limitParam}`,
    params
  );
  return r.rows.map((row) => ({
    id: row.id,
    countryCode: row.country_code,
    name: row.name,
    normalizedName: row.normalized_name,
    provinceRegion: row.province_region,
    source: row.source,
    approvalStatus: row.approval_status,
  }));
}

/**
 * @param {{ query: Function }} db
 * @param {{ id: string, countryCode: string }} input
 */
async function findLocationByIdForCountry(db, input) {
  const id = String((input && input.id) || "").trim();
  const countryCode = String((input && input.countryCode) || "")
    .trim()
    .toUpperCase();
  if (!id || !countryCode || !(await tableExists(db))) return null;
  const r = await db.query(
    `SELECT id, country_code, name, normalized_name, province_region, source, approval_status
       FROM platform.geographic_locations
      WHERE id = $1
        AND country_code = $2
        AND approval_status IN ('approved', 'pending')
      LIMIT 1`,
    [id, countryCode]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    countryCode: row.country_code,
    name: row.name,
    normalizedName: row.normalized_name,
    provinceRegion: row.province_region,
    source: row.source,
    approvalStatus: row.approval_status,
  };
}

/**
 * @param {{ query: Function }} db
 * @param {{
 *   countryCode: string,
 *   name: string,
 *   provinceRegion?: string|null,
 *   source?: string,
 *   approvalStatus?: string,
 *   registrationReference?: string|null,
 * }} input
 */
async function upsertLocationByName(db, input) {
  const countryCode = String((input && input.countryCode) || "")
    .trim()
    .toUpperCase();
  const name = canonicalLocationName(input && input.name);
  const normalized = normalizeLocationName(name);
  if (!countryCode || !normalized || !(await tableExists(db))) {
    return null;
  }
  const provinceRegion = input && input.provinceRegion
    ? String(input.provinceRegion).trim().slice(0, 120)
    : null;
  const source = String((input && input.source) || "registration").slice(0, 40);
  const approvalStatus = String((input && input.approvalStatus) || "pending");
  const registrationReference =
    input && input.registrationReference
      ? String(input.registrationReference).trim().slice(0, 64)
      : null;

  const r = await db.query(
    `INSERT INTO platform.geographic_locations (
       country_code, name, normalized_name, province_region, source, approval_status,
       created_by_registration_reference
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (country_code, normalized_name) DO UPDATE
       SET name = EXCLUDED.name,
           province_region = COALESCE(platform.geographic_locations.province_region, EXCLUDED.province_region)
     RETURNING id, country_code, name, normalized_name, province_region, source, approval_status`,
    [countryCode, name, normalized, provinceRegion, source, approvalStatus, registrationReference]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    countryCode: row.country_code,
    name: row.name,
    normalizedName: row.normalized_name,
    provinceRegion: row.province_region,
    source: row.source,
    approvalStatus: row.approval_status,
  };
}

/**
 * @param {{ query: Function }} db
 */
async function seedZambiaLocations(db) {
  if (!(await tableExists(db))) return { ok: false, reason: "table_missing" };
  const { listZambiaSeedCities } = require("./zambiaCatalog");
  for (const city of listZambiaSeedCities()) {
    await upsertLocationByName(db, {
      countryCode: "ZM",
      name: city.name,
      provinceRegion: city.province,
      source: "seed",
      approvalStatus: "approved",
    });
  }
  return { ok: true };
}

module.exports = {
  tableExists,
  searchLocations,
  findLocationByIdForCountry,
  upsertLocationByName,
  seedZambiaLocations,
};
