"use strict";

/**
 * ActiveClinic public visibility resolution for platform and tenant pages.
 * Publication requires: org active + ActiveClinic active + HCO active + website_published.
 */

const { organizationHasActiveProduct } = require("../../platform/services/organizationProductService");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "clinic_not_found",
  NOT_PUBLISHED: "clinic_not_published",
  PRODUCT_NOT_ACTIVE: "product_not_active",
});

async function findOrganizationByKey(db, clinicKey) {
  const rows = await db.query(
    `SELECT id, organization_key, display_name, status, data_environment
       FROM platform.organizations
      WHERE organization_key = $1
      LIMIT 1`,
    [clinicKey]
  );
  return rows.rows[0] || null;
}

/**
 * Resolve a publishable clinic by platform organization key.
 * Returns public-safe DTO with no internal UUIDs in HTML when avoidable.
 */
async function resolvePublishableClinicByKey(db, input) {
  const clinicKey = String((input && input.clinicKey) || "").trim().toLowerCase();
  if (!clinicKey) {
    return { ok: false, code: RESULT.INVALID_INPUT, clinic: null };
  }

  const organization = await findOrganizationByKey(db, clinicKey);
  if (!organization) {
    return { ok: false, code: RESULT.NOT_FOUND, clinic: null };
  }

  const enabled = await organizationHasActiveProduct(db, {
    organizationId: organization.id,
    applicationCode: "activeclinic",
  });
  if (!enabled) {
    return { ok: false, code: RESULT.PRODUCT_NOT_ACTIVE, clinic: null };
  }

  if (organization.status !== "active") {
    return { ok: false, code: RESULT.NOT_PUBLISHED, clinic: null };
  }

  const dataEnvironment = String(organization.data_environment || "").toLowerCase();

  const hcoRows = await db.query(
    `SELECT h.id, h.organization_id, h.public_name, h.status,
            h.website_published, h.public_booking_enabled,
            h.website_tagline, h.website_about, h.website_logo_url,
            h.public_phone_display, h.public_email_display, h.country_code, h.timezone
     FROM activeclinic.healthcare_organizations h
     WHERE h.organization_id = $1`,
    [organization.id]
  );
  if (!hcoRows.rows.length) {
    return { ok: false, code: RESULT.NOT_FOUND, clinic: null };
  }

  const hco = hcoRows.rows[0];
  const allowUnpublished = input && input.allowUnpublished === true;
  if (hco.status !== "active" || (hco.website_published !== true && !allowUnpublished)) {
    return { ok: false, code: RESULT.NOT_PUBLISHED, clinic: null };
  }

  const facilityRows = await db.query(
    `SELECT f.id, f.facility_key, f.display_name, f.facility_type,
            f.status, f.is_primary, f.show_in_directory,
            f.address_line_1, f.address_line_2, f.city, f.district, f.province,
            f.country_code, f.postal_code, f.phone_display, f.email_display,
            f.public_hours_json, f.website_published
     FROM activeclinic.facilities f
     WHERE f.healthcare_organization_id = $1 AND f.status = 'active'
     ORDER BY f.is_primary DESC, f.display_name ASC`,
    [hco.id]
  );

  const facilities = facilityRows.rows
    .filter((f) => f.website_published !== false)
    .map((f) => ({
      id: f.id,
      facilityKey: f.facility_key,
      displayName: f.display_name,
      facilityType: f.facility_type,
      isPrimary: f.is_primary === true,
      showInDirectory: f.show_in_directory === true,
      addressLine1: f.address_line_1 || null,
      addressLine2: f.address_line_2 || null,
      city: f.city || null,
      district: f.district || null,
      province: f.province || null,
      countryCode: f.country_code || null,
      postalCode: f.postal_code || null,
      phoneDisplay: f.phone_display || null,
      emailDisplay: f.email_display || null,
      publicHours: f.public_hours_json || null,
    }));

  const tagline = hco.website_tagline || "";
  const isDemonstrationClinic =
    dataEnvironment === "demo" ||
    /demonstration clinic/i.test(tagline) ||
    clinicKey === "activeclinic-demo" ||
    clinicKey === "julflona-clinic";

  const clinic = {
    clinicKey,
    organizationId: organization.id,
    healthcareOrganizationId: hco.id,
    publicName: hco.public_name,
    websiteTagline: hco.website_tagline || null,
    websiteAbout: hco.website_about || null,
    websiteLogoUrl: hco.website_logo_url || null,
    publicPhoneDisplay: hco.public_phone_display || null,
    publicEmailDisplay: hco.public_email_display || null,
    publicBookingEnabled: hco.public_booking_enabled === true,
    websitePublished: hco.website_published === true,
    countryCode: hco.country_code,
    timezone: hco.timezone,
    dataEnvironment: dataEnvironment || null,
    isDemonstrationClinic,
    facilities,
    primaryFacilityId: (facilities.find((f) => f.isPrimary) || facilities[0] || {}).id || null,
  };

  return { ok: true, code: RESULT.OK, clinic };
}

