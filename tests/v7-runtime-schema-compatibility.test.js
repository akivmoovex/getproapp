"use strict";

/**
 * Exact failure from hosted testing: TENANT_PUBLISH insert against an older
 * publish_policy check, plus the runtime schema-compatibility detector.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

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
  inspectV7RuntimeSchemaCompatibility,
  shouldEnforceV7RuntimeSchemaCompatibility,
  assertV7RuntimeSchemaCompatibilityOrExit,
  parseCheckValues,
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

  it("TENANT_PUBLISH insert succeeds when schema is current", async () => {
    if (!requireDb()) return;
    const report = await inspectV7RuntimeSchemaCompatibility(pool);
    assert.equal(report.compatible, true, JSON.stringify(report));
    assert.ok(report.capabilities.includes(CAPABILITY.TENANT_PUBLISH_POLICY));
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
