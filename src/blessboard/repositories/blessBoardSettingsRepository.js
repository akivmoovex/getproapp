"use strict";

/**
 * blessboard.church_settings / branch_settings repository helpers.
 */

/**
 * @param {object} row
 */
function mapChurchSettings(row) {
  if (!row) return null;
  return {
    churchId: row.church_id,
    publicName: row.public_name,
    denomination: row.denomination,
    primaryEmail: row.primary_email,
    primaryPhone: row.primary_phone,
    defaultTimezone: row.default_timezone,
    defaultCountryCode: row.default_country_code,
    websiteStatus: row.website_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * @param {object} row
 */
function mapBranchSettings(row) {
  if (!row) return null;
  return {
    branchId: row.branch_id,
    publicName: row.public_name,
    email: row.email,
    phone: row.phone,
    timezone: row.timezone,
    countryCode: row.country_code,
    addressLine1: row.address_line_1,
    addressLine2: row.address_line_2,
    city: row.city,
    provinceState: row.province_state,
    postalCode: row.postal_code,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * @param {{ query: Function }} client
 * @param {string} churchId
 */
async function findChurchSettings(client, churchId) {
  const r = await client.query(
    `SELECT church_id, public_name, denomination, primary_email, primary_phone,
            default_timezone, default_country_code, website_status, created_at, updated_at
       FROM blessboard.church_settings
      WHERE church_id = $1
      LIMIT 1`,
    [churchId]
  );
  return mapChurchSettings(r.rows[0] || null);
}

/**
 * @param {{ query: Function }} client
 * @param {string} branchId
 */
async function findBranchSettings(client, branchId) {
  const r = await client.query(
    `SELECT branch_id, public_name, email, phone, timezone, country_code,
            address_line_1, address_line_2, city, province_state, postal_code,
            latitude, longitude, created_at, updated_at
       FROM blessboard.branch_settings
      WHERE branch_id = $1
      LIMIT 1`,
    [branchId]
  );
  return mapBranchSettings(r.rows[0] || null);
}

/**
 * Idempotent insert of defaults; does not overwrite existing rows.
 * @param {{ query: Function }} client
 * @param {{ churchId: string, publicName: string }} fields
 */
async function ensureChurchSettingsRow(client, fields) {
  const r = await client.query(
    `INSERT INTO blessboard.church_settings
       (church_id, public_name, website_status)
     VALUES ($1, $2, 'draft')
     ON CONFLICT (church_id) DO NOTHING
     RETURNING church_id, public_name, denomination, primary_email, primary_phone,
               default_timezone, default_country_code, website_status, created_at, updated_at`,
    [fields.churchId, fields.publicName]
  );
  if (r.rows[0]) return mapChurchSettings(r.rows[0]);
  return findChurchSettings(client, fields.churchId);
}

/**
 * @param {{ query: Function }} client
 * @param {{ branchId: string, publicName: string }} fields
 */
async function ensureBranchSettingsRow(client, fields) {
  const r = await client.query(
    `INSERT INTO blessboard.branch_settings (branch_id, public_name)
     VALUES ($1, $2)
     ON CONFLICT (branch_id) DO NOTHING
     RETURNING branch_id, public_name, email, phone, timezone, country_code,
               address_line_1, address_line_2, city, province_state, postal_code,
               latitude, longitude, created_at, updated_at`,
    [fields.branchId, fields.publicName]
  );
  if (r.rows[0]) return mapBranchSettings(r.rows[0]);
  return findBranchSettings(client, fields.branchId);
}

/**
 * @param {{ query: Function }} client
 * @param {string} churchId
 * @param {object} fields
 */
async function upsertChurchSettings(client, churchId, fields) {
  const r = await client.query(
    `INSERT INTO blessboard.church_settings
       (church_id, public_name, denomination, primary_email, primary_phone,
        default_timezone, default_country_code, website_status, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (church_id) DO UPDATE SET
       public_name = EXCLUDED.public_name,
       denomination = EXCLUDED.denomination,
       primary_email = EXCLUDED.primary_email,
       primary_phone = EXCLUDED.primary_phone,
       default_timezone = EXCLUDED.default_timezone,
       default_country_code = EXCLUDED.default_country_code,
       website_status = EXCLUDED.website_status,
       updated_at = now()
     RETURNING church_id, public_name, denomination, primary_email, primary_phone,
               default_timezone, default_country_code, website_status, created_at, updated_at`,
    [
      churchId,
      fields.publicName,
      fields.denomination,
      fields.primaryEmail,
      fields.primaryPhone,
      fields.defaultTimezone,
      fields.defaultCountryCode,
      fields.websiteStatus,
    ]
  );
  return mapChurchSettings(r.rows[0] || null);
}

/**
 * @param {{ query: Function }} client
 * @param {string} branchId
 * @param {object} fields
 */
async function upsertBranchSettings(client, branchId, fields) {
  const r = await client.query(
    `INSERT INTO blessboard.branch_settings
       (branch_id, public_name, email, phone, timezone, country_code,
        address_line_1, address_line_2, city, province_state, postal_code,
        latitude, longitude, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
     ON CONFLICT (branch_id) DO UPDATE SET
       public_name = EXCLUDED.public_name,
       email = EXCLUDED.email,
       phone = EXCLUDED.phone,
       timezone = EXCLUDED.timezone,
       country_code = EXCLUDED.country_code,
       address_line_1 = EXCLUDED.address_line_1,
       address_line_2 = EXCLUDED.address_line_2,
       city = EXCLUDED.city,
       province_state = EXCLUDED.province_state,
       postal_code = EXCLUDED.postal_code,
       latitude = EXCLUDED.latitude,
       longitude = EXCLUDED.longitude,
       updated_at = now()
     RETURNING branch_id, public_name, email, phone, timezone, country_code,
               address_line_1, address_line_2, city, province_state, postal_code,
               latitude, longitude, created_at, updated_at`,
    [
      branchId,
      fields.publicName,
      fields.email,
      fields.phone,
      fields.timezone,
      fields.countryCode,
      fields.addressLine1,
      fields.addressLine2,
      fields.city,
      fields.provinceState,
      fields.postalCode,
      fields.latitude,
      fields.longitude,
    ]
  );
  return mapBranchSettings(r.rows[0] || null);
}

/**
 * @param {{ query: Function }} client
 * @param {string} churchId
 */
async function findChurchDisplayName(client, churchId) {
  const r = await client.query(
    `SELECT display_name FROM blessboard.churches WHERE id = $1 AND status = 'active' LIMIT 1`,
    [churchId]
  );
  return r.rows[0] ? String(r.rows[0].display_name) : null;
}

/**
 * @param {{ query: Function }} client
 * @param {string} branchId
 */
async function findBranchDisplayName(client, branchId) {
  const r = await client.query(
    `SELECT display_name FROM blessboard.branches WHERE id = $1 AND status = 'active' LIMIT 1`,
    [branchId]
  );
  return r.rows[0] ? String(r.rows[0].display_name) : null;
}

module.exports = {
  mapChurchSettings,
  mapBranchSettings,
  findChurchSettings,
  findBranchSettings,
  ensureChurchSettingsRow,
  ensureBranchSettingsRow,
  upsertChurchSettings,
  upsertBranchSettings,
  findChurchDisplayName,
  findBranchDisplayName,
};
