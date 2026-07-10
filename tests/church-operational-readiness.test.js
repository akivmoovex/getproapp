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
const { validateProvisioningBody } = require("../src/church/platformProvisioningValidation");
const { buildProvisionWelcomePack, formatWelcomeMessageText } = require("../src/services/church/provisionWelcomeService");
const adminRoutes = require("../src/routes/admin");
const adminUsersRepo = require("../src/db/pg/adminUsersRepo");
const platformProvisioningRepo = require("../src/db/pg/church/platformProvisioningRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const contactSubmissionsRepo = require("../src/db/pg/church/contactSubmissionsRepo");
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
      secret: "church-operational-readiness-test",
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
  app.use(express.urlencoded({ extended: true }));
  app.use((req, res, next) => {
    req.subdomain = getSubdomain(req);
    next();
  });
  app.use(createAttachChurchContext());
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("platform fallback"));
  return app;
}

function makeChurchApp(ctx) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "church-op-church-app",
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

function provisioningBody(slug, suffix, overrides = {}) {
  return {
    organization_name: `Ops Church ${suffix}`,
    organization_slug: slug,
    country: "Zambia",
    city: "Kafue",
    plan_code: "free",
    branch_name: `Ops Branch ${suffix}`,
    branch_host_slug: slug,
    branch_city: "Kafue",
    branch_country: "Zambia",
    branch_address: "123 Church Road",
    pastor_name: "Rev. Ops Pastor",
    contact_phone: "+260 97 000 2222",
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
  await pool.query(`DELETE FROM public.church_public_contact_submissions WHERE organization_id = $1`, [orgId]);
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

test("buildProvisionWelcomePack includes credentials and checklist", () => {
  const pack = buildProvisionWelcomePack({
    organization: { id: 1, name: "Test Org", slug: "test" },
    branch: { id: 2, name: "Test Branch", host_slug: "testbranch" },
    branchAdmin: { full_name: "Admin", username: "admin@test", email: "admin@test.com" },
    branchAdminCredentials: { full_name: "Admin", username: "admin@test", temporary_password: "secret123" },
    hqAdmin: { full_name: "HQ", email: "hq@test.com" },
  });
  assert.match(pack.publicUrl, /testbranch\.blessboard\.com/);
  assert.equal(pack.branchAdmin.temporary_password, "secret123");
  assert.equal(pack.checklist.length, 6);
  const text = formatWelcomeMessageText(pack);
  assert.match(text, /Temporary password: secret123/);
  assert.match(text, /Branch admin login/);
});

test(
  "welcome message appears on organization detail after provisioning",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("welcome");
    const slug = `wel${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 40);
    const hash = await bcrypt.hash("superpw123456", 12);
    const superName = `wel_sup_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    const app = createAdminApp();
    const agent = request.agent(app);
    await agent.post("/admin/login").type("form").send({ username: superName, password: "superpw123456" });

    const body = provisioningBody(slug, suffix);
    const create = await agent.post("/admin/church/organizations").type("form").send(body);
    assert.equal(create.status, 302);
    const orgId = Number(create.headers.location.match(/organizations\/(\d+)/)[1]);

    const detail = await agent.get(create.headers.location);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /Branch admin welcome handoff/);
    assert.match(detail.text, /temppass456/);
    assert.match(detail.text, /Copy welcome message/);
    assert.doesNotMatch(detail.text, /temppass456[\s\S]*temppass456/);

    const detailAgain = await agent.get(`/admin/church/organizations/${orgId}?provisioned=1`);
    assert.doesNotMatch(detailAgain.text, /Temporary password: temppass456/);

    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
    await cleanupOrg(pool, orgId);
  }
);

test("member_registration_enabled=false blocks /register with friendly page", async () => {
  const app = makeChurchApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active", member_registration_enabled: false },
  });
  const res = await request(app).get("/register");
  assert.equal(res.status, 200);
  assert.match(res.text, /Registration is currently closed/i);
});

