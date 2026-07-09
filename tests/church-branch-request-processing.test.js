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
const membersRepo = require("../src/db/pg/church/membersRepo");
const memberRequestsRepo = require("../src/db/pg/church/memberRequestsRepo");
const prayerRequestsRepo = require("../src/db/pg/church/prayerRequestsRepo");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");

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
      secret: "test-church-branch-request-processing",
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
    await pool.query(`DELETE FROM public.church_prayer_requests WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_member_requests WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_members WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("non-church host cannot access /branch/requests", async () => {
  const app = makeApp(null, false);
  const res = await request(app).get("/branch/requests");
  assert.equal(res.status, 404);
});

test("unauthenticated visitor redirects to /branch/login", async () => {
  const app = makeApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const res = await request(app).get("/branch/requests");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/branch/login");
});

test(
  "branch admin request and prayer processing",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("rp");
    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `rp_a_${suffix}`,
      name: `RP Church A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `rp_b_${suffix}`,
      name: `RP Church B ${suffix}`,
    });
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      name: `RP Branch A ${suffix}`,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      name: `RP Branch B ${suffix}`,
    });
    const passwordHash = await bcrypt.hash("testpass123", 12);
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      full_name: "Branch Admin A",
      email: `admin_a_${suffix}@example.com`,
      phone: "0977111001",
      password_hash: passwordHash,
      role: "branch_admin",
    });
    const memberA = await membersRepo.createPendingMember(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      platform_tenant_id: TENANT_ZM,
      email: `member_a_${suffix}@example.com`,
      phone: "0977111002",
      full_name: "Member A",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
    });
    await membersRepo.updateMemberStatusForBranch(pool, memberA.id, branchA.id, "verified");

    const memberB = await membersRepo.createPendingMember(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      platform_tenant_id: TENANT_ZM,
      email: `member_b_${suffix}@example.com`,
      phone: "0977111003",
      full_name: "Member B",
      password_hash: passwordHash,
      gender: "female",
      age_group: "Adult (36-60)",
      address_area: "Other",
      attendance_duration: "Less than 6 months",
    });
    await membersRepo.updateMemberStatusForBranch(pool, memberB.id, branchB.id, "verified");

    const memberRequestA = await memberRequestsRepo.createMemberRequest(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      member_id: memberA.id,
      request_type: "Baptism",
      subject: "Baptism request",
      description: "Please schedule baptism.",
    });
    const memberRequestB = await memberRequestsRepo.createMemberRequest(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      member_id: memberB.id,
      request_type: "Counseling",
      subject: "Other branch request",
      description: "Should not be visible.",
    });
    const anonymousPrayer = await prayerRequestsRepo.createPrayerRequest(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      member_id: memberA.id,
      prayer_topic: "Family healing",
      details: "Please pray for my family.",
      urgency: "urgent",
      privacy_level: "anonymous_summary",
    });
    const teamPrayer = await prayerRequestsRepo.createPrayerRequest(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      member_id: memberA.id,
      prayer_topic: "Job search",
      details: "Pray for employment.",
      urgency: "normal",
      privacy_level: "prayer_team",
    });

    const app = makeApp({
      kind: "branch",
      orgSlug: orgA.slug,
      organization: orgA,
      branch: branchA,
    });
    const adminAgent = request.agent(app);
    await adminAgent.post("/branch/login").type("form").send({
      identifier: `admin_a_${suffix}@example.com`,
      password: "testpass123",
    });

    const queue = await adminAgent.get("/branch/requests");
    assert.equal(queue.status, 200);
    assert.match(queue.text, /Baptism request/);
    assert.match(queue.text, /Member A/);

    const crossBranch = await adminAgent.get(`/branch/requests/${memberRequestB.id}`);
    assert.equal(crossBranch.status, 404);

    const startReview = await adminAgent
      .post(`/branch/requests/${memberRequestA.id}/start-review`)
      .type("form")
      .send({});
    assert.equal(startReview.status, 303);
    const inReview = await memberRequestsRepo.findMemberRequestByIdForBranch(
      pool,
      memberRequestA.id,
      branchA.id
    );
    assert.equal(inReview.status, "in_review");

    const approve = await adminAgent
      .post(`/branch/requests/${memberRequestA.id}/approve`)
      .type("form")
      .send({ admin_comment: "Approved for next service." });
    assert.equal(approve.status, 303);
    const approved = await memberRequestsRepo.findMemberRequestByIdForBranch(
      pool,
      memberRequestA.id,
      branchA.id
    );
    assert.equal(approved.status, "approved");
    assert.equal(approved.admin_comment, "Approved for next service.");

    const rejectNoComment = await adminAgent
      .post(`/branch/requests/${memberRequestA.id}/reject`)
      .type("form")
      .send({});
    assert.equal(rejectNoComment.status, 400);
    assert.match(rejectNoComment.text, /Please enter a comment/);

    const memberAgent = request.agent(app);
    await memberAgent.post("/login").type("form").send({
      identifier: `member_a_${suffix}@example.com`,
      password: "testpass123",
    });
    const memberDetail = await memberAgent.get(`/member/requests/${memberRequestA.id}`);
    assert.equal(memberDetail.status, 200);
    assert.match(memberDetail.text, /Approved for next service/);

    const secondRequest = await memberRequestsRepo.createMemberRequest(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      member_id: memberA.id,
      request_type: "Counseling",
      subject: "Counseling request",
      description: "Need pastoral counseling.",
    });
    const reject = await adminAgent
      .post(`/branch/requests/${secondRequest.id}/reject`)
      .type("form")
      .send({ admin_comment: "Please contact the office directly." });
    assert.equal(reject.status, 303);
    const rejected = await memberRequestsRepo.findMemberRequestByIdForBranch(
      pool,
      secondRequest.id,
      branchA.id
    );
    assert.equal(rejected.status, "rejected");

    const moreInfoRequest = await memberRequestsRepo.createMemberRequest(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      member_id: memberA.id,
      request_type: "Membership",
      subject: "Membership transfer",
      description: "Transfer from another church.",
    });
    const moreInfoNoComment = await adminAgent
      .post(`/branch/requests/${moreInfoRequest.id}/request-more-info`)
      .type("form")
      .send({});
    assert.equal(moreInfoNoComment.status, 400);

    const moreInfo = await adminAgent
      .post(`/branch/requests/${moreInfoRequest.id}/request-more-info`)
      .type("form")
      .send({ admin_comment: "Please provide your previous church letter." });
    assert.equal(moreInfo.status, 303);

    const prayerQueue = await adminAgent.get("/branch/prayer-requests");
    assert.equal(prayerQueue.status, 200);
    assert.match(prayerQueue.text, /Family healing/);
    assert.match(prayerQueue.text, /Anonymous/);
    assert.doesNotMatch(prayerQueue.text, /Member A/);

    const prayerDetail = await adminAgent.get(`/branch/prayer-requests/${anonymousPrayer.id}`);
    assert.equal(prayerDetail.status, 200);
    assert.match(prayerDetail.text, /Anonymous/);

    const crossPrayer = await adminAgent.get(`/branch/prayer-requests/${teamPrayer.id}`);
    assert.equal(crossPrayer.status, 200);

    const crossBranchPrayer = await adminAgent.get(
      `/branch/prayer-requests/${teamPrayer.id}`.replace(String(teamPrayer.id), "999999")
    );
    assert.equal(crossBranchPrayer.status, 404);

    const markReviewed = await adminAgent
      .post(`/branch/prayer-requests/${teamPrayer.id}/mark-reviewed`)
      .type("form")
      .send({ admin_comment: "Added to prayer list." });
    assert.equal(markReviewed.status, 303);

    const closePrayer = await adminAgent
      .post(`/branch/prayer-requests/${anonymousPrayer.id}/close`)
      .type("form")
      .send({});
    assert.equal(closePrayer.status, 303);
    const closedPrayer = await prayerRequestsRepo.findPrayerRequestByIdForBranch(
      pool,
      anonymousPrayer.id,
      branchA.id,
      { adminRole: "branch_admin" }
    );
    assert.equal(closedPrayer.status, "closed");

    await cleanup(pool, [branchA.id, branchB.id], [orgA.id, orgB.id]);
  }
);
