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
  validateUpdateOrganizationBody,
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
      secret: "church-organization-edit-test",
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

async function seedOrgWithBranch(pool, suffix, opts = {}) {
  const oldOrgSlug = `oldorg${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28);
  const hostSlug = `branchhost${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28);
  const org = await organizationsRepo.createOrganization(pool, {
    platform_tenant_id: TENANT_ZM,
    slug: oldOrgSlug,
    name: `Org Edit ${suffix}`,
    status: opts.status || "active",
  });
  await pool.query(
    `UPDATE public.church_organizations
     SET country = $2, city = $3, primary_contact_name = $4, primary_contact_phone = $5, primary_contact_email = $6, plan_code = $7
     WHERE id = $1`,
    [
      org.id,
      "Zambia",
      "Lusaka",
      "Jane Contact",
      "0977000000",
      "jane@example.com",
      opts.plan_code || "free",
    ]
  );
  const branch = await branchesRepo.createBranch(pool, {
    organization_id: org.id,
    slug: hostSlug,
    host_slug: hostSlug,
    name: "Main Branch",
  });
  const refreshed = await organizationsRepo.findOrganizationById(pool, org.id);
  return { org: refreshed, branch, oldOrgSlug, hostSlug };
}

test("reserved organization slug rejected on update validation", () => {
  for (const slug of ["admin", "hq", "church", "member"]) {
    const result = validateUpdateOrganizationBody({
      organization_name: "Test Org",
      organization_slug: slug,
      country: "Zambia",
    });
    assert.equal(result.ok, false, `expected ${slug} to be rejected`);
  }
});

test("invalid primary contact email rejected", () => {
  const result = validateUpdateOrganizationBody({
    organization_name: "Test Org",
    organization_slug: "valid-org-slug",
    country: "Zambia",
    primary_contact_email: "not-an-email",
  });
  assert.equal(result.ok, false);
});

test("tenant manager cannot open organization edit form", async () => {
  if (!isPgConfigured()) return;
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  const suffix = makeSuffix("orgmgr");
  const hash = await bcrypt.hash("pw12345678", 12);
  const username = `org_edit_mgr_${suffix}`;
  const userId = await adminUsersRepo.insertUser(pool, {
    username,
    passwordHash: hash,
    role: ROLES.TENANT_MANAGER,
    tenantId: TENANT_ZM,
    displayName: "",
  });
  const { org } = await seedOrgWithBranch(pool, suffix);
  const app = createAdminApp();
  const agent = await adminLoginAgent(app, username, "pw12345678");
  const res = await agent.get(`/admin/church/organizations/${org.id}/edit`);
  assert.equal(res.status, 403);
  await cleanupOrg(pool, org.id);
  await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [userId]);
});

test(
  "organization edit integration",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("orged");
    const hash = await bcrypt.hash("superpw123456", 12);
    const superName = `orged_sup_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    const { org, branch, oldOrgSlug, hostSlug } = await seedOrgWithBranch(pool, suffix);
    const newOrgSlug = `neworg${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28);

    const app = createAdminApp();
    const agent = await adminLoginAgent(app, superName, "superpw123456");

    const editPage = await agent.get(`/admin/church/organizations/${org.id}/edit`);
    assert.equal(editPage.status, 200);
    assert.match(editPage.text, /Edit organization/);

    const otherSuffix = makeSuffix("dup");
    const other = await seedOrgWithBranch(pool, otherSuffix);
    const dupSlug = await agent.post(`/admin/church/organizations/${org.id}`).type("form").send({
      organization_name: org.name,
      organization_slug: other.oldOrgSlug,
      country: "Zambia",
    });
    assert.equal(dupSlug.status, 400);

    const reserved = await agent.post(`/admin/church/organizations/${org.id}`).type("form").send({
      organization_name: org.name,
      organization_slug: "admin",
      country: "Zambia",
    });
    assert.equal(reserved.status, 400);

    const updated = await agent.post(`/admin/church/organizations/${org.id}`).type("form").send({
      organization_name: "Updated Org Name",
      organization_slug: newOrgSlug,
      country: "Zambia",
      city: "Ndola",
      primary_contact_name: "John Updated",
      primary_contact_phone: "0977111222",
      primary_contact_email: "john@example.com",
      plan_code: "pro",
      status: "active",
    });
    assert.equal(updated.status, 302);
    assert.match(updated.headers.location, /notice=slug_changed/);

    const refreshed = await organizationsRepo.findOrganizationById(pool, org.id);
    assert.equal(refreshed.name, "Updated Org Name");
    assert.equal(refreshed.slug, newOrgSlug);
    assert.equal(refreshed.city, "Ndola");
    assert.equal(refreshed.primary_contact_name, "John Updated");
    assert.equal(refreshed.primary_contact_email, "john@example.com");
    assert.equal(refreshed.plan_code, "free");
    assert.equal(refreshed.status, "active");

    const resolved = await branchesRepo.findBranchByHostSlug(pool, hostSlug);
    assert.ok(resolved);
    assert.equal(resolved.id, branch.id);

    const auditUpdate = await pool.query(
      `SELECT action, metadata_json FROM public.church_audit_logs
       WHERE organization_id = $1 AND action = 'platform_church_organization_updated'
       ORDER BY id DESC LIMIT 1`,
      [org.id]
    );
    assert.equal(auditUpdate.rows.length, 1);
    assert.ok(auditUpdate.rows[0].metadata_json.changed_fields.includes("slug"));

    const auditSlug = await pool.query(
      `SELECT action, metadata_json FROM public.church_audit_logs
       WHERE organization_id = $1 AND action = 'platform_church_organization_slug_changed'
       ORDER BY id DESC LIMIT 1`,
      [org.id]
    );
    assert.equal(auditSlug.rows.length, 1);
    assert.equal(auditSlug.rows[0].metadata_json.previous_slug, oldOrgSlug);
    assert.equal(auditSlug.rows[0].metadata_json.new_slug, newOrgSlug);

    await organizationsRepo.suspendOrganization(pool, org.id, {
      reason: "Temporary hold",
      platformAdminId: superId,
    });
    const suspendedEdit = await agent.post(`/admin/church/organizations/${org.id}`).type("form").send({
      organization_name: "Suspended But Edited",
      organization_slug: newOrgSlug,
      country: "Zambia",
      primary_contact_name: "Suspended Contact",
    });
    assert.equal(suspendedEdit.status, 302);
    const stillSuspended = await organizationsRepo.findOrganizationById(pool, org.id);
    assert.equal(stillSuspended.status, "suspended");
    assert.equal(stillSuspended.name, "Suspended But Edited");

    await cleanupOrg(pool, org.id);
    await cleanupOrg(pool, other.org.id);
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
  }
);
