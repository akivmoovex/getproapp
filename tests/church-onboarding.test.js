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
const { ROLES } = require("../src/auth/roles");
const { db } = require("../src/db");
const { getSubdomain } = require("../src/platform/host");
const { createAttachChurchContext } = require("../src/church/attachChurchContext");
const {
  validateBranchHostSlugField,
  churchPublicHost,
  validateProvisioningBody,
} = require("../src/church/platformProvisioningValidation");
const adminRoutes = require("../src/routes/admin");
const adminUsersRepo = require("../src/db/pg/adminUsersRepo");
const platformProvisioningRepo = require("../src/db/pg/church/platformProvisioningRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const websiteContentRepo = require("../src/db/pg/church/websiteContentRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const churchRoutes = require("../src/routes/church");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createAdminApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "church-onboarding-test",
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
  return app;
}

function makeBlessBoardApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.set("trust proxy", true);
  app.use((req, res, next) => {
    req.subdomain = getSubdomain(req);
    next();
  });
  app.use(createAttachChurchContext());
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("platform fallback"));
  return app;
}

function makePlatformApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use((req, res, next) => {
    req.subdomain = getSubdomain(req);
    next();
  });
  app.use(createAttachChurchContext());
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

async function adminLoginAgent(app, username, password) {
  const agent = request.agent(app);
  await agent.post("/admin/login").type("form").send({ username, password }).expect(302);
  return agent;
}

function provisioningBody(slug, suffix, overrides = {}) {
  return {
    organization_name: `Onboard Church ${suffix}`,
    organization_slug: slug,
    country: "Zambia",
    city: "Kafue",
    plan_code: "free",
    branch_name: `Kafue Baptist ${suffix}`,
    branch_host_slug: slug,
    branch_city: "Kafue",
    branch_country: "Zambia",
    branch_address: "123 Church Road, Kafue",
    pastor_name: "Rev. Onboard Pastor",
    contact_phone: "+260 97 000 1111",
    contact_email: `hello_${suffix}@example.com`,
    branch_status: "active",
    public_site_enabled: "on",
    member_registration_enabled: "on",
    hq_full_name: `HQ Admin ${suffix}`,
    hq_email: `hq_${suffix}@example.com`,
    hq_phone: "0977000111",
    hq_temporary_password: "temppass123",
    branch_admin_full_name: `Branch Admin ${suffix}`,
    branch_admin_username: `admin_${suffix}`.slice(0, 32),
    branch_admin_email: `branch_${suffix}@example.com`,
    branch_admin_phone: "0977000222",
    branch_admin_temporary_password: "temppass456",
    ...overrides,
  };
}

async function cleanupOrg(pool, orgId) {
  await pool.query(`DELETE FROM public.church_sermons WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_events WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branch_website_content WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

test("churchPublicHost uses blessboard.com domain", () => {
  assert.equal(churchPublicHost("kafuebaptist"), "kafuebaptist.blessboard.com");
});

test("validateBranchHostSlugField rejects reserved slugs", () => {
  for (const slug of ["www", "admin", "demo", "blessboard", "getpro", "support", "static", "assets"]) {
    const result = validateBranchHostSlugField(slug);
    assert.equal(result.ok, false, `expected ${slug} to be reserved`);
    assert.match(result.error, /reserved/i);
  }
});

test("validateBranchHostSlugField rejects invalid slug characters", () => {
  const result = validateBranchHostSlugField("Kafue Baptist!");
  assert.equal(result.ok, false);
  assert.match(result.error, /lowercase/i);
});

test(
  "platform admin can provision church with valid slug and starter website content",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("onboard");
    const slug = `kafue${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 40);
    const hash = await bcrypt.hash("superpw123456", 12);
    const superName = `onboard_sup_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    const app = createAdminApp();
    const agent = await adminLoginAgent(app, superName, "superpw123456");
    const body = provisioningBody(slug, suffix);

    const create = await agent.post("/admin/church/organizations").type("form").send(body);
    assert.equal(create.status, 302);
    assert.match(create.headers.location, /provisioned=1$/);

    const orgId = Number(create.headers.location.match(/organizations\/(\d+)/)[1]);
    const branch = await branchesRepo.findBranchByHostSlug(pool, slug);
    assert.ok(branch);
    assert.equal(branch.status, "active");

    const branchAdmin = await pool.query(
      `SELECT * FROM public.church_branch_admins WHERE branch_id = $1 LIMIT 1`,
      [branch.id]
    );
    assert.equal(branchAdmin.rows.length, 1);
    assert.equal(branchAdmin.rows[0].username, body.branch_admin_username);

    const website = await websiteContentRepo.getPublishedWebsiteContentForBranch(pool, branch.id);
    assert.ok(website);
    assert.match(website.about_body, /BlessBoard community|Update this story/i);
    assert.match(website.mission_text, /disciples/i);

    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
    await cleanupOrg(pool, orgId);
  }
);

test(
  "duplicate branch host slug is rejected",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("dupslug");
    const slug = `dup${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 40);
    const hash = await bcrypt.hash("superpw123456", 12);
    const superName = `dup_sup_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    const app = createAdminApp();
    const agent = await adminLoginAgent(app, superName, "superpw123456");
    const body = provisioningBody(slug, suffix);

    const first = await agent.post("/admin/church/organizations").type("form").send(body);
    assert.equal(first.status, 302);
    const orgId = Number(first.headers.location.match(/organizations\/(\d+)/)[1]);

    const dup = await agent.post("/admin/church/organizations").type("form").send({
      ...body,
      organization_slug: `${slug}b`,
      organization_name: `Duplicate ${suffix}`,
    });
    assert.equal(dup.status, 400);
    assert.match(dup.text, /already in use|already exists/i);

    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
    await cleanupOrg(pool, orgId);
  }
);

test(
  "provisioned branch host resolves on blessboard subdomain",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("resolve");
    const slug = `resolve${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 40);
    const result = await platformProvisioningRepo.provisionChurchOrganization(
      pool,
      {
        platform_tenant_id: TENANT_ZM,
        ...validateProvisioningBody(provisioningBody(slug, suffix)).data,
      },
      null
    );

    const app = makeBlessBoardApp();
    const host = `${slug}.blessboard.com`;
    const home = await request(app).get("/").set("Host", host);
    assert.equal(home.status, 200);
    assert.match(home.text, new RegExp(result.branch.name));

    await cleanupOrg(pool, result.organization.id);
  }
);

