"use strict";

/**
 * Local PostgreSQL fixtures for V5→V7 migration rehearsal/tests.
 */

const fs = require("fs");
const path = require("path");
const { Pool, Client } = require("pg");
const bcrypt = require("bcryptjs");
const { migrate } = require("../../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../../db/scripts/lib/databaseIdentity");
const { DEFAULT_PUBLIC_BUCKET } = require("../../src/blessboard/media/mediaConstants");

const SRC_DB = "blessboard_v5_to_v7_src";
const TGT_DB = "moovex_v7_migration_tgt";

const IDS = Object.freeze({
  bbOrg: "11111111-1111-4111-8111-111111111111",
  bbChurch: "22222222-2222-4222-8222-222222222222",
  bbBranch: "33333333-3333-4333-8333-333333333333",
  bbUserHq: "44444444-4444-4444-8444-444444444444",
  bbUserShared: "44444444-4444-4444-8444-444444444445",
  acOrg: "55555555-5555-4555-8555-555555555555",
  acHco: "66666666-6666-4666-8666-666666666666",
  acFacility: "77777777-7777-4777-8777-777777777777",
  acStaffAdmin: "88888888-8888-4888-8888-888888888888",
  acStaffShared: "88888888-8888-4888-8888-888888888889",
  acIdentityAdmin: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  acIdentityShared: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  acService1: "99999999-9999-4999-8999-999999999991",
  acService2: "99999999-9999-4999-8999-999999999992",
  acPatient1: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
  acPatient2: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
  acAppt1: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
  acAppt2: "cccccccc-cccc-4ccc-8ccc-ccccccccccc2",
  acWebsiteInstance: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  acWebsiteMedia: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
  bbMediaAsset: "ffffffff-ffff-4fff-8fff-fffffffffff1",
});

function adminConnectionString() {
  return (
    process.env.FOUNDATION_ADMIN_DATABASE_URL ||
    process.env.DATABASE_URL_ADMIN ||
    "postgresql://localhost:5432/postgres"
  );
}

function urlFor(dbName) {
  return `postgresql://localhost:5432/${dbName}`;
}

