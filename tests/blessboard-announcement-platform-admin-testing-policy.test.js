"use strict";

/**
 * Prompt 076 — Platform Admin announcement writes allowed only when DEPLOYMENT_ENV=testing.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  resetFoundationDatabase,
  foundationDbUnavailableSkipReason,
  createFoundationPool,
} = require("./helpers/foundationDb");
const {
  DEFAULT_V5_COOKIE,
  baseV5TestEnv,
  makeTenant,
  extractSetCookie: extractCookie,
  joinCookieHeader: cookieHeader,
} = require("./helpers/blessboardV5Fixtures");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const {
  createAnnouncement,
  updateAnnouncement,
  evaluateAnnouncementCapability,
  resolveAnnouncementProductPolicy,
} = require("../src/blessboard/services/announcementsService");

const PASSWORD = "correct-horse-battery-staple";
const HOST_A = "ann076-a.blessboard.org";
const HOST_B = "ann076-b.blessboard.org";
const IDENTITY_KEY = "blessboard-platform-v5";

describe("announcement platform-admin testing policy (076)", () => {
  it("resolves policy from DEPLOYMENT_ENV=testing (not NODE_ENV)", () => {
    assert.equal(
      resolveAnnouncementProductPolicy({ DEPLOYMENT_ENV: "testing", NODE_ENV: "production" })
        .allowPlatformAdminPublish,
      true
    );
    assert.equal(
      resolveAnnouncementProductPolicy({ DEPLOYMENT_ENV: "production", NODE_ENV: "test" })
        .allowPlatformAdminPublish,
      false
    );
    assert.equal(
      resolveAnnouncementProductPolicy({ NODE_ENV: "test" }).allowPlatformAdminPublish,
      false
    );
    assert.equal(
      resolveAnnouncementProductPolicy({
        DEPLOYMENT_ENV: "production",
        BLESSBOARD_ALLOW_PLATFORM_ADMIN_ANNOUNCEMENT_PUBLISH: "1",
      }).allowPlatformAdminPublish,
      true
    );
    assert.equal(
      resolveAnnouncementProductPolicy({ DEPLOYMENT_ENV: "testing" })
        .showTestingPlatformAdminPublishBanner,
      true
    );
    assert.doesNotMatch(
      JSON.stringify(resolveAnnouncementProductPolicy({ DEPLOYMENT_ENV: "testing" })),
      /req\.query|cookie|confirm_publish/i
    );
  });

  it("capability publish follows allowPlatformAdminPublish only for platform_admin", () => {
    const platformOnly = [{ roleKey: "platform_admin" }];
    const memberOnly = [{ roleKey: "member" }];
    assert.equal(
      evaluateAnnouncementCapability(
        platformOnly,
        { branchId: null },
        { allowPlatformAdminPublish: true },
        "publish"
      ).ok,
      true
    );
    assert.equal(
      evaluateAnnouncementCapability(
        platformOnly,
        { branchId: null },
        { allowPlatformAdminPublish: false },
        "publish"
      ).reason,
      "platform_publish_denied"
    );
    assert.equal(
      evaluateAnnouncementCapability(
        memberOnly,
        { branchId: null },
        { allowPlatformAdminPublish: true },
        "publish"
      ).ok,
      false
    );
  });
});

describe("announcement platform-admin testing writes (076 pg)", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let orgA;
  let orgB;
  let churchA;
  let churchB;
  let branchA;
  let platformAdmin;
  let hqAdmin;
  let branchAdmin;
  let testingApp;
  let productionApp;

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
        organizationKey: "ann076-a",
        displayName: "Ann 076 A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "ann076-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);
      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "ann076-a",
        churchKey: "ann076-a",
        displayName: "Ann Church 076 A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      branchA = chA.records.hqBranch;

      orgB = await provisionPlatformTenant(pool, {
        organizationKey: "ann076-b",
        displayName: "Ann 076 B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "ann076-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(orgB.ok, true, orgB.message);
      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "ann076-b",
        churchKey: "ann076-b",
        displayName: "Ann Church 076 B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);
      churchB = chB.records.church;

      async function makeUser(email, role, orgRec) {
        const created = await createBlessBoardUser(pool, {
          email,
          password: PASSWORD,
          displayName: email,
        });
        assert.equal(created.ok, true, created.message);
        if (role) {
          const assigned = await assignBlessBoardRole(pool, role);
          assert.equal(assigned.ok, true, assigned.message || assigned.reason);
        }
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-v5",
          userId: created.user.id,
          organizationId: orgRec.records.organization.id,
        });
        assert.equal(session.ok, true, session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      platformAdmin = await makeUser(
        "platform@ann076-a.example.test",
        { email: "platform@ann076-a.example.test", organizationKey: "ann076-a", roleKey: "platform_admin" },
        orgA
      );
      hqAdmin = await makeUser(
        "hq@ann076-a.example.test",
        {
          email: "hq@ann076-a.example.test",
          organizationKey: "ann076-a",
          churchKey: "ann076-a",
          roleKey: "church_hq_admin",
        },
        orgA
      );
      branchAdmin = await makeUser(
        "branch@ann076-a.example.test",
        {
          email: "branch@ann076-a.example.test",
          organizationKey: "ann076-a",
          churchKey: "ann076-a",
          roleKey: "branch_admin",
          branchKey: "hq",
        },
        orgA
      );

      testingApp = createV5FoundationApp({
        getPool: () => pool,
        env: baseV5TestEnv({ DEPLOYMENT_ENV: "testing" }),
      });
      productionApp = createV5FoundationApp({
        getPool: () => pool,
        env: baseV5TestEnv({ DEPLOYMENT_ENV: "production" }),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = String((err && err.message) || err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function skipIfNeeded(t) {
    if (skipSuite) {
      t.skip(foundationDbUnavailableSkipReason(skipReason));
      return true;
    }
    return false;
  }

  async function countAudit(actionKey, entityId) {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.audit_events
        WHERE action_key = $1 AND entity_id = $2::uuid`,
      [actionKey, entityId]
    );
    return r.rows[0].n;
  }

  it("testing + platform admin can create, edit, publish, and archive (soft unpublish)", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const policy = resolveAnnouncementProductPolicy({ DEPLOYMENT_ENV: "testing" });

    const created = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: null,
      actorUserId: platformAdmin.user.id,
      tenant,
      productPolicy: policy,
      title: "076 Platform draft",
      body: "Testing platform admin create",
      status: "draft",
      audiences: ["members"],
    });
    assert.equal(created.ok, true, created.reason);
    assert.ok((await countAudit("announcement_created", created.item.id)) >= 1);

    const edited = await updateAnnouncement(pool, created.item.id, {
      actorUserId: platformAdmin.user.id,
      tenant,
      churchId: churchA.id,
      scopeBranchId: null,
      productPolicy: policy,
      title: "076 Platform edited",
      body: "Testing platform admin edit",
      expectedUpdatedAt: created.item.updatedAt,
    });
    assert.equal(edited.ok, true, edited.reason);
    assert.equal(edited.item.title, "076 Platform edited");
    assert.ok((await countAudit("announcement_updated", edited.item.id)) >= 1);

    const published = await updateAnnouncement(pool, edited.item.id, {
      actorUserId: platformAdmin.user.id,
      tenant,
      churchId: churchA.id,
      scopeBranchId: null,
      productPolicy: policy,
      status: "published",
      confirmPublish: true,
      enforcePublishConfirm: true,
      expectedUpdatedAt: edited.item.updatedAt,
    });
    assert.equal(published.ok, true, published.reason);
    assert.equal(published.item.status, "published");
    assert.ok((await countAudit("announcement_published", published.item.id)) >= 1);

    const archived = await updateAnnouncement(pool, published.item.id, {
      actorUserId: platformAdmin.user.id,
      tenant,
      churchId: churchA.id,
      scopeBranchId: null,
      productPolicy: policy,
      status: "archived",
      expectedUpdatedAt: published.item.updatedAt,
    });
    assert.equal(archived.ok, true, archived.reason);
    assert.equal(archived.item.status, "archived");
    assert.ok((await countAudit("announcement_archived", archived.item.id)) >= 1);
  });

  it("production + platform admin remains blocked from publish", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const policy = resolveAnnouncementProductPolicy({ DEPLOYMENT_ENV: "production" });
    const draft = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: null,
      actorUserId: platformAdmin.user.id,
      tenant,
      productPolicy: policy,
      title: "076 Prod blocked",
      body: "Should not publish",
      status: "draft",
      audiences: ["admins"],
    });
    assert.equal(draft.ok, true, draft.reason);
    const published = await updateAnnouncement(pool, draft.item.id, {
      actorUserId: platformAdmin.user.id,
      tenant,
      churchId: churchA.id,
      scopeBranchId: null,
      productPolicy: policy,
      status: "published",
      confirmPublish: true,
      enforcePublishConfirm: true,
      expectedUpdatedAt: draft.item.updatedAt,
    });
    assert.equal(published.ok, false);
    assert.equal(published.reason, "platform_publish_denied");
  });

  it("testing + non-platform admin unchanged; HQ still publishes", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenant = makeTenant(churchA, orgA.records.organization, branchA);
    const policy = resolveAnnouncementProductPolicy({ DEPLOYMENT_ENV: "testing" });
    const created = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: null,
      actorUserId: hqAdmin.user.id,
      tenant,
      productPolicy: policy,
      title: "076 HQ still works",
      body: "HQ path",
      status: "published",
      audiences: ["members"],
      confirmPublish: true,
      enforcePublishConfirm: true,
    });
    assert.equal(created.ok, true, created.reason);
    assert.equal(created.item.status, "published");
  });

  it("cross-organization write blocked for platform admin", async (t) => {
    if (skipIfNeeded(t)) return;
    const tenantA = makeTenant(churchA, orgA.records.organization, branchA);
    const policy = resolveAnnouncementProductPolicy({ DEPLOYMENT_ENV: "testing" });
    const draft = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: null,
      actorUserId: hqAdmin.user.id,
      tenant: tenantA,
      productPolicy: policy,
      title: "076 Owned by A",
      body: "Cross org",
      status: "draft",
      audiences: ["admins"],
    });
    assert.equal(draft.ok, true, draft.reason);

    const cross = await updateAnnouncement(pool, draft.item.id, {
      actorUserId: platformAdmin.user.id,
      tenant: tenantA,
      churchId: churchB.id,
      scopeBranchId: null,
      productPolicy: policy,
      title: "076 Hijack attempt",
      expectedUpdatedAt: draft.item.updatedAt,
    });
    assert.equal(cross.ok, false);
    assert.equal(cross.reason, "church");
  });

  it("HTTP testing app: platform admin publish + banner; CSRF required; production app still denies", async (t) => {
    if (skipIfNeeded(t)) return;
    const paCookie = `${DEFAULT_V5_COOKIE}=${platformAdmin.rawToken}`;

    const listTesting = await request(testingApp)
      .get("/hq/announcements")
      .set("Host", HOST_A)
      .set("Cookie", paCookie);
    assert.equal(listTesting.status, 200);
    assert.match(listTesting.text, /Testing mode: Platform Admin publishing enabled/);
    assert.match(listTesting.text, /data-bb-announcement-testing-platform-admin-publish="1"/);

    const newPage = await request(testingApp)
      .get("/hq/announcements/new")
      .set("Host", HOST_A)
      .set("Cookie", paCookie);
    assert.equal(newPage.status, 200);
    const csrf = extractCookie(newPage, CSRF_COOKIE);
    assert.ok(csrf);

    const noCsrf = await request(testingApp)
      .post("/hq/announcements")
      .set("Host", HOST_A)
      .set("Cookie", paCookie)
      .type("form")
      .send({
        title: "076 No CSRF",
        body: "Should fail",
        status: "draft",
        audience_admins: "1",
      });
    assert.equal(noCsrf.status, 403);

    const created = await request(testingApp)
      .post("/hq/announcements")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(paCookie, `${CSRF_COOKIE}=${csrf}`))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        title: "076 HTTP Platform draft",
        body: "HTTP create body",
        status: "draft",
        audience_admins: "1",
      });
    assert.equal(created.status, 303);
    const annId = String(created.headers.location || "").split("/").pop().split("?")[0];
    assert.match(annId, /^[0-9a-f-]{36}$/i);

    const publishPage = await request(testingApp)
      .get(`/hq/announcements/${annId}/publish`)
      .set("Host", HOST_A)
      .set("Cookie", paCookie);
    assert.equal(publishPage.status, 200);
    assert.match(publishPage.text, /Testing mode: Platform Admin publishing enabled/);
    const pubCsrf = extractCookie(publishPage, CSRF_COOKIE);

    const published = await request(testingApp)
      .post(`/hq/announcements/${annId}/publish`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(paCookie, `${CSRF_COOKIE}=${pubCsrf}`))
      .type("form")
      .send({
        [CSRF_FIELD]: pubCsrf,
        confirm_publish: "1",
      });
    assert.equal(published.status, 303);

    const detail = await request(testingApp)
      .get(`/hq/announcements/${annId}`)
      .set("Host", HOST_A)
      .set("Cookie", paCookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-bb-announcement-status="published"/);

    // Production deployment env: same platform admin cannot publish.
    const prodDraft = await createAnnouncement(pool, {
      churchId: churchA.id,
      branchId: null,
      actorUserId: hqAdmin.user.id,
      tenant: makeTenant(churchA, orgA.records.organization, branchA),
      title: "076 Prod HTTP draft",
      body: "For prod deny",
      status: "draft",
      audiences: ["admins"],
    });
    assert.equal(prodDraft.ok, true, prodDraft.reason);
    const prodPublishPage = await request(productionApp)
      .get(`/hq/announcements/${prodDraft.item.id}/publish`)
      .set("Host", HOST_A)
      .set("Cookie", paCookie);
    assert.equal(prodPublishPage.status, 200);
    assert.doesNotMatch(prodPublishPage.text, /Testing mode: Platform Admin publishing enabled/);
    const prodCsrf = extractCookie(prodPublishPage, CSRF_COOKIE);
    const prodPublish = await request(productionApp)
      .post(`/hq/announcements/${prodDraft.item.id}/publish`)
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(paCookie, `${CSRF_COOKIE}=${prodCsrf}`))
      .type("form")
      .send({
        [CSRF_FIELD]: prodCsrf,
        confirm_publish: "1",
        expected_updated_at: prodDraft.item.updatedAt,
      });
    assert.equal(prodPublish.status, 403);
    assert.match(prodPublish.text, /cannot publish unless product policy allows/i);

    // Branch admin path unchanged on testing app.
    const baCookie = `${DEFAULT_V5_COOKIE}=${branchAdmin.rawToken}`;
    const baList = await request(testingApp)
      .get("/branch-admin/announcements")
      .set("Host", HOST_A)
      .set("Cookie", baCookie);
    assert.equal(baList.status, 200);
    assert.doesNotMatch(baList.text, /Testing mode: Platform Admin publishing enabled/);
  });
});
