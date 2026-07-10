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
const { getSubdomain } = require("../src/platform/host");
const { createAttachChurchContext } = require("../src/church/attachChurchContext");
const blessboardAdminRoutes = require("../src/routes/blessboardAdmin");
const adminRoutes = require("../src/routes/admin");
const { db } = require("../src/db");
const adminUsersRepo = require("../src/db/pg/adminUsersRepo");
const churchRoutes = require("../src/routes/church");
const { isBlessBoardApexHost } = require("../src/church/blessBoardApexHost");
const {
  shouldRedirectGetProChurchAdmin,
  redirectGetProChurchAdminToBlessBoard,
  shouldBlockBlessBoardAdminOnBranchHost,
} = require("../src/church/getProChurchAdminRedirect");
const { renderBlessBoardAdminHostNotFound } = require("../src/church/requireBlessBoardApexHost");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createProductionLikeApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.set("trust proxy", true);
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "blessboard-admin-host-test-secret-long",
      resave: false,
      saveUninitialized: false,
    })
  );
  app.use((req, res, next) => {
    req.subdomain = getSubdomain(req);
    next();
  });
  app.use(createAttachChurchContext());
  app.use((req, res, next) => {
    req.tenant = { id: 1, slug: "zm" };
    req.tenantUrlPrefix = "";
    res.locals.asset = (k) => `/${String(k || "").replace(/^\//, "")}`;
    next();
  });
  app.use("/admin", (req, res, next) => {
    if (shouldBlockBlessBoardAdminOnBranchHost(req)) {
      return renderBlessBoardAdminHostNotFound(req, res);
    }
    if (isBlessBoardApexHost(req)) {
      return blessboardAdminRoutes()(req, res, next);
    }
    if (shouldRedirectGetProChurchAdmin(req)) {
      return redirectGetProChurchAdminToBlessBoard(req, res);
    }
    return adminRoutes({ db, mountChurchPlatform: false })(req, res, next);
  });
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("platform fallback"));
  return app;
}

async function superAdminLoginAgent(app, host = "blessboard.com") {
  if (!isPgConfigured()) return null;
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  const suffix = makeSuffix("bbadmin");
  const hash = await bcrypt.hash("superpw123456", 12);
  const username = `bb_admin_${suffix}`;
  const userId = await adminUsersRepo.insertUser(pool, {
    username,
    passwordHash: hash,
    role: ROLES.SUPER_ADMIN,
    tenantId: null,
    displayName: "",
  });
  const agent = request.agent(app);
  await agent
    .post("/admin/login")
    .set("Host", host)
    .type("form")
    .send({ username, password: "superpw123456" })
    .expect(302);
  return { agent, userId, pool };
}

test("blessboard.com apex is detected for platform admin routing", () => {
  const req = { headers: { host: "blessboard.com" }, get: (n) => (n === "host" ? "blessboard.com" : "") };
  assert.equal(isBlessBoardApexHost(req), true);
});

test("demo.blessboard.com is not blessboard apex", () => {
  const req = {
    isChurchHost: true,
    churchContext: { kind: "branch", hostSlug: "demo" },
    headers: { host: "demo.blessboard.com" },
    get: (n) => (n === "host" ? "demo.blessboard.com" : ""),
  };
  assert.equal(isBlessBoardApexHost(req), false);
});

test(
  "blessboard.com/admin/churches/new renders provisioning form for super admin",
  { skip: !isPgConfigured() },
  async () => {
    const app = createProductionLikeApp();
    const login = await superAdminLoginAgent(app);
    const res = await login.agent.get("/admin/churches/new").set("Host", "blessboard.com");
    assert.equal(res.status, 200);
    assert.match(res.text, /Create church organization|Organization/i);
    assert.match(res.text, /BlessBoard Admin|BlessBoard/);
    await login.pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [login.userId]);
  }
);

test(
  "blessboard.com/admin/diagnostics renders for super admin",
  { skip: !isPgConfigured() },
  async () => {
    const app = createProductionLikeApp();
    const login = await superAdminLoginAgent(app);
    const res = await login.agent.get("/admin/diagnostics").set("Host", "blessboard.com");
    assert.equal(res.status, 200);
    assert.match(res.text, /BlessBoard production diagnostics/i);
    assert.doesNotMatch(res.text, /postgres:\/\//i);
    await login.pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [login.userId]);
  }
);

