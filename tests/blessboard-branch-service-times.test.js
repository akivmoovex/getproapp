"use strict";

/**
 * Stage 2 — branch-scoped service times (storage, auth, public fallback).
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
  buildBlessBoardTenantContext,
} = require("../src/blessboard/http/buildBlessBoardTenantContext");
const {
  saveHomeServiceTimes,
  resolvePublicServiceTimesEntries,
  loadAdminServiceTimes,
} = require("../src/blessboard/services/homeServiceTimesService");
const {
  loadTenantPublicPageModel,
  KIND,
} = require("../src/blessboard/http/loadTenantPublicPageModel");
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "stimes-a.blessboard.org";
const HOST_B = "stimes-b.blessboard.org";

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

describe("blessboard branch service times (stage 2)", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let churchA;
  let hqBranchA;
  let campusEast;
  let campusWest;
  let tenantA;
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
        organizationKey: "stimes-a",
        displayName: "Service Times Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "stimes-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provA.ok, true, provA.message);
      orgA = provA.records.organization;

      const provB = await provisionPlatformTenant(pool, {
        organizationKey: "stimes-b",
        displayName: "Service Times Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "stimes-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provB.ok, true, provB.message);

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "stimes-a",
        churchKey: "stimes-a",
        displayName: "Service Times Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      hqBranchA = chA.records.hqBranch;

      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "stimes-b",
        churchKey: "stimes-b",
        displayName: "Service Times Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);

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

      tenantA = buildBlessBoardTenantContext({
        organization: { id: orgA.id, key: "stimes-a" },
        church: {
          id: churchA.id,
          churchKey: "stimes-a",
          displayName: "Service Times Church A",
          dataEnvironment: "testing",
        },
        hqBranch: {
          id: hqBranchA.id,
          branchKey: "hq",
          displayName: "HQ A",
        },
        primaryBranch: {
          id: hqBranchA.id,
          branchKey: "hq",
          displayName: "HQ A",
        },
      });

      async function makeUser(email, displayName, role) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        assert.equal((await assignBlessBoardRole(pool, role)).ok, true);
        const orgId =
          role.organizationKey === "stimes-a"
            ? orgA.id
            : provB.records.organization.id;
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-v5",
          userId: created.user.id,
          organizationId: orgId,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      users.hqA = await makeUser("hq-stimes@example.test", "HQ A", {
        email: "hq-stimes@example.test",
        organizationKey: "stimes-a",
        roleKey: "church_hq_admin",
        churchKey: "stimes-a",
      });
      users.eastAdmin = await makeUser("east-stimes@example.test", "East Admin", {
        email: "east-stimes@example.test",
        organizationKey: "stimes-a",
        roleKey: "branch_admin",
        churchKey: "stimes-a",
        branchKey: "campus-east",
      });
      users.westAdmin = await makeUser("west-stimes@example.test", "West Admin", {
        email: "west-stimes@example.test",
        organizationKey: "stimes-a",
        roleKey: "branch_admin",
        churchKey: "stimes-a",
        branchKey: "campus-west",
      });
      users.hqB = await makeUser("hq-b-stimes@example.test", "HQ B", {
        email: "hq-b-stimes@example.test",
        organizationKey: "stimes-b",
        roleKey: "church_hq_admin",
        churchKey: "stimes-b",
      });

      await ensureChurchSettingsInitialized(pool, churchA.id);
      await updateChurchSettings(pool, churchA.id, {
        publicName: "Service Times Church A",
        websiteStatus: "published",
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
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  async function authedGet(url, host, user) {
    const res = await request(app)
      .get(url)
      .set("Host", host)
      .set("Cookie", `${DEFAULT_V5_COOKIE}=${user.rawToken}`);
    const csrf = extractCookie(res, CSRF_COOKIE);
    return { res, csrf };
  }

  async function authedPost(url, host, user, csrf, fields) {
    return request(app)
      .post(url)
      .set("Host", host)
      .set(
        "Cookie",
        `${DEFAULT_V5_COOKIE}=${user.rawToken}; ${CSRF_COOKIE}=${csrf}`
      )
      .type("form")
      .send({ [CSRF_FIELD]: csrf, ...fields });
  }

  it("1–2. Branch A and Branch B have different times; updating A does not affect B", async () => {
    requireDb();
    const savedA = await saveHomeServiceTimes(pool, {
      churchId: churchA.id,
      branchId: campusEast.id,
      organizationId: orgA.id,
      actorUserId: users.hqA.user.id,
      action: "save_publish",
      entries: [
        {
          name: "East Sunday",
          day: "sunday",
          startTime: "09:00",
          endTime: "10:30",
          location: "East Hall",
          sortOrder: 0,
        },
      ],
    });
    assert.equal(savedA.ok, true, savedA.reason || savedA.message);

    const savedB = await saveHomeServiceTimes(pool, {
      churchId: churchA.id,
      branchId: campusWest.id,
      organizationId: orgA.id,
      actorUserId: users.hqA.user.id,
      action: "save_publish",
      entries: [
        {
          name: "West Saturday",
          day: "saturday",
          startTime: "18:00",
          endTime: null,
          location: "West Hall",
          sortOrder: 0,
        },
      ],
    });
    assert.equal(savedB.ok, true, savedB.reason || savedB.message);

    const pubA = await resolvePublicServiceTimesEntries(pool, {
      churchId: churchA.id,
      branchId: campusEast.id,
    });
    const pubB = await resolvePublicServiceTimesEntries(pool, {
      churchId: churchA.id,
      branchId: campusWest.id,
    });
    assert.equal(pubA.entries.length, 1);
    assert.equal(pubA.entries[0].name, "East Sunday");
    assert.equal(pubB.entries.length, 1);
    assert.equal(pubB.entries[0].name, "West Saturday");

    const updateA = await saveHomeServiceTimes(pool, {
      churchId: churchA.id,
      branchId: campusEast.id,
      organizationId: orgA.id,
      actorUserId: users.hqA.user.id,
      action: "save_publish",
      entries: [
        {
          name: "East Updated",
          day: "sunday",
          startTime: "10:00",
          sortOrder: 0,
        },
      ],
    });
    assert.equal(updateA.ok, true);

    const afterA = await resolvePublicServiceTimesEntries(pool, {
      churchId: churchA.id,
      branchId: campusEast.id,
    });
    const afterB = await resolvePublicServiceTimesEntries(pool, {
      churchId: churchA.id,
      branchId: campusWest.id,
    });
    assert.equal(afterA.entries[0].name, "East Updated");
    assert.equal(afterB.entries[0].name, "West Saturday");
  });

  it("3. Branch Admin edits only the assigned branch", async () => {
    requireDb();
    const { res, csrf } = await authedGet(
      "/branch-admin/website/service-times",
      HOST_A,
      users.eastAdmin
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /Campus East/);
    assert.match(res.text, /data-bb-branch-service-times="1"/);

    const post = await authedPost(
      "/branch-admin/website/service-times",
      HOST_A,
      users.eastAdmin,
      csrf,
      {
        action: "save_publish",
        "name[]": "East Admin Service",
        "day[]": "wednesday",
        "start_time[]": "19:00",
        "end_time[]": "",
        "location[]": "East",
        "note[]": "",
        "enabled[]": "1",
        "sort_order[]": "0",
      }
    );
    assert.equal(post.status, 303);

    const east = await resolvePublicServiceTimesEntries(pool, {
      churchId: churchA.id,
      branchId: campusEast.id,
    });
    const west = await resolvePublicServiceTimesEntries(pool, {
      churchId: churchA.id,
      branchId: campusWest.id,
    });
    assert.equal(east.entries[0].name, "East Admin Service");
    assert.notEqual(west.entries[0].name, "East Admin Service");

    const denied = await authedGet(
      "/hq/website/branches/campus-west/service-times",
      HOST_A,
      users.eastAdmin
    );
    assert.ok(denied.res.status === 403 || denied.res.status === 404);
  });

  it("4–5. HQ edits authorized branch; foreign branch returns 404", async () => {
    requireDb();
    const { res, csrf } = await authedGet(
      "/hq/website/branches/campus-west/service-times",
      HOST_A,
      users.hqA
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /Campus West/);

    const post = await authedPost(
      "/hq/website/branches/campus-west/service-times",
      HOST_A,
      users.hqA,
      csrf,
      {
        action: "save_draft",
        "name[]": "West HQ Draft",
        "day[]": "friday",
        "start_time[]": "17:00",
        "end_time[]": "",
        "location[]": "",
        "note[]": "",
        "enabled[]": "1",
        "sort_order[]": "0",
      }
    );
    assert.equal(post.status, 303);

    const missing = await authedGet(
      "/hq/website/branches/does-not-exist/service-times",
      HOST_A,
      users.hqA
    );
    assert.equal(missing.res.status, 404);

    const cross = await authedGet(
      "/hq/website/branches/campus-east/service-times",
      HOST_A,
      users.hqB
    );
    assert.ok(cross.res.status === 403 || cross.res.status === 404);
  });

  it("6–7. Draft times are not public; published times become public", async () => {
    requireDb();
    const draft = await saveHomeServiceTimes(pool, {
      churchId: churchA.id,
      branchId: campusWest.id,
      organizationId: orgA.id,
      actorUserId: users.hqA.user.id,
      action: "save_draft",
      entries: [
        {
          name: "West Draft Only",
          day: "monday",
          startTime: "07:00",
          sortOrder: 0,
        },
      ],
    });
    assert.equal(draft.ok, true);
    assert.equal(draft.published, false);

    const before = await resolvePublicServiceTimesEntries(pool, {
      churchId: churchA.id,
      branchId: campusWest.id,
    });
    assert.ok(
      !before.entries.some((e) => e.name === "West Draft Only"),
      "draft must not be public"
    );

    const published = await saveHomeServiceTimes(pool, {
      churchId: churchA.id,
      branchId: campusWest.id,
      organizationId: orgA.id,
      actorUserId: users.hqA.user.id,
      action: "save_publish",
      entries: [
        {
          name: "West Live",
          day: "monday",
          startTime: "07:00",
          sortOrder: 0,
        },
      ],
    });
    assert.equal(published.ok, true);
    assert.equal(published.published, true);

    const after = await resolvePublicServiceTimesEntries(pool, {
      churchId: churchA.id,
      branchId: campusWest.id,
    });
    assert.equal(after.source, "branch");
    assert.equal(after.entries[0].name, "West Live");
  });

  it("8–9. Branch times override church-wide; church-wide inherited when branch absent", async () => {
    requireDb();
    const churchWide = await saveHomeServiceTimes(pool, {
      churchId: churchA.id,
      branchId: null,
      organizationId: orgA.id,
      actorUserId: users.hqA.user.id,
      action: "save_publish",
      entries: [
        {
          name: "Church Wide Sunday",
          day: "sunday",
          startTime: "08:00",
          sortOrder: 0,
        },
      ],
    });
    assert.equal(churchWide.ok, true);

    // Fresh branch with no service times page — inherits church-wide.
    const orphan = await pool.query(
      `INSERT INTO blessboard.branches
         (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
       VALUES ($1, 'campus-north', 'Campus North', 'branch', 'active', false, 'UTC', 'ZM')
       RETURNING id`,
      [churchA.id]
    );
    const northId = orphan.rows[0].id;
    const inherited = await resolvePublicServiceTimesEntries(pool, {
      churchId: churchA.id,
      branchId: northId,
    });
    assert.equal(inherited.source, "church");
    assert.equal(inherited.entries[0].name, "Church Wide Sunday");

    const eastOverride = await resolvePublicServiceTimesEntries(pool, {
      churchId: churchA.id,
      branchId: campusEast.id,
    });
    assert.equal(eastOverride.source, "branch");
    assert.notEqual(eastOverride.entries[0].name, "Church Wide Sunday");
  });

  it("10. No real church receives demo times", async () => {
    requireDb();
    const clearHq = await saveHomeServiceTimes(pool, {
      churchId: churchA.id,
      branchId: hqBranchA.id,
      organizationId: orgA.id,
      actorUserId: users.hqA.user.id,
      action: "save_publish",
      entries: [],
    });
    assert.equal(clearHq.ok, true, clearHq.message || clearHq.reason || clearHq.status);
    const clearChurch = await saveHomeServiceTimes(pool, {
      churchId: churchA.id,
      branchId: null,
      organizationId: orgA.id,
      actorUserId: users.hqA.user.id,
      action: "save_publish",
      entries: [],
    });
    assert.equal(clearChurch.ok, true, clearChurch.reason || clearChurch.message);

    const adminHq = await loadAdminServiceTimes(pool, {
      churchId: churchA.id,
      branchId: hqBranchA.id,
    });
    assert.equal(adminHq.ok, true);
    assert.equal(adminHq.entries.length, 0);

    const adminChurch = await loadAdminServiceTimes(pool, {
      churchId: churchA.id,
      branchId: null,
    });
    assert.equal(adminChurch.ok, true);
    assert.equal(adminChurch.entries.length, 0);

    const resolved = await resolvePublicServiceTimesEntries(pool, {
      churchId: churchA.id,
      branchId: hqBranchA.id,
    });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.entries.length, 0);
    assert.equal(resolved.source, null);

    const model = await loadTenantPublicPageModel(pool, {
      tenant: tenantA,
      pageKey: "home",
      hostname: HOST_A,
    });
    assert.equal(model.kind, KIND.OK);
    assert.equal(model.serviceTimesEntries.length, 0);
    assert.equal(model.serviceTimesSource, null);
    // Demo pack must never soft-fill intentional emptiness.
    assert.equal(
      JSON.stringify(model.serviceTimesEntries).includes("Sunday Gathering"),
      false
    );
  });

  it("11. Validation and database failures are visible", async () => {
    requireDb();
    const { res, csrf } = await authedGet(
      "/hq/website/branches/campus-east/service-times",
      HOST_A,
      users.hqA
    );
    assert.equal(res.status, 200);

    const bad = await authedPost(
      "/hq/website/branches/campus-east/service-times",
      HOST_A,
      users.hqA,
      csrf,
      {
        action: "save_publish",
        "name[]": "",
        "day[]": "sunday",
        "start_time[]": "09:00",
        "end_time[]": "",
        "location[]": "",
        "note[]": "",
        "enabled[]": "1",
        "sort_order[]": "0",
      }
    );
    assert.equal(bad.status, 400);
    assert.match(bad.text, /service time|name|try again|check/i);
    assert.match(bad.text, /bb-st-errors|form-errors|error/i);

    const invalid = await saveHomeServiceTimes(pool, {
      churchId: churchA.id,
      branchId: campusEast.id,
      action: "save_publish",
      entries: [{ name: "X", day: "notaday", startTime: "09:00" }],
    });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.status, "invalid_input");
    assert.ok(invalid.message);

    const loaded = await loadAdminServiceTimes(pool, {
      churchId: churchA.id,
      branchId: campusEast.id,
    });
    assert.equal(loaded.ok, true);
  });
});
