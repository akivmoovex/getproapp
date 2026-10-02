"use strict";

/**
 * Phase4 Stage 3B — Growth Restore Previous Website + Restored Draft Review.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const {
  V5_IDENTITY_KEY: IDENTITY_KEY,
  DEFAULT_V5_COOKIE,
  baseV5TestEnv,
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
const { assignOrganizationPlan } = require("../src/platform/services/entitlementService");
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  repairWebsiteFoundation,
} = require("../src/blessboard/services/websiteFoundationRepairService");
const {
  acknowledgeWebsitePreview,
} = require("../src/blessboard/services/churchWebsitePublishService");
const {
  prepareGrowthRestorePreviousWebsite,
  createGrowthRestoredWebsiteDraft,
  loadGrowthRestoredWebsiteDraftReview,
  discardGrowthRestoredWebsiteDraft,
  loadGrowthRecentWebsiteChanges,
  GROWTH_PREVIOUS_LIMIT,
} = require("../src/blessboard/services/websitePublicationVersionService");
const versionRepo = require("../src/blessboard/repositories/websitePublicationVersionRepository");
const auditSvc = require("../src/blessboard/services/websiteAuditService");

const PASSWORD = "TestPassword99!";
const HOST_A = "p4rp-a.blessboard.org";
const HOST_B = "p4rp-b.blessboard.org";
const ORG_KEY_A = "p4rp-a";

function baseEnv(overrides) {
  return baseV5TestEnv(overrides);
}

function sidCookie(rawToken) {
  return `${DEFAULT_V5_COOKIE}=${rawToken}`;
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
  const match = String(html || "").match(
    new RegExp(
      `name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`
    )
  );
  return match ? match[1] || match[2] : null;
}

describe("phase4 restore previous website", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let churchA;
  let churchB;
  let users = {};
  let publicationIds = {};

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

      async function provisionOrg(key, host, store) {
        const prov = await provisionPlatformTenant(pool, {
          organizationKey: key,
          displayName: `P4RP ${key}`,
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
          displayName: `P4RP Church ${key}`,
          dataEnvironment: "testing",
          hqBranchKey: "hq",
          hqBranchDisplayName: "HQ",
        });
        assert.equal(ch.ok, true, ch.message);
        store.org = prov.records.organization;
        store.church = ch.records.church;
        await ensureChurchSettingsInitialized(pool, store.church.id);
        await updateChurchSettings(pool, store.church.id, {
          publicName: `P4RP Church ${key}`,
          websiteStatus: "published",
          primaryEmail: `${key}@example.test`,
        });
        await repairWebsiteFoundation(pool, { churchId: store.church.id });
        await acknowledgeWebsitePreview(pool, {
          organizationId: store.org.id,
          actorUserId: null,
        });
      }

      const a = {};
      const b = {};
      await provisionOrg("p4rp-a", HOST_A, a);
      await provisionOrg("p4rp-b", HOST_B, b);
      orgA = a.org;
      orgB = b.org;
      churchA = a.church;
      churchB = b.church;

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
        "p4rp-hq-a@example.test",
        "HQ Admin A",
        {
          email: "p4rp-hq-a@example.test",
          organizationKey: "p4rp-a",
          roleKey: "church_hq_admin",
          churchKey: "p4rp-a",
        },
        orgA.id
      );
      users.hqB = await makeUser(
        "p4rp-hq-b@example.test",
        "HQ Admin B",
        {
          email: "p4rp-hq-b@example.test",
          organizationKey: "p4rp-b",
          roleKey: "church_hq_admin",
          churchKey: "p4rp-b",
        },
        orgB.id
      );
      users.branchA = await makeUser(
        "p4rp-br-a@example.test",
        "Branch A",
        {
          email: "p4rp-br-a@example.test",
          organizationKey: "p4rp-a",
          roleKey: "branch_admin",
          churchKey: "p4rp-a",
          branchKey: "hq",
        },
        orgA.id
      );

      const growthAssign = await assignOrganizationPlan(pool, {
        organizationId: orgA.id,
        planKey: "growth",
        status: "active",
      });
      assert.equal(growthAssign.ok, true, growthAssign.reason);

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

  async function authedGet(host, path, rawToken) {
    const res = await request(app)
      .get(path)
      .set("Host", host)
      .set("Cookie", sidCookie(rawToken));
    return {
      res,
      csrf: extractCsrfToken(res.text),
      csrfCookie: extractCookie(res, CSRF_COOKIE),
    };
  }

  function cookieHeader(rawToken, csrfCookie) {
    const parts = [sidCookie(rawToken)];
    if (csrfCookie) parts.push(`${CSRF_COOKIE}=${csrfCookie}`);
    return parts.join("; ");
  }

  async function clearOrgPublications(organizationId) {
    await pool.query(
      `DELETE FROM blessboard.website_publication_versions WHERE organization_id = $1`,
      [organizationId]
    );
  }

  async function archiveDraftRestorations(organizationId) {
    await pool.query(
      `UPDATE blessboard.website_publication_versions
          SET status = 'archived'
        WHERE organization_id = $1
          AND status = 'draft'
          AND source_type = 'content_restoration'`,
      [organizationId]
    );
  }

  async function resetPublicPagesPublished(churchId) {
    await pool.query(
      `UPDATE blessboard.public_pages
          SET status = 'published'
        WHERE church_id = $1
          AND branch_id IS NULL`,
      [churchId]
    );
  }

  async function insertPublication(opts) {
    const versionNumber =
      opts.versionNumber ||
      (await versionRepo.getNextVersionNumber(pool, opts.organizationId));
    if (opts.supersedeFirst) {
      await versionRepo.supersedePublishedVersions(pool, opts.organizationId);
    }
    return versionRepo.insertPublishedVersion(pool, {
      organizationId: opts.organizationId,
      churchId: opts.churchId,
      versionNumber,
      themeKey: opts.themeKey || "default",
      sourceType: opts.sourceType || "hq_edit",
      publishedBy: opts.publishedBy || users.hqA.user.id,
      publishedAt: opts.publishedAt || new Date().toISOString(),
      snapshot: opts.snapshot || {
        pages: [
          {
            pageKey: "home",
            title: "Home",
            sections: [{ sectionKey: "hero", heading: "Default hero" }],
          },
        ],
      },
      changeSummary: opts.changeSummary || { pagesChanged: ["home"] },
    });
  }

  async function seedPublicationTimeline(organizationId, churchId, count, notePrefix, opts) {
    const versions = [];
    for (let i = 0; i < count; i += 1) {
      const publishedAt = new Date(Date.UTC(2026, 1, 10 + i, 15, i, 0)).toISOString();
      if (i > 0) {
        await versionRepo.supersedePublishedVersions(pool, organizationId);
      }
      const themeKey =
        opts && opts.themes && opts.themes[i] != null ? opts.themes[i] : "default";
      const snapshot =
        opts && typeof opts.snapshotForIndex === "function"
          ? opts.snapshotForIndex(i, count)
          : {
              pages: [
                {
                  pageKey: "home",
                  title: "Home",
                  sections: [
                    {
                      sectionKey: "hero",
                      heading: `${notePrefix || "Timeline"} ${count - i}`,
                    },
                  ],
                },
              ],
            };
      const v = await insertPublication({
        organizationId,
        churchId,
        publishedBy: users.hqA.user.id,
        publishedAt,
        themeKey,
        changeSummary: {
          publicationNote: `${notePrefix || "Timeline"} update ${count - i}`,
          pagesChanged: ["home"],
        },
        snapshot,
      });
      versions.push(v);
    }
    return versions;
  }

  async function seedRestoreBaseline() {
    await clearOrgPublications(orgA.id);
    await archiveDraftRestorations(orgA.id);
    await resetPublicPagesPublished(churchA.id);
    const versions = await seedPublicationTimeline(orgA.id, churchA.id, 3, "Restore");
    publicationIds.current = versions[versions.length - 1].id;
    publicationIds.previousNewest = versions[versions.length - 2].id;
    publicationIds.previousOldest = versions[0].id;
    return versions;
  }

  async function countDraftRestorations(organizationId) {
    const res = await pool.query(
      `SELECT COUNT(*)::int AS n
         FROM blessboard.website_publication_versions
        WHERE organization_id = $1
          AND status = 'draft'
          AND source_type = 'content_restoration'`,
      [organizationId]
    );
    return res.rows[0].n;
  }

  async function postRestore(host, publicationId, rawToken, fields, csrf, csrfCookie) {
    return request(app)
      .post(`/hq/website/recent-changes/${publicationId}/restore`)
      .set("Host", host)
      .set("Cookie", cookieHeader(rawToken, csrfCookie))
      .type("form")
      .send({ [CSRF_FIELD]: csrf, ...fields });
  }

  it("growth HQ opens restore screen with stitch Phase4 - Restore Previous Website", async () => {
    skipIfNeeded();
    await seedRestoreBaseline();

    const { res } = await authedGet(
      HOST_A,
      `/hq/website/recent-changes/${publicationIds.previousNewest}/restore`,
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-phase4-restore-previous-website="1"/);
    assert.match(res.text, /data-bb-stitch-screen="Phase4 - Restore Previous Website"/);
    assert.match(res.text, /Restore Previous Website/);
    assert.match(res.text, /data-bb-viewport="responsive"/);
    assert.match(res.text, /name="confirm_restore"/);

    const svc = await prepareGrowthRestorePreviousWebsite(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      publicationId: publicationIds.previousNewest,
      organizationKey: ORG_KEY_A,
      env: baseEnv(),
    });
    assert.equal(svc.ok, true);
    assert.equal(svc.stitchScreen, "Phase4 - Restore Previous Website");
  });

  it("foundation org B receives 404 on restore routes", async () => {
    skipIfNeeded();
    const orgBVersion = await insertPublication({
      organizationId: orgB.id,
      churchId: churchB.id,
      publishedBy: users.hqB.user.id,
      changeSummary: { publicationNote: "Foundation restore gate" },
    });
    await versionRepo.supersedePublishedVersions(pool, orgB.id);
    await insertPublication({
      organizationId: orgB.id,
      churchId: churchB.id,
      publishedBy: users.hqB.user.id,
      changeSummary: { publicationNote: "Foundation current" },
    });

    const restore = await authedGet(
      HOST_B,
      `/hq/website/recent-changes/${orgBVersion.id}/restore`,
      users.hqB.rawToken
    );
    assert.equal(restore.res.status, 404);
    assert.match(restore.res.text, /Growth plan|cannot be restored/i);

    const review = await authedGet(HOST_B, "/hq/website/restored-draft", users.hqB.rawToken);
    assert.equal(review.res.status, 404);
    assert.match(review.res.text, /Growth plan/i);

    await clearOrgPublications(orgB.id);
  });

  it("unauthorized users are blocked from restore routes", async () => {
    skipIfNeeded();
    const anon = await request(app)
      .get(`/hq/website/recent-changes/${publicationIds.previousNewest}/restore`)
      .set("Host", HOST_A);
    assert.ok(anon.status === 303 || anon.status === 401);

    const branch = await request(app)
      .get(`/hq/website/recent-changes/${publicationIds.previousNewest}/restore`)
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.branchA.rawToken));
    assert.equal(branch.status, 403);
  });

  it("cross-org publication restore returns 404", async () => {
    skipIfNeeded();
    const orgBVersion = await insertPublication({
      organizationId: orgB.id,
      churchId: churchB.id,
      publishedBy: users.hqB.user.id,
      changeSummary: { publicationNote: "Org B only" },
    });

    const wrongHost = await authedGet(
      HOST_A,
      `/hq/website/recent-changes/${orgBVersion.id}/restore`,
      users.hqA.rawToken
    );
    assert.equal(wrongHost.res.status, 404);

    await clearOrgPublications(orgB.id);
  });

  it("current live publication cannot be restored", async () => {
    skipIfNeeded();
    const current = await versionRepo.loadCurrentWebsitePublication(pool, orgA.id);
    assert.ok(current && current.id);

    const res = await authedGet(
      HOST_A,
      `/hq/website/recent-changes/${current.id}/restore`,
      users.hqA.rawToken
    );
    assert.equal(res.res.status, 404);
    assert.match(res.res.text, /Previous website not found/i);

    const svc = await prepareGrowthRestorePreviousWebsite(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      publicationId: current.id,
      organizationKey: ORG_KEY_A,
      env: baseEnv(),
    });
    assert.equal(svc.ok, false);
    assert.equal(svc.reason, "is_current");
  });

  it("publication outside five backups cannot be restored", async () => {
    skipIfNeeded();
    await clearOrgPublications(orgA.id);
    await archiveDraftRestorations(orgA.id);
    const versions = await seedPublicationTimeline(orgA.id, churchA.id, 7, "Retention");
    publicationIds.beyondRetention = versions[0].id;

    const list = await loadGrowthRecentWebsiteChanges(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      organizationKey: ORG_KEY_A,
      env: baseEnv(),
    });
    assert.equal(list.ok, true);
    assert.equal(list.previousWebsites.length, GROWTH_PREVIOUS_LIMIT);
    assert.ok(
      !list.previousWebsites.some((item) => item.id === publicationIds.beyondRetention),
      "oldest publication should not appear in eligible previous list"
    );

    const res = await authedGet(
      HOST_A,
      `/hq/website/recent-changes/${publicationIds.beyondRetention}/restore`,
      users.hqA.rawToken
    );
    assert.equal(res.res.status, 404);
  });

  it("existing draft pages block restoration with draft_conflict", async () => {
    skipIfNeeded();
    await seedRestoreBaseline();
    await archiveDraftRestorations(orgA.id);
    await pool.query(
      `UPDATE blessboard.public_pages
          SET status = 'draft'
        WHERE church_id = $1
          AND branch_id IS NULL
          AND page_key = 'home'`,
      [churchA.id]
    );

    const { res, csrf, csrfCookie } = await authedGet(
      HOST_A,
      `/hq/website/recent-changes/${publicationIds.previousNewest}/restore`,
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-phase4-restore-conflict="1"/);

    const post = await postRestore(
      HOST_A,
      publicationIds.previousNewest,
      users.hqA.rawToken,
      {
        confirm_restore: "1",
        theme_choice: "keep_current",
      },
      csrf,
      csrfCookie
    );
    assert.equal(post.status, 303);
    assert.match(String(post.headers.location || ""), /error=/);

    const svc = await createGrowthRestoredWebsiteDraft(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      publicationId: publicationIds.previousNewest,
      actorUserId: users.hqA.user.id,
      confirmed: true,
      organizationKey: ORG_KEY_A,
      env: baseEnv(),
    });
    assert.equal(svc.ok, false);
    assert.equal(svc.reason, "draft_conflict");

    await resetPublicPagesPublished(churchA.id);
  });

  it("confirmation is required before creating restored draft", async () => {
    skipIfNeeded();
    await seedRestoreBaseline();
    await archiveDraftRestorations(orgA.id);

    const { csrf, csrfCookie } = await authedGet(
      HOST_A,
      `/hq/website/recent-changes/${publicationIds.previousNewest}/restore`,
      users.hqA.rawToken
    );

    const post = await postRestore(
      HOST_A,
      publicationIds.previousNewest,
      users.hqA.rawToken,
      { theme_choice: "keep_current" },
      csrf,
      csrfCookie
    );
    assert.equal(post.status, 303);
    assert.match(String(post.headers.location || ""), /error=/);

    const svc = await createGrowthRestoredWebsiteDraft(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      publicationId: publicationIds.previousNewest,
      actorUserId: users.hqA.user.id,
      confirmed: false,
      organizationKey: ORG_KEY_A,
      env: baseEnv(),
    });
    assert.equal(svc.ok, false);
    assert.equal(svc.reason, "confirmation");
  });

  it("POST restore requires CSRF", async () => {
    skipIfNeeded();
    const post = await request(app)
      .post(`/hq/website/recent-changes/${publicationIds.previousNewest}/restore`)
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken))
      .type("form")
      .send({
        confirm_restore: "1",
        theme_choice: "keep_current",
      });
    assert.equal(post.status, 403);
    assert.match(post.text, /CSRF/i);
  });

  it("valid POST creates one restored draft and redirects to restored-draft review", async () => {
    skipIfNeeded();
    await seedRestoreBaseline();
    await archiveDraftRestorations(orgA.id);

    const { csrf, csrfCookie } = await authedGet(
      HOST_A,
      `/hq/website/recent-changes/${publicationIds.previousNewest}/restore`,
      users.hqA.rawToken
    );
    assert.ok(csrf);

    const post = await postRestore(
      HOST_A,
      publicationIds.previousNewest,
      users.hqA.rawToken,
      {
        confirm_restore: "1",
        theme_choice: "keep_current",
        restoration_note: "Need the earlier hero copy back",
      },
      csrf,
      csrfCookie
    );
    assert.equal(post.status, 303);
    assert.equal(post.headers.location, "/hq/website/restored-draft");
    assert.equal(await countDraftRestorations(orgA.id), 1);

    const review = await authedGet(HOST_A, "/hq/website/restored-draft", users.hqA.rawToken);
    assert.equal(review.res.status, 200);
    assert.match(review.res.text, /Need the earlier hero copy back/);
  });

  it("repeated POST restore is idempotent without duplicate draft restoration rows", async () => {
    skipIfNeeded();
    const beforeCount = await countDraftRestorations(orgA.id);
    assert.equal(beforeCount, 1);

    const redirect = await authedGet(
      HOST_A,
      `/hq/website/recent-changes/${publicationIds.previousNewest}/restore`,
      users.hqA.rawToken
    );
    assert.equal(redirect.res.status, 303);
    assert.equal(redirect.res.headers.location, "/hq/website/restored-draft");

    const reviewPage = await authedGet(
      HOST_A,
      "/hq/website/restored-draft",
      users.hqA.rawToken
    );
    assert.ok(reviewPage.csrf, "expected CSRF on restored-draft review page");

    const post = await postRestore(
      HOST_A,
      publicationIds.previousNewest,
      users.hqA.rawToken,
      {
        confirm_restore: "1",
        theme_choice: "keep_current",
      },
      reviewPage.csrf,
      reviewPage.csrfCookie
    );
    assert.equal(post.status, 303);
    assert.equal(post.headers.location, "/hq/website/restored-draft");
    assert.equal(await countDraftRestorations(orgA.id), 1);

    const svc = await createGrowthRestoredWebsiteDraft(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      publicationId: publicationIds.previousNewest,
      actorUserId: users.hqA.user.id,
      confirmed: true,
      organizationKey: ORG_KEY_A,
      env: baseEnv(),
    });
    assert.equal(svc.ok, true);
    assert.equal(svc.idempotent, true);
  });

  it("live current published version id is unchanged after restore", async () => {
    skipIfNeeded();
    const before = await versionRepo.getCurrentPublishedVersion(pool, orgA.id);
    assert.ok(before && before.id);

    const { csrf, csrfCookie } = await authedGet(
      HOST_A,
      `/hq/website/recent-changes/${publicationIds.previousNewest}/restore`,
      users.hqA.rawToken
    );
    await postRestore(
      HOST_A,
      publicationIds.previousNewest,
      users.hqA.rawToken,
      { confirm_restore: "1", theme_choice: "keep_current" },
      csrf,
      csrfCookie
    );

    const after = await versionRepo.getCurrentPublishedVersion(pool, orgA.id);
    assert.equal(after && after.id, before.id);
  });

  it("historical snapshot is unchanged after restore", async () => {
    skipIfNeeded();
    const historical = await versionRepo.getVersionByOrgAndId(
      pool,
      orgA.id,
      publicationIds.previousNewest
    );
    assert.ok(historical);
    const snapshotBefore = JSON.stringify(historical.snapshot || {});

    const { csrf, csrfCookie } = await authedGet(
      HOST_A,
      `/hq/website/recent-changes/${publicationIds.previousNewest}/restore`,
      users.hqA.rawToken
    );
    await postRestore(
      HOST_A,
      publicationIds.previousNewest,
      users.hqA.rawToken,
      { confirm_restore: "1", theme_choice: "keep_current" },
      csrf,
      csrfCookie
    );

    const historicalAfter = await versionRepo.getVersionByOrgAndId(
      pool,
      orgA.id,
      publicationIds.previousNewest
    );
    assert.equal(JSON.stringify(historicalAfter.snapshot || {}), snapshotBefore);
  });

  it("theme keep_current vs use_previous is reflected on draftVersion.themeKey", async () => {
    skipIfNeeded();
    await clearOrgPublications(orgA.id);
    await archiveDraftRestorations(orgA.id);
    await resetPublicPagesPublished(churchA.id);

    const historical = await insertPublication({
      organizationId: orgA.id,
      churchId: churchA.id,
      themeKey: "classic",
      changeSummary: { publicationNote: "Classic theme era" },
      snapshot: {
        pages: [
          {
            pageKey: "home",
            title: "Home",
            sections: [{ sectionKey: "hero", heading: "Classic hero" }],
          },
        ],
      },
    });
    await versionRepo.supersedePublishedVersions(pool, orgA.id);
    await insertPublication({
      organizationId: orgA.id,
      churchId: churchA.id,
      themeKey: "modern",
      changeSummary: { publicationNote: "Modern theme live" },
      snapshot: {
        pages: [
          {
            pageKey: "home",
            title: "Home",
            sections: [{ sectionKey: "hero", heading: "Modern hero" }],
          },
        ],
      },
    });

    const keepCurrent = await createGrowthRestoredWebsiteDraft(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      publicationId: historical.id,
      actorUserId: users.hqA.user.id,
      themeChoice: "keep_current",
      confirmed: true,
      organizationKey: ORG_KEY_A,
      env: baseEnv(),
    });
    assert.equal(keepCurrent.ok, true);
    assert.equal(keepCurrent.themeChoice, "keep_current");
    assert.equal(keepCurrent.draftVersion.themeKey, "modern");

    await archiveDraftRestorations(orgA.id);
    await resetPublicPagesPublished(churchA.id);

    const usePrevious = await createGrowthRestoredWebsiteDraft(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      publicationId: historical.id,
      actorUserId: users.hqA.user.id,
      themeChoice: "use_previous",
      confirmed: true,
      organizationKey: ORG_KEY_A,
      env: baseEnv(),
    });
    assert.equal(usePrevious.ok, true);
    assert.equal(usePrevious.themeChoice, "use_previous");
    assert.equal(usePrevious.draftVersion.themeKey, "classic");
  });

  it("restored draft review shows stitch screen and live-unchanged notice", async () => {
    skipIfNeeded();
    const reviewSvc = await loadGrowthRestoredWebsiteDraftReview(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      organizationKey: ORG_KEY_A,
      actorUserId: users.hqA.user.id,
      env: baseEnv(),
    });
    assert.equal(reviewSvc.ok, true);
    assert.equal(reviewSvc.stitchScreen, "Phase4 - Restored Website Draft Review");
    assert.match(reviewSvc.safetyNotice, /live website has not changed/i);

    const { res } = await authedGet(HOST_A, "/hq/website/restored-draft", users.hqA.rawToken);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-phase4-restored-website-draft-review="1"/);
    assert.match(res.text, /data-bb-stitch-screen="Phase4 - Restored Website Draft Review"/);
    assert.match(res.text, /Your live website has not changed/);
  });

  it("restored draft review links Publish Draft to publish review", async () => {
    skipIfNeeded();
    const { res } = await authedGet(HOST_A, "/hq/website/restored-draft", users.hqA.rawToken);
    assert.equal(res.status, 200);
    assert.match(res.text, /href="\/hq\/website\/publish\/review"/);
    assert.match(res.text, />Publish Draft</);
  });

  it("audit records previous_website_restored_as_draft or version_restored", async () => {
    skipIfNeeded();
    const restoredAudit = await auditSvc.listWebsiteAuditEvents(pool, {
      organizationId: orgA.id,
      actionType: "previous_website_restored_as_draft",
    });
    assert.equal(restoredAudit.ok, true);
    assert.ok(restoredAudit.total >= 1);

    const versionAudit = await auditSvc.listWebsiteAuditEvents(pool, {
      organizationId: orgA.id,
      actionType: "version_restored",
    });
    assert.equal(versionAudit.ok, true);
    assert.ok(versionAudit.total >= 1);
  });

  it("escapes user-authored restoration note in review HTML", async () => {
    skipIfNeeded();
    await seedRestoreBaseline();
    await archiveDraftRestorations(orgA.id);
    const xssNote = '<script>alert("p4rp")</script>';

    const { csrf, csrfCookie } = await authedGet(
      HOST_A,
      `/hq/website/recent-changes/${publicationIds.previousNewest}/restore`,
      users.hqA.rawToken
    );
    await postRestore(
      HOST_A,
      publicationIds.previousNewest,
      users.hqA.rawToken,
      {
        confirm_restore: "1",
        theme_choice: "keep_current",
        restoration_note: xssNote,
      },
      csrf,
      csrfCookie
    );

    const { res } = await authedGet(HOST_A, "/hq/website/restored-draft", users.hqA.rawToken);
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /<script>alert\("p4rp"\)<\/script>/);
    assert.match(res.text, /&lt;script&gt;alert\(&#34;p4rp&#34;\)&lt;\/script&gt;/);
  });

  it("recent-changes page shows Restore as Draft link for previous cards", async () => {
    skipIfNeeded();
    await seedRestoreBaseline();

    const { res } = await authedGet(
      HOST_A,
      "/hq/website/recent-changes",
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(
      res.text,
      new RegExp(
        `href="/hq/website/recent-changes/${publicationIds.previousNewest}/restore"`
      )
    );
    assert.match(res.text, />Restore as Draft</);
  });

  it("discard restored draft redirects back to recent changes", async () => {
    skipIfNeeded();
    if ((await countDraftRestorations(orgA.id)) < 1) {
      await archiveDraftRestorations(orgA.id);
      await resetPublicPagesPublished(churchA.id);
      const { csrf, csrfCookie } = await authedGet(
        HOST_A,
        `/hq/website/recent-changes/${publicationIds.previousNewest}/restore`,
        users.hqA.rawToken
      );
      await postRestore(
        HOST_A,
        publicationIds.previousNewest,
        users.hqA.rawToken,
        { confirm_restore: "1", theme_choice: "keep_current" },
        csrf,
        csrfCookie
      );
    }
    assert.equal(await countDraftRestorations(orgA.id), 1);

    const { csrf, csrfCookie } = await authedGet(
      HOST_A,
      "/hq/website/restored-draft",
      users.hqA.rawToken
    );
    assert.ok(csrf);

    const discard = await request(app)
      .post("/hq/website/restored-draft/discard")
      .set("Host", HOST_A)
      .set("Cookie", cookieHeader(users.hqA.rawToken, csrfCookie))
      .type("form")
      .send({ [CSRF_FIELD]: csrf });
    assert.equal(discard.status, 303);
    assert.match(String(discard.headers.location || ""), /\/hq\/website\/recent-changes/);
    assert.equal(await countDraftRestorations(orgA.id), 0);

    const svc = await discardGrowthRestoredWebsiteDraft(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      actorUserId: users.hqA.user.id,
      env: baseEnv(),
    });
    assert.equal(svc.ok, false);
    assert.equal(svc.reason, "no_restored_draft");
  });
});
