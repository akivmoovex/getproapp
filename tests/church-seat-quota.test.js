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
  FOUNDATION_MEMBER_LIMIT_ERROR,
  FOUNDATION_ADMIN_LIMIT_ERROR,
  COUNTED_PRIVILEGED_ROLES,
  countActiveMembersForOrganization,
  countPrivilegedAccountsForOrganization,
  getOrganisationSeatUsage,
  assertCanActivateMember,
} = require("../src/services/church/churchSeatQuotaService");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeBranchApp(ctx) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "church-seat-quota-test",
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

async function cleanupOrg(pool, orgId) {
  await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_ministry_leaders WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ organizationId: number, branchId: number, count: number, status?: string, emailPrefix: string }} opts
 */
async function seedMembers(pool, opts) {
  const status = opts.status || "verified";
  await pool.query(
    `INSERT INTO public.church_members (
       organization_id, branch_id, platform_tenant_id,
       full_name, email, phone, phone_normalized, password_hash, status
     )
     SELECT $1, $2, $3,
            'Seat Member ' || g,
            $4 || g || '@example.com',
            '',
            '',
            'hash',
            $5
     FROM generate_series(1, $6) AS g`,
    [opts.organizationId, opts.branchId, TENANT_ZM, opts.emailPrefix, status, opts.count]
  );
}

test("documented privileged roles match repository tables", () => {
  assert.deepEqual(COUNTED_PRIVILEGED_ROLES, [
    "church_hq_admins (status=active)",
    "church_branch_admins (status=active)",
    "church_ministry_leaders (status=active)",
  ]);
  assert.match(FOUNDATION_MEMBER_LIMIT_ERROR, /restricted/i);
  assert.match(FOUNDATION_MEMBER_LIMIT_ERROR, /Active members/i);
  assert.match(FOUNDATION_ADMIN_LIMIT_ERROR, /restricted/i);
  assert.match(FOUNDATION_ADMIN_LIMIT_ERROR, /Administrator/i);
});

