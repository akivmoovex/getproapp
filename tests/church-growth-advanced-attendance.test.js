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
const attendanceOfflineQueueRepo = require("../src/db/pg/church/attendanceOfflineQueueRepo");
const attendanceRulesRepo = require("../src/db/pg/church/attendanceRulesRepo");
const foundationAttendanceCheckInService = require("../src/services/church/foundationAttendanceCheckInService");
const growthAttendanceOfflineSyncService = require("../src/services/church/growthAttendanceOfflineSyncService");
const growthAttendanceRulesService = require("../src/services/church/growthAttendanceRulesService");
const churchRoutes = require("../src/routes/church");

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
      secret: "church-growth-advanced-attendance",
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

function trustedCtx(org, branch, admin) {
  return {
    organization_id: org.id,
    branch_id: branch.id,
    platform_tenant_id: org.platform_tenant_id,
    admin_id: admin.id,
  };
}

async function cleanup(pool, orgIds) {
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_attendance_offline_queue WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_attendance_check_ins WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_attendance_service_sessions WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_member_attendance_exemptions WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_attendance_cross_branch_authorizations WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_attendance_branch_rules WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

async function seedVerifiedMember(pool, org, branch, suffix, passwordHash) {
  const member = await membersRepo.createPendingMember(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    platform_tenant_id: TENANT_ZM,
    email: `m_${suffix}@example.com`,
    phone: "0977888999",
    full_name: `Member ${suffix}`,
    password_hash: passwordHash,
    gender: "male",
    age_group: "Adult (36-60)",
    address_area: "Lusaka",
    attendance_duration: "Less than 6 months",
    ministry_interest: "choir",
  });
  await membersRepo.updateMemberStatusForBranch(pool, member.id, branch.id, "verified");
  return member;
}

function offlineItem(clientId, sessionId, memberId, capturedAt) {
  return {
    client_item_id: clientId,
    service_session_id: sessionId,
    member_id: memberId,
    check_in_kind: "member",
    captured_at_client: capturedAt || new Date().toISOString(),
    capture_source: "test-device-001",
  };
}

