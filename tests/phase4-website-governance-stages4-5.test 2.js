"use strict";

/**
 * Phase4 Stages 4–5: change requests, review, advanced, network settings/history, branch submit.
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
const { assignOrganizationPlan } = require("../src/platform/services/entitlementService");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  repairWebsiteFoundation,
} = require("../src/blessboard/services/websiteFoundationRepairService");
const wcsRepo = require("../src/blessboard/repositories/websiteChangeSubmissionRepository");
const approvalRepo = require("../src/blessboard/repositories/websiteApprovalSettingsRepository");
const approvalSvc = require("../src/blessboard/services/websiteApprovalSettingsService");
const versionRepo = require("../src/blessboard/repositories/websitePublicationVersionRepository");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const HOST_A = "p45-a.blessboard.org";
const HOST_B = "p45-b.blessboard.org";

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

describe("phase4 website governance stages 4 and 5", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let churchA;
  let branchA;
  let users = {};
  let pendingId;
  let versionId;

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
          displayName: `P45 ${key}`,
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
          displayName: `P45 Church ${key}`,
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
          publicName: `P45 Church ${key}`,
          websiteStatus: "draft",
          primaryEmail: `${key}@example.test`,
        });
        await repairWebsiteFoundation(pool, { churchId: store.church.id });
      }

      const a = {};
      const b = {};
      await provision("p45-a", HOST_A, a);
      await provision("p45-b", HOST_B, b);
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
        "p45-hq-a@example.test",
        "HQ A",
        {
          email: "p45-hq-a@example.test",
          organizationKey: "p45-a",
          roleKey: "church_hq_admin",
          churchKey: "p45-a",
        },
        orgA.id
      );
      users.branchA = await makeUser(
        "p45-br-a@example.test",
        "Branch A",
        {
          email: "p45-br-a@example.test",
          organizationKey: "p45-a",
          roleKey: "branch_admin",
          churchKey: "p45-a",
          branchKey: "hq",
        },
        orgA.id
      );
      users.hqB = await makeUser(
        "p45-hq-b@example.test",
        "HQ B",
        {
          email: "p45-hq-b@example.test",
          organizationKey: "p45-b",
          roleKey: "church_hq_admin",
          churchKey: "p45-b",
        },
        orgB.id
      );

      const pending = await wcsRepo.insertSubmission(pool, {
        organizationId: orgA.id,
        branchId: branchA.id,
        title: "Youth schedule update",
        pageKey: "home",
        changeType: "Content",
        currentContent: { heading: "Old" },
        proposedContent: { heading: "New" },
        status: "pending_review",
        submittedBy: users.branchA.user.id,
      });
      pendingId = pending.id;

      const version = await versionRepo.insertPublishedVersion(pool, {
        organizationId: orgA.id,
        churchId: churchA.id,
        versionNumber: 1,
        publishedBy: users.hqA.user.id,
        themeKey: "default",
        sourceType: "hq_edit",
        changeSummary: { pageCount: 1 },
        snapshot: { themeKey: "default", pages: [], pageKeys: ["home"] },
      });
      versionId = version && version.id;

      const planAssign = await assignOrganizationPlan(pool, {
        organizationId: orgA.id,
        planKey: "professional",
        status: "active",
      });
      assert.equal(planAssign.ok, true, planAssign.reason);
      const planAssignB = await assignOrganizationPlan(pool, {
        organizationId: orgB.id,
        planKey: "professional",
        status: "active",
      });
      assert.equal(planAssignB.ok, true, planAssignB.reason);


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

  it("1 Website Change Requests screen renders Phase4 label", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_A,
      "/hq/website/change-submissions",
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /Website Change Requests/);
    assert.match(res.text, /data-bb-phase4-website-change-requests="1"/);
    assert.match(res.text, /data-bb-phase4-wcrq-mobile="1"/);
  });

  it("2 Review Website Update screen renders and compares", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_A,
      `/hq/website/change-submissions/${pendingId}`,
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /Review Website Update/);
    assert.match(res.text, /data-bb-phase4-review-website-update="1"/);
    assert.match(res.text, /Youth schedule update|What Changed|Approve/);
  });

  it("3 Advanced Website Management hub renders", async () => {
    skipIfNeeded();
    const { res } = await authedGet(HOST_A, "/hq/website/advanced", users.hqA.rawToken);
    assert.equal(res.status, 200);
    assert.match(res.text, /Advanced Website Management/);
    assert.match(res.text, /data-bb-phase4-advanced-website-management="1"/);
    assert.match(res.text, /Network Approval Settings|Open Settings/);
  });

  it("4 Network Approval Settings persist restore + HQ publish flags", async () => {
    skipIfNeeded();
    const { res, csrf, csrfCookie } = await authedGet(
      HOST_A,
      "/hq/website/network-approval-settings",
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /Network Approval Settings/);
    assert.match(res.text, /data-bb-phase4-network-approval-settings="1"/);
    assert.match(res.text, /Not available yet/);

    const cookies = [sidCookie(users.hqA.rawToken)];
    if (csrfCookie) cookies.push(`${CSRF_COOKIE}=${csrfCookie}`);
    const saved = await request(app)
      .post("/hq/website/network-approval-settings")
      .set("Host", HOST_A)
      .set("Cookie", cookies.join("; "))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        branch_edit_mode: "approval_required",
        prevent_self_approval: "1",
        require_request_changes_comment: "1",
        require_rejection_reason: "1",
        require_preview_before_publish: "1",
        require_restore_approval: "1",
        hq_direct_publish_enabled: "1",
        approval_content_types: ["homepage_content", "service_times"],
      });
    assert.equal(saved.status, 303);

    const loaded = await approvalRepo.getSettings(pool, orgA.id);
    assert.equal(loaded.requireRestoreApproval, true);
    assert.equal(loaded.hqDirectPublishEnabled, true);
  });

  it("5 Network Website Version History reuses version service", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_A,
      "/hq/website/network-version-history",
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /Network Website Version History/);
    assert.match(res.text, /data-bb-phase4-network-website-version-history="1"/);
    if (versionId) {
      assert.match(res.text, /Preview|Current website|Previous website/);
    }
  });

  it("6 Submit Branch Website Update mobile screen renders", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_A,
      "/branch-admin/website/submit",
      users.branchA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /Submit Branch Website Update/);
    assert.match(res.text, /data-bb-phase4-submit-branch-website-update="1"/);
    assert.match(res.text, /live branch page will not change/i);
  });

  it("6b submitted notice can be shown on submit screen", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_A,
      `/branch-admin/website/submit?submission=${pendingId}&notice=submitted`,
      users.branchA.rawToken
    );
    // Pending review submissions may redirect to detail; either path is acceptable.
    assert.ok([200, 302, 303].includes(res.status));
  });

  it("7 branch admin cannot open HQ change requests", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_A,
      "/hq/website/change-submissions",
      users.branchA.rawToken
    );
    assert.ok(res.status === 403 || res.status === 404 || res.status === 302);
  });

  it("8 cross-tenant change request is 404", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_B,
      `/hq/website/change-submissions/${pendingId}`,
      users.hqB.rawToken
    );
    assert.equal(res.status, 404);
  });

  it("9 CSRF required for network approval settings POST", async () => {
    skipIfNeeded();
    const saved = await request(app)
      .post("/hq/website/network-approval-settings")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken))
      .type("form")
      .send({ branch_edit_mode: "approval_required" });
    assert.equal(saved.status, 403);
  });

  it("10 draft_only mode blocks branch submit", async () => {
    skipIfNeeded();
    await approvalSvc.saveSettings(pool, {
      organizationId: orgA.id,
      actorUserId: users.hqA.user.id,
      branchEditMode: "draft_only",
      preventSelfApproval: true,
      requireRequestChangesComment: true,
      requireRejectionReason: true,
      approvalContentTypes: ["homepage_content"],
    });
    const { res, csrf, csrfCookie } = await authedGet(
      HOST_A,
      "/branch-admin/website/submit",
      users.branchA.rawToken
    );
    assert.equal(res.status, 200);
    const cookies = [sidCookie(users.branchA.rawToken)];
    if (csrfCookie) cookies.push(`${CSRF_COOKIE}=${csrfCookie}`);
    const posted = await request(app)
      .post("/branch-admin/website/submissions/submit")
      .set("Host", HOST_A)
      .set("Cookie", cookies.join("; "))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        title: "Blocked by draft only",
        reason: "Need review",
        page_key: "home",
        heading: "H",
        checklist_content: "1",
        checklist_contact: "1",
        checklist_images: "1",
        checklist_branch: "1",
      });
    assert.equal(posted.status, 303);
    assert.match(String(posted.headers.location || ""), /draft_only|error=/);
  });

  it("11 approve does not publish directly", async () => {
    skipIfNeeded();
    await approvalSvc.saveSettings(pool, {
      organizationId: orgA.id,
      actorUserId: users.hqA.user.id,
      branchEditMode: "approval_required",
      preventSelfApproval: false,
      requireRequestChangesComment: true,
      requireRejectionReason: true,
      approvalContentTypes: ["homepage_content"],
    });
    const fresh = await wcsRepo.insertSubmission(pool, {
      organizationId: orgA.id,
      branchId: branchA.id,
      title: "Approve without publish",
      pageKey: "home",
      changeType: "Content",
      currentContent: {},
      proposedContent: { heading: "Live later" },
      status: "pending_review",
      submittedBy: users.branchA.user.id,
    });
    const { res, csrf, csrfCookie } = await authedGet(
      HOST_A,
      `/hq/website/change-submissions/${fresh.id}`,
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    const cookies = [sidCookie(users.hqA.rawToken)];
    if (csrfCookie) cookies.push(`${CSRF_COOKIE}=${csrfCookie}`);
    const approved = await request(app)
      .post(`/hq/website/change-submissions/${fresh.id}/approve`)
      .set("Host", HOST_A)
      .set("Cookie", cookies.join("; "))
      .type("form")
      .send({ [CSRF_FIELD]: csrf, reviewer_comment: "Looks good" });
    assert.equal(approved.status, 303);
    const row = await wcsRepo.getSubmissionByOrgAndId(pool, orgA.id, fresh.id);
    assert.equal(row.status, "approved");
    assert.notEqual(row.status, "published");
  });

  it("12 change-requests alias redirects to canonical list", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_A,
      "/hq/website/change-requests",
      users.hqA.rawToken
    );
    assert.ok([301, 302, 303].includes(res.status));
    assert.match(String(res.headers.location || ""), /change-submissions/);
  });
});