async function recreateDatabase(dbName) {
  const client = new Client({ connectionString: adminConnectionString() });
  await client.connect();
  try {
    await client.query(
      `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName]
    );
    await client.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await client.query(`CREATE DATABASE ${dbName}`);
  } finally {
    await client.end();
  }
  return urlFor(dbName);
}

async function seedBlessBoardV5Source(pool, passwords) {
  const roleId = (
    await pool.query(`SELECT id FROM blessboard.roles WHERE role_key = 'organisation_administrator' LIMIT 1`)
  ).rows[0].id;
  const hashHq = await bcrypt.hash(passwords.bbHq, 10);
  const hashShared = await bcrypt.hash(passwords.shared, 10);

  await pool.query(
    `INSERT INTO platform.organizations (id, organization_key, display_name, data_environment, status)
     VALUES ($1, 'grace-chapel', 'Grace Chapel', 'production', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [IDS.bbOrg]
  );
  await pool.query(
    `INSERT INTO platform.organization_products (organization_id, product_id, status, product_tenant_key, activated_at)
     SELECT $1, p.id, 'active', 'grace-chapel', now()
       FROM platform.products p WHERE p.product_key = 'blessboard'
     ON CONFLICT DO NOTHING`,
    [IDS.bbOrg]
  );
  await pool.query(
    `INSERT INTO blessboard.churches (id, organization_id, church_key, display_name, status, data_environment)
     VALUES ($1, $2, 'grace-chapel', 'Grace Chapel', 'active', 'production')
     ON CONFLICT (id) DO NOTHING`,
    [IDS.bbChurch, IDS.bbOrg]
  );
  await pool.query(
    `INSERT INTO blessboard.branches (id, church_id, branch_key, display_name, branch_type, status, is_primary)
     VALUES ($1, $2, 'hq', 'HQ', 'hq', 'active', true)
     ON CONFLICT (id) DO NOTHING`,
    [IDS.bbBranch, IDS.bbChurch]
  );
  await pool.query(
    `INSERT INTO blessboard.users (id, email_normalized, email_display, password_hash, status, display_name)
     VALUES
       ($1, 'hq@grace-chapel.example', 'hq@grace-chapel.example', $3, 'active', 'HQ Admin'),
       ($2, 'shared.person@example.com', 'shared.person@example.com', $4, 'active', 'Shared Person')
     ON CONFLICT (id) DO NOTHING`,
    [IDS.bbUserHq, IDS.bbUserShared, hashHq, hashShared]
  );
  for (const userId of [IDS.bbUserHq, IDS.bbUserShared]) {
    await pool.query(
      `INSERT INTO blessboard.user_role_assignments
         (user_id, organization_id, church_id, role_id, scope_type, scope_id, status, assignment_origin)
       VALUES ($1, $2, NULL, $3, 'organisation', NULL, 'active', 'migration')
       ON CONFLICT DO NOTHING`,
      [userId, IDS.bbOrg, roleId]
    );
  }
  const page = await pool.query(
    `INSERT INTO blessboard.public_pages (church_id, page_key, title, status, published_at)
     VALUES ($1, 'home', 'Home', 'published', now())
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [IDS.bbChurch]
  );
  if (page.rowCount) {
    await pool.query(
      `INSERT INTO blessboard.page_sections (page_id, section_key, section_type, heading, sort_order)
       VALUES ($1, 'welcome', 'welcome', 'Welcome', 1)
       ON CONFLICT DO NOTHING`,
      [page.rows[0].id]
    );
  }
  const storageKey = `blessboard/${IDS.bbChurch}/${IDS.bbMediaAsset}/logo.png`;
  await pool.query(
    `INSERT INTO blessboard.media_assets
       (id, church_id, uploaded_by_user_id, storage_bucket, storage_key, original_filename,
        mime_type, size_bytes, sha256, visibility, status)
     VALUES ($1, $2, $3, $4, $5, 'logo.png', 'image/png', 128,
             'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'public', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [IDS.bbMediaAsset, IDS.bbChurch, IDS.bbUserHq, DEFAULT_PUBLIC_BUCKET, storageKey]
  );
}

async function seedActiveClinicV6Source(pool, passwords) {
  const adminRoleId = (
    await pool.query(`SELECT id FROM blessboard.roles WHERE role_key = 'activeclinic_organization_admin' LIMIT 1`)
  ).rows[0].id;
  const hashAdmin = await bcrypt.hash(passwords.acAdmin, 10);
  const hashShared = await bcrypt.hash(passwords.shared, 10);

  await pool.query(
    `INSERT INTO platform.organizations (id, organization_key, display_name, data_environment, status)
     VALUES ($1, 'pilot-health-clinic', 'Pilot Health Clinic', 'production', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [IDS.acOrg]
  );
  await pool.query(
    `INSERT INTO platform.organization_products (organization_id, product_id, status, product_tenant_key, activated_at)
     SELECT $1, p.id, 'active', 'pilot-health-clinic', now()
       FROM platform.products p WHERE p.product_key = 'activeclinic'
     ON CONFLICT DO NOTHING`,
    [IDS.acOrg]
  );
  await pool.query(
    `INSERT INTO activeclinic.healthcare_organizations
       (id, organization_id, legal_name, public_name, organization_type, country_code, status, timezone, website_published)
     VALUES ($1, $2, 'Pilot Health Clinic Ltd', 'Pilot Health Clinic', 'private_healthcare', 'ZM', 'active', 'Africa/Lusaka', true)
     ON CONFLICT (id) DO NOTHING`,
    [IDS.acHco, IDS.acOrg]
  );
  await pool.query(
    `INSERT INTO activeclinic.facilities
       (id, organization_id, healthcare_organization_id, facility_key, display_name, facility_type, status,
        is_primary, country_code, phone_normalized, phone_display, timezone)
     VALUES ($1, $2, $3, 'main', 'Main Facility', 'hospital', 'active', true, 'ZM', '+260971234567', '+260 97 123 4567', 'Africa/Lusaka')
     ON CONFLICT (id) DO NOTHING`,
    [IDS.acFacility, IDS.acOrg, IDS.acHco]
  );
  await pool.query(
    `INSERT INTO platform.identities
       (id, status, primary_email, email_normalized, phone_normalized, password_hash)
     VALUES
       ($1, 'active', 'admin@pilot-health.example', 'admin@pilot-health.example', '+260971111111', $3),
       ($2, 'active', 'shared.person@example.com', 'shared.person@example.com', '+260972222222', $4)
     ON CONFLICT (id) DO NOTHING`,
    [IDS.acIdentityAdmin, IDS.acIdentityShared, hashAdmin, hashShared]
  );
  await pool.query(
    `INSERT INTO activeclinic.staff_members
       (id, organization_id, healthcare_organization_id, platform_identity_id, first_name, last_name,
        display_name, phone_normalized, phone_display, email_normalized, email_display, employment_type, status)
     VALUES
       ($1, $2, $3, $4, 'Clinic', 'Admin', 'Clinic Admin', '+260971111111', '+260 97 111 1111',
        'admin@pilot-health.example', 'admin@pilot-health.example', 'permanent', 'active'),
       ($5, $2, $3, $6, 'Shared', 'Person', 'Shared Person', '+260972222222', '+260 97 222 2222',
        'shared.person@example.com', 'shared.person@example.com', 'permanent', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [
      IDS.acStaffAdmin,
      IDS.acOrg,
      IDS.acHco,
      IDS.acIdentityAdmin,
      IDS.acStaffShared,
      IDS.acIdentityShared,
    ]
  );
  await pool.query(
    `INSERT INTO activeclinic.staff_role_assignments
       (organization_id, healthcare_organization_id, staff_member_id, role_id, scope_type, scope_id, status, assignment_origin)
     VALUES ($1, $2, $3, $4, 'organisation', NULL, 'active', 'migration'),
            ($1, $2, $5, $4, 'organisation', NULL, 'active', 'migration')
     ON CONFLICT DO NOTHING`,
    [IDS.acOrg, IDS.acHco, IDS.acStaffAdmin, adminRoleId, IDS.acStaffShared]
  );
  await pool.query(
    `INSERT INTO activeclinic.appointment_service_types
       (id, organization_id, healthcare_organization_id, service_key, display_name, default_duration_minutes, status)
     VALUES ($1, $2, $3, 'consultation', 'Consultation', 30, 'active'),
            ($4, $2, $3, 'follow-up', 'Follow Up', 20, 'active')
     ON CONFLICT (id) DO NOTHING`,
    [IDS.acService1, IDS.acOrg, IDS.acHco, IDS.acService2]
  );
  await pool.query(
    `INSERT INTO activeclinic.patients
       (id, organization_id, healthcare_organization_id, patient_number, first_name, last_name, status, country_code)
     VALUES ($1, $2, $3, 'AC-2026-000001', 'Synthetic', 'Patient One', 'active', 'ZM'),
            ($4, $2, $3, 'AC-2026-000002', 'Synthetic', 'Patient Two', 'active', 'ZM')
     ON CONFLICT (id) DO NOTHING`,
    [IDS.acPatient1, IDS.acOrg, IDS.acHco, IDS.acPatient2]
  );
  const starts = new Date();
  const ends = new Date(starts.getTime() + 30 * 60 * 1000);
  await pool.query(
    `INSERT INTO activeclinic.appointments
       (id, organization_id, healthcare_organization_id, facility_id, patient_id, service_type_id,
        assigned_staff_id, starts_at, ends_at, timezone, status, created_by_staff_id, updated_by_staff_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Africa/Lusaka', 'scheduled', $7, $7),
            ($10, $2, $3, $4, $11, $12, $7, $8, $9, 'Africa/Lusaka', 'scheduled', $7, $7)
     ON CONFLICT (id) DO NOTHING`,
    [
      IDS.acAppt1,
      IDS.acOrg,
      IDS.acHco,
      IDS.acFacility,
      IDS.acPatient1,
      IDS.acService1,
      IDS.acStaffAdmin,
      starts.toISOString(),
      ends.toISOString(),
      IDS.acAppt2,
      IDS.acPatient2,
      IDS.acService2,
    ]
  );
  await pool.query(
    `INSERT INTO platform.website_instances
       (id, organization_id, product_code, template_id, template_version, slug, status, scope_kind)
     VALUES ($1, $2, 'activeclinic', 'activeclinic_starter', 1, 'pilot-health-clinic', 'published', 'tenant')
     ON CONFLICT (id) DO NOTHING`,
    [IDS.acWebsiteInstance, IDS.acOrg]
  );
  await pool.query(
    `INSERT INTO platform.website_media
       (id, organization_id, instance_id, media_kind, original_filename, storage_key, mime_type, size_bytes, payload_bytes, status)
     VALUES ($1, $2, $3, 'image', 'clinic-logo.png', 'pilot-health-clinic/logo.png', 'image/png', 64,
             decode('89504e470d0a1a0a', 'hex'), 'active')
     ON CONFLICT (id) DO NOTHING`,
    [IDS.acWebsiteMedia, IDS.acOrg, IDS.acWebsiteInstance]
  );
}

async function writeLocalMediaFixture() {
  const root = path.resolve(process.cwd(), "tmp/v5-to-v7-fixture-media");
  const storageKey = `blessboard/${IDS.bbChurch}/${IDS.bbMediaAsset}/logo.png`;
  const file = path.join(root, storageKey);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, Buffer.from("fixture-logo-bytes"));
  return root;
}

async function prepareV5ToV7RehearsalDatabases() {
  const passwords = {
    bbHq: "migration-qa-pass-12",
    acAdmin: "migration-ac-pass-12",
    shared: "migration-shared-pass-12",
  };
  const sourceUrl = await recreateDatabase(SRC_DB);
  const targetUrl = await recreateDatabase(TGT_DB);
  const sourcePool = new Pool({ connectionString: sourceUrl, max: 6 });
  const targetPool = new Pool({ connectionString: targetUrl, max: 6 });

  await migrate({ connectionString: sourceUrl });
  await ensureDatabaseIdentity(sourcePool, {
    connectionString: sourceUrl,
    identityKey: "blessboard-platform-v5",
    environmentCode: "testing",
  });
  await seedBlessBoardV5Source(sourcePool, passwords);
  await seedActiveClinicV6Source(sourcePool, passwords);
  const mediaRoot = await writeLocalMediaFixture();

  await migrate({ connectionString: targetUrl });
  await ensureDatabaseIdentity(targetPool, {
    connectionString: targetUrl,
    identityKey: "moovex-platform-v7",
    environmentCode: "testing",
  });

  return {
    sourceUrl,
    targetUrl,
    sourcePool,
    targetPool,
    mediaRoot,
    seeded: { passwords, ids: IDS },
  };
}

async function endPools(...pools) {
  for (const p of pools) {
    if (p) await p.end().catch(() => {});
  }
}

module.exports = {
  SRC_DB,
  TGT_DB,
  IDS,
  prepareV5ToV7RehearsalDatabases,
  seedBlessBoardV5Source,
  seedActiveClinicV6Source,
  endPools,
};
