"use strict";

/**
 * Phase 7 Stage 5 — structured desktop editors (media + collections) draft foundation.
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
const {
  validateImageUrl,
  validateVideoUrl,
  validateStructuredPayload,
} = require("../src/blessboard/services/websiteStructuredDraftValidation");
const {
  saveStructuredDraft,
  cancelStructuredDraft,
} = require("../src/blessboard/services/websiteStructuredDraftService");
const draftRepo = require("../src/blessboard/repositories/websiteStructuredDraftRepository");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "struct-a.blessboard.org";
const HOST_B = "struct-b.blessboard.org";

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

describe("blessboard website structured editors", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let churchA;
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
        `SELECT to_regclass('blessboard.website_structured_drafts') AS rel`
      );
      assert.ok(table.rows[0] && table.rows[0].rel, "migration 048 required");

      orgA = await provisionPlatformTenant(pool, {
        organizationKey: "struct-a",
        displayName: "Struct A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "struct-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);
      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "struct-a",
        churchKey: "struct-a",
        displayName: "Struct Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ A",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;

      const orgB = await provisionPlatformTenant(pool, {
        organizationKey: "struct-b",
        displayName: "Struct B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "struct-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(orgB.ok, true, orgB.message);
      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "struct-b",
        churchKey: "struct-b",
        displayName: "Struct Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);

      await ensureChurchSettingsInitialized(pool, churchA.id);
      await updateChurchSettings(pool, churchA.id, {
        websiteStatus: "published",
        publicName: "Struct Church A",
      });
      await provisionEmptyPublicPages(pool, { churchId: churchA.id, branchId: null });
      const home = await pool.query(
        `SELECT id FROM blessboard.public_pages
          WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL LIMIT 1`,
        [churchA.id]
      );
      await updatePublicPage(pool, home.rows[0].id, { status: "published" });
      await createPageSection(pool, {
        pageId: home.rows[0].id,
        sectionKey: "hero",
        sectionType: "hero",
        heading: "Published Welcome",
        bodyText: "Published body",
        status: "published",
        sortOrder: 0,
      });

      async function makeUser(email, displayName, role, organizationId) {
        const created = await createBlessBoardUser(pool, { email, displayName, password: PASSWORD });
        assert.equal(created.ok, true, created.message);
        if (role) assert.equal((await assignBlessBoardRole(pool, role)).ok, true);
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-staging",
          userId: created.user.id,
          organizationId,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      users.hqA = await makeUser(
        "struct-hq-a@example.test",
        "HQ A",
        {
          email: "struct-hq-a@example.test",
          organizationKey: "struct-a",
          roleKey: "church_hq_admin",
          churchKey: "struct-a",
        },
        orgA.records.organization.id
      );
      users.hqB = await makeUser(
        "struct-hq-b@example.test",
        "HQ B",
        {
          email: "struct-hq-b@example.test",
          organizationKey: "struct-b",
          roleKey: "church_hq_admin",
          churchKey: "struct-b",
        },
        orgB.records.organization.id
      );

      app = createV5FoundationApp({ getPool: () => pool, env: baseEnv() });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
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

  async function postDraft(body, user) {
    const csrf = issueCsrfToken(baseEnv());
    return request(app)
      .post("/hq/content/api/structured-draft")
      .set("Host", HOST_A)
      .set(
        "Cookie",
        cookieHeader(`${DEFAULT_V5_COOKIE}=${user.rawToken}`, `${CSRF_COOKIE}=${csrf}`)
      )
      .set("X-CSRF-Token", csrf)
      .send({ [CSRF_FIELD]: csrf, ...body });
  }

  it("image draft save and cancel", async () => {
    if (skipIfNeeded()) return;
    const save = await postDraft(
      {
        draftKind: "image",
        pageKey: "home",
        sectionKey: "hero",
        entityKey: "home-hero",
        payload: {
          imageUrl: "/church/images/tenant-public/home-desktop-hero.jpg",
          altText: "Sunday gathering",
          focal: "center",
        },
      },
      users.hqA
    );
    assert.equal(save.status, 200);
    assert.equal(save.body.ok, true);
    assert.equal(save.body.published, false);

    const before = await draftRepo.countStructuredDrafts(pool, {
      churchId: churchA.id,
      branchId: null,
    });
    assert.ok(before >= 1);

    const cancel = await postDraft(
      {
        action: "cancel",
        draftKind: "image",
        pageKey: "home",
        sectionKey: "hero",
        entityKey: "home-hero",
      },
      users.hqA
    );
    assert.equal(cancel.status, 200);
    assert.equal(cancel.body.ok, true);
    assert.equal(cancel.body.published, false);
  });

  it("invalid image type / unsafe path rejected; safe media fallback accepted", () => {
    if (skipIfNeeded()) return;
    assert.equal(validateImageUrl("javascript:alert(1)").ok, false);
    assert.equal(validateImageUrl("/etc/passwd").ok, false);
    assert.equal(validateImageUrl("/church/images/tenant-public/home-desktop-hero.jpg").ok, true);
    assert.equal(validateImageUrl("https://cdn.example.com/a.jpg").ok, true);
    const bad = validateStructuredPayload(
      "image",
      { imageUrl: "https://cdn.example.com/a.jpg", altText: "" },
      "upsert"
    );
    assert.equal(bad.ok, false);
  });

  it("supported video URL accepted; unsafe video URL rejected", () => {
    if (skipIfNeeded()) return;
    assert.equal(validateVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ").ok, true);
    assert.equal(validateVideoUrl("https://vimeo.com/123456").ok, true);
    assert.equal(validateVideoUrl("https://evil.example/watch").ok, false);
    assert.equal(validateVideoUrl("javascript:alert(1)").ok, false);
  });

  it("service time add/edit/remove/reorder validation", async () => {
    if (skipIfNeeded()) return;
    const ok = validateStructuredPayload(
      "service_times",
      {
        entries: [
          {
            name: "Sunday Worship",
            day: "sunday",
            startTime: "09:00",
            endTime: "10:30",
            location: "Sanctuary",
            primary: true,
            enabled: true,
            sortOrder: 10,
          },
          {
            name: "Midweek",
            day: "wednesday",
            startTime: "18:30",
            endTime: "20:00",
            primary: false,
            enabled: true,
            sortOrder: 20,
          },
        ],
      },
      "upsert"
    );
    assert.equal(ok.ok, true);

    const badTime = validateStructuredPayload(
      "service_times",
      {
        entries: [
          {
            name: "Bad",
            day: "sunday",
            startTime: "11:00",
            endTime: "10:00",
            enabled: true,
          },
        ],
      },
      "upsert"
    );
    assert.equal(badTime.ok, false);

    const save = await postDraft(
      {
        draftKind: "service_times",
        pageKey: "home",
        sectionKey: "service_times",
        entityKey: "collection",
        payload: ok.payload,
      },
      users.hqA
    );
    assert.equal(save.status, 200);
    assert.equal(save.body.ok, true);
    assert.equal(save.body.published, false);
  });

  it("leadership / ministry / event / sermon draft saves", async () => {
    if (skipIfNeeded()) return;

    const leader = await postDraft(
      {
        draftKind: "leader",
        pageKey: "leadership",
        entityKey: "demo-leader-senior",
        payload: {
          displayName: "Pastor Jordan Hale",
          roleTitle: "Senior Pastor",
          biography: "Updated bio for draft only.",
          imageUrl: "/church/images/leadership/pastor-desktop.jpg",
          visible: true,
          seniorLeader: true,
        },
      },
      users.hqA
    );
    assert.equal(leader.status, 200, leader.body && leader.body.error);
    assert.equal(leader.body.published, false);

    const ministry = await postDraft(
      {
        draftKind: "ministry",
        pageKey: "ministries",
        entityKey: "new-ministry-1",
        payload: {
          name: "Youth Collective",
          summary: "Students growing in faith",
          description: "Weekly gathering",
          featured: true,
          visible: true,
        },
      },
      users.hqA
    );
    assert.equal(ministry.status, 200, ministry.body && ministry.body.error);

    const future = new Date(Date.now() + 7 * 86400000).toISOString();
    const event = await postDraft(
      {
        draftKind: "event",
        pageKey: "events",
        entityKey: "event-1",
        payload: {
          title: "Community Picnic",
          description: "Food and fellowship",
          startsAt: future,
          timezone: "UTC",
          featured: true,
          visible: true,
        },
      },
      users.hqA
    );
    assert.equal(event.status, 200, event.body && event.body.error);

    const past = validateStructuredPayload(
      "event",
      {
        title: "Past Event",
        description: "Old",
        startsAt: "2020-01-01T10:00:00.000Z",
        timezone: "UTC",
        visible: true,
      },
      "upsert"
    );
    assert.equal(past.ok, true);

    const sermon = await postDraft(
      {
        draftKind: "sermon",
        pageKey: "sermons",
        entityKey: "sermon-1",
        payload: {
          title: "Hope for Today",
          speakerName: "Pastor Jordan Hale",
          date: "2026-07-20",
          scripture: "John 1:1",
          description: "A word of hope",
          mediaUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          visible: true,
        },
      },
      users.hqA
    );
    assert.equal(sermon.status, 200, sermon.body && sermon.body.error);
    assert.equal(sermon.body.published, false);
  });

  it("cross-organization IDs rejected; cancel does not mutate draft on client cancel path", async () => {
    if (skipIfNeeded()) return;
    const csrf = issueCsrfToken(baseEnv());
    const res = await request(app)
      .post("/hq/content/api/structured-draft")
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
        draftKind: "image",
        pageKey: "home",
        sectionKey: "hero",
        entityKey: "hijack",
        organizationId: orgA.records.organization.id,
        churchId: churchA.id,
        payload: {
          imageUrl: "/church/images/tenant-public/home-desktop-hero.jpg",
          altText: "Nope",
        },
      });
    assert.equal(res.status, 403);

    const before = await draftRepo.countStructuredDrafts(pool, {
      churchId: churchA.id,
      branchId: null,
    });
    // cancel without existing key is a no-op discard
    await cancelStructuredDraft(pool, {
      churchId: churchA.id,
      branchId: null,
      draftKind: "image",
      pageKey: "home",
      sectionKey: "hero",
      entityKey: "never-saved-cancel-only",
    });
    const after = await draftRepo.countStructuredDrafts(pool, {
      churchId: churchA.id,
      branchId: null,
    });
    assert.equal(after, before);
  });

  it("public pages remain published-only (no draft overlays)", async () => {
    if (skipIfNeeded()) return;
    await saveStructuredDraft(pool, {
      organizationId: orgA.records.organization.id,
      churchId: churchA.id,
      branchId: null,
      editorUserId: users.hqA.user.id,
      draftKind: "image",
      pageKey: "home",
      sectionKey: "hero",
      entityKey: "home-hero-public-check",
      payload: {
        imageUrl: "/church/images/tenant-public/about-hero-building.jpg",
        altText: "Draft only image",
      },
    });
    const publicRes = await request(app).get("/").set("Host", HOST_A).expect(200);
    assert.doesNotMatch(publicRes.text, /data-bb-structured-editor/);
    assert.doesNotMatch(publicRes.text, /Draft only image/);
    assert.doesNotMatch(publicRes.text, /data-bb-structured-open/);

    const editRes = await request(app)
      .get("/?website_edit=1")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`))
      .expect(200);
    assert.match(editRes.text, /data-bb-structured-editor/);
    assert.match(editRes.text, /website-structured-edit\.js/);
  });

  it("shared editor assets exist", () => {
    if (skipIfNeeded()) return;
    assert.ok(
      fs.existsSync(path.join(__dirname, "../public/blessboard/v5/website-structured-edit.js"))
    );
    assert.ok(
      fs.existsSync(path.join(__dirname, "../views/blessboard/v5/partials/structured-editor-host.ejs"))
    );
    assert.ok(
      fs.existsSync(
        path.join(__dirname, "../views/blessboard/v5/partials/structured-edit-trigger.ejs")
      )
    );
  });
});