test("demo.blessboard.com/admin/churches/new returns platform-admin guidance, not church not found", async () => {
  const app = createProductionLikeApp();
  const res = await request(app).get("/admin/churches/new").set("Host", "demo.blessboard.com");
  assert.equal(res.status, 404);
  assert.doesNotMatch(res.text, /Church not found/i);
  assert.match(res.text, /platform admin is only available at/i);
  assert.match(res.text, /blessboard\.com\/admin\/login/);
  assert.match(res.text, /href="\/branch\/login"/);
  assert.doesNotMatch(res.text, /Provision a new church|Create church organization/i);
});

test("demo.blessboard.com/admin/dashboard returns platform-admin guidance, not church not found", async () => {
  const app = createProductionLikeApp();
  const res = await request(app).get("/admin/dashboard").set("Host", "demo.blessboard.com");
  assert.equal(res.status, 404);
  assert.doesNotMatch(res.text, /Church not found/i);
  assert.match(res.text, /BlessBoard platform admin is only available at/i);
  assert.match(res.text, /https:\/\/blessboard\.com\/admin\/login/);
  assert.match(res.text, /href="\/branch\/login"/);
  assert.doesNotMatch(res.text, /church-platform-sidebar|Platform Dashboard/i);
});

test("demo.blessboard.com/admin/login returns platform-admin guidance", async () => {
  const app = createProductionLikeApp();
  const res = await request(app).get("/admin/login").set("Host", "demo.blessboard.com");
  assert.equal(res.status, 404);
  assert.doesNotMatch(res.text, /Church not found/i);
  assert.match(res.text, /blessboard\.com\/admin\/login/);
  assert.match(res.text, /\/branch\/login/);
});

test(
  "blessboard.com/admin/dashboard redirects unauthenticated users to login",
  { skip: !isPgConfigured() },
  async () => {
    const app = createProductionLikeApp();
    const res = await request(app).get("/admin/dashboard").set("Host", "blessboard.com");
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, "/admin/login");
  }
);

test("kafuebaptist.blessboard.com/admin/churches/new returns platform-admin guidance", async () => {
  const app = createProductionLikeApp();
  const res = await request(app)
    .get("/admin/churches/new")
    .set("Host", "kafuebaptist.blessboard.com");
  assert.equal(res.status, 404);
  assert.doesNotMatch(res.text, /Church not found/i);
  assert.match(res.text, /platform admin is only available at/i);
  assert.match(res.text, /\/branch\/login/);
});

test("getproapp.org/admin/church/organizations/new redirects to blessboard.com", async () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "getproapp.org";
  try {
    const app = createProductionLikeApp();
    const res = await request(app)
      .get("/admin/church/organizations/new")
      .set("Host", "getproapp.org");
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, "https://blessboard.com/admin/churches/new");
  } finally {
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});

test("getproapp.org remains main GetPro platform for public church routes", async () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "getproapp.org";
  try {
    const app = createProductionLikeApp();
    const res = await request(app).get("/giving").set("Host", "getproapp.org");
    assert.equal(res.status, 404);
  } finally {
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});

test(
  "blessboard.com serves BlessBoard landing page",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    const app = createProductionLikeApp();
    const res = await request(app).get("/").set("Host", "blessboard.com");
    assert.equal(res.status, 200);
    assert.match(res.text, /BlessBoard/);
  }
);

test(
  "demo.blessboard.com remains demo church public site",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    const seed = require("../src/seeds/seedChurchDemoOrganization");
    await seed.seedChurchDemoOrganizationIfMissing(pool);
    const app = createProductionLikeApp();
    const res = await request(app).get("/").set("Host", "demo.blessboard.com");
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /Church not found/i);
  }
);

test(
  "demo.blessboard.com/branch/login remains available",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    const seed = require("../src/seeds/seedChurchDemoOrganization");
    await seed.seedChurchDemoOrganizationIfMissing(pool);
    const app = createProductionLikeApp();
    const res = await request(app).get("/branch/login").set("Host", "demo.blessboard.com");
    assert.equal(res.status, 200);
    assert.match(res.text, /login|sign in/i);
  }
);

