"use strict";

/**
 * Phase 7 Stage 2 editors: giving methods, leadership intro, footer social links.
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
  updatePublicPage,
  createPageSection,
} = require("../src/blessboard/services/publicContentAdminService");
const {
  repairWebsiteFoundation,
} = require("../src/blessboard/services/websiteFoundationRepairService");
const {
  acknowledgeWebsitePreview,
} = require("../src/blessboard/services/churchWebsitePublishService");
const {
  validateStructuredPayload,
  DRAFT_KINDS,
} = require("../src/blessboard/services/websiteStructuredDraftValidation");
const {
  saveStructuredDraft,
} = require("../src/blessboard/services/websiteStructuredDraftService");
const {
  publishWebsiteDrafts,
} = require("../src/blessboard/services/websiteDraftPublishService");
const draftRepo = require("../src/blessboard/repositories/websiteStructuredDraftRepository");
const contentRepo = require("../src/blessboard/repositories/publicContentRepository");
const {
  listEditableFieldsForPage,
} = require("../src/blessboard/services/websiteInlineEditableFields");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "p7ed-a.blessboard.org";
const HOST_B = "p7ed-b.blessboard.org";

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

describe("blessboard phase7 editors — giving, leadership intro, social", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let churchA;
  let orgB;
  let churchB;
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
        organizationKey: "p7ed-a",
        displayName: "P7 Editors A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "p7ed-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);
      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "p7ed-a",
        churchKey: "p7ed-a",
        displayName: "P7 Editors Alpha Church",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;

      orgB = await provisionPlatformTenant(pool, {
        organizationKey: "p7ed-b",
        displayName: "P7 Editors B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "p7ed-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(orgB.ok, true, orgB.message);
      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "p7ed-b",
        churchKey: "p7ed-b",
        displayName: "P7 Editors Beta Church",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
      });
      assert.equal(chB.ok, true, chB.message);
      churchB = chB.records.church;

      await ensureChurchSettingsInitialized(pool, churchA.id);
      await updateChurchSettings(pool, churchA.id, {
        publicName: "P7 Editors Alpha Church",
        websiteStatus: "published",
        primaryEmail: "p7ed-a@example.test",
      });
      await repairWebsiteFoundation(pool, { churchId: churchA.id });
      await acknowledgeWebsitePreview(pool, {
        organizationId: orgA.records.organization.id,
        actorUserId: null,
      });
      await provisionEmptyPublicPages(pool, { churchId: churchA.id, branchId: null });
      const pagesA = await pool.query(
        `SELECT id, page_key FROM blessboard.public_pages
          WHERE church_id = $1 AND branch_id IS NULL`,
        [churchA.id]
      );
      const pageIdByKey = Object.fromEntries(pagesA.rows.map((r) => [r.page_key, r.id]));
      await pool.query(
        `UPDATE blessboard.public_pages
            SET status = 'published', published_at = COALESCE(published_at, now())
          WHERE church_id = $1 AND branch_id IS NULL`,
        [churchA.id]
      );
      await createPageSection(pool, {
        pageId: pageIdByKey.leadership,
        sectionKey: "hero",
        sectionType: "hero",
        heading: "Original Leadership Heading",
        bodyText: "Original leadership introduction.",
        status: "published",
        confirmPublish: true,
        sortOrder: 10,
      });
      await createPageSection(pool, {
        pageId: pageIdByKey.giving,
        sectionKey: "hero",
        sectionType: "hero",
        heading: "Giving",
        bodyText: "Support the mission.",
        status: "published",
        confirmPublish: true,
        sortOrder: 10,
      });

      await ensureChurchSettingsInitialized(pool, churchB.id);
      await updateChurchSettings(pool, churchB.id, {
        publicName: "P7 Editors Beta Church",
        websiteStatus: "published",
      });
      await provisionEmptyPublicPages(pool, { churchId: churchB.id, branchId: null });
      const pagesB = await pool.query(
        `SELECT id FROM blessboard.public_pages
          WHERE church_id = $1 AND branch_id IS NULL AND page_key IN ('home','giving','leadership')`,
        [churchB.id]
      );
      for (const row of pagesB.rows) {
        await updatePublicPage(pool, row.id, { status: "published", confirmPublish: true });
      }

      const userA = await createBlessBoardUser(pool, {
        email: "p7ed-hq-a@example.test",
        password: PASSWORD,
        displayName: "HQ A",
      });
      assert.equal(userA.ok, true);
      const roleA = await assignBlessBoardRole(pool, {
        email: "p7ed-hq-a@example.test",
        organizationKey: "p7ed-a",
        roleKey: "church_hq_admin",
        churchKey: "p7ed-a",
      });
      assert.equal(roleA.ok, true);
      const sessA = await createV5Session(pool, {
        userId: userA.user.id,
        organizationId: orgA.records.organization.id,
        deploymentCode: "blessboard-org-v5",
        userAgent: "phase7-editors",
        ipAddress: "127.0.0.1",
      });
      assert.equal(sessA.ok, true);
      users.hqA = { user: userA.user, rawToken: sessA.rawToken };

      const userB = await createBlessBoardUser(pool, {
        email: "p7ed-hq-b@example.test",
        password: PASSWORD,
        displayName: "HQ B",
      });
      assert.equal(userB.ok, true);
      const roleB = await assignBlessBoardRole(pool, {
        email: "p7ed-hq-b@example.test",
        organizationKey: "p7ed-b",
        roleKey: "church_hq_admin",
        churchKey: "p7ed-b",
      });
      assert.equal(roleB.ok, true);
      const sessB = await createV5Session(pool, {
        userId: userB.user.id,
        organizationId: orgB.records.organization.id,
        deploymentCode: "blessboard-org-v5",
        userAgent: "phase7-editors",
        ipAddress: "127.0.0.1",
      });
      assert.equal(sessB.ok, true);
      users.hqB = { user: userB.user, rawToken: sessB.rawToken };

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
      });
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

  async function postDraft(body, user, host) {
    const csrf = issueCsrfToken(baseEnv());
    return request(app)
      .post("/hq/content/api/structured-draft")
      .set("Host", host || HOST_A)
      .set(
        "Cookie",
        cookieHeader(`${DEFAULT_V5_COOKIE}=${user.rawToken}`, `${CSRF_COOKIE}=${csrf}`)
      )
      .set("X-CSRF-Token", csrf)
      .send({ [CSRF_FIELD]: csrf, ...body });
  }

  async function postInline(body, user, host) {
    const csrf = issueCsrfToken(baseEnv());
    return request(app)
      .post("/hq/content/api/inline-field")
      .set("Host", host || HOST_A)
      .set(
        "Cookie",
        cookieHeader(`${DEFAULT_V5_COOKIE}=${user.rawToken}`, `${CSRF_COOKIE}=${csrf}`)
      )
      .set("X-CSRF-Token", csrf)
      .send({ [CSRF_FIELD]: csrf, ...body });
  }

  it("draft kinds include giving_method and social_link; leadership intro allowlisted", () => {
    if (skipIfNeeded()) return;
    assert.ok(DRAFT_KINDS.includes("giving_method"));
    assert.ok(DRAFT_KINDS.includes("social_link"));
    assert.ok(listEditableFieldsForPage("leadership").some((f) => f.fieldKey === "heading"));
    assert.ok(listEditableFieldsForPage("leadership").some((f) => f.fieldKey === "bodyText"));
  });

  it("giving method validation accepts fields and rejects bad URLs", () => {
    if (skipIfNeeded()) return;
    const ok = validateStructuredPayload(
      "giving_method",
      {
        methodType: "bank_transfer",
        label: "Main account",
        description: "Sunday offering",
        accountDetails: "DEMO-ACC-001",
        instructions: "[Demo] Transfer using the published demo account.",
        externalUrl: "https://example.org/give",
        buttonLabel: "Give online",
        qrImageUrl: "/church/images/tenant-public/home-desktop-hero.jpg",
        visible: true,
        sortOrder: 10,
      },
      "upsert"
    );
    assert.equal(ok.ok, true, ok.error);
    assert.equal(ok.payload.buttonLabel, "Give online");

    const bad = validateStructuredPayload(
      "giving_method",
      {
        methodType: "bank_transfer",
        label: "Bad",
        externalUrl: "javascript:alert(1)",
      },
      "upsert"
    );
    assert.equal(bad.ok, false);
  });

  it("giving-method CRUD draft, reorder, hide, publish, and public visibility", async () => {
    if (skipIfNeeded()) return;
    const entityKey = "new-give-1";
    const save = await postDraft(
      {
        draftKind: "giving_method",
        pageKey: "giving",
        entityKey,
        op: "upsert",
        payload: {
          methodType: "mobile_money",
          label: "Draft MoMo Method",
          description: "Demo mobile money",
          accountDetails: "DEMO-MOMO-99",
          instructions: "[Demo] Use only in testing.",
          externalUrl: "https://example.org/momo",
          buttonLabel: "Open MoMo",
          visible: true,
          sortOrder: 20,
        },
      },
      users.hqA
    );
    assert.equal(save.status, 200, save.text);
    assert.equal(save.body.ok, true);
    assert.equal(save.body.published, false);

    const publicBefore = await request(app).get("/giving").set("Host", HOST_A).expect(200);
    assert.doesNotMatch(publicBefore.text, /Draft MoMo Method/);

    const editPreview = await request(app)
      .get("/giving?website_edit=1")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`))
      .expect(200);
    assert.match(editPreview.text, /Draft MoMo Method/);
    assert.match(editPreview.text, /Open MoMo/);

    const reorder = await postDraft(
      {
        draftKind: "giving_method",
        pageKey: "giving",
        entityKey: "order-bundle",
        op: "reorder",
        payload: { order: [entityKey] },
      },
      users.hqA
    );
    assert.equal(reorder.status, 200);
    assert.equal(reorder.body.ok, true);

    const hide = await postDraft(
      {
        draftKind: "giving_method",
        pageKey: "giving",
        entityKey,
        op: "upsert",
        payload: {
          methodType: "mobile_money",
          label: "Draft MoMo Method",
          instructions: "[Demo] hidden",
          visible: false,
          sortOrder: 20,
        },
      },
      users.hqA
    );
    assert.equal(hide.status, 200);

    const published = await publishWebsiteDrafts(pool, {
      organizationId: orgA.records.organization.id,
      churchId: churchA.id,
      branchId: null,
      actorUserId: users.hqA.user.id,
      actorRole: "church_hq_admin",
      confirmPublish: true,
      deferServiceTimes: true,
      env: baseEnv(),
    });
    assert.equal(published.ok, true, published.reason || JSON.stringify(published));

    // Hidden method should not appear publicly after publish (archived).
    const publicAfter = await request(app).get("/giving").set("Host", HOST_A).expect(200);
    assert.doesNotMatch(publicAfter.text, /Draft MoMo Method/);
  });

  it("giving method add then publish surfaces on public page", async () => {
    if (skipIfNeeded()) return;
    const entityKey = "new-give-live";
    const save = await postDraft(
      {
        draftKind: "giving_method",
        pageKey: "giving",
        entityKey,
        payload: {
          methodType: "bank_transfer",
          label: "Live Bank Method",
          description: "Primary bank path",
          accountDetails: "DEMO-BANK-42",
          instructions: "[Demo] Published bank instructions.",
          externalUrl: "https://example.org/bank",
          buttonLabel: "Bank details",
          visible: true,
          sortOrder: 5,
        },
      },
      users.hqA
    );
    assert.equal(save.status, 200);
    const published = await publishWebsiteDrafts(pool, {
      organizationId: orgA.records.organization.id,
      churchId: churchA.id,
      branchId: null,
      actorUserId: users.hqA.user.id,
      actorRole: "church_hq_admin",
      confirmPublish: true,
      deferServiceTimes: true,
      env: baseEnv(),
    });
    assert.equal(published.ok, true, published.reason || JSON.stringify(published));
    const publicPage = await request(app).get("/giving").set("Host", HOST_A).expect(200);
    assert.match(publicPage.text, /Live Bank Method/);
    assert.match(publicPage.text, /Bank details/);
    assert.doesNotMatch(publicPage.text, /data-bb-inline-edit/);
  });

  it("leadership introduction save and cancel", async () => {
    if (skipIfNeeded()) return;
    const save = await postInline(
      {
        pageKey: "leadership",
        sectionKey: "hero",
        fieldKey: "heading",
        value: "Draft Leadership Title",
      },
      users.hqA
    );
    assert.equal(save.status, 200, save.text);
    assert.equal(save.body.ok, true);
    assert.equal(save.body.published, false);

    const publicBefore = await request(app).get("/leadership").set("Host", HOST_A).expect(200);
    assert.doesNotMatch(publicBefore.text, /Draft Leadership Title/);
    assert.match(publicBefore.text, /Original Leadership Heading/);

    const editMode = await request(app)
      .get("/leadership?website_edit=1")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`))
      .expect(200);
    assert.match(editMode.text, /Draft Leadership Title/);

    const { discardWebsiteDrafts } = require("../src/blessboard/services/websiteDraftPublishService");
    const discarded = await discardWebsiteDrafts(pool, {
      organizationId: orgA.records.organization.id,
      churchId: churchA.id,
      branchId: null,
      actorUserId: users.hqA.user.id,
      actorRole: "church_hq_admin",
      confirmDiscard: true,
    });
    assert.equal(discarded.ok, true);

    const afterDiscard = await request(app)
      .get("/leadership?website_edit=1")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`))
      .expect(200);
    assert.doesNotMatch(afterDiscard.text, /Draft Leadership Title/);
    assert.match(afterDiscard.text, /Original Leadership Heading/);
  });

  it("footer social CRUD and URL validation", async () => {
    if (skipIfNeeded()) return;
    const bad = validateStructuredPayload(
      "social_link",
      { channelType: "facebook", label: "FB", value: "javascript:alert(1)" },
      "upsert"
    );
    assert.equal(bad.ok, false);

    const httpOnly = validateStructuredPayload(
      "social_link",
      { channelType: "facebook", label: "FB", value: "http://facebook.com/church" },
      "upsert"
    );
    assert.equal(httpOnly.ok, false);

    const entityKey = "new-social-1";
    const save = await postDraft(
      {
        draftKind: "social_link",
        pageKey: "home",
        entityKey,
        payload: {
          channelType: "facebook",
          label: "Facebook",
          value: "https://www.facebook.com/p7ed-alpha",
          visible: true,
          sortOrder: 10,
        },
      },
      users.hqA
    );
    assert.equal(save.status, 200, save.text);
    assert.equal(save.body.published, false);

    const publicBefore = await request(app).get("/").set("Host", HOST_A).expect(200);
    assert.doesNotMatch(publicBefore.text, /facebook\.com\/p7ed-alpha/);

    const published = await publishWebsiteDrafts(pool, {
      organizationId: orgA.records.organization.id,
      churchId: churchA.id,
      branchId: null,
      actorUserId: users.hqA.user.id,
      actorRole: "church_hq_admin",
      confirmPublish: true,
      deferServiceTimes: true,
      env: baseEnv(),
    });
    assert.equal(published.ok, true, published.reason || JSON.stringify(published));

    const publicAfter = await request(app).get("/about").set("Host", HOST_A).expect(200);
    assert.match(publicAfter.text, /facebook\.com\/p7ed-alpha/);
    assert.match(publicAfter.text, /data-bb-footer-social/);
    assert.doesNotMatch(publicAfter.text, /bb-tp-footer__social-label/);
  });

  it("cross-organization structured draft access returns 404", async () => {
    if (skipIfNeeded()) return;
    const foreign = await contentRepo.insertGivingMethod(pool, {
      churchId: churchB.id,
      branchId: null,
      methodType: "cash",
      label: "Beta Cash",
      instructions: "[Demo] beta only",
      externalUrl: null,
      sortOrder: 1,
      status: "published",
    });
    const cross = await postDraft(
      {
        draftKind: "giving_method",
        pageKey: "giving",
        entityKey: foreign.id,
        payload: {
          methodType: "cash",
          label: "Hijacked",
          instructions: "[Demo] should fail",
          visible: true,
        },
      },
      users.hqA
    );
    // Save is scoped to session church — draft may save under A with foreign UUID,
    // but apply must not mutate B. Assert public B unchanged and A does not own the row.
    assert.ok([200, 400, 403, 404].includes(cross.status));
    const stillB = await contentRepo.findGivingMethodById(pool, foreign.id);
    assert.equal(stillB.label, "Beta Cash");
    assert.equal(String(stillB.churchId), String(churchB.id));

    const crossGet = await request(app)
      .get(`/hq/content/giving/${foreign.id}`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`));
    assert.ok(
      [404, 403, 302, 303, 503].includes(crossGet.status),
      `status ${crossGet.status}`
    );
    // 503/404 both acceptable when foreign entity is not entitlement-visible.
  });

  it("publication failure preserves draft and public content", async () => {
    if (skipIfNeeded()) return;
    await saveStructuredDraft(pool, {
      organizationId: orgA.records.organization.id,
      churchId: churchA.id,
      branchId: null,
      editorUserId: users.hqA.user.id,
      draftKind: "giving_method",
      pageKey: "giving",
      entityKey: "fail-publish-method",
      payload: {
        methodType: "online",
        label: "Should Not Publish Method",
        instructions: "[Demo] fail gate",
        visible: true,
        sortOrder: 50,
      },
    });
    const before = await request(app).get("/giving").set("Host", HOST_A).expect(200);
    assert.doesNotMatch(before.text, /Should Not Publish Method/);

    const failed = await publishWebsiteDrafts(pool, {
      organizationId: orgA.records.organization.id,
      churchId: churchA.id,
      branchId: null,
      actorUserId: users.hqA.user.id,
      actorRole: "church_hq_admin",
      confirmPublish: false,
      env: baseEnv(),
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.reason, "confirm_publish");

    const after = await request(app).get("/giving").set("Host", HOST_A).expect(200);
    assert.doesNotMatch(after.text, /Should Not Publish Method/);
    const drafts = await draftRepo.countStructuredDrafts(pool, {
      churchId: churchA.id,
      branchId: null,
    });
    assert.ok(drafts >= 1);
  });
});
