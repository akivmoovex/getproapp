"use strict";

/**
 * Phase3 Website Edit Conflict.
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
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  repairWebsiteFoundation,
} = require("../src/blessboard/services/websiteFoundationRepairService");
const publicContentRepo = require("../src/blessboard/repositories/publicContentRepository");
const conflictSvc = require("../src/blessboard/services/websiteEditConflictService");
const auditSvc = require("../src/blessboard/services/websiteAuditService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const HOST_A = "wec-a.blessboard.org";
const HOST_B = "wec-b.blessboard.org";

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    ...overrides,
  };
}

function extractCookie(res, name) {
  const raw = res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

function extractCsrfToken(html) {
  const m = String(html || "").match(
    new RegExp(
      `name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`
    )
  );
  return (m && (m[1] || m[2])) || null;
}

function sidCookie(rawToken) {
  return `${DEFAULT_V5_COOKIE}=${rawToken}`;
}

describe("phase3 website edit conflict", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let churchA;
  let users = {};
  let aboutPage;
  let heroSection;

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

      async function provision(key, host, store) {
        const prov = await provisionPlatformTenant(pool, {
          organizationKey: key,
          displayName: `WEC ${key}`,
          legalName: null,
          dataEnvironment: "testing",
          productKey: "blessboard",
          productTenantKey: key,
          hostname: host,
          domainType: "canonical",
          deploymentCode: "blessboard-org-staging",
          isPrimary: true,
        });
        assert.equal(prov.ok, true, prov.message);
        const ch = await provisionBlessBoardChurch(pool, {
          organizationKey: key,
          churchKey: key,
          displayName: `WEC Church ${key}`,
          dataEnvironment: "testing",
          hqBranchKey: "hq",
          hqBranchDisplayName: "HQ",
        });
        assert.equal(ch.ok, true, ch.message);
        store.org = prov.records.organization;
        store.church = ch.records.church;
        await ensureChurchSettingsInitialized(pool, store.church.id);
        await updateChurchSettings(pool, store.church.id, {
          publicName: `WEC Church ${key}`,
          websiteStatus: "draft",
          primaryEmail: `${key}@example.test`,
        });
        await repairWebsiteFoundation(pool, { churchId: store.church.id });
      }

      const a = {};
      const b = {};
      await provision("wec-a", HOST_A, a);
      await provision("wec-b", HOST_B, b);
      orgA = a.org;
      orgB = b.org;
      churchA = a.church;

      async function makeUser(email, displayName, role, orgId) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        assert.equal((await assignBlessBoardRole(pool, role)).ok, true);
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-staging",
          userId: created.user.id,
          organizationId: orgId,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      users.hqA = await makeUser(
        "wec-hq-a@example.test",
        "HQ A",
        {
          email: "wec-hq-a@example.test",
          organizationKey: "wec-a",
          roleKey: "church_hq_admin",
          churchKey: "wec-a",
        },
        orgA.id
      );
      users.hqB = await makeUser(
        "wec-hq-b@example.test",
        "HQ B",
        {
          email: "wec-hq-b@example.test",
          organizationKey: "wec-b",
          roleKey: "church_hq_admin",
          churchKey: "wec-b",
        },
        orgB.id
      );

      aboutPage = await publicContentRepo.findPageByScope(pool, {
        churchId: churchA.id,
        branchId: null,
        pageKey: "about",
      });
      assert.ok(aboutPage);
      heroSection = await publicContentRepo.findSectionByPageAndKey(
        pool,
        aboutPage.id,
        "hero"
      );
      if (!heroSection) {
        heroSection = await publicContentRepo.insertSection(pool, {
          pageId: aboutPage.id,
          sectionKey: "hero",
          sectionType: "text",
          heading: "Original",
          bodyText: "Body original",
          sortOrder: 1,
          status: "draft",
        });
      }

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

  function skipIfNeeded() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("stale revision is rejected and latest remains unchanged", async () => {
    skipIfNeeded();
    const before = await publicContentRepo.findSectionById(pool, heroSection.id);
    const stale = await publicContentRepo.updateSection(pool, heroSection.id, {
      heading: "Should not apply",
      expectedRevision: Number(before.revisionNumber) - 1 || 0,
    });
    assert.equal(stale.conflict, true);
    const after = await publicContentRepo.findSectionById(pool, heroSection.id);
    assert.equal(after.heading, before.heading);
    assert.equal(after.revisionNumber, before.revisionNumber);
  });

  it("use-latest safely reloads without modifying content", async () => {
    skipIfNeeded();
    const before = await publicContentRepo.findSectionById(pool, heroSection.id);
    const result = await conflictSvc.resolveWebsiteEditConflict(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      actorUserId: users.hqA.user.id,
      pageKey: "about",
      sectionKey: "hero",
      resolution: "use_latest",
      submitted: { heading: "Unsaved" },
    });
    assert.equal(result.ok, true);
    const after = await publicContentRepo.findSectionById(pool, heroSection.id);
    assert.equal(after.heading, before.heading);
    assert.equal(after.revisionNumber, before.revisionNumber);
  });

  it("save-as-draft preserves stale user work", async () => {
    skipIfNeeded();
    const branches = await pool.query(
      `SELECT b.id FROM blessboard.branches b
         INNER JOIN blessboard.churches c ON c.id = b.church_id
        WHERE c.organization_id = $1
        ORDER BY b.is_primary DESC LIMIT 1`,
      [orgA.id]
    );
    const branchId = branches.rows[0].id;
    const before = await publicContentRepo.findSectionById(pool, heroSection.id);
    const result = await conflictSvc.resolveWebsiteEditConflict(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId,
      actorUserId: users.hqA.user.id,
      pageKey: "about",
      sectionKey: "hero",
      resolution: "save_as_draft",
      submitted: { heading: "Conflict draft heading", body_text: "Kept aside" },
    });
    assert.equal(result.ok, true, result.reason);
    assert.ok(result.submission);
    const after = await publicContentRepo.findSectionById(pool, heroSection.id);
    assert.equal(after.heading, before.heading);
  });

  it("force replace requires confirmation and records audit", async () => {
    skipIfNeeded();
    const denied = await conflictSvc.resolveWebsiteEditConflict(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      actorUserId: users.hqA.user.id,
      pageKey: "about",
      sectionKey: "hero",
      resolution: "force_replace",
      confirmForce: false,
      submitted: { heading: "Forced" },
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.reason, "confirm_force");

    const ok = await conflictSvc.resolveWebsiteEditConflict(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      actorUserId: users.hqA.user.id,
      pageKey: "about",
      sectionKey: "hero",
      resolution: "force_replace",
      confirmForce: true,
      submitted: { heading: "Forced heading", body_text: "Forced body" },
    });
    assert.equal(ok.ok, true, ok.reason);
    const after = await publicContentRepo.findSectionById(pool, heroSection.id);
    assert.equal(after.heading, "Forced heading");

    const audits = await auditSvc.listWebsiteAuditEvents(pool, {
      organizationId: orgA.id,
      actionType: "edit_conflict_force_replace",
    });
    assert.ok(audits.items.length >= 1);
  });

  it("CSRF enforced on conflict resolution route", async () => {
    skipIfNeeded();
    const res = await request(app)
      .post("/hq/content/pages/about/sections/hero/conflict/use-latest")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken))
      .type("form")
      .send({});
    assert.equal(res.status, 403);
  });

  it("cross-organization section access blocked", async () => {
    skipIfNeeded();
    const getRes = await request(app)
      .get("/hq/content/pages/about/sections/hero")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken));
    assert.equal(getRes.status, 200);
    const csrf = extractCsrfToken(getRes.text);
    const csrfCookie = extractCookie(getRes, CSRF_COOKIE);

    const cross = await request(app)
      .post("/hq/content/pages/about/sections/hero/conflict/use-latest")
      .set("Host", HOST_B)
      .set("Cookie", `${sidCookie(users.hqB.rawToken)}; ${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send({ [CSRF_FIELD]: csrf });
    assert.ok(cross.status === 403 || cross.status === 404);
  });
});
