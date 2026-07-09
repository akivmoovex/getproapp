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
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const auditLogsRepo = require("../src/db/pg/church/auditLogsRepo");
const { formatMetadataForDisplay } = require("../src/church/auditLogFormatting");
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
      secret: "test-church-audit-trail",
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

async function cleanup(pool, orgIds) {
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("non-church host cannot access audit routes", async () => {
  const app = makeApp(null, false);
  assert.equal((await request(app).get("/branch/activity")).status, 404);
  assert.equal((await request(app).get("/hq/audit")).status, 404);
});

test("unauthenticated users redirect to login", async () => {
  const ctx = {
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  };
  const app = makeApp(ctx);
  const branchRes = await request(app).get("/branch/activity");
  assert.equal(branchRes.status, 302);
  assert.equal(branchRes.headers.location, "/branch/login");
  const hqRes = await request(app).get("/hq/audit");
  assert.equal(hqRes.status, 302);
  assert.equal(hqRes.headers.location, "/hq/login");
});

test(
  "branch and HQ audit trail scoping",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("audit");
    const passwordHash = await bcrypt.hash("testpass123", 12);

    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `audit_a_${suffix}`,
      name: `Audit Org A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `audit_b_${suffix}`,
      name: `Audit Org B ${suffix}`,
    });

    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      name: `Branch A ${suffix}`,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      name: `Branch B ${suffix}`,
    });

    const adminA = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      full_name: "Branch Admin A",
      email: `branch_a_${suffix}@example.com`,
      phone: "0977555301",
      password_hash: passwordHash,
    });
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      full_name: "Branch Admin B",
      email: `branch_b_${suffix}@example.com`,
      phone: "0977555302",
      password_hash: passwordHash,
    });

    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgA.id,
      full_name: "HQ Admin A",
      email: `hq_a_${suffix}@example.com`,
      phone: "0977555303",
      password_hash: passwordHash,
    });
    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgB.id,
      full_name: "HQ Admin B",
      email: `hq_b_${suffix}@example.com`,
      phone: "0977555304",
      password_hash: passwordHash,
    });

    const logA = await auditLogsRepo.insertAuditLog(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      actor_type: "branch_admin",
      actor_id: adminA.id,
      action: "member_verified_by_admin",
      entity_type: "member",
      entity_id: 101,
      metadata_json: { title: "Verified Member", status: "verified" },
      target_label: "Verified Member",
    });
    const logB = await auditLogsRepo.insertAuditLog(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      actor_type: "branch_admin",
      actor_id: 999,
      action: "announcement_published",
      entity_type: "announcement",
      entity_id: 55,
      metadata_json: { title: "Other Org Announcement" },
    });

    const appA = makeApp({
      kind: "branch",
      orgSlug: orgA.slug,
      organization: orgA,
      branch: branchA,
    });
    const branchAgent = request.agent(appA);
    await branchAgent.post("/branch/login").type("form").send({
      identifier: `branch_a_${suffix}@example.com`,
      password: "testpass123",
    });

    const timeline = await branchAgent.get("/branch/activity");
    assert.equal(timeline.status, 200);
    assert.match(timeline.text, /Activity timeline/);
    assert.match(timeline.text, /Member verified/);
    assert.doesNotMatch(timeline.text, /Other Org Announcement/);

    const filtered = await branchAgent.get("/branch/activity?actor_type=branch_admin&action_group=members");
    assert.equal(filtered.status, 200);
    assert.match(filtered.text, /Member verified/);

    const detail = await branchAgent.get(`/branch/activity/${logA.id}`);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /Verified Member/);
    assert.match(detail.text, /"status": "verified"/);

    const crossDetail = await branchAgent.get(`/branch/activity/${logB.id}`);
    assert.equal(crossDetail.status, 404);

    const branchLogs = await auditLogsRepo.listAuditLogsForBranch(pool, branchA.id, {});
    assert.ok(branchLogs.every((row) => Number(row.branch_id) === Number(branchA.id)));

    const hqAgent = request.agent(appA);
    await hqAgent.post("/hq/login").type("form").send({
      identifier: `hq_a_${suffix}@example.com`,
      password: "testpass123",
    });
    const hqTrail = await hqAgent.get("/hq/audit");
    assert.equal(hqTrail.status, 200);
    assert.match(hqTrail.text, /Global audit trail/);
    assert.match(hqTrail.text, /Member verified/);
    assert.doesNotMatch(hqTrail.text, /Other Org Announcement/);

    const hqDetail = await hqAgent.get(`/hq/audit/${logA.id}`);
    assert.equal(hqDetail.status, 200);
    const display = formatMetadataForDisplay({ title: "Verified Member", status: "verified" });
    assert.match(hqDetail.text, display.trim().slice(0, 20));

    const appB = makeApp({
      kind: "branch",
      orgSlug: orgB.slug,
      organization: orgB,
      branch: branchB,
    });
    const hqB = request.agent(appB);
    await hqB.post("/hq/login").type("form").send({
      identifier: `hq_b_${suffix}@example.com`,
      password: "testpass123",
    });
    const crossHq = await hqB.get(`/hq/audit/${logA.id}`);
    assert.equal(crossHq.status, 404);

    await cleanup(pool, [orgA.id, orgB.id]);
  }
);
