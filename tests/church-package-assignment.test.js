"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const path = require("path");
const express = require("express");
const session = require("express-session");
const request = require("supertest");

const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const { ROLES } = require("../src/auth/roles");
const { db } = require("../src/db");
const adminRoutes = require("../src/routes/admin");
const adminUsersRepo = require("../src/db/pg/adminUsersRepo");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const churchBillingRepo = require("../src/db/pg/church/churchBillingRepo");
const {
  previewPackageAssignment,
  confirmPackageAssignment,
  evaluateFoundationDowngradeEligibility,
  ASSIGNABLE_PACKAGE_CODES,
  validateAssignablePackageCode,
  signAssignmentPreview,
  verifyAssignmentPreviewToken,
} = require("../src/services/church/churchPackageAssignmentService");
const { getOrganisationPlan } = require("../src/services/church/churchEntitlementService");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

test("only Foundation and Growth are assignable package codes", () => {
  assert.deepEqual([...ASSIGNABLE_PACKAGE_CODES], ["foundation", "growth"]);
  assert.equal(validateAssignablePackageCode("foundation"), "foundation");
  assert.equal(validateAssignablePackageCode("growth"), "growth");
  assert.throws(() => validateAssignablePackageCode("network"), (err) => err.code === "INVALID_PACKAGE");
  assert.throws(() => validateAssignablePackageCode("free"), (err) => err.code === "INVALID_PACKAGE");
});

test("preview confirm tokens bind organisation and reject cross-tenant use", () => {
  const payload = {
    organizationId: 42,
    packageCode: "growth",
    reason: "Expand",
    effectiveAt: "2026-07-16T10:00:00.000Z",
    issuedAt: Date.now(),
    nonce: "abc",
  };
  const token = signAssignmentPreview(payload);
  assert.equal(
    verifyAssignmentPreviewToken(token, {
      organizationId: 42,
      packageCode: "growth",
      reason: "Expand",
      effectiveAt: "2026-07-16T10:00:00.000Z",
    }).ok,
    true
  );
  assert.equal(
    verifyAssignmentPreviewToken(token, {
      organizationId: 99,
      packageCode: "growth",
      reason: "Expand",
      effectiveAt: "2026-07-16T10:00:00.000Z",
    }).code,
    "CROSS_TENANT_TOKEN"
  );
});

