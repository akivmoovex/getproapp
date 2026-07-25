"use strict";

/**
 * Phase 6 Giving Settings — static hooks + validation + Branch Admin PG flows.
 */

const path = require("path");
const fs = require("fs");
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
const givingSettingsRepo = require("../src/db/pg/church/givingSettingsRepo");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");
const {
  validateGivingSettingsFields,
  describeGivingSettingsReadiness,
  settingsFromForm,
  formFromSettings,
} = require("../src/services/church/givingSettingsService");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

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
      secret: "test-phase6-giving-settings",
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

function extractCsrf(html) {
  const m = String(html || "").match(/name="_csrf"[^>]*value="([^"]+)"/);
  return m ? m[1] : "";
}

async function cleanup(pool, branchIds, orgIds) {
  for (const branchId of branchIds) {
    await pool.query(`DELETE FROM public.church_audit_logs WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_giving_settings WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("Phase 6 Giving Settings view hooks and no payment secrets UI", () => {
  const body = read("views/church/partials/phase6_giving_settings_body.ejs");
  const wrapper = read("views/church/branch-admin/giving_settings.ejs");
  const route = read("src/routes/church/branchAdminGivingSettings.js");
  const css = read("public/church/church.css");
  const shell = read("views/church/partials/branch_admin_shell_start.ejs");

  assert.match(wrapper, /phase6_giving_settings_body/);
  assert.match(body, /data-p6-screen="giving-settings"/);
  assert.match(body, /data-responsive="desktop-mobile"/);
  assert.match(body, /data-testid="giving-settings-form"/);
  assert.match(body, /data-testid="giving-settings-provider-unavailable"/);
  assert.match(body, /data-provider-status="unavailable"/);
  assert.match(body, /data-testid="giving-settings-unsupported"/);
  assert.match(body, /csrf_field/);
  assert.doesNotMatch(body, /sk_live|whsec_|access_token|private[_ ]key|System Online|Chase \*{4}9281/i);
  assert.doesNotMatch(body, /name="stripe_|name="webhook_|name="secret_key"/);

  assert.match(route, /requireChurchSessionCsrf/);
  assert.match(route, /validateGivingSettingsFields/);
  assert.match(route, /recordBranchAudit/);
  assert.match(route, /router\.(get|post)\(\s*"\/branch\/giving-settings"/);
  assert.doesNotMatch(route, /router\.(get|post)\(\s*"\/branch-admin\/giving/);

  assert.match(css, /\.church-body--branch-admin \.church-p6-giving-settings/);
  assert.match(shell, /church\.css\?v=56/);
  const navSrc = read("src/church/http/classicAdminNav.js");
  assert.match(navSrc, /href: "\/branch\/giving-settings"/);
  assert.match(navSrc, /testId: "nav-giving-settings"/);
  assert.match(navSrc, /href: "\/branch\/giving-summary"/);
  assert.match(navSrc, /href: "\/branch\/attendance"/);
});

test("Phase 6 Giving four-screen static audit hooks", () => {
  const summary = read("views/church/partials/phase6_giving_summary_body.ejs");
  const settings = read("views/church/partials/phase6_giving_settings_body.ejs");
  const branchGiving = read("src/routes/church/branchAdminGiving.js");
  const hqGiving = read("src/routes/church/hqAdminGiving.js");
  const nav = read("src/church/http/classicAdminNav.js");

  assert.match(summary, /data-p6-screen="giving-summary"/);
  assert.match(settings, /data-p6-screen="giving-settings"/);
  assert.match(branchGiving, /\/branch\/giving-summary/);
  assert.match(hqGiving, /\/hq\/giving-summary/);
  assert.match(nav, /testId: "nav-giving"/);
  assert.match(nav, /href: "\/branch\/giving-summary"/);
  assert.match(nav, /testId: "nav-attendance"/);
  assert.match(nav, /href: "\/branch\/attendance"/);
  assert.doesNotMatch(
    nav,
    /data-testid="nav-giving"[^>]*href="\/branch\/attendance"|href="\/branch\/attendance"[^>]*data-testid="nav-giving"/
  );
});

test("validateGivingSettingsFields enforces lengths and category caps", () => {
  assert.equal(validateGivingSettingsFields(settingsFromForm({ bank_name: "OK" })).ok, true);
  const tooLong = validateGivingSettingsFields(
    settingsFromForm({ bank_name: "x".repeat(121) })
  );
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.error, /bank name/i);

  const manyCats = validateGivingSettingsFields(
    settingsFromForm({
      giving_categories: Array.from({ length: 41 }, (_, i) => `Cat ${i}`).join("\n"),
    })
  );
  assert.equal(manyCats.ok, false);
});

test("describeGivingSettingsReadiness marks payment provider unavailable", () => {
  const form = formFromSettings({
    status: "draft",
    account_number: "123",
    account_name: "Church",
    mobile_money_number_1: "0977",
    mobile_money_name_1: "Treasurer",
    giving_categories_json: ["Tithes", "Offerings"],
  });
  const ready = describeGivingSettingsReadiness({ status: "published" }, form);
  assert.equal(ready.status, "published");
  assert.equal(ready.hasBankChannel, true);
  assert.equal(ready.hasMobileChannel, true);
  assert.equal(ready.categoryCount, 2);
  assert.equal(ready.paymentProviderSupported, false);
  assert.equal(ready.paymentProviderStatus, "unavailable");
  assert.equal(ready.defaultCurrencyEditable, false);
  assert.equal(ready.receiptsSupported, false);
});

test(
  "Phase 6 Giving Settings Branch Admin: CSRF field, validation, no secrets, isolation",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("p6gs");
    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `p6gs_a_${suffix}`,
      name: `P6GS Church A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `p6gs_b_${suffix}`,
      name: `P6GS Church B ${suffix}`,
    });
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      host_slug: `hs_branchA_${suffix}`.slice(0, 40),
      name: `P6GS Branch A ${suffix}`,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      host_slug: `hs_branchB_${suffix}`.slice(0, 40),
      name: `P6GS Branch B ${suffix}`,
    });
    const passwordHash = await bcrypt.hash("testpass123", 12);
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      full_name: "P6GS Admin",
      email: `p6gs_admin_${suffix}@example.com`,
      phone: "0977555001",
      password_hash: passwordHash,
    });

    const appA = makeApp({
      kind: "branch",
      orgSlug: orgA.slug,
      organization: orgA,
      branch: branchA,
    });
    const agent = request.agent(appA);
    await agent.post("/branch/login").type("form").send({
      identifier: `p6gs_admin_${suffix}@example.com`,
      password: "testpass123",
    });

    const page = await agent.get("/branch/giving-settings");
    assert.equal(page.status, 200);
    assert.match(page.text, /data-testid="giving-settings"/);
    assert.match(page.text, /data-testid="giving-settings-provider-unavailable"/);
    assert.match(page.text, /name="_csrf"/);
    assert.match(page.text, /nav-giving-settings/);
    assert.doesNotMatch(page.text, /sk_live|whsec_|private key|Chase \*{4}|System Online/i);
    const csrf = extractCsrf(page.text);
    assert.ok(csrf);

    const reject = await agent.post("/branch/giving-settings").type("form").send({
      _csrf: csrf,
      _intent: "publish",
      bank_name: "",
      account_number: "",
      mobile_money_number_1: "",
    });
    assert.equal(reject.status, 400);
    assert.match(reject.text, /at least one giving channel/);

    const tooLong = await agent.post("/branch/giving-settings").type("form").send({
      _csrf: extractCsrf(reject.text) || csrf,
      _intent: "draft",
      bank_name: "x".repeat(121),
    });
    assert.equal(tooLong.status, 400);
    assert.match(tooLong.text, /too long/i);

    const publishCsrf = extractCsrf((await agent.get("/branch/giving-settings")).text);
    const publish = await agent.post("/branch/giving-settings").type("form").send({
      _csrf: publishCsrf,
      _intent: "publish",
      bank_name: "Stanbic",
      account_name: "P6GS Church",
      account_number: `P6GS-${suffix}`,
      giving_categories: "Tithes\nOfferings",
      giving_instructions: "Use your name as reference.",
      finance_contact_name: "Finance Desk",
      finance_contact_phone: "0977000111",
    });
    assert.equal(publish.status, 303);

    const row = await givingSettingsRepo.getPublishedGivingSettingsForBranch(pool, branchA.id);
    assert.equal(row.account_number, `P6GS-${suffix}`);
    assert.deepEqual(row.giving_categories_json, ["Tithes", "Offerings"]);

    await givingSettingsRepo.upsertGivingSettingsForBranch(pool, branchB.id, {
      organization_id: orgB.id,
      bank_name: "Other Bank",
      account_name: "Other",
      account_number: `SECRET-B-${suffix}`,
      giving_categories_json: ["Other"],
      giving_instructions: "Branch B only",
      updated_by_admin_id: null,
    });
    await givingSettingsRepo.publishGivingSettingsForBranch(pool, branchB.id, null);

    const after = await agent.get("/branch/giving-settings");
    assert.doesNotMatch(after.text, new RegExp(`SECRET-B-${suffix}`));
    assert.match(after.text, new RegExp(`P6GS-${suffix}`));

    await cleanup(pool, [branchA.id, branchB.id], [orgA.id, orgB.id]);
  }
);