/**
 * List all publishable clinics for directory pages.
 * Supports search filters (name, province, city).
 */
async function listPublishableClinics(db, input) {
  const searchQuery = input && input.search ? String(input.search).trim() : "";
  const province = input && input.province ? String(input.province).trim() : null;
  const city = input && input.city ? String(input.city).trim() : null;

  const conditions = [];
  const params = [];

  conditions.push(`o.status = 'active'`);
  conditions.push(`op.status = 'active'`);
  conditions.push(`p.product_key = 'activeclinic'`);
  conditions.push(`h.status = 'active'`);
  conditions.push(`h.website_published = true`);

  if (searchQuery.length >= 2) {
    params.push(`%${searchQuery}%`);
    conditions.push(`h.public_name ILIKE $${params.length}`);
  }

  let facilityConditions = `f.status = 'active' AND f.show_in_directory = true`;
  if (province) {
    params.push(province);
    facilityConditions += ` AND f.province = $${params.length}`;
  }
  if (city) {
    params.push(city);
    facilityConditions += ` AND f.city = $${params.length}`;
  }

  const sql = `
    SELECT DISTINCT
      o.organization_key AS clinic_key,
      h.id AS healthcare_organization_id,
      h.public_name,
      h.website_tagline,
      h.website_logo_url,
      h.public_phone_display,
      h.public_email_display,
      h.public_booking_enabled,
      (SELECT COUNT(*) FROM activeclinic.facilities f2
       WHERE f2.healthcare_organization_id = h.id
         AND f2.status = 'active'
         AND f2.show_in_directory = true) AS facility_count
    FROM platform.organizations o
    INNER JOIN platform.organization_products op ON o.id = op.organization_id
    INNER JOIN platform.products p ON p.id = op.product_id
    INNER JOIN activeclinic.healthcare_organizations h ON h.organization_id = o.id
    WHERE ${conditions.join(" AND ")}
      AND EXISTS (
        SELECT 1 FROM activeclinic.facilities f
        WHERE f.healthcare_organization_id = h.id
          AND ${facilityConditions}
      )
    ORDER BY h.public_name ASC
    LIMIT 100
  `;

  const result = await db.query(sql, params);
  const clinics = result.rows.map((row) => ({
    clinicKey: row.clinic_key,
    publicName: row.public_name,
    websiteTagline: row.website_tagline || null,
    websiteLogoUrl: row.website_logo_url || null,
    publicPhoneDisplay: row.public_phone_display || null,
    publicEmailDisplay: row.public_email_display || null,
    publicBookingEnabled: row.public_booking_enabled === true,
    facilityCount: parseInt(row.facility_count, 10) || 0,
  }));

  return { ok: true, code: RESULT.OK, clinics };
}

/**
 * Resolve staff public profiles for clinic doctors page.
 * Only returns staff with public_profile_enabled = true.
 */
