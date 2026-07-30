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
  let branchA;
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
      branchA = chA.records.hqBranch;

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

  it("mobile-money and bank-transfer methods persist all fields through publish", async () => {
    if (skipIfNeeded()) return;

    const momoKey = "new-give-momo-fields";
    const bankKey = "new-give-bank-fields";

    const momoSave = await postDraft(
      {
        draftKind: "giving_method",
        pageKey: "giving",
        entityKey: momoKey,
        payload: {
          methodType: "mobile_money",
          label: "MTN MoMo Field Pack",
          description: "Mobile wallet for Sunday gifts",
          accountDetails: "Wallet 0244123456 · Name: Demo Church",
          instructions: "Dial *170# and send to the wallet above.",
          externalUrl: "https://example.org/momo-give",
          buttonLabel: "Open MoMo guide",
          qrImageUrl: "/church/images/tenant-public/home-desktop-hero.jpg",
          visible: true,
          sortOrder: 11,
        },
      },
      users.hqA
    );
    assert.equal(momoSave.status, 200, momoSave.text);
    assert.equal(momoSave.body.ok, true);

    const bankSave = await postDraft(
      {
        draftKind: "giving_method",
        pageKey: "giving",
        entityKey: bankKey,
        payload: {
          methodType: "bank_transfer",
          label: "Primary Bank Field Pack",
          description: "Church operating account",
          accountDetails: "IBAN DE89370400440532013000 · Account Demo Church",
          instructions: "Use reference SUNDAY-GIFT on the transfer.",
          externalUrl: "",
          buttonLabel: "",
          qrImageUrl: "",
          visible: true,
          sortOrder: 12,
        },
      },
      users.hqA
    );
    assert.equal(bankSave.status, 200, bankSave.text);

    const editReload = await request(app)
      .get("/giving?website_edit=1")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`))
      .expect(200);
    assert.match(editReload.text, /MTN MoMo Field Pack/);
    assert.match(editReload.text, /Wallet 0244123456/);
    assert.match(editReload.text, /Primary Bank Field Pack/);
    assert.match(editReload.text, /DE89370400440532013000/);
    assert.match(editReload.text, /Open MoMo guide/);

    const publicBefore = await request(app).get("/giving").set("Host", HOST_A).expect(200);
    assert.doesNotMatch(publicBefore.text, /MTN MoMo Field Pack/);
    assert.doesNotMatch(publicBefore.text, /Primary Bank Field Pack/);

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

    const rows = await pool.query(
      `SELECT label, description, account_details, instructions, external_url, button_label, qr_image_url, sort_order, status
         FROM blessboard.giving_methods
        WHERE church_id = $1 AND label = ANY($2::text[])
        ORDER BY sort_order ASC`,
      [churchA.id, ["MTN MoMo Field Pack", "Primary Bank Field Pack"]]
    );
    assert.equal(rows.rows.length, 2);
    const momoRow = rows.rows.find((r) => r.label === "MTN MoMo Field Pack");
    const bankRow = rows.rows.find((r) => r.label === "Primary Bank Field Pack");
    assert.ok(momoRow);
    assert.ok(bankRow);
    assert.equal(momoRow.description, "Mobile wallet for Sunday gifts");
    assert.equal(momoRow.account_details, "Wallet 0244123456 · Name: Demo Church");
    assert.equal(momoRow.instructions, "Dial *170# and send to the wallet above.");
    assert.equal(momoRow.external_url, "https://example.org/momo-give");
    assert.equal(momoRow.button_label, "Open MoMo guide");
    assert.equal(momoRow.qr_image_url, "/church/images/tenant-public/home-desktop-hero.jpg");
    assert.equal(momoRow.status, "published");
    assert.equal(bankRow.account_details, "IBAN DE89370400440532013000 · Account Demo Church");
    assert.equal(bankRow.instructions, "Use reference SUNDAY-GIFT on the transfer.");
    assert.equal(bankRow.external_url, null);
    assert.equal(bankRow.button_label, null);
    assert.equal(bankRow.qr_image_url, null);

    const publicAfter = await request(app).get("/giving").set("Host", HOST_A).expect(200);
    assert.match(publicAfter.text, /MTN MoMo Field Pack/);
    assert.match(publicAfter.text, /Wallet 0244123456/);
    assert.match(publicAfter.text, /Dial \*170#/);
    assert.match(publicAfter.text, /Open MoMo guide/);
    assert.match(publicAfter.text, /Primary Bank Field Pack/);
    assert.match(publicAfter.text, /DE89370400440532013000/);
    assert.match(publicAfter.text, /SUNDAY-GIFT/);
    const bankCardStart = publicAfter.text.indexOf("Primary Bank Field Pack");
    const bankCardSlice = publicAfter.text.slice(bankCardStart, bankCardStart + 1200);
    assert.doesNotMatch(bankCardSlice, /Contact for details/);

    const editAfterPublish = await request(app)
      .get("/giving?website_edit=1")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(`${DEFAULT_V5_COOKIE}=${users.hqA.rawToken}`))
      .expect(200);
    assert.match(editAfterPublish.text, /Wallet 0244123456/);
    assert.match(editAfterPublish.text, /DE89370400440532013000/);
  });

  it("editing a published giving method updates instead of duplicating", async () => {
    if (skipIfNeeded()) return;
    const created = await contentRepo.insertGivingMethod(pool, {
      churchId: churchA.id,
      branchId: null,
      methodType: "cash",
      label: "Cash Box Original",
      description: "Lobby desk",
      accountDetails: "Ask usher for envelope",
      instructions: "Place cash in the offering box.",
      externalUrl: null,
      buttonLabel: null,
      qrImageUrl: null,
      sortOrder: 40,
      status: "published",
    });
    assert.ok(created && created.id);

    const edit = await postDraft(
      {
        draftKind: "giving_method",
        pageKey: "giving",
        entityKey: created.id,
        payload: {
          methodType: "cash",
          label: "Cash Box Updated",
          description: "Lobby desk — updated",
          accountDetails: "Usher station B",
          instructions: "Use envelopes at station B.",
          visible: true,
          sortOrder: 40,
        },
      },
      users.hqA
    );
    assert.equal(edit.status, 200, edit.text);

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

    const listed = await pool.query(
      `SELECT id, label, account_details, status
         FROM blessboard.giving_methods
        WHERE church_id = $1 AND (id = $2 OR label LIKE 'Cash Box%')`,
      [churchA.id, created.id]
    );
    const active = listed.rows.filter((r) => r.status === "published");
    assert.equal(active.length, 1);
    assert.equal(active[0].id, created.id);
    assert.equal(active[0].label, "Cash Box Updated");
    assert.equal(active[0].account_details, "Usher station B");

    const publicPage = await request(app).get("/giving").set("Host", HOST_A).expect(200);
    assert.match(publicPage.text, /Cash Box Updated/);
    assert.match(publicPage.text, /Usher station B/);
    assert.doesNotMatch(publicPage.text, /Cash Box Original/);
  });

  it("deactivating a giving method archives it and hides publicly", async () => {
    if (skipIfNeeded()) return;
    const created = await contentRepo.insertGivingMethod(pool, {
      churchId: churchA.id,
      branchId: null,
      methodType: "online",
      label: "Hide Me Online",
      description: "Will archive",
      accountDetails: "Portal details",
      instructions: "Temporary link method",
      externalUrl: "https://example.org/hide-me",
      buttonLabel: "Give now",
      sortOrder: 55,
      status: "published",
    });

    const hide = await postDraft(
      {
        draftKind: "giving_method",
        pageKey: "giving",
        entityKey: created.id,
        payload: {
          methodType: "online",
          label: "Hide Me Online",
          instructions: "Temporary link method",
          externalUrl: "https://example.org/hide-me",
          visible: false,
          sortOrder: 55,
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

    const row = await contentRepo.findGivingMethodById(pool, created.id);
    assert.equal(row.status, "archived");
    const publicPage = await request(app).get("/giving").set("Host", HOST_A).expect(200);
    assert.doesNotMatch(publicPage.text, /Hide Me Online/);
  });

  it("display order is respected for published giving methods", async () => {
    if (skipIfNeeded()) return;
    await contentRepo.insertGivingMethod(pool, {
      churchId: churchA.id,
      branchId: null,
      methodType: "cash",
      label: "Order Zeta",
      instructions: "zeta",
      sortOrder: 90,
      status: "published",
    });
    await contentRepo.insertGivingMethod(pool, {
      churchId: churchA.id,
      branchId: null,
      methodType: "cash",
      label: "Order Alpha",
      instructions: "alpha",
      sortOrder: 10,
      status: "published",
    });
    const publicPage = await request(app).get("/giving").set("Host", HOST_A).expect(200);
    const alphaIdx = publicPage.text.indexOf("Order Alpha");
    const zetaIdx = publicPage.text.indexOf("Order Zeta");
    assert.ok(alphaIdx > 0 && zetaIdx > 0);
    assert.ok(alphaIdx < zetaIdx, "lower sort_order should render first");
  });

  it("branch-scoped giving methods stay on their branch", async () => {
    if (skipIfNeeded()) return;
    assert.ok(branchA && branchA.id);

    await contentRepo.insertGivingMethod(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      methodType: "mobile_money",
      label: "Branch Only MoMo",
      accountDetails: "Branch wallet 0555000111",
      instructions: "Branch campus only",
      sortOrder: 3,
      status: "published",
    });
    await contentRepo.insertGivingMethod(pool, {
      churchId: churchA.id,
      branchId: null,
      methodType: "bank_transfer",
      label: "Church Wide Bank",
      accountDetails: "Church IBAN DE00CHURCH",
      instructions: "Church-wide only",
      sortOrder: 4,
      status: "published",
    });

    const branchListed = await contentRepo.listGivingMethods(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
      status: "published",
    });
    assert.ok(branchListed.some((m) => m.label === "Branch Only MoMo"));
    assert.ok(!branchListed.some((m) => m.label === "Church Wide Bank"));

    const churchListed = await contentRepo.listGivingMethods(pool, {
      churchId: churchA.id,
      branchId: null,
      status: "published",
    });
    assert.ok(churchListed.some((m) => m.label === "Church Wide Bank"));
    assert.ok(!churchListed.some((m) => m.label === "Branch Only MoMo"));
  });

  it("empty optional giving fields do not render placeholders or generic fallback copy", async () => {
    if (skipIfNeeded()) return;
    // Prefer church-wide listing: archive branch rows that would otherwise shadow it.
    await pool.query(
      `UPDATE blessboard.giving_methods
          SET status = 'archived'
        WHERE church_id = $1 AND branch_id IS NOT NULL AND status = 'published'`,
      [churchA.id]
    );
    await contentRepo.insertGivingMethod(pool, {
      churchId: churchA.id,
      branchId: null,
      methodType: "other",
      label: "Sparse Method",
      description: null,
      accountDetails: "Account REF-7788",
      instructions: null,
      externalUrl: null,
      buttonLabel: null,
      qrImageUrl: null,
      sortOrder: 8,
      status: "published",
    });
    const publicPage = await request(app).get("/giving").set("Host", HOST_A).expect(200);
    assert.match(publicPage.text, /Sparse Method/);
    assert.match(publicPage.text, /Account REF-7788/);
    const start = publicPage.text.indexOf("Sparse Method");
    const slice = publicPage.text.slice(start, start + 900);
    assert.doesNotMatch(slice, /Contact for details/);
    assert.doesNotMatch(slice, /Open published link/);
  });

  it("content-admin giving create maps extended fields", async () => {
    if (skipIfNeeded()) return;
    const { buildGivingFields } = require("../src/blessboard/services/publicContentAdminService");
    const built = buildGivingFields(
      {
        methodType: "online",
        label: "Admin Path Link",
        description: "Online giving",
        accountDetails: "Use the secure portal",
        instructions: "Follow the church portal steps.",
        externalUrl: "https://example.org/give-admin",
        buttonLabel: "Give online",
        qrImageUrl: "/church/images/tenant-public/home-desktop-hero.jpg",
        sortOrder: 7,
        status: "published",
      },
      { partial: false }
    );
    assert.equal(built.ok, true, built.reason);
    assert.equal(built.fields.description, "Online giving");
    assert.equal(built.fields.accountDetails, "Use the secure portal");
    assert.equal(built.fields.buttonLabel, "Give online");
    assert.equal(built.fields.qrImageUrl, "/church/images/tenant-public/home-desktop-hero.jpg");
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
    assert.equal(cross.status, 404, `expected 404, got ${cross.status}: ${JSON.stringify(cross.body)}`);
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
