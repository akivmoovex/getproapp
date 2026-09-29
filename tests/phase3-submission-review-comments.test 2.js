"use strict";

/**
 * Phase3 Submission Review Comments.
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
const submissionRepo = require("../src/blessboard/repositories/websiteChangeSubmissionRepository");
const svc = require("../src/blessboard/services/websiteChangeSubmissionService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const HOST_A = "src-a.blessboard.org";
const HOST_B = "src-b.blessboard.org";

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

describe("phase3 submission review comments", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let users = {};
  let branchAId;
  let branchBId;
  let submissionId;
  let otherBranchSubmissionId;

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
          displayName: `SRC ${key}`,
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
          displayName: `SRC Church ${key}`,
          dataEnvironment: "testing",
          hqBranchKey: "hq",
          hqBranchDisplayName: "HQ",
        });
        assert.equal(ch.ok, true, ch.message);
        store.org = prov.records.organization;
        store.church = ch.records.church;
        store.branch = ch.records.hqBranch || ch.records.branch;
        await ensureChurchSettingsInitialized(pool, store.church.id);
        await updateChurchSettings(pool, store.church.id, {
          publicName: `SRC Church ${key}`,
          websiteStatus: "draft",
          primaryEmail: `${key}@example.test`,
        });
        await repairWebsiteFoundation(pool, { churchId: store.church.id });
      }

      const a = {};
      const b = {};
      await provision("src-a", HOST_A, a);
      await provision("src-b", HOST_B, b);
      orgA = a.org;
      orgB = b.org;

      const branchRows = await pool.query(
        `SELECT b.id, c.organization_id
           FROM blessboard.branches b
           INNER JOIN blessboard.churches c ON c.id = b.church_id
          WHERE c.organization_id = ANY($1::uuid[])
          ORDER BY b.is_primary DESC`,
        [[orgA.id, orgB.id]]
      );
      branchAId = branchRows.rows.find((r) => r.organization_id === orgA.id).id;
      branchBId = branchRows.rows.find((r) => r.organization_id === orgB.id).id;

      // Second branch under org A for cross-branch isolation
      const second = await pool.query(
        `INSERT INTO blessboard.branches (church_id, branch_key, display_name, status, is_primary, branch_type)
         SELECT c.id, 'east', 'East Branch', 'active', false, 'branch'
           FROM blessboard.churches c WHERE c.organization_id = $1
         RETURNING id`,
        [orgA.id]
      );
      const eastBranchId = second.rows[0].id;

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
        "src-hq-a@example.test",
        "HQ A",
        {
          email: "src-hq-a@example.test",
          organizationKey: "src-a",
          roleKey: "church_hq_admin",
          churchKey: "src-a",
        },
        orgA.id
      );
      users.branchA = await makeUser(
        "src-br-a@example.test",
        "Branch A",
        {
          email: "src-br-a@example.test",
          organizationKey: "src-a",
          roleKey: "branch_admin",
          churchKey: "src-a",
          branchKey: "hq",
        },
        orgA.id
      );
      users.branchEast = await makeUser(
        "src-br-east@example.test",
        "Branch East",
        {
          email: "src-br-east@example.test",
          organizationKey: "src-a",
          roleKey: "branch_admin",
          churchKey: "src-a",
          branchKey: "east",
        },
        orgA.id
      );

      const created = await submissionRepo.insertSubmission(pool, {
        organizationId: orgA.id,
        branchId: branchAId,
        title: "Comment thread submission",
        pageKey: "home",
        sectionKey: "hero",
        changeType: "Content Update",
        currentContent: { heading: "Old" },
        proposedContent: { heading: "New" },
        reason: "Need review comments",
        submitterNote: null,
        status: "pending_review",
        submittedBy: users.branchA.user.id,
      });
      await submissionRepo.appendEvent(pool, {
        submissionId: created.id,
        organizationId: orgA.id,
        actorUserId: users.branchA.user.id,
        eventType: "submitted",
        comment: "Ready for review",
      });
      submissionId = created.id;

      const other = await submissionRepo.insertSubmission(pool, {
        organizationId: orgA.id,
        branchId: eastBranchId,
        title: "Other branch submission",
        pageKey: "about",
        sectionKey: null,
        changeType: "Content Update",
        currentContent: {},
        proposedContent: { heading: "East" },
        reason: "East only",
        status: "pending_review",
        submittedBy: users.branchEast.user.id,
      });
      otherBranchSubmissionId = other.id;

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

  it("HQ can add shared and internal comments", async () => {
    skipIfNeeded();
    const shared = await svc.addSubmissionComment(pool, {
      organizationId: orgA.id,
      submissionId,
      actorUserId: users.hqA.user.id,
      comment: "Please clarify the heading",
      visibility: "shared",
      allowInternal: true,
    });
    assert.equal(shared.ok, true, shared.reason);

    const internal = await svc.addSubmissionComment(pool, {
      organizationId: orgA.id,
      submissionId,
      actorUserId: users.hqA.user.id,
      comment: "Internal: reject if still weak",
      visibility: "hq_internal",
      allowInternal: true,
    });
    assert.equal(internal.ok, true, internal.reason);

    const hqView = await request(app)
      .get(`/hq/website/change-submissions/${submissionId}/comments`)
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken));
    assert.equal(hqView.status, 200);
    assert.match(hqView.text, /Please clarify the heading/);
    assert.match(hqView.text, /Internal: reject if still weak/);
    assert.match(hqView.text, /HQ internal/);
    assert.match(hqView.text, /Submitted/);
  });

  it("branch can add shared comment but not internal", async () => {
    skipIfNeeded();
    const shared = await svc.addSubmissionComment(pool, {
      organizationId: orgA.id,
      branchId: branchAId,
      submissionId,
      actorUserId: users.branchA.user.id,
      comment: "Updated copy attached",
      visibility: "shared",
      allowInternal: false,
    });
    assert.equal(shared.ok, true, shared.reason);

    const denied = await svc.addSubmissionComment(pool, {
      organizationId: orgA.id,
      branchId: branchAId,
      submissionId,
      actorUserId: users.branchA.user.id,
      comment: "Should not store",
      visibility: "hq_internal",
      allowInternal: false,
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.status, svc.STATUS.FORBIDDEN);

    const branchView = await request(app)
      .get(`/branch-admin/website/submissions/${submissionId}/comments`)
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.branchA.rawToken));
    assert.equal(branchView.status, 200);
    assert.match(branchView.text, /Updated copy attached/);
    assert.doesNotMatch(branchView.text, /Internal: reject if still weak/);
  });

  it("cross-branch access returns 404", async () => {
    skipIfNeeded();
    const res = await request(app)
      .get(`/branch-admin/website/submissions/${otherBranchSubmissionId}/comments`)
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.branchA.rawToken));
    assert.equal(res.status, 404);
  });

  it("empty comments rejected and content escaped", async () => {
    skipIfNeeded();
    const empty = await svc.addSubmissionComment(pool, {
      organizationId: orgA.id,
      submissionId,
      actorUserId: users.hqA.user.id,
      comment: "   ",
      visibility: "shared",
      allowInternal: true,
    });
    assert.equal(empty.ok, false);

    await svc.addSubmissionComment(pool, {
      organizationId: orgA.id,
      submissionId,
      actorUserId: users.hqA.user.id,
      comment: '<script>alert("x")</script>',
      visibility: "shared",
      allowInternal: true,
    });
    const res = await request(app)
      .get(`/hq/website/change-submissions/${submissionId}/comments`)
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken));
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /<script>alert\("x"\)<\/script>/);
  });

  it("CSRF enforced on comment POST", async () => {
    skipIfNeeded();
    const res = await request(app)
      .post(`/hq/website/change-submissions/${submissionId}/comments`)
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken))
      .type("form")
      .send({ comment: "no csrf" });
    assert.equal(res.status, 403);
  });

  it("HQ comment POST with CSRF succeeds", async () => {
    skipIfNeeded();
    const form = await request(app)
      .get(`/hq/website/change-submissions/${submissionId}/comments`)
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken));
    const csrf = extractCsrfToken(form.text);
    const csrfCookie = extractCookie(form, CSRF_COOKIE);
    const post = await request(app)
      .post(`/hq/website/change-submissions/${submissionId}/comments`)
      .set("Host", HOST_A)
      .set("Cookie", `${sidCookie(users.hqA.rawToken)}; ${CSRF_COOKIE}=${csrfCookie}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        comment: "Posted via form",
      });
    assert.equal(post.status, 303);
  });
});
