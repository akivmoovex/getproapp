"use strict";

/**
 * Read-only checks for ActiveClinic public website / registration schema readiness.
 */

async function inspectActiveClinicPublicSchema(db) {
  const out = {
    ok: true,
    schemaExists: false,
    healthcareOrganizations: false,
    websitePublishedColumn: false,
    clinicRegistrationApplications: false,
    activeclinicMigrations: [],
    pendingHint: null,
  };

  try {
    const schema = await db.query(
      `SELECT 1 AS ok FROM information_schema.schemata WHERE schema_name = 'activeclinic' LIMIT 1`
    );
    out.schemaExists = schema.rows.length > 0;
  } catch (_err) {
    out.ok = false;
    out.pendingHint = "unable_to_query_schemata";
    return out;
  }

  if (!out.schemaExists) {
    out.ok = false;
    out.pendingHint = "apply_activeclinic_migrations_001_through_020";
    return out;
  }

  try {
    const tables = await db.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'activeclinic'
          AND table_name IN ('healthcare_organizations', 'clinic_registration_applications')`
    );
    const names = new Set(tables.rows.map((r) => r.table_name));
    out.healthcareOrganizations = names.has("healthcare_organizations");
    out.clinicRegistrationApplications = names.has("clinic_registration_applications");
  } catch (_err) {
    out.ok = false;
    out.pendingHint = "unable_to_query_tables";
    return out;
  }

  try {
    const cols = await db.query(
      `SELECT 1 AS ok
         FROM information_schema.columns
        WHERE table_schema = 'activeclinic'
          AND table_name = 'healthcare_organizations'
          AND column_name = 'website_published'
        LIMIT 1`
    );
    out.websitePublishedColumn = cols.rows.length > 0;
  } catch (_err) {
    out.websitePublishedColumn = false;
  }

  try {
    const mig = await db.query(
      `SELECT version, filename
         FROM platform.schema_migrations
        WHERE module = 'activeclinic'
        ORDER BY version`
    );
    out.activeclinicMigrations = mig.rows.map((r) => `${r.version}:${r.filename}`);
  } catch (_err) {
    out.activeclinicMigrations = [];
  }

  if (!out.clinicRegistrationApplications || !out.websitePublishedColumn) {
    out.ok = false;
    out.pendingHint = "apply_activeclinic_migration_019_public_website_and_booking";
  }

  return out;
}

module.exports = {
  inspectActiveClinicPublicSchema,
};