test(
  "Foundation member seats: 249→250, block 251st, visitor OK, suspend frees seat, Growth unlimited, duplicate, route, isolation",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("seatm");
    const passwordHash = await bcrypt.hash("testpass123456", 12);

    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `seat_a_${suffix}`.slice(0, 40),
      name: `Seat A ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      org.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: null },
      null
    );

    const orgOther = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `seat_b_${suffix}`.slice(0, 40),
      name: `Seat B ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgOther.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: null },
      null
    );

    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: `main_${suffix}`.slice(0, 30),
      host_slug: `main_${suffix}`.slice(0, 30),
      name: "Main",
      status: "active",
    });
    const branchOther = await branchesRepo.createBranch(pool, {
      organization_id: orgOther.id,
      slug: `other_${suffix}`.slice(0, 30),
      host_slug: `other_${suffix}`.slice(0, 30),
      name: "Other",
      status: "active",
    });

    await seedMembers(pool, {
      organizationId: org.id,
      branchId: branch.id,
      count: 249,
      status: "verified",
      emailPrefix: `v_${suffix}_`,
    });
    assert.equal(await countActiveMembersForOrganization(pool, org.id), 249);

    const pending250 = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      email: `pending250_${suffix}@example.com`,
      phone: "0977000001",
      full_name: "Pending 250",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult",
      address_area: "Area",
      attendance_duration: "1 year",
    });
    const activated250 = await membersRepo.verifyMemberForBranch(pool, pending250.id, branch.id, 1);
    assert.equal(activated250.status, "verified");
    assert.equal(await countActiveMembersForOrganization(pool, org.id), 250);

    const pending251 = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      email: `pending251_${suffix}@example.com`,
      phone: "0977000002",
      full_name: "Pending 251",
      password_hash: passwordHash,
      gender: "female",
      age_group: "Adult",
      address_area: "Area",
      attendance_duration: "1 year",
    });
    await assert.rejects(
      () => membersRepo.verifyMemberForBranch(pool, pending251.id, branch.id, 1),
      (err) => err && err.code === "FOUNDATION_MEMBER_LIMIT"
    );
    const stillPending = await membersRepo.findMemberByIdForBranch(pool, pending251.id, branch.id);
    assert.equal(stillPending.status, "pending");
    assert.equal(await countActiveMembersForOrganization(pool, org.id), 250);

    const blockedAudits = await pool.query(
      `SELECT action FROM public.church_audit_logs
       WHERE organization_id = $1 AND action = 'package_quota_member_blocked'
       ORDER BY id DESC LIMIT 1`,
      [org.id]
    );
    assert.equal(blockedAudits.rows.length, 1);

    // Visitor capture remains available at the active-member cap.
    const visitorAtCap = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      email: `visitor_${suffix}@example.com`,
      phone: "0977000003",
      full_name: "Visitor At Cap",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult",
      address_area: "Area",
      attendance_duration: "New",
    });
    assert.equal(visitorAtCap.status, "pending");
    assert.equal(await countActiveMembersForOrganization(pool, org.id), 250);

    // Archive/suspend frees a seat for another approval.
    await membersRepo.suspendMemberForBranch(pool, activated250.id, branch.id, 1, "archive stand-in");
    assert.equal(await countActiveMembersForOrganization(pool, org.id), 249);
    const afterSuspend = await membersRepo.verifyMemberForBranch(pool, pending251.id, branch.id, 1);
    assert.equal(afterSuspend.status, "verified");
    assert.equal(await countActiveMembersForOrganization(pool, org.id), 250);

    // Duplicate approval of an already-verified member does not throw.
    await assert.doesNotReject(() =>
      assertCanActivateMember(pool, {
        organizationId: org.id,
        branchId: branch.id,
        memberId: afterSuspend.id,
        currentStatus: "verified",
      })
    );
    const dup = await membersRepo.updateMemberStatusForBranch(pool, afterSuspend.id, branch.id, "verified", {
      actorType: "branch_admin",
      actorId: 1,
    });
    assert.equal(dup.status, "verified");
    assert.equal(await countActiveMembersForOrganization(pool, org.id), 250);

    // Direct HTTP approve path cannot bypass the repo quota check.
    const admin = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      full_name: "Seat Admin",
      email: `seatadmin_${suffix}@example.com`,
      phone: "0977111000",
      password_hash: passwordHash,
      role: "branch_admin",
      status: "active",
    });
    const routePending = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      email: `route_${suffix}@example.com`,
      phone: "0977000004",
      full_name: "Route Pending",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult",
      address_area: "Area",
      attendance_duration: "New",
    });
    const app = makeBranchApp({
      kind: "branch",
      orgSlug: org.slug,
      organization: await organizationsRepo.findOrganizationById(pool, org.id),
      branch,
    });
    const agent = request.agent(app);
    await agent
      .post("/branch/login")
      .type("form")
      .send({ identifier: `seatadmin_${suffix}@example.com`, password: "testpass123456" })
      .expect(303);
    const approveBlocked = await agent
      .post(`/branch/members/${routePending.id}/approve`)
      .type("form")
      .send({ review_comment: "should block", redirect_to: "profile" });
    assert.equal(approveBlocked.status, 400);
    assert.match(approveBlocked.text, /Foundation includes 250 active members/);
    const routeStillPending = await membersRepo.findMemberByIdForBranch(pool, routePending.id, branch.id);
    assert.equal(routeStillPending.status, "pending");
    void admin;

    // Tenant isolation: another Foundation org can still activate.
    const otherPending = await membersRepo.createPendingMember(pool, {
      organization_id: orgOther.id,
      branch_id: branchOther.id,
      platform_tenant_id: TENANT_ZM,
      email: `iso_${suffix}@example.com`,
      phone: "0977000099",
      full_name: "Isolated Pending",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult",
      address_area: "Area",
      attendance_duration: "New",
    });
    const otherVerified = await membersRepo.verifyMemberForBranch(pool, otherPending.id, branchOther.id, 1);
    assert.equal(otherVerified.status, "verified");
    assert.equal(await countActiveMembersForOrganization(pool, orgOther.id), 1);
    assert.equal(await countActiveMembersForOrganization(pool, org.id), 250);

    // Growth allows activation above 250 (fair use; still counted).
    await organizationsRepo.updateOrganizationPlan(
      pool,
      org.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );
    const growthExtra = await membersRepo.verifyMemberForBranch(pool, routePending.id, branch.id, 1);
    assert.equal(growthExtra.status, "verified");
    assert.equal(await countActiveMembersForOrganization(pool, org.id), 251);
    const usage = await getOrganisationSeatUsage(pool, org.id);
    assert.equal(usage.packageCode, "growth");
    assert.match(usage.membersDisplay, /251 \/ fair use/);
    assert.equal(usage.memberAtLimit, false);

    await cleanupOrg(pool, org.id);
    await cleanupOrg(pool, orgOther.id);
  }
);

