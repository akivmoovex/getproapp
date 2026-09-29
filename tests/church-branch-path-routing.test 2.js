"use strict";

const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  validateBranchPathSlug,
  BRANCH_PATH_RESERVED_SLUGS,
  branchPathSlug,
} = require("../src/church/branchPathSlug");
const {
  organisationAllowsBranchPaths,
  parseBranchPath,
  buildCanonicalPublicPath,
  findOrganisationBranchByPathSlug,
} = require("../src/services/church/branchPathRoutingService");
const {
  transferMemberToBranch,
  listMemberBranchHistory,
} = require("../src/services/church/memberBranchTransferService");
const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
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
      secret: "church-branch-path-routing",
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

test("branch path slug rules reject reserved words and accept stable slugs", () => {
  assert.equal(validateBranchPathSlug("main-campus").ok, true);
  assert.equal(validateBranchPathSlug("About").ok, false);
  assert.equal(validateBranchPathSlug("branches").ok, false);
  assert.ok(BRANCH_PATH_RESERVED_SLUGS.has("events"));
  assert.equal(branchPathSlug({ slug: "kafue", host_slug: "other" }), "kafue");
});

test("Foundation does not allow branch paths; Growth does", () => {
  assert.equal(organisationAllowsBranchPaths({ plan_code: "foundation" }), false);
  assert.equal(organisationAllowsBranchPaths({ plan_code: "free" }), false);
  assert.equal(organisationAllowsBranchPaths({ plan_code: "growth" }), true);
  assert.equal(organisationAllowsBranchPaths({ plan_code: "standard" }), true);
});

test("parseBranchPath and canonical URLs avoid duplicating host branch content", () => {
  assert.deepEqual(parseBranchPath("/branches/east/events"), {
    branchSlug: "east",
    restPath: "/events",
  });
  assert.equal(parseBranchPath("/events"), null);

  const host = { id: 1, slug: "main", host_slug: "hopechurch" };
  const east = { id: 2, slug: "east", host_slug: "hope-east" };
  assert.equal(buildCanonicalPublicPath({ hostBranch: host, contentBranch: host, pageKey: "events" }), "/events");
  assert.equal(
    buildCanonicalPublicPath({ hostBranch: host, contentBranch: east, pageKey: "events" }),
    "/branches/east/events"
  );
  assert.equal(buildCanonicalPublicPath({ hostBranch: host, contentBranch: east, pageKey: "home" }), "/branches/east");
});