test(
  "Foundation to Growth, valid downgrade, blocked downgrades, duplicate, audit history, unauthorised, cross-tenant",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("pkgassign");
    const passwordHash = await bcrypt.hash("superpw123456", 12);

    const superId = await adminUsersRepo.insertUser(pool, {
      username: `pkg_super_${suffix}`,
      passwordHash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "Pkg Super",
    });
    const tenantMgrId = await adminUsersRepo.insertUser(pool, {
      username: `pkg_tm_${suffix}`,
      passwordHash,
      role: ROLES.TENANT_MANAGER,
      tenantId: TENANT_ZM,
      displayName: "Pkg TM",
    });
    void tenantMgrId;

    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `pkg_as_${suffix}`.slice(0, 40),
      name: `Pkg Assign ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      org.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: "start" },
      superId
    );

    const orgOther = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `pkg_ot_${suffix}`.slice(0, 40),
      name: `Pkg Other ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgOther.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: null },
      superId
    );

    const main = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: `main_${suffix}`.slice(0, 30),
      host_slug: `main_${suffix}`.slice(0, 30),
      name: "Main Campus",
      status: "active",
    });
    const inactive = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: `east_${suffix}`.slice(0, 30),
      host_slug: `east_${suffix}`.slice(0, 30),
      name: "East Inactive",
      status: "suspended",
    });
    void main;

    // Foundation → Growth preview + confirm
    const upgradePreview = await previewPackageAssignment(pool, org.id, {
      package_code: "growth",
      reason: "Pilot expansion",
      effective_at: new Date("2026-07-16T10:00:00.000Z"),
    });
    assert.equal(upgradePreview.direction, "upgrade");
    assert.equal(upgradePreview.canConfirm, true);
    assert.ok(
      upgradePreview.inactiveBranchesEligibleForActivation.some((b) => Number(b.id) === Number(inactive.id))
    );
    assert.ok(upgradePreview.consequences.some((c) => /no invoices/i.test(c)));

    const usedTokens = new Set();
    const upgraded = await confirmPackageAssignment(
      pool,
      org.id,
      {
        package_code: "growth",
        reason: "Pilot expansion",
        effective_at: "2026-07-16T10:00:00.000Z",
        confirm_token: upgradePreview.confirmToken,
        used_tokens: usedTokens,
      },
      superId
    );
    assert.equal(upgraded.package.packageCode, "growth");

    await assert.rejects(
      () =>
        confirmPackageAssignment(
          pool,
          org.id,
          {
            package_code: "growth",
            reason: "Pilot expansion",
            effective_at: "2026-07-16T10:00:00.000Z",
            confirm_token: upgradePreview.confirmToken,
            used_tokens: usedTokens,
          },
          superId
        ),
      (err) => err && err.code === "DUPLICATE_SUBMISSION"
    );

    const historyAfterUpgrade = await churchBillingRepo.listPackageHistoryForOrganization(pool, org.id);
    assert.ok(historyAfterUpgrade.length >= 1);
    assert.equal(historyAfterUpgrade[0].new_package_code, "growth");
    assert.equal(historyAfterUpgrade[0].changed_by_platform_admin_id, superId);
    assert.match(String(historyAfterUpgrade[0].change_reason || ""), /Pilot expansion/);

    const auditUpgrade = await pool.query(
      `SELECT * FROM public.church_audit_logs
       WHERE organization_id = $1 AND action = 'platform_package_assigned'
       ORDER BY id DESC LIMIT 1`,
      [org.id]
    );
    assert.equal(auditUpgrade.rows.length, 1);
    assert.equal(auditUpgrade.rows[0].actor_id, superId);
    assert.equal(auditUpgrade.rows[0].metadata_json.new_package, "growth");

    // Cross-tenant: token for org cannot confirm orgOther
    const otherPreview = await previewPackageAssignment(pool, orgOther.id, {
      package_code: "growth",
      reason: "Other org upgrade",
      effective_at: new Date("2026-07-16T12:00:00.000Z"),
    });
    await assert.rejects(
      () =>
        confirmPackageAssignment(
          pool,
          org.id,
          {
            package_code: "growth",
            reason: "Other org upgrade",
            effective_at: "2026-07-16T12:00:00.000Z",
            confirm_token: otherPreview.confirmToken,
          },
          superId
        ),
      (err) => err && (err.code === "CROSS_TENANT_TOKEN" || err.code === "INVALID_TOKEN")
    );

    // Activate second branch under Growth for downgrade-with-multiple-branches case
    await pool.query(
      `UPDATE public.church_branches
       SET status = 'active', lifecycle_phase = 'active',
           location_text = 'East Rd', service_times = 'Sun 10:00', billing_ready = true
       WHERE id = $1`,
      [inactive.id]
    );

    let downgradeCheck = await evaluateFoundationDowngradeEligibility(pool, org.id);
    assert.equal(downgradeCheck.allowed, false);
    assert.ok(downgradeCheck.incompatibilities.some((i) => i.code === "active_branches"));

    await assert.rejects(
      async () => {
        const p = await previewPackageAssignment(pool, org.id, {
          package_code: "foundation",
          reason: "Scale back",
          effective_at: new Date(),
        });
        assert.equal(p.canConfirm, false);
        await confirmPackageAssignment(
          pool,
          org.id,
          {
            package_code: "foundation",
            reason: "Scale back",
            effective_at: p.effectiveAt,
            confirm_token: p.confirmToken,
          },
          superId
        );
      },
      (err) => err && err.code === "DOWNGRADE_BLOCKED"
    );

    // Resolve branches: leave one active
    await pool.query(
      `UPDATE public.church_branches SET status = 'suspended', lifecycle_phase = 'temporarily_inactive' WHERE id = $1`,
      [inactive.id]
    );

    // Member over limit (bulk)
    const memberHash = await bcrypt.hash("mempass123456", 12);
    await pool.query(
      `INSERT INTO public.church_members (
         organization_id, branch_id, platform_tenant_id,
         email, phone, phone_normalized, full_name, password_hash, status
       )
       SELECT $1, $2, $3,
              'm' || g || '_' || $4 || '@example.com',
              '0977' || lpad(g::text, 6, '0'),
              '0977' || lpad(g::text, 6, '0'),
              'Member ' || g,
              $5,
              'verified'
       FROM generate_series(1, 251) AS g`,
      [org.id, main.id, TENANT_ZM, suffix, memberHash]
    );

    downgradeCheck = await evaluateFoundationDowngradeEligibility(pool, org.id);
    assert.equal(downgradeCheck.allowed, false);
    assert.ok(downgradeCheck.incompatibilities.some((i) => i.code === "active_members"));

    await pool.query(
      `UPDATE public.church_members SET status = 'suspended'
       WHERE organization_id = $1 AND email LIKE $2`,
      [org.id, `m%_${suffix}@example.com`]
    );
    // keep 10 verified only
    await pool.query(
      `UPDATE public.church_members SET status = 'verified'
       WHERE id IN (
         SELECT id FROM public.church_members
         WHERE organization_id = $1 ORDER BY id ASC LIMIT 10
       )`,
      [org.id]
    );

    // Admin over limit: create 11 hq admins (no branch admins yet)
    for (let i = 0; i < 11; i++) {
      await hqAdminsRepo.createHqAdmin(pool, {
        organization_id: org.id,
        full_name: `HQ ${i}`,
        email: `hq${i}_${suffix}@example.com`,
        phone: `0966${String(100000 + i).slice(-6)}`,
        password_hash: memberHash,
        role: "hq_admin",
        status: "active",
      });
    }
    downgradeCheck = await evaluateFoundationDowngradeEligibility(pool, org.id);
    assert.equal(downgradeCheck.allowed, false);
    assert.ok(downgradeCheck.incompatibilities.some((i) => i.code === "admins"));

    await pool.query(
      `UPDATE public.church_hq_admins SET status = 'inactive'
       WHERE organization_id = $1 AND email LIKE $2`,
      [org.id, `hq%_${suffix}@example.com`]
    );
    await pool.query(
      `UPDATE public.church_hq_admins SET status = 'active'
       WHERE id IN (
         SELECT id FROM public.church_hq_admins WHERE organization_id = $1 ORDER BY id ASC LIMIT 2
       )`,
      [org.id]
    );

    // Valid Growth → Foundation
    const downPreview = await previewPackageAssignment(pool, org.id, {
      package_code: "foundation",
      reason: "Return to Foundation",
      effective_at: new Date("2026-08-01T00:00:00.000Z"),
    });
    assert.equal(downPreview.direction, "downgrade");
    assert.equal(downPreview.canConfirm, true);
    const used2 = new Set();
    const downgraded = await confirmPackageAssignment(
      pool,
      org.id,
      {
        package_code: "foundation",
        reason: "Return to Foundation",
        effective_at: "2026-08-01T00:00:00.000Z",
        confirm_token: downPreview.confirmToken,
        used_tokens: used2,
      },
      superId
    );
    assert.equal(downgraded.package.packageCode, "foundation");
    const plan = await getOrganisationPlan(pool, org.id);
    assert.equal(plan.packageCode, "foundation");

    // HTTP: unauthorised tenant manager
    const app = express();
    app.set("view engine", "ejs");
    app.set("views", path.join(__dirname, "../views"));
    app.use(express.urlencoded({ extended: true }));
    app.use(
      session({
        secret: "pkg-assign-test",
        resave: false,
        saveUninitialized: false,
      })
    );
    app.use((req, res, next) => {
      req.tenant = { id: TENANT_ZM, slug: "zm" };
      req.tenantUrlPrefix = "";
      res.locals.asset = (k) => `/${String(k || "").replace(/^\//, "")}`;
      next();
    });
    app.use("/admin", adminRoutes({ db }));

    const tmAgent = request.agent(app);
    await tmAgent
      .post("/admin/login")
      .type("form")
      .send({ username: `pkg_tm_${suffix}`, password: "superpw123456" })
      .expect(302);
    const forbidden = await tmAgent.get(`/admin/church/organizations/${org.id}/plan`);
    assert.ok([302, 303, 403, 404].includes(forbidden.status));
    if ([302, 303].includes(forbidden.status)) {
      assert.doesNotMatch(String(forbidden.headers.location || ""), new RegExp(`/plan$`));
    }

    const superAgent = request.agent(app);
    await superAgent
      .post("/admin/login")
      .type("form")
      .send({ username: `pkg_super_${suffix}`, password: "superpw123456" })
      .expect(302);
    const planPage = await superAgent.get(`/admin/church/organizations/${org.id}/plan`);
    assert.equal(planPage.status, 200);
    assert.match(planPage.text, /Current package|Foundation/);
    assert.match(planPage.text, /Assign package/);
    assert.match(planPage.text, /Preview assignment/);

    await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = ANY($1::int[])`, [
      [org.id, orgOther.id],
    ]);
    await pool.query(
      `DELETE FROM public.church_organization_package_history WHERE organization_id = ANY($1::int[])`,
      [[org.id, orgOther.id]]
    );
    await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [org.id]);
    await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [org.id]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = ANY($1::int[])`, [
      [org.id, orgOther.id],
    ]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = ANY($1::int[])`, [
      [org.id, orgOther.id],
    ]);
    await pool.query(`DELETE FROM public.admin_users WHERE id = ANY($1::int[])`, [[superId, tenantMgrId]]);
  }
);
