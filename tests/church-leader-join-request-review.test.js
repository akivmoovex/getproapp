"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const ministriesRepo = require("../src/db/pg/church/ministriesRepo");
const ministryLeadersRepo = require("../src/db/pg/church/ministryLeadersRepo");
const memberMinistriesRepo = require("../src/db/pg/church/memberMinistriesRepo");
const ministryJoinRequestsRepo = require("../src/db/pg/church/ministryJoinRequestsRepo");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { churchPgSkipIfUnconfigured, requireChurchPgOrSkip } = require("./helpers/churchPgTest");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");
const { setChurchMemberSession } = require("../src/church/memberAuth");
const { setChurchBranchAdminSession } = require("../src/church/branchAdminAuth");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeApp(ctx, sessionHook) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "test-leader-join-review",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = ctx;
    if (typeof sessionHook === "function") sessionHook(req);
    next();
  });
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

async function cleanup(pool, branchIds, orgIds) {
  for (const branchId of branchIds) {
    await pool.query(`DELETE FROM public.church_audit_logs WHERE branch_id = $1`, [branchId]).catch(() => {});
    await pool.query(`DELETE FROM public.church_ministry_join_requests WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_member_ministries WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_ministry_leaders WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_ministries WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_members WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("anonymous users are blocked from leader join-request routes", async () => {
  const app = makeApp({
    kind: "branch",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const list = await request(app).get("/leader/requests");
  assert.equal(list.status, 302);
  assert.equal(list.headers.location, "/leader/login");
  const detail = await request(app).get("/leader/requests/1");
  assert.equal(detail.status, 302);
  assert.equal(detail.headers.location, "/leader/login");
});

test("member session cannot access leader join-request routes", async () => {
  const app = makeApp(
    {
      kind: "branch",
      organization: { id: 9, name: "Demo", status: "active" },
      branch: { id: 9, name: "Demo Branch", status: "active" },
    },
    (req) => {
      setChurchMemberSession(req, {
        member_id: 99,
        organization_id: 9,
        branch_id: 9,
        full_name: "Member User",
        status: "verified",
      });
    }
  );
  const list = await request(app).get("/leader/requests");
  assert.equal(list.status, 302);
  assert.equal(list.headers.location, "/leader/login");
});

test("branch admin session cannot access leader join-request routes", async () => {
  const app = makeApp(
    {
      kind: "branch",
      organization: { id: 9, name: "Demo", status: "active" },
      branch: { id: 9, name: "Demo Branch", status: "active" },
    },
    (req) => {
      setChurchBranchAdminSession(req, {
        admin_id: 44,
        organization_id: 9,
        branch_id: 9,
        full_name: "Branch Admin",
        role: "branch_admin",
      });
    }
  );
  const list = await request(app).get("/leader/requests");
  assert.equal(list.status, 302);
  assert.equal(list.headers.location, "/leader/login");
});

test("existing leader routes remain registered and join-request routes are present", () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/routes/church/leaderPortal.js"), "utf8");
  assert.match(src, /router\.get\("\/leader\/dashboard"/);
  assert.match(src, /router\.get\("\/leader\/roster"/);
  assert.match(src, /registerLeaderJoinRequestRoutes/);
  const joinSrc = fs.readFileSync(
    path.join(__dirname, "../src/routes/church/leaderJoinRequests.js"),
    "utf8"
  );
  assert.match(joinSrc, /\/leader\/requests/);
  assert.match(joinSrc, /\/leader\/requests\/:requestId\/recommend/);
  assert.doesNotMatch(joinSrc, /camp|mentor|expense|emergency|volunteer|onboarding/i);
});

test(
  "leader join request review workflow",
  churchPgSkipIfUnconfigured(),
  async (t) => {
    const pool = await requireChurchPgOrSkip(t);
    if (!pool) return;

    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("ljrr");
    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `ljrr_a_${suffix}`.replace(/[^a-z0-9_]/g, "").slice(0, 40),
      name: `Leader Join Church A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `ljrr_b_${suffix}`.replace(/[^a-z0-9_]/g, "").slice(0, 40),
      name: `Leader Join Church B ${suffix}`,
    });
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      name: `Leader Join Branch A ${suffix}`,
    });
    const branchA2 = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "east",
      name: `Leader Join Branch A2 ${suffix}`,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      name: `Leader Join Branch B ${suffix}`,
    });

    const passwordHash = await bcrypt.hash("testpass123", 12);
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      full_name: "Admin A",
      email: `admin_ljrr_${suffix}@example.com`,
      phone: "0977000001",
      password_hash: passwordHash,
    });

    const youth = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      name: "Youth Ministry",
      slug: "youth",
      description: "Youth",
      leader_name: "Youth Leader",
      visibility: "members",
      status: "published",
      created_by_admin_id: null,
    });
    const choir = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      name: "Choir Ministry",
      slug: "choir",
      description: "Choir",
      leader_name: "Choir Leader",
      visibility: "members",
      status: "published",
      created_by_admin_id: null,
    });
    const youthOtherBranch = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA2.id,
      name: "Other Branch Youth",
      slug: "youth-east",
      description: "East youth",
      leader_name: "East Leader",
      visibility: "members",
      status: "published",
      created_by_admin_id: null,
    });
    const youthOtherOrg = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      name: "Other Org Youth",
      slug: "youth",
      description: "Other org",
      leader_name: "Other Org Leader",
      visibility: "members",
      status: "published",
      created_by_admin_id: null,
    });

    const youthLeader = await ministryLeadersRepo.createMinistryLeader(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      ministry_id: youth.id,
      full_name: "Youth Leader",
      email: `youth.leader_${suffix}@example.com`,
      phone: "0977000011",
      password_hash: passwordHash,
      role: "ministry_leader",
      status: "active",
    });
    await ministryLeadersRepo.createMinistryLeader(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      ministry_id: choir.id,
      full_name: "Choir Leader",
      email: `choir.leader_${suffix}@example.com`,
      phone: "0977000012",
      password_hash: passwordHash,
      role: "ministry_leader",
      status: "active",
    });

    const member = await membersRepo.createPendingMember(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      platform_tenant_id: TENANT_ZM,
      email: `member_ljrr_${suffix}@example.com`,
      phone: "0977333002",
      full_name: "Join Applicant",
      password_hash: passwordHash,
      gender: "female",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
      ministry_interest: "youth",
    });
    await membersRepo.updateMemberStatusForBranch(pool, member.id, branchA.id, "verified");

    const searchable = await membersRepo.createPendingMember(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      platform_tenant_id: TENANT_ZM,
      email: `searchable_${suffix}@example.com`,
      phone: "0977444555",
      full_name: `UniqueSearchName ${suffix}`,
      password_hash: passwordHash,
    });
    await membersRepo.updateMemberStatusForBranch(pool, searchable.id, branchA.id, "verified");

    const otherBranchMember = await membersRepo.createPendingMember(pool, {
      organization_id: orgA.id,
      branch_id: branchA2.id,
      platform_tenant_id: TENANT_ZM,
      email: `otherbranch_${suffix}@example.com`,
      phone: "0977666777",
      full_name: "Other Branch Member",
      password_hash: passwordHash,
    });
    await membersRepo.updateMemberStatusForBranch(pool, otherBranchMember.id, branchA2.id, "verified");

    const otherOrgMember = await membersRepo.createPendingMember(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      platform_tenant_id: TENANT_ZM,
      email: `otherorg_${suffix}@example.com`,
      phone: "0977888999",
      full_name: "Other Org Member",
      password_hash: passwordHash,
    });
    await membersRepo.updateMemberStatusForBranch(pool, otherOrgMember.id, branchB.id, "verified");

    try {
      const appA = makeApp({
        kind: "branch",
        orgSlug: orgA.slug,
        organization: orgA,
        branch: branchA,
      });
      const memberAgent = request.agent(appA);
      await memberAgent.post("/login").type("form").send({
        identifier: `member_ljrr_${suffix}@example.com`,
        password: "testpass123",
      });

      const submit = await memberAgent
        .post(`/member/ministries/${youth.id}/request-join`)
        .type("form")
        .send({ message: "I want to join youth ministry." });
      assert.equal(submit.status, 303);

      const searchMemberAgent = request.agent(appA);
      await searchMemberAgent.post("/login").type("form").send({
        identifier: `searchable_${suffix}@example.com`,
        password: "testpass123",
      });
      const submitSearch = await searchMemberAgent
        .post(`/member/ministries/${youth.id}/request-join`)
        .type("form")
        .send({ message: "Searchable applicant." });
      assert.equal(submitSearch.status, 303);

      const choirReq = await ministryJoinRequestsRepo.createJoinRequestForMember(pool, {
        organization_id: orgA.id,
        branch_id: branchA.id,
        member_id: member.id,
        ministry_id: choir.id,
        message: "Choir request should be hidden from youth leader",
      });
      const otherBranchReq = await ministryJoinRequestsRepo.createJoinRequestForMember(pool, {
        organization_id: orgA.id,
        branch_id: branchA2.id,
        member_id: otherBranchMember.id,
        ministry_id: youthOtherBranch.id,
        message: "Other branch request",
      });
      const otherOrgReq = await ministryJoinRequestsRepo.createJoinRequestForMember(pool, {
        organization_id: orgB.id,
        branch_id: branchB.id,
        member_id: otherOrgMember.id,
        ministry_id: youthOtherOrg.id,
        message: "Other org request",
      });

      const youthOpen = await ministryJoinRequestsRepo.listJoinRequestsForBranch(pool, branchA.id, {
        status: "submitted",
        ministryId: youth.id,
      });
      assert.ok(youthOpen.length >= 2);
      const primaryRequest = youthOpen.find((r) => r.member_id === member.id);
      const searchableRequest = youthOpen.find((r) => r.member_id === searchable.id);
      assert.ok(primaryRequest);
      assert.ok(searchableRequest);

      const leaderAgent = request.agent(appA);
      await leaderAgent.post("/leader/login").type("form").send({
        identifier: `youth.leader_${suffix}@example.com`,
        password: "testpass123",
      });

      const list = await leaderAgent.get("/leader/requests");
      assert.equal(list.status, 200);
      assert.match(list.text, /Leader Join Request Review/);
      assert.match(list.text, /Join Applicant/);
      assert.match(list.text, /data-leader-join-requests-desktop/);
      assert.match(list.text, /data-leader-join-requests-mobile/);
      assert.match(list.text, /data-leader-pending-count/);
      assert.doesNotMatch(list.text, /Camp request|Mentor request|Expense request|Emergency request|AI triage|New Request/i);
      assert.doesNotMatch(list.text, /Choir request should be hidden|Other Branch Member|Other org request/i);
      assert.doesNotMatch(list.text, /password_hash|secret_answer|reset_token/i);
      assert.match(list.text, /href="\/leader\/requests"/);
      assert.match(list.text, /church-member-nav-link--active/);

      const search = await leaderAgent.get(
        `/leader/requests?q=${encodeURIComponent(`UniqueSearchName ${suffix}`)}`
      );
      assert.equal(search.status, 200);
      assert.match(search.text, new RegExp(`UniqueSearchName ${suffix}`));
      assert.doesNotMatch(search.text, /Join Applicant/);

      const statusFilter = await leaderAgent.get("/leader/requests?status=submitted");
      assert.equal(statusFilter.status, 200);
      assert.match(statusFilter.text, /Join Applicant|UniqueSearchName/);

      const notReviewed = await leaderAgent.get("/leader/requests?leader_review=not_reviewed");
      assert.equal(notReviewed.status, 200);
      assert.match(notReviewed.text, /Join Applicant/);

      for (let i = 0; i < 21; i += 1) {
        const m = await membersRepo.createPendingMember(pool, {
          organization_id: orgA.id,
          branch_id: branchA.id,
          platform_tenant_id: TENANT_ZM,
          email: `page_${i}_${suffix}@example.com`,
          phone: `0977${String(100000 + i)}`,
          full_name: `Page Member ${i} ${suffix}`,
          password_hash: passwordHash,
        });
        await membersRepo.updateMemberStatusForBranch(pool, m.id, branchA.id, "verified");
        await ministryJoinRequestsRepo.createJoinRequestForMember(pool, {
          organization_id: orgA.id,
          branch_id: branchA.id,
          member_id: m.id,
          ministry_id: youth.id,
          message: `Pagination ${i}`,
        });
      }
      const page1 = await leaderAgent.get("/leader/requests?status=submitted");
      assert.equal(page1.status, 200);
      assert.match(page1.text, /data-leader-join-requests-pagination|Next/);
      const page2 = await leaderAgent.get("/leader/requests?status=submitted&page=2");
      assert.equal(page2.status, 200);
      assert.match(page2.text, /Previous|page 2/i);

      const detail = await leaderAgent.get(`/leader/requests/${primaryRequest.id}`);
      assert.equal(detail.status, 200);
      assert.match(detail.text, /Join Applicant/);
      assert.match(detail.text, /0977333002|member_ljrr_/);
      assert.match(detail.text, /I want to join youth ministry/);
      assert.match(detail.text, /data-leader-recommend-form/);
      assert.doesNotMatch(detail.text, /password_hash|secret_answer|prayer request/i);

      const badRecommend = await leaderAgent
        .post(`/leader/requests/${primaryRequest.id}/recommend`)
        .type("form")
        .send({ recommendation: "approve_final", leader_comment: "nope" });
      assert.equal(badRecommend.status, 400);

      const missingComment = await leaderAgent
        .post(`/leader/requests/${primaryRequest.id}/recommend`)
        .type("form")
        .send({ recommendation: "do_not_recommend", leader_comment: "" });
      assert.equal(missingComment.status, 400);

      const recommend = await leaderAgent
        .post(`/leader/requests/${primaryRequest.id}/recommend`)
        .type("form")
        .send({
          recommendation: "recommend_approval",
          leader_comment: "Strong fit for youth.",
        });
      assert.equal(recommend.status, 303);

      const stored = await ministryJoinRequestsRepo.findJoinRequestByIdForBranch(
        pool,
        primaryRequest.id,
        branchA.id
      );
      assert.equal(stored.status, "submitted");
      assert.equal(stored.leader_recommendation, "recommend_approval");
      assert.equal(stored.leader_comment, "Strong fit for youth.");
      assert.equal(Number(stored.leader_reviewer_id), Number(youthLeader.id));
      assert.ok(stored.leader_reviewed_at);

      const membershipBefore = await memberMinistriesRepo.findActiveMemberMinistry(
        pool,
        member.id,
        youth.id,
        branchA.id
      );
      assert.equal(membershipBefore, null);

      const reviewedFilter = await leaderAgent.get(
        "/leader/requests?leader_review=recommend_approval"
      );
      assert.equal(reviewedFilter.status, 200);
      assert.match(reviewedFilter.text, /Join Applicant/);

      const crossMinistry = await leaderAgent.get(`/leader/requests/${choirReq.id}`);
      assert.equal(crossMinistry.status, 404);
      const crossBranch = await leaderAgent.get(`/leader/requests/${otherBranchReq.id}`);
      assert.equal(crossBranch.status, 404);
      const crossOrg = await leaderAgent.get(`/leader/requests/${otherOrgReq.id}`);
      assert.equal(crossOrg.status, 404);
      const invalidId = await leaderAgent.get("/leader/requests/99999999");
      assert.equal(invalidId.status, 404);

      const audit = await pool.query(
        `SELECT action, metadata_json FROM public.church_audit_logs
         WHERE branch_id = $1 AND action = 'ministry_join_request_leader_reviewed'
         ORDER BY id DESC LIMIT 1`,
        [branchA.id]
      );
      assert.equal(audit.rows.length, 1);
      assert.equal(audit.rows[0].metadata_json.recommendation, "recommend_approval");
      assert.equal(Number(audit.rows[0].metadata_json.request_id), Number(primaryRequest.id));
      assert.ok(!JSON.stringify(audit.rows[0].metadata_json).includes("Strong fit"));

      const adminAgent = request.agent(appA);
      await adminAgent.post("/branch/login").type("form").send({
        identifier: `admin_ljrr_${suffix}@example.com`,
        password: "testpass123",
      });
      const adminDetail = await adminAgent.get(`/branch/ministry-join-requests/${primaryRequest.id}`);
      assert.equal(adminDetail.status, 200);
      assert.match(adminDetail.text, /data-branch-leader-recommendation/);
      assert.match(adminDetail.text, /Recommend approval|Strong fit for youth/);
      assert.match(adminDetail.text, /Youth Leader/);

      const approve = await adminAgent.post(
        `/branch/ministry-join-requests/${primaryRequest.id}/approve`
      );
      assert.equal(approve.status, 303);

      const afterApprove = await ministryJoinRequestsRepo.findJoinRequestByIdForBranch(
        pool,
        primaryRequest.id,
        branchA.id
      );
      assert.equal(afterApprove.status, "approved");
      assert.equal(afterApprove.leader_recommendation, "recommend_approval");

      const membership = await memberMinistriesRepo.findActiveMemberMinistry(
        pool,
        member.id,
        youth.id,
        branchA.id
      );
      assert.ok(membership);
      assert.equal(membership.status, "active");

      const closedRecommend = await leaderAgent
        .post(`/leader/requests/${primaryRequest.id}/recommend`)
        .type("form")
        .send({
          recommendation: "do_not_recommend",
          leader_comment: "Too late",
        });
      assert.equal(closedRecommend.status, 400);

      const memberBlocked = await memberAgent.get("/leader/requests");
      assert.equal(memberBlocked.status, 302);
      assert.equal(memberBlocked.headers.location, "/leader/login");

      const dash = await leaderAgent.get("/leader/dashboard");
      assert.equal(dash.status, 200);
      assert.match(dash.text, /href="\/leader\/roster"/);
      assert.match(dash.text, /href="\/leader\/requests"/);
      assert.doesNotMatch(dash.text, /Camp Requests|Expense Requests|AI triage/i);
    } finally {
      await cleanup(pool, [branchA.id, branchA2.id, branchB.id], [orgA.id, orgB.id]);
    }
  }
);
