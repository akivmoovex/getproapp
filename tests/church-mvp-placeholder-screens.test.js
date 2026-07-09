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
const membersRepo = require("../src/db/pg/church/membersRepo");
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
      secret: "test-church-mvp-placeholder-screens",
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

const activeBranchCtx = {
  kind: "branch",
  orgSlug: "demo",
  organization: { id: 1, name: "Demo Church", status: "active" },
  branch: { id: 1, name: "Demo Branch", status: "active" },
};

test("non-church host cannot access /sermons", async () => {
  const app = makeApp(null, false);
  const res = await request(app).get("/sermons");
  assert.equal(res.status, 404);
});

test("/sermons loads polished resource cards on branch church host", async () => {
  const app = makeApp(activeBranchCtx);
  const res = await request(app).get("/sermons");
  assert.equal(res.status, 200);
  assert.match(res.text, /Sermons &amp; Resources|Sermons & Resources/);
  assert.match(res.text, /church-sermon-card/);
  assert.match(res.text, /Back to homepage/i);
});

test(
  "homepage links to sermons placeholder",
  { skip: !isPgConfigured() },
  async () => {
    const app = makeApp(activeBranchCtx);
    const res = await request(app).get("/");
    assert.equal(res.status, 200);
    assert.match(res.text, /href="\/sermons"/);
  }
);

test("unauthenticated visitor redirects from /member/resources", async () => {
  const app = makeApp(activeBranchCtx);
  const res = await request(app).get("/member/resources");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/login");
});

test("unauthenticated visitor redirects from /member/forms", async () => {
  const app = makeApp(activeBranchCtx);
  const res = await request(app).get("/member/forms");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/login");
});

test(
  "verified member can view resources and forms placeholders",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("placeholder");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `ph_${suffix}`,
      name: `Placeholder Org ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `Placeholder Branch ${suffix}`,
    });
    const password = "testpass123456";
    const passwordHash = await bcrypt.hash(password, 12);
    const member = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      email: `member_${suffix}@example.com`,
      phone: "0977111555",
      full_name: "Placeholder Member",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Lusaka",
      attendance_duration: "Less than 6 months",
    });
    await membersRepo.updateMemberStatusForBranch(pool, member.id, branch.id, "verified");

    const app = makeApp({
      kind: "branch",
      orgSlug: org.slug,
      organization: org,
      branch,
    });
    const agent = request.agent(app);
    await agent.post("/login").type("form").send({
      identifier: `member_${suffix}@example.com`,
      password,
    });

    const resources = await agent.get("/member/resources");
    assert.equal(resources.status, 200);
    assert.match(resources.text, /church-resource-row/);
    assert.match(resources.text, /Weekly Bible Study Notes/);

    const forms = await agent.get("/member/forms");
    assert.equal(forms.status, 200);
    assert.match(forms.text, /Forms &amp; Documents|Forms & Documents/);
    assert.match(forms.text, /church-resource-row/);
    assert.match(forms.text, /Membership Information Form/);

    const dashboard = await agent.get("/member/dashboard");
    assert.match(dashboard.text, /href="\/member\/resources"/);
    assert.match(dashboard.text, /href="\/member\/forms"/);

    await pool.query(`DELETE FROM public.church_members WHERE branch_id = $1`, [branch.id]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branch.id]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [org.id]);
  }
);
