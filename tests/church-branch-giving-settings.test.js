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
const givingSettingsRepo = require("../src/db/pg/church/givingSettingsRepo");
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
      secret: "test-church-giving-settings",
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
    await pool.query(`DELETE FROM public.church_giving_settings WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_members WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("non-church host cannot access /branch/giving-settings", async () => {
  const app = makeApp(null, false);
  const res = await request(app).get("/branch/giving-settings");
  assert.equal(res.status, 404);
});

test("unauthenticated visitor redirects to /branch/login", async () => {
  const app = makeApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const res = await request(app).get("/branch/giving-settings");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/branch/login");
});

test(
  "branch giving settings draft and publish",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("gs");
    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `gs_a_${suffix}`,
      name: `GS Church A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `gs_b_${suffix}`,
      name: `GS Church B ${suffix}`,
    });
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      name: `GS Branch A ${suffix}`,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      name: `GS Branch B ${suffix}`,
    });
    const passwordHash = await bcrypt.hash("testpass123", 12);
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      full_name: "GS Admin",
      email: `gs_admin_${suffix}@example.com`,
      phone: "0977444001",
      password_hash: passwordHash,
    });
    const member = await membersRepo.createPendingMember(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      platform_tenant_id: TENANT_ZM,
      email: `gs_member_${suffix}@example.com`,
      phone: "0977444002",
      full_name: "GS Member",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
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
      identifier: `gs_admin_${suffix}@example.com`,
      password: "testpass123",
    });

    const editor = await adminAgent.get("/branch/giving-settings");
    assert.equal(editor.status, 200);
    assert.match(editor.text, /Giving settings/);

    const draftAccount = `DRAFT-ACC-${suffix}`;
    const saveDraft = await adminAgent.post("/branch/giving-settings").type("form").send({
      bank_name: "Draft Bank",
      account_name: "Draft Account",
      account_number: draftAccount,
      giving_categories: "Tithes\nOfferings",
      giving_instructions: "Draft instructions not public",
      _intent: "draft",
    });
    assert.equal(saveDraft.status, 303);

    const publicGivingDraft = await request(appA).get("/giving");
    assert.equal(publicGivingDraft.status, 200);
    assert.doesNotMatch(publicGivingDraft.text, new RegExp(draftAccount));

    const memberAgent = request.agent(appA);
    await memberAgent.post("/login").type("form").send({
      identifier: `gs_member_${suffix}@example.com`,
      password: "testpass123",
    });
    const memberGivingDraft = await memberAgent.get("/member/giving");
    assert.equal(memberGivingDraft.status, 200);
    assert.match(memberGivingDraft.text, /has not been published/);
    assert.doesNotMatch(memberGivingDraft.text, new RegExp(draftAccount));

    const publishedAccount = `PUB-ACC-${suffix}`;
    const publish = await adminAgent.post("/branch/giving-settings").type("form").send({
      bank_name: "Published Bank",
      account_name: "Church Account",
      account_number: publishedAccount,
      branch_code: "001",
      mobile_money_provider_1: "MTN",
      mobile_money_number_1: "0977111222",
      mobile_money_name_1: "Treasurer",
      giving_categories: "Tithes\nMissions",
      giving_instructions: "Include your name in the reference.",
      finance_contact_name: "Finance Office",
      finance_contact_phone: "0977000999",
      _intent: "publish",
    });
    assert.equal(publish.status, 303);

    const publishedRow = await givingSettingsRepo.getPublishedGivingSettingsForBranch(pool, branchA.id);
    assert.equal(publishedRow.status, "published");
    assert.equal(publishedRow.account_number, publishedAccount);

    const publicGiving = await request(appA).get("/giving");
    assert.match(publicGiving.text, new RegExp(publishedAccount));
    assert.match(publicGiving.text, /0977111222/);
    assert.match(publicGiving.text, /Include your name in the reference/);

    const memberGiving = await memberAgent.get("/member/giving");
    assert.match(memberGiving.text, new RegExp(publishedAccount));
    assert.match(memberGiving.text, /Treasurer/);

    await givingSettingsRepo.upsertGivingSettingsForBranch(pool, branchB.id, {
      organization_id: orgB.id,
      bank_name: "Branch B Bank",
      account_name: "B Account",
      account_number: "BRANCH-B-SECRET",
      branch_code: "",
      mobile_money_provider_1: "",
      mobile_money_number_1: "",
      mobile_money_name_1: "",
      giving_categories_json: [],
      giving_instructions: "Branch B only",
      updated_by_admin_id: null,
    });
    await givingSettingsRepo.publishGivingSettingsForBranch(pool, branchB.id, null);

    const crossBranchPublic = await request(appA).get("/giving");
    assert.doesNotMatch(crossBranchPublic.text, /BRANCH-B-SECRET/);

    const rejectPublish = await adminAgent.post("/branch/giving-settings").type("form").send({
      bank_name: "",
      account_number: "",
      mobile_money_number_1: "",
      _intent: "publish",
    });
    assert.equal(rejectPublish.status, 400);
    assert.match(rejectPublish.text, /at least one giving channel/);

    await cleanup(pool, [branchA.id, branchB.id], [orgA.id, orgB.id]);
  }
);
