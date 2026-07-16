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
const {
  FOUNDATION_SECOND_ACTIVE_ERROR,
  activateBranch,
} = require("../src/services/church/branchActivationPolicyService");
const {
  createBranchByHq,
  activateBranchByHq,
} = require("../src/services/church/growthMultiBranchService");
const {
  transferMemberToBranch,
  listMemberBranchHistory,
} = require("../src/services/church/memberBranchTransferService");
const { churchOperationalAccessGate } = require("../src/church/churchStatusAccess");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
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
      secret: "church-growth-multi-branch",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = ctx;
    next();
  });
  app.use(churchOperationalAccessGate);
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

async function cleanupOrg(pool, orgId) {
  await pool.query(`DELETE FROM public.church_member_branch_history WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

function branchAdminPayload(suffix, key) {
  return {
    full_name: `Admin ${key}`,
    email: `${key}_${suffix}@example.com`,
    phone: "0977111222",
    temporary_password: "temppass12345",
  };
}

function branchPayload(name, slug, suffix) {
  return {
    name,
    slug,
    location_text: "Lusaka Central",
    service_times: "Sunday 09:00",
    country: "Zambia",
    city: "Lusaka",
    branchAdmin: branchAdminPayload(suffix, slug),
  };
}

async function seedHqAdmin(pool, orgId, suffix, passwordHash) {
  return hqAdminsRepo.createHqAdmin(pool, {
    organization_id: orgId,
    full_name: "HQ Admin",
    email: `hq_${suffix}@example.com`,
    phone: "0977333444",
    password_hash: passwordHash,
  });
}

async function loginHqAgent(app, email, password) {
  const agent = request.agent(app);
  await agent.post("/hq/login").type("form").send({ identifier: email, password });
  return agent;
}

test(
  "Growth multi-branch HQ administration",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("gmb");
    const passwordHash = await bcrypt.hash("hqpass123456", 12);

    const orgGrowth = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `gmb_g_${suffix}`.slice(0, 40),
      name: `Growth Multi ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgGrowth.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );

    const orgFoundation = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `gmb_f_${suffix}`.slice(0, 40),
      name: `Foundation Multi ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgFoundation.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: null },
      null
    );

    const orgOther = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `gmb_o_${suffix}`.slice(0, 40),
      name: `Other Tenant ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgOther.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );

    const growthPrimary = await branchesRepo.createBranch(pool, {
      organization_id: orgGrowth.id,
      slug: `main_${suffix}`.slice(0, 30),
      host_slug: `main_${suffix}`.slice(0, 30),
      name: "Growth Primary",
      status: "active",
      location_text: "Lusaka",
      service_times: "Sunday 09:00",
    });
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgGrowth.id,
      branch_id: growthPrimary.id,
      full_name: "Primary Admin",
      email: `pa_${suffix}@example.com`,
      phone: "0977000001",
      password_hash: passwordHash,
    });
    await seedHqAdmin(pool, orgGrowth.id, suffix, passwordHash);

    const foundationPrimary = await branchesRepo.createBranch(pool, {
      organization_id: orgFoundation.id,
      slug: `fmain_${suffix}`.slice(0, 30),
      host_slug: `fmain_${suffix}`.slice(0, 30),
      name: "Foundation Primary",
      status: "active",
      location_text: "Ndola",
      service_times: "Sunday 10:00",
    });
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgFoundation.id,
      branch_id: foundationPrimary.id,
      full_name: "Foundation Admin",
      email: `fa_${suffix}@example.com`,
      phone: "0977000002",
      password_hash: passwordHash,
    });
    await seedHqAdmin(pool, orgFoundation.id, `f_${suffix}`, passwordHash);

    const otherBranch = await branchesRepo.createBranch(pool, {
      organization_id: orgOther.id,
      slug: `shared_slug_${suffix}`.slice(0, 30),
      host_slug: `oth_${suffix}`.slice(0, 30),
      name: "Other Org Branch",
      status: "active",
      location_text: "Kitwe",
      service_times: "Sunday 11:00",
    });
    await seedHqAdmin(pool, orgOther.id, `o_${suffix}`, passwordHash);

    const orgGrowthFresh = await organizationsRepo.findOrganizationById(pool, orgGrowth.id);
    const orgFoundationFresh = await organizationsRepo.findOrganizationById(pool, orgFoundation.id);

    const growthApp = makeApp({
      kind: "branch",
      orgSlug: orgGrowthFresh.slug,
      organization: orgGrowthFresh,
      branch: growthPrimary,
      hostBranch: growthPrimary,
      hostSlug: growthPrimary.host_slug,
    });
    const growthAgent = await loginHqAgent(growthApp, `hq_${suffix}@example.com`, "hqpass123456");

    // Multiple Growth branches via HQ create
    const eastSlug = `east_${suffix}`.slice(0, 30);
    const eastCreate = await createBranchByHq(pool, orgGrowth.id, 1, {
      branch: {
        name: "East Campus",
        slug: eastSlug,
        location_text: "East Lusaka",
        service_times: "Sunday 09:30",
        country: "Zambia",
      },
      branchAdmin: branchAdminPayload(suffix, "east"),
    });
    assert.equal(eastCreate.createdAsActive, true);
    assert.equal(eastCreate.branch.status, "active");

    const westSlug = `west_${suffix}`.slice(0, 30);
    const westCreate = await createBranchByHq(pool, orgGrowth.id, 1, {
      branch: {
        name: "West Campus",
        slug: westSlug,
        location_text: "West Lusaka",
        service_times: "Sunday 11:00",
        country: "Zambia",
      },
      branchAdmin: branchAdminPayload(suffix, "west"),
    });
    assert.equal(westCreate.branch.status, "active");
    const growthBranches = await branchesRepo.listBranchesForOrganization(pool, orgGrowth.id);
    assert.ok(growthBranches.filter((b) => b.status === "active").length >= 3);

    // Duplicate slug in same org
    let dupErr = null;
    try {
      await createBranchByHq(pool, orgGrowth.id, 1, {
        branch: {
          name: "Duplicate East",
          slug: eastSlug,
          location_text: "X",
          service_times: "Sunday 09:00",
        },
        branchAdmin: branchAdminPayload(suffix, "dupe"),
      });
    } catch (e) {
      dupErr = e;
    }
    assert.equal(dupErr && dupErr.code, "DUPLICATE_BRANCH_SLUG");

    // Same slug in different tenants
    const sharedSlug = `shared_slug_${suffix}`.slice(0, 30);
    const sameSlugOther = await createBranchByHq(pool, orgGrowth.id, 1, {
      branch: {
        name: "Shared Slug Branch",
        slug: sharedSlug,
        location_text: "Lusaka",
        service_times: "Sunday 08:00",
        country: "Zambia",
      },
      branchAdmin: branchAdminPayload(suffix, "shared"),
    });
    assert.equal(sameSlugOther.branch.slug, sharedSlug);
    assert.notEqual(Number(sameSlugOther.branch.organization_id), Number(otherBranch.organization_id));
    assert.equal(otherBranch.slug, sharedSlug);

    // Foundation second branch created as draft; activation rejected
    const fSecond = await createBranchByHq(pool, orgFoundation.id, 1, {
      branch: {
        name: "Foundation Second",
        slug: `fsecond_${suffix}`.slice(0, 30),
        location_text: "Copperbelt",
        service_times: "Sunday 10:30",
        country: "Zambia",
      },
      branchAdmin: branchAdminPayload(suffix, "fsecond"),
    });
    assert.equal(fSecond.createdAsActive, false);
    assert.equal(fSecond.branch.status, "suspended");

    let foundationActivateErr = null;
    try {
      await activateBranchByHq(pool, fSecond.branch.id, orgFoundation.id, 1, {
        billingAcknowledged: false,
      });
    } catch (e) {
      foundationActivateErr = e;
    }
    assert.equal(foundationActivateErr && foundationActivateErr.code, "FOUNDATION_ACTIVE_BRANCH_LIMIT");
    assert.equal(foundationActivateErr.message, FOUNDATION_SECOND_ACTIVE_ERROR);

    // Direct activation bypass via service (concurrent policy enforcement)
    let directBypassErr = null;
    try {
      await activateBranch(pool, fSecond.branch.id, {
        billingAcknowledged: true,
        skipRequirementChecks: true,
      });
    } catch (e) {
      directBypassErr = e;
    }
    assert.equal(directBypassErr && directBypassErr.code, "FOUNDATION_ACTIVE_BRANCH_LIMIT");

    // HQ POST activate bypass for Foundation second branch
    const foundationApp = makeApp({
      kind: "branch",
      orgSlug: orgFoundationFresh.slug,
      organization: orgFoundationFresh,
      branch: foundationPrimary,
      hostBranch: foundationPrimary,
    });
    const foundationAgent = await loginHqAgent(foundationApp, `hq_f_${suffix}@example.com`, "hqpass123456");
    const hqActivateBypass = await foundationAgent
      .post(`/hq/branches/${fSecond.branch.id}/activate`)
      .type("form")
      .send({ billing_acknowledged: "1" });
    assert.equal(hqActivateBypass.status, 400);
    assert.match(hqActivateBypass.text, /Foundation includes one active branch/i);

    // Inactive branch: deactivate east, verify public path blocked
    await branchesRepo.updateBranchStatus(pool, eastCreate.branch.id, "suspended", {
      lifecyclePhase: "temporarily_inactive",
      organizationId: orgGrowth.id,
    });
    const inactivePath = await request(growthApp).get(`/branches/${eastSlug}`);
    assert.ok([403, 503, 404].includes(inactivePath.status) || !/East Campus/i.test(inactivePath.text || ""));

    // Member transfer + history via HQ route
    const member = await membersRepo.createPendingMember(pool, {
      organization_id: orgGrowth.id,
      branch_id: growthPrimary.id,
      platform_tenant_id: TENANT_ZM,
      email: `xfer_${suffix}@example.com`,
      phone: "0977555666",
      full_name: "Transfer Member",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Lusaka",
      attendance_duration: "Less than 6 months",
      ministry_interest: "choir",
    });
    await membersRepo.updateMemberStatusForBranch(pool, member.id, growthPrimary.id, "verified");

    const transferPost = await growthAgent
      .post(`/hq/members/${member.id}/transfer`)
      .type("form")
      .send({ to_branch_id: westCreate.branch.id, transfer_reason: "Relocated west" });
    assert.equal(transferPost.status, 303);
    assert.match(transferPost.headers.location, new RegExp(`/hq/members/${member.id}`));

    const moved = await membersRepo.findMemberByIdForOrganization(pool, member.id, orgGrowth.id);
    assert.equal(Number(moved.branch_id), Number(westCreate.branch.id));
    const history = await listMemberBranchHistory(pool, member.id);
    assert.equal(history.length, 1);
    assert.equal(Number(history[0].from_branch_id), Number(growthPrimary.id));
    assert.equal(Number(history[0].to_branch_id), Number(westCreate.branch.id));

    // Cross-tenant branch / member isolation
    const otherApp = makeApp({
      kind: "branch",
      orgSlug: (await organizationsRepo.findOrganizationById(pool, orgOther.id)).slug,
      organization: await organizationsRepo.findOrganizationById(pool, orgOther.id),
      branch: otherBranch,
      hostBranch: otherBranch,
    });
    const otherAgent = await loginHqAgent(otherApp, `hq_o_${suffix}@example.com`, "hqpass123456");
    const crossBranch = await otherAgent.get(`/hq/branches/${growthPrimary.id}`);
    assert.equal(crossBranch.status, 404);
    const crossMember = await otherAgent.get(`/hq/members/${member.id}`);
    assert.equal(crossMember.status, 404);

    // HQ member lookup UI
    const lookup = await growthAgent.get(`/hq/members?q=${encodeURIComponent("Transfer Member")}`);
    assert.equal(lookup.status, 200);
    assert.match(lookup.text, /Transfer Member/);
    assert.match(lookup.text, /West Campus/);

    // Foundation cannot access cross-branch member lookup
    const foundationLookup = await foundationAgent.get("/hq/members?q=test");
    assert.equal(foundationLookup.status, 403);

    await cleanupOrg(pool, orgGrowth.id);
    await cleanupOrg(pool, orgFoundation.id);
    await cleanupOrg(pool, orgOther.id);
  }
);
