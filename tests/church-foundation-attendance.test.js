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
const attendanceCheckInRepo = require("../src/db/pg/church/attendanceCheckInRepo");
const attendanceQrTokenRepo = require("../src/db/pg/church/attendanceQrTokenRepo");
const churchRoutes = require("../src/routes/church");
const foundationAttendanceCheckInService = require("../src/services/church/foundationAttendanceCheckInService");
const { CSRF_FIELD, extractCsrf, postWithCsrf } = require("./helpers/churchPilotSmokeFixtures");

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
      secret: "church-foundation-attendance",
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

async function postJsonWithCsrf(agent, getPath, postPath, body) {
  const page = await agent.get(getPath);
  const csrf = extractCsrf(page.text);
  return agent
    .post(postPath)
    .set("Accept", "application/json")
    .type("form")
    .send({ ...(body || {}), [CSRF_FIELD]: csrf || "" });
}

async function cleanupAttendanceData(pool, branchIds, orgIds) {
  for (const branchId of branchIds) {
    await pool.query(`DELETE FROM public.church_attendance_check_ins WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_member_attendance_qr_tokens WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_attendance_service_sessions WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_attendance_records WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_audit_logs WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_members WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test(
  "Foundation attendance check-in: manual, QR, visitor, sessions, security, isolation, performance",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("fatt");
    const passwordHash = await bcrypt.hash("testpass123", 12);

    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `fatt_${suffix}`,
      name: `FATT Church ${suffix}`,
      plan_code: "foundation",
    });
    const otherOrg = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `fatt_o_${suffix}`,
      name: `Other ${suffix}`,
      plan_code: "foundation",
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `FATT Branch ${suffix}`,
    });
    const otherBranch = await branchesRepo.createBranch(pool, {
      organization_id: otherOrg.id,
      slug: "main",
      name: "Other Branch",
    });

    const admin = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      full_name: "Check-in Admin",
      email: `fatt_admin_${suffix}@example.com`,
      phone: "0977999001",
      password_hash: passwordHash,
    });
    const corrector = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      full_name: "Corrector Admin",
      email: `fatt_corr_${suffix}@example.com`,
      phone: "0977999002",
      password_hash: passwordHash,
    });
    await pool.query(
      `UPDATE public.church_branch_admins SET can_correct_attendance = true WHERE id = $1`,
      [corrector.id]
    );
    const otherAdmin = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: otherOrg.id,
      branch_id: otherBranch.id,
      full_name: "Other Admin",
      email: `fatt_other_${suffix}@example.com`,
      phone: "0977999003",
      password_hash: passwordHash,
    });

    const member = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      email: `member_${suffix}@example.com`,
      phone: "0977999010",
      full_name: "Alice Member",
      password_hash: passwordHash,
      gender: "female",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "1 year",
    });
    await membersRepo.updateMemberStatusForBranch(pool, member.id, branch.id, "verified");

    const otherMember = await membersRepo.createPendingMember(pool, {
      organization_id: otherOrg.id,
      branch_id: otherBranch.id,
      platform_tenant_id: TENANT_ZM,
      email: `other_member_${suffix}@example.com`,
      phone: "0977999011",
      full_name: "Bob Other",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Lusaka",
      attendance_duration: "1 year",
    });
    await membersRepo.updateMemberStatusForBranch(pool, otherMember.id, otherBranch.id, "verified");

    const ctx = {
      kind: "branch",
      orgSlug: org.slug,
      organization: org,
      branch,
    };
    const app = makeApp(ctx);
    const agent = request.agent(app);
    await agent.post("/branch/login").type("form").send({
      identifier: admin.email,
      password: "testpass123",
    });

    const checkInPage = await agent.get("/branch/attendance/check-in");
    assert.equal(checkInPage.status, 200);
    assert.match(checkInPage.text, /Service check-in/);

    const openFirst = await postWithCsrf(agent, "/branch/attendance/check-in", "/branch/attendance/check-in/sessions/open", {
      attendance_type: "Sunday service",
      service_name: "First service",
      session_date: "2026-07-06",
    });
    assert.equal(openFirst.status, 303);
    const session1 = await attendanceCheckInRepo.findOpenServiceSessionForBranch(pool, branch.id);
    assert.ok(session1);
    assert.equal(session1.service_name, "First service");

    const openSecond = await postWithCsrf(agent, "/branch/attendance/check-in", "/branch/attendance/check-in/sessions/open", {
      attendance_type: "Sunday service",
      service_name: "Second service",
      session_date: "2026-07-06",
    });
    assert.equal(openSecond.status, 303);
    const sessionsSameDay = await attendanceCheckInRepo.listServiceSessionsForBranch(pool, branch.id, {
      limit: 10,
    });
    const july6 = sessionsSameDay.filter((s) => String(s.session_date).startsWith("2026-07-06"));
    assert.ok(july6.length >= 2, "multiple services on same day allowed");

    const session2 = july6.find((s) => s.service_name === "Second service");
    assert.ok(session2);

    const manual = await postJsonWithCsrf(
      agent,
      "/branch/attendance/check-in",
      "/branch/attendance/check-in/member",
      { session_id: session2.id, member_id: member.id }
    );
    assert.equal(manual.status, 201);
    assert.equal(manual.body.ok, true);
    assert.match(manual.body.display.label, /Alice/);

    const duplicate = await postJsonWithCsrf(
      agent,
      "/branch/attendance/check-in",
      "/branch/attendance/check-in/member",
      { session_id: session2.id, member_id: member.id }
    );
    assert.equal(duplicate.status, 409);
    assert.match(duplicate.body.error, /already checked in/i);

    const qrIssued = await attendanceQrTokenRepo.ensureActiveQrTokenForMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      member_id: member.id,
    });
    assert.ok(qrIssued.token);
    assert.doesNotMatch(qrIssued.token, /^\d+$/);

    const invalidQr = await postJsonWithCsrf(agent, "/branch/attendance/check-in", "/branch/attendance/check-in/qr", {
      session_id: session1.id,
      qr_token: "not-a-valid-token-xxxxxxxx",
    });
    assert.equal(invalidQr.status, 400);
    assert.match(invalidQr.body.error, /invalid/i);

    const otherQr = await attendanceQrTokenRepo.ensureActiveQrTokenForMember(pool, {
      organization_id: otherOrg.id,
      branch_id: otherBranch.id,
      member_id: otherMember.id,
    });
    const wrongBranch = await postJsonWithCsrf(agent, "/branch/attendance/check-in", "/branch/attendance/check-in/qr", {
      session_id: session1.id,
      qr_token: otherQr.token,
    });
    assert.equal(wrongBranch.status, 400);
    assert.match(wrongBranch.body.error, /different branch/i);

    const peakMembers = [];
    for (let i = 0; i < 25; i += 1) {
      const m = await membersRepo.createPendingMember(pool, {
        organization_id: org.id,
        branch_id: branch.id,
        platform_tenant_id: TENANT_ZM,
        email: `peak_${suffix}_${i}@example.com`,
        phone: `0977999${String(100 + i).padStart(3, "0")}`,
        full_name: `Peak Member ${i}`,
        password_hash: passwordHash,
        gender: "male",
        age_group: "Adult (36-60)",
        address_area: "Kafue",
        attendance_duration: "1 year",
      });
      await membersRepo.updateMemberStatusForBranch(pool, m.id, branch.id, "verified");
      const tok = await attendanceQrTokenRepo.ensureActiveQrTokenForMember(pool, {
        organization_id: org.id,
        branch_id: branch.id,
        member_id: m.id,
      });
      peakMembers.push(tok);
    }

    const peakTimes = [];
    for (const tok of peakMembers) {
      const start = performance.now();
      const res = await postJsonWithCsrf(agent, "/branch/attendance/check-in", "/branch/attendance/check-in/qr", {
        session_id: session1.id,
        qr_token: tok.token,
      });
      peakTimes.push(performance.now() - start);
      assert.equal(res.status, 201, res.body && res.body.error);
    }
    peakTimes.sort((a, b) => a - b);
    const p95 = peakTimes[Math.floor(peakTimes.length * 0.95)] || peakTimes[peakTimes.length - 1];
    assert.ok(p95 < 2000, `p95 check-in response ${p95}ms exceeds 2000ms budget`);

    const visitor = await postJsonWithCsrf(agent, "/branch/attendance/check-in", "/branch/attendance/check-in/visitor", {
      session_id: session1.id,
      visitor_name: "Guest Visitor",
      visitor_phone: "0977000111",
    });
    assert.equal(visitor.status, 201);
    assert.equal(visitor.body.display.label, "Guest V.");

    const checkInsSession1 = await attendanceCheckInRepo.listCheckInsForSession(pool, session1.id, branch.id);
    const activeMemberCheckIn = checkInsSession1.find(
      (c) => c.check_in_kind === "member" && c.method === "qr"
    );
    assert.ok(activeMemberCheckIn);

    const noPermAgent = request.agent(app);
    await noPermAgent.post("/branch/login").type("form").send({
      identifier: admin.email,
      password: "testpass123",
    });
    const deniedCorrection = await postJsonWithCsrf(
      noPermAgent,
      "/branch/attendance/check-in",
      `/branch/attendance/check-in/${activeMemberCheckIn.id}/correct`,
      { reason: "Test void", replacement_kind: "void_only" }
    );
    assert.equal(deniedCorrection.status, 403);

    const corrAgent = request.agent(app);
    await corrAgent.post("/branch/login").type("form").send({
      identifier: corrector.email,
      password: "testpass123",
    });
    const correction = await postJsonWithCsrf(
      corrAgent,
      "/branch/attendance/check-in",
      `/branch/attendance/check-in/${activeMemberCheckIn.id}/correct`,
      { reason: "Wrong person scanned", replacement_kind: "void_only" }
    );
    assert.equal(correction.status, 200);
    assert.equal(correction.body.ok, true);

    const audit = await pool.query(
      `SELECT action FROM public.church_audit_logs
       WHERE branch_id = $1 AND action = 'attendance_check_in_corrected'
       ORDER BY id DESC LIMIT 1`,
      [branch.id]
    );
    assert.equal(audit.rows.length, 1);

    const bypassNoSession = await request(app)
      .post("/branch/attendance/check-in/member")
      .type("form")
      .send({ session_id: session1.id, member_id: member.id });
    assert.equal(bypassNoSession.status, 302);
    assert.equal(bypassNoSession.headers.location, "/branch/login");

    const bypassNoCsrf = await agent
      .post("/branch/attendance/check-in/member")
      .set("Accept", "application/json")
      .type("form")
      .send({ session_id: session1.id, member_id: member.id, branch_id: otherBranch.id });
    assert.ok(bypassNoCsrf.status === 403 || bypassNoCsrf.status === 400);

    const otherCtx = {
      kind: "branch",
      orgSlug: otherOrg.slug,
      organization: otherOrg,
      branch: otherBranch,
    };
    const otherApp = makeApp(otherCtx);
    const otherAgent = request.agent(otherApp);
    await otherAgent.post("/branch/login").type("form").send({
      identifier: otherAdmin.email,
      password: "testpass123",
    });
    const isolation = await postJsonWithCsrf(
      otherAgent,
      "/branch/attendance/check-in",
      "/branch/attendance/check-in/member",
      { session_id: session1.id, member_id: member.id }
    );
    assert.equal(isolation.status, 404);

    const report = await agent.get("/branch/attendance/check-in/report?from=2026-07-01&to=2026-07-31");
    assert.equal(report.status, 200);
    assert.match(report.text, /Member check-ins/);

    const close = await postWithCsrf(
      agent,
      "/branch/attendance/check-in",
      `/branch/attendance/check-in/sessions/${session1.id}/close`,
      {}
    );
    assert.equal(close.status, 303);
    const closed = await attendanceCheckInRepo.findServiceSessionByIdForBranch(pool, session1.id, branch.id);
    assert.equal(closed.status, "closed");

    const memberAgent = request.agent(app);
    await memberAgent.post("/login").type("form").send({
      identifier: member.email,
      password: "testpass123",
    });
    const profile = await memberAgent.get("/member/profile");
    assert.equal(profile.status, 200);
    assert.match(profile.text, /Service check-in QR/);
    assert.doesNotMatch(profile.text, new RegExp(`member_id|${member.id}`));

    await cleanupAttendanceData(pool, [branch.id, otherBranch.id], [org.id, otherOrg.id]);
  }
);

test("QR validation rejects numeric member-id style tokens", () => {
  const { validateQrCheckInBody } = require("../src/church/attendanceCheckInValidation");
  const result = validateQrCheckInBody({ session_id: "1", qr_token: "12345" });
  assert.equal(result.ok, false);
});

test("usher display omits full PII", () => {
  const row = foundationAttendanceCheckInService.toUsherCheckInRow({
    check_in_kind: "member",
    member_full_name: "Alice Member",
    method: "manual",
    checked_in_at: new Date().toISOString(),
    status: "active",
    id: 1,
  });
  assert.equal(row.display.label, "Alice M.");
  assert.doesNotMatch(JSON.stringify(row), /member_full_name|email|phone/);
});