test("unknownslug.blessboard.com shows Church not found via attach middleware", async () => {
  const app = makeBlessBoardApp();
  const res = await request(app).get("/about").set("Host", "unknownslug.blessboard.com");
  assert.equal(res.status, 404);
  assert.match(res.text, /Church not found/i);
});

test(
  "member registration attaches to provisioned branch host",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("register");
    const slug = `reg${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 40);
    const body = provisioningBody(slug, suffix);
    const validated = validateProvisioningBody(body);
    assert.equal(validated.ok, true);

    const result = await platformProvisioningRepo.provisionChurchOrganization(
      pool,
      { platform_tenant_id: TENANT_ZM, ...validated.data },
      null
    );

    const app = makeBlessBoardApp();
    const host = `${slug}.blessboard.com`;
    const register = await request(app)
      .post("/register")
      .set("Host", host)
      .type("form")
      .send({
        full_name: "New Member",
        phone: "0977555666",
        email: `member_${suffix}@example.com`,
        gender: "female",
        age_group: "Adult (36-60)",
        address_area: "Kafue",
        attendance_duration: "Less than 6 months",
        password: "memberpass123",
        confirm_password: "memberpass123",
        accept_terms: "on",
      });
    assert.equal(register.status, 302);
    assert.equal(register.headers.location, "/registration-submitted");

    const member = await pool.query(
      `SELECT * FROM public.church_members WHERE branch_id = $1 AND email = $2 LIMIT 1`,
      [result.branch.id, `member_${suffix}@example.com`]
    );
    assert.equal(member.rows.length, 1);
    assert.equal(member.rows[0].status, "pending");
    assert.equal(member.rows[0].branch_id, result.branch.id);

    await cleanupOrg(pool, result.organization.id);
  }
);

test(
  "branch admin only sees members from their branch after onboarding",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("scope");
    const slugA = `scopea${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 20);
    const slugB = `scopeb${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 20);

    const resultA = await platformProvisioningRepo.provisionChurchOrganization(
      pool,
      {
        platform_tenant_id: TENANT_ZM,
        ...validateProvisioningBody(provisioningBody(slugA, `${suffix}a`)).data,
      },
      null
    );
    const resultB = await platformProvisioningRepo.provisionChurchOrganization(
      pool,
      {
        platform_tenant_id: TENANT_ZM,
        ...validateProvisioningBody(provisioningBody(slugB, `${suffix}b`)).data,
      },
      null
    );

    const passwordHash = await bcrypt.hash("memberpass123", 12);
    await membersRepo.createPendingMember(pool, {
      organization_id: resultB.organization.id,
      branch_id: resultB.branch.id,
      platform_tenant_id: TENANT_ZM,
      email: `other_${suffix}@example.com`,
      phone: "0977999888",
      full_name: "Other Branch Member",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Other",
      attendance_duration: "First time visitor",
    });

    const app = makeBlessBoardApp();
    const agent = request.agent(app);
    const login = await agent
      .post("/branch/login")
      .set("Host", `${slugA}.blessboard.com`)
      .type("form")
      .send({
        identifier: provisioningBody(slugA, `${suffix}a`).branch_admin_email,
        password: "temppass456",
      });
    assert.equal(login.status, 303);

    const queue = await agent.get("/branch/member-verification").set("Host", `${slugA}.blessboard.com`);
    assert.equal(queue.status, 200);
    assert.doesNotMatch(queue.text, /Other Branch Member/);

    await cleanupOrg(pool, resultA.organization.id);
    await cleanupOrg(pool, resultB.organization.id);
  }
);

test("getproapp.org platform host does not serve church onboarding routes", async () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "getproapp.org";
  try {
    const app = makePlatformApp();
    const res = await request(app).get("/about").set("Host", "getproapp.org");
    assert.equal(res.status, 404);
  } finally {
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});

test("/admin/church/branches/new redirects to organization onboarding form", async () => {
  if (!isPgConfigured()) return;
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  const suffix = makeSuffix("redirect");
  const hash = await bcrypt.hash("superpw123456", 12);
  const superName = `redirect_sup_${suffix}`;
  const superId = await adminUsersRepo.insertUser(pool, {
    username: superName,
    passwordHash: hash,
    role: ROLES.SUPER_ADMIN,
    tenantId: null,
    displayName: "",
  });

  const app = createAdminApp();
  const agent = await adminLoginAgent(app, superName, "superpw123456");
  const res = await agent.get("/admin/church/branches/new");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/admin/church/organizations/new");

  await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
});
