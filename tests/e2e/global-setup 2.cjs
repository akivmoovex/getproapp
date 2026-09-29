"use strict";

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const STATE_PATH = path.join(__dirname, ".foundation-e2e-state.json");

module.exports = async function globalSetup() {
  const databaseUrl = String(process.env.E2E_DATABASE_URL || "").trim();
  if (!databaseUrl) {
    throw new Error("E2E_DATABASE_URL is required for the Foundation release E2E suite.");
  }

  process.env.NODE_ENV = "test";
  process.env.GETPRO_TEST_DB = "1";
  process.env.TEST_DATABASE_URL = databaseUrl;
  process.env.DATABASE_URL = databaseUrl;
  process.env.DEPLOYMENT_ENV = "testing";
  process.env.EXPECTED_DATABASE_ENV = "testing";

  const { getPgPool } = require("../../src/db/pg/pool");
  const { ensureChurchSchema } = require("../../src/db/pg/ensureChurchSchema");
  const { ensureCanonicalTenantsForTests } = require("../helpers/pgTestSeed");
  const { getDatabaseIdentity } = require("../../src/db/pg/church/databaseIdentityRepo");
  const adminUsersRepo = require("../../src/db/pg/adminUsersRepo");

  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  await ensureChurchSchema(pool);

  const identity = await getDatabaseIdentity(pool);
  if (!identity || identity.environmentCode !== "testing") {
    throw new Error(
      `E2E database identity must be testing after schema apply; received ${
        identity ? identity.environmentCode : "missing"
      }. Run: DEPLOYMENT_ENV=testing DATABASE_URL=… npm run church:db-identity:init -- --env testing --confirm`
    );
  }

  const runId = String(process.env.BLESSBOARD_E2E_RUN_ID || "").replace(/[^a-z0-9-]/gi, "-");
  const slugPrefix = `e2e-${runId}`.toLowerCase().slice(0, 40);

  // Dedicated DB only, after identity verification: remove stale E2E fixtures.
  await pool.query(
    `DELETE FROM public.church_organizations
      WHERE slug LIKE 'e2e-%'
        AND created_at < now() - interval '12 hours'`
  );

  const adminUsername = process.env.E2E_ADMIN_USERNAME || "foundation_e2e_admin";
  const adminPassword = process.env.E2E_ADMIN_PASSWORD || "FoundationE2E-admin-2026!";
  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const existing = await adminUsersRepo.getByUsernameLower(pool, adminUsername);
  if (existing) {
    await pool.query(
      `UPDATE public.admin_users
          SET password_hash = $2,
              role = 'super_admin',
              tenant_id = NULL,
              enabled = true,
              security_version = security_version + 1
        WHERE id = $1`,
      [existing.id, passwordHash]
    );
  } else {
    await adminUsersRepo.insertUser(pool, {
      username: adminUsername,
      passwordHash,
      role: "super_admin",
      tenantId: null,
      displayName: "Foundation E2E Admin",
    });
  }

  fs.writeFileSync(
    STATE_PATH,
    JSON.stringify(
      {
        runId,
        slugPrefix,
        adminUsername,
        adminPassword,
        platformHost: process.env.E2E_PLATFORM_HOST || "admin.local.test",
        churchDomain: "local.test",
        databaseIdentity: {
          environmentCode: identity.environmentCode,
          deploymentName: identity.deploymentName,
          databaseInstanceId: identity.databaseInstanceId,
        },
        shared: {},
      },
      null,
      2
    )
  );
};