test(
  "Growth advanced attendance: offline sync, rules, exemptions, conflicts, isolation",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("gatt");
    const passwordHash = await bcrypt.hash("testpass123", 12);

    const orgGrowth = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `gatt_g_${suffix}`,
      name: `Growth Attendance ${suffix}`,
      plan_code: "growth",
    });
    const orgFoundation = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `gatt_f_${suffix}`,
      name: `Foundation Attendance ${suffix}`,
      plan_code: "foundation",
    });
    const orgOther = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `gatt_o_${suffix}`,
      name: `Other Attendance ${suffix}`,
      plan_code: "growth",
    });

    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgGrowth.id,
      slug: `a_${suffix}`.slice(0, 30),
      host_slug: `a_${suffix}`.slice(0, 30),
      name: "Campus A",
      status: "active",
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgGrowth.id,
      slug: `b_${suffix}`.slice(0, 30),
      host_slug: `b_${suffix}`.slice(0, 30),
      name: "Campus B",
      status: "active",
    });
    const foundationBranch = await branchesRepo.createBranch(pool, {
      organization_id: orgFoundation.id,
      slug: `f_${suffix}`.slice(0, 30),
      host_slug: `f_${suffix}`.slice(0, 30),
      name: "Foundation Campus",
      status: "active",
    });
    const otherBranch = await branchesRepo.createBranch(pool, {
      organization_id: orgOther.id,
      slug: `o_${suffix}`.slice(0, 30),
      host_slug: `o_${suffix}`.slice(0, 30),
      name: "Other Org Campus",
      status: "active",
    });

    const adminA = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgGrowth.id,
      branch_id: branchA.id,
      full_name: "Admin A",
      email: `admin_a_${suffix}@example.com`,
      phone: "0977000001",
      password_hash: passwordHash,
    });
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgGrowth.id,
      branch_id: branchB.id,
      full_name: "Admin B",
      email: `admin_b_${suffix}@example.com`,
      phone: "0977000002",
      password_hash: passwordHash,
    });
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgFoundation.id,
      branch_id: foundationBranch.id,
      full_name: "Foundation Admin",
      email: `admin_f_${suffix}@example.com`,
      phone: "0977000003",
      password_hash: passwordHash,
    });

    const memberA = await seedVerifiedMember(pool, orgGrowth, branchA, `a_${suffix}`, passwordHash);
    const memberB = await seedVerifiedMember(pool, orgGrowth, branchB, `b_${suffix}`, passwordHash);

    const ctxA = trustedCtx(orgGrowth, branchA, adminA);
    const session1 = await foundationAttendanceCheckInService.openServiceSession(pool, ctxA, {
      attendance_type: "sunday",
      service_name: "Morning Service",
      session_date: new Date().toISOString().slice(0, 10),
      notes: "",
    });
    const session2 = await foundationAttendanceCheckInService.openServiceSession(pool, ctxA, {
      attendance_type: "youth",
      service_name: "Youth Service",
      session_date: new Date().toISOString().slice(0, 10),
      notes: "",
    });

    const growthApp = makeApp({
      kind: "branch",
      orgSlug: orgGrowth.slug,
      organization: orgGrowth,
      branch: branchA,
    });
    const growthAgent = request.agent(growthApp);
    await growthAgent.post("/branch/login").type("form").send({
      identifier: `admin_a_${suffix}@example.com`,
      password: "testpass123",
    });

    const foundationApp = makeApp({
      kind: "branch",
      orgSlug: orgFoundation.slug,
      organization: orgFoundation,
      branch: foundationBranch,
    });
    const foundationAgent = request.agent(foundationApp);
    await foundationAgent.post("/branch/login").type("form").send({
      identifier: `admin_f_${suffix}@example.com`,
      password: "testpass123",
    });

    const foundationOfflineGet = await foundationAgent.get("/branch/attendance-offline");
    assert.equal(foundationOfflineGet.status, 200);
    assert.match(foundationOfflineGet.text, /Growth|upgrade|package/i);
    const foundationOfflinePost = await foundationAgent.post("/branch/attendance-offline").type("form").send({});
    assert.equal(foundationOfflinePost.status, 409);
    const foundationRulesPost = await foundationAgent.post("/branch/attendance-rules").type("form").send({});
    assert.equal(foundationRulesPost.status, 409);

    const sync1 = await growthAttendanceOfflineSyncService.submitOfflineBatch(pool, ctxA, [
      offlineItem(clientId, session1.id, memberA.id),
    ]);
    assert.equal(sync1[0].checkIn.method, "offline");

    const queueRow = await attendanceOfflineQueueRepo.findQueueItemByClientId(
      pool,
      orgGrowth.id,
      branchA.id,
      clientId
    );
    assert.equal(queueRow.sync_status, "synced");

    const checkIn = await attendanceCheckInRepo.findCheckInByClientItemId(
      pool,
      orgGrowth.id,
      branchA.id,
      clientId
    );
    assert.equal(checkIn.method, "offline");
    assert.equal(checkIn.capture_source, "test-device-001");

    const dup = await growthAttendanceOfflineSyncService.submitOfflineBatch(pool, ctxA, [
      offlineItem(clientId, session1.id, memberA.id),
    ]);
    assert.equal(dup[0].skipped, true);

    await foundationAttendanceCheckInService.manualMemberCheckIn(pool, ctxA, {
      session_id: session2.id,
      member_id: memberA.id,
    });
    const conflictId = `offline_${suffix}_conflict`;
    await growthAttendanceOfflineSyncService.submitOfflineBatch(pool, ctxA, [
      offlineItem(conflictId, session2.id, memberA.id, new Date(Date.now() - 60000).toISOString()),
    ]).catch(() => {});
    const conflictQueue = await attendanceOfflineQueueRepo.findQueueItemByClientId(
      pool,
      orgGrowth.id,
      branchA.id,
      conflictId
    );
    assert.equal(conflictQueue.sync_status, "review_required");

    const wrongBranchId = `offline_${suffix}_wrong`;
    await growthAttendanceOfflineSyncService.submitOfflineBatch(pool, ctxA, [
      offlineItem(wrongBranchId, session1.id, memberB.id),
    ]).catch(() => {});
    const wrongQueue = await attendanceOfflineQueueRepo.findQueueItemByClientId(
      pool,
      orgGrowth.id,
      branchA.id,
      wrongBranchId
    );
    assert.equal(wrongQueue.sync_status, "conflict");

    await growthAttendanceRulesService.saveBranchRules(pool, ctxA, {
      absence_threshold_weeks: 4,
      allow_multiple_services_per_day: true,
      cross_branch_guest_enabled: true,
    });
    await growthAttendanceRulesService.addMemberExemption(pool, ctxA, {
      member_id: memberA.id,
      reason: "Traveling minister",
      effective_from: new Date().toISOString().slice(0, 10),
      effective_to: null,
    });
    const flags = await attendanceRulesRepo.listMembersOverAbsenceThreshold(pool, branchA.id, 4);
    assert.ok(!flags.some((m) => Number(m.id) === Number(memberA.id)));

    await growthAttendanceRulesService.saveBranchRules(pool, ctxA, {
      absence_threshold_weeks: null,
      allow_multiple_services_per_day: false,
      cross_branch_guest_enabled: false,
    });
    const memberC = await seedVerifiedMember(pool, orgGrowth, branchA, `c_${suffix}`, passwordHash);
    const morning = await foundationAttendanceCheckInService.openServiceSession(pool, ctxA, {
      attendance_type: "sunday",
      service_name: "Early",
      session_date: new Date().toISOString().slice(0, 10),
      notes: "",
    });
    const evening = await foundationAttendanceCheckInService.openServiceSession(pool, ctxA, {
      attendance_type: "evening",
      service_name: "Evening",
      session_date: new Date().toISOString().slice(0, 10),
      notes: "",
    });
    await growthAttendanceOfflineSyncService.submitOfflineBatch(pool, ctxA, [
      offlineItem(`offline_${suffix}_early`, morning.id, memberC.id),
    ]);
    const multiResults = await growthAttendanceOfflineSyncService.submitOfflineBatch(pool, ctxA, [
      offlineItem(`offline_${suffix}_late`, evening.id, memberC.id),
    ]);
    assert.equal(multiResults[0].code, "CONFLICT");

    await growthAttendanceRulesService.saveBranchRules(pool, ctxA, {
      absence_threshold_weeks: null,
      allow_multiple_services_per_day: true,
      cross_branch_guest_enabled: true,
    });
    await growthAttendanceRulesService.authorizeCrossBranchGuest(pool, ctxA, {
      member_id: memberB.id,
      guest_branch_id: branchA.id,
      effective_from: new Date().toISOString().slice(0, 10),
      effective_to: null,
    });
    const guestSync = await growthAttendanceOfflineSyncService.submitOfflineBatch(pool, ctxA, [
      offlineItem(`offline_${suffix}_guest`, session1.id, memberB.id),
    ]);
    assert.equal(guestSync[0].checkIn.guest_authorized, true);

    await attendanceOfflineQueueRepo.insertQueueItem(pool, {
      organization_id: orgGrowth.id,
      branch_id: branchA.id,
      platform_tenant_id: TENANT_ZM,
      client_item_id: `offline_${suffix}_fail`,
      service_session_id: 999999,
      member_id: memberA.id,
      check_in_kind: "member",
      captured_at_client: new Date().toISOString(),
      capture_source: "test-retry",
      sync_status: "failed",
      retry_count: 1,
      last_error: "Session not found",
    });
    const retryResults = await growthAttendanceOfflineSyncService.retryFailedQueueItems(pool, ctxA);
    assert.ok(retryResults.length >= 1);

    const foreignCtx = trustedCtx(orgOther, otherBranch, { id: 1 });
    const tenantQueue = await attendanceOfflineQueueRepo.insertQueueItem(pool, {
      organization_id: orgGrowth.id,
      branch_id: branchA.id,
      platform_tenant_id: TENANT_ZM,
      client_item_id: `tenant_${suffix}`,
      service_session_id: session1.id,
      member_id: memberA.id,
      check_in_kind: "member",
      captured_at_client: new Date().toISOString(),
      capture_source: "tenant-test",
      sync_status: "pending",
    });
    let tenantErr = null;
    try {
      await growthAttendanceOfflineSyncService.reconcileQueueItem(pool, foreignCtx, tenantQueue.id);
    } catch (e) {
      tenantErr = e;
    }
    assert.ok(tenantErr);

    await growthAttendanceOfflineSyncService.flagReviewAfterVoid(pool, checkIn.id);

    const comparison = await attendanceRulesRepo.getCheckInCountsByBranchForPeriod(
      pool,
      orgGrowth.id,
      new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
      new Date().toISOString().slice(0, 10)
    );
    assert.ok(comparison.length >= 2);

    const reconnect = await growthAttendanceOfflineSyncService.syncPendingQueue(pool, ctxA);
    assert.ok(Array.isArray(reconnect));

    await cleanup(pool, [orgGrowth.id, orgFoundation.id, orgOther.id]);
  }
);

test("validateOfflineBatchBody accepts form-encoded nested items", () => {
  const { validateOfflineBatchBody } = require("../src/church/growthAttendanceValidation");
  const result = validateOfflineBatchBody({
    items: {
      0: {
        client_item_id: "form_item_12345678",
        service_session_id: 1,
        member_id: 2,
        check_in_kind: "member",
        captured_at_client: new Date().toISOString(),
        capture_source: "form-test",
      },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 1);
});
