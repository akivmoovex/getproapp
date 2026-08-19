"use strict";

/**
 * Exact failure from hosted testing: TENANT_PUBLISH insert against an older
 * publish_policy check, plus the runtime schema-compatibility detector.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const fs = require("node:fs");
const path = require("node:path");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const {
  CAPABILITY,
  RESULT,
  REQUIRED_WEBSITE_PERMISSIONS,
  REQUIRED_MIGRATIONS,
  inspectV7RuntimeSchemaCompatibility,
  shouldEnforceV7RuntimeSchemaCompatibility,
  resolveV7RuntimeSchemaEnforcement,
  assertV7RuntimeSchemaCompatibilityOrExit,
  parseCheckValues,
  presentV7SchemaCompatibilityPublic,
  rejectIfV7SchemaIncompatible,
  schemaCompatibilityHealthz,
} = require("../src/platform/schema/v7RuntimeSchemaCompatibility");
const instanceRepo = require("../src/platform/website/instanceRepository");
const {
  provisionActiveClinicWebsite,
} = require("../src/activeclinic/website/provisionActiveClinicWebsite");
const {
  submitAndProvisionClinicRegistration,
} = require("../src/activeclinic/services/submitClinicRegistrationService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
} = require("../src/platform/config/deploymentProfiles");
const { ORGANIZATION_ADMIN, resolveEffectivePermissions } = require("../src/activeclinic/services/activeClinicAuthorizationService");
const contentService = require("../src/platform/website/contentService");
const publicationService = require("../src/platform/website/publicationService");
const versionService = require("../src/platform/website/versionService");
const resolver = require("../src/platform/website/resolver");
const { PUBLISH_POLICY } = require("../src/platform/website/publishPolicy");
const {
  createMoovexPlatformRuntimeApp,
} = require("../src/platform/http/moovexPlatformRuntimeServer");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
  CODE_MOOVEX_PLATFORM_PRODUCTION,
  MOOVEX_PLATFORM_IDENTITY_KEY,
} = require("../src/platform/config/canonicalDeploymentProfiles");

const IDENTITY_KEY = "blessboard-platform-v5";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

let pool;
let skipReason = null;
let stamp = 0;
let phoneSeq = 920000000;

function requireDb() {
  if (skipReason) {
    // eslint-disable-next-line no-console
    console.log("skip:", skipReason);
    return false;
  }
  return true;
}

function clinicPayload() {
  stamp += 1;
  phoneSeq += 1;
  return {
    clinicName: `Schema Guard Clinic ${stamp}`,
    contactName: "Schema Admin",
    contactEmail: `schema-guard-${stamp}@example.invalid`,
    contactPhone: `+2609${String(phoneSeq).slice(-8)}`,
    province: "Lusaka Province",
    city: "Lusaka",
    address: "Schema Guard Avenue",
    countryCode: "ZM",
    password: "clinic-admin-pass-12",
    passwordConfirm: "clinic-admin-pass-12",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    dataEnvironment: "testing",
    env: { NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 },
  };
}

describe("V7 runtime schema compatibility and website provision", () => {
  it("extends existing PA diagnostics with schema compatibility", () => {
    const access = fs.readFileSync(
      path.join(__dirname, "../views/blessboard/v5/platform-admin/access-health.ejs"),
      "utf8"
    );
    assert.match(access, /data-bb-pa-schema-compatibility="1"/);
    assert.match(access, /V7 schema compatibility/);
    const dash = fs.readFileSync(
      path.join(__dirname, "../views/blessboard/v5/platform-admin/dashboard.ejs"),
      "utf8"
    );
    assert.match(dash, /data-bb-pa-schema-compatibility="1"/);
    const startup = fs.readFileSync(
      path.join(__dirname, "../src/platform/schema/v7RuntimeSchemaCompatibility.js"),
      "utf8"
    );
    assert.doesNotMatch(startup, /migrate\(/);
    assert.match(startup, /Do not run migrations from application startup/);
  });
  before(async () => {
    try {
      const url = await resetFoundationDatabase();
      pool = createFoundationPool(url);
      await migrate({ pool });
      await ensureDatabaseIdentity(pool, {
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 240) : "no foundation db";
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  it("parseCheckValues extracts quoted constraint members", () => {
    const values = parseCheckValues(
      "CHECK ((publish_policy = ANY (ARRAY['AUTO_PUBLISH_WITH_MODERATION'::text, 'REVIEW_BEFORE_PUBLISH'::text, 'PLATFORM_LOCKED'::text])))"
    );
    assert.deepEqual(values, [
      "AUTO_PUBLISH_WITH_MODERATION",
      "REVIEW_BEFORE_PUBLISH",
      "PLATFORM_LOCKED",
    ]);
    assert.equal(values.includes(PUBLISH_POLICY.TENANT_PUBLISH), false);
  });

  it("G03: DEPLOYMENT_ENV=testing enforces schema compatibility", () => {
    const decision = resolveV7RuntimeSchemaEnforcement({ DEPLOYMENT_ENV: "testing" });
    assert.equal(decision.enforce, true);
    assert.equal(decision.reason, "deployment_env");
    assert.equal(shouldEnforceV7RuntimeSchemaCompatibility({ DEPLOYMENT_ENV: "testing" }), true);
  });

  it("G03: DEPLOYMENT_ENV=production enforces schema compatibility", () => {
    const decision = resolveV7RuntimeSchemaEnforcement({ DEPLOYMENT_ENV: "production" });
    assert.equal(decision.enforce, true);
    assert.equal(decision.reason, "deployment_env");
    assert.equal(shouldEnforceV7RuntimeSchemaCompatibility({ DEPLOYMENT_ENV: "production" }), true);
  });

  it("G03: missing DEPLOYMENT_ENV still enforces for hosted testing identity", () => {
    const env = {
      DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
      DATABASE_IDENTITY_ENV: "testing",
      PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
    };
    const decision = resolveV7RuntimeSchemaEnforcement(env);
    assert.equal(decision.enforce, true);
    assert.ok(
      decision.reason === "database_identity" || decision.reason === "deployment_profile"
    );
    assert.equal(shouldEnforceV7RuntimeSchemaCompatibility(env), true);
  });

  it("G03: malformed DEPLOYMENT_ENV still enforces for hosted production identity", () => {
    const env = {
      DEPLOYMENT_ENV: "prod",
      DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
      DATABASE_IDENTITY_ENV: "production",
      PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_PRODUCTION,
    };
    const decision = resolveV7RuntimeSchemaEnforcement(env);
    assert.equal(decision.enforce, true);
    assert.notEqual(decision.reason, "deployment_env");
    assert.equal(shouldEnforceV7RuntimeSchemaCompatibility(env), true);
  });

  it("G03: genuine local/dev environments remain unenforced", () => {
    assert.equal(shouldEnforceV7RuntimeSchemaCompatibility({ DEPLOYMENT_ENV: "" }), false);
    assert.equal(shouldEnforceV7RuntimeSchemaCompatibility({ NODE_ENV: "test" }), false);
    assert.equal(shouldEnforceV7RuntimeSchemaCompatibility({ NODE_ENV: "development" }), false);
    assert.equal(
      shouldEnforceV7RuntimeSchemaCompatibility({
        NODE_ENV: "test",
        PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
      }),
      false
    );
    assert.equal(
      shouldEnforceV7RuntimeSchemaCompatibility({
        NODE_ENV: "development",
        DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
        DATABASE_IDENTITY_ENV: "testing",
      }),
      false
    );
    assert.equal(
      resolveV7RuntimeSchemaEnforcement({ NODE_ENV: "development" }).reason,
      "local_or_unhosted"
    );
  });

  it("enforces compatibility only for testing and production deployment env", () => {
    assert.equal(shouldEnforceV7RuntimeSchemaCompatibility({ DEPLOYMENT_ENV: "testing" }), true);
    assert.equal(shouldEnforceV7RuntimeSchemaCompatibility({ DEPLOYMENT_ENV: "production" }), true);
    assert.equal(shouldEnforceV7RuntimeSchemaCompatibility({ DEPLOYMENT_ENV: "" }), false);
    assert.equal(shouldEnforceV7RuntimeSchemaCompatibility({ NODE_ENV: "test" }), false);
  });

  it("schema compatibility validator detects unsupported publish policy", async () => {
    const fake = {
      async query(sql) {
        if (String(sql).includes("website_instances_publish_policy_check")) {
          return {
            rows: [
              {
                def: "CHECK ((publish_policy = ANY (ARRAY['AUTO_PUBLISH_WITH_MODERATION'::text, 'REVIEW_BEFORE_PUBLISH'::text, 'PLATFORM_LOCKED'::text])))",
              },
            ],
          };
        }
        if (String(sql).includes("clinic_registration_applications_status_check")) {
          return {
            rows: [
              {
                def: "CHECK ((status = ANY (ARRAY['submitted'::text, 'provisioning'::text, 'review_required'::text, 'active'::text, 'provision_failed'::text])))",
              },
            ],
          };
        }
        if (String(sql).includes("FROM blessboard.permissions")) {
          return {
            rows: REQUIRED_WEBSITE_PERMISSIONS.map((permission_key) => ({ permission_key })),
          };
        }
        if (String(sql).includes("activeclinic_organization_admin")) {
          return {
            rows: REQUIRED_WEBSITE_PERMISSIONS.map((permission_key) => ({ permission_key })),
          };
        }
        return { rows: [] };
      },
    };
    const report = await inspectV7RuntimeSchemaCompatibility(fake);
    assert.equal(report.compatible, false);
    assert.equal(report.code, RESULT.INCOMPATIBLE);
    assert.ok(report.missing.includes(CAPABILITY.TENANT_PUBLISH_POLICY));
  });

  it("assertV7RuntimeSchemaCompatibilityOrExit fails startup when testing schema is incompatible", async () => {
    const fake = {
      async query() {
        return {
          rows: [
            {
              def: "CHECK ((publish_policy = ANY (ARRAY['REVIEW_BEFORE_PUBLISH'::text])))",
            },
          ],
        };
      },
    };
    let exited = null;
    const logs = [];
    const report = await assertV7RuntimeSchemaCompatibilityOrExit(fake, {
      env: { DEPLOYMENT_ENV: "testing" },
      exit: (code) => {
        exited = code;
      },
      logger: {
        log: (line) => logs.push(String(line)),
        error: (line) => logs.push(String(line)),
      },
    });
    assert.equal(report.compatible, false);
    assert.equal(exited, 1);
    assert.ok(logs.some((line) => /FATAL: V7 runtime schema is incompatible/.test(line)));
    assert.ok(logs.some((line) => /missing=/.test(line)));
  });

  it("new clinic website provision fails clearly when TENANT_PUBLISH is unsupported", async () => {
    const fake = {
      async query(sql) {
        if (String(sql).includes("INSERT INTO platform.website_instances")) {
          const err = new Error(
            'new row for relation "website_instances" violates check constraint "website_instances_publish_policy_check"'
          );
          err.code = "23514";
          throw err;
        }
        return { rows: [] };
      },
    };
    const website = await provisionActiveClinicWebsite(fake, {
      organizationId: "11111111-1111-4111-8111-111111111111",
      slug: "schema-guard-fail",
      publicName: "Schema Guard Fail Clinic",
      status: "coming_soon",
    });
    assert.equal(website.ok, false);
    assert.equal(website.code, "website_provision_failed");
    assert.match(String(website.reason || ""), /website_instances_publish_policy_check/);
  });

  it("createWebsiteInstance preserves the Postgres check-constraint cause", async () => {
    const fake = {
      async query(sql) {
        if (String(sql).includes("SELECT * FROM platform.website_instances")) {
          return { rows: [] };
        }
        if (String(sql).includes("INSERT INTO platform.website_instances")) {
          const err = new Error(
            'new row for relation "website_instances" violates check constraint "website_instances_publish_policy_check"'
          );
          err.code = "23514";
          throw err;
        }
        return { rows: [] };
      },
    };
    const created = await instanceRepo.createWebsiteInstance(fake, {
      organizationId: "11111111-1111-4111-8111-111111111111",
      productCode: "activeclinic",
      templateId: "activeclinic.clinic.v1",
      templateVersion: 1,
      slug: "schema-guard",
      status: "coming_soon",
      scopeKind: "clinic",
      publishPolicy: PUBLISH_POLICY.TENANT_PUBLISH,
    });
    assert.equal(created.ok, false);
    assert.equal(created.code, instanceRepo.RESULT.INVALID_INPUT);
    assert.match(String(created.reason || ""), /website_instances_publish_policy_check/);
  });

  it("healthz exposes gitSha and schemaCompatible without secrets", async () => {
    const app = createMoovexPlatformRuntimeApp({
      env: {
        NODE_ENV: "test",
        DEPLOYMENT_ENV: "testing",
        PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
        DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
        DATABASE_IDENTITY_ENV: "testing",
        DATABASE_URL: "postgres://u:s3cret@host.example:5432/db",
        SESSION_SECRET: "super-secret-session",
        GETPRO_GIT_SHA: "0509e3035a8de3908b3b81dec4de0c03d88bd290",
      },
      productApps: {},
      boot: {
        gitSha: "0509e3035a8d",
        schemaCompatibility: { compatible: true, code: "ok", missing: [] },
      },
    });
    const res = await request(app).get("/healthz");
    assert.equal(res.status, 200);
    assert.equal(res.body.gitSha, "0509e3035a8d");
    assert.equal(res.body.schemaCompatible, true);
    assert.equal(res.body.deploymentCode, CODE_MOOVEX_PLATFORM_TESTING);
    assert.equal(JSON.stringify(res.body).includes("s3cret"), false);
    assert.equal(JSON.stringify(res.body).includes("super-secret"), false);
  });

  it("healthz is unhealthy when schema is incompatible and names the missing capability", async () => {
    const app = createMoovexPlatformRuntimeApp({
      env: {
        NODE_ENV: "test",
        DEPLOYMENT_ENV: "testing",
        PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
        DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
        DATABASE_IDENTITY_ENV: "testing",
        DATABASE_URL: "postgres://u:s3cret@host.example:5432/db",
        SESSION_SECRET: "super-secret-session",
      },
      productApps: {},
      boot: {
        gitSha: "deadbeef",
        schemaCompatibility: {
          compatible: false,
          code: RESULT.INCOMPATIBLE,
          capability: CAPABILITY.TENANT_PUBLISH_POLICY,
          missing: [CAPABILITY.TENANT_PUBLISH_POLICY],
          checks: [
            {
              key: CAPABILITY.TENANT_PUBLISH_POLICY,
              label: "TENANT_PUBLISH policy",
              ok: false,
              remediation: "Apply db/migrations/platform/031_website_tenant_publish_policy.sql",
            },
          ],
        },
      },
    });
    const res = await request(app).get("/healthz");
    assert.equal(res.status, 503);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.schemaCompatible, false);
    assert.equal(res.body.schemaCompatibility.capability, CAPABILITY.TENANT_PUBLISH_POLICY);
    assert.ok(res.body.schemaCompatibility.missing.includes(CAPABILITY.TENANT_PUBLISH_POLICY));
    assert.equal(JSON.stringify(res.body).includes("s3cret"), false);
    assert.equal(JSON.stringify(res.body).includes("super-secret"), false);
  });

  it("public presenter omits SQL details and secrets", () => {
    const presented = presentV7SchemaCompatibilityPublic({
      compatible: false,
      code: RESULT.INCOMPATIBLE,
      capability: CAPABILITY.TENANT_PUBLISH_POLICY,
      missing: [CAPABILITY.TENANT_PUBLISH_POLICY],
      checks: [
        {
          key: CAPABILITY.TENANT_PUBLISH_POLICY,
          label: "TENANT_PUBLISH policy",
          ok: false,
          remediation: "Apply db/migrations/platform/031_website_tenant_publish_policy.sql",
          detail: "postgres://user:s3cret@db/host",
        },
      ],
      details: { publishPolicies: ["REVIEW_BEFORE_PUBLISH"] },
      reason: "missing:website_instances.publish_policy.TENANT_PUBLISH",
    });
    const json = JSON.stringify(presented);
    assert.equal(presented.compatible, false);
    assert.equal(presented.capability, CAPABILITY.TENANT_PUBLISH_POLICY);
    assert.equal(json.includes("s3cret"), false);
    assert.equal(json.includes("postgres://"), false);
    assert.equal(json.includes("publishPolicies"), false);
  });

  it("inspect reports every missing capability instead of stopping at the first", async () => {
    const fake = {
      async query() {
        return { rows: [] };
      },
    };
    const report = await inspectV7RuntimeSchemaCompatibility(fake);
    assert.equal(report.compatible, false);
    assert.ok(report.missing.includes(CAPABILITY.TENANT_PUBLISH_POLICY));
    assert.ok(report.missing.includes(CAPABILITY.WEBSITE_VERSIONING));
    assert.ok(report.missing.includes(CAPABILITY.AC_CANONICAL_REGISTRATION_STATUSES));
    assert.ok(report.missing.includes(CAPABILITY.ORG_ADMIN_WEBSITE_GRANTS));
    assert.ok(report.missing.includes(CAPABILITY.REQUIRED_MIGRATIONS));
    assert.ok(report.checks.length >= 8);
  });

  it("inspect never issues mutating SQL", async () => {
    const seen = [];
    const fake = {
      async query(sql) {
        seen.push(String(sql));
        return { rows: [] };
      },
    };
    await inspectV7RuntimeSchemaCompatibility(fake);
    assert.ok(seen.length > 0);
    for (const sql of seen) {
      assert.equal(/^\s*(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|MIGRATE)\b/i.test(sql), false, sql);
    }
  });

  it("old website_versions schema is reported as missing versioning", async () => {
    const fake = {
      async query(sql) {
        const text = String(sql);
        if (text.includes("information_schema.tables") && text.includes("$2")) {
          return { rows: [] };
        }
        if (text.includes("website_instances_publish_policy_check")) {
          return {
            rows: [
              {
                def: "CHECK ((publish_policy = ANY (ARRAY['TENANT_PUBLISH'::text])))",
              },
            ],
          };
        }
        return { rows: [] };
      },
    };
    const report = await inspectV7RuntimeSchemaCompatibility(fake);
    assert.ok(report.missing.includes(CAPABILITY.WEBSITE_VERSIONING));
  });

  it("rejectIfV7SchemaIncompatible blocks hosted registration and skips local test env", async () => {
    const fake = {
      async query() {
        return { rows: [] };
      },
    };
    const blocked = await rejectIfV7SchemaIncompatible(fake, { DEPLOYMENT_ENV: "testing" });
    assert.ok(blocked);
    assert.equal(blocked.code, "schema_mismatch");
    assert.ok(blocked.capability);
    const skipped = await rejectIfV7SchemaIncompatible(fake, { NODE_ENV: "test" });
    assert.equal(skipped, null);
  });

  it("G03: missing DEPLOYMENT_ENV + hosted testing identity still blocks incompatible schema", async () => {
    const fake = {
      async query() {
        return { rows: [] };
      },
    };
    const blocked = await rejectIfV7SchemaIncompatible(fake, {
      DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
      DATABASE_IDENTITY_ENV: "testing",
      PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
    });
    assert.ok(blocked);
    assert.equal(blocked.code, "schema_mismatch");
    assert.equal(blocked.enforcement.reason, "database_identity");
    let exited = null;
    const logs = [];
    await assertV7RuntimeSchemaCompatibilityOrExit(fake, {
      env: {
        DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
        DATABASE_IDENTITY_ENV: "testing",
      },
      exit: (code) => {
        exited = code;
      },
      logger: {
        log: (line) => logs.push(String(line)),
        error: (line) => logs.push(String(line)),
      },
    });
    assert.equal(exited, 1);
    assert.ok(logs.some((line) => /FATAL/.test(line) && /enforcement=database_identity/.test(line)));
    assert.ok(logs.some((line) => /Do not run migrations from application startup/.test(line)));
  });

  it("G03: malformed DEPLOYMENT_ENV + hosted production identity still blocks incompatible schema", async () => {
    const fake = {
      async query() {
        return { rows: [] };
      },
    };
    const blocked = await rejectIfV7SchemaIncompatible(fake, {
      DEPLOYMENT_ENV: "Production!",
      DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
      DATABASE_IDENTITY_ENV: "production",
      PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_PRODUCTION,
    });
    assert.ok(blocked);
    assert.equal(blocked.code, "schema_mismatch");
    assert.notEqual(blocked.enforcement.reason, "deployment_env");
  });

  it("G03: incompatible TENANT_PUBLISH is reported with platform/031 remediation", async () => {
    const fake = {
      async query(sql) {
        if (String(sql).includes("website_instances_publish_policy_check")) {
          return {
            rows: [
              {
                def: "CHECK ((publish_policy = ANY (ARRAY['AUTO_PUBLISH_WITH_MODERATION'::text, 'REVIEW_BEFORE_PUBLISH'::text, 'PLATFORM_LOCKED'::text])))",
              },
            ],
          };
        }
        return { rows: [] };
      },
    };
    const report = await inspectV7RuntimeSchemaCompatibility(fake);
    assert.equal(report.compatible, false);
    assert.ok(report.missing.includes(CAPABILITY.TENANT_PUBLISH_POLICY));
    const check = report.checks.find((row) => row.key === CAPABILITY.TENANT_PUBLISH_POLICY);
    assert.equal(check.ok, false);
    assert.match(String(check.remediation || ""), /031_website_tenant_publish_policy/);
  });

  it("G03: missing website permission migration is reported", async () => {
    const fake = {
      async query(sql) {
        const text = String(sql);
        if (text.includes("FROM blessboard.permissions")) {
          return { rows: [] };
        }
        if (text.includes("FROM platform.schema_migrations")) {
          return {
            rows: REQUIRED_MIGRATIONS.filter(
              (item) => !(item.module === "blessboard" && item.version === "095")
            ).map((item) => ({ module: item.module, version: item.version })),
          };
        }
        return { rows: [] };
      },
    };
    const report = await inspectV7RuntimeSchemaCompatibility(fake);
    assert.equal(report.compatible, false);
    assert.ok(report.missing.includes(CAPABILITY.WEBSITE_PERMISSIONS));
    const check = report.checks.find((row) => row.key === CAPABILITY.WEBSITE_PERMISSIONS);
    assert.equal(check.ok, false);
    assert.match(String(check.remediation || ""), /website_engine_permissions|093|094/);
  });

  it("G03: missing canonical lifecycle migration is reported", async () => {
    const fake = {
      async query(sql) {
        const text = String(sql);
        if (text.includes("clinic_registration_applications_status_check")) {
          return {
            rows: [
              {
                def: "CHECK ((status = ANY (ARRAY['submitted'::text, 'provisioning'::text, 'active'::text])))",
              },
            ],
          };
        }
        if (text.includes("FROM platform.schema_migrations")) {
          return {
            rows: REQUIRED_MIGRATIONS.filter(
              (item) =>
                !(
                  (item.module === "activeclinic" && item.version === "030") ||
                  (item.module === "blessboard" && item.version === "098")
                )
            ).map((item) => ({ module: item.module, version: item.version })),
          };
        }
        return { rows: [] };
      },
    };
    const report = await inspectV7RuntimeSchemaCompatibility(fake);
    assert.equal(report.compatible, false);
    assert.ok(report.missing.includes(CAPABILITY.AC_CANONICAL_REGISTRATION_STATUSES));
    assert.ok(report.missing.includes(CAPABILITY.REQUIRED_MIGRATIONS));
    const lifecycle = report.checks.find(
      (row) => row.key === CAPABILITY.AC_CANONICAL_REGISTRATION_STATUSES
    );
    assert.equal(lifecycle.ok, false);
    assert.match(String(lifecycle.remediation || ""), /030_clinic_registration_canonical_lifecycle/);
    const migrations = report.checks.find((row) => row.key === CAPABILITY.REQUIRED_MIGRATIONS);
    assert.equal(migrations.ok, false);
    assert.match(String(migrations.detail || migrations.remediation || ""), /030_clinic_registration_canonical_lifecycle|098_church_registration_canonical_lifecycle/);
  });

  it("schemaCompatibilityHealthz keeps readiness healthy when inspection was skipped", () => {
    const health = schemaCompatibilityHealthz({
      compatible: true,
      code: "skipped",
      missing: [],
    });
    assert.equal(health.status, 200);
    assert.equal(health.schemaCompatible, true);
  });

  it("TENANT_PUBLISH insert succeeds when schema is current", async () => {
    if (!requireDb()) return;
    const report = await inspectV7RuntimeSchemaCompatibility(pool);
    assert.equal(report.compatible, true, JSON.stringify(report));
    assert.ok(report.capabilities.includes(CAPABILITY.TENANT_PUBLISH_POLICY));
    assert.ok(report.capabilities.includes(CAPABILITY.WEBSITE_VERSIONING));
    assert.ok(report.capabilities.includes(CAPABILITY.AC_CANONICAL_REGISTRATION_STATUSES));
    assert.ok(report.capabilities.includes(CAPABILITY.ORG_ADMIN_WEBSITE_GRANTS));
    assert.ok(report.capabilities.includes(CAPABILITY.REQUIRED_MIGRATIONS));
    const org = await pool.query(
      `INSERT INTO platform.organizations (organization_key, display_name, status, data_environment)
       VALUES ($1, $2, 'active', 'testing')
       RETURNING id`,
      [`schema-guard-org-${Date.now()}`, "Schema Guard Org"]
    );
    const website = await provisionActiveClinicWebsite(pool, {
      organizationId: org.rows[0].id,
      slug: `schema-guard-${Date.now()}`,
      publicName: "Schema Guard Clinic",
      status: "coming_soon",
    });
    assert.equal(website.ok, true, JSON.stringify(website));
    assert.equal(website.instance.publishPolicy, PUBLISH_POLICY.TENANT_PUBLISH);
  });

  it("simulates the hosted old publish_policy schema", async () => {
    if (!requireDb()) return;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `ALTER TABLE platform.website_instances
           DROP CONSTRAINT IF EXISTS website_instances_publish_policy_check`
      );
      const report = await inspectV7RuntimeSchemaCompatibility(client);
      assert.equal(report.compatible, false);
      assert.ok(report.missing.includes(CAPABILITY.TENANT_PUBLISH_POLICY));
      const check = report.checks.find((row) => row.key === CAPABILITY.TENANT_PUBLISH_POLICY);
      assert.equal(check.ok, false);
      assert.match(String(check.remediation || ""), /031_website_tenant_publish_policy/);
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  });

  it("simulates a schema missing last_provision_stage", async () => {
    if (!requireDb()) return;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `ALTER TABLE activeclinic.clinic_registration_applications
           DROP COLUMN last_provision_stage`
      );
      const report = await inspectV7RuntimeSchemaCompatibility(client);
      assert.equal(report.compatible, false);
      assert.ok(report.missing.includes(CAPABILITY.AC_PROVISION_STAGE_COLUMNS));
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  });

  it("reports missing BlessBoard last_provision_stage as incompatible", async () => {
    if (!requireDb()) return;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `ALTER TABLE blessboard.platform_church_registration_applications
           DROP COLUMN last_provision_stage`
      );
      const report = await inspectV7RuntimeSchemaCompatibility(client);
      assert.equal(report.compatible, false);
      assert.ok(report.missing.includes(CAPABILITY.BB_PROVISION_STAGE_COLUMNS));
      const check = report.checks.find((row) => row.key === CAPABILITY.BB_PROVISION_STAGE_COLUMNS);
      assert.equal(check.ok, false);
      assert.match(String(check.remediation || ""), /099_church_registration_provision_stage/);
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  });

  it("missing V7 migration marker is reported without weakening compatible startup", async () => {
    const fake = {
      async query(sql) {
        const text = String(sql);
        if (text.includes("FROM platform.schema_migrations")) {
          return {
            rows: REQUIRED_MIGRATIONS.filter(
              (item) => !(item.module === "activeclinic" && item.version === "031")
            ).map((item) => ({ module: item.module, version: item.version })),
          };
        }
        return { rows: [] };
      },
    };
    const report = await inspectV7RuntimeSchemaCompatibility(fake);
    assert.equal(report.compatible, false);
    assert.ok(report.missing.includes(CAPABILITY.REQUIRED_MIGRATIONS));
    const migrations = report.checks.find((row) => row.key === CAPABILITY.REQUIRED_MIGRATIONS);
    assert.equal(migrations.ok, false);
    assert.match(String(migrations.detail || migrations.remediation || ""), /031_clinic_registration_provision_stage/);
  });

  it("simulates missing organization-admin website grants", async () => {
    if (!requireDb()) return;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM blessboard.role_permissions rp
          USING blessboard.roles r, blessboard.permissions p
          WHERE rp.role_id = r.id
            AND rp.permission_id = p.id
            AND r.role_key = 'activeclinic_organization_admin'
            AND p.permission_key = ANY($1::text[])`,
        [REQUIRED_WEBSITE_PERMISSIONS.slice()]
      );
      const report = await inspectV7RuntimeSchemaCompatibility(client);
      assert.equal(report.compatible, false);
      assert.ok(report.missing.includes(CAPABILITY.ORG_ADMIN_WEBSITE_GRANTS));
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  });

  it("current schema provisions one website, org-admin website perms, settings card, versions", async () => {
    if (!requireDb()) return;
    const payload = clinicPayload();
    const created = await submitAndProvisionClinicRegistration(pool, payload);
    assert.equal(created.ok, true, JSON.stringify(created));
    const instances = await pool.query(
      `SELECT id, publish_policy FROM platform.website_instances
        WHERE organization_id = $1 AND product_code = 'activeclinic' AND status <> 'archived'`,
      [created.organizationId]
    );
    assert.equal(instances.rowCount, 1);
    assert.equal(instances.rows[0].publish_policy, PUBLISH_POLICY.TENANT_PUBLISH);
    const content = await pool.query(
      `SELECT count(*)::int AS n FROM platform.website_content WHERE instance_id = $1`,
      [instances.rows[0].id]
    );
    assert.ok(content.rows[0].n > 0);

    const staff = (
      await pool.query(
        `SELECT id, platform_identity_id FROM activeclinic.staff_members
          WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1`,
        [created.organizationId]
      )
    ).rows[0];
    const roles = await pool.query(
      `SELECT r.role_key FROM activeclinic.staff_role_assignments a
         JOIN blessboard.roles r ON r.id = a.role_id
        WHERE a.staff_member_id = $1 AND a.status = 'active'`,
      [staff.id]
    );
    assert.ok(roles.rows.some((row) => row.role_key === ORGANIZATION_ADMIN));
    const resolved = await resolveEffectivePermissions(pool, {
      organizationId: created.organizationId,
      staffMemberId: staff.id,
      platformIdentityId: staff.platform_identity_id,
    });
    for (const key of REQUIRED_WEBSITE_PERMISSIONS) {
      assert.equal(resolved.permissions.includes(key), true, key);
    }

    const session = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: created.identityId,
      organizationId: created.organizationId,
    });
    const app = createActiveClinicFoundationApp({ getPool: () => pool, env: MINIMAL_AC });
    const cookie = `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
    const settings = await request(app).get("/app/settings").set("Cookie", cookie);
    assert.equal(settings.status, 200);
    assert.match(settings.text, /data-ac-settings-card="website"/);
    const websitePage = await request(app).get("/app/settings/website").set("Cookie", cookie);
    assert.equal(websitePage.status, 200);
    assert.match(websitePage.text, /data-ac-website-exists="1"/);
    assert.match(websitePage.text, /data-ac-website-action="edit"/);
    assert.match(websitePage.text, /data-ac-website-action="publish"/);
    assert.match(websitePage.text, /data-ac-website-action="history"/);

    const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(pool, {
      organizationId: created.organizationId,
      productCode: "activeclinic",
    });
    const v1 = await publicationService.publishWebsiteDraft(pool, {
      organizationId: created.organizationId,
      instanceId: instance.id,
      actorIdentityId: created.identityId,
      allowEmpty: true,
    });
    assert.equal(v1.ok, true, JSON.stringify(v1));
    assert.equal(v1.version.versionNumber, 1);
    const liveTitle = (
      await resolver.resolveWebsiteContent(pool, {
        organizationId: created.organizationId,
        instance,
        mode: resolver.MODE.LIVE,
      })
    ).values["home.hero.title"];
    const saved = await contentService.saveWebsiteDraft(pool, {
      organizationId: created.organizationId,
      instanceId: instance.id,
      contentKey: "home.hero.eyebrow",
      value: "QA draft only",
      actorIdentityId: created.identityId,
    });
    assert.equal(saved.ok, true);
    const liveAfterDraft = await resolver.resolveWebsiteContent(pool, {
      organizationId: created.organizationId,
      instance,
      mode: resolver.MODE.LIVE,
    });
    assert.equal(liveAfterDraft.values["home.hero.title"], liveTitle);
    const draft = await resolver.resolveWebsiteContent(pool, {
      organizationId: created.organizationId,
      instance,
      mode: resolver.MODE.DRAFT,
    });
    assert.equal(draft.values["home.hero.eyebrow"], "QA draft only");
    const listedAfterDraft = await versionService.listWebsiteVersions(pool, {
      instanceId: instance.id,
      organizationId: created.organizationId,
    });
    assert.equal((listedAfterDraft.versions || []).length, 1);

    const v2 = await publicationService.publishWebsiteDraft(pool, {
      organizationId: created.organizationId,
      instanceId: instance.id,
      actorIdentityId: created.identityId,
    });
    assert.equal(v2.ok, true);
    assert.equal(v2.version.versionNumber, 2);
    const restored = await publicationService.restoreWebsiteVersionLive(pool, {
      organizationId: created.organizationId,
      instanceId: instance.id,
      versionId: v1.version.id,
      actorIdentityId: created.identityId,
    });
    assert.equal(restored.ok, true, JSON.stringify(restored));
    assert.equal(restored.version.versionNumber, 3);
    const listed = await versionService.listWebsiteVersions(pool, {
      instanceId: instance.id,
      organizationId: created.organizationId,
    });
    const byNumber = Object.fromEntries(
      (listed.versions || []).map((row) => [row.versionNumber, row])
    );
    assert.equal(byNumber[1].status, "superseded");
    assert.equal(byNumber[2].status, "superseded");
    assert.equal(byNumber[3].status, "published");
    assert.equal(byNumber[1].versionNumber, 1);
    assert.equal(byNumber[2].versionNumber, 2);
  });
});
