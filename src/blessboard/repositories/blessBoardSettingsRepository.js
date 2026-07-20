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

/**
 * @param {{ query: Function }} client
 * @param {string} churchId
 */
async function findChurchCatalogueSnapshot(client, churchId) {
  const r = await client.query(
    `SELECT c.id AS church_id,
            c.church_key,
            c.display_name AS church_display_name,
            c.legal_name AS church_legal_name,
            c.status AS church_status,
            o.id AS organization_id,
            o.organization_key,
            o.display_name AS organization_display_name,
            o.legal_name AS organization_legal_name,
            o.status AS organization_status,
            cs.website_status,
            b.id AS primary_branch_id,
            b.branch_key AS primary_branch_key,
            b.display_name AS primary_branch_display_name,
            b.status AS primary_branch_status,
            b.timezone AS primary_branch_timezone
       FROM blessboard.churches c
       JOIN platform.organizations o ON o.id = c.organization_id
       LEFT JOIN blessboard.church_settings cs ON cs.church_id = c.id
       LEFT JOIN LATERAL (
         SELECT br.id, br.branch_key, br.display_name, br.status, br.timezone
           FROM blessboard.branches br
          WHERE br.church_id = c.id AND br.status = 'active'
          ORDER BY CASE WHEN br.is_primary THEN 0 WHEN br.branch_type = 'hq' THEN 1 ELSE 2 END,
                   br.created_at ASC
          LIMIT 1
       ) b ON true
      WHERE c.id = $1
      LIMIT 1`,
    [churchId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    churchId: row.church_id,
    churchKey: row.church_key,
    churchDisplayName: row.church_display_name,
    churchLegalName: row.church_legal_name,
    churchStatus: row.church_status,
    organizationId: row.organization_id,
    organizationKey: row.organization_key,
    organizationDisplayName: row.organization_display_name,
    organizationLegalName: row.organization_legal_name,
    organizationStatus: row.organization_status,
    websiteStatus: row.website_status || "draft",
    primaryBranchId: row.primary_branch_id || null,
    primaryBranchKey: row.primary_branch_key || null,
    primaryBranchDisplayName: row.primary_branch_display_name || null,
    primaryBranchStatus: row.primary_branch_status || null,
    primaryBranchTimezone: row.primary_branch_timezone || null,
  };
}

/**
 * @param {{ query: Function }} client
 * @param {string} branchId
 */
async function findBranchCatalogueSnapshot(client, branchId) {
  const r = await client.query(
    `SELECT b.id AS branch_id,
            b.branch_key,
            b.display_name,
            b.status,
            b.branch_type,
            b.timezone,
            b.country_code,
            b.church_id,
            c.display_name AS church_display_name,
            c.organization_id
       FROM blessboard.branches b
       JOIN blessboard.churches c ON c.id = b.church_id
      WHERE b.id = $1
      LIMIT 1`,
    [branchId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    branchId: row.branch_id,
    branchKey: row.branch_key,
    displayName: row.display_name,
    status: row.status,
    branchType: row.branch_type,
    timezone: row.timezone,
    countryCode: row.country_code,
    churchId: row.church_id,
    churchDisplayName: row.church_display_name,
    organizationId: row.organization_id,
  };
}

/**
 * @param {{ query: Function }} client
 * @param {string} churchId
 * @param {{ displayName?: string, legalName?: string|null }} fields
 */
async function updateChurchCatalogueNames(client, churchId, fields) {
  const setLegal = Object.prototype.hasOwnProperty.call(fields, "legalName");
  await client.query(
    `UPDATE blessboard.churches
        SET display_name = COALESCE($2, display_name),
            legal_name = CASE WHEN $3::boolean THEN $4 ELSE legal_name END,
            updated_at = now()
      WHERE id = $1`,
    [churchId, fields.displayName || null, setLegal, setLegal ? fields.legalName : null]
  );
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationId
 * @param {{ displayName?: string, legalName?: string|null }} fields
 */
async function updateOrganizationCatalogueNames(client, organizationId, fields) {
  const setLegal = Object.prototype.hasOwnProperty.call(fields, "legalName");
  await client.query(
    `UPDATE platform.organizations
        SET display_name = COALESCE($2, display_name),
            legal_name = CASE WHEN $3::boolean THEN $4 ELSE legal_name END,
            updated_at = now()
      WHERE id = $1`,
    [organizationId, fields.displayName || null, setLegal, setLegal ? fields.legalName : null]
  );
}

/**
 * @param {{ query: Function }} client
 * @param {string} branchId
 * @param {string} displayName
 */
async function updateBranchCatalogueDisplayName(client, branchId, displayName) {
  await client.query(
    `UPDATE blessboard.branches
        SET display_name = $2,
            updated_at = now()
      WHERE id = $1`,
    [branchId, displayName]
  );
}

/**
 * @param {{ query: Function }} client
 * @param {string} branchId
 * @param {{ timezone?: string|null, countryCode?: string|null }} fields
 */
async function updateBranchCatalogueMeta(client, branchId, fields) {
  await client.query(
    `UPDATE blessboard.branches
        SET timezone = COALESCE($2, timezone),
            country_code = COALESCE($3, country_code),
            updated_at = now()
      WHERE id = $1`,
    [branchId, fields.timezone != null ? fields.timezone : null, fields.countryCode != null ? fields.countryCode : null]
  );
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
  findChurchCatalogueSnapshot,
  findBranchCatalogueSnapshot,
  updateChurchCatalogueNames,
  updateOrganizationCatalogueNames,
  updateBranchCatalogueDisplayName,
  updateBranchCatalogueMeta,
};
