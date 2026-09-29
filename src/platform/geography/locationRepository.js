"use strict";

const { normalizeLocationName, canonicalLocationName } = require("./locationNormalization");

const ACTIVE_STATUSES = "('approved', 'pending')";

/**
 * @param {{ query: Function }} db
 * @param {string} countryCode
 */
async function getGeographicCountry(db, countryCode) {
  const code = String(countryCode || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  const r = await db.query(
    `SELECT country_code, country_name, city_catalogue_enabled, catalogue_status, is_active
       FROM platform.geographic_countries
      WHERE country_code = $1
      LIMIT 1`,
    [code]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    countryCode: row.country_code,
    countryName: row.country_name,
    cityCatalogueEnabled: Boolean(row.city_catalogue_enabled),
    catalogueStatus: row.catalogue_status,
    isActive: Boolean(row.is_active),
  };
}

/**
 * @param {{ query: Function }} db
 * @param {string} countryCode
 */
async function isCityCatalogueEnabled(db, countryCode) {
  const row = await getGeographicCountry(db, countryCode);
  return Boolean(row && row.isActive && row.cityCatalogueEnabled);
}

function mapLocationRow(row) {
  if (!row) return null;
  const provinceRegion = row.province_region || null;
  const name = row.name;
  const label =
    provinceRegion && String(provinceRegion).trim()
      ? `${name}, ${String(provinceRegion).trim()}`
      : name;
  return {
    id: row.id,
    countryCode: row.country_code,
    name,
    label,
    normalizedName: row.normalized_name,
    provinceRegion,
    administrativeArea: provinceRegion,
    source: row.source,
    approvalStatus: row.approval_status,
    isActive: row.is_active !== false,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
  };
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

  const params = [countryCode];
  let where = `country_code = $1
        AND is_active = TRUE
        AND approval_status IN ${ACTIVE_STATUSES}`;
  if (q) {
    params.push(`${q}%`);
    params.push(`%${q}%`);
    where += ` AND (normalized_name LIKE $2 OR normalized_name LIKE $3 OR name ILIKE $3)`;
  }
  params.push(limit);
  const limitParam = `$${params.length}`;
  const prefixParam = q ? "$2" : "''";
  const r = await db.query(
    `SELECT id, country_code, name, normalized_name, province_region, source, approval_status,
            is_active, latitude, longitude
       FROM platform.geographic_locations
      WHERE ${where}
      ORDER BY
        CASE approval_status WHEN 'approved' THEN 0 ELSE 1 END,
        CASE WHEN ${prefixParam} <> '' AND normalized_name LIKE ${prefixParam} THEN 0 ELSE 1 END,
        name ASC,
        province_region ASC NULLS LAST
      LIMIT ${limitParam}`,
    params
  );
  return r.rows.map(mapLocationRow);
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
  if (!id || !countryCode) return null;
  const r = await db.query(
    `SELECT id, country_code, name, normalized_name, province_region, source, approval_status,
            is_active, latitude, longitude
       FROM platform.geographic_locations
      WHERE id = $1
        AND country_code = $2
        AND is_active = TRUE
        AND approval_status IN ${ACTIVE_STATUSES}
      LIMIT 1`,
    [id, countryCode]
  );
  return mapLocationRow(r.rows[0]);
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
 *   latitude?: number|null,
 *   longitude?: number|null,
 *   externalRef?: string|null,
 * }} input
 */