test(
  "member_registration_enabled=true allows /register form",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("regopen");
    const slug = `rop${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 40);
    const validated = validateProvisioningBody(provisioningBody(slug, suffix));
    const result = await platformProvisioningRepo.provisionChurchOrganization(
      pool,
      { platform_tenant_id: TENANT_ZM, ...validated.data },
      null
    );
    const app = makeBlessBoardApp();
    const res = await request(app).get("/register").set("Host", `${slug}.blessboard.com`);
    assert.equal(res.status, 200);
    assert.match(res.text, /Member Registration/);
    await cleanupOrg(pool, result.organization.id);
  }
);

test(
  "contact form stores branch-scoped submission",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("contact");
    const slug = `ctc${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 40);
    const validated = validateProvisioningBody(provisioningBody(slug, suffix));
    const result = await platformProvisioningRepo.provisionChurchOrganization(
      pool,
      { platform_tenant_id: TENANT_ZM, ...validated.data },
      null
    );
    const app = makeBlessBoardApp();
    const host = `${slug}.blessboard.com`;
    const post = await request(app).post("/contact").set("Host", host).type("form").send({
      full_name: "Visitor Name",
      email: `visitor_${suffix}@example.com`,
      message: "Hello church, I would like to visit this Sunday.",
    });
    assert.equal(post.status, 303);
    assert.equal(post.headers.location, "/contact?submitted=1");

    const rows = await contactSubmissionsRepo.listContactSubmissionsForBranch(pool, result.branch.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].branch_id, result.branch.id);
    assert.match(rows[0].message, /visit this Sunday/);

    await cleanupOrg(pool, result.organization.id);
  }
);

test(
  "branch admin sees only own branch contact submissions",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("cscope");
    const slugA = `csa${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 20);
    const slugB = `csb${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 20);
    const resultA = await platformProvisioningRepo.provisionChurchOrganization(
      pool,
      { platform_tenant_id: TENANT_ZM, ...validateProvisioningBody(provisioningBody(slugA, `${suffix}a`)).data },
      null
    );
    const resultB = await platformProvisioningRepo.provisionChurchOrganization(
      pool,
      { platform_tenant_id: TENANT_ZM, ...validateProvisioningBody(provisioningBody(slugB, `${suffix}b`)).data },
      null
    );
    await contactSubmissionsRepo.createContactSubmissionForBranch(pool, {
      organization_id: resultB.organization.id,
      branch_id: resultB.branch.id,
      full_name: "Other Branch Visitor",
      email: "other@example.com",
      message: "Message for branch B only please.",
    });

    const app = makeBlessBoardApp();
    const agent = request.agent(app);
    await agent
      .post("/branch/login")
      .set("Host", `${slugA}.blessboard.com`)
      .type("form")
      .send({
        identifier: provisioningBody(slugA, `${suffix}a`).branch_admin_email,
        password: "temppass456",
      });

    const list = await agent.get("/branch/contact-submissions").set("Host", `${slugA}.blessboard.com`);
    assert.equal(list.status, 200);
    assert.doesNotMatch(list.text, /Other Branch Visitor/);

    await cleanupOrg(pool, resultA.organization.id);
    await cleanupOrg(pool, resultB.organization.id);
  }
);

test("giving page renders polished BlessBoard layout without PG", async () => {
  const app = makeChurchApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const res = await request(app).get("/giving");
  assert.equal(res.status, 200);
  assert.match(res.text, /church-giving-page/);
  assert.match(res.text, /Ways to Give|Support Our Ministry|Finance Office|Contact Finance Office/);
});

test("ministries page renders polished tile grid without PG", async () => {
  const app = makeChurchApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const res = await request(app).get("/ministries");
  assert.equal(res.status, 200);
  assert.match(res.text, /church-ministry-grid|Ministries coming soon/);
});

test("getproapp.org remains unchanged for church routes", async () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "getproapp.org";
  try {
    const app = makeBlessBoardApp();
    const res = await request(app).get("/giving").set("Host", "getproapp.org");
    assert.equal(res.status, 404);
  } finally {
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});
