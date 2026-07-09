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
      secret: "test-church-member-directory",
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

async function cleanup(pool, branchIds, orgIds) {
  for (const branchId of branchIds) {
    await pool.query(`DELETE FROM public.church_audit_logs WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_member_ministries WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_members WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("non-church host cannot access /branch/members", async () => {
  const app = makeApp(null, false);
  const res = await request(app).get("/branch/members");
  assert.equal(res.status, 404);
});

test("unauthenticated visitor redirects to /branch/login", async () => {
  const app = makeApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const res = await request(app).get("/branch/members");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/branch/login");
});

test(
  "branch admin member directory and status management",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("mdir");
    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `mdir_a_${suffix}`,
      name: `Member Dir A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `mdir_b_${suffix}`,
      name: `Member Dir B ${suffix}`,
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
    const passwordHash = await bcrypt.hash("testpass123", 12);
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      full_name: "Admin A",
      email: `admin_a_${suffix}@example.com`,
      phone: "0977444001",
      password_hash: passwordHash,
    });
    const member = await membersRepo.createPendingMember(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      platform_tenant_id: TENANT_ZM,
      email: `member_${suffix}@example.com`,
      phone: "0977444002",
      full_name: "Directory Member",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
      ministry_interest: "choir",
    });
    await membersRepo.updateMemberStatusForBranch(pool, member.id, branchA.id, "verified");

    const appA = makeApp({
      kind: "branch",
      orgSlug: orgA.slug,
      organization: orgA,
      branch: branchA,
    });
    const adminAgent = request.agent(appA);
    await adminAgent.post("/branch/login").type("form").send({
      identifier: `admin_a_${suffix}@example.com`,
      password: "testpass123",
    });

    const directory = await adminAgent.get("/branch/members?status=verified");
    assert.equal(directory.status, 200);
    assert.match(directory.text, /Directory Member/);

    const search = await adminAgent.get(`/branch/members?q=member_${suffix}@example.com`);
    assert.equal(search.status, 200);
    assert.match(search.text, /Directory Member/);

    const profile = await adminAgent.get(`/branch/members/${member.id}`);
    assert.equal(profile.status, 200);
    assert.match(profile.text, /Profile details/i);

    const appB = makeApp({
      kind: "branch",
      orgSlug: orgB.slug,
      organization: orgB,
      branch: branchB,
    });
    const adminB = request.agent(appB);
    await adminB.post("/branch/login").type("form").send({
      identifier: `admin_a_${suffix}@example.com`,
      password: "testpass123",
    });
    const crossBranch = await adminB.get(`/branch/members/${member.id}`);
    assert.equal(crossBranch.status, 404);

    const memberAgent = request.agent(appA);
    await memberAgent.post("/login").type("form").send({
      identifier: `member_${suffix}@example.com`,
      password: "testpass123",
    });
    const dash = await memberAgent.get("/member/dashboard");
    assert.equal(dash.status, 200);

    const suspend = await adminAgent.post(`/branch/members/${member.id}/suspend`).type("form").send({
      suspend_reason: "Temporary leave",
    });
    assert.equal(suspend.status, 303);

    const blocked = await memberAgent.get("/member/dashboard");
    assert.equal(blocked.status, 302);
    assert.equal(blocked.headers.location, "/login");

    const reactivate = await adminAgent.post(`/branch/members/${member.id}/reactivate`);
    assert.equal(reactivate.status, 303);

    await memberAgent.post("/login").type("form").send({
      identifier: `member_${suffix}@example.com`,
      password: "testpass123",
    });
    const dashAgain = await memberAgent.get("/member/dashboard");
    assert.equal(dashAgain.status, 200);

    const duplicateEmail = await membersRepo.createPendingMember(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      platform_tenant_id: TENANT_ZM,
      email: `other_${suffix}@example.com`,
      phone: "0977444999",
      full_name: "Other Member",
      password_hash: passwordHash,
      gender: "female",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
      ministry_interest: "youth",
    });
    await membersRepo.updateMemberStatusForBranch(pool, duplicateEmail.id, branchA.id, "verified");

    const badUpdate = await adminAgent.post(`/branch/members/${member.id}`).type("form").send({
      full_name: "Directory Member",
      email: `other_${suffix}@example.com`,
      phone: "0977444002",
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
      ministry_interest: "choir",
      emergency_contact_name: "",
      emergency_contact_phone: "",
    });
    assert.equal(badUpdate.status, 400);

    const note = await adminAgent.post(`/branch/members/${member.id}/add-note`).type("form").send({
      note: "Followed up by phone.",
    });
    assert.equal(note.status, 303);

    const row = await membersRepo.findMemberByIdForBranch(pool, member.id, branchA.id);
    assert.match(row.admin_notes, /Followed up by phone/);

    await cleanup(pool, [branchA.id, branchB.id], [orgA.id, orgB.id]);
  }
);
