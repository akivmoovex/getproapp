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
const { requireChurchBranchHost } = require("../src/routes/church/auth");

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
      secret: "test-church-auth-secret",
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

const validRegistrationBody = {
  full_name: "Test Member",
  phone: "0977123456",
  email: "member@example.com",
  gender: "male",
  age_group: "Adult (36-60)",
  address_area: "Kafue Central",
  attendance_duration: "Less than 6 months",
  ministry_interest: "choir",
  password: "testpass123",
  confirm_password: "testpass123",
  accept_terms: "on",
};

test("requireChurchBranchHost rejects vertical-apex context", () => {
  const req = {
    churchContext: { kind: "vertical-apex" },
  };
  let statusCode = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    type() {
      return this;
    },
    send(body) {
      assert.equal(body, "Not found");
    },
  };
  requireChurchBranchHost(req, res, () => {
    assert.fail("next should not be called");
  });
  assert.equal(statusCode, 404);
});

test("church auth routes are skipped when not a church host", async () => {
  const app = makeApp(null, false);
  const res = await request(app).get("/register");
  assert.equal(res.status, 404);
  assert.equal(res.text, "not found");
});

test(
  "GET /register works on branch church host",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("reg");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `test_${suffix}`,
      name: `Test Church ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `Test Church ${suffix}`,
    });

    const app = makeApp({
      kind: "branch",
      orgSlug: org.slug,
      organization: org,
      branch,
    });

    const res = await request(app).get("/register");
    assert.equal(res.status, 200);
    assert.match(res.text, /Member Registration/);

    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [org.id]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [org.id]);
  }
);

test(
  "GET /register returns 404 on church vertical apex host",
  { skip: !isPgConfigured() },
  async () => {
    const app = makeApp({
      kind: "vertical-apex",
      host: "church.getproapp.org",
      organization: null,
      branch: null,
      orgSlug: null,
    });
    const res = await request(app).get("/register");
    assert.equal(res.status, 404);
  }
);

test(
  "duplicate registration is prevented within the same branch",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("dup");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `dup_${suffix}`,
      name: `Dup Church ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `Dup Church ${suffix}`,
    });

    const app = makeApp({
      kind: "branch",
      orgSlug: org.slug,
      organization: org,
      branch,
    });

    const email = `dup_${suffix}@example.com`;
    const body = { ...validRegistrationBody, email, phone: "0977000111" };

    const first = await request(app).post("/register").type("form").send(body);
    assert.equal(first.status, 303);
    assert.equal(first.headers.location, "/registration-submitted");

    const second = await request(app).post("/register").type("form").send(body);
    assert.equal(second.status, 400);
    assert.match(second.text, /could not complete registration/i);

    await pool.query(`DELETE FROM public.church_members WHERE branch_id = $1`, [branch.id]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [org.id]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [org.id]);
  }
);

test(
  "pending member login redirects to /waiting-verification",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("login");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `login_${suffix}`,
      name: `Login Church ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `Login Church ${suffix}`,
    });

    const passwordHash = await bcrypt.hash("testpass123", 12);
    await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      email: `pending_${suffix}@example.com`,
      phone: "0977333444",
      full_name: "Pending Member",
      password_hash: passwordHash,
      gender: "female",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
      ministry_interest: "",
    });

    const app = makeApp({
      kind: "branch",
      orgSlug: org.slug,
      organization: org,
      branch,
    });

    const agent = request.agent(app);
    const res = await agent
      .post("/login")
      .type("form")
      .send({ identifier: `pending_${suffix}@example.com`, password: "testpass123" });
    assert.equal(res.status, 303);
    assert.equal(res.headers.location, "/waiting-verification");

    const waiting = await agent.get("/waiting-verification");
    assert.equal(waiting.status, 200);
    assert.match(waiting.text, /Waiting for verification/i);

    await pool.query(`DELETE FROM public.church_members WHERE branch_id = $1`, [branch.id]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [org.id]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [org.id]);
  }
);
