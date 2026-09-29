"use strict";

const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");
const {
  parseMemberDirectoryQuery,
  parseVerificationQueueQuery,
  resolveMemberListState,
  MEMBER_STATUS_FILTERS,
} = require("../src/church/memberDirectoryValidation");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeApp(ctx, isChurchHost = true) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "test-phase6-members",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = isChurchHost;
    req.churchContext = ctx;
    next();
  });
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

async function cleanup(pool, branchIds, orgIds) {
  for (const branchId of branchIds) {
    await pool.query(`DELETE FROM public.church_audit_logs WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_members WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("parseMemberDirectoryQuery allowlists status and branch_id", () => {
  assert.deepEqual(parseMemberDirectoryQuery({ status: "verified", q: " Ada ", branch_id: "12" }), {
    status: "verified",
    q: "Ada",
    branchId: 12,
  });
  assert.equal(parseMemberDirectoryQuery({ status: "hacker'; drop table" }).status, "all");
  assert.equal(parseMemberDirectoryQuery({ branch_id: "-3" }).branchId, null);
  assert.equal(parseMemberDirectoryQuery({ branch_id: "1.5" }).branchId, null);
  assert.ok(MEMBER_STATUS_FILTERS.includes("pending"));
});

test("parseVerificationQueueQuery stays on pending status system", () => {
  assert.equal(parseVerificationQueueQuery({ status: "verified" }).status, "pending");
  assert.equal(parseVerificationQueueQuery({ status: "pending", q: "jo" }).q, "jo");
});

test("resolveMemberListState distinguishes empty and no_results", () => {
  assert.equal(resolveMemberListState({ q: "", status: "all" }, [], { hasMembersInScope: false }), "empty");
  assert.equal(resolveMemberListState({ q: "x", status: "all" }, []), "no_results");
  assert.equal(resolveMemberListState({ q: "", status: "pending" }, []), "no_results");
  assert.equal(resolveMemberListState({ q: "", status: "all" }, [{ id: 1 }]), "results");
});

test("non-church host cannot access Phase 6 member routes", async () => {
  const app = makeApp(null, false);
  assert.equal((await request(app).get("/branch/members")).status, 404);
  assert.equal((await request(app).get("/branch/member-verification")).status, 404);
  assert.equal((await request(app).get("/hq/members")).status, 404);
  assert.equal((await request(app).get("/hq/member-verification")).status, 404);
});

test("unauthenticated branch visitor redirects to login", async () => {
  const app = makeApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active", plan_code: "foundation" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const directory = await request(app).get("/branch/members");
  assert.equal(directory.status, 302);
  assert.equal(directory.headers.location, "/branch/login");
  const queue = await request(app).get("/branch/member-verification");
  assert.equal(queue.status, 302);
  assert.equal(queue.headers.location, "/branch/login");
});

test(
  "Phase 6 branch verification queue and member directory filters, search, isolation, responsive hooks",
  async (t) => {
    if (!isPgConfigured()) return t.skip("PostgreSQL not configured");
    const pool = getPgPool();
    try {
      await ensureCanonicalTenantsForTests(pool);
      await ensureChurchSchema(pool);
    } catch (err) {
      return t.skip(`Church PG schema unavailable: ${err.message}`);
    }
    const suffix = makeSuffix("p6md");
    const passwordHash = await bcrypt.hash("testpass123", 12);

    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `p6a_${suffix}`.slice(0, 40),
      name: `Phase6 A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `p6b_${suffix}`.slice(0, 40),
      name: `Phase6 B ${suffix}`,
    });
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      host_slug: `hs_branchA_${suffix}`.slice(0, 40),
      name: `Branch A ${suffix}`,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      host_slug: `hs_branchB_${suffix}`.slice(0, 40),
      name: `Branch B ${suffix}`,
    });
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      full_name: "Admin A",
      email: `admin_a_${suffix}@example.com`,
      phone: "0977111001",
      password_hash: passwordHash,
    });
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      full_name: "Admin B",
      email: `admin_b_${suffix}@example.com`,
      phone: "0977111002",
      password_hash: passwordHash,
    });

    const pending = await membersRepo.createPendingMember(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      platform_tenant_id: TENANT_ZM,
      email: `pending_${suffix}@example.com`,
      phone: "0977111222",
      full_name: "Pending Applicant",
      password_hash: passwordHash,
      gender: "female",
      age_group: "Youth (18-35)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
      ministry_interest: "youth",
    });
    const verified = await membersRepo.createPendingMember(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      platform_tenant_id: TENANT_ZM,
      email: `verified_${suffix}@example.com`,
      phone: "0977111333",
      full_name: "Verified Member",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "1-3 years",
      ministry_interest: "choir",
    });
    await membersRepo.updateMemberStatusForBranch(pool, verified.id, branchA.id, "verified");

    const otherPending = await membersRepo.createPendingMember(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      platform_tenant_id: TENANT_ZM,
      email: `other_${suffix}@example.com`,
      phone: "0977111444",
      full_name: "Other Org Pending",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Lusaka",
      attendance_duration: "Less than 6 months",
      ministry_interest: "ushering",
    });

    const appA = makeApp({
      kind: "branch",
      orgSlug: orgA.slug,
      organization: orgA,
      branch: branchA,
    });
    const agent = request.agent(appA);
    await agent.post("/branch/login").type("form").send({
      identifier: `admin_a_${suffix}@example.com`,
      password: "testpass123",
    });

    const queue = await agent.get("/branch/member-verification");
    assert.equal(queue.status, 200);
    assert.match(queue.text, /data-p6-screen="verification-queue"/);
    assert.match(queue.text, /data-testid="verification-table"/);
    assert.match(queue.text, /data-testid="verification-cards"/);
    assert.match(queue.text, /Pending Applicant/);
    assert.doesNotMatch(queue.text, /Other Org Pending/);
    assert.doesNotMatch(queue.text, /Verified Member/);

    const queueSearchHit = await agent.get("/branch/member-verification?q=Pending");
    assert.equal(queueSearchHit.status, 200);
    assert.match(queueSearchHit.text, /Pending Applicant/);
    assert.match(queueSearchHit.text, /data-list-state="results"/);

    const queueSearchMiss = await agent.get("/branch/member-verification?q=zzzz-no-match");
    assert.equal(queueSearchMiss.status, 200);
    assert.match(queueSearchMiss.text, /data-testid="verification-no-results"/);
    assert.match(queueSearchMiss.text, /data-list-state="no_results"/);

    const queueInvalid = await agent.get("/branch/member-verification?status=not-a-status&branch_id=abc");
    assert.equal(queueInvalid.status, 200);
    assert.match(queueInvalid.text, /Pending Applicant/);

    const directory = await agent.get("/branch/members");
    assert.equal(directory.status, 200);
    assert.match(directory.text, /data-p6-screen="member-directory"/);
    assert.match(directory.text, /data-testid="directory-table"/);
    assert.match(directory.text, /data-testid="directory-cards"/);
    assert.match(directory.text, /Verified Member/);
    assert.match(directory.text, /Pending Applicant/);
    assert.doesNotMatch(directory.text, /Other Org Pending/);

    const filtered = await agent.get("/branch/members?status=verified");
    assert.equal(filtered.status, 200);
    assert.match(filtered.text, /Verified Member/);
    assert.doesNotMatch(filtered.text, /Pending Applicant/);

    const search = await agent.get(`/branch/members?q=verified_${suffix}@example.com`);
    assert.equal(search.status, 200);
    assert.match(search.text, /Verified Member/);

    const noResults = await agent.get("/branch/members?q=zzzz-no-match");
    assert.equal(noResults.status, 200);
    assert.match(noResults.text, /data-testid="directory-no-results"/);

    const invalidDir = await agent.get("/branch/members?status=DROP+TABLE&branch_id=-9");
    assert.equal(invalidDir.status, 200);
    assert.match(invalidDir.text, /Member Directory/);

    const memberAgent = request.agent(appA);
    await memberAgent.post("/login").type("form").send({
      identifier: `verified_${suffix}@example.com`,
      password: "testpass123",
    });
    const memberBlocked = await memberAgent.get("/branch/members");
    assert.equal(memberBlocked.status, 302);
    assert.equal(memberBlocked.headers.location, "/branch/login");

    const appB = makeApp({
      kind: "branch",
      orgSlug: orgB.slug,
      organization: orgB,
      branch: branchB,
    });
    const agentB = request.agent(appB);
    await agentB.post("/branch/login").type("form").send({
      identifier: `admin_b_${suffix}@example.com`,
      password: "testpass123",
    });
    const crossQueue = await agentB.get("/branch/member-verification");
    assert.equal(crossQueue.status, 200);
    assert.match(crossQueue.text, /Other Org Pending/);
    assert.doesNotMatch(crossQueue.text, /Pending Applicant/);
    const crossProfile = await agentB.get(`/branch/members/${pending.id}`);
    assert.equal(crossProfile.status, 404);

    await cleanup(pool, [branchA.id, branchB.id], [orgA.id, orgB.id]);
    void otherPending;
  }
);

