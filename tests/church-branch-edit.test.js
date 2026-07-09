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
const adminUsersRepo = require("../src/db/pg/adminUsersRepo");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const {
  validateUpdateBranchBody,
} = require("../src/church/platformProvisioningValidation");
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
      secret: "church-branch-edit-test",
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

async function adminLoginAgent(app, username, password) {
  const agent = request.agent(app);
  await agent.post("/admin/login").type("form").send({ username, password }).expect(302);
  return agent;
}

async function cleanupOrg(pool, orgId) {
  await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

test("reserved host slug rejected on branch update validation", () => {
  for (const slug of ["admin", "hq", "member"]) {
    const result = validateUpdateBranchBody({
      branch_name: "Test Branch",
      branch_host_slug: slug,
    });
    assert.equal(result.ok, false, `expected ${slug} to be rejected`);
  }
});

test("invalid contact email rejected", () => {
  const result = validateUpdateBranchBody({
    branch_name: "Test Branch",
    branch_host_slug: "valid-branch-slug",
    contact_email: "not-an-email",
  });
  assert.equal(result.ok, false);
});

test("tenant manager cannot open branch edit form", async () => {
  if (!isPgConfigured()) return;
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  const suffix = makeSuffix("brmgr");
  const hash = await bcrypt.hash("pw12345678", 12);
  const username = `br_edit_mgr_${suffix}`;
  const userId = await adminUsersRepo.insertUser(pool, {
    username,
    passwordHash: hash,
    role: ROLES.TENANT_MANAGER,
    tenantId: TENANT_ZM,
    displayName: "",
  });
  const org = await organizationsRepo.createOrganization(pool, {
    platform_tenant_id: TENANT_ZM,
    slug: `bremgr_${suffix}`,
    name: `Branch Edit Org ${suffix}`,
  });
  const branch = await branchesRepo.createBranch(pool, {
    organization_id: org.id,
    slug: `br${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28),
    host_slug: `br${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28),
    name: "Main Branch",
  });
  const app = createAdminApp();
  const agent = await adminLoginAgent(app, username, "pw12345678");
  const res = await agent.get(`/admin/church/branches/${branch.id}/edit`);
  assert.equal(res.status, 403);
  await cleanupOrg(pool, org.id);
  await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [userId]);
});

test(
  "branch edit and host slug change integration",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("bred");
    const hash = await bcrypt.hash("superpw123456", 12);
    const superName = `bred_sup_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `bredorg${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28),
      name: `Branch Edit Org ${suffix}`,
    });

    const oldHost = `oldhost${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28);
    const newHost = `newhost${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28);
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: oldHost,
      host_slug: oldHost,
      name: "Original Branch Name",
      pastor_name: "Rev. Old",
    });

    const app = createAdminApp();
    const agent = await adminLoginAgent(app, superName, "superpw123456");

    const editPage = await agent.get(`/admin/church/branches/${branch.id}/edit`);
    assert.equal(editPage.status, 200);
    assert.match(editPage.text, /Edit branch/);

    const orgScopedEdit = await agent.get(
      `/admin/church/organizations/${org.id}/branches/${branch.id}/edit`
    );
    assert.equal(orgScopedEdit.status, 200);

    const duplicate = await agent.post(`/admin/church/branches/${branch.id}`).type("form").send({
      branch_name: "Another Branch",
      branch_host_slug: oldHost,
      pastor_name: "Rev. Updated",
      contact_email: "pastor@example.com",
    });
    assert.equal(duplicate.status, 302);

    await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: `other${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28),
      host_slug: `taken${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28),
      name: "Other Branch",
    });

    const dupSlug = await agent.post(`/admin/church/branches/${branch.id}`).type("form").send({
      branch_name: "Original Branch Name",
      branch_host_slug: `taken${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28),
    });
    assert.equal(dupSlug.status, 400);

    const changed = await agent.post(`/admin/church/branches/${branch.id}`).type("form").send({
      branch_name: "Updated Branch Name",
      branch_host_slug: newHost,
      city: "Lusaka",
      country: "Zambia",
      pastor_name: "Rev. New",
      contact_phone: "0977000111",
      contact_email: "newpastor@example.com",
    });
    assert.equal(changed.status, 302);
    assert.match(changed.headers.location, /notice=host_slug_changed/);

    const updated = await branchesRepo.findBranchByIdForPlatform(pool, branch.id);
    assert.equal(updated.name, "Updated Branch Name");
    assert.equal(updated.host_slug, newHost);
    assert.equal(updated.pastor_name, "Rev. New");
    assert.equal(updated.status, "active");

    assert.equal(await branchesRepo.findBranchByHostSlug(pool, oldHost), null);
    const resolved = await branchesRepo.findBranchByHostSlug(pool, newHost);
    assert.ok(resolved);
    assert.equal(resolved.id, branch.id);

    const auditUpdate = await pool.query(
      `SELECT action FROM public.church_audit_logs
       WHERE branch_id = $1 AND action = 'platform_church_branch_updated'
       ORDER BY id DESC LIMIT 1`,
      [branch.id]
    );
    assert.equal(auditUpdate.rows.length, 1);

    const auditHost = await pool.query(
      `SELECT action, metadata_json FROM public.church_audit_logs
       WHERE branch_id = $1 AND action = 'platform_church_branch_host_slug_changed'
       ORDER BY id DESC LIMIT 1`,
      [branch.id]
    );
    assert.equal(auditHost.rows.length, 1);
    assert.equal(auditHost.rows[0].metadata_json.previous_host_slug, oldHost);
    assert.equal(auditHost.rows[0].metadata_json.new_host_slug, newHost);

    await branchesRepo.suspendBranch(pool, branch.id, {
      reason: "Temporary hold",
      platformAdminId: superId,
    });
    const suspendedEdit = await agent.post(`/admin/church/branches/${branch.id}`).type("form").send({
      branch_name: "Suspended But Edited",
      branch_host_slug: newHost,
      pastor_name: "Rev. Suspended",
    });
    assert.equal(suspendedEdit.status, 302);
    const stillSuspended = await branchesRepo.findBranchByIdForPlatform(pool, branch.id);
    assert.equal(stillSuspended.status, "suspended");
    assert.equal(stillSuspended.name, "Suspended But Edited");

    await cleanupOrg(pool, org.id);
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
  }
);
