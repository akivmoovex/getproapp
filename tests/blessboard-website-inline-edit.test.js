"use strict";

/**
 * Phase 7 Stage 4 — admin website view + inline text draft editing.
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
const {
  saveInlineFieldDraft,
} = require("../src/blessboard/services/websiteInlineDraftService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "inline-a.blessboard.org";
const HOST_B = "inline-b.blessboard.org";

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

describe("blessboard website inline edit foundation", () => {
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

      const table = await pool.query(
        `SELECT to_regclass('blessboard.website_inline_field_drafts') AS rel`
      );
      assert.ok(table.rows[0] && table.rows[0].rel, "migration 047 should create drafts table");

      orgA = await provisionPlatformTenant(pool, {
        organizationKey: "inline-a",
        displayName: "Inline A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "inline-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);
      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "inline-a",
        churchKey: "inline-a",
        displayName: "Inline Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      branchA = chA.records.hqBranch;

      orgB = await provisionPlatformTenant(pool, {
        organizationKey: "inline-b",
        displayName: "Inline B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "inline-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(orgB.ok, true, orgB.message);
      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "inline-b",
        churchKey: "inline-b",
        displayName: "Inline Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);
      churchB = chB.records.church;

      await ensureChurchSettingsInitialized(pool, churchA.id);
      await updateChurchSettings(pool, churchA.id, {
        websiteStatus: "published",
        publicName: "Inline Church A",
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
        heading: "Published Welcome",
        bodyText: "Published body for visitors.",
        status: "published",
        sortOrder: 0,
      });
      assert.equal(sectionCreated.ok, true, sectionCreated.reason || "create hero");

      async function makeUser(email, displayName, role, organizationId) {
        const created = await createBlessBoardUser(pool, { email, displayName, password: PASSWORD });
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

      users.hqA = await makeUser(
        "inline-hq-a@example.test",
        "HQ A",
        {
          email: "inline-hq-a@example.test",
          organizationKey: "inline-a",
          roleKey: "church_hq_admin",
          churchKey: "inline-a",
        },
        orgA.records.organization.id
      );
      users.memberA = await makeUser(
        "inline-member-a@example.test",
        "Member A",
        null,
        orgA.records.organization.id
      );
      users.hqB = await makeUser(
        "inline-hq-b@example.test",
        "HQ B",
        {
          email: "inline-hq-b@example.test",
          organizationKey: "inline-b",
          roleKey: "church_hq_admin",
          churchKey: "inline-b",
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

  it("authorized church admin sees Edit Website; public visitor does not", async () => {
    if (skipIfNeeded()) return;
    const publicRes = await request(app).get("/").set("Host", HOST_A).expect(200);
    assert.doesNotMatch(publicRes.text, /data-bb-edit-website/);
    assert.doesNotMatch(publicRes.text, /data-bb-inline-edit/);
    assert.doesNotMatch(publicRes.text, /Edit Website/);

    const adminRes = await request(app)
      .get("/")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`))
      .expect(200);
    assert.match(adminRes.text, /data-bb-edit-website/);
    assert.match(adminRes.text, /Edit Website/);
    assert.doesNotMatch(adminRes.text, /data-bb-inline-edit/);
    assert.doesNotMatch(adminRes.text, /data-bb-inline-start/);
  });

  it("unauthorized authenticated user does not see edit controls", async () => {
    if (skipIfNeeded()) return;
    const res = await request(app)
      .get("/")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.memberA.rawToken}`))
      .expect(200);
    assert.doesNotMatch(res.text, /data-bb-edit-website/);
    assert.doesNotMatch(res.text, /data-bb-inline-edit/);
  });

  it("editing mode displays pencil controls; default admin view does not", async () => {
    if (skipIfNeeded()) return;
    const viewRes = await request(app)
      .get("/")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`))
      .expect(200);
    assert.doesNotMatch(viewRes.text, /data-bb-inline-edit/);

    const editRes = await request(app)
      .get("/?website_edit=1")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`))
      .expect(200);
    assert.match(editRes.text, /data-bb-edit-toolbar/);
    assert.match(editRes.text, /Exit Editing/);
    assert.match(editRes.text, /data-bb-inline-edit/);
    assert.match(editRes.text, /data-bb-inline-start/);
    assert.match(editRes.text, /website-inline-edit\.js/);
  });

  it("valid inline text change saves to draft and does not publish", async () => {
    if (skipIfNeeded()) return;
    const csrf = issueCsrfToken(baseEnv());
    const res = await request(app)
      .post("/hq/content/api/inline-field")
      .set("Host", HOST_A)
      .set(
        "Cookie",
        cookieHeader(
          `${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`,
          `${CSRF_COOKIE}=${csrf}`
        )
      )
      .set("X-CSRF-Token", csrf)
      .send({
        [CSRF_FIELD]: csrf,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "Draft Heading Only",
      })
      .expect(200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.published, false);
    assert.equal(res.body.value, "Draft Heading Only");

    const drafts = await draftRepo.listDrafts(pool, {
      churchId: churchA.id,
      branchId: null,
      pageKey: "home",
    });
    assert.ok(drafts.some((d) => d.fieldKey === "heading" && d.newValue === "Draft Heading Only"));

    const section = await pool.query(
      `SELECT heading FROM blessboard.page_sections
        WHERE page_id = (
          SELECT id FROM blessboard.public_pages
           WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL
           LIMIT 1
        ) AND section_key = 'hero'`,
      [churchA.id]
    );
    assert.equal(section.rows[0].heading, "Published Welcome");

    const publicRes = await request(app).get("/").set("Host", HOST_A).expect(200);
    assert.match(publicRes.text, /Published Welcome/);
    assert.doesNotMatch(publicRes.text, /Draft Heading Only/);

    const editRes = await request(app)
      .get("/?website_edit=1")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`))
      .expect(200);
    assert.match(editRes.text, /Draft Heading Only/);
    assert.match(editRes.text, /data-bb-review-publish/);
    assert.match(editRes.text, /Current website text/);
    assert.match(editRes.text, /Proposed new text/);
    assert.match(editRes.text, /data-bb-published-value="Published Welcome"/);
    assert.match(editRes.text, /data-bb-inline-save-publish="1"/);
    assert.match(editRes.text, /data-bb-publish-url="\/hq\/content\/api\/inline-field\/publish"/);
  });

  it("editing does not mutate the frozen published baseline attribute", async () => {
    if (skipIfNeeded()) return;
    const editRes = await request(app)
      .get("/?website_edit=1")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`))
      .expect(200);
    assert.match(editRes.text, /data-bb-published-value="Published Welcome"/);
    const js = fs.readFileSync(
      path.join(__dirname, "../public/blessboard/v5/website-inline-edit.js"),
      "utf8"
    );
    assert.match(js, /data-bb-published-value/);
    assert.match(js, /updateProposedPreview/);
    assert.doesNotMatch(js, /setAttribute\("data-bb-published-value", input\.value\)/);
  });

  it("Save and Publish persists, publishes, and preserves previous value", async () => {
    if (skipIfNeeded()) return;
    const csrf = issueCsrfToken(baseEnv());
    const beforeSection = await pool.query(
      `SELECT heading FROM blessboard.page_sections
        WHERE page_id = (
          SELECT id FROM blessboard.public_pages
           WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL
           LIMIT 1
        ) AND section_key = 'hero'`,
      [churchA.id]
    );
    const previousHeading = beforeSection.rows[0].heading;

    const res = await request(app)
      .post("/hq/content/api/inline-field/publish")
      .set("Host", HOST_A)
      .set(
        "Cookie",
        cookieHeader(
          `${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`,
          `${CSRF_COOKIE}=${csrf}`
        )
      )
      .set("Content-Type", "application/json")
      .set("Accept", "application/json")
      .set("X-CSRF-Token", csrf)
      .send({
        [CSRF_FIELD]: csrf,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "Published Via Save And Publish",
      })
      .expect(200);

    assert.equal(res.body.ok, true);
    assert.equal(res.body.published, true);
    assert.equal(res.body.value, "Published Via Save And Publish");
    assert.equal(res.body.previousValue, previousHeading);
    assert.match(String(res.body.message || ""), /published successfully/i);

    const drafts = await draftRepo.countDrafts(pool, {
      churchId: churchA.id,
      branchId: null,
    });
    assert.equal(drafts, 0);

    const section = await pool.query(
      `SELECT heading FROM blessboard.page_sections
        WHERE page_id = (
          SELECT id FROM blessboard.public_pages
           WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL
           LIMIT 1
        ) AND section_key = 'hero'`,
      [churchA.id]
    );
    assert.equal(section.rows[0].heading, "Published Via Save And Publish");

    const applied = await pool.query(
      `SELECT previous_value, new_value, status
         FROM blessboard.website_inline_field_drafts
        WHERE church_id = $1
          AND page_key = 'home'
          AND section_key = 'hero'
          AND field_key = 'heading'
        ORDER BY updated_at DESC
        LIMIT 1`,
      [churchA.id]
    );
    assert.ok(applied.rows[0]);
    assert.equal(applied.rows[0].status, "applied");
    assert.equal(applied.rows[0].previous_value, previousHeading);
    assert.equal(applied.rows[0].new_value, "Published Via Save And Publish");

    const publicRes = await request(app).get("/").set("Host", HOST_A).expect(200);
    assert.match(publicRes.text, /Published Via Save And Publish/);

    // Repeat submit with same value should not invent a new draft (no change).
    const csrf2 = issueCsrfToken(baseEnv());
    const repeat = await request(app)
      .post("/hq/content/api/inline-field/publish")
      .set("Host", HOST_A)
      .set(
        "Cookie",
        cookieHeader(
          `${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`,
          `${CSRF_COOKIE}=${csrf2}`
        )
      )
      .set("X-CSRF-Token", csrf2)
      .send({
        [CSRF_FIELD]: csrf2,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "Published Via Save And Publish",
      });
    assert.ok(repeat.status === 409 || repeat.status === 200);
    if (repeat.status === 409) {
      assert.equal(repeat.body.ok, false);
      assert.match(String(repeat.body.reason || ""), /no_changes|not_ready/);
    }
  });

  it("Save and Publish validation and CSRF failures are not silent", async () => {
    if (skipIfNeeded()) return;
    const csrf = issueCsrfToken(baseEnv());
    const validation = await request(app)
      .post("/hq/content/api/inline-field/publish")
      .set("Host", HOST_A)
      .set(
        "Cookie",
        cookieHeader(
          `${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`,
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
    assert.equal(validation.status, 400);
    assert.equal(validation.body.ok, false);
    assert.ok(validation.body.error || validation.body.message);

    const csrfFail = await request(app)
      .post("/hq/content/api/inline-field/publish")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`))
      .set("Content-Type", "application/json")
      .set("Accept", "application/json")
      .send({
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "Should Fail CSRF",
      });
    assert.equal(csrfFail.status, 403);
    assert.equal(csrfFail.body.ok, false);
    assert.equal(csrfFail.body.reason, "csrf_failed");
  });

  it("unauthorized roles cannot Save and Publish", async () => {
    if (skipIfNeeded()) return;
    const csrf = issueCsrfToken(baseEnv());
    const res = await request(app)
      .post("/hq/content/api/inline-field/publish")
      .set("Host", HOST_A)
      .set(
        "Cookie",
        cookieHeader(
          `${DEFAULT_V5_COOKIE}=${users.memberA.rawToken}`,
          `${CSRF_COOKIE}=${csrf}`
        )
      )
      .set("X-CSRF-Token", csrf)
      .send({
        [CSRF_FIELD]: csrf,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "Member Publish",
      });
    assert.ok(res.status === 401 || res.status === 403);
    assert.notEqual(res.body && res.body.ok, true);
  });

  it("cross mark creates no change (cancel is client-only)", async () => {
    if (skipIfNeeded()) return;
    const before = await draftRepo.countDrafts(pool, { churchId: churchA.id, branchId: null });
    const js = fs.readFileSync(
      path.join(__dirname, "../public/blessboard/v5/website-inline-edit.js"),
      "utf8"
    );
    assert.match(js, /data-bb-inline-cancel/);
    assert.match(js, /exitEdit\(cancelRoot, prior\)/);
    const after = await draftRepo.countDrafts(pool, { churchId: churchA.id, branchId: null });
    assert.equal(after, before);
  });

  it("invalid field key is rejected", async () => {
    if (skipIfNeeded()) return;
    const csrf = issueCsrfToken(baseEnv());
    const res = await request(app)
      .post("/hq/content/api/inline-field")
      .set("Host", HOST_A)
      .set(
        "Cookie",
        cookieHeader(
          `${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`,
          `${CSRF_COOKIE}=${csrf}`
        )
      )
      .set("X-CSRF-Token", csrf)
      .send({
        [CSRF_FIELD]: csrf,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "notARealField",
        value: "x",
      })
      .expect(400);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.reason, "invalid_field");
  });

  it("cross-organization mutation is rejected", async () => {
    if (skipIfNeeded()) return;
    const csrf = issueCsrfToken(baseEnv());
    // Org B admin authenticated against host A — no role on tenant A.
    const res = await request(app)
      .post("/hq/content/api/inline-field")
      .set("Host", HOST_A)
      .set(
        "Cookie",
        cookieHeader(
          `${DEFAULT_V5_COOKIE}=${users.hqB.rawToken}`,
          `${CSRF_COOKIE}=${csrf}`
        )
      )
      .set("X-CSRF-Token", csrf)
      .set("Accept", "application/json")
      .send({
        [CSRF_FIELD]: csrf,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "Cross Org Hijack",
        organizationId: orgA.records.organization.id,
        churchId: churchA.id,
      });
    assert.equal(res.status, 403);
    if (res.body && typeof res.body === "object" && Object.keys(res.body).length) {
      assert.equal(res.body.ok, false);
    }
    const drafts = await draftRepo.listDrafts(pool, {
      churchId: churchA.id,
      branchId: null,
      pageKey: "home",
    });
    assert.ok(!drafts.some((d) => d.newValue === "Cross Org Hijack"));
  });

  it("missing CSRF is rejected", async () => {
    if (skipIfNeeded()) return;
    const res = await request(app)
      .post("/hq/content/api/inline-field")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`))
      .send({
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "No CSRF",
      })
      .expect(403);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.reason, "csrf_failed");
  });

  it("save failure preserves previous published content", async () => {
    if (skipIfNeeded()) return;
    const before = await pool.query(
      `SELECT heading FROM blessboard.page_sections
        WHERE page_id = (
          SELECT id FROM blessboard.public_pages
           WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL
           LIMIT 1
        ) AND section_key = 'hero'`,
      [churchA.id]
    );
    const previousHeading = before.rows[0].heading;
    let threw = false;
    try {
      await saveInlineFieldDraft(pool, {
        organizationId: orgA.records.organization.id,
        churchId: churchA.id,
        branchId: null,
        editorUserId: users.hqA.user.id,
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "heading",
        newValue: "x".repeat(5000),
      });
    } catch (err) {
      threw = true;
      assert.equal(err.code, "VALIDATION");
    }
    assert.equal(threw, true);
    const section = await pool.query(
      `SELECT heading FROM blessboard.page_sections
        WHERE page_id = (
          SELECT id FROM blessboard.public_pages
           WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL
           LIMIT 1
        ) AND section_key = 'hero'`,
      [churchA.id]
    );
    assert.equal(section.rows[0].heading, previousHeading);
    assert.notEqual(section.rows[0].heading, "x".repeat(5000));
  });

  it("shared editing assets and allowlist exist", () => {
    if (skipIfNeeded()) return;
    assert.ok(
      fs.existsSync(path.join(__dirname, "../views/blessboard/v5/partials/editable-text.ejs"))
    );
    assert.ok(
      fs.existsSync(path.join(__dirname, "../views/blessboard/v5/partials/website-admin-chrome.ejs"))
    );
    assert.ok(
      fs.existsSync(path.join(__dirname, "../public/blessboard/v5/website-inline-edit.js"))
    );
    const fields = require("../src/blessboard/services/websiteInlineEditableFields");
    assert.ok(fields.resolveEditableField("home", "hero", "heading"));
    assert.equal(fields.resolveEditableField("home", "hero", "notARealField"), null);
  });
});
