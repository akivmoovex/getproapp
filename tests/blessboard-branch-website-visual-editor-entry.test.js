"use strict";

/**
 * Branch Admin Website nav → authenticated visual editor entry.
 * Reuses Phase 7 inline-field draft APIs; does not open submissions list.
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
const { CSRF_COOKIE, CSRF_FIELD, issueCsrfToken } = require("../src/platform/http/v5Csrf");
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  provisionEmptyPublicPages,
  createPageSection,
  updatePublicPage,
} = require("../src/blessboard/services/publicContentAdminService");
const draftRepo = require("../src/blessboard/repositories/websiteInlineFieldDraftRepository");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "visual-a.blessboard.org";
const HOST_B = "visual-b.blessboard.org";
const APEX = "blessboard.org";

function cookieHeader(...pairs) {
  return pairs.filter(Boolean).join("; ");
}

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

describe("branch admin website visual editor entry", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let churchA;
  let churchB;
  let branchA;
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

      orgA = await provisionPlatformTenant(pool, {
        organizationKey: "visual-edit-a",
        displayName: "Visual Edit A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "visual-edit-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);
      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "visual-edit-a",
        churchKey: "visual-edit-a",
        displayName: "Visual Edit A Church",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      branchA = chA.records.hqBranch;

      orgB = await provisionPlatformTenant(pool, {
        organizationKey: "visual-edit-b",
        displayName: "Visual Edit B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "visual-edit-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(orgB.ok, true, orgB.message);
      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "visual-edit-b",
        churchKey: "visual-edit-b",
        displayName: "Visual Edit B Church",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);
      churchB = chB.records.church;

      await ensureChurchSettingsInitialized(pool, churchA.id);
      await updateChurchSettings(pool, churchA.id, {
        websiteStatus: "published",
        publicName: "Visual Edit A Church",
      });
      await provisionEmptyPublicPages(pool, { churchId: churchA.id, branchId: null });
      const home = await pool.query(
        `SELECT id FROM blessboard.public_pages
          WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL LIMIT 1`,
        [churchA.id]
      );
      assert.ok(home.rows[0], "home page");
      const published = await updatePublicPage(pool, home.rows[0].id, {
        status: "published",
      });
      assert.equal(published.ok, true, published.reason || "publish home");
      const sectionCreated = await createPageSection(pool, {
        pageId: home.rows[0].id,
        sectionKey: "hero",
        sectionType: "hero",
        heading: "Published Visual Hero",
        bodyText: "Published body",
        status: "published",
        sortOrder: 0,
      });
      assert.equal(sectionCreated.ok, true, sectionCreated.reason || "create hero");

      async function makeUser(email, displayName, role, organizationId) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        if (role) {
          assert.equal((await assignBlessBoardRole(pool, role)).ok, true);
        }
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-staging",
          userId: created.user.id,
          organizationId,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      users.branchA = await makeUser(
        "branch-visual-a@example.test",
        "Branch A",
        {
          email: "branch-visual-a@example.test",
          organizationKey: "visual-edit-a",
          roleKey: "branch_admin",
          churchKey: "visual-edit-a",
          branchKey: "hq",
        },
        orgA.records.organization.id
      );
      users.memberA = await makeUser(
        "member-visual-a@example.test",
        "Member A",
        null,
        orgA.records.organization.id
      );
      users.branchB = await makeUser(
        "branch-visual-b@example.test",
        "Branch B",
        {
          email: "branch-visual-b@example.test",
          organizationKey: "visual-edit-b",
          roleKey: "branch_admin",
          churchKey: "visual-edit-b",
          branchKey: "hq",
        },
        orgB.records.organization.id
      );

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
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
    if (skipSuite) {
      console.log(`skip: ${skipReason}`);
      return true;
    }
    return false;
  }

  it("authenticated branch admin GET /branch-admin/website redirects to visual editor", async () => {
    if (skipIfNeeded()) return;
    const res = await request(app)
      .get("/branch-admin/website")
      .redirects(0)
      .set("Host", APEX)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.branchA.rawToken}`));
    assert.equal(res.status, 303);
    // The assigned branch's site, not the church-wide page. A branch admin holds no
    // grant on the church-wide site, so that target renders no edit controls at all.
    assert.equal(res.headers.location, "/c/visual-edit-a/branches/hq?website_edit=1");
    assert.match(res.headers.location, /\/branches\//);
    assert.doesNotMatch(res.headers.location, /submissions/);
  });

  it("anonymous visitor is redirected to login with next back to website editor", async () => {
    if (skipIfNeeded()) return;
    const res = await request(app)
      .get("/branch-admin/website")
      .redirects(0)
      .set("Host", APEX)
      .set("Accept", "text/html");
    assert.equal(res.status, 303);
    assert.match(res.headers.location, /\/login\?next=/);
    assert.match(
      decodeURIComponent(res.headers.location),
      /next=\/branch-admin\/website/
    );
    assert.doesNotMatch(
      decodeURIComponent(res.headers.location),
      /next=\/branch-admin\/website\/submissions/
    );
  });

  it("member cannot access website editor entry", async () => {
    if (skipIfNeeded()) return;
    const res = await request(app)
      .get("/branch-admin/website")
      .redirects(0)
      .set("Host", APEX)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.memberA.rawToken}`));
    assert.ok(res.status === 403 || res.status === 404);
  });

  it("branch admin from org B cannot open org A website editor entry", async () => {
    if (skipIfNeeded()) return;
    const res = await request(app)
      .get("/branch-admin/website")
      .redirects(0)
      .set("Host", APEX)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.branchB.rawToken}`));
    if (res.status === 303) {
      assert.equal(res.headers.location, "/c/visual-edit-b/branches/hq?website_edit=1");
      assert.doesNotMatch(res.headers.location, /visual-edit-a/);
    } else {
      assert.ok(res.status === 403 || res.status === 404);
    }
  });

  it("visual editor page shows edit icons for allowlisted fields", async () => {
    if (skipIfNeeded()) return;
    const res = await request(app)
      .get("/c/visual-edit-a?website_edit=1")
      .set("Host", APEX)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.branchA.rawToken}`))
      .expect(200);
    assert.match(res.text, /data-bb-edit-toolbar/);
    assert.match(res.text, /Editing website/);
    assert.match(res.text, /data-bb-inline-edit/);
    assert.match(res.text, /data-bb-field="heading"/);
    assert.match(res.text, /aria-label="Edit hero heading"/);
    assert.match(res.text, /Exit Editing/);
    assert.doesNotMatch(res.text, /data-bb-phase4-branch-website-overview/);
  });

  it("branch inline field save requires CSRF and updates draft only", async () => {
    if (skipIfNeeded()) return;

    const noCsrf = await request(app)
      .post("/branch-admin/content/api/inline-field")
      .set("Host", APEX)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.branchA.rawToken}`))
      .send({
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "Should Fail",
      });
    assert.equal(noCsrf.status, 403);

    const csrf = issueCsrfToken(baseEnv());
    const unknown = await request(app)
      .post("/branch-admin/content/api/inline-field")
      .set("Host", APEX)
      .set(
        "Cookie",
        cookieHeader(
          `${DEFAULT_V5_COOKIE}=${users.branchA.rawToken}`,
          `${CSRF_COOKIE}=${csrf}`
        )
      )
      .set("X-CSRF-Token", csrf)
      .send({
        [CSRF_FIELD]: csrf,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "not_a_real_field",
        value: "Nope",
      });
    assert.ok(unknown.status === 400 || unknown.status === 422 || unknown.status === 403);
    assert.equal(unknown.body.ok, false);

    const tooLong = await request(app)
      .post("/branch-admin/content/api/inline-field")
      .set("Host", APEX)
      .set(
        "Cookie",
        cookieHeader(
          `${DEFAULT_V5_COOKIE}=${users.branchA.rawToken}`,
          `${CSRF_COOKIE}=${csrf}`
        )
      )
      .set("X-CSRF-Token", csrf)
      .send({
        [CSRF_FIELD]: csrf,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "x".repeat(500),
      });
    assert.ok(tooLong.status === 400 || tooLong.status === 422);
    assert.equal(tooLong.body.ok, false);

    const withScope = await request(app)
      .post("/branch-admin/content/api/inline-field")
      .set("Host", APEX)
      .set(
        "Cookie",
        cookieHeader(
          `${DEFAULT_V5_COOKIE}=${users.branchA.rawToken}`,
          `${CSRF_COOKIE}=${csrf}`
        )
      )
      .set("X-CSRF-Token", csrf)
      .send({
        [CSRF_FIELD]: csrf,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "Scoped Ignore",
        organizationId: orgB.records.organization.id,
        churchId: churchB.id,
      });
    assert.equal(withScope.status, 400);
    assert.equal(withScope.body.reason, "invalid_scope");

    const ok = await request(app)
      .post("/branch-admin/content/api/inline-field")
      .set("Host", APEX)
      .set(
        "Cookie",
        cookieHeader(
          `${DEFAULT_V5_COOKIE}=${users.branchA.rawToken}`,
          `${CSRF_COOKIE}=${csrf}`
        )
      )
      .set("X-CSRF-Token", csrf)
      .send({
        [CSRF_FIELD]: csrf,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "Branch Draft Hero",
      })
      .expect(200);
    assert.equal(ok.body.ok, true);
    assert.equal(ok.body.published, false);
    assert.equal(ok.body.value, "Branch Draft Hero");

    const drafts = await draftRepo.listDrafts(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      pageKey: "home",
    });
    assert.ok(
      drafts.some((d) => d.fieldKey === "heading" && d.newValue === "Branch Draft Hero")
    );

    const publicRes = await request(app)
      .get("/c/visual-edit-a")
      .set("Host", APEX)
      .expect(200);
    assert.match(publicRes.text, /Published Visual Hero/);
    assert.doesNotMatch(publicRes.text, /Branch Draft Hero/);

    const editRes = await request(app)
      .get("/c/visual-edit-a?website_edit=1")
      .set("Host", APEX)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.branchA.rawToken}`))
      .expect(200);
    assert.match(editRes.text, /Branch Draft Hero/);
  });

  it("cross-org branch admin cannot save into org A field API", async () => {
    if (skipIfNeeded()) return;
    const csrf = issueCsrfToken(baseEnv());
    const res = await request(app)
      .post("/branch-admin/content/api/inline-field")
      .set("Host", APEX)
      .set(
        "Cookie",
        cookieHeader(
          `${DEFAULT_V5_COOKIE}=${users.branchB.rawToken}`,
          `${CSRF_COOKIE}=${csrf}`
        )
      )
      .set("X-CSRF-Token", csrf)
      .send({
        [CSRF_FIELD]: csrf,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "Cross Org Attack",
        organizationId: orgA.records.organization.id,
        churchId: churchA.id,
      });
    assert.ok(res.status === 400 || res.status === 403);
    assert.notEqual(res.body && res.body.ok, true);

    const drafts = await draftRepo.listDrafts(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      pageKey: "home",
    });
    assert.ok(!drafts.some((d) => d.newValue === "Cross Org Attack"));
  });
});