test(
  "demo.blessboard.com/register remains available",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    const seed = require("../src/seeds/seedChurchDemoOrganization");
    await seed.seedChurchDemoOrganizationIfMissing(pool);
    const app = createProductionLikeApp();
    const res = await request(app).get("/register").set("Host", "demo.blessboard.com");
    assert.notEqual(res.status, 404);
  }
);

test(
  "demo.blessboard.com/login remains available for members",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    const seed = require("../src/seeds/seedChurchDemoOrganization");
    await seed.seedChurchDemoOrganizationIfMissing(pool);
    const app = createProductionLikeApp();
    const res = await request(app).get("/login").set("Host", "demo.blessboard.com");
    assert.notEqual(res.status, 404);
  }
);

test("non-super admin cannot use blessboard.com/admin/login", async () => {
  if (!isPgConfigured()) return;
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  const suffix = makeSuffix("bbmgr");
  const hash = await bcrypt.hash("pw12345678", 12);
  const username = `bb_mgr_${suffix}`;
  const userId = await adminUsersRepo.insertUser(pool, {
    username,
    passwordHash: hash,
    role: ROLES.TENANT_MANAGER,
    tenantId: 1,
    displayName: "",
  });
  const app = createProductionLikeApp();
  const res = await request(app)
    .post("/admin/login")
    .set("Host", "blessboard.com")
    .type("form")
    .send({ username, password: "pw12345678" });
  assert.equal(res.status, 200);
  assert.match(res.text, /super admin/i);
  await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [userId]);
});

function branchEditPayload(branch, hostSlug) {
  return {
    branch_name: branch.name || "Main Branch",
    branch_host_slug: hostSlug,
    pastor_name: branch.pastor_name || "",
    contact_phone: branch.contact_phone || "",
    contact_email: branch.contact_email || "",
    member_registration_enabled: "1",
  };
}

test(
  "blessboard.com/admin/churches/:id/edit renders for authenticated super admin",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    const seed = require("../src/seeds/seedChurchDemoOrganization");
    const { organization, branch } = await seed.seedChurchDemoOrganizationIfMissing(pool);
    const app = createProductionLikeApp();
    const login = await superAdminLoginAgent(app);
    const res = await login.agent
      .get(`/admin/churches/${organization.id}/edit`)
      .set("Host", "blessboard.com");
    assert.equal(res.status, 200);
    assert.match(res.text, /Edit church details|Edit organization/i);
    assert.match(res.text, /BlessBoard Admin|BlessBoard/);
    assert.match(res.text, new RegExp(branch.host_slug || "demo", "i"));
    assert.match(res.text, /Member registration/i);
    await login.pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [login.userId]);
  }
);