test(
  "Foundation privileged seats: 10th allowed, 11th blocked; Growth continues",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("seata");
    const passwordHash = await bcrypt.hash("testpass123456", 12);

    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `adm_${suffix}`.slice(0, 40),
      name: `Adm ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      org.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: null },
      null
    );
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: `adm_${suffix}`.slice(0, 30),
      host_slug: `adm_${suffix}`.slice(0, 30),
      name: "Main",
      status: "active",
    });

    for (let i = 1; i <= 9; i += 1) {
      await hqAdminsRepo.createHqAdmin(pool, {
        organization_id: org.id,
        full_name: `HQ Seed ${i}`,
        email: `hqseed${i}_${suffix}@example.com`,
        phone: `0977${String(100000 + i)}`,
        password_hash: passwordHash,
        role: "hq_admin",
        status: "active",
      });
    }
    assert.equal((await countPrivilegedAccountsForOrganization(pool, org.id)).total, 9);

    const tenth = await hqAdminsRepo.createHqAdminForPlatform(
      pool,
      org.id,
      {
        full_name: "HQ Tenth",
        email: `hqtenth_${suffix}@example.com`,
        phone: "0977100010",
        role: "hq_admin",
        password_hash: passwordHash,
      },
      null
    );
    assert.ok(tenth.id);
    assert.equal((await countPrivilegedAccountsForOrganization(pool, org.id)).total, 10);

    await assert.rejects(
      () =>
        hqAdminsRepo.createHqAdminForPlatform(
          pool,
          org.id,
          {
            full_name: "HQ Eleventh",
            email: `hqeleventh_${suffix}@example.com`,
            phone: "0977100011",
            role: "hq_admin",
            password_hash: passwordHash,
          },
          null
        ),
      (err) => err && err.code === "FOUNDATION_ADMIN_LIMIT"
    );
    assert.equal((await countPrivilegedAccountsForOrganization(pool, org.id)).total, 10);

    await assert.rejects(
      () =>
        branchAdminsRepo.createBranchAdminForPlatform(
          pool,
          branch.id,
          {
            full_name: "Branch Extra",
            email: `bax_${suffix}@example.com`,
            phone: "0977100012",
            role: "branch_admin",
            password_hash: passwordHash,
          },
          null
        ),
      (err) => err && err.code === "FOUNDATION_ADMIN_LIMIT"
    );

    const adminBlocked = await pool.query(
      `SELECT action FROM public.church_audit_logs
       WHERE organization_id = $1 AND action = 'package_quota_admin_blocked'
       ORDER BY id DESC LIMIT 1`,
      [org.id]
    );
    assert.equal(adminBlocked.rows.length, 1);

    await organizationsRepo.updateOrganizationPlan(
      pool,
      org.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );
    const eleventhGrowth = await hqAdminsRepo.createHqAdminForPlatform(
      pool,
      org.id,
      {
        full_name: "HQ Growth Eleven",
        email: `hqgrowth_${suffix}@example.com`,
        phone: "0977100013",
        role: "hq_admin",
        password_hash: passwordHash,
      },
      null
    );
    assert.ok(eleventhGrowth.id);
    assert.equal((await countPrivilegedAccountsForOrganization(pool, org.id)).total, 11);

    const usage = await getOrganisationSeatUsage(pool, org.id);
    assert.match(usage.adminsDisplay, /11 \/ fair use/);

    await cleanupOrg(pool, org.id);
  }
);
