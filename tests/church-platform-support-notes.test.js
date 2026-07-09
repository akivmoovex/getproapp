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
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const platformSupportNotesRepo = require("../src/db/pg/church/platformSupportNotesRepo");
const {
  validateCreateSupportNoteBody,
  parseSafeReturnTo,
  notePreview,
} = require("../src/church/platformSupportNotesValidation");
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
      secret: "church-support-notes-test",
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
      secret: "church-public-notes-test",
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

test("parseSafeReturnTo rejects external URLs", () => {
  assert.equal(parseSafeReturnTo("https://evil.example.com").ok, false);
  assert.equal(parseSafeReturnTo("/admin/church/organizations/1").ok, true);
});

test("validateCreateSupportNoteBody rejects short notes", () => {
  const result = validateCreateSupportNoteBody({
    entity_type: "organization",
    entity_id: 1,
    note_body: "ab",
  });
  assert.equal(result.ok, false);
});

test("notePreview truncates to 80 chars", () => {
  const long = "x".repeat(120);
  assert.equal(notePreview(long).length, 81);
});

test("tenant manager cannot add support notes", async () => {
  if (!isPgConfigured()) return;
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  const suffix = makeSuffix("snmgr");
  const hash = await bcrypt.hash("pw12345678", 12);
  const username = `sn_mgr_${suffix}`;
  const userId = await adminUsersRepo.insertUser(pool, {
    username,
    passwordHash: hash,
    role: ROLES.TENANT_MANAGER,
    tenantId: TENANT_ZM,
    displayName: "",
  });
  const app = createAdminApp();
  const agent = await adminLoginAgent(app, username, "pw12345678");
  const res = await agent.post("/admin/church/support-notes").type("form").send({
    entity_type: "organization",
    entity_id: 1,
    note_body: "Should not be allowed",
  });
  assert.equal(res.status, 403);
  await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [userId]);
});

test(
  "platform support notes integration",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("psn");
    const hash = await bcrypt.hash("superpw123456", 12);
    const superName = `psn_sup_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "Support Notes Tester",
    });

    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `snorg${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28),
      name: `Support Notes Org ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `Support Notes Branch ${suffix}`,
    });
    const hqAdmin = await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: org.id,
      full_name: "HQ Notes Admin",
      email: `hq_notes_${suffix}@example.com`,
      phone: "0977111000",
      password_hash: await bcrypt.hash("hqpass123456", 12),
    });
    const branchAdmin = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      full_name: "Branch Notes Admin",
      email: `ba_notes_${suffix}@example.com`,
      phone: "0977222000",
      password_hash: await bcrypt.hash("bapass123456", 12),
    });
    const member = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      full_name: `Notes Member ${suffix}`,
      email: `member_notes_${suffix}@example.com`,
      phone: "0977333000",
      password_hash: await bcrypt.hash("memberpass123456", 12),
    });

    const adminApp = createAdminApp();
    const superAgent = await adminLoginAgent(adminApp, superName, "superpw123456");

    const longNote = `Operational note ${suffix} `.repeat(8);
    const entities = [
      { type: "organization", id: org.id, path: `/admin/church/organizations/${org.id}` },
      { type: "branch", id: branch.id, path: `/admin/church/branches/${branch.id}` },
      {
        type: "hq_admin",
        id: hqAdmin.id,
        path: `/admin/church/organizations/${org.id}/hq-admins/${hqAdmin.id}`,
      },
      {
        type: "branch_admin",
        id: branchAdmin.id,
        path: `/admin/church/branches/${branch.id}/admins/${branchAdmin.id}`,
      },
      { type: "member", id: member.id, path: `/admin/church/members/${member.id}` },
    ];

    for (const entity of entities) {
      const post = await superAgent.post("/admin/church/support-notes").type("form").send({
        entity_type: entity.type,
        entity_id: entity.id,
        note_body: `Support note for ${entity.type} ${suffix}`,
        return_to: entity.path,
      });
      assert.equal(post.status, 302);
      assert.match(post.headers.location, /notice=support_note_added/);

      const page = await superAgent.get(entity.path);
      assert.equal(page.status, 200);
      assert.match(page.text, /Platform support notes/);
      assert.match(page.text, `Support note for ${entity.type} ${suffix}`);
    }

    const orgNotes = await platformSupportNotesRepo.listSupportNotesForEntity(pool, "organization", org.id);
    assert.ok(orgNotes.length >= 1);

    const invalid = await superAgent.post("/admin/church/support-notes").type("form").send({
      entity_type: "invalid",
      entity_id: org.id,
      note_body: "bad type note",
    });
    assert.equal(invalid.status, 302);
    assert.match(invalid.headers.location, /support_note_error=/);

    const missing = await superAgent.post("/admin/church/support-notes").type("form").send({
      entity_type: "member",
      entity_id: 999999999,
      note_body: "missing member note",
    });
    assert.equal(missing.status, 404);

    await platformSupportNotesRepo.createSupportNote(
      pool,
      { entity_type: "organization", entity_id: org.id, note_body: longNote },
      superId
    );

    const audit = await pool.query(
      `SELECT metadata_json FROM public.church_audit_logs
       WHERE organization_id = $1 AND action = 'platform_support_note_added'
       ORDER BY id DESC LIMIT 1`,
      [org.id]
    );
    const meta =
      typeof audit.rows[0].metadata_json === "string"
        ? JSON.parse(audit.rows[0].metadata_json)
        : audit.rows[0].metadata_json;
    assert.equal(meta.action_source, "platform_support_notes");
    assert.ok(meta.note_preview.length <= 81);
    assert.equal(meta.note_preview.includes(longNote), false);
    assert.equal(JSON.stringify(meta).includes(longNote), false);

    const churchApp = makeChurchApp({
      kind: "branch",
      orgSlug: org.slug,
      organization: org,
      branch,
    });
    const publicRes = await request(churchApp).get("/login");
    assert.equal(publicRes.text.includes("Platform support notes"), false);
    assert.equal(publicRes.text.includes(`Support note for member ${suffix}`), false);

    await cleanupOrg(pool, org.id);
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
  }
);