test(
  "Phase 6 HQ directory and verification: Growth access, branch filter, tenant isolation",
  async (t) => {
    if (!isPgConfigured()) return t.skip("PostgreSQL not configured");
    const pool = getPgPool();
    try {
      await ensureCanonicalTenantsForTests(pool);
      await ensureChurchSchema(pool);
    } catch (err) {
      return t.skip(`Church PG schema unavailable: ${err.message}`);
    }
    const suffix = makeSuffix("p6hq");
    const passwordHash = await bcrypt.hash("hq_pass_123456", 12);

    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `p6hq_${suffix}`.slice(0, 40),
      name: `Phase6 HQ ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      org.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );
    const orgFresh = await organizationsRepo.findOrganizationById(pool, org.id);

    const orgOther = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `p6hqo_${suffix}`.slice(0, 40),
      name: `Phase6 HQ Other ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgOther.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );

    const branch1 = await branchesRepo.createBranch(pool, {
      organization_id: orgFresh.id,
      slug: `b1_${suffix}`.slice(0, 30),
      host_slug: `b1_${suffix}`.slice(0, 30),
      name: "Campus One",
      status: "active",
    });
    const branch2 = await branchesRepo.createBranch(pool, {
      organization_id: orgFresh.id,
      slug: `b2_${suffix}`.slice(0, 30),
      host_slug: `b2_${suffix}`.slice(0, 30),
      name: "Campus Two",
      status: "active",
    });
    const branchOther = await branchesRepo.createBranch(pool, {
      organization_id: orgOther.id,
      slug: `bo_${suffix}`.slice(0, 30),
      host_slug: `bo_${suffix}`.slice(0, 30),
      name: "Other Org Campus",
      status: "active",
    });

    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgFresh.id,
      full_name: "HQ Admin",
      email: `hq_${suffix}@example.com`,
      phone: "0977222001",
      password_hash: passwordHash,
    });

    const pending1 = await membersRepo.createPendingMember(pool, {
      organization_id: orgFresh.id,
      branch_id: branch1.id,
      platform_tenant_id: TENANT_ZM,
      email: `p1_${suffix}@example.com`,
      phone: "0977222111",
      full_name: "HQ Pending One",
      password_hash: passwordHash,
      gender: "female",
      age_group: "Youth (18-35)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
      ministry_interest: "youth",
    });
    await membersRepo.createPendingMember(pool, {
      organization_id: orgFresh.id,
      branch_id: branch2.id,
      platform_tenant_id: TENANT_ZM,
      email: `p2_${suffix}@example.com`,
      phone: "0977222222",
      full_name: "HQ Pending Two",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
      ministry_interest: "choir",
    });
    await membersRepo.createPendingMember(pool, {
      organization_id: orgOther.id,
      branch_id: branchOther.id,
      platform_tenant_id: TENANT_ZM,
      email: `px_${suffix}@example.com`,
      phone: "0977222333",
      full_name: "Foreign Pending",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Ndola",
      attendance_duration: "Less than 6 months",
      ministry_interest: "ushering",
    });

    const app = makeApp({
      kind: "branch",
      orgSlug: orgFresh.slug,
      organization: orgFresh,
      branch: branch1,
    });
    const agent = request.agent(app);
    const hqLogin = await agent.post("/hq/login").type("form").send({
      identifier: `hq_${suffix}@example.com`,
      password: "hq_pass_123456",
    });
    assert.equal(hqLogin.status, 303);

    const directory = await agent.get("/hq/members");
    assert.equal(directory.status, 200);
    assert.match(directory.text, /data-p6-screen="member-directory"/);
    assert.match(directory.text, /name="branch_id"/);
    assert.match(directory.text, /HQ Pending One/);
    assert.match(directory.text, /HQ Pending Two/);
    assert.doesNotMatch(directory.text, /Foreign Pending/);
    assert.match(directory.text, /data-testid="hq-nav-member-verification"/);
    assert.match(directory.text, /href="\/hq\/member-verification"/);
    assert.match(directory.text, /href="\/hq\/members"/);
    assert.equal((directory.text.match(/data-testid="hq-nav-member-verification"/g) || []).length, 2); // desktop + mobile

    const branchFiltered = await agent.get(`/hq/members?branch_id=${branch1.id}&status=pending`);
    assert.equal(branchFiltered.status, 200);
    assert.match(branchFiltered.text, /HQ Pending One/);
    assert.doesNotMatch(branchFiltered.text, /HQ Pending Two/);

    const badBranch = await agent.get(`/hq/members?branch_id=${branchOther.id}`);
    assert.equal(badBranch.status, 200);
    assert.doesNotMatch(badBranch.text, /Foreign Pending/);

    const queue = await agent.get("/hq/member-verification");
    assert.equal(queue.status, 200);
    assert.match(queue.text, /data-p6-screen="verification-queue"/);
    assert.match(queue.text, /HQ Pending One/);
    assert.match(queue.text, /HQ Pending Two/);
    assert.doesNotMatch(queue.text, /Foreign Pending/);
    assert.match(
      queue.text,
      /church-branch-nav-link--active[\s\S]{0,240}?data-nav-key="verification"/
    );
    assert.match(queue.text, /church-admin-mobile-nav__group is-open"\s+data-church-nav-group="people"/);

    const queueBranch = await agent.get(`/hq/member-verification?branch_id=${branch2.id}`);
    assert.equal(queueBranch.status, 200);
    assert.match(queueBranch.text, /HQ Pending Two/);
    assert.doesNotMatch(queueBranch.text, /HQ Pending One/);
    assert.match(
      queueBranch.text,
      /church-branch-nav-link--active[\s\S]{0,240}?data-nav-key="verification"/
    );

    const detail = await agent.get(`/hq/members/${pending1.id}`);
    assert.equal(detail.status, 200);

    await cleanup(pool, [branch1.id, branch2.id, branchOther.id], [orgFresh.id, orgOther.id]);
  }
);

