"use strict";

/**
 * Phase3 Website Approval Settings (Batch C screen 13).
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
const submissionSvc = require("../src/blessboard/services/websiteChangeSubmissionService");
const approvalSettingsSvc = require("../src/blessboard/services/websiteApprovalSettingsService");
const auditSvc = require("../src/blessboard/services/websiteAuditService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const HOST_A = "was-a.blessboard.org";
const HOST_B = "was-b.blessboard.org";

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

describe("phase3 website approval settings", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let branchA;
  let users = {};
  let pendingId;

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
          displayName: `WAS ${key}`,
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
          displayName: `WAS Church ${key}`,
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
          publicName: `WAS Church ${key}`,
          websiteStatus: "draft",
          primaryEmail: `${key}@example.test`,
        });
        await repairWebsiteFoundation(pool, { churchId: store.church.id });
      }

      const a = {};
      const b = {};
      await provision("was-a", HOST_A, a);
      await provision("was-b", HOST_B, b);
      orgA = a.org;
      orgB = b.org;
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
        "was-hq-a@example.test",
        "HQ A",
        {
          email: "was-hq-a@example.test",
          organizationKey: "was-a",
          roleKey: "church_hq_admin",
          churchKey: "was-a",
        },
        orgA.id
      );
      users.hqA2 = await makeUser(
        "was-hq-a2@example.test",
        "HQ A2",
        {
          email: "was-hq-a2@example.test",
          organizationKey: "was-a",
          roleKey: "church_hq_admin",
          churchKey: "was-a",
        },
        orgA.id
      );
      users.branchA = await makeUser(
        "was-br-a@example.test",
        "Branch A",
        {
          email: "was-br-a@example.test",
          organizationKey: "was-a",
          roleKey: "branch_admin",
          churchKey: "was-a",
          branchKey: "hq",
        },
        orgA.id
      );
      users.hqB = await makeUser(
        "was-hq-b@example.test",
        "HQ B",
        {
          email: "was-hq-b@example.test",
          organizationKey: "was-b",
          roleKey: "church_hq_admin",
          churchKey: "was-b",
        },
        orgB.id
      );

      const pending = await submissionRepo.insertSubmission(pool, {
        organizationId: orgA.id,
        branchId: branchA.id,
        title: "Self approval candidate",
        pageKey: "home",
        changeType: "Content",
        currentContent: {},
        proposedContent: { heading: "X" },
        status: "pending_review",
        submittedBy: users.hqA.user.id,
      });
      pendingId = pending.id;

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

  it("HQ can view and update settings", async () => {
    skipIfNeeded();
    const { res, csrf, csrfCookie } = await authedGet(
      HOST_A,
      "/hq/website/approval-settings",
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /Website Approval Settings/);
    assert.match(res.text, /data-bb-phase3-website-approval-settings="1"/);
    assert.match(res.text, /Prevent self-approval/);

    const cookies = [sidCookie(users.hqA.rawToken)];
    if (csrfCookie) cookies.push(`${CSRF_COOKIE}=${csrfCookie}`);
    const saved = await request(app)
      .post("/hq/website/approval-settings")
      .set("Host", HOST_A)
      .set("Cookie", cookies.join("; "))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        branch_edit_mode: "draft_only",
        prevent_self_approval: "1",
        require_request_changes_comment: "1",
        require_rejection_reason: "1",
        require_preview_before_publish: "1",
        approval_content_types: ["events", "sermons"],
      });
    assert.equal(saved.status, 303);
    assert.match(saved.headers.location || "", /notice=saved/);

    const loaded = await approvalSettingsSvc.loadEffectiveSettings(pool, orgA.id);
    assert.equal(loaded.settings.branchEditMode, "draft_only");
    assert.deepEqual(loaded.settings.approvalContentTypes.sort(), ["events", "sermons"]);
  });

  it("unauthorized users blocked", async () => {
    skipIfNeeded();
    const anon = await request(app)
      .get("/hq/website/approval-settings")
      .set("Host", HOST_A)
      .set("Accept", "text/html");
    assert.ok(anon.status === 303 || anon.status === 401);

    const branch = await request(app)
      .get("/hq/website/approval-settings")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.branchA.rawToken));
    assert.equal(branch.status, 403);
  });

  it("branch edit mode is validated", async () => {
    skipIfNeeded();
    const bad = await approvalSettingsSvc.saveSettings(pool, {
      organizationId: orgA.id,
      actorUserId: users.hqA.user.id,
      branchEditMode: "not_a_mode",
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.reason, "branch_edit_mode");
  });

  it("prevent-self-approval is enforced", async () => {
    skipIfNeeded();
    await approvalSettingsSvc.saveSettings(pool, {
      organizationId: orgA.id,
      actorUserId: users.hqA.user.id,
      branchEditMode: "approval_required",
      preventSelfApproval: true,
      requireRequestChangesComment: true,
      requireRejectionReason: true,
    });
    const self = await submissionSvc.approveSubmission(pool, {
      organizationId: orgA.id,
      submissionId: pendingId,
      reviewerUserId: users.hqA.user.id,
      reviewerComment: "Self",
    });
    assert.equal(self.ok, false);
    assert.equal(self.reason, "self_approval_blocked");

    const other = await submissionSvc.approveSubmission(pool, {
      organizationId: orgA.id,
      submissionId: pendingId,
      reviewerUserId: users.hqA2.user.id,
      reviewerComment: "Other HQ",
    });
    assert.equal(other.ok, true, other.reason);
  });

  it("request-changes comment rule is enforced", async () => {
    skipIfNeeded();
    const sub = await submissionRepo.insertSubmission(pool, {
      organizationId: orgA.id,
      branchId: branchA.id,
      title: "Needs comment",
      pageKey: "home",
      changeType: "Content",
      currentContent: {},
      proposedContent: { heading: "Y" },
      status: "pending_review",
      submittedBy: users.branchA.user.id,
    });
    await approvalSettingsSvc.saveSettings(pool, {
      organizationId: orgA.id,
      actorUserId: users.hqA.user.id,
      branchEditMode: "approval_required",
      preventSelfApproval: true,
      requireRequestChangesComment: true,
      requireRejectionReason: true,
    });
    const missing = await submissionSvc.requestChanges(pool, {
      organizationId: orgA.id,
      submissionId: sub.id,
      reviewerUserId: users.hqA.user.id,
      feedback: "   ",
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, "feedback_required");

    await approvalSettingsSvc.saveSettings(pool, {
      organizationId: orgA.id,
      actorUserId: users.hqA.user.id,
      branchEditMode: "approval_required",
      preventSelfApproval: true,
      requireRequestChangesComment: false,
      requireRejectionReason: true,
    });
    const allowed = await submissionSvc.requestChanges(pool, {
      organizationId: orgA.id,
      submissionId: sub.id,
      reviewerUserId: users.hqA.user.id,
      feedback: "",
    });
    assert.equal(allowed.ok, true, allowed.reason);
  });

  it("rejection reason rule is enforced", async () => {
    skipIfNeeded();
    const sub = await submissionRepo.insertSubmission(pool, {
      organizationId: orgA.id,
      branchId: branchA.id,
      title: "Reject me",
      pageKey: "home",
      changeType: "Content",
      currentContent: {},
      proposedContent: { heading: "Z" },
      status: "pending_review",
      submittedBy: users.branchA.user.id,
    });
    await approvalSettingsSvc.saveSettings(pool, {
      organizationId: orgA.id,
      actorUserId: users.hqA.user.id,
      branchEditMode: "approval_required",
      preventSelfApproval: true,
      requireRequestChangesComment: true,
      requireRejectionReason: true,
    });
    const missing = await submissionSvc.rejectSubmission(pool, {
      organizationId: orgA.id,
      submissionId: sub.id,
      reviewerUserId: users.hqA.user.id,
      rejectionReason: "",
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, "rejection_reason_required");

    await approvalSettingsSvc.saveSettings(pool, {
      organizationId: orgA.id,
      actorUserId: users.hqA.user.id,
      branchEditMode: "approval_required",
      preventSelfApproval: true,
      requireRequestChangesComment: true,
      requireRejectionReason: false,
    });
    const allowed = await submissionSvc.rejectSubmission(pool, {
      organizationId: orgA.id,
      submissionId: sub.id,
      reviewerUserId: users.hqA.user.id,
      rejectionReason: "",
    });
    assert.equal(allowed.ok, true, allowed.reason);
  });

  it("settings changes create audit event", async () => {
    skipIfNeeded();
    await approvalSettingsSvc.saveSettings(pool, {
      organizationId: orgA.id,
      actorUserId: users.hqA.user.id,
      branchEditMode: "approval_required",
      preventSelfApproval: true,
      requireRequestChangesComment: true,
      requireRejectionReason: true,
    });
    const audit = await auditSvc.listWebsiteAuditEvents(pool, {
      organizationId: orgA.id,
      actionType: "approval_settings_updated",
    });
    assert.ok(audit.ok);
    assert.ok(audit.total >= 1);
  });

  it("CSRF enforced", async () => {
    skipIfNeeded();
    const denied = await request(app)
      .post("/hq/website/approval-settings")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken))
      .type("form")
      .send({ branch_edit_mode: "approval_required" });
    assert.equal(denied.status, 403);
  });

  it("cross-organization branch admins list is scoped", async () => {
    skipIfNeeded();
    const listA = await approvalSettingsSvc.listBranchAdministrators(pool, orgA.id);
    const listB = await approvalSettingsSvc.listBranchAdministrators(pool, orgB.id);
    assert.ok(listA.every((u) => u.userId !== users.hqB.user.id));
    assert.ok(listB.every((u) => u.userId !== users.branchA.user.id));
    assert.ok(listA.some((u) => u.userId === users.branchA.user.id));
  });
});
