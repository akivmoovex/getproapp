"use strict";

/**
 * Foundation core church-management workflow coverage.
 * Public pages, member portal, branch admin permissions, and tenant security gates.
 */

const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const churchRoutes = require("../src/routes/church");
const { TENANT_PUBLIC_PATHS } = require("../src/church/churchTenantPublicSeo");
const { churchOperationalAccessGate } = require("../src/church/churchStatusAccess");
const { requireChurchBranchHost } = require("../src/routes/church/branchAdmin");
const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");

const PUBLIC_SHELL = path.join(__dirname, "../views/church/partials/public_shell_start.ejs");
const MEMBER_SHELL = path.join(__dirname, "../views/church/partials/member_shell_start.ejs");
const CSS_PATH = path.join(__dirname, "../public/church/church.css");

function readPublicCssVersion() {
  const shell = fs.readFileSync(PUBLIC_SHELL, "utf8");
  const match = shell.match(/church\.css\?v=(\d+)/);
  assert.ok(match, "public shell should reference church.css version");
  return match[1];
}

function makeTenantApp(ctx) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "church-foundation-workflows",
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

function activeBranchCtx(overrides = {}) {
  return {
    kind: "branch",
    orgSlug: overrides.orgSlug || "demo",
    organization: {
      id: overrides.orgId || 1,
      name: overrides.orgName || "Alpha Grace Church",
      status: overrides.orgStatus || "active",
      plan_code: "foundation",
    },
    branch: {
      id: overrides.branchId || 1,
      name: overrides.branchName || "Downtown Branch",
      status: overrides.branchStatus || "active",
      host_slug: overrides.hostSlug || "demo",
      service_times: "Sunday Worship · 10:00 AM",
      location_text: "12 Faith Street",
      contact_phone: "+260971111111",
      contact_email: "office@example.com",
    },
  };
}

test("public route coverage: all tenant public paths render", async () => {
  const app = makeTenantApp(activeBranchCtx());
  const cssVersion = readPublicCssVersion();
  const routes = Object.values(TENANT_PUBLIC_PATHS);
  for (const route of routes) {
    const res = await request(app).get(route);
    assert.equal(res.status, 200, `${route} should render`);
    assert.match(res.text, new RegExp(`church\\.css\\?v=${cssVersion}`));
    assert.match(res.text, /data-tenant-header="1"/);
  }
});

test("public route coverage: locations and service times appear on home, about, and contact", async () => {
  const app = makeTenantApp(activeBranchCtx());
  const home = await request(app).get("/");
  assert.equal(home.status, 200);
  assert.match(home.text, /Sunday Worship|Weekly Service Times/);

  const about = await request(app).get("/about");
  assert.equal(about.status, 200);
  assert.match(about.text, /12 Faith Street|Visit Us/i);

  const contact = await request(app).get("/contact");
  assert.equal(contact.status, 200);
  assert.match(contact.text, /Sunday Worship|Service Times|12 Faith Street/i);
});

test("mobile and desktop rendering: public and member shells expose responsive classes", () => {
  const css = fs.readFileSync(CSS_PATH, "utf8");
  assert.match(css, /\.church-show-mobile-only/);
  assert.match(css, /\.church-show-desktop-only/);
  assert.match(css, /--church-public-bp:\s*900px/);

  const memberShell = fs.readFileSync(MEMBER_SHELL, "utf8");
  assert.match(memberShell, /church-member-bottom-nav/);
  assert.match(memberShell, /church-member-sidebar/);
});

test("mobile and desktop rendering: tenant public pages include dual-layout markers", async () => {
  const app = makeTenantApp(activeBranchCtx());
  const home = await request(app).get("/");
  assert.equal(home.status, 200);
  assert.match(home.text, /bb-tenant-home|data-tenant-home/);
});

test("member portal navigation: shell links cover Foundation member areas", () => {
  const shell = fs.readFileSync(MEMBER_SHELL, "utf8");
  for (const href of [
    "/member/dashboard",
    "/member/my-ministries",
    "/member/events",
    "/member/resources",
    "/member/requests",
    "/member/giving",
    "/member/announcements",
    "/member/profile",
    "/member/forms",
    "/member/prayer-request",
  ]) {
    assert.match(shell, new RegExp(`href="${href}"`));
  }
});