test(
  "Foundation HQ cannot open Growth member directory routes",
  async (t) => {
    if (!isPgConfigured()) return t.skip("PostgreSQL not configured");
    const pool = getPgPool();
    try {
      await ensureCanonicalTenantsForTests(pool);
      await ensureChurchSchema(pool);
    } catch (err) {
      return t.skip(`Church PG schema unavailable: ${err.message}`);
    }
    const suffix = makeSuffix("p6fnd");
    const passwordHash = await bcrypt.hash("hq_pass_123456", 12);
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `p6f_${suffix}`.slice(0, 40),
      name: `Phase6 Found ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      org.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: null },
      null
    );
    const orgFresh = await organizationsRepo.findOrganizationById(pool, org.id);
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: orgFresh.id,
      slug: "main",
      host_slug: `hs_foundationBranch_${suffix}`.slice(0, 40),
      name: "Main",
      status: "active",
    });
    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgFresh.id,
      full_name: "HQ Found",
      email: `hqf_${suffix}@example.com`,
      phone: "0977333001",
      password_hash: passwordHash,
    });
    const app = makeApp({
      kind: "branch",
      orgSlug: orgFresh.slug,
      organization: orgFresh,
      branch,
    });
    const agent = request.agent(app);
    await agent.post("/hq/login").type("form").send({
      identifier: `hqf_${suffix}@example.com`,
      password: "hq_pass_123456",
    });
    assert.equal((await agent.get("/hq/members")).status, 403);
    assert.equal((await agent.get("/hq/member-verification")).status, 403);
    const dash = await agent.get("/hq/dashboard");
    assert.equal(dash.status, 200);
    assert.doesNotMatch(dash.text, /data-testid="hq-nav-member-verification"/);
    assert.doesNotMatch(dash.text, /href="\/hq\/member-verification"/);
    assert.match(dash.text, /href="\/hq\/members"/);
    await cleanup(pool, [branch.id], [orgFresh.id]);
  }
);
