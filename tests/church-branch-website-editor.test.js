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
const websiteContentRepo = require("../src/db/pg/church/websiteContentRepo");
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
      secret: "test-church-website-editor",
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
    await pool.query(`DELETE FROM public.church_branch_website_content WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("non-church host cannot access /branch/website-editor", async () => {
  const app = makeApp(null, false);
  const res = await request(app).get("/branch/website-editor");
  assert.equal(res.status, 404);
});

test("unauthenticated visitor redirects to /branch/login", async () => {
  const app = makeApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const res = await request(app).get("/branch/website-editor");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/branch/login");
});

test(
  "branch website editor draft, preview, and publish",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("web");
    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `web_a_${suffix}`,
      name: `Web Church A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `web_b_${suffix}`,
      name: `Web Church B ${suffix}`,
    });
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      name: `Web Branch A ${suffix}`,
      welcome_message: "Fallback welcome A",
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      name: `Web Branch B ${suffix}`,
    });
    const passwordHash = await bcrypt.hash("testpass123", 12);
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      full_name: "Web Admin",
      email: `web_admin_${suffix}@example.com`,
      phone: "0977333001",
      password_hash: passwordHash,
    });

    const appA = makeApp({
      kind: "branch",
      orgSlug: orgA.slug,
      organization: orgA,
      branch: branchA,
    });
    const adminAgent = request.agent(appA);
    await adminAgent.post("/branch/login").type("form").send({
      identifier: `web_admin_${suffix}@example.com`,
      password: "testpass123",
    });

    const editor = await adminAgent.get("/branch/website-editor");
    assert.equal(editor.status, 200);
    assert.match(editor.text, /Website editor/);

    const draftTitle = `Draft Hero ${suffix}`;
    const saveDraft = await adminAgent.post("/branch/website-editor").type("form").send({
      homepage_hero_title: draftTitle,
      homepage_hero_subtitle: "Draft subtitle",
      welcome_message: "Draft welcome message hidden from public",
      service_times: "Sunday 10 AM",
      location_text: "Draft location",
      about_title: "About us draft",
      about_body: "Draft about body",
      contact_phone: "0977000111",
      contact_email: "office@example.com",
      giving_instructions: "Draft giving instructions",
      _intent: "draft",
    });
    assert.equal(saveDraft.status, 303);

    const publicHomeDraft = await request(appA).get("/");
    assert.equal(publicHomeDraft.status, 200);
    assert.doesNotMatch(publicHomeDraft.text, /Draft Hero/);
    assert.doesNotMatch(publicHomeDraft.text, /Draft welcome message hidden from public/);

    const preview = await adminAgent.get("/branch/website-preview");
    assert.equal(preview.status, 200);
    assert.match(preview.text, /Preview only/);
    assert.match(preview.text, new RegExp(draftTitle));

    const publish = await adminAgent.post("/branch/website-editor").type("form").send({
      homepage_hero_title: `Published Hero ${suffix}`,
      homepage_hero_subtitle: "Published subtitle",
      welcome_message: "Published welcome for everyone",
      service_times: "Sunday 9 AM & 11 AM",
      location_text: "123 Church Road",
      about_title: "About our church",
      about_body: "Published about content",
      mission_text: "To serve our community",
      contact_phone: "0977000222",
      contact_email: "hello@church.example.com",
      address: "123 Church Road, Kafue",
      giving_instructions: "Published giving instructions",
      giving_bank_details: "Bank: Example Bank\nAccount: 123456",
      pastor_name: "Pastor Test",
      pastor_title: "Senior Pastor",
      ministries_entries: "Youth | Friday fellowship | Fridays 5PM",
      _intent: "publish",
    });
    assert.equal(publish.status, 303);

    const publishedRow = await websiteContentRepo.getPublishedWebsiteContentForBranch(pool, branchA.id);
    assert.equal(publishedRow.status, "published");
    assert.match(publishedRow.homepage_hero_title, /Published Hero/);

    const publicHome = await request(appA).get("/");
    assert.match(publicHome.text, /Published Hero/);
    assert.match(publicHome.text, /Published welcome for everyone/);

    const about = await request(appA).get("/about");
    assert.equal(about.status, 200);
    assert.match(about.text, /Published about content/);
    assert.match(about.text, /To serve our community/);

    const contact = await request(appA).get("/contact");
    assert.match(contact.text, /0977000222/);
    assert.match(contact.text, /hello@church.example.com/);

    const giving = await request(appA).get("/giving");
    assert.match(giving.text, /Published giving instructions/);
    assert.match(giving.text, /Example Bank/);

    const leadership = await request(appA).get("/leadership");
    assert.match(leadership.text, /Pastor Test/);

    const ministries = await request(appA).get("/ministries");
    assert.match(ministries.text, /Youth/);

    await websiteContentRepo.upsertWebsiteDraftForBranch(pool, branchB.id, {
      organization_id: orgB.id,
      homepage_hero_title: "Branch B Secret",
      homepage_hero_subtitle: "",
      welcome_message: "Branch B welcome",
      service_times: "",
      location_text: "",
      about_title: "",
      about_body: "",
      mission_text: "",
      vision_text: "",
      values_text: "",
      leadership_json: {},
      ministries_json: [],
      contact_phone: "",
      contact_email: "",
      office_hours: "",
      address: "",
      map_embed_placeholder: "",
      giving_bank_details: "",
      giving_mobile_money: "",
      giving_categories: "",
      giving_instructions: "",
      giving_qr_placeholder: "",
      footer_message: "",
      updated_by_admin_id: null,
    });
    await websiteContentRepo.publishWebsiteContentForBranch(pool, branchB.id, null);

    const crossPreview = await adminAgent.get("/branch/website-preview");
    assert.doesNotMatch(crossPreview.text, /Branch B Secret/);

    const rejectPublish = await adminAgent.post("/branch/website-editor").type("form").send({
      homepage_hero_title: "",
      welcome_message: "",
      _intent: "publish",
    });
    assert.equal(rejectPublish.status, 400);
    assert.match(rejectPublish.text, /Homepage hero title is required/);

    await cleanup(pool, [branchA.id, branchB.id], [orgA.id, orgB.id]);
  }
);