test("branch-admin permissions: branch routes require church branch host", () => {
  const req = { churchContext: { kind: "vertical-apex" } };
  let statusCode = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    type() {
      return this;
    },
    send() {},
  };
  requireChurchBranchHost(req, res, () => {
    statusCode = 200;
  });
  assert.equal(statusCode, 404);
});

test("branch-admin permissions: unauthenticated branch admin redirects to login", async () => {
  const app = makeTenantApp(activeBranchCtx());
  const res = await request(app).get("/branch/dashboard");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/branch/login");
});

test("suspended organisation: public pages blocked with suspended messaging", async () => {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = activeBranchCtx({ orgStatus: "suspended" });
    next();
  });
  app.use(churchOperationalAccessGate);
  app.get("/", (req, res) => res.status(200).send("should not reach"));
  app.use(churchRoutes());

  const res = await request(app).get("/");
  assert.equal(res.status, 503);
  assert.match(res.text, /suspended|temporarily unavailable/i);
});

test("inactive branch: public pages blocked with inactive messaging", async () => {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = activeBranchCtx({ branchStatus: "inactive" });
    next();
  });
  app.use(churchOperationalAccessGate);
  app.get("/", (req, res) => res.status(200).send("should not reach"));
  app.use(churchRoutes());

  const res = await request(app).get("/");
  assert.equal(res.status, 503);
  assert.match(res.text, /not active|temporarily unavailable/i);
});

test("unauthenticated member routes redirect to unified login", async () => {
  const app = makeTenantApp(activeBranchCtx());
  const res = await request(app).get("/member/dashboard");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/login");
});

test(
  "member registration and verification: pending member cannot access portal",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = `fw_${Date.now()}`;
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `fw_${suffix}`,
      name: `Foundation Workflow ${suffix}`,
      plan_code: "foundation",
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: "Main",
      host_slug: `fw_${suffix}`,
    });
    const bcrypt = require("bcryptjs");
    const passwordHash = await bcrypt.hash("testpass123", 12);
    await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      email: `pending_${suffix}@example.com`,
      phone: "0977111001",
      full_name: "Pending Member",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
    });

    const app = makeTenantApp({
      kind: "branch",
      orgSlug: org.slug,
      organization: org,
      branch,
    });
    const agent = request.agent(app);
    await agent.post("/login").type("form").send({
      identifier: `pending_${suffix}@example.com`,
      password: "testpass123",
    });
    const dash = await agent.get("/member/dashboard");
    assert.equal(dash.status, 302);
    assert.equal(dash.headers.location, "/waiting-verification");

    await pool.query(`DELETE FROM public.church_members WHERE branch_id = $1`, [branch.id]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branch.id]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [org.id]);
  }
);

test(
  "tenant isolation: member cannot read another member's care request",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const memberRequestsRepo = require("../src/db/pg/church/memberRequestsRepo");
    const suffix = `fw_iso_${Date.now()}`;
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `fwiso_${suffix}`,
      name: `Iso Church ${suffix}`,
      plan_code: "foundation",
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: "Main",
      host_slug: `fwiso_${suffix}`,
    });
    const bcrypt = require("bcryptjs");
    const passwordHash = await bcrypt.hash("testpass123", 12);

    const memberA = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      email: `a_${suffix}@example.com`,
      phone: "0977111002",
      full_name: "Member A",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
    });
    await membersRepo.updateMemberStatusForBranch(pool, memberA.id, branch.id, "verified");

    const memberB = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      email: `b_${suffix}@example.com`,
      phone: "0977111003",
      full_name: "Member B",
      password_hash: passwordHash,
      gender: "female",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
    });
    await membersRepo.updateMemberStatusForBranch(pool, memberB.id, branch.id, "verified");

    const otherRequest = await memberRequestsRepo.createMemberRequest(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      member_id: memberB.id,
      request_type: "Other",
      subject: "Private",
      description: "Not for member A",
    });

    const app = makeTenantApp({ kind: "branch", orgSlug: org.slug, organization: org, branch });
    const agent = request.agent(app);
    await agent.post("/login").type("form").send({
      identifier: `a_${suffix}@example.com`,
      password: "testpass123",
    });
    const blocked = await agent.get(`/member/requests/${otherRequest.id}`);
    assert.equal(blocked.status, 404);

    await pool.query(`DELETE FROM public.church_member_requests WHERE branch_id = $1`, [branch.id]);
    await pool.query(`DELETE FROM public.church_members WHERE branch_id = $1`, [branch.id]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branch.id]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [org.id]);
  }
);