async function listPublicStaffProfiles(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String((input && input.healthcareOrganizationId) || "").trim();
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(healthcareOrganizationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, profiles: [] };
  }

  const sql = `
    SELECT s.id, s.public_profile_key, s.public_display_name,
           s.public_title, s.public_bio, s.status
    FROM activeclinic.staff_members s
    WHERE s.organization_id = $1
      AND s.healthcare_organization_id = $2
      AND s.status = 'active'
      AND s.public_profile_enabled = true
      AND s.public_profile_key IS NOT NULL
    ORDER BY s.public_display_name ASC
  `;

  const result = await db.query(sql, [organizationId, healthcareOrganizationId]);
  const profiles = result.rows.map((row) => ({
    id: row.id,
    staffKey: row.public_profile_key,
    displayName: row.public_display_name,
    title: row.public_title || null,
    bio: row.public_bio || null,
  }));

  return { ok: true, code: RESULT.OK, profiles };
}

/**
 * Resolve a single public staff profile by key.
 */
async function getPublicStaffProfile(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String((input && input.healthcareOrganizationId) || "").trim();
  const staffKey = String((input && input.staffKey) || "").trim();

  if (!UUID_RE.test(organizationId) || !UUID_RE.test(healthcareOrganizationId) || !staffKey) {
    return { ok: false, code: RESULT.INVALID_INPUT, profile: null };
  }

  const sql = `
    SELECT s.id, s.public_profile_key, s.public_display_name,
           s.public_title, s.public_bio
    FROM activeclinic.staff_members s
    WHERE s.organization_id = $1
      AND s.healthcare_organization_id = $2
      AND s.public_profile_key = $3
      AND s.status = 'active'
      AND s.public_profile_enabled = true
  `;

  const result = await db.query(sql, [organizationId, healthcareOrganizationId, staffKey]);
  if (!result.rows.length) {
    return { ok: false, code: RESULT.NOT_FOUND, profile: null };
  }

  const row = result.rows[0];
  const profile = {
    id: row.id,
    staffKey: row.public_profile_key,
    displayName: row.public_display_name,
    title: row.public_title || null,
    bio: row.public_bio || null,
  };

  return { ok: true, code: RESULT.OK, profile };
}

/**
 * List public appointment service types for clinic services page.
 */
async function listPublicServices(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String((input && input.healthcareOrganizationId) || "").trim();
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(healthcareOrganizationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, services: [] };
  }

  const sql = `
    SELECT ast.id, ast.service_key, ast.display_name, ast.public_summary,
           ast.status, ast.default_duration_minutes
    FROM activeclinic.appointment_service_types ast
    WHERE ast.organization_id = $1
      AND ast.healthcare_organization_id = $2
      AND ast.status = 'active'
      AND ast.public_bookable = true
    ORDER BY ast.display_name ASC
  `;

  const result = await db.query(sql, [organizationId, healthcareOrganizationId]);
  const services = result.rows.map((row) => ({
    id: row.id,
    serviceKey: row.service_key,
    displayName: row.display_name,
    summary: row.public_summary || null,
    durationMinutes: row.default_duration_minutes || null,
  }));

  return { ok: true, code: RESULT.OK, services };
}

/**
 * Get a single public service by key.
 */
async function getPublicService(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String((input && input.healthcareOrganizationId) || "").trim();
  const serviceKey = String((input && input.serviceKey) || "").trim();

  if (!UUID_RE.test(organizationId) || !UUID_RE.test(healthcareOrganizationId) || !serviceKey) {
    return { ok: false, code: RESULT.INVALID_INPUT, service: null };
  }

  const sql = `
    SELECT ast.id, ast.service_key, ast.display_name, ast.public_summary,
           ast.default_duration_minutes
    FROM activeclinic.appointment_service_types ast
    WHERE ast.organization_id = $1
      AND ast.healthcare_organization_id = $2
      AND ast.service_key = $3
      AND ast.status = 'active'
      AND ast.public_bookable = true
  `;

  const result = await db.query(sql, [organizationId, healthcareOrganizationId, serviceKey]);
  if (!result.rows.length) {
    return { ok: false, code: RESULT.NOT_FOUND, service: null };
  }

  const row = result.rows[0];
  const service = {
    id: row.id,
    serviceKey: row.service_key,
    displayName: row.display_name,
    summary: row.public_summary || null,
    durationMinutes: row.default_duration_minutes || null,
  };

  return { ok: true, code: RESULT.OK, service };
}

