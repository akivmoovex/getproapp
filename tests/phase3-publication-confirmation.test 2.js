"use strict";

/**
 * Phase3 Publication Confirmation (Batch C screen 12).
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
} = require("../src/blessboard/services/churchWebsitePublishService");
const versionRepo = require("../src/blessboard/repositories/websitePublicationVersionRepository");
const submissionRepo = require("../src/blessboard/repositories/websiteChangeSubmissionRepository");
const auditSvc = require("../src/blessboard/services/websiteAuditService");
const approvalSettingsSvc = require("../src/blessboard/services/websiteApprovalSettingsService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const HOST_A = "pubc-a.blessboard.org";
const HOST_B = "pubc-b.blessboard.org";

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

function sidCookie(rawToken) {
  return `${DEFAULT_V5_COOKIE}=${rawToken}`;
}

describe("phase3 publication confirmation", () => {
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

      async function provision(key, host, store) {
        const prov = await provisionPlatformTenant(pool, {
          organizationKey: key,
          displayName: `PUBC ${key}`,
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
          displayName: `PUBC Church ${key}`,
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
          publicName: `PUBC Church ${key}`,
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
      await provision("pubc-a", HOST_A, a);
      await provision("pubc-b", HOST_B, b);
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
          deploymentCode: "blessboard-org-staging",
          userId: created.user.id,
          organizationId: orgId,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      users.hqA = await makeUser(
        "pubc-hq-a@example.test",
        "HQ A",
        {
          email: "pubc-hq-a@example.test",
          organizationKey: "pubc-a",
          roleKey: "church_hq_admin",
          churchKey: "pubc-a",
        },
        orgA.id
      );
      users.hqA2 = await makeUser(
        "pubc-hq-a2@example.test",
        "HQ A2",
        {
          email: "pubc-hq-a2@example.test",
          organizationKey: "pubc-a",
          roleKey: "church_hq_admin",
          churchKey: "pubc-a",
        },
        orgA.id
      );
      users.branchA = await makeUser(
        "pubc-br-a@example.test",
        "Branch A",
        {
          email: "pubc-br-a@example.test",
          organizationKey: "pubc-a",
          roleKey: "branch_admin",
          churchKey: "pubc-a",
          branchKey: "hq",
        },
        orgA.id
      );
      users.hqB = await makeUser(
        "pubc-hq-b@example.test",
        "HQ B",
        {
          email: "pubc-hq-b@example.test",
          organizationKey: "pubc-b",
          roleKey: "church_hq_admin",
          churchKey: "pubc-b",
        },
        orgB.id
      );

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

  it("HQ can open publication review", async () => {
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
    assert.match(res.text, /Change Summary|unpublished changes ready for review/i);
    assert.match(res.text, /Pages changed|Sections changed|Readiness Checklist/);
  });

  it("unauthorized users blocked", async () => {
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
  });

  it("real change counts render", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_A,
      "/hq/website/publish/review?defer_service_times=1",
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /Readiness Checklist|Change Summary|Sections changed|unpublished changes ready for review/i);
    assert.doesNotMatch(res.text, /undefined/);
  });

  it("validation errors block publication", async () => {
    skipIfNeeded();
    await approvalSettingsSvc.saveSettings(pool, {
      organizationId: orgA.id,
      actorUserId: users.hqA.user.id,
      branchEditMode: "approval_required",
      requirePreviewBeforePublish: true,
      requireMobilePreviewConfirmation: true,
      preventSelfApproval: true,
      requireRequestChangesComment: true,
      requireRejectionReason: true,
    });
    const blocked = await publishChurchWebsite(pool, {
      churchId: churchA.id,
      actorUserId: users.hqA.user.id,
      confirmPublish: true,
      deferServiceTimes: true,
      mobilePreviewConfirmed: false,
      env: baseEnv(),
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, "validation_failed");
  });

  it("unresolved conflict blocks publication", async () => {
    skipIfNeeded();
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
      mobilePreviewConfirmed: true,
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

  it("unapproved submission blocks publication", async () => {
    skipIfNeeded();
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
      mobilePreviewConfirmed: true,
      env: baseEnv(),
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, "validation_failed");
    await pool.query(`DELETE FROM blessboard.website_change_submissions WHERE id = $1`, [
      pending.id,
    ]);
  });

  it("successful publish creates version, marks submissions, supersedes, audits, note", async () => {
    skipIfNeeded();
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
    await acknowledgeWebsitePreview(pool, {
      organizationId: orgA.id,
      actorUserId: users.hqA.user.id,
    });

    const first = await publishChurchWebsite(pool, {
      churchId: churchA.id,
      actorUserId: users.hqA.user.id,
      confirmPublish: true,
      deferServiceTimes: true,
      publicationNote: "Batch C launch note",
      notifyBranchAdmins: true,
      env: baseEnv(),
    });
    assert.equal(first.ok, true, first.reason || JSON.stringify(first));
    const v1 = await versionRepo.getCurrentPublishedVersion(pool, orgA.id);
    assert.ok(v1);
    assert.equal(v1.status, "published");
    assert.equal(v1.changeSummary.publicationNote, "Batch C launch note");

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

    const second = await publishChurchWebsite(pool, {
      churchId: churchA.id,
      actorUserId: users.hqA.user.id,
      confirmPublish: true,
      deferServiceTimes: true,
      publicationNote: "Includes approved",
      env: baseEnv(),
    });
    assert.equal(second.ok, true, second.reason || JSON.stringify(second));
    assert.ok((second.publishedSubmissionIds || []).includes(approved.id));

    const after = await submissionRepo.getSubmissionByOrgAndId(
      pool,
      orgA.id,
      approved.id
    );
    assert.equal(after.status, "published");

    const prior = await versionRepo.getVersionByOrgAndId(pool, orgA.id, v1.id);
    assert.equal(prior.status, "superseded");

    const audit = await auditSvc.listWebsiteAuditEvents(pool, {
      organizationId: orgA.id,
      actionType: "website_published",
    });
    assert.ok(audit.ok);
    assert.ok(audit.total >= 1);
  });

  it("failure leaves live website unchanged", async () => {
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
      });
    assert.equal(denied.status, 403);

    const { res: formRes, csrf, csrfCookie } = await authedGet(
      HOST_A,
      "/hq/website/publish/review?defer_service_times=1",
      users.hqA.rawToken
    );
    assert.equal(formRes.status, 200);
    assert.ok(csrf);
    const cookies = [sidCookie(users.hqA.rawToken)];
    if (csrfCookie) cookies.push(`${CSRF_COOKIE}=${csrfCookie}`);
    const ok = await request(app)
      .post("/hq/website/publish")
      .set("Host", HOST_A)
      .set("Cookie", cookies.join("; "))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        confirm_publish: "1",
        defer_service_times: "1",
        from_confirmation: "1",
        preview_reviewed: "1",
        publication_note: "From confirmation UI",
      });
    assert.ok(ok.status === 303 || ok.status === 400);
    if (ok.status === 303) {
      assert.match(ok.headers.location || "", /publish\/(success|result|error)/);
    }
  });
});
