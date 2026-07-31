"use strict";

/**
 * Prompt 7 Stage 3 — branch website settings editor UI.
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
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
  updateBranchSettings,
  ensureBranchSettingsInitialized,
} = require("../src/blessboard/services/blessBoardSettingsService");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  CSRF_COOKIE,
  CSRF_FIELD,
  issueCsrfToken,
} = require("../src/platform/http/v5Csrf");
const {
  setWebsiteScopeOverride,
  resetWebsiteScopeField,
  hideWebsiteScopeField,
} = require("../src/blessboard/services/websiteScopeSettingsService");
const {
  upsertBranchWebsiteGovernance,
  ensureBranchWebsiteGovernance,
} = require("../src/blessboard/services/branchWebsiteGovernanceService");
const {
  saveHomeServiceTimes,
} = require("../src/blessboard/services/homeServiceTimesService");
const {
  provisionEmptyPublicPages,
  updatePublicPage,
} = require("../src/blessboard/services/publicContentAdminService");

const IDENTITY_KEY = "blessboard-platform-v5";
const HOST = "stage3-a.blessboard.org";
const HOST_B = "stage3-b.blessboard.org";
const PASSWORD = "Stage3TestPassword!!";

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    ...overrides,
  };
}

function sidCookie(rawToken) {
  return `${DEFAULT_V5_COOKIE}=${rawToken}`;
}

function cookieHeader(...parts) {
  return parts.filter(Boolean).join("; ");
}

describe("blessboard prompt7 stage3 website settings editor", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let churchA;
  let hqBranch;
  let campusEast;
  let campusWest;
  let orgB;
  let churchB;
  let hqBranchB;
  let users = {};

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      const provA = await provisionPlatformTenant(pool, {
        organizationKey: "stage3-a",
        displayName: "Stage3 Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "stage3-a",
        hostname: HOST,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provA.ok, true, provA.message);
      orgA = provA.records.organization;

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "stage3-a",
        churchKey: "stage3-a",
        displayName: "Stage3 Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Stage3 HQ",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      hqBranch = chA.records.hqBranch;

      const east = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-east', 'Campus East', 'branch', 'active', false, 'UTC', 'ZM')
         RETURNING id, branch_key, display_name`,
        [churchA.id]
      );
      campusEast = east.rows[0];
      const west = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-west', 'Campus West', 'branch', 'active', false, 'UTC', 'ZM')
         RETURNING id, branch_key, display_name`,
        [churchA.id]
      );
      campusWest = west.rows[0];

      for (const b of [hqBranch, campusEast, campusWest]) {
        await ensureBranchWebsiteGovernance(pool, {
          organizationId: orgA.id,
          churchId: churchA.id,
          branchId: b.id,
        });
      }

      await ensureChurchSettingsInitialized(pool, churchA.id);
      await updateChurchSettings(pool, churchA.id, {
        publicName: "Stage3 Church A",
        websiteStatus: "published",
        primaryEmail: "church@stage3-a.test",
        primaryPhone: "+260311000001",
      });
      await ensureBranchSettingsInitialized(pool, campusEast.id);
      await updateBranchSettings(pool, campusEast.id, {
        publicName: "Campus East",
        phone: "+260311000111",
        email: "east@stage3-a.test",
        addressLine1: "11 East Road",
        city: "Lusaka",
      });
      await ensureBranchSettingsInitialized(pool, campusWest.id);

      const pages = await provisionEmptyPublicPages(pool, { churchId: churchA.id });
      const home = pages.pages.find((p) => p.pageKey === "home");
      await updatePublicPage(pool, home.id, { status: "published" });
      await saveHomeServiceTimes(pool, {
        churchId: churchA.id,
        branchId: null,
        action: "save_publish",
        entries: [
          {
            name: "Church Sunday",
            day: "sunday",
            startTime: "09:00",
            endTime: "10:30",
            enabled: true,
            sortOrder: 1,
          },
        ],
      });

      const provB = await provisionPlatformTenant(pool, {
        organizationKey: "stage3-b",
        displayName: "Stage3 Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "stage3-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provB.ok, true, provB.message);
      orgB = provB.records.organization;
      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "stage3-b",
        churchKey: "stage3-b",
        displayName: "Stage3 Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Stage3 B HQ",
      });
      assert.equal(chB.ok, true, chB.message);
      churchB = chB.records.church;
      hqBranchB = chB.records.hqBranch;

      async function makeUser(email, displayName, role, orgId) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        if (role) assert.equal((await assignBlessBoardRole(pool, role)).ok, true);
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-v5",
          userId: created.user.id,
          organizationId: orgId,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      users.hqA = await makeUser(
        "stage3-hq-a@example.test",
        "HQ A",
        {
          email: "stage3-hq-a@example.test",
          organizationKey: "stage3-a",
          roleKey: "church_hq_admin",
          churchKey: "stage3-a",
        },
        orgA.id
      );
      users.branchEast = await makeUser(
        "stage3-br-east@example.test",
        "Branch East Admin",
        {
          email: "stage3-br-east@example.test",
          organizationKey: "stage3-a",
          roleKey: "branch_admin",
          churchKey: "stage3-a",
          branchKey: "campus-east",
        },
        orgA.id
      );
      users.hqB = await makeUser(
        "stage3-hq-b@example.test",
        "HQ B",
        {
          email: "stage3-hq-b@example.test",
          organizationKey: "stage3-b",
          roleKey: "church_hq_admin",
          churchKey: "stage3-b",
        },
        orgB.id
      );

      // Seed states on east: override, hide capability, locked key.
      await upsertBranchWebsiteGovernance(pool, {
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: campusEast.id,
        allowHideOptionalPages: true,
        lockedSettingKeys: ["seo.title"],
      });
      await setWebsiteScopeOverride(pool, {
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: campusEast.id,
        settingKey: "identity.hero_title",
        value: "East Hero Override",
        actorUserId: users.hqA.user.id,
      });
      await hideWebsiteScopeField(pool, {
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: campusEast.id,
        settingKey: "identity.tagline",
        actorUserId: users.hqA.user.id,
      });

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
        apexHosts: new Set(["blessboard.org", "www.blessboard.org"]),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  function authCookie(user, csrf) {
    return cookieHeader(sidCookie(user.rawToken), `${CSRF_COOKIE}=${csrf}`);
  }

  async function getEastEditor() {
    return request(app)
      .get("/hq/website/branches/campus-east/settings")
      .set("Host", HOST)
      .set("Cookie", sidCookie(users.hqA.rawToken));
  }

  // —— Rendering ——
  it("1–6. Editor renders inherited, branch-record, overridden, hidden, locked, missing states", async () => {
    requireDb();
    const beforeCount = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.website_scope_settings
        WHERE branch_id = $1 AND is_active = true`,
      [campusWest.id]
    );
    const westRes = await request(app)
      .get("/hq/website/branches/campus-west/settings")
      .set("Host", HOST)
      .set("Cookie", sidCookie(users.hqA.rawToken));
    assert.equal(westRes.status, 200);
    assert.match(westRes.text, /data-bb-branch-website-settings="1"/);
    assert.match(westRes.text, /Inherited from church/);
    assert.match(westRes.text, /No value available/);
    // Opening editor must not invent rows for inheriting branch.
    const afterCount = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.website_scope_settings
        WHERE branch_id = $1 AND is_active = true`,
      [campusWest.id]
    );
    assert.equal(afterCount.rows[0].n, beforeCount.rows[0].n);

    const eastRes = await getEastEditor();
    assert.equal(eastRes.status, 200);
    assert.match(eastRes.text, /data-bb-setting-state="overridden"/);
    assert.match(eastRes.text, /Overridden for this branch/);
    assert.match(eastRes.text, /East Hero Override/);
    assert.match(eastRes.text, /data-bb-setting-state="hidden"/);
    assert.match(eastRes.text, /Hidden on branch website/);
    assert.match(eastRes.text, /data-bb-setting-key="contact\.phone"/);
    assert.match(eastRes.text, /Using branch information/);
    assert.match(eastRes.text, /\+260311000111/);
    assert.match(eastRes.text, /data-bb-setting-key="seo\.title"[^>]*data-bb-setting-state="locked"|data-bb-setting-state="locked"[^>]*data-bb-setting-key="seo\.title"/);
    assert.match(eastRes.text, /Locked by HQ policy/);
    assert.match(eastRes.text, /Controlled by HQ policy/);
    assert.doesNotMatch(eastRes.text, /data-bb-setting-key="seo\.title"[\s\S]{0,800}data-bb-setting-submit="override"/);
  });

  // —— Actions ——
  it("7–11. Explicit override, update, reset; empty text does not invent override", async () => {
    requireDb();
    const csrf = issueCsrfToken(baseEnv());
    const empty = await request(app)
      .post("/hq/website/branches/campus-west/settings")
      .set("Host", HOST)
      .set("Cookie", authCookie(users.hqA, csrf))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        action: "override",
        settingKey: "identity.hero_description",
        section: "identity",
        value: "   ",
      });
    assert.equal(empty.status, 200);
    assert.match(empty.text, /Enter a value to override|Could not save/);
    const stillEmpty = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.website_scope_settings
        WHERE branch_id = $1 AND setting_key = 'identity.hero_description' AND is_active = true`,
      [campusWest.id]
    );
    assert.equal(stillEmpty.rows[0].n, 0);

    const csrf2 = issueCsrfToken(baseEnv());
    const created = await request(app)
      .post("/hq/website/branches/campus-west/settings")
      .set("Host", HOST)
      .set("Cookie", authCookie(users.hqA, csrf2))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf2,
        action: "override",
        settingKey: "identity.hero_title",
        section: "identity",
        value: "West Hero",
      });
    assert.equal(created.status, 303);
    assert.match(String(created.headers.location || ""), /notice=override_saved/);

    const csrf3 = issueCsrfToken(baseEnv());
    const updated = await request(app)
      .post("/hq/website/branches/campus-west/settings")
      .set("Host", HOST)
      .set("Cookie", authCookie(users.hqA, csrf3))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf3,
        action: "override",
        settingKey: "identity.hero_title",
        section: "identity",
        value: "West Hero Updated",
      });
    assert.equal(updated.status, 303);

    const row = await pool.query(
      `SELECT value_json FROM blessboard.website_scope_settings
        WHERE branch_id = $1 AND setting_key = 'identity.hero_title' AND is_active = true`,
      [campusWest.id]
    );
    assert.equal(row.rows.length, 1);
    assert.equal(row.rows[0].value_json.value, "West Hero Updated");

    const csrf4 = issueCsrfToken(baseEnv());
    const reset = await request(app)
      .post("/hq/website/branches/campus-west/settings")
      .set("Host", HOST)
      .set("Cookie", authCookie(users.hqA, csrf4))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf4,
        action: "reset",
        settingKey: "identity.hero_title",
        section: "identity",
      });
    assert.equal(reset.status, 303);
    assert.match(String(reset.headers.location || ""), /notice=reset/);
    const afterReset = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.website_scope_settings
        WHERE branch_id = $1 AND setting_key = 'identity.hero_title' AND is_active = true`,
      [campusWest.id]
    );
    assert.equal(afterReset.rows[0].n, 0);
  });

  it("12–13. Hide and restore", async () => {
    requireDb();
    await upsertBranchWebsiteGovernance(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: campusWest.id,
      allowHideOptionalPages: true,
    });
    const csrf = issueCsrfToken(baseEnv());
    const hide = await request(app)
      .post("/hq/website/branches/campus-west/settings")
      .set("Host", HOST)
      .set("Cookie", authCookie(users.hqA, csrf))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        action: "hide",
        settingKey: "contact.email",
        section: "contact",
      });
    assert.equal(hide.status, 303);
    assert.match(String(hide.headers.location || ""), /notice=hidden/);

    const csrf2 = issueCsrfToken(baseEnv());
    const restore = await request(app)
      .post("/hq/website/branches/campus-west/settings")
      .set("Host", HOST)
      .set("Cookie", authCookie(users.hqA, csrf2))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf2,
        action: "restore",
        settingKey: "contact.email",
        section: "contact",
      });
    assert.equal(restore.status, 303);
    assert.match(String(restore.headers.location || ""), /notice=restored/);
  });

  it("14–15. Validation failure preserves submitted values", async () => {
    requireDb();
    const csrf = issueCsrfToken(baseEnv());
    const bad = await request(app)
      .post("/hq/website/branches/campus-west/settings")
      .set("Host", HOST)
      .set("Cookie", authCookie(users.hqA, csrf))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        action: "override",
        settingKey: "contact.email",
        section: "contact",
        value: "not-an-email",
      });
    assert.equal(bad.status, 200);
    assert.match(bad.text, /Could not save|Invalid email|not-an-email/);
    assert.match(bad.text, /value="not-an-email"|not-an-email/);
  });

  // —— Security ——
  it("16–17. Locked field has no write control; forged write rejected", async () => {
    requireDb();
    const page = await getEastEditor();
    assert.doesNotMatch(
      page.text,
      /data-bb-setting-key="seo\.title"[\s\S]{0,1200}name="action" value="override"/
    );
    const csrf = issueCsrfToken(baseEnv());
    const forged = await request(app)
      .post("/hq/website/branches/campus-east/settings")
      .set("Host", HOST)
      .set("Cookie", authCookie(users.hqA, csrf))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        action: "override",
        settingKey: "seo.title",
        section: "seo",
        value: "Hacked",
        organizationId: orgB.id,
        churchId: churchB.id,
        branchId: hqBranchB.id,
      });
    // HTML form returns 200 with error, or redirect only on success.
    assert.ok([200, 403].includes(forged.status));
    if (forged.status === 200) {
      assert.match(forged.text, /Could not save|Locked|HQ policy|forbidden/i);
    }
    const row = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.website_scope_settings
        WHERE branch_id = $1 AND setting_key = 'seo.title' AND is_active = true`,
      [campusEast.id]
    );
    assert.equal(row.rows[0].n, 0);
  });

  it("18–23. Cross-org, sibling, CSRF, public, branch-admin policy", async () => {
    requireDb();
    const cross = await request(app)
      .get("/hq/website/branches/hq/settings")
      .set("Host", HOST_B)
      .set("Cookie", sidCookie(users.hqA.rawToken));
    assert.ok([403, 404].includes(cross.status));

    const csrf = issueCsrfToken(baseEnv());
    const sibling = await request(app)
      .post("/hq/website/branches/campus-east/settings")
      .set("Host", HOST)
      .set("Cookie", authCookie(users.hqA, csrf))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        action: "override",
        settingKey: "identity.hero_description",
        section: "identity",
        value: "East only",
        branchId: campusWest.id,
      });
    assert.equal(sibling.status, 303);
    const westLeak = await pool.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.website_scope_settings
        WHERE branch_id = $1 AND setting_key = 'identity.hero_description' AND is_active = true`,
      [campusWest.id]
    );
    assert.equal(westLeak.rows[0].n, 0);

    const noCsrf = await request(app)
      .post("/hq/website/branches/campus-east/settings")
      .set("Host", HOST)
      .set("Cookie", sidCookie(users.hqA.rawToken))
      .type("form")
      .send({
        action: "override",
        settingKey: "identity.hero_description",
        value: "no csrf",
      });
    assert.equal(noCsrf.status, 403);

    const publicGet = await request(app)
      .get("/hq/website/branches/campus-east/settings")
      .set("Host", HOST);
    assert.ok([401, 303].includes(publicGet.status) || publicGet.status === 302);

    const branchAdmin = await request(app)
      .get("/hq/website/branches/campus-east/settings")
      .set("Host", HOST)
      .set("Cookie", sidCookie(users.branchEast.rawToken));
    // HQ-only route: branch admin must not edit via HQ settings.
    assert.ok([403, 401].includes(branchAdmin.status));
  });

  // —— Service times ——
  it("24–27. Service times source, fallback, clear restores church fallback", async () => {
    requireDb();
    const westPage = await request(app)
      .get("/hq/website/branches/campus-west/settings")
      .set("Host", HOST)
      .set("Cookie", sidCookie(users.hqA.rawToken));
    assert.match(westPage.text, /Church Sunday|Inherited from church|church-wide/i);
    assert.match(westPage.text, /Create branch-local service times/);

    await saveHomeServiceTimes(pool, {
      churchId: churchA.id,
      branchId: campusEast.id,
      organizationId: orgA.id,
      actorUserId: users.hqA.user.id,
      action: "save_publish",
      entries: [
        {
          name: "East Evening",
          day: "sunday",
          startTime: "17:00",
          endTime: "18:30",
          enabled: true,
          sortOrder: 1,
        },
      ],
    });
    const eastPage = await getEastEditor();
    assert.match(eastPage.text, /East Evening/);
    assert.match(eastPage.text, /Branch-local service times/);
    assert.match(eastPage.text, /Clear branch-local times/);

    const csrf = issueCsrfToken(baseEnv());
    const clear = await request(app)
      .post("/hq/website/branches/campus-east/settings")
      .set("Host", HOST)
      .set("Cookie", authCookie(users.hqA, csrf))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        action: "clear_service_times",
        section: "service-times",
      });
    assert.equal(clear.status, 303);
    assert.match(String(clear.headers.location || ""), /service_times_cleared/);

    const churchStill = await pool.query(
      `SELECT ps.layout_metadata
         FROM blessboard.page_sections ps
         JOIN blessboard.public_pages pp ON pp.id = ps.page_id
        WHERE pp.church_id = $1 AND pp.branch_id IS NULL AND ps.section_key = 'service_times'
          AND ps.status = 'published'
        LIMIT 1`,
      [churchA.id]
    );
    assert.ok(churchStill.rows[0]);
    const entries = churchStill.rows[0].layout_metadata.entries || [];
    assert.ok(entries.some((e) => e.name === "Church Sunday"));

    const afterClear = await getEastEditor();
    assert.match(afterClear.text, /Church Sunday|Inherited from church|church-wide/i);
  });

  // —— Preview / regression ——
  it("28–32. Preview targets branch; no public edit chrome; church-wide unchanged", async () => {
    requireDb();
    const page = await getEastEditor();
    assert.match(page.text, /data-bb-branch-preview="1"/);
    assert.match(page.text, /href="[^"]*\/branches\/campus-east"/);
    assert.doesNotMatch(page.text, /data-bb-website-admin|bb-tp-edit-/);

    const churchWide = await request(app)
      .get("/hq/website")
      .set("Host", HOST)
      .set("Cookie", sidCookie(users.hqA.rawToken));
    assert.ok([200, 302, 303].includes(churchWide.status));

    const publicSite = await request(app).get("/branches/campus-east").set("Host", HOST);
    assert.equal(publicSite.status, 200);
    assert.doesNotMatch(publicSite.text, /data-bb-branch-website-settings|Override for this branch/);
  });
});
