"use strict";

/**
 * Phase 7 Stage 6 — draft review, publish, discard, preview, governance, unsaved guard.
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
  repairWebsiteFoundation,
} = require("../src/blessboard/services/websiteFoundationRepairService");
const {
  acknowledgeWebsitePreview,
} = require("../src/blessboard/services/churchWebsitePublishService");
const {
  saveInlineFieldDraft,
} = require("../src/blessboard/services/websiteInlineDraftService");
const {
  saveStructuredDraft,
} = require("../src/blessboard/services/websiteStructuredDraftService");
const {
  loadWebsiteDraftChangesReview,
  resolvePublishCapability,
} = require("../src/blessboard/services/websiteDraftReviewService");
const {
  publishWebsiteDrafts,
  discardWebsiteDrafts,
  submitWebsiteDraftsForApproval,
} = require("../src/blessboard/services/websiteDraftPublishService");
const fieldDraftRepo = require("../src/blessboard/repositories/websiteInlineFieldDraftRepository");
const approvalSettingsSvc = require("../src/blessboard/services/websiteApprovalSettingsService");
const versionRepo = require("../src/blessboard/repositories/websitePublicationVersionRepository");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "draft6-a.blessboard.org";
const HOST_B = "draft6-b.blessboard.org";

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
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
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

describe("blessboard website draft review publish", () => {
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

      async function provisionOrg(key, host) {
        const prov = await provisionPlatformTenant(pool, {
          organizationKey: key,
          displayName: `Draft6 ${key}`,
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
          displayName: `Draft6 Church ${key}`,
          dataEnvironment: "testing",
          hqBranchKey: "hq",
          hqBranchDisplayName: "HQ",
        });
        assert.equal(ch.ok, true, ch.message);
        await ensureChurchSettingsInitialized(pool, ch.records.church.id);
        await updateChurchSettings(pool, ch.records.church.id, {
          publicName: `Draft6 Church ${key}`,
          websiteStatus: "published",
          primaryEmail: `${key}@example.test`,
        });
        await repairWebsiteFoundation(pool, { churchId: ch.records.church.id });
        await acknowledgeWebsitePreview(pool, {
          organizationId: prov.records.organization.id,
          actorUserId: null,
        });
        await provisionEmptyPublicPages(pool, {
          churchId: ch.records.church.id,
          branchId: null,
        });
        const home = await pool.query(
          `SELECT id FROM blessboard.public_pages
            WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NULL LIMIT 1`,
          [ch.records.church.id]
        );
        await updatePublicPage(pool, home.rows[0].id, { status: "published" });
        await createPageSection(pool, {
          pageId: home.rows[0].id,
          sectionKey: "hero",
          sectionType: "hero",
          heading: "Live Headline",
          bodyText: "Live body for visitors.",
          status: "published",
          sortOrder: 0,
        });
        // Publish all required pages for site publish engine.
        await pool.query(
          `UPDATE blessboard.public_pages
              SET status = 'published', published_at = COALESCE(published_at, now())
            WHERE church_id = $1 AND branch_id IS NULL`,
          [ch.records.church.id]
        );
        return {
          org: prov.records.organization,
          church: ch.records.church,
          branch: ch.records.hqBranch,
        };
      }

      const a = await provisionOrg("draft6-a", HOST_A);
      const b = await provisionOrg("draft6-b", HOST_B);
      orgA = a.org;
      orgB = b.org;
      churchA = a.church;
      churchB = b.church;
      branchA = a.branch;

      async function makeUser(email, displayName, role, orgId) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        if (role) assert.equal((await assignBlessBoardRole(pool, role)).ok, true);
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-staging",
          userId: created.user.id,
          organizationId: orgId,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      users.hqA = await makeUser(
        "draft6-hq-a@example.test",
        "HQ A",
        {
          email: "draft6-hq-a@example.test",
          organizationKey: "draft6-a",
          roleKey: "church_hq_admin",
          churchKey: "draft6-a",
        },
        orgA.id
      );
      users.branchA = await makeUser(
        "draft6-br-a@example.test",
        "Branch A",
        {
          email: "draft6-br-a@example.test",
          organizationKey: "draft6-a",
          roleKey: "branch_admin",
          churchKey: "draft6-a",
          branchKey: "hq",
        },
        orgA.id
      );
      users.hqB = await makeUser(
        "draft6-hq-b@example.test",
        "HQ B",
        {
          email: "draft6-hq-b@example.test",
          organizationKey: "draft6-b",
          roleKey: "church_hq_admin",
          churchKey: "draft6-b",
        },
        orgB.id
      );

      await approvalSettingsSvc.saveSettings(pool, {
        organizationId: orgA.id,
        actorUserId: users.hqA.user.id,
        branchEditMode: "approval_required",
        requirePreviewBeforePublish: false,
        requireMobilePreviewConfirmation: false,
        preventSelfApproval: true,
        requireRequestChangesComment: true,
        requireRejectionReason: true,
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

  function skipIfNeeded(t) {
    if (skipSuite) t.skip(skipReason || "foundation unavailable");
  }

  async function seedTextDraft(value) {
    return saveInlineFieldDraft(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: null,
      editorUserId: users.hqA.user.id,
      actorRole: "church_hq_admin",
      pageKey: "home",
      sectionKey: "hero",
      fieldKey: "heading",
      newValue: value,
    });
  }

  it("groups draft changes by page/section/item and shows empty state", async (t) => {
    skipIfNeeded(t);
    const empty = await loadWebsiteDraftChangesReview(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: null,
      actorRole: "church_hq_admin",
      basePath: "/hq/content",
    });
    assert.equal(empty.ok, true);
    assert.equal(empty.empty, true);
    assert.equal(empty.hasChanges, false);

    await seedTextDraft("Draft Sacred Headline");
    await saveStructuredDraft(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: null,
      editorUserId: users.hqA.user.id,
      actorRole: "church_hq_admin",
      draftKind: "image",
      pageKey: "home",
      sectionKey: "hero",
      entityKey: "hero-image",
      op: "upsert",
      payload: {
        imageUrl: "/church/images/tenant-public/home-desktop-hero.jpg",
        altText: "Lobby",
      },
      previousPayload: {},
    });

    const review = await loadWebsiteDraftChangesReview(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: null,
      actorRole: "church_hq_admin",
      basePath: "/hq/content",
    });
    assert.equal(review.ok, true);
    assert.equal(review.hasChanges, true);
    assert.ok(review.counts.textChanges >= 1);
    assert.ok(review.counts.imageChanges >= 1);
    assert.ok(review.groupedPages.some((p) => p.pageKey === "home"));
    const home = review.groupedPages.find((p) => p.pageKey === "home");
    assert.ok(home.sections.some((s) => s.sectionKey === "hero"));
    assert.ok(
      !JSON.stringify(review.groupedPages).includes("organization_id"),
      "must not expose internal ids in review model labels"
    );

    const html = await request(app)
      .get("/hq/content/draft-changes")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken))
      .expect(200);
    assert.match(html.text, /data-bb-website-draft-changes="1"/);
    assert.match(html.text, /Draft Sacred Headline/);
    assert.match(html.text, /data-bb-draft-page="home"/);
  });

  it("draft preview is protected; public visitor cannot open it", async (t) => {
    skipIfNeeded(t);
    const anon = await request(app)
      .get("/hq/content/draft-preview/home")
      .set("Host", HOST_A);
    assert.ok([303, 401].includes(anon.status), `anon status ${anon.status}`);

    const forbidden = await request(app)
      .get("/hq/content/draft-preview/home")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqB.rawToken));
    assert.ok([403, 303, 404].includes(forbidden.status));

    const ok = await request(app)
      .get("/hq/content/draft-preview/home")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken))
      .expect(200);
    assert.match(ok.text, /Draft preview|Admin preview/i);
    assert.match(ok.text, /Draft Sacred Headline|Live Headline/);
  });

  it("saved drafts alone do not imply unsaved-field warning controller API", async (t) => {
    skipIfNeeded(t);
    const guardPath = path.join(
      __dirname,
      "../public/blessboard/v5/website-unsaved-guard.js"
    );
    const dialogPath = path.join(
      __dirname,
      "../views/blessboard/v5/partials/unsaved-changes-dialog.ejs"
    );
    const src = fs.readFileSync(guardPath, "utf8");
    const dialog = fs.readFileSync(dialogPath, "utf8");
    assert.match(src, /Saved draft changes alone must never trigger/);
    assert.match(src, /isDirty/);
    assert.match(dialog, /Continue Editing/);
    assert.match(dialog, /Discard Changes/);
    assert.match(dialog, /Save and Continue/);
    assert.match(dialog, /You have unsaved changes/);
  });

  it("HQ admin can publish when allowed; public updates and draft clears", async (t) => {
    skipIfNeeded(t);
    const beforePublic = await request(app).get("/").set("Host", HOST_A).expect(200);
    assert.match(beforePublic.text, /Live Headline/);
    assert.doesNotMatch(beforePublic.text, /Draft Sacred Headline/);

    const csrf = issueCsrfToken(baseEnv());
    const published = await publishWebsiteDrafts(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: null,
      actorUserId: users.hqA.user.id,
      actorRole: "church_hq_admin",
      confirmPublish: true,
      deferServiceTimes: true,
      env: baseEnv(),
    });
    assert.equal(published.ok, true, published.reason || JSON.stringify(published));
    assert.equal(published.draftCleared, true);

    const remaining = await fieldDraftRepo.countDrafts(pool, {
      churchId: churchA.id,
      branchId: null,
    });
    assert.equal(remaining, 0);

    const afterPublic = await request(app).get("/").set("Host", HOST_A).expect(200);
    assert.match(afterPublic.text, /Draft Sacred Headline/);

    const version = await versionRepo.getCurrentPublishedVersion(pool, orgA.id);
    assert.ok(version && version.id);

    // CSRF required for HTTP discard/publish
    await request(app)
      .post("/hq/content/draft-changes/discard")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken))
      .type("form")
      .send({ confirm_discard: "1" })
      .expect(403);
  });

  it("HTTP Save and Publish succeeds without client-supplied deferServiceTimes", async (t) => {
    skipIfNeeded(t);
    await seedTextDraft("HTTP Save And Publish Headline");

    const csrf = issueCsrfToken(baseEnv());
    const review = await request(app)
      .get("/hq/content/draft-changes/publish-review")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken))
      .expect(200);
    assert.match(review.text, /Current website text|Proposed new text|Save and Publish|data-bb-save-and-publish/);
    assert.match(review.text, /data-bb-website-publish-review="1"/);

    const published = await request(app)
      .post("/hq/content/draft-changes/publish")
      .set("Host", HOST_A)
      .set(
        "Cookie",
        cookieHeader(sidCookie(users.hqA.rawToken), `${CSRF_COOKIE}=${csrf}`)
      )
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        confirm_publish: "1",
        acknowledge_public: "1",
      })
      .expect(303);

    assert.match(String(published.headers.location || ""), /notice=published/);

    const after = await request(app).get("/").set("Host", HOST_A).expect(200);
    assert.match(after.text, /HTTP Save And Publish Headline/);

    const list = await request(app)
      .get("/hq/content/draft-changes?notice=published")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken))
      .expect(200);
    assert.match(list.text, /Changes published successfully/);
  });

  it("failed publication leaves public version unchanged", async (t) => {
    skipIfNeeded(t);
    await seedTextDraft("Should Not Go Live");
    const before = await request(app).get("/").set("Host", HOST_A).expect(200);
    assert.doesNotMatch(before.text, /Should Not Go Live/);

    const failed = await publishWebsiteDrafts(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: null,
      actorUserId: users.hqA.user.id,
      actorRole: "church_hq_admin",
      confirmPublish: false,
      env: baseEnv(),
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.reason, "confirm_publish");

    const after = await request(app).get("/").set("Host", HOST_A).expect(200);
    assert.doesNotMatch(after.text, /Should Not Go Live/);
    const drafts = await fieldDraftRepo.countDrafts(pool, {
      churchId: churchA.id,
      branchId: null,
    });
    assert.ok(drafts >= 1);
  });

  it("discard preserves published content and requires auth+CSRF", async (t) => {
    skipIfNeeded(t);
    const csrf = issueCsrfToken(baseEnv());
    await seedTextDraft("Discard Me Draft");
    const discarded = await discardWebsiteDrafts(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: null,
      actorUserId: users.hqA.user.id,
      actorRole: "church_hq_admin",
      confirmDiscard: true,
    });
    assert.equal(discarded.ok, true);
    assert.ok(discarded.discarded >= 1);

    const publicHtml = await request(app).get("/").set("Host", HOST_A).expect(200);
    assert.match(
      publicHtml.text,
      /Draft Sacred Headline|Live Headline|HTTP Save And Publish Headline/
    );
    assert.doesNotMatch(publicHtml.text, /Discard Me Draft/);

    const empty = await loadWebsiteDraftChangesReview(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: null,
      actorRole: "church_hq_admin",
      basePath: "/hq/content",
    });
    assert.equal(empty.empty, true);

    const page = await request(app)
      .get("/hq/content/draft-changes")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken))
      .expect(200);
    assert.match(page.text, /data-bb-draft-empty="1"|No draft changes/);

    const csrfCookie = `${CSRF_COOKIE}=${csrf}`;
    await request(app)
      .post("/hq/content/draft-changes/discard")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(sidCookie(users.hqA.rawToken), csrfCookie))
      .type("form")
      .send({ [CSRF_FIELD]: csrf, confirm_discard: "1" })
      .expect(303);
  });

  it("branch admin publishes when governance allows (trustedActive)", async (t) => {
    skipIfNeeded(t);
    const orig = approvalSettingsSvc.resolveBranchEditMode;
    approvalSettingsSvc.resolveBranchEditMode = () => ({
      mode: "trusted_branch_publish",
      configuredMode: "trusted_branch_publish",
      trustedActive: true,
      note: null,
    });
    try {
      await saveInlineFieldDraft(pool, {
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: branchA.id,
        editorUserId: users.branchA.user.id,
        actorRole: "branch_admin",
        pageKey: "home",
        sectionKey: "hero",
        fieldKey: "bodyText",
        newValue: "Trusted branch body",
      });
      const cap = resolvePublishCapability({
        canPublish: true,
        actorRole: "branch_admin",
        settings: { branchEditMode: "trusted_branch_publish" },
      });
      assert.equal(cap.action, "publish");

      const published = await publishWebsiteDrafts(pool, {
        organizationId: orgA.id,
        churchId: churchA.id,
        branchId: branchA.id,
        actorUserId: users.branchA.user.id,
        actorRole: "branch_admin",
        confirmPublish: true,
        deferServiceTimes: true,
        env: baseEnv(),
      });
      assert.equal(published.ok, true, published.reason || JSON.stringify(published));
    } finally {
      approvalSettingsSvc.resolveBranchEditMode = orig;
    }
  });

  it("branch admin submits for approval when required", async (t) => {
    skipIfNeeded(t);
    await saveInlineFieldDraft(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      editorUserId: users.branchA.user.id,
      actorRole: "branch_admin",
      pageKey: "home",
      sectionKey: "hero",
      fieldKey: "heading",
      newValue: "Branch Draft Headline",
    });

    const cap = resolvePublishCapability({
      canPublish: true,
      actorRole: "branch_admin",
      settings: { branchEditMode: "approval_required" },
    });
    assert.equal(cap.action, "submit_for_approval");

    const submitted = await submitWebsiteDraftsForApproval(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: branchA.id,
      actorUserId: users.branchA.user.id,
      actorRole: "branch_admin",
    });
    assert.equal(submitted.ok, true, submitted.reason || JSON.stringify(submitted));
    assert.equal(submitted.draftPreserved, true);
    assert.ok(submitted.submission && submitted.submission.id);

    const publicHtml = await request(app).get("/").set("Host", HOST_A).expect(200);
    assert.doesNotMatch(publicHtml.text, /Branch Draft Headline/);
  });

  it("cross-organization publish is rejected", async (t) => {
    skipIfNeeded(t);
    await saveInlineFieldDraft(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      branchId: null,
      editorUserId: users.hqA.user.id,
      actorRole: "church_hq_admin",
      pageKey: "home",
      sectionKey: "hero",
      fieldKey: "heading",
      newValue: "Cross Org Attempt",
    });
    const rejected = await publishWebsiteDrafts(pool, {
      organizationId: orgB.id,
      churchId: churchA.id,
      branchId: null,
      actorUserId: users.hqB.user.id,
      actorRole: "church_hq_admin",
      confirmPublish: true,
      deferServiceTimes: true,
      env: baseEnv(),
    });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.reason, "cross_org");

    const publicHtml = await request(app).get("/").set("Host", HOST_A).expect(200);
    assert.doesNotMatch(publicHtml.text, /Cross Org Attempt/);
  });

  it("assets and routes exist", async (t) => {
    skipIfNeeded(t);
    assert.ok(
      fs.existsSync(
        path.join(__dirname, "../views/blessboard/v5/content-admin/website-draft-changes.ejs")
      )
    );
    assert.ok(
      fs.existsSync(
        path.join(__dirname, "../views/blessboard/v5/content-admin/website-publish-review.ejs")
      )
    );
    assert.ok(
      fs.existsSync(
        path.join(__dirname, "../views/blessboard/v5/partials/unsaved-changes-dialog.ejs")
      )
    );
    assert.ok(
      fs.existsSync(path.join(__dirname, "../public/blessboard/v5/website-unsaved-guard.js"))
    );
  });
});
