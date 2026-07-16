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
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const prayerRequestsRepo = require("../src/db/pg/church/prayerRequestsRepo");
const pastoralCareRepo = require("../src/db/pg/church/pastoralCareRepo");
const churchRoutes = require("../src/routes/church");
const { transferMemberToBranch } = require("../src/services/church/memberBranchTransferService");
const {
  safePastoralNotificationSubject,
  safePastoralNotificationPreview,
} = require("../src/church/foundationPastoralNotification");
const { CSRF_FIELD, extractCsrf } = require("./helpers/churchPilotSmokeFixtures");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeApp(ctx) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "church-foundation-pastoral-care",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = ctx;
    next();
  });
  app.use(churchRoutes());
  return app;
}

async function postWithCsrf(agent, getPath, postPath, body) {
  const page = await agent.get(getPath);
  const csrf = extractCsrf(page.text);
  return agent
    .post(postPath)
    .type("form")
    .send({ ...(body || {}), [CSRF_FIELD]: csrf || "" });
}

async function cleanup(pool, branchIds, orgIds) {
  for (const branchId of branchIds) {
    await pool.query(`DELETE FROM public.church_pastoral_attachments WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_pastoral_case_follow_ups WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_pastoral_cases WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_safeguarding_incidents WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_prayer_requests WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_audit_logs WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_members WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("notification subjects never include confidential prayer content", () => {
  const subject = safePastoralNotificationSubject("prayer_submitted");
  assert.equal(subject, "New prayer request received");
  assert.doesNotMatch(subject, /family|healing|confidential/i);
  const preview = safePastoralNotificationPreview("Please pray for my family in crisis");
  assert.doesNotMatch(preview, /family|crisis/i);
});

test(
  "Foundation pastoral care: prayer, cases, access control, safeguarding, transfer, isolation",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("fpc");
    const passwordHash = await bcrypt.hash("testpass123", 12);

    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `fpc_${suffix}`,
      name: `FPC Church ${suffix}`,
      plan_code: "growth",
    });
    const otherOrg = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `fpc_o_${suffix}`,
      name: `Other ${suffix}`,
      plan_code: "foundation",
    });
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `Campus A ${suffix}`,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "east",
      name: `Campus B ${suffix}`,
    });
    const otherBranch = await branchesRepo.createBranch(pool, {
      organization_id: otherOrg.id,
      slug: "main",
      name: "Other Branch",
    });

    const ordinaryAdmin = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: org.id,
      branch_id: branchA.id,
      full_name: "Ordinary Admin",
      email: `ordinary_${suffix}@example.com`,
      phone: "0977999101",
      password_hash: passwordHash,
    });
    const pastoralAdmin = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: org.id,
      branch_id: branchA.id,
      full_name: "Pastoral Admin",
      email: `pastoral_${suffix}@example.com`,
      phone: "0977999102",
      password_hash: passwordHash,
    });
    const safeguardingAdmin = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: org.id,
      branch_id: branchA.id,
      full_name: "Safeguarding Admin",
      email: `safeguard_${suffix}@example.com`,
      phone: "0977999103",
      password_hash: passwordHash,
    });
    const pastoralAdminB = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: org.id,
      branch_id: branchB.id,
      full_name: "Pastoral Admin B",
      email: `pastoral_b_${suffix}@example.com`,
      phone: "0977999104",
      password_hash: passwordHash,
    });
    await pool.query(
      `UPDATE public.church_branch_admins
       SET can_access_pastoral = true
       WHERE id IN ($1, $2)`,
      [pastoralAdmin.id, pastoralAdminB.id]
    );
    await pool.query(
      `UPDATE public.church_branch_admins
       SET can_access_safeguarding = true
       WHERE id = $1`,
      [safeguardingAdmin.id]
    );

    const member = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branchA.id,
      platform_tenant_id: TENANT_ZM,
      email: `member_${suffix}@example.com`,
      phone: "0977999110",
      full_name: "Case Member",
      password_hash: passwordHash,
      gender: "female",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "1 year",
    });
    await membersRepo.updateMemberStatusForBranch(pool, member.id, branchA.id, "verified");

    const ctxA = { kind: "branch", orgSlug: org.slug, organization: org, branch: branchA };
    const app = makeApp(ctxA);

    const memberAgent = request.agent(app);
    await memberAgent.post("/login").type("form").send({
      identifier: member.email,
      password: "testpass123",
    });
    const submitPrayer = await postWithCsrf(memberAgent, "/member/prayer-request", "/member/prayer-request", {
      prayer_topic: "Confidential family matter",
      details: "Very private pastoral need",
      urgency: "urgent",
      privacy_level: "private_to_pastor",
    });
    assert.equal(submitPrayer.status, 303);
    const memberPrayers = await prayerRequestsRepo.listPrayerRequestsForMember(pool, member.id, branchA.id);
    assert.equal(memberPrayers.length, 1);
    const prayerId = memberPrayers[0].id;

    const ordinaryAgent = request.agent(app);
    await ordinaryAgent.post("/branch/login").type("form").send({
      identifier: ordinaryAdmin.email,
      password: "testpass123",
    });
    const deniedQueue = await ordinaryAgent.get("/branch/prayer-requests");
    assert.equal(deniedQueue.status, 403);

    const pastoralAgent = request.agent(app);
    await pastoralAgent.post("/branch/login").type("form").send({
      identifier: pastoralAdmin.email,
      password: "testpass123",
    });
    const queue = await pastoralAgent.get("/branch/prayer-requests");
    assert.equal(queue.status, 200);
    assert.match(queue.text, /Confidential family matter/);

    const ack = await postWithCsrf(
      pastoralAgent,
      `/branch/prayer-requests/${prayerId}`,
      `/branch/prayer-requests/${prayerId}/acknowledge`,
      {}
    );
    assert.equal(ack.status, 303);
    const acknowledged = await prayerRequestsRepo.findPrayerRequestByIdForBranch(
      pool,
      prayerId,
      branchA.id,
      { pastoralAccess: true }
    );
    assert.equal(acknowledged.status, "acknowledged");
    assert.ok(acknowledged.acknowledged_at);

    const assign = await postWithCsrf(
      pastoralAgent,
      `/branch/prayer-requests/${prayerId}`,
      `/branch/prayer-requests/${prayerId}/assign`,
      { assigned_admin_id: pastoralAdmin.id }
    );
    assert.equal(assign.status, 303);

    const openCase = await postWithCsrf(pastoralAgent, "/branch/pastoral-cases", "/branch/pastoral-cases", {
      member_id: member.id,
      title: "Follow-up care",
      summary: "Member requested pastoral support",
      assigned_admin_id: pastoralAdmin.id,
      due_date: "2026-08-01",
      next_action: "Phone call",
      prayer_request_id: prayerId,
    });
    assert.equal(openCase.status, 303);
    const caseMatch = String(openCase.headers.location || "").match(/\/branch\/pastoral-cases\/(\d+)/);
    assert.ok(caseMatch);
    const caseId = Number(caseMatch[1]);

    const duplicateCase = await postWithCsrf(pastoralAgent, "/branch/pastoral-cases", "/branch/pastoral-cases", {
      member_id: member.id,
      title: "Second case",
      summary: "Should fail",
    });
    assert.equal(duplicateCase.status, 303);
    assert.match(String(duplicateCase.headers.location || ""), /error=/i);

    const followUp = await postWithCsrf(
      pastoralAgent,
      `/branch/pastoral-cases/${caseId}`,
      `/branch/pastoral-cases/${caseId}/follow-up`,
      {
        contact_attempt: "phone_call",
        outcome: "Spoke with member",
        next_action: "Visit next week",
        due_date: "2026-08-08",
      }
    );
    assert.equal(followUp.status, 303);
    const followUps = await pastoralCareRepo.listFollowUpsForCase(pool, caseId, branchA.id);
    assert.equal(followUps.length, 1);

    const closePrayer = await postWithCsrf(
      pastoralAgent,
      `/branch/prayer-requests/${prayerId}`,
      `/branch/prayer-requests/${prayerId}/close`,
      { closure_outcome: "Ongoing pastoral support", closure_reason: "Moved to case" }
    );
    assert.equal(closePrayer.status, 303);

    const safeguardingAgent = request.agent(app);
    await safeguardingAgent.post("/branch/login").type("form").send({
      identifier: safeguardingAdmin.email,
      password: "testpass123",
    });
    const pastoralDenied = await safeguardingAgent.get("/branch/pastoral-cases");
    assert.equal(pastoralDenied.status, 403);
    const incident = await postWithCsrf(safeguardingAgent, "/branch/safeguarding", "/branch/safeguarding", {
      summary: "Safeguarding concern reported through proper channel",
      member_id: member.id,
    });
    assert.equal(incident.status, 303);
    const incidents = await pastoralCareRepo.listSafeguardingIncidentsForBranch(pool, branchA.id);
    assert.equal(incidents.length, 1);
    const pastoralCannotSeeSafeguarding = await pastoralAgent.get("/branch/safeguarding");
    assert.equal(pastoralCannotSeeSafeguarding.status, 403);

    await transferMemberToBranch(pool, {
      memberId: member.id,
      fromBranchId: branchA.id,
      toBranchId: branchB.id,
      organizationId: org.id,
      organization: org,
      actorType: "branch_admin",
      actorId: pastoralAdmin.id,
      reason: "Campus transfer",
    });
    const prayerAfterTransfer = await prayerRequestsRepo.findPrayerRequestByIdForBranch(
      pool,
      prayerId,
      branchA.id,
      { pastoralAccess: true }
    );
    assert.ok(prayerAfterTransfer);
    assert.equal(Number(prayerAfterTransfer.branch_id), Number(branchA.id));

    const ctxB = { kind: "branch", orgSlug: org.slug, organization: org, branch: branchB };
    const appB = makeApp(ctxB);
    const pastoralB = request.agent(appB);
    await pastoralB.post("/branch/login").type("form").send({
      identifier: pastoralAdminB.email,
      password: "testpass123",
    });
    const isolation = await pastoralB.get(`/branch/prayer-requests/${prayerId}`);
    assert.equal(isolation.status, 404);

    const otherCtx = {
      kind: "branch",
      orgSlug: otherOrg.slug,
      organization: otherOrg,
      branch: otherBranch,
    };
    const otherApp = makeApp(otherCtx);
    const otherPastoral = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: otherOrg.id,
      branch_id: otherBranch.id,
      full_name: "Other Pastoral",
      email: `other_p_${suffix}@example.com`,
      phone: "0977999199",
      password_hash: passwordHash,
    });
    await pool.query(`UPDATE public.church_branch_admins SET can_access_pastoral = true WHERE id = $1`, [
      otherPastoral.id,
    ]);
    const otherAgent = request.agent(otherApp);
    await otherAgent.post("/branch/login").type("form").send({
      identifier: otherPastoral.email,
      password: "testpass123",
    });
    const tenantIsolation = await otherAgent.get(`/branch/prayer-requests/${prayerId}`);
    assert.equal(tenantIsolation.status, 404);

    const audit = await pool.query(
      `SELECT action FROM public.church_audit_logs
       WHERE branch_id = $1 AND action IN ('prayer_request_acknowledged', 'pastoral_case_opened', 'safeguarding_incident_opened')
       ORDER BY id ASC`,
      [branchA.id]
    );
    assert.ok(audit.rows.length >= 3);

    await cleanup(pool, [branchA.id, branchB.id, otherBranch.id], [org.id, otherOrg.id]);
  }
);