async function upsertLocationByName(db, input) {
  const countryCode = String((input && input.countryCode) || "")
    .trim()
    .toUpperCase();
  const name = canonicalLocationName(input && input.name);
  const normalized = normalizeLocationName(name);
  if (!countryCode || !normalized) {
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
  const latitude =
    input && input.latitude != null && Number.isFinite(Number(input.latitude))
      ? Number(input.latitude)
      : null;
  const longitude =
    input && input.longitude != null && Number.isFinite(Number(input.longitude))
      ? Number(input.longitude)
      : null;
  const externalRef =
    input && input.externalRef
      ? String(input.externalRef).trim().slice(0, 64)
      : null;

  // Legacy free-text upserts without admin area reuse any existing same-name row
  // in the country (preserves one-row identity for registration retries).
  if (!provinceRegion) {
    const existing = await db.query(
      `SELECT id, country_code, name, normalized_name, province_region, source, approval_status,
              is_active, latitude, longitude
         FROM platform.geographic_locations
        WHERE country_code = $1
          AND normalized_name = $2
          AND is_active = TRUE
        ORDER BY
          CASE approval_status WHEN 'approved' THEN 0 ELSE 1 END,
          created_at ASC
        LIMIT 1`,
      [countryCode, normalized]
    );
    if (existing.rows[0]) {
      return mapLocationRow(existing.rows[0]);
    }
  }

  const r = await db.query(
    `INSERT INTO platform.geographic_locations (
       country_code, name, normalized_name, province_region, source, approval_status,
       created_by_registration_reference, is_active, latitude, longitude, external_ref
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, $9, $10)
     ON CONFLICT (country_code, normalized_name, disambiguator) DO UPDATE
       SET name = EXCLUDED.name,
           province_region = COALESCE(platform.geographic_locations.province_region, EXCLUDED.province_region),
           latitude = COALESCE(platform.geographic_locations.latitude, EXCLUDED.latitude),
           longitude = COALESCE(platform.geographic_locations.longitude, EXCLUDED.longitude),
           external_ref = COALESCE(platform.geographic_locations.external_ref, EXCLUDED.external_ref),
           updated_at = now()
     RETURNING id, country_code, name, normalized_name, province_region, source, approval_status,
               is_active, latitude, longitude`,
    [
      countryCode,
      name,
      normalized,
      provinceRegion,
      source,
      approvalStatus,
      registrationReference,
      latitude,
      longitude,
      externalRef,
    ]
  );
  return mapLocationRow(r.rows[0]);
}

/**
 * @param {{ query: Function }} db
 */
async function seedZambiaLocations(db) {
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

/**
 * Seed countries + cities from the packaged GeoNames-derived catalogue.
 * Idempotent via ON CONFLICT.
 * @param {{ query: Function }} db
 */
async function seedCityCatalogue(db) {
  const seed = require("./seed/cityCatalogueSeed.json");
  const countries = Array.isArray(seed.countries) ? seed.countries : [];
  const cities = Array.isArray(seed.cities) ? seed.cities : [];

  for (const c of countries) {
    await db.query(
      `INSERT INTO platform.geographic_countries (
         country_code, country_name, city_catalogue_enabled, catalogue_status, is_active
       ) VALUES ($1, $2, TRUE, 'seeded', TRUE)
       ON CONFLICT (country_code) DO UPDATE SET
         country_name = EXCLUDED.country_name,
         city_catalogue_enabled = TRUE,
         catalogue_status = 'seeded',
         is_active = TRUE,
         updated_at = now()`,
      [c.countryCode, c.countryName]
    );
  }

  let upserted = 0;
  for (const city of cities) {
    const row = await upsertLocationByName(db, {
      countryCode: city.countryCode,
      name: city.name,
      provinceRegion: city.administrativeArea || null,
      source: "seed",
      approvalStatus: "approved",
      latitude: city.latitude,
      longitude: city.longitude,
      externalRef: city.geonameId ? String(city.geonameId) : null,
    });
    if (row) upserted += 1;
  }
  return { ok: true, countries: countries.length, cities: upserted };
}

/**
 * Integrity snapshot for QA reporting.
 * @param {{ query: Function }} db
 */
async function getCityCatalogueStats(db) {
  const countries = await db.query(
    `SELECT country_code, country_name, city_catalogue_enabled, catalogue_status
       FROM platform.geographic_countries
      WHERE is_active = TRUE AND city_catalogue_enabled = TRUE
      ORDER BY country_code`
  );
  const counts = await db.query(
    `SELECT country_code, COUNT(*)::int AS n
       FROM platform.geographic_locations
      WHERE is_active = TRUE
        AND approval_status IN ${ACTIVE_STATUSES}
        AND source = 'seed'
      GROUP BY country_code
      ORDER BY country_code`
  );
  const total = await db.query(
    `SELECT COUNT(*)::int AS n
       FROM platform.geographic_locations
      WHERE is_active = TRUE
        AND approval_status IN ${ACTIVE_STATUSES}`
  );
  const zeroCities = [];
  const countMap = Object.fromEntries(counts.rows.map((r) => [r.country_code, r.n]));
  for (const c of countries.rows) {
    if (!countMap[c.country_code]) zeroCities.push(c.country_code);
  }
  return {
    countriesWithCatalogue: countries.rows.length,
    totalCityRecords: total.rows[0] ? total.rows[0].n : 0,
    cityCountsByCountry: countMap,
    zeroCityCountries: zeroCities,
  };
}

module.exports = {
  getGeographicCountry,
  isCityCatalogueEnabled,
  searchLocations,
  findLocationByIdForCountry,
  upsertLocationByName,
  seedZambiaLocations,
  seedCityCatalogue,
  getCityCatalogueStats,
};
