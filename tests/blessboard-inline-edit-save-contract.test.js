"use strict";

/**
 * Inline website edit save contract: public editor CSRF must validate on
 * Branch Admin /branch-admin/content/api/inline-field.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
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
const HOST = "inline-save.blessboard.org";
const APEX = "blessboard.org";
const ORG_KEY = "inline-save-a";

function cookieHeader(...pairs) {
  return pairs.filter(Boolean).join("; ");
}

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

function extractCsrfFromPage(res) {
  const attr = (res.text.match(/data-bb-csrf="([^"]+)"/) || [])[1] || null;
  const lines = [].concat(res.headers["set-cookie"] || []);
  const line = lines.find((c) => String(c).startsWith(`${CSRF_COOKIE}=`));
  const cookie = line ? String(line).split(";")[0].slice(CSRF_COOKIE.length + 1) : null;
  return { attr, cookie };
}

describe("branch admin inline edit save contract", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let org;
  let church;
  let branch;
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

      org = await provisionPlatformTenant(pool, {
        organizationKey: ORG_KEY,
        displayName: "Inline Save A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: ORG_KEY,
        hostname: HOST,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(org.ok, true, org.message);
      const ch = await provisionBlessBoardChurch(pool, {
        organizationKey: ORG_KEY,
        churchKey: ORG_KEY,
        displayName: "Inline Save Church",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
      });
      assert.equal(ch.ok, true, ch.message);
      church = ch.records.church;
      branch = ch.records.hqBranch;

      await ensureChurchSettingsInitialized(pool, church.id);
      await updateChurchSettings(pool, church.id, {
        websiteStatus: "published",
        publicName: "Inline Save Church",
      });
      await provisionEmptyPublicPages(pool, { churchId: church.id, branchId: null });
      const home = await pool.query(
        `SELECT id FROM blessboard.public_pages
          WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL LIMIT 1`,
        [church.id]
      );
      await updatePublicPage(pool, home.rows[0].id, { status: "published" });
      await createPageSection(pool, {
        pageId: home.rows[0].id,
        sectionKey: "hero",
        sectionType: "hero",
        heading: "Published Hero",
        bodyText: "Published body",
        status: "published",
        sortOrder: 0,
      });

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
          deploymentCode: "blessboard-org-v5",
          userId: created.user.id,
          organizationId,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      users.branch = await makeUser(
        "inline-save-branch@example.test",
        "Branch",
        {
          email: "inline-save-branch@example.test",
          organizationKey: ORG_KEY,
          roleKey: "branch_admin",
          churchKey: ORG_KEY,
          branchKey: "hq",
        },
        org.records.organization.id
      );
      users.member = await makeUser(
        "inline-save-member@example.test",
        "Member",
        null,
        org.records.organization.id
      );

      // Custom env object (not process.env) — historically broke path-public CSRF signing.
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

  it("client save contract matches POST JSON inline-field endpoint", () => {
    const js = fs.readFileSync(
      path.join(__dirname, "../public/blessboard/v5/website-inline-edit.js"),
      "utf8"
    );
    assert.match(js, /method:\s*"POST"/);
    assert.match(js, /Content-Type":\s*"application\/json"/);
    assert.match(js, /credentials:\s*"same-origin"/);
    assert.match(js, /X-CSRF-Token/);
    assert.match(js, /pageKey:/);
    assert.match(js, /sectionKey:/);
    assert.match(js, /fieldKey:/);
    assert.match(js, /value:/);
    assert.match(js, /parseSaveResponse/);
    assert.match(js, /not_authenticated/);
  });

  it("CSRF token rendered on public editor saves against branch endpoint", async () => {
    if (skipIfNeeded()) return;

    const page = await request(app)
      .get(`/c/${ORG_KEY}?website_edit=1`)
      .set("Host", APEX)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.branch.rawToken}`))
      .expect(200);
    assert.match(page.text, /data-bb-save-url="\/branch-admin\/content\/api\/inline-field"/);
    const csrf = extractCsrfFromPage(page);
    assert.ok(csrf.attr, "csrf attr");
    assert.ok(csrf.cookie, "csrf cookie");
    assert.equal(csrf.attr, csrf.cookie);

    const save = await request(app)
      .post("/branch-admin/content/api/inline-field")
      .set("Host", APEX)
      .set(
        "Cookie",
        cookieHeader(
          `${DEFAULT_V5_COOKIE}=${users.branch.rawToken}`,
          `${CSRF_COOKIE}=${csrf.cookie}`
        )
      )
      .set("Content-Type", "application/json")
      .set("Accept", "application/json")
      .set("X-CSRF-Token", csrf.attr)
      .send({
        [CSRF_FIELD]: csrf.attr,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "Draft From Page CSRF",
      })
      .expect(200);

    assert.equal(save.body.ok, true);
    assert.equal(save.body.published, false);
    assert.equal(save.body.status, "draft_saved");
    assert.equal(save.body.value, "Draft From Page CSRF");
    assert.equal(save.body.fieldKey, "home::hero::heading");

    const drafts = await draftRepo.listDrafts(pool, {
      churchId: church.id,
      branchId: branch.id,
      pageKey: "home",
    });
    assert.ok(drafts.some((d) => d.newValue === "Draft From Page CSRF"));

    const publicRes = await request(app).get(`/c/${ORG_KEY}`).set("Host", APEX).expect(200);
    assert.match(publicRes.text, /Published Hero/);
    assert.doesNotMatch(publicRes.text, /Draft From Page CSRF/);

    const editReload = await request(app)
      .get(`/c/${ORG_KEY}?website_edit=1`)
      .set("Host", APEX)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.branch.rawToken}`))
      .expect(200);
    assert.match(editReload.text, /Draft From Page CSRF/);
  });

  it("missing CSRF token fails with csrf_failed", async () => {
    if (skipIfNeeded()) return;
    const res = await request(app)
      .post("/branch-admin/content/api/inline-field")
      .set("Host", APEX)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.branch.rawToken}`))
      .set("Content-Type", "application/json")
      .set("Accept", "application/json")
      .send({
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "No CSRF",
      });
    assert.equal(res.status, 403);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.reason, "csrf_failed");
  });

  it("invalid CSRF token fails with csrf_failed", async () => {
    if (skipIfNeeded()) return;
    const good = issueCsrfToken(baseEnv());
    const bad = issueCsrfToken(baseEnv());
    const res = await request(app)
      .post("/branch-admin/content/api/inline-field")
      .set("Host", APEX)
      .set(
        "Cookie",
        cookieHeader(
          `${DEFAULT_V5_COOKIE}=${users.branch.rawToken}`,
          `${CSRF_COOKIE}=${good}`
        )
      )
      .set("Content-Type", "application/json")
      .set("Accept", "application/json")
      .set("X-CSRF-Token", bad)
      .send({
        [CSRF_FIELD]: bad,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "Bad CSRF",
      });
    assert.equal(res.status, 403);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.reason, "csrf_failed");
  });

  it("unknown field and oversized values fail with safe validation codes", async () => {
    if (skipIfNeeded()) return;
    const csrf = issueCsrfToken(baseEnv());
    const unknown = await request(app)
      .post("/branch-admin/content/api/inline-field")
      .set("Host", APEX)
      .set(
        "Cookie",
        cookieHeader(
          `${DEFAULT_V5_COOKIE}=${users.branch.rawToken}`,
          `${CSRF_COOKIE}=${csrf}`
        )
      )
      .set("X-CSRF-Token", csrf)
      .send({
        [CSRF_FIELD]: csrf,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "notReal",
        value: "x",
      });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.ok, false);
    assert.match(String(unknown.body.reason || unknown.body.code), /invalid_field/);

    const csrf2 = issueCsrfToken(baseEnv());
    const tooLong = await request(app)
      .post("/branch-admin/content/api/inline-field")
      .set("Host", APEX)
      .set(
        "Cookie",
        cookieHeader(
          `${DEFAULT_V5_COOKIE}=${users.branch.rawToken}`,
          `${CSRF_COOKIE}=${csrf2}`
        )
      )
      .set("X-CSRF-Token", csrf2)
      .send({
        [CSRF_FIELD]: csrf2,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "x".repeat(500),
      });
    assert.equal(tooLong.status, 400);
    assert.equal(tooLong.body.ok, false);
    assert.match(String(tooLong.body.reason || tooLong.body.code), /validation/);
    assert.match(String(tooLong.body.error || tooLong.body.message), /120|characters|fewer|long/i);
  });

  it("member and anonymous cannot save", async () => {
    if (skipIfNeeded()) return;
    const csrf = issueCsrfToken(baseEnv());
    const anon = await request(app)
      .post("/branch-admin/content/api/inline-field")
      .set("Host", APEX)
      .set("Content-Type", "application/json")
      .set("Accept", "application/json")
      .send({
        [CSRF_FIELD]: csrf,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "Anon",
      });
    assert.ok(anon.status === 401 || anon.status === 403);

    const member = await request(app)
      .post("/branch-admin/content/api/inline-field")
      .set("Host", APEX)
      .set(
        "Cookie",
        cookieHeader(
          `${DEFAULT_V5_COOKIE}=${users.member.rawToken}`,
          `${CSRF_COOKIE}=${csrf}`
        )
      )
      .set("X-CSRF-Token", csrf)
      .send({
        [CSRF_FIELD]: csrf,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "Member",
      });
    assert.ok(member.status === 401 || member.status === 403);
  });

  it("client-supplied organization or branch ids are rejected", async () => {
    if (skipIfNeeded()) return;
    const csrf = issueCsrfToken(baseEnv());
    const res = await request(app)
      .post("/branch-admin/content/api/inline-field")
      .set("Host", APEX)
      .set(
        "Cookie",
        cookieHeader(
          `${DEFAULT_V5_COOKIE}=${users.branch.rawToken}`,
          `${CSRF_COOKIE}=${csrf}`
        )
      )
      .set("X-CSRF-Token", csrf)
      .send({
        [CSRF_FIELD]: csrf,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "Scoped",
        organizationId: "00000000-0000-4000-8000-000000000099",
        branchId: "00000000-0000-4000-8000-000000000098",
      });
    assert.equal(res.status, 400);
    assert.equal(res.body.reason, "invalid_scope");
  });
});