test(
  "blessboard POST valid edit updates church name and details",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("bbedit");
    const hash = await bcrypt.hash("superpw123456", 12);
    const superName = `bb_edit_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });
    const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
    const branchesRepo = require("../src/db/pg/church/branchesRepo");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: 1,
      slug: `bborg${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28),
      name: `BB Edit Org ${suffix}`,
      status: "active",
    });
    await pool.query(
      `UPDATE public.church_organizations SET country = $2, city = $3 WHERE id = $1`,
      [org.id, "Zambia", "Lusaka"]
    );
    const hostSlug = `bbhost${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28);
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: hostSlug,
      host_slug: hostSlug,
      name: "Primary Branch",
    });

    const app = createProductionLikeApp();
    const agent = request.agent(app);
    await agent
      .post("/admin/login")
      .set("Host", "blessboard.com")
      .type("form")
      .send({ username: superName, password: "superpw123456" })
      .expect(302);

    const updated = await agent
      .post(`/admin/churches/${org.id}/edit`)
      .set("Host", "blessboard.com")
      .type("form")
      .send({
        organization_name: "BlessBoard Updated Name",
        organization_slug: org.slug,
        country: "Zambia",
        city: "Kitwe",
        primary_contact_name: "Updated Contact",
        primary_contact_email: "updated@example.com",
        ...branchEditPayload(branch, hostSlug),
      });
    assert.equal(updated.status, 302);
    assert.match(updated.headers.location, /\/admin\/churches\/\d+\?notice=updated/);

    const refreshed = await organizationsRepo.findOrganizationById(pool, org.id);
    assert.equal(refreshed.name, "BlessBoard Updated Name");
    assert.equal(refreshed.city, "Kitwe");
    const refreshedBranch = await branchesRepo.findBranchByHostSlug(pool, hostSlug);
    assert.equal(refreshedBranch.name, "Primary Branch");

    await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [org.id]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [org.id]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [org.id]);
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
  }
);

test(
  "blessboard POST invalid host slug re-renders with error",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("bbslug");
    const hash = await bcrypt.hash("superpw123456", 12);
    const superName = `bb_slug_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });
    const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
    const branchesRepo = require("../src/db/pg/church/branchesRepo");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: 1,
      slug: `bbslugorg${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28),
      name: `BB Slug Org ${suffix}`,
      status: "active",
    });
    await pool.query(`UPDATE public.church_organizations SET country = $2 WHERE id = $1`, [
      org.id,
      "Zambia",
    ]);
    const hostSlug = `bbslugbr${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28);
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: hostSlug,
      host_slug: hostSlug,
      name: "Branch",
    });

    const app = createProductionLikeApp();
    const agent = request.agent(app);
    await agent
      .post("/admin/login")
      .set("Host", "blessboard.com")
      .type("form")
      .send({ username: superName, password: "superpw123456" })
      .expect(302);

    const bad = await agent
      .post(`/admin/churches/${org.id}/edit`)
      .set("Host", "blessboard.com")
      .type("form")
      .send({
        organization_name: org.name,
        organization_slug: org.slug,
        country: "Zambia",
        branch_name: branch.name,
        branch_host_slug: "INVALID SLUG",
      });
    assert.equal(bad.status, 400);
    assert.match(bad.text, /host slug|slug/i);

    await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [org.id]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [org.id]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [org.id]);
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
  }
);

test(
  "blessboard duplicate host slug rejected unless current branch slug",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("bbdup");
    const hash = await bcrypt.hash("superpw123456", 12);
    const superName = `bb_dup_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });
    const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
    const branchesRepo = require("../src/db/pg/church/branchesRepo");
    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: 1,
      slug: `bbdupa${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28),
      name: `Org A ${suffix}`,
      status: "active",
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: 1,
      slug: `bbdupb${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28),
      name: `Org B ${suffix}`,
      status: "active",
    });
    await pool.query(`UPDATE public.church_organizations SET country = 'Zambia' WHERE id = ANY($1::int[])`, [
      [orgA.id, orgB.id],
    ]);
    const hostA = `bbdupa${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28);
    const hostB = `bbdupb${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28);
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: hostA,
      host_slug: hostA,
      name: "Branch A",
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: hostB,
      host_slug: hostB,
      name: "Branch B",
    });

    const app = createProductionLikeApp();
    const agent = request.agent(app);
    await agent
      .post("/admin/login")
      .set("Host", "blessboard.com")
      .type("form")
      .send({ username: superName, password: "superpw123456" })
      .expect(302);

    const dup = await agent
      .post(`/admin/churches/${orgA.id}/edit`)
      .set("Host", "blessboard.com")
      .type("form")
      .send({
        organization_name: orgA.name,
        organization_slug: orgA.slug,
        country: "Zambia",
        ...branchEditPayload(branchA, hostB),
      });
    assert.equal(dup.status, 400);
    assert.match(dup.text, /already in use/i);

    const same = await agent
      .post(`/admin/churches/${orgA.id}/edit`)
      .set("Host", "blessboard.com")
      .type("form")
      .send({
        organization_name: "Same Slug OK",
        organization_slug: orgA.slug,
        country: "Zambia",
        ...branchEditPayload(branchA, hostA),
      });
    assert.equal(same.status, 302);

    await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = ANY($1::int[])`, [
      [orgA.id, orgB.id],
    ]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = ANY($1::int[])`, [
      [orgA.id, orgB.id],
    ]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = ANY($1::int[])`, [
      [orgA.id, orgB.id],
    ]);
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
  }
);

