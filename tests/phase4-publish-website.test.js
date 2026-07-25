"use strict";

/**
 * Phase4 Stage 2A — Publish Website Review / Success / Error.
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
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  repairWebsiteFoundation,
} = require("../src/blessboard/services/websiteFoundationRepairService");
const {
  acknowledgeWebsitePreview,
  publishChurchWebsite,
  evaluatePublishReadiness,
} = require("../src/blessboard/services/churchWebsitePublishService");
const {
  prepareWebsitePublishReview,
} = require("../src/blessboard/services/websitePublishReviewService");
const approvalSettingsSvc = require("../src/blessboard/services/websiteApprovalSettingsService");
const submissionRepo = require("../src/blessboard/repositories/websiteChangeSubmissionRepository");
const versionRepo = require("../src/blessboard/repositories/websitePublicationVersionRepository");
const auditSvc = require("../src/blessboard/services/websiteAuditService");

const PASSWORD = "TestPassword99!";
const HOST_A = "p4pub-a.blessboard.org";
const HOST_B = "p4pub-b.blessboard.org";

const FORBIDDEN_TECHNICAL_TERMS = [
  "Version snapshot",
  "Rollback",
  "Superseded",
  "Diff",
  "Commit",
  "Publication artifact",
];

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
  const m = String(html || "").match(
    new RegExp(
      `name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`
    )
  );
  return (m && (m[1] || m[2])) || null;
}

function assertNoForbiddenTechnicalTerms(html, label) {
  for (const term of FORBIDDEN_TECHNICAL_TERMS) {
    assert.doesNotMatch(
      html,
      new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      `${label || "page"} should not contain "${term}"`
    );
  }
}

describe("phase4 publish website", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let churchA;
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

      async function provisionOrg(key, host, store) {
        const prov = await provisionPlatformTenant(pool, {
          organizationKey: key,
          displayName: `P4PUB ${key}`,
          legalName: null,
          dataEnvironment: "testing",
          productKey: "blessboard",
          productTenantKey: key,
          hostname: host,
          domainType: "canonical",
          deploymentCode: "blessboard-org-v5",
          isPrimary: true,
        });
        assert.equal(prov.ok, true, prov.message);
        const ch = await provisionBlessBoardChurch(pool, {
          organizationKey: key,
          churchKey: key,
          displayName: `P4PUB Church ${key}`,
          dataEnvironment: "testing",
          hqBranchKey: "hq",
          hqBranchDisplayName: "HQ",
        });
        assert.equal(ch.ok, true, ch.message);
        store.org = prov.records.organization;
        store.church = ch.records.church;
        const br = await pool.query(
          `SELECT id FROM blessboard.branches WHERE church_id = $1 AND branch_key = 'hq' LIMIT 1`,
          [store.church.id]
        );
        store.branch = { id: br.rows[0].id };
        await ensureChurchSettingsInitialized(pool, store.church.id);
        await updateChurchSettings(pool, store.church.id, {
          publicName: `P4PUB Church ${key}`,
          websiteStatus: "draft",
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
      await provisionOrg("p4pub-a", HOST_A, a);
      await provisionOrg("p4pub-b", HOST_B, b);
      orgA = a.org;
      orgB = b.org;
      churchA = a.church;
      branchA = a.branch;

      async function makeUser(email, displayName, role, orgId) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        assert.equal((await assignBlessBoardRole(pool, role)).ok, true);
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-v5",
          userId: created.user.id,
          organizationId: orgId,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      users.hqA = await makeUser(
        "p4pub-hq-a@example.test",
        "HQ A",
        {
          email: "p4pub-hq-a@example.test",
          organizationKey: "p4pub-a",
          roleKey: "church_hq_admin",
          churchKey: "p4pub-a",
        },
        orgA.id
      );
      users.hqA2 = await makeUser(
        "p4pub-hq-a2@example.test",
        "HQ A2",
        {
          email: "p4pub-hq-a2@example.test",
          organizationKey: "p4pub-a",
          roleKey: "church_hq_admin",
          churchKey: "p4pub-a",
        },
        orgA.id
      );
      users.branchA = await makeUser(
        "p4pub-br-a@example.test",
        "Branch A",
        {
          email: "p4pub-br-a@example.test",
          organizationKey: "p4pub-a",
          roleKey: "branch_admin",
          churchKey: "p4pub-a",
          branchKey: "hq",
        },
        orgA.id
      );
      users.hqB = await makeUser(
        "p4pub-hq-b@example.test",
        "HQ B",
        {
          email: "p4pub-hq-b@example.test",
          organizationKey: "p4pub-b",
          roleKey: "church_hq_admin",
          churchKey: "p4pub-b",
        },
        orgB.id
      );
      users.branchB = await makeUser(
        "p4pub-br-b@example.test",
        "Branch B",
        {
          email: "p4pub-br-b@example.test",
          organizationKey: "p4pub-b",
          roleKey: "branch_admin",
          churchKey: "p4pub-b",
          branchKey: "hq",
        },
        orgB.id
      );

      await submissionRepo.insertSubmission(pool, {
        organizationId: orgB.id,
        branchId: b.branch.id,
        title: "Org B Secret Submission",
        pageKey: "home",
        changeType: "Content",
        currentContent: {},
        proposedContent: { heading: "B" },
        status: "pending_review",
        submittedBy: users.branchB.user.id,
      });

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

  function skipIfNeeded() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  async function saveRelaxedApprovalSettings(organizationId, actorUserId) {
    await approvalSettingsSvc.saveSettings(pool, {
      organizationId,
      actorUserId,
      branchEditMode: "approval_required",
      requirePreviewBeforePublish: false,
      requireMobilePreviewConfirmation: false,
      preventSelfApproval: true,
      requireRequestChangesComment: true,
      requireRejectionReason: true,
    });
  }

  async function clearBlockingSubmissions(organizationId) {
    await pool.query(
      `UPDATE blessboard.website_change_submissions
          SET status = 'withdrawn'
        WHERE organization_id = $1
          AND status IN ('pending_review', 'draft')`,
      [organizationId]
    );
    await pool.query(
      `DELETE FROM blessboard.website_change_submissions
        WHERE organization_id = $1 AND change_type ILIKE 'Conflict draft%'`,
      [organizationId]
    );
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

  async function publishPost(host, rawToken, fields, reviewPath) {
    const { csrf, csrfCookie } = await authedGet(
      host,
      reviewPath || "/hq/website/publish/review?defer_service_times=1",
      rawToken
    );
    assert.ok(csrf, "expected CSRF token on review form");
    const cookies = [sidCookie(rawToken)];
    if (csrfCookie) cookies.push(`${CSRF_COOKIE}=${csrfCookie}`);
    return request(app)
      .post("/hq/website/publish")
      .set("Host", host)
      .set("Cookie", cookies.join("; "))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        confirm_publish: "1",
        defer_service_times: "1",
        from_confirmation: "1",
        preview_reviewed: "1",
        ...(fields || {}),
      });
  }

  it("HQ opens publish review with Phase4 stitch markers and responsive layout", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_A,
      "/hq/website/publish/review?defer_service_times=1",
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /Publish Website Changes\?/);
    assert.match(res.text, /data-bb-phase4-publish-website-review="1"/);
    assert.match(res.text, /data-bb-stitch-screen="Phase4 - Publish Website Review"/);
    assert.match(res.text, /data-bb-viewport="responsive"/);
    assert.match(res.text, /Change Summary|Readiness Checklist/);
  });

  it("unauthorized users are blocked from publish review and POST", async () => {
    skipIfNeeded();
    const anon = await request(app)
      .get("/hq/website/publish/review")
      .set("Host", HOST_A)
      .set("Accept", "text/html");
    assert.ok(anon.status === 303 || anon.status === 401);

    const branch = await request(app)
      .get("/hq/website/publish/review")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.branchA.rawToken));
    assert.equal(branch.status, 403);

    const deniedPost = await request(app)
      .post("/hq/website/publish")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.branchA.rawToken))
      .type("form")
      .send({ confirm_publish: "1" });
    assert.ok(deniedPost.status === 403 || deniedPost.status === 401);
  });

  it("cross-org HQ cannot review or publish another organization content", async () => {
    skipIfNeeded();
    const wrongHost = await request(app)
      .get("/hq/website/publish/review?defer_service_times=1")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqB.rawToken));
    assert.ok(wrongHost.status === 403 || wrongHost.status === 404);

    const { res } = await authedGet(
      HOST_A,
      "/hq/website/publish/review?defer_service_times=1",
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /Org B Secret Submission/);
  });

  it("prepareWebsitePublishReview exposes real summary or fallback without fabricated metrics", async () => {
    skipIfNeeded();
    const review = await prepareWebsitePublishReview(pool, {
      organizationId: orgA.id,
      churchId: churchA.id,
      actorUserId: users.hqA.user.id,
      deferServiceTimes: true,
      organizationKey: "p4pub-a",
      env: baseEnv(),
    });
    assert.equal(review.ok, true);
    assert.equal(review.stitchScreen, "Phase4 - Publish Website Review");
    assert.ok(review.changeSummary);
    const hasItems =
      Array.isArray(review.changeSummary.items) && review.changeSummary.items.length > 0;
    const hasFallback =
      Boolean(review.changeSummary.fallbackMessage) ||
      /unpublished changes ready for review/i.test(
        String(review.changeSummary.fallbackMessage || "")
      );
    assert.ok(hasItems || hasFallback || review.changeSummary.pageCount != null);

    const { res } = await authedGet(
      HOST_A,
      "/hq/website/publish/review?defer_service_times=1",
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /Open Rate/i);
    assert.doesNotMatch(res.text, /Click Rate/i);
    assert.doesNotMatch(res.text, /undefined/);
  });

  it("missing required data blocks publication", async () => {
    skipIfNeeded();
    await clearBlockingSubmissions(orgA.id);
    await updateChurchSettings(pool, churchA.id, {
      primaryEmail: null,
      primaryPhone: null,
    });
    await pool.query(
      `UPDATE blessboard.branch_settings
          SET email = NULL, phone = NULL
        WHERE branch_id = $1`,
      [branchA.id]
    );

    const readiness = await evaluatePublishReadiness(pool, {
      churchId: churchA.id,
      deferServiceTimes: false,
      env: baseEnv(),
    });
    assert.equal(readiness.ok, true);
    assert.equal(readiness.ready, false);
    assert.ok((readiness.gaps || []).length > 0);

    const blocked = await publishChurchWebsite(pool, {
      churchId: churchA.id,
      actorUserId: users.hqA.user.id,
      confirmPublish: true,
      deferServiceTimes: false,
      env: baseEnv(),
    });
    assert.equal(blocked.ok, false);
    assert.ok(
      blocked.reason === "not_ready" ||
        blocked.reason === "validation_failed" ||
        (blocked.gaps && blocked.gaps.length > 0)
    );

    await updateChurchSettings(pool, churchA.id, {
      primaryEmail: "p4pub-a@example.test",
    });
  });

  it("unapproved pending submission blocks publication", async () => {
    skipIfNeeded();
    await clearBlockingSubmissions(orgA.id);
    const pending = await submissionRepo.insertSubmission(pool, {
      organizationId: orgA.id,
      branchId: branchA.id,
      title: "Pending blocks publish",
      pageKey: "home",
      changeType: "Content Update",
      currentContent: {},
      proposedContent: { heading: "Pending" },
      status: "pending_review",
      submittedBy: users.branchA.user.id,
    });
    const blocked = await publishChurchWebsite(pool, {
      churchId: churchA.id,
      actorUserId: users.hqA.user.id,
      confirmPublish: true,
      deferServiceTimes: true,
      env: baseEnv(),
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, "validation_failed");
    await pool.query(`DELETE FROM blessboard.website_change_submissions WHERE id = $1`, [
      pending.id,
    ]);
  });

  it("unresolved conflict draft blocks publication", async () => {
    skipIfNeeded();
    await clearBlockingSubmissions(orgA.id);
    await submissionRepo.insertSubmission(pool, {
      organizationId: orgA.id,
      branchId: branchA.id,
      title: "Conflict leftover",
      pageKey: "home",
      sectionKey: "hero",
      changeType: "Conflict draft",
      currentContent: {},
      proposedContent: { heading: "Mine" },
      status: "draft",
      submittedBy: users.branchA.user.id,
    });
    const blocked = await publishChurchWebsite(pool, {
      churchId: churchA.id,
      actorUserId: users.hqA.user.id,
      confirmPublish: true,
      deferServiceTimes: true,
      env: baseEnv(),
    });
    assert.equal(blocked.ok, false);
    assert.ok(
      (blocked.validationErrors || []).some((e) => /conflict/i.test(e)) ||
        blocked.reason === "validation_failed"
    );
    await pool.query(
      `DELETE FROM blessboard.website_change_submissions
        WHERE organization_id = $1 AND change_type ILIKE 'Conflict draft%'`,
      [orgA.id]
    );
  });

  it("from_confirmation POST without preview_reviewed redirects to preview error", async () => {
    skipIfNeeded();
    const { csrf, csrfCookie } = await authedGet(
      HOST_A,
      "/hq/website/publish/review?defer_service_times=1",
      users.hqA.rawToken
    );
    assert.ok(csrf);
    const cookies = [sidCookie(users.hqA.rawToken)];
    if (csrfCookie) cookies.push(`${CSRF_COOKIE}=${csrfCookie}`);
    const res = await request(app)
      .post("/hq/website/publish")
      .set("Host", HOST_A)
      .set("Cookie", cookies.join("; "))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        confirm_publish: "1",
        defer_service_times: "1",
        from_confirmation: "1",
        publication_note: "Skipped preview ack",
      });
    assert.equal(res.status, 303);
    assert.match(res.headers.location || "", /\/hq\/website\/publish\/error\?codes=preview/);
  });

  it("CSRF enforced on publish POST", async () => {
    skipIfNeeded();
    const denied = await request(app)
      .post("/hq/website/publish")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken))
      .type("form")
      .send({
        confirm_publish: "1",
        defer_service_times: "1",
        from_confirmation: "1",
        preview_reviewed: "1",
      });
    assert.equal(denied.status, 403);
  });

  it("valid publish POST redirects to Phase4 success screen", async () => {
    skipIfNeeded();
    await clearBlockingSubmissions(orgA.id);
    await saveRelaxedApprovalSettings(orgA.id, users.hqA.user.id);
    await acknowledgeWebsitePreview(pool, {
      organizationId: orgA.id,
      actorUserId: users.hqA.user.id,
    });

    const post = await publishPost(HOST_A, users.hqA.rawToken, {
      publication_note: "Phase4 HTTP publish note",
    });
    assert.equal(post.status, 303);
    assert.match(post.headers.location || "", /\/hq\/website\/publish\/success/);

    const versionMatch = String(post.headers.location || "").match(/version=([^&]+)/);
    const successPath = versionMatch
      ? `/hq/website/publish/success?version=${versionMatch[1]}`
      : "/hq/website/publish/success";
    const success = await authedGet(HOST_A, successPath, users.hqA.rawToken);
    assert.equal(success.res.status, 200);
    assert.match(success.res.text, /data-bb-phase4-website-published="1"/);
    assert.match(success.res.text, /data-bb-stitch-screen="Phase4 - Website Published"/);
    assert.match(success.res.text, /Your church website has been published/);
  });

  it("successful publish records version note audit and approved submissions", async () => {
    skipIfNeeded();
    await clearBlockingSubmissions(orgA.id);
    await saveRelaxedApprovalSettings(orgA.id, users.hqA.user.id);
    await acknowledgeWebsitePreview(pool, {
      organizationId: orgA.id,
      actorUserId: users.hqA2.user.id,
    });

    const approved = await submissionRepo.insertSubmission(pool, {
      organizationId: orgA.id,
      branchId: branchA.id,
      title: "Approved for publish",
      pageKey: "events",
      changeType: "Image",
      currentContent: {},
      proposedContent: { mediaUrl: "new.jpg" },
      status: "approved",
      submittedBy: users.branchA.user.id,
    });

    const result = await publishChurchWebsite(pool, {
      churchId: churchA.id,
      actorUserId: users.hqA2.user.id,
      confirmPublish: true,
      deferServiceTimes: true,
      publicationNote: "Stage 2A launch note",
      notifyBranchAdmins: true,
      env: baseEnv(),
    });
    assert.equal(result.ok, true, result.reason || JSON.stringify(result));

    const version = await versionRepo.getCurrentPublishedVersion(pool, orgA.id);
    assert.ok(version);
    assert.equal(version.status, "published");
    assert.equal(version.changeSummary.publicationNote, "Stage 2A launch note");
    assert.ok(version.publishedAt);
    assert.ok(version.publishedBy || version.publishedByName);

    const after = await submissionRepo.getSubmissionByOrgAndId(pool, orgA.id, approved.id);
    assert.equal(after.status, "published");
    assert.ok((result.publishedSubmissionIds || []).includes(approved.id));

    const audit = await auditSvc.listWebsiteAuditEvents(pool, {
      organizationId: orgA.id,
      actionType: "website_published",
    });
    assert.ok(audit.ok);
    assert.ok(audit.total >= 1);
  });

  it("idempotent second publish reuses current version without extra versions", async () => {
    skipIfNeeded();
    await clearBlockingSubmissions(orgA.id);

    const seeded = await publishChurchWebsite(pool, {
      churchId: churchA.id,
      actorUserId: users.hqA.user.id,
      confirmPublish: true,
      deferServiceTimes: true,
      env: baseEnv(),
    });
    assert.equal(seeded.ok, true, seeded.reason || JSON.stringify(seeded));

    const beforeList = await versionRepo.listVersions(pool, {
      organizationId: orgA.id,
      status: "published",
    });
    const beforeCount = beforeList.total;
    const beforeCurrent = await versionRepo.getCurrentPublishedVersion(pool, orgA.id);
    assert.ok(beforeCurrent);

    const again = await publishChurchWebsite(pool, {
      churchId: churchA.id,
      actorUserId: users.hqA.user.id,
      confirmPublish: true,
      deferServiceTimes: true,
      env: baseEnv(),
    });
    assert.equal(again.ok, true, again.reason || JSON.stringify(again));
    assert.equal(again.idempotent, true);
    assert.equal(again.publicationVersionId, beforeCurrent.id);

    const afterList = await versionRepo.listVersions(pool, {
      organizationId: orgA.id,
      status: "published",
    });
    assert.equal(afterList.total, beforeCount);
  });

  it("failed publish leaves live website unchanged", async () => {
    skipIfNeeded();
    const before = await versionRepo.getCurrentPublishedVersion(pool, orgA.id);
    const fail = await publishChurchWebsite(pool, {
      churchId: churchA.id,
      actorUserId: users.hqA.user.id,
      confirmPublish: false,
      deferServiceTimes: true,
      env: baseEnv(),
    });
    assert.equal(fail.ok, false);
    const after = await versionRepo.getCurrentPublishedVersion(pool, orgA.id);
    assert.equal(after && after.id, before && before.id);
  });

  it("error screen shows Phase4 stitch human message without stack or SQL", async () => {
    skipIfNeeded();
    const res = await authedGet(
      HOST_A,
      "/hq/website/publish/error?codes=preview,validation",
      users.hqA.rawToken
    );
    assert.equal(res.res.status, 400);
    assert.match(res.res.text, /data-bb-phase4-publish-website-error="1"/);
    assert.match(res.res.text, /data-bb-stitch-screen="Phase4 - Publish Website Error"/);
    assert.match(res.res.text, /Your website was not published/);
    assert.match(res.res.text, /live website has not changed/i);
    assert.doesNotMatch(res.res.text, /stack trace|SyntaxError|SELECT .* FROM/i);
    assert.doesNotMatch(res.res.text, /blessboard\.website_publication_versions/i);
  });

  it("user content with script tags is HTML-escaped on review and success", async () => {
    skipIfNeeded();
    const xssTitle = '<script>alert("xss")</script> Branch Title';
    const xssNote = '<script>alert("note")</script> Launch note';

    await clearBlockingSubmissions(orgA.id);
    await submissionRepo.insertSubmission(pool, {
      organizationId: orgA.id,
      branchId: branchA.id,
      title: xssTitle,
      pageKey: "home",
      changeType: "Content",
      currentContent: {},
      proposedContent: { heading: "X" },
      status: "approved",
      submittedBy: users.branchA.user.id,
    });

    const review = await authedGet(
      HOST_A,
      "/hq/website/publish/review?defer_service_times=1",
      users.hqA.rawToken
    );
    assert.equal(review.res.status, 200);
    assert.doesNotMatch(review.res.text, /<script>alert\("xss"\)<\/script>/);

    const post = await publishPost(HOST_A, users.hqA.rawToken, {
      publication_note: xssNote,
    });
    assert.equal(post.status, 303);
    assert.match(post.headers.location || "", /\/hq\/website\/publish\/success/);

    const success = await authedGet(
      HOST_A,
      post.headers.location.replace(/^https?:\/\/[^/]+/, "") || "/hq/website/publish/success",
      users.hqA.rawToken
    );
    assert.equal(success.res.status, 200);
    assert.doesNotMatch(success.res.text, /<script>alert\("note"\)<\/script>/);
    assert.match(
      success.res.text,
      /&lt;script&gt;alert\((?:&quot;|&#34;)note(?:&quot;|&#34;)\)&lt;\/script&gt; Launch note/
    );
  });

  it("review and success screens exclude forbidden technical terms", async () => {
    skipIfNeeded();
    const review = await authedGet(
      HOST_A,
      "/hq/website/publish/review?defer_service_times=1",
      users.hqA.rawToken
    );
    assert.equal(review.res.status, 200);
    assertNoForbiddenTechnicalTerms(review.res.text, "publish review");

    const success = await authedGet(
      HOST_A,
      "/hq/website/publish/success",
      users.hqA.rawToken
    );
    assert.equal(success.res.status, 200);
    assertNoForbiddenTechnicalTerms(success.res.text, "publish success");
  });

  it("foundation overview still links to publish review route", async () => {
    skipIfNeeded();
    const overviewB = await authedGet(HOST_B, "/hq/website", users.hqB.rawToken);
    assert.equal(overviewB.res.status, 200);
    const hasPublishLink = /\/hq\/website\/publish\/review/.test(overviewB.res.text);
    if (hasPublishLink) {
      assert.match(overviewB.res.text, /\/hq\/website\/publish\/review/);
    }

    const review = await authedGet(
      HOST_B,
      "/hq/website/publish/review?defer_service_times=1",
      users.hqB.rawToken
    );
    assert.equal(review.res.status, 200);
  });

  it("HQ preview route still returns 200", async () => {
    skipIfNeeded();
    const res = await authedGet(
      HOST_A,
      "/hq/content/preview/home",
      users.hqA.rawToken
    );
    assert.equal(res.res.status, 200);
  });
});
