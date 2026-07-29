"use strict";

/**
 * Phase3 Branch Website Submissions + Submit Website Changes.
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
const wcsRepo = require("../src/blessboard/repositories/websiteChangeSubmissionRepository");
const wcsSvc = require("../src/blessboard/services/websiteChangeSubmissionService");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const HOST_A = "bws-a.blessboard.org";
const HOST_B = "bws-b.blessboard.org";

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

describe("phase3 branch website submissions", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgA;
  let orgB;
  let branchA;
  let branchNorth;
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

      const provA = await provisionPlatformTenant(pool, {
        organizationKey: "bws-a",
        displayName: "BWS Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "bws-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provA.ok, true, provA.message);
      orgA = provA.records.organization;

      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "bws-a",
        churchKey: "bws-a",
        displayName: "BWS Church A",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ Campus",
      });
      assert.equal(chA.ok, true, chA.message);
      branchA = chA.records.hqBranch;

      // Second branch for isolation checks (raw insert avoids plan max_branches gate).
      const northIns = await pool.query(
        `INSERT INTO blessboard.branches (
           church_id, branch_key, display_name, branch_type, status, is_primary
         ) VALUES ($1, 'north', 'North Campus', 'branch', 'active', false)
         RETURNING id`,
        [chA.records.church.id]
      );
      branchNorth = { id: northIns.rows[0].id };
      await pool.query(
        `INSERT INTO blessboard.branch_settings (branch_id, public_name)
         VALUES ($1, 'North Campus')
         ON CONFLICT (branch_id) DO NOTHING`,
        [branchNorth.id]
      );

      const provB = await provisionPlatformTenant(pool, {
        organizationKey: "bws-b",
        displayName: "BWS Org B",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "bws-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provB.ok, true, provB.message);
      orgB = provB.records.organization;

      await provisionBlessBoardChurch(pool, {
        organizationKey: "bws-b",
        churchKey: "bws-b",
        displayName: "BWS Church B",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ B",
      });

      async function makeUser(email, displayName, role) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        assert.equal((await assignBlessBoardRole(pool, role)).ok, true);
        const orgId = role.organizationKey === "bws-a" ? orgA.id : orgB.id;
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-v5",
          userId: created.user.id,
          organizationId: orgId,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return { user: created.user, rawToken: session.rawToken };
      }

      users.branchA = await makeUser("bws-br-a@example.test", "Branch Admin A", {
        email: "bws-br-a@example.test",
        organizationKey: "bws-a",
        roleKey: "branch_admin",
        churchKey: "bws-a",
        branchKey: "hq",
      });
      users.branchNorth = await makeUser("bws-br-n@example.test", "Branch North", {
        email: "bws-br-n@example.test",
        organizationKey: "bws-a",
        roleKey: "branch_admin",
        churchKey: "bws-a",
        branchKey: "north",
      });
      users.hqA = await makeUser("bws-hq-a@example.test", "HQ A", {
        email: "bws-hq-a@example.test",
        organizationKey: "bws-a",
        roleKey: "church_hq_admin",
        churchKey: "bws-a",
      });
      users.hqB = await makeUser("bws-hq-b@example.test", "HQ B", {
        email: "bws-hq-b@example.test",
        organizationKey: "bws-b",
        roleKey: "church_hq_admin",
        churchKey: "bws-b",
      });

      const planAssign = await assignOrganizationPlan(pool, {
        organizationId: orgA.id,
        planKey: "growth",
        status: "active",
      });
      assert.equal(planAssign.ok, true, planAssign.reason);

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

  function cookiesFor(rawToken, csrfCookie) {
    const parts = [sidCookie(rawToken)];
    if (csrfCookie) parts.push(`${CSRF_COOKIE}=${csrfCookie}`);
    return parts.join("; ");
  }

  it("branch administrator can open their submissions list", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_A,
      "/branch-admin/website/submissions",
      users.branchA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /My Website Submissions/);
    assert.match(res.text, /data-bb-phase3-branch-website-submissions="1"/);
  });

  it("empty state renders", async () => {
    skipIfNeeded();
    const { res } = await authedGet(
      HOST_A,
      "/branch-admin/website/submissions",
      users.branchA.rawToken
    );
    assert.match(res.text, /You have not submitted any website changes/);
    assert.match(res.text, /Edit Branch Website/);
  });

  it("draft submission can be created and updated", async () => {
    skipIfNeeded();
    const boot = await authedGet(
      HOST_A,
      "/branch-admin/website/submit",
      users.branchA.rawToken
    );
    assert.equal(boot.res.status, 200);
    assert.match(boot.res.text, /data-bb-phase3-submit-website-changes="1"/);

    const create = await request(app)
      .post("/branch-admin/website/submissions/draft")
      .set("Host", HOST_A)
      .set("Cookie", cookiesFor(users.branchA.rawToken, boot.csrfCookie))
      .type("form")
      .send({
        [CSRF_FIELD]: boot.csrf,
        title: 'Draft <script>x</script>',
        page_key: "home",
        section_key: "hero",
        reason: "Seasonal update",
        submitter_note: "Please review",
        priority: "important",
        heading: "Welcome home",
        body_text: "Updated body",
        checklist_content: "1",
        checklist_contact: "1",
        checklist_images: "1",
        checklist_branch: "1",
      });
    assert.equal(create.status, 303);
    const loc = String(create.headers.location || "");
    assert.match(loc, /\/branch-admin\/website\/submissions\/[0-9a-f-]+/);
    const id = loc.split("/").pop().split("?")[0];

    const row = await wcsRepo.getSubmissionByOrgBranchAndId(
      pool,
      orgA.id,
      branchA.id,
      id
    );
    assert.equal(row.status, "draft");
    assert.equal(row.priority, "important");
    assert.equal(row.proposedContent.heading, "Welcome home");

    const edit = await authedGet(
      HOST_A,
      `/branch-admin/website/submit?submission=${id}`,
      users.branchA.rawToken
    );
    const save = await request(app)
      .post(`/branch-admin/website/submissions/${id}/save`)
      .set("Host", HOST_A)
      .set("Cookie", cookiesFor(users.branchA.rawToken, edit.csrfCookie))
      .type("form")
      .send({
        [CSRF_FIELD]: edit.csrf,
        title: "Draft Updated",
        page_key: "home",
        reason: "Seasonal update revised",
        priority: "urgent",
        heading: "Welcome revised",
        checklist_content: "1",
        checklist_contact: "1",
        checklist_images: "1",
        checklist_branch: "1",
      });
    assert.equal(save.status, 303);
    const updated = await wcsRepo.getSubmissionByOrgBranchAndId(
      pool,
      orgA.id,
      branchA.id,
      id
    );
    assert.equal(updated.title, "Draft Updated");
    assert.equal(updated.priority, "urgent");
    assert.equal(updated.proposedContent.heading, "Welcome revised");
  });

  it("real status counts render and XSS is escaped", async () => {
    skipIfNeeded();
    await wcsRepo.insertSubmission(pool, {
      organizationId: orgA.id,
      branchId: branchA.id,
      title: 'XSS <script>alert(1)</script>',
      pageKey: "home",
      changeType: "Text",
      currentContent: { heading: "A" },
      proposedContent: { heading: "B" },
      reason: "xss check",
      status: "draft",
      submittedBy: users.branchA.user.id,
    });
    const { res } = await authedGet(
      HOST_A,
      "/branch-admin/website/submissions",
      users.branchA.rawToken
    );
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-phase3-bws-summary="1"/);
    assert.doesNotMatch(res.text, /<script>alert\(1\)<\/script>/);
    assert.match(res.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });

  it("draft can be submitted for review", async () => {
    skipIfNeeded();
    const boot = await authedGet(
      HOST_A,
      "/branch-admin/website/submit",
      users.branchA.rawToken
    );
    const create = await request(app)
      .post("/branch-admin/website/submissions/submit")
      .set("Host", HOST_A)
      .set("Cookie", cookiesFor(users.branchA.rawToken, boot.csrfCookie))
      .type("form")
      .send({
        [CSRF_FIELD]: boot.csrf,
        title: "Submit Me",
        page_key: "contact",
        reason: "Need HQ approval",
        priority: "normal",
        heading: "Contact",
        checklist_content: "1",
        checklist_contact: "1",
        checklist_images: "1",
        checklist_branch: "1",
      });
    assert.equal(create.status, 303);
    assert.match(String(create.headers.location || ""), /notice=submitted/);
    const id = String(create.headers.location).split("/").pop().split("?")[0];
    const row = await wcsRepo.getSubmissionByOrgBranchAndId(
      pool,
      orgA.id,
      branchA.id,
      id
    );
    assert.equal(row.status, "pending_review");
    assert.ok(row.submittedAt);
  });

  it("required fields are validated", async () => {
    skipIfNeeded();
    const boot = await authedGet(
      HOST_A,
      "/branch-admin/website/submit",
      users.branchA.rawToken
    );
    const missing = await request(app)
      .post("/branch-admin/website/submissions/submit")
      .set("Host", HOST_A)
      .set("Cookie", cookiesFor(users.branchA.rawToken, boot.csrfCookie))
      .type("form")
      .send({
        [CSRF_FIELD]: boot.csrf,
        title: "",
        page_key: "home",
        reason: "x",
        checklist_content: "1",
        checklist_contact: "1",
        checklist_images: "1",
        checklist_branch: "1",
      });
    assert.equal(missing.status, 303);
    assert.match(String(missing.headers.location || ""), /error=title_required/);
  });

  it("changes-requested can be resubmitted and feedback is visible", async () => {
    skipIfNeeded();
    const draft = await wcsRepo.insertSubmission(pool, {
      organizationId: orgA.id,
      branchId: branchA.id,
      title: "Needs Changes",
      pageKey: "home",
      changeType: "Text",
      currentContent: { heading: "A" },
      proposedContent: { heading: "B" },
      reason: "Update",
      status: "pending_review",
      submittedBy: users.branchA.user.id,
      checklist: {
        contentReviewed: true,
        contactConfirmed: true,
        imagesApproved: true,
        branchAccurate: true,
      },
    });
    await wcsSvc.requestChanges(pool, {
      organizationId: orgA.id,
      submissionId: draft.id,
      reviewerUserId: users.hqA.user.id,
      feedback: "Please fix the heading",
    });

    const detail = await authedGet(
      HOST_A,
      `/branch-admin/website/submissions/${draft.id}`,
      users.branchA.rawToken
    );
    assert.equal(detail.res.status, 200);
    assert.match(detail.res.text, /Please fix the heading/);
    assert.doesNotMatch(detail.res.text, /Approve and publish now/);

    const edit = await authedGet(
      HOST_A,
      `/branch-admin/website/submit?submission=${draft.id}`,
      users.branchA.rawToken
    );
    const resubmit = await request(app)
      .post(`/branch-admin/website/submissions/${draft.id}/submit`)
      .set("Host", HOST_A)
      .set("Cookie", cookiesFor(users.branchA.rawToken, edit.csrfCookie))
      .type("form")
      .send({
        [CSRF_FIELD]: edit.csrf,
        title: "Needs Changes",
        page_key: "home",
        reason: "Update again",
        heading: "Fixed heading",
        checklist_content: "1",
        checklist_contact: "1",
        checklist_images: "1",
        checklist_branch: "1",
      });
    assert.equal(resubmit.status, 303);
    const row = await wcsRepo.getSubmissionByOrgBranchAndId(
      pool,
      orgA.id,
      branchA.id,
      draft.id
    );
    assert.equal(row.status, "pending_review");
  });

  it("pending can be withdrawn; published cannot", async () => {
    skipIfNeeded();
    const pending = await wcsRepo.insertSubmission(pool, {
      organizationId: orgA.id,
      branchId: branchA.id,
      title: "Withdraw Me",
      pageKey: "home",
      changeType: "Text",
      currentContent: { heading: "A" },
      proposedContent: { heading: "B" },
      reason: "temp",
      status: "pending_review",
      submittedBy: users.branchA.user.id,
    });
    const boot = await authedGet(
      HOST_A,
      `/branch-admin/website/submissions/${pending.id}`,
      users.branchA.rawToken
    );
    const withdraw = await request(app)
      .post(`/branch-admin/website/submissions/${pending.id}/withdraw`)
      .set("Host", HOST_A)
      .set("Cookie", cookiesFor(users.branchA.rawToken, boot.csrfCookie))
      .type("form")
      .send({ [CSRF_FIELD]: boot.csrf });
    assert.equal(withdraw.status, 303);

    const published = await wcsRepo.insertSubmission(pool, {
      organizationId: orgA.id,
      branchId: branchA.id,
      title: "Published Item",
      pageKey: "home",
      changeType: "Text",
      currentContent: { heading: "A" },
      proposedContent: { heading: "B" },
      reason: "done",
      status: "published",
      submittedBy: users.branchA.user.id,
    });
    await pool.query(
      `UPDATE blessboard.website_change_submissions
          SET reviewed_by = $2, reviewed_at = now()
        WHERE id = $1`,
      [published.id, users.hqA.user.id]
    );
    const detail = await authedGet(
      HOST_A,
      `/branch-admin/website/submissions/${published.id}`,
      users.branchA.rawToken
    );
    const blocked = await request(app)
      .post(`/branch-admin/website/submissions/${published.id}/withdraw`)
      .set("Host", HOST_A)
      .set("Cookie", cookiesFor(users.branchA.rawToken, detail.csrfCookie))
      .type("form")
      .send({ [CSRF_FIELD]: detail.csrf });
    assert.equal(blocked.status, 303);
    assert.match(String(blocked.headers.location || ""), /invalid_transition/);
  });

  it("missing CSRF is rejected; branch cannot approve", async () => {
    skipIfNeeded();
    const pending = await wcsRepo.insertSubmission(pool, {
      organizationId: orgA.id,
      branchId: branchA.id,
      title: "CSRF Target",
      pageKey: "home",
      changeType: "Text",
      currentContent: { heading: "A" },
      proposedContent: { heading: "B" },
      reason: "x",
      status: "pending_review",
      submittedBy: users.branchA.user.id,
    });
    const missing = await request(app)
      .post(`/branch-admin/website/submissions/${pending.id}/withdraw`)
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.branchA.rawToken))
      .type("form")
      .send({});
    assert.equal(missing.status, 403);

    const approve = await request(app)
      .post(`/hq/website/change-submissions/${pending.id}/approve`)
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.branchA.rawToken))
      .type("form")
      .send({ [CSRF_FIELD]: "x" });
    assert.ok(approve.status === 403 || approve.status === 401);
  });

  it("cross-branch and cross-organization access returns 404", async () => {
    skipIfNeeded();
    const northItem = await wcsRepo.insertSubmission(pool, {
      organizationId: orgA.id,
      branchId: branchNorth.id,
      title: "North Only",
      pageKey: "home",
      changeType: "Text",
      currentContent: { heading: "N" },
      proposedContent: { heading: "N2" },
      reason: "north",
      status: "draft",
      submittedBy: users.branchNorth.user.id,
    });

    const crossBranch = await authedGet(
      HOST_A,
      `/branch-admin/website/submissions/${northItem.id}`,
      users.branchA.rawToken
    );
    assert.equal(crossBranch.res.status, 404);

    const listNorth = await authedGet(
      HOST_A,
      "/branch-admin/website/submissions",
      users.branchNorth.rawToken
    );
    assert.match(listNorth.res.text, /North Only/);
    const listHq = await authedGet(
      HOST_A,
      "/branch-admin/website/submissions",
      users.branchA.rawToken
    );
    assert.doesNotMatch(listHq.res.text, /North Only/);

    const crossOrg = await authedGet(
      HOST_B,
      `/hq/website/change-submissions/${northItem.id}`,
      users.hqB.rawToken
    );
    assert.equal(crossOrg.res.status, 404);
  });

  it("tenant isolation: HQ same-org read, cross-org/branch mutations, cache and repo scope", async () => {
    skipIfNeeded();
    const northItem = await wcsRepo.insertSubmission(pool, {
      organizationId: orgA.id,
      branchId: branchNorth.id,
      title: "Isolation North Target",
      pageKey: "home",
      changeType: "Text",
      currentContent: { heading: "N" },
      proposedContent: { heading: "N2" },
      reason: "iso",
      status: "pending_review",
      submittedBy: users.branchNorth.user.id,
    });
    const ownBranchItem = await wcsRepo.insertSubmission(pool, {
      organizationId: orgA.id,
      branchId: branchA.id,
      title: "Isolation Own Branch",
      pageKey: "about",
      changeType: "Text",
      currentContent: { heading: "A" },
      proposedContent: { heading: "A2" },
      reason: "own",
      status: "draft",
      submittedBy: users.branchA.user.id,
    });

    // Branch admin can read own-branch submission.
    const ownRead = await authedGet(
      HOST_A,
      `/branch-admin/website/submissions/${ownBranchItem.id}`,
      users.branchA.rawToken
    );
    assert.equal(ownRead.res.status, 200);
    assert.match(ownRead.res.text, /Isolation Own Branch/);

    // HQ admin can read submissions from branches in their organization.
    const hqRead = await authedGet(
      HOST_A,
      `/hq/website/change-submissions/${northItem.id}`,
      users.hqA.rawToken
    );
    assert.equal(hqRead.res.status, 200);
    assert.match(hqRead.res.text, /data-bb-phase3-website-change-review="1"/);
    assert.match(hqRead.res.text, /Waiting for Review|North Campus/);
    assert.match(String(hqRead.res.headers["cache-control"] || ""), /no-store/i);

    // Cross-organization HQ mutation → 404 (not plan 403 / not 200).
    const crossOrgMut = await request(app)
      .post(`/hq/website/change-submissions/${northItem.id}/approve`)
      .set("Host", HOST_B)
      .set("Cookie", sidCookie(users.hqB.rawToken))
      .type("form")
      .send({ [CSRF_FIELD]: "x" });
    assert.equal(crossOrgMut.status, 404);
    assert.doesNotMatch(crossOrgMut.text, /Isolation North Target|BWS Org A|North Campus/);
    assert.match(String(crossOrgMut.headers["cache-control"] || ""), /no-store/i);

    // Cross-branch mutation → 404.
    const crossBranchMut = await request(app)
      .post(`/branch-admin/website/submissions/${northItem.id}/withdraw`)
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(users.branchA.rawToken))
      .type("form")
      .send({ [CSRF_FIELD]: "x" });
    assert.equal(crossBranchMut.status, 404);

    // Anonymous and non-admin cannot open submission-admin routes.
    const anon = await request(app)
      .get(`/hq/website/change-submissions/${northItem.id}`)
      .set("Host", HOST_A)
      .set("Accept", "text/html");
    assert.ok(anon.status === 303 || anon.status === 401);

    const memberCreated = await createBlessBoardUser(pool, {
      email: "bws-member-iso@example.test",
      displayName: "Member Iso",
      password: PASSWORD,
    });
    assert.equal(memberCreated.ok, true, memberCreated.message);
    const memberSession = await createV5Session(pool, {
      deploymentCode: "blessboard-org-v5",
      userId: memberCreated.user.id,
      organizationId: orgA.id,
    });
    assert.equal(memberSession.ok, true, memberSession.message || memberSession.code);
    const memberHq = await request(app)
      .get(`/hq/website/change-submissions/${northItem.id}`)
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(memberSession.rawToken));
    assert.ok(memberHq.status === 403 || memberHq.status === 401 || memberHq.status === 303);
    const memberBranch = await request(app)
      .get(`/branch-admin/website/submissions/${ownBranchItem.id}`)
      .set("Host", HOST_A)
      .set("Cookie", sidCookie(memberSession.rawToken));
    assert.ok(
      memberBranch.status === 403 || memberBranch.status === 401 || memberBranch.status === 303
    );

    // Existence not disclosed: foreign id and random uuid share the same 404 body.
    const missingId = "00000000-0000-4000-8000-000000000099";
    const foreign404 = await authedGet(
      HOST_B,
      `/hq/website/change-submissions/${northItem.id}`,
      users.hqB.rawToken
    );
    const missing404 = await authedGet(
      HOST_B,
      `/hq/website/change-submissions/${missingId}`,
      users.hqB.rawToken
    );
    assert.equal(foreign404.res.status, 404);
    assert.equal(missing404.res.status, 404);
    assert.equal(foreign404.res.text, missing404.res.text);

    // Repository lookup includes organization (and branch) scope.
    const inOrg = await wcsRepo.getSubmissionByOrgAndId(pool, orgA.id, northItem.id);
    const outOrg = await wcsRepo.getSubmissionByOrgAndId(pool, orgB.id, northItem.id);
    assert.ok(inOrg && inOrg.id === northItem.id);
    assert.equal(outOrg, null);
    const inBranch = await wcsRepo.getSubmissionByOrgBranchAndId(
      pool,
      orgA.id,
      branchNorth.id,
      northItem.id
    );
    const wrongBranch = await wcsRepo.getSubmissionByOrgBranchAndId(
      pool,
      orgA.id,
      branchA.id,
      northItem.id
    );
    assert.ok(inBranch && inBranch.id === northItem.id);
    assert.equal(wrongBranch, null);

    const asserted = await wcsSvc.assertSubmissionInOrganization(pool, {
      organizationId: orgB.id,
      submissionId: northItem.id,
    });
    assert.equal(asserted.ok, false);
    assert.equal(asserted.status, wcsSvc.STATUS.NOT_FOUND);
  });

  it("branch administrator sees only their assigned branch", async () => {
    skipIfNeeded();
    assert.ok(branchNorth && branchNorth.id);
    const { res } = await authedGet(
      HOST_A,
      "/branch-admin/website/submissions",
      users.branchA.rawToken
    );
    assert.doesNotMatch(res.text, /North Only/);
  });
});