/**
 * List public procedures for P25 procedure booking.
 */
async function listPublicProcedures(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String((input && input.healthcareOrganizationId) || "").trim();
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(healthcareOrganizationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, procedures: [] };
  }

  const sql = `
    SELECT pp.id, pp.procedure_key, pp.display_name, pp.summary,
           pp.category, pp.referral_required, pp.preparation_instructions,
           pp.estimated_duration_minutes
    FROM activeclinic.public_procedures pp
    WHERE pp.organization_id = $1
      AND pp.healthcare_organization_id = $2
      AND pp.status = 'active'
    ORDER BY pp.display_name ASC
  `;

  const result = await db.query(sql, [organizationId, healthcareOrganizationId]);
  const procedures = result.rows.map((row) => ({
    id: row.id,
    procedureKey: row.procedure_key,
    displayName: row.display_name,
    summary: row.summary || null,
    category: row.category,
    referralRequired: row.referral_required === true,
    preparationInstructions: row.preparation_instructions || null,
    estimatedDurationMinutes: row.estimated_duration_minutes || null,
  }));

  return { ok: true, code: RESULT.OK, procedures };
}

/**
 * Get a single public procedure by key.
 */
async function getPublicProcedure(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String((input && input.healthcareOrganizationId) || "").trim();
  const procedureKey = String((input && input.procedureKey) || "").trim();

  if (!UUID_RE.test(organizationId) || !UUID_RE.test(healthcareOrganizationId) || !procedureKey) {
    return { ok: false, code: RESULT.INVALID_INPUT, procedure: null };
  }

  const sql = `
    SELECT pp.id, pp.procedure_key, pp.display_name, pp.summary,
           pp.category, pp.referral_required, pp.preparation_instructions,
           pp.estimated_duration_minutes
    FROM activeclinic.public_procedures pp
    WHERE pp.organization_id = $1
      AND pp.healthcare_organization_id = $2
      AND pp.procedure_key = $3
      AND pp.status = 'active'
  `;

  const result = await db.query(sql, [organizationId, healthcareOrganizationId, procedureKey]);
  if (!result.rows.length) {
    return { ok: false, code: RESULT.NOT_FOUND, procedure: null };
  }

  const row = result.rows[0];
  const procedure = {
    id: row.id,
    procedureKey: row.procedure_key,
    displayName: row.display_name,
    summary: row.summary || null,
    category: row.category,
    referralRequired: row.referral_required === true,
    preparationInstructions: row.preparation_instructions || null,
    estimatedDurationMinutes: row.estimated_duration_minutes || null,
  };

  return { ok: true, code: RESULT.OK, procedure };
}

/**
 * Public price patterns for tenant pricing page.
 * Returns configured public prices only — no billing catalogue exposure until public columns exist.
 */
async function listPublicPricePatterns(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String((input && input.healthcareOrganizationId) || "").trim();
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(healthcareOrganizationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, patterns: [] };
  }

  // No public price fields on appointment_service_types or public_procedures yet.
  // Future: query verified public price columns when added to schema.
  void db;
  return { ok: true, code: RESULT.OK, patterns: [] };
}

module.exports = {
  RESULT,
  resolvePublishableClinicByKey,
  listPublishableClinics,
  listPublicStaffProfiles,
  getPublicStaffProfile,
  listPublicServices,
  getPublicService,
  listPublicProcedures,
  getPublicProcedure,
  listPublicPricePatterns,
};
