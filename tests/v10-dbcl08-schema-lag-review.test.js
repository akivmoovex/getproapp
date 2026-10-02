"use strict";

/**
 * V10 DBCL08 — Remaining schema-lag review characterization (ephemeral local Postgres).
 *
 * Proves objects for D1/D5/D6/D7 on fresh migrate and pins source decisions:
 * - D1 deferred (COLS_LEGACY kept)
 * - D5/D6/D7 fallbacks removed
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { insertAuditEvent, listAuditEvents } = require("../src/platform/repositories/auditEventRepository");
const { searchLocations, seedZambiaLocations } = require("../src/platform/geography/locationRepository");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");

describe("V10 DBCL08 schema-lag review", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let orgId;

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ pool });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: "moovex-platform-v7",
        environmentCode: "testing",
      });
      const platform = await provisionPlatformTenant(pool, {
        organizationKey: "dbcl08-org",
        displayName: "DBCL08 Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "dbcl08-org",
        hostname: "dbcl08.blessboard.test",
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      orgId = platform.records.organization.id;
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipSuite) {
      // eslint-disable-next-line no-console
      console.log("skip:", skipReason);
      assert.ok(false, `DBCL08 requires ephemeral Postgres: ${skipReason}`);
    }
  }

  it("fresh has D1 audit facility_id/product_code", async () => {
    requireDb();
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'platform' AND table_name = 'audit_events'
          AND column_name IN ('facility_id', 'product_code')
        ORDER BY 1`
    );
    assert.deepEqual(
      cols.rows.map((r) => r.column_name),
      ["facility_id", "product_code"]
    );
    const facilityId = "11111111-1111-4111-8111-111111111111";
    const inserted = await insertAuditEvent(pool, {
      deploymentCode: "blessboard-org-staging",
      organizationId: orgId,
      facilityId,
      productCode: "blessboard",
      actionKey: "dbcl08.audit.probe",
      entityType: "organization",
      entityId: orgId,
      outcome: "success",
      metadata: { source: "dbcl08" },
    });
    assert.equal(inserted.facilityId, facilityId);
    assert.equal(inserted.productCode, "blessboard");
    const listed = await listAuditEvents(pool, {
      organizationId: orgId,
      facilityId,
      productCode: "blessboard",
      limit: 5,
    });
    assert.ok(listed.events.some((e) => e.id === inserted.id));
  });

  it("fresh has D5 registration tables + D6 AC public objects", async () => {
    requireDb();
    const r = await pool.query(
      `SELECT
         EXISTS (
           SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'blessboard'
              AND table_name = 'platform_church_registration_applications'
         ) AS bb_reg,
         EXISTS (
           SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'activeclinic'
              AND table_name = 'clinic_registration_applications'
         ) AS ac_reg,
         EXISTS (
           SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'activeclinic'
              AND table_name = 'healthcare_organizations'
              AND column_name = 'website_published'
         ) AS website_published`
    );
    assert.equal(r.rows[0].bb_reg, true);
    assert.equal(r.rows[0].ac_reg, true);
    assert.equal(r.rows[0].website_published, true);
  });

  it("fresh has D7 geographic_locations and search works without tableExists probe", async () => {
    requireDb();
    const exists = await pool.query(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'platform' AND table_name = 'geographic_locations'
       ) AS ok`
    );
    assert.equal(exists.rows[0].ok, true);
    await seedZambiaLocations(pool);
    const hits = await searchLocations(pool, { countryCode: "ZM", query: "Lus", limit: 5 });
    assert.ok(hits.some((h) => h.name === "Lusaka"));
  });

  it("source pins: D1 deferred; D5/D6/D7 fallbacks removed", () => {
    const audit = fs.readFileSync(
      path.join(ROOT, "src/platform/repositories/auditEventRepository.js"),
      "utf8"
    );
    assert.match(audit, /REMOVE_AFTER_PRODUCTION_CANONICAL_MIGRATION/);
    assert.match(audit, /COLS_LEGACY/);
    assert.match(audit, /42703/);

    const phone = fs.readFileSync(path.join(ROOT, "src/phone/phoneRulesService.js"), "utf8");
    assert.doesNotMatch(phone, /code === "42703"/);
    assert.doesNotMatch(phone, /return compileRules\(null\)/);
    assert.match(phone, /DBCL08 D5/);

    const geo = fs.readFileSync(
      path.join(ROOT, "src/platform/geography/locationRepository.js"),
      "utf8"
    );
    assert.doesNotMatch(geo, /tableExists/);
    assert.doesNotMatch(geo, /information_schema\.tables/);

    assert.equal(
      fs.existsSync(path.join(ROOT, "src/activeclinic/services/activeClinicPublicSchemaStatus.js")),
      false
    );

    const foundation = fs.readFileSync(
      path.join(ROOT, "src/activeclinic/http/activeClinicFoundationServer.js"),
      "utf8"
    );
    assert.doesNotMatch(foundation, /inspectActiveClinicPublicSchema/);
    assert.doesNotMatch(foundation, /public-schema-status/);

    const adminSvc = fs.readFileSync(
      path.join(ROOT, "src/blessboard/services/registrationApplicationsAdminService.js"),
      "utf8"
    );
    assert.match(adminSvc, /DBCL08 D5: no 42703→schema_mismatch soft map/);
    assert.doesNotMatch(adminSvc, /pgCode === "42703" \|\| pgCode === "42P01"/);
  });
});
