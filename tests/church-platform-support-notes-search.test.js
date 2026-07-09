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
const adminRoutes = require("../src/routes/admin");
const churchRoutes = require("../src/routes/church");
const adminUsersRepo = require("../src/db/pg/adminUsersRepo");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const platformSupportNotesRepo = require("../src/db/pg/church/platformSupportNotesRepo");
const {
  parseSupportNotesSearchQuery,
} = require("../src/church/platformSupportNotesSearchValidation");
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
      secret: "church-support-notes-search-test",
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

function makeChurchApp(ctx) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "church-public-notes-search-test",
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
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

async function adminLoginAgent(app, username, password) {
  const agent = request.agent(app);
  await agent.post("/admin/login").type("form").send({ username, password }).expect(302);
  return agent;
}

async function cleanupOrg(pool, orgId) {
  await pool.query(`DELETE FROM public.church_platform_support_notes WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

test("parseSupportNotesSearchQuery rejects short q", () => {
  const result = parseSupportNotesSearchQuery({ q: "a" });
  assert.equal(result.ok, false);
});

test("parseSafeReturnTo from search validation rejects external URLs", () => {
  const { parseSafeReturnTo: parseReturn } = require("../src/church/platformSupportNotesValidation");
  assert.equal(parseReturn("https://evil.example.com").ok, false);
});

test("buildSupportNoteEntityLink returns correct paths", () => {
  assert.equal(
    platformSupportNotesRepo.buildSupportNoteEntityLink({
      entity_type: "organization",
      entity_id: 5,
    }),
    "/admin/church/organizations/5"
  );
  assert.equal(
    platformSupportNotesRepo.buildSupportNoteEntityLink({
      entity_type: "hq_admin",
      entity_id: 9,
      organization_id: 2,
    }),
    "/admin/church/organizations/2/hq-admins/9"
  );
});

test("tenant manager cannot open support notes list", async () => {
  if (!isPgConfigured()) return;
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  const suffix = makeSuffix("snsmgr");
  const hash = await bcrypt.hash("pw12345678", 12);
  const username = `sns_mgr_${suffix}`;
  const userId = await adminUsersRepo.insertUser(pool, {
    username,
    passwordHash: hash,
    role: ROLES.TENANT_MANAGER,
    tenantId: TENANT_ZM,
    displayName: "",
  });
  const app = createAdminApp();
  const agent = await adminLoginAgent(app, username, "pw12345678");
  const res = await agent.get("/admin/church/support-notes");
  assert.equal(res.status, 403);
  await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [userId]);
});

test(
  "platform support notes search integration",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("psns");
    const hash = await bcrypt.hash("superpw123456", 12);
    const superName = `psns_sup_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `snsorg${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28),
      name: `Notes Search Org ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `Notes Search Branch ${suffix}`,
    });

    await platformSupportNotesRepo.createSupportNote(
      pool,
      { entity_type: "organization", entity_id: org.id, note_body: `Alpha note ${suffix}` },
      superId
    );
    await new Promise((r) => setTimeout(r, 5));
    await platformSupportNotesRepo.createSupportNote(
      pool,
      { entity_type: "branch", entity_id: branch.id, note_body: `Beta branch note ${suffix}` },
      superId
    );

    const adminApp = createAdminApp();
    const superAgent = await adminLoginAgent(adminApp, superName, "superpw123456");

    const listPage = await superAgent.get("/admin/church/support-notes");
    assert.equal(listPage.status, 200);
    assert.match(listPage.text, /Platform Support Notes/);
    assert.match(listPage.text, /Alpha note/);

    const searchQ = await platformSupportNotesRepo.searchSupportNotes(pool, { q: suffix, page: 1, limit: 50 });
    assert.ok(searchQ.total >= 2);
    assert.ok(searchQ.items[0].created_at >= searchQ.items[1].created_at || searchQ.items.length === 1);

    const typeFilter = await platformSupportNotesRepo.searchSupportNotes(pool, {
      entity_type: "branch",
      organization_id: org.id,
      page: 1,
      limit: 50,
    });
    assert.ok(typeFilter.items.every((n) => n.entity_type === "branch"));

    const orgFilter = await platformSupportNotesRepo.searchSupportNotes(pool, {
      organization_id: org.id,
      page: 1,
      limit: 50,
    });
    assert.ok(orgFilter.total >= 2);

    const today = new Date().toISOString().slice(0, 10);
    const dateFilter = await platformSupportNotesRepo.searchSupportNotes(pool, {
      date_from: today,
      date_to: today,
      page: 1,
      limit: 50,
    });
    assert.ok(dateFilter.total >= 2);

    const link = platformSupportNotesRepo.buildSupportNoteEntityLink({
      entity_type: "branch",
      entity_id: branch.id,
      organization_id: org.id,
      branch_id: branch.id,
    });
    assert.equal(link, `/admin/church/branches/${branch.id}`);

    const uiSearch = await superAgent.get(`/admin/church/support-notes?q=${encodeURIComponent(suffix)}`);
    assert.equal(uiSearch.status, 200);
    assert.match(uiSearch.text, /Beta branch note/);
    assert.equal(uiSearch.text.includes("password_hash"), false);

    const dashboard = await superAgent.get("/admin/church");
    assert.equal(dashboard.status, 200);
    assert.match(dashboard.text, /Recent support notes/);

    const supportSearch = await superAgent.get(`/admin/church/search?q=${encodeURIComponent(org.slug)}`);
    assert.equal(supportSearch.status, 200);
    assert.match(supportSearch.text, /support note/i);

    const churchApp = makeChurchApp({
      kind: "branch",
      orgSlug: org.slug,
      organization: org,
      branch,
    });
    const publicRes = await request(churchApp).get("/login");
    assert.equal(publicRes.text.includes("Platform Support Notes"), false);

    await cleanupOrg(pool, org.id);
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
  }
);
