"use strict";

/**
 * Phase3 HQ website change submissions list + review.
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
const wcsRepo = require("../src/blessboard/repositories/websiteChangeSubmissionRepository");
const wcsSvc = require("../src/blessboard/services/websiteChangeSubmissionService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const HOST_A = "wcs-a.blessboard.org";
const HOST_B = "wcs-b.blessboard.org";

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

describe("phase3 website change submissions review", () => {
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
  let changesRequestedId;
  let approvedId;

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

      const provA = await provisionPlatformTenant(pool, {
        organizationKey: "wcs-a",
        displayName: "WCS Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "wcs-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provA.ok, true, provA.message);
      orgA = provA.records.organization;

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "wcs-a",
        churchKey: "wcs-a",
        displayName: "WCS Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ Campus",
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      branchA = chA.records.hqBranch;

      const provB = await provisionPlatformTenant(pool, {
        organizationKey: "wcs-b",
        displayName: "WCS Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "wcs-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provB.ok, true, provB.message);
      orgB = provB.records.organization;

      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "wcs-b",
        churchKey: "wcs-b",
        displayName: "WCS Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });
      assert.equal(chB.ok, true, chB.message);

      async function makeUser(email, displayName, role) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        assert.equal((await assignBlessBoardRole(pool, role)).ok, true);
        const orgId =
          role.organizationKey === "wcs-a" ? orgA.id : orgB.id;
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-v5",
          userId: created.user.id,
          organizationId: orgId,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      users.hqA = await makeUser("wcs-hq-a@example.test", "HQ Admin A", {
        email: "wcs-hq-a@example.test",
        organizationKey: "wcs-a",
        roleKey: "church_hq_admin",
        churchKey: "wcs-a",
      });
      users.branchA = await makeUser("wcs-br-a@example.test", "Branch Admin A", {
        email: "wcs-br-a@example.test",
        organizationKey: "wcs-a",
        roleKey: "branch_admin",
        churchKey: "wcs-a",
        branchKey: "hq",
      });
      users.hqB = await makeUser("wcs-hq-b@example.test", "HQ Admin B", {
        email: "wcs-hq-b@example.test",
        organizationKey: "wcs-b",
        roleKey: "church_hq_admin",
        churchKey: "wcs-b",
      });
      users.submitter = await makeUser("wcs-sub@example.test", "Submitter A", {
        email: "wcs-sub@example.test",
        organizationKey: "wcs-a",
        roleKey: "branch_admin",
        churchKey: "wcs-a",
        branchKey: "hq",
      });

      const pending = await wcsRepo.insertSubmission(pool, {
        organizationId: orgA.id,
        branchId: branchA.id,
        title: 'Summer Banner <script>alert(1)</script>',
        pageKey: "home",
        sectionKey: "hero",
        changeType: "Content Update",
        currentContent: {
          heading: "Welcome",
          bodyText: "Sundays at 9:00 AM",
          serviceTimes: "9:00 AM & 11:00 AM",
        },
        proposedContent: {
          heading: "A Place to Belong",
          bodyText: "Sundays at 8:30 AM",
          serviceTimes: "8:30 AM, 10:30 AM, & 6:00 PM",
          mediaUrl: "sanctuary_morning_v2.jpg",
        },
        reason: "Fall schedule update",
        submitterNote: "Please review before Sunday",
        status: "pending_review",
        submittedBy: users.submitter.user.id,
      });
      pendingId = pending.id;
      await wcsRepo.appendEvent(pool, {
        submissionId: pendingId,
        organizationId: orgA.id,
        actorUserId: users.submitter.user.id,
        eventType: "submitted",
        comment: "Ready for HQ",
      });

      const requested = await wcsRepo.insertSubmission(pool, {
        organizationId: orgA.id,
        branchId: branchA.id,
        title: "Service Times Revision",
        pageKey: "contact",
        sectionKey: "hours",
        changeType: "Service times",
        currentContent: { serviceTimes: "Old times" },
        proposedContent: { serviceTimes: "New times" },
        status: "changes_requested",
        submittedBy: users.submitter.user.id,
      });
      changesRequestedId = requested.id;

      const approved = await wcsRepo.insertSubmission(pool, {
        organizationId: orgA.id,
        branchId: branchA.id,
        title: "Approved Banner",
        pageKey: "events",
        changeType: "Image replacement",
        currentContent: { mediaUrl: "old.jpg" },
        proposedContent: { mediaUrl: "new.jpg" },
        status: "approved",
        submittedBy: users.submitter.user.id,
      });
      approvedId = approved.id;
      await pool.query(
        `UPDATE blessboard.website_change_submissions
            SET reviewed_by = $2, reviewed_at = now(), updated_at = now()
          WHERE id = $1`,
        [approvedId, users.hqA.user.id]
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
    const csrf = extractCsrfToken(res.text);
    const csrfCookie = extractCookie(res, CSRF_COOKIE);
    return { res, csrf, csrfCookie };
  }

  it("HQ administrator can open the submissions list", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_A,
      "/hq/website/change-submissions",
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /Website Change Submissions/);
    assert.match(res.text, /data-bb-phase3-website-change-submissions="1"/);
    assert.match(res.text, /Summer Banner/);
    assert.match(res.text, /Pending review/);
  });

  it("unauthorized user cannot open HQ submission routes", async () => {
    skipIfNeeded();
    const anon = await request(app)
      .get("/hq/website/change-submissions")
      .set("Host", HOST_A)
      .set("Accept", "text/html");
    assert.ok(anon.status === 303 || anon.status === 401);

    const branch = await request(app)
      .get("/hq/website/change-submissions")
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.branchA.rawToken));
    assert.equal(branch.status, 403);
  });

  it("Organization A cannot access Organization B submission", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_B,
      `/hq/website/change-submissions/${pendingId}`,
      users.hqB.rawToken
    );
    assert.equal(res.status, 404);

    const list = await authedGet(
      HOST_B,
      "/hq/website/change-submissions",
      users.hqB.rawToken
    );
    assert.equal(list.res.status, 200);
    assert.doesNotMatch(list.res.text, /Summer Banner/);
  });

  it("list filters operate correctly", async () => {
    skipIfNeeded();
    const byStatus = await authedGet(
      HOST_A,
      "/hq/website/change-submissions?status=pending_review",
      users.hqA.rawToken
    );
    assert.equal(byStatus.res.status, 200);
    assert.match(byStatus.res.text, /Summer Banner/);
    assert.doesNotMatch(byStatus.res.text, /Approved Banner/);

    const byPage = await authedGet(
      HOST_A,
      "/hq/website/change-submissions?page=contact",
      users.hqA.rawToken
    );
    assert.equal(byPage.res.status, 200);
    assert.match(byPage.res.text, /Service Times Revision/);
    assert.doesNotMatch(byPage.res.text, /Summer Banner/);

    const bySearch = await authedGet(
      HOST_A,
      "/hq/website/change-submissions?q=" + encodeURIComponent("Approved"),
      users.hqA.rawToken
    );
    assert.equal(bySearch.res.status, 200);
    assert.match(bySearch.res.text, /Approved Banner/);
  });

  it("empty state renders correctly", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_B,
      "/hq/website/change-submissions",
      users.hqB.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /No website changes are waiting for review/);
    assert.match(res.text, /Open Website Editor/);
    assert.match(res.text, /data-bb-phase3-wcs-empty="1"/);
  });

  it("review page renders current and proposed values", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_A,
      `/hq/website/change-submissions/${pendingId}`,
      users.hqA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /Review Website Changes/);
    assert.match(res.text, /data-bb-phase3-website-change-review="1"/);
    assert.match(res.text, /Currently Published/);
    assert.match(res.text, /Proposed Changes/);
    assert.match(res.text, /9:00 AM &amp; 11:00 AM|9:00 AM/);
    assert.match(res.text, /8:30 AM/);
    assert.match(res.text, /Fall schedule update/);
    assert.match(res.text, /bb-hq-phase3-wcr__workspace/);
  });

  it("approve changes updates status and reviewer metadata", async () => {
    skipIfNeeded();
    const boot = await authedGet(
      HOST_A,
      `/hq/website/change-submissions/${pendingId}`,
      users.hqA.rawToken
    );
    assert.ok(boot.csrf);
    const cookies = [sidCookie(users.hqA.rawToken)];
    if (boot.csrfCookie) cookies.push(`${CSRF_COOKIE}=${boot.csrfCookie}`);

    const post = await request(app)
      .post(`/hq/website/change-submissions/${pendingId}/approve`)
      .set("Host", HOST_A)
      .set("Cookie", cookies.join("; "))
      .type("form")
      .send({
        [CSRF_FIELD]: boot.csrf,
        reviewer_comment: "Looks good",
      });
    assert.equal(post.status, 303);
    assert.match(String(post.headers.location || ""), /notice=approved/);

    const row = await wcsRepo.getSubmissionByOrgAndId(pool, orgA.id, pendingId);
    assert.equal(row.status, "approved");
    assert.equal(row.reviewedBy, users.hqA.user.id);
    assert.ok(row.reviewedAt);
    assert.equal(row.reviewerComment, "Looks good");
  });

  it("request changes requires feedback", async () => {
    skipIfNeeded();
    // Re-insert a pending submission for this action
    const fresh = await wcsRepo.insertSubmission(pool, {
      organizationId: orgA.id,
      branchId: branchA.id,
      title: "Need Feedback Item",
      pageKey: "home",
      changeType: "Text",
      currentContent: { heading: "A" },
      proposedContent: { heading: "B" },
      status: "pending_review",
      submittedBy: users.submitter.user.id,
    });

    const boot = await authedGet(
      HOST_A,
      `/hq/website/change-submissions/${fresh.id}`,
      users.hqA.rawToken
    );
    const cookies = [sidCookie(users.hqA.rawToken)];
    if (boot.csrfCookie) cookies.push(`${CSRF_COOKIE}=${boot.csrfCookie}`);

    const missing = await request(app)
      .post(`/hq/website/change-submissions/${fresh.id}/request-changes`)
      .set("Host", HOST_A)
      .set("Cookie", cookies.join("; "))
      .type("form")
      .send({ [CSRF_FIELD]: boot.csrf, feedback: "" });
    assert.equal(missing.status, 303);
    assert.match(String(missing.headers.location || ""), /feedback_required/);

    const ok = await request(app)
      .post(`/hq/website/change-submissions/${fresh.id}/request-changes`)
      .set("Host", HOST_A)
      .set("Cookie", cookies.join("; "))
      .type("form")
      .send({
        [CSRF_FIELD]: boot.csrf,
        feedback: "Please clarify the heading",
      });
    assert.equal(ok.status, 303);
    assert.match(String(ok.headers.location || ""), /changes_requested/);

    const row = await wcsRepo.getSubmissionByOrgAndId(pool, orgA.id, fresh.id);
    assert.equal(row.status, "changes_requested");
  });

  it("reject requires a reason", async () => {
    skipIfNeeded();
    const fresh = await wcsRepo.insertSubmission(pool, {
      organizationId: orgA.id,
      branchId: branchA.id,
      title: "Reject Me",
      pageKey: "giving",
      changeType: "Text",
      currentContent: { bodyText: "Old" },
      proposedContent: { bodyText: "New" },
      status: "pending_review",
      submittedBy: users.submitter.user.id,
    });

    const boot = await authedGet(
      HOST_A,
      `/hq/website/change-submissions/${fresh.id}`,
      users.hqA.rawToken
    );
    const cookies = [sidCookie(users.hqA.rawToken)];
    if (boot.csrfCookie) cookies.push(`${CSRF_COOKIE}=${boot.csrfCookie}`);

    const missing = await request(app)
      .post(`/hq/website/change-submissions/${fresh.id}/reject`)
      .set("Host", HOST_A)
      .set("Cookie", cookies.join("; "))
      .type("form")
      .send({ [CSRF_FIELD]: boot.csrf, rejection_reason: "   " });
    assert.equal(missing.status, 303);
    assert.match(String(missing.headers.location || ""), /rejection_reason_required/);

    const ok = await request(app)
      .post(`/hq/website/change-submissions/${fresh.id}/reject`)
      .set("Host", HOST_A)
      .set("Cookie", cookies.join("; "))
      .type("form")
      .send({
        [CSRF_FIELD]: boot.csrf,
        rejection_reason: "Does not match brand guidelines",
      });
    assert.equal(ok.status, 303);

    const row = await wcsRepo.getSubmissionByOrgAndId(pool, orgA.id, fresh.id);
    assert.equal(row.status, "rejected");
    assert.equal(row.rejectionReason, "Does not match brand guidelines");
  });

  it("invalid status transition is blocked", async () => {
    skipIfNeeded();
    assert.equal(wcsSvc.canTransition("approved", "rejected"), false);
    assert.equal(wcsSvc.canTransition("pending_review", "approved"), true);

    const boot = await authedGet(
      HOST_A,
      `/hq/website/change-submissions/${approvedId}`,
      users.hqA.rawToken
    );
    const cookies = [sidCookie(users.hqA.rawToken)];
    if (boot.csrfCookie) cookies.push(`${CSRF_COOKIE}=${boot.csrfCookie}`);

    const post = await request(app)
      .post(`/hq/website/change-submissions/${approvedId}/reject`)
      .set("Host", HOST_A)
      .set("Cookie", cookies.join("; "))
      .type("form")
      .send({
        [CSRF_FIELD]: boot.csrf,
        rejection_reason: "Too late",
      });
    assert.equal(post.status, 303);
    assert.match(String(post.headers.location || ""), /invalid_transition/);

    const row = await wcsRepo.getSubmissionByOrgAndId(pool, orgA.id, approvedId);
    assert.equal(row.status, "approved");
  });

  it("POST actions reject missing or invalid CSRF", async () => {
    skipIfNeeded();
    const fresh = await wcsRepo.insertSubmission(pool, {
      organizationId: orgA.id,
      branchId: branchA.id,
      title: "CSRF Target",
      pageKey: "home",
      changeType: "Text",
      currentContent: { heading: "A" },
      proposedContent: { heading: "B" },
      status: "pending_review",
      submittedBy: users.submitter.user.id,
    });

    const missing = await request(app)
      .post(`/hq/website/change-submissions/${fresh.id}/approve`)
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken))
      .type("form")
      .send({ reviewer_comment: "no csrf" });
    assert.equal(missing.status, 403);

    const invalid = await request(app)
      .post(`/hq/website/change-submissions/${fresh.id}/approve`)
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.hqA.rawToken))
      .type("form")
      .send({
        [CSRF_FIELD]: "not-a-valid-token",
        reviewer_comment: "bad csrf",
      });
    assert.equal(invalid.status, 403);
  });

  it("user-supplied content is escaped", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_A,
      "/hq/website/change-submissions",
      users.hqA.rawToken
    );
    assert.doesNotMatch(res.text, /<script>alert\(1\)<\/script>/);
    assert.match(res.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });

  it("mobile-required structural classes exist", async () => {
    skipIfNeeded();
    const list = await authedGet(
      HOST_A,
      "/hq/website/change-submissions",
      users.hqA.rawToken
    );
    assert.match(list.res.text, /bb-hq-phase3-wcs__cards/);
    assert.match(list.res.text, /data-bb-phase3-wcs-mobile="1"/);

    // Use changes_requested fixture still pending review actions N/A — any review page
    const review = await authedGet(
      HOST_A,
      `/hq/website/change-submissions/${changesRequestedId}`,
      users.hqA.rawToken
    );
    assert.equal(review.res.status, 200);
    assert.match(review.res.text, /bb-hq-phase3-wcr__tabs/);
    assert.match(review.res.text, /data-bb-phase3-wcr-workspace="1"/);
  });
});