test(
  "blessboard member_registration_enabled can be toggled",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("bbreg");
    const hash = await bcrypt.hash("superpw123456", 12);
    const superName = `bb_reg_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });
    const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
    const branchesRepo = require("../src/db/pg/church/branchesRepo");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: 1,
      slug: `bbregorg${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28),
      name: `Reg Org ${suffix}`,
      status: "active",
    });
    await pool.query(`UPDATE public.church_organizations SET country = $2 WHERE id = $1`, [
      org.id,
      "Zambia",
    ]);
    const hostSlug = `bbregbr${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28);
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: hostSlug,
      host_slug: hostSlug,
      name: "Branch",
      member_registration_enabled: true,
    });

    const app = createProductionLikeApp();
    const agent = request.agent(app);
    await agent
      .post("/admin/login")
      .set("Host", "blessboard.com")
      .type("form")
      .send({ username: superName, password: "superpw123456" })
      .expect(302);

    const disabled = await agent
      .post(`/admin/churches/${org.id}/edit`)
      .set("Host", "blessboard.com")
      .type("form")
      .send({
        organization_name: org.name,
        organization_slug: org.slug,
        country: "Zambia",
        branch_name: branch.name,
        branch_host_slug: hostSlug,
      });
    assert.equal(disabled.status, 302);
    let row = await pool.query(
      `SELECT member_registration_enabled FROM public.church_branches WHERE id = $1`,
      [branch.id]
    );
    assert.equal(row.rows[0].member_registration_enabled, false);

    const enabled = await agent
      .post(`/admin/churches/${org.id}/edit`)
      .set("Host", "blessboard.com")
      .type("form")
      .send({
        organization_name: org.name,
        organization_slug: org.slug,
        country: "Zambia",
        branch_name: branch.name,
        branch_host_slug: hostSlug,
        member_registration_enabled: "1",
      });
    assert.equal(enabled.status, 302);
    row = await pool.query(
      `SELECT member_registration_enabled FROM public.church_branches WHERE id = $1`,
      [branch.id]
    );
    assert.equal(row.rows[0].member_registration_enabled, true);

    await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [org.id]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [org.id]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [org.id]);
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
  }
);

test(
  "blessboard legacy /admin/church/organizations/:id/edit redirects to canonical edit",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    const seed = require("../src/seeds/seedChurchDemoOrganization");
    const { organization } = await seed.seedChurchDemoOrganizationIfMissing(pool);
    const app = createProductionLikeApp();
    const login = await superAdminLoginAgent(app);
    const res = await login.agent
      .get(`/admin/church/organizations/${organization.id}/edit`)
      .set("Host", "blessboard.com");
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, `/admin/churches/${organization.id}/edit`);
    await login.pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [login.userId]);
  }
);

test("demo.blessboard.com/admin/churches/:id/edit returns platform-admin guidance", async () => {
  const app = createProductionLikeApp();
  const res = await request(app)
    .get("/admin/churches/3/edit")
    .set("Host", "demo.blessboard.com");
  assert.equal(res.status, 404);
  assert.doesNotMatch(res.text, /Church not found/i);
  assert.match(res.text, /platform admin is only available at/i);
  assert.match(res.text, /\/branch\/login/);
});

test("getproapp.org/admin/church/organizations/:id/edit redirects to blessboard.com", async () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "getproapp.org";
  try {
    const app = createProductionLikeApp();
    const res = await request(app)
      .get("/admin/church/organizations/3/edit")
      .set("Host", "getproapp.org");
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, "https://blessboard.com/admin/churches/3/edit");
  } finally {
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});

test("rewrite maps /admin/churches/:id/hq-admins/new to internal org path", () => {
  const { rewriteBlessBoardAdminPathToInternal, mapLegacyGetProChurchAdminPathToBlessBoard } = require("../src/church/blessboardAdminPaths");
  assert.equal(
    rewriteBlessBoardAdminPathToInternal("GET", "/churches/3/hq-admins/new"),
    "/church/organizations/3/hq-admins/new"
  );
  assert.equal(
    rewriteBlessBoardAdminPathToInternal("POST", "/churches/3/hq-admins"),
    "/church/organizations/3/hq-admins"
  );
  assert.equal(
    mapLegacyGetProChurchAdminPathToBlessBoard("/admin/church/organizations/3/hq-admins/new"),
    "/admin/churches/3/hq-admins/new"
  );
});

test("unauthenticated GET /admin/churches/:id/hq-admins/new redirects to login", async () => {
  const app = createProductionLikeApp();
  const res = await request(app).get("/admin/churches/3/hq-admins/new").set("Host", "blessboard.com");
  assert.equal(res.status, 302);
  assert.match(String(res.headers.location || ""), /\/admin\/login/);
});

test("demo.blessboard.com/admin/churches/:id/hq-admins/new returns platform-admin guidance", async () => {
  const app = createProductionLikeApp();
  const res = await request(app)
    .get("/admin/churches/3/hq-admins/new")
    .set("Host", "demo.blessboard.com");
  assert.equal(res.status, 404);
  assert.doesNotMatch(res.text, /Church not found/i);
  assert.match(res.text, /platform admin is only available at/i);
});

test(
  "blessboard.com legacy HQ admin new URL redirects to canonical",
  { skip: !isPgConfigured() },
  async () => {
    const app = createProductionLikeApp();
    const login = await superAdminLoginAgent(app);
    const res = await login.agent
      .get("/admin/church/organizations/3/hq-admins/new")
      .set("Host", "blessboard.com")
      .redirects(0);
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, "/admin/churches/3/hq-admins/new");
    await login.pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [login.userId]);
  }
);

test(
  "blessboard.com/admin/churches/:id/hq-admins/new renders create form",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    const seed = require("../src/seeds/seedChurchDemoOrganization");
    const { organization } = await seed.seedChurchDemoOrganizationIfMissing(pool);
    const app = createProductionLikeApp();
    const login = await superAdminLoginAgent(app);
    const res = await login.agent
      .get(`/admin/churches/${organization.id}/hq-admins/new`)
      .set("Host", "blessboard.com");
    assert.equal(res.status, 200);
    assert.match(res.text, /Add HQ admin/i);
    assert.match(res.text, new RegExp(organization.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(res.text, /temporary_password|Temporary password/i);
    assert.match(res.text, /confirm_password|Confirm password/i);
    assert.match(res.text, new RegExp(`action="/admin/churches/${organization.id}/hq-admins"`));
    await login.pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [login.userId]);
  }
);

test(
  "blessboard.com POST /admin/churches/:id/hq-admins creates HQ admin",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    await ensureCanonicalTenantsForTests(pool);
    const suffix = makeSuffix("bbhq");
    const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: 1,
      slug: `bbhq${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28),
      name: `BB HQ Org ${suffix}`,
      status: "active",
    });
    const app = createProductionLikeApp();
    const login = await superAdminLoginAgent(app);
    const email = `hq_${suffix}@example.com`;
    const created = await login.agent
      .post(`/admin/churches/${org.id}/hq-admins`)
      .set("Host", "blessboard.com")
      .type("form")
      .send({
        full_name: "BlessBoard HQ Admin",
        email,
        role: "hq_admin",
        temporary_password: "HqAdminPass1!",
        confirm_password: "HqAdminPass1!",
      });
    assert.equal(created.status, 302);
    assert.equal(created.headers.location, `/admin/churches/${org.id}?notice=hq_admin_created`);

    const mismatch = await login.agent
      .post(`/admin/churches/${org.id}/hq-admins`)
      .set("Host", "blessboard.com")
      .type("form")
      .send({
        full_name: "Mismatch HQ",
        email: `mismatch_${suffix}@example.com`,
        temporary_password: "HqAdminPass1!",
        confirm_password: "DifferentPass1!",
      });
    assert.equal(mismatch.status, 400);
    assert.match(mismatch.text, /confirmation does not match/i);

    const dup = await login.agent
      .post(`/admin/churches/${org.id}/hq-admins`)
      .set("Host", "blessboard.com")
      .type("form")
      .send({
        full_name: "Dup HQ",
        email,
        temporary_password: "HqAdminPass1!",
        confirm_password: "HqAdminPass1!",
      });
    assert.equal(dup.status, 400);
    assert.match(dup.text, /already in use/i);

    const row = await pool.query(
      `SELECT id, role, status FROM public.church_hq_admins WHERE organization_id = $1 AND lower(trim(email)) = $2`,
      [org.id, email]
    );
    assert.equal(row.rows.length, 1);
    assert.equal(row.rows[0].role, "hq_admin");
    assert.equal(row.rows[0].status, "active");

    await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [org.id]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [org.id]);
    await login.pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [login.userId]);
  }
);