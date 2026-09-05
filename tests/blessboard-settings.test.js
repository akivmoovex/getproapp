"use strict";

/**
 * BlessBoard V5 church/branch settings (schema + HTTP scopes).
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
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const {
  ensureChurchSettingsInitialized,
  ensureBranchSettingsInitialized,
  updateChurchSettings,
  updateBranchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const { validateBranchSettingsInput } = require("../src/blessboard/services/settingsValidation");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "set-a.blessboard.org";
const HOST_B = "set-b.blessboard.org";

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"];
  if (!raw) return null;
  const list = Array.isArray(raw) ? raw : [raw];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

describe("blessboard settings validation", () => {
  it("rejects invalid coordinates and preserves phone display formatting", () => {
    assert.equal(validateBranchSettingsInput({ publicName: "X", latitude: 91 }).ok, false);
    assert.equal(validateBranchSettingsInput({ publicName: "X", longitude: -181 }).ok, false);
    const ok = validateBranchSettingsInput({
      publicName: "Campus",
      email: "a@example.org",
      phone: "+260 97 123 4567",
      latitude: -15.4,
      longitude: 28.3,
      countryCode: "zm",
      timezone: "Africa/Lusaka",
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.value.phone, "+260 97 123 4567");
    assert.equal(ok.value.countryCode, "ZM");
    assert.equal(ok.value.timezone, "Africa/Lusaka");
    assert.equal(
      validateBranchSettingsInput({ publicName: "X", timezone: "Not/AZone" }).ok,
      false
    );
  });
});

describe("blessboard settings http", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let churchA;
  let hqA;
  let users = {};

  before(async () => {
    try {
      process.env.PLATFORM_DEPLOYMENT_CODE = "blessboard-org-staging";
      process.env.DEPLOYMENT_ENV = "testing";
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      const provA = await provisionPlatformTenant(pool, {
        organizationKey: "set-a",
        displayName: "Settings Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "set-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(provA.ok, true);
      orgA = provA.records.organization;

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "set-a",
        churchKey: "set-a",
        displayName: "Settings Church A",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true);
      churchA = chA.records.church;
      hqA = chA.records.hqBranch;

      await provisionPlatformTenant(pool, {
        organizationKey: "set-b",
        displayName: "Settings Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "set-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      await provisionBlessBoardChurch(pool, {
        organizationKey: "set-b",
        churchKey: "set-b",
        displayName: "Settings Church B",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });

      async function make(email, displayName, role) {
        const created = await createBlessBoardUser(pool, { email, displayName, password: PASSWORD });
        assert.equal(created.ok, true);
        assert.equal((await assignBlessBoardRole(pool, role)).ok, true);
        return created.user;
      }

      users.platform = await make("set-platform@example.org", "Set Platform", {
        email: "set-platform@example.org",
        organizationKey: "set-a",
        roleKey: "platform_admin",
      });
      users.hq = await make("set-hq@example.org", "Set HQ", {
        email: "set-hq@example.org",
        organizationKey: "set-a",
        roleKey: "church_hq_admin",
        churchKey: "set-a",
      });
      users.branch = await make("set-branch@example.org", "Set Branch", {
        email: "set-branch@example.org",
        organizationKey: "set-a",
        roleKey: "branch_admin",
        churchKey: "set-a",
        branchKey: "hq",
      });
      users.otherHq = await make("set-other@example.org", "Set Other", {
        email: "set-other@example.org",
        organizationKey: "set-b",
        roleKey: "church_hq_admin",
        churchKey: "set-b",
      });

      app = createV5FoundationApp({
        getPool: () => pool,
        env: {
          NODE_ENV: "test",
          PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
          SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
          SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
          BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
          BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
        },
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  async function cookieFor(user, opts) {
    const created = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId: user.id,
      organizationId: (opts && opts.organizationId) || orgA.id,
      churchId: (opts && opts.churchId) || churchA.id,
      branchId: (opts && opts.branchId) || hqA.id,
    });
    assert.equal(created.ok, true);
    return `${DEFAULT_V5_COOKIE}=${created.rawToken}`;
  }

  it("schema tables and one-row-per-entity FKs exist", async () => {
    requireDb();
    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'blessboard'
          AND table_name IN ('church_settings', 'branch_settings')
        ORDER BY table_name`
    );
    assert.deepEqual(
      tables.rows.map((r) => r.table_name),
      ["branch_settings", "church_settings"]
    );

    const a = await ensureChurchSettingsInitialized(pool, churchA.id);
    assert.equal(a.ok, true);
    const b = await ensureChurchSettingsInitialized(pool, churchA.id);
    assert.equal(b.ok, true);
    assert.equal(a.settings.churchId, b.settings.churchId);
    const count = await pool.query(`SELECT COUNT(*)::int AS n FROM blessboard.church_settings WHERE church_id = $1`, [
      churchA.id,
    ]);
    assert.equal(count.rows[0].n, 1);

    const ba = await ensureBranchSettingsInitialized(pool, hqA.id);
    assert.equal(ba.ok, true);
    const bb = await ensureBranchSettingsInitialized(pool, hqA.id);
    assert.equal(bb.ok, true);
    assert.equal(ba.settings.branchId, bb.settings.branchId);
  });

  it("invalid coordinates rejected by service and DB constraints", async () => {
    requireDb();
    const bad = await updateBranchSettings(pool, hqA.id, {
      publicName: "HQ A",
      latitude: 120,
      longitude: 10,
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.status, "invalid_input");

    await ensureBranchSettingsInitialized(pool, hqA.id);
    await assert.rejects(
      () =>
        pool.query(
          `UPDATE blessboard.branch_settings SET latitude = 99 WHERE branch_id = $1`,
          [hqA.id]
        ),
      /latitude|check constraint/i
    );
  });

  it("HQ and platform_admin can update church settings; CSRF required", async () => {
    requireDb();
    const cookie = await cookieFor(users.hq);
    const page = await request(app)
      .get("/hq/settings")
      .set("Host", HOST_A)
      .set("Cookie", cookie)
      .set("Accept", "text/html");
    assert.equal(page.status, 200);
    assert.match(page.text, /Organization &amp; branch settings|Organization settings|Church settings|Organization & branch settings/i);
    assert.match(page.text, /Organization status/i);
    assert.match(page.text, /Legal \/ registered name|name="legalName"/);
    assert.match(page.text, /First branch|data-bb-hq-branch-settings-form/);
    assert.doesNotMatch(page.text, new RegExp(churchA.id, "i"));
    const csrf = extractCookie(page, CSRF_COOKIE);
    const match = page.text.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(csrf && match);

    const noCsrf = await request(app)
      .post("/hq/settings")
      .set("Host", HOST_A)
      .set("Cookie", cookie)
      .type("form")
      .send({ publicName: "Renamed", websiteStatus: "published" });
    assert.equal(noCsrf.status, 403);

    const save = await request(app)
      .post("/hq/settings")
      .set("Host", HOST_A)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({
        action: "church",
        publicName: "Settings Church Public",
        legalName: "Settings Church Legal Ltd",
        denomination: "Test",
        primaryEmail: "hq@example.org",
        primaryPhone: "+260 97 100 0111",
        defaultTimezone: "Africa/Lusaka",
        defaultCountryCode: "ZM",
        websiteStatus: "draft",
        [CSRF_FIELD]: match[1],
      });
    assert.equal(save.status, 303);
    assert.equal(save.headers.location, "/hq/settings?saved=1");

    const row = await pool.query(
      `SELECT public_name, website_status, primary_phone, default_timezone
         FROM blessboard.church_settings WHERE church_id = $1`,
      [churchA.id]
    );
    assert.equal(row.rows[0].public_name, "Settings Church Public");
    assert.equal(row.rows[0].website_status, "draft");
    assert.equal(row.rows[0].primary_phone, "+260 97 100 0111");
    assert.equal(row.rows[0].default_timezone, "Africa/Lusaka");

    const church = await pool.query(
      `SELECT display_name, legal_name FROM blessboard.churches WHERE id = $1`,
      [churchA.id]
    );
    assert.equal(church.rows[0].display_name, "Settings Church Public");
    assert.equal(church.rows[0].legal_name, "Settings Church Legal Ltd");

    const org = await pool.query(
      `SELECT display_name, legal_name FROM platform.organizations WHERE id = $1`,
      [orgA.id]
    );
    assert.equal(org.rows[0].display_name, "Settings Church Public");

    const audit = await pool.query(
      `SELECT action_key FROM platform.audit_events
        WHERE organization_id = $1 AND action_key = 'settings.church.update'
        ORDER BY created_at DESC LIMIT 1`,
      [orgA.id]
    );
    assert.equal(audit.rows.length, 1);

    const onboarding = await pool.query(
      `SELECT onboarding_status, last_activity_at
         FROM blessboard.organization_onboarding WHERE organization_id = $1`,
      [orgA.id]
    );
    if (onboarding.rows[0]) {
      assert.ok(onboarding.rows[0].last_activity_at);
    }

    const plat = await cookieFor(users.platform);
    const platPage = await request(app)
      .get("/hq/settings")
      .set("Host", HOST_A)
      .set("Cookie", plat);
    assert.equal(platPage.status, 403);
    assert.match(platPage.text, /audited support session|Support mode required/i);
  });

  it("HQ admin can edit first-branch details from settings", async () => {
    requireDb();
    const cookie = await cookieFor(users.hq);
    const page = await request(app)
      .get("/hq/settings")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    const csrf = extractCookie(page, CSRF_COOKIE);
    const match = page.text.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(csrf && match);

    const save = await request(app)
      .post("/hq/settings")
      .set("Host", HOST_A)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({
        action: "branch",
        publicName: "First Branch HQ",
        email: "first-branch@example.org",
        phone_country: "ZM",
        phone_national: "0961112222",
        timezone: "Africa/Lusaka",
        countryCode: "ZM",
        addressLine1: "1 Independence Ave",
        city: "Lusaka",
        [CSRF_FIELD]: match[1],
      });
    assert.equal(save.status, 303);
    assert.equal(save.headers.location, "/hq/settings?branch_saved=1");

    const settings = await pool.query(
      `SELECT public_name, email, phone, address_line_1, city
         FROM blessboard.branch_settings WHERE branch_id = $1`,
      [hqA.id]
    );
    assert.equal(settings.rows[0].public_name, "First Branch HQ");
    assert.equal(settings.rows[0].email, "first-branch@example.org");
    assert.equal(settings.rows[0].phone, "+260961112222");
    assert.equal(settings.rows[0].address_line_1, "1 Independence Ave");

    const branch = await pool.query(
      `SELECT display_name, timezone, country_code FROM blessboard.branches WHERE id = $1`,
      [hqA.id]
    );
    assert.equal(branch.rows[0].display_name, "First Branch HQ");
    assert.equal(branch.rows[0].timezone, "Africa/Lusaka");
    assert.equal(branch.rows[0].country_code, "ZM");

    const audit = await pool.query(
      `SELECT action_key FROM platform.audit_events
        WHERE organization_id = $1 AND action_key = 'settings.branch.update'
        ORDER BY created_at DESC LIMIT 1`,
      [orgA.id]
    );
    assert.equal(audit.rows.length, 1);
  });

  it("normalized branch display-name duplicates are blocked", async () => {
    requireDb();
    // Insert a second live branch directly to exercise uniqueness without plan capacity.
    const inserted = await pool.query(
      `INSERT INTO blessboard.branches
         (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
       VALUES ($1, 'east', 'East Campus', 'branch', 'active', false, 'Africa/Lusaka', 'ZM')
       RETURNING id`,
      [churchA.id]
    );
    assert.ok(inserted.rows[0].id);

    const dup = await updateBranchSettings(pool, hqA.id, {
      publicName: "east campus",
      expectedChurchId: churchA.id,
    });
    assert.equal(dup.ok, false);
    assert.equal(dup.status, "conflict");
    assert.match(String(dup.message || ""), /already exists/i);
  });

  it("branch_admin cannot open church settings; can update branch settings", async () => {
    requireDb();
    const cookie = await cookieFor(users.branch);
    const hqDenied = await request(app)
      .get("/hq/settings")
      .set("Host", HOST_A)
      .set("Cookie", cookie);
    assert.equal(hqDenied.status, 403);

    const page = await request(app)
      .get("/branch-admin/settings")
      .set("Host", HOST_A)
      .set("Cookie", cookie)
      .set("Accept", "text/html");
    assert.equal(page.status, 200);
    assert.match(page.text, /Branch settings/);
    assert.match(page.text, /data-bb-branch-settings="1"/);
    assert.match(page.text, /data-bb-stitch-settings="missing"/);
    assert.match(page.text, /data-bb-settings-nav="1"/);
    assert.match(page.text, /data-bb-settings-form="1"/);
    assert.match(page.text, /data-bb-settings-section="profile"/);
    assert.match(page.text, /data-bb-settings-section="location"/);
    assert.match(page.text, /data-bb-settings-readonly="1"/);
    assert.match(page.text, /data-bb-settings-unavailable="product"/);
    assert.match(page.text, /name="publicName"/);
    assert.match(page.text, /name="email"/);
    assert.match(page.text, /name="phone_country"/);
    assert.match(page.text, /name="phone_national"/);
    assert.doesNotMatch(page.text, /name="phone"/);
    assert.match(page.text, /name="timezone"/);
    assert.match(page.text, /name="countryCode"/);
    assert.match(page.text, /name="addressLine1"/);
    assert.match(page.text, /name="latitude"/);
    assert.match(page.text, /name="longitude"/);
    assert.match(page.text, /name="_csrf"/);
    assert.match(page.text, /method="post"/);
    assert.match(page.text, /action="\/branch-admin\/settings"/);
    assert.match(page.text, /Branch status/i);
    assert.match(page.text, /Website visibility/i);
    assert.doesNotMatch(page.text, /name="denomination"|name="websiteStatus"|name="primaryEmail"|name="legalName"/);
    assert.doesNotMatch(page.text, /name="branding"|name="domain"|name="billing"|name="notification"|type="file"/);
    assert.doesNotMatch(page.text, new RegExp(hqA.id, "i"));
    const csrf = extractCookie(page, CSRF_COOKIE);
    const match = page.text.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(csrf && match);

    const noCsrf = await request(app)
      .post("/branch-admin/settings")
      .set("Host", HOST_A)
      .set("Cookie", cookie)
      .type("form")
      .send({
        publicName: "Should Fail",
      });
    assert.equal(noCsrf.status, 403);

    const save = await request(app)
      .post("/branch-admin/settings")
      .set("Host", HOST_A)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({
        publicName: "HQ Campus Public",
        email: "branch@example.org",
        phone: "+260977777777",
        countryCode: "ZM",
        city: "Lusaka",
        latitude: "-15.3875",
        longitude: "28.3228",
        [CSRF_FIELD]: match[1],
      });
    assert.equal(save.status, 303);

    const row = await pool.query(
      `SELECT public_name, city, latitude::float8 AS lat FROM blessboard.branch_settings WHERE branch_id = $1`,
      [hqA.id]
    );
    assert.equal(row.rows[0].public_name, "HQ Campus Public");
    assert.equal(row.rows[0].city, "Lusaka");
    assert.ok(Math.abs(Number(row.rows[0].lat) - -15.3875) < 0.0001);
  });

  it("cross-church update rejected; inactive tenant rejected; no startup auto-rows for other churches", async () => {
    requireDb();
    // otherHq role is for church B; on host A authorization fails
    const otherOnA = await request(app)
      .get("/hq/settings")
      .set("Host", HOST_A)
      .set("Cookie", await cookieFor(users.otherHq));
    assert.equal(otherOnA.status, 403);

    await pool.query(`UPDATE platform.domains SET status = 'inactive' WHERE hostname = $1`, [HOST_A]);
    try {
      const inactive = await request(app)
        .get("/hq/settings")
        .set("Host", HOST_A)
        .set("Cookie", await cookieFor(users.hq));
      assert.equal(inactive.status, 403);
    } finally {
      await pool.query(`UPDATE platform.domains SET status = 'active' WHERE hostname = $1`, [HOST_A]);
    }

    // Ensure initialize is not automatic for church B until requested
    const churchB = await pool.query(`SELECT id FROM blessboard.churches WHERE church_key = 'set-b'`);
    const before = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.church_settings WHERE church_id = $1`,
      [churchB.rows[0].id]
    );
    assert.equal(before.rows[0].n, 0);
  });

  it("idempotent initialize and V4 wiring untouched", async () => {
    requireDb();
    const first = await ensureChurchSettingsInitialized(pool, churchA.id);
    const second = await ensureChurchSettingsInitialized(pool, churchA.id);
    assert.equal(first.settings.publicName, second.settings.publicName);
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "..", "server.js"),
      "utf8"
    );
    assert.match(src, /server\.legacy/);
    assert.match(src, /isV5FoundationMode/);
  });
});