test(
  "Growth path routing, Foundation block, inactive, isolation, empty content, transfer history",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("bpath");
    const passwordHash = await bcrypt.hash("memberpass123456", 12);

    const orgGrowth = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `pg_${suffix}`.slice(0, 40),
      name: `Path Growth ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgGrowth.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );

    const orgFoundation = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `pf_${suffix}`.slice(0, 40),
      name: `Path Foundation ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgFoundation.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: null },
      null
    );

    const orgOther = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `po_${suffix}`.slice(0, 40),
      name: `Path Other ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgOther.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );

    const primary = await branchesRepo.createBranch(pool, {
      organization_id: orgGrowth.id,
      slug: `main_${suffix}`.slice(0, 30),
      host_slug: `main_${suffix}`.slice(0, 30),
      name: "Primary Campus",
      status: "active",
    });
    const east = await branchesRepo.createBranch(pool, {
      organization_id: orgGrowth.id,
      slug: `east_${suffix}`.slice(0, 30),
      host_slug: `east_${suffix}`.slice(0, 30),
      name: "East Campus",
      status: "active",
    });
    const inactive = await branchesRepo.createBranch(pool, {
      organization_id: orgGrowth.id,
      slug: `old_${suffix}`.slice(0, 30),
      host_slug: `old_${suffix}`.slice(0, 30),
      name: "Inactive Campus",
      status: "suspended",
    });
    const foundationBranch = await branchesRepo.createBranch(pool, {
      organization_id: orgFoundation.id,
      slug: `fmain_${suffix}`.slice(0, 30),
      host_slug: `fmain_${suffix}`.slice(0, 30),
      name: "Foundation Only",
      status: "active",
    });
    const otherBranch = await branchesRepo.createBranch(pool, {
      organization_id: orgOther.id,
      slug: `oth_${suffix}`.slice(0, 30),
      host_slug: `oth_${suffix}`.slice(0, 30),
      name: "Other Org Campus",
      status: "active",
    });

    const found = await findOrganisationBranchByPathSlug(pool, orgGrowth.id, east.slug);
    assert.equal(Number(found.id), Number(east.id));
    const missing = await findOrganisationBranchByPathSlug(pool, orgGrowth.id, otherBranch.slug);
    assert.equal(missing, null);

    const orgG = await organizationsRepo.findOrganizationById(pool, orgGrowth.id);
    const orgF = await organizationsRepo.findOrganizationById(pool, orgFoundation.id);

    const growthApp = makeApp({
      kind: "branch",
      hostSlug: primary.host_slug,
      organization: orgG,
      branch: primary,
      hostBranch: primary,
    });

    const validPath = await request(growthApp).get(`/branches/${east.slug}/events`);
    assert.equal(validPath.status, 200);
    assert.match(validPath.text, /East Campus|Events|No upcoming events|upcoming/i);
    assert.match(validPath.text, new RegExp(`/branches/${east.slug}/events`));

    const invalidSlug = await request(growthApp).get("/branches/not-a-real-campus/events");
    assert.equal(invalidSlug.status, 404);

    const foreignSlug = await request(growthApp).get(`/branches/${otherBranch.slug}/events`);
    assert.equal(foreignSlug.status, 404);

    const inactivePath = await request(growthApp).get(`/branches/${inactive.slug}`);
    assert.ok(inactivePath.status === 403 || inactivePath.status === 503 || inactivePath.status === 200);
    assert.doesNotMatch(inactivePath.text || "", /East Campus/);

    const canonicalCollapse = await request(growthApp).get(`/branches/${primary.slug}/about`);
    assert.equal(canonicalCollapse.status, 301);
    assert.equal(canonicalCollapse.headers.location, "/about");

    const emptyEvents = await request(growthApp).get(`/branches/${east.slug}/events`);
    assert.equal(emptyEvents.status, 200);
    assert.doesNotMatch(emptyEvents.text, /Internal Server Error/i);

    const foundationApp = makeApp({
      kind: "branch",
      hostSlug: foundationBranch.host_slug,
      organization: orgF,
      branch: foundationBranch,
      hostBranch: foundationBranch,
    });
    const foundationBlocked = await request(foundationApp).get(`/branches/${foundationBranch.slug}/events`);
    assert.equal(foundationBlocked.status, 404);
    const foundationRoot = await request(foundationApp).get("/events");
    assert.equal(foundationRoot.status, 200);

    const member = await membersRepo.createPendingMember(pool, {
      organization_id: orgGrowth.id,
      branch_id: primary.id,
      platform_tenant_id: TENANT_ZM,
      email: `xfer_${suffix}@example.com`,
      phone: "0977555123",
      full_name: "Transfer Me",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult",
      address_area: "Area",
      attendance_duration: "1 year",
    });
    await membersRepo.verifyMemberForBranch(pool, member.id, primary.id, 1);

    const transferred = await transferMemberToBranch(pool, {
      memberId: member.id,
      fromBranchId: primary.id,
      toBranchId: east.id,
      organizationId: orgGrowth.id,
      organization: orgG,
      actorType: "branch_admin",
      actorId: 1,
      reason: "Relocated",
    });
    assert.equal(Number(transferred.member.branch_id), Number(east.id));
    const history = await listMemberBranchHistory(pool, member.id);
    assert.equal(history.length, 1);
    assert.equal(Number(history[0].from_branch_id), Number(primary.id));
    assert.equal(Number(history[0].to_branch_id), Number(east.id));
    assert.equal(history[0].reason, "Relocated");

    const stillExists = await pool.query(`SELECT id, branch_id, full_name FROM public.church_members WHERE id = $1`, [
      member.id,
    ]);
    assert.equal(stillExists.rows[0].full_name, "Transfer Me");
    assert.equal(Number(stillExists.rows[0].branch_id), Number(east.id));

    await pool.query(`DELETE FROM public.church_member_branch_history WHERE organization_id = ANY($1::int[])`, [
      [orgGrowth.id, orgFoundation.id, orgOther.id],
    ]);
    await pool.query(`DELETE FROM public.church_members WHERE organization_id = ANY($1::int[])`, [
      [orgGrowth.id, orgFoundation.id, orgOther.id],
    ]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = ANY($1::int[])`, [
      [orgGrowth.id, orgFoundation.id, orgOther.id],
    ]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = ANY($1::int[])`, [
      [orgGrowth.id, orgFoundation.id, orgOther.id],
    ]);
  }
);
