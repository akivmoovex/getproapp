"use strict";

/**
 * Field-agent dashboard: SP and EC payable breakdown modals (read-only JSON + UI copy in public JS).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const express = require("express");
const session = require("express-session");
const request = require("supertest");

const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const { ensureTenantCommerceSettingsSchema } = require("../src/db/pg/ensureTenantCommerceSettingsSchema");
const { ensureCompaniesDirectoryFlagsSchema } = require("../src/db/pg/ensureCompaniesDirectoryFlagsSchema");
const tenantCommerceSettingsRepo = require("../src/db/pg/tenantCommerceSettingsRepo");
const fieldAgentsRepo = require("../src/db/pg/fieldAgentsRepo");
const companiesRepo = require("../src/db/pg/companiesRepo");
const categoriesRepo = require("../src/db/pg/categoriesRepo");
const fieldAgentRoutes = require("../src/routes/fieldAgent");
const { setFieldAgentSession } = require("../src/auth/fieldAgentAuth");
const { TENANT_ZM } = require("../src/tenants/tenantIds");

function createTestApp(fieldAgentId) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "field_agent_payable_modal_test",
      resave: false,
      saveUninitialized: true,
      name: "fa_pay_modal_sid",
    })
  );
  app.use((req, res, next) => {
    req.tenant = { id: TENANT_ZM, slug: "zm" };
    req.tenantUrlPrefix = "";
    next();
  });
  app.use((req, res, next) => {
    setFieldAgentSession(req, {
      id: fieldAgentId,
      tenantId: TENANT_ZM,
      username: "fa_pay_modal",
      displayName: "",
    });
    next();
  });
  app.use(fieldAgentRoutes());
  return app;
}

function parseSpPayablePayload(html) {
  const m = html.match(/id="fa-sp-payable-breakdown-data"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  return JSON.parse(m[1].trim());
}

function parseEcPayablePayload(html) {
  const m = html.match(/id="fa-ec-payable-breakdown-data"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  return JSON.parse(m[1].trim());
}

async function restoreTenantZmDefaults(pool) {
  await tenantCommerceSettingsRepo.upsert(pool, TENANT_ZM, {
    currency: "ZMW",
    currency_name: "",
    currency_symbol: "K",
    deal_price_percentage: 3,
    minimum_credit_balance: 0,
    starting_credit_balance: 250,
    minimum_review_rating: 3,
    field_agent_sp_commission_percent: null,
    field_agent_ec_commission_percent: null,
    field_agent_sp_high_rating_bonus_percent: null,
    field_agent_sp_rating_low_threshold: null,
    field_agent_sp_rating_high_threshold: null,
  });
}

test(
  "field-agent dashboard: SP payable JSON reflects low-rating withheld when earned > 0",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureTenantCommerceSettingsSchema(pool);
    await ensureCompaniesDirectoryFlagsSchema(pool);
    const u = `wth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await tenantCommerceSettingsRepo.upsert(pool, TENANT_ZM, {
      currency: "ZMW",
      currency_name: "",
      currency_symbol: "K",
      deal_price_percentage: 3,
      minimum_credit_balance: 0,
      starting_credit_balance: 250,
      minimum_review_rating: 3,
      field_agent_sp_commission_percent: 10,
      field_agent_ec_commission_percent: 10,
      field_agent_sp_high_rating_bonus_percent: 5,
      field_agent_sp_rating_low_threshold: 3.0,
      field_agent_sp_rating_high_threshold: 4.5,
    });

    const faId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_wth_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });

    const cats = await categoriesRepo.listByTenantId(pool, TENANT_ZM);
    const catId = cats && cats[0] ? cats[0].id : null;
    const sub = `wth-${u}`.replace(/[^a-z0-9-]/gi, "").toLowerCase().slice(0, 36);

    const co = await companiesRepo.insertFull(pool, {
      tenantId: TENANT_ZM,
      subdomain: sub || `w${u.slice(-8)}`,
      name: "Co Wth",
      categoryId: catId,
      headline: "",
      about: "",
      services: "",
      phone: "",
      email: "",
      location: "",
      featuredCtaLabel: "Call us",
      featuredCtaPhone: "",
      yearsExperience: null,
      serviceAreas: "",
      hoursText: "",
      galleryJson: "[]",
      logoUrl: "",
      accountManagerFieldAgentId: faId,
      sourceFieldAgentSubmissionId: null,
    });

    const clientIns = await pool.query(
      `INSERT INTO public.intake_clients (tenant_id, client_code, phone_normalized)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [TENANT_ZM, `cli_wth_${u}`.slice(0, 32), `26097${u.replace(/\D/g, "").slice(0, 7)}`]
    );
    const clientId = clientIns.rows[0].id;

    const projRes = await pool.query(
      `INSERT INTO public.intake_client_projects (
         tenant_id, client_id, project_code, status, deal_price, deal_validation_status
       ) VALUES ($1, $2, $3, 'published', 1000, 'validated')
       RETURNING id`,
      [TENANT_ZM, clientId, `wth_prj_${u}`.slice(0, 40)]
    );
    const projectId = projRes.rows[0].id;

    const aRes = await pool.query(
      `INSERT INTO public.intake_project_assignments (
         tenant_id, project_id, company_id, status, deal_fee_recorded, responded_at, updated_at
       ) VALUES ($1, $2, $3, 'interested', true, now(), now())
       RETURNING id`,
      [TENANT_ZM, projectId, co.id]
    );
    const assignmentId = aRes.rows[0].id;

    await pool.query(
      `INSERT INTO public.intake_deal_reviews (tenant_id, project_id, assignment_id, reviewer_role, rating, body, created_at)
       VALUES ($1, $2, $3, 'client', 2, 'low', now())`,
      [TENANT_ZM, projectId, assignmentId]
    );

    const app = createTestApp(faId);
    const res = await request(app).get("/field-agent/dashboard").expect(200);
    const payload = parseSpPayablePayload(res.text);
    assert.ok(payload);
    assert.equal(payload.lowThresholdDisplay, "3.0");
    assert.equal(payload.highThresholdDisplay, "4.5");
    assert.equal(payload.qualityEligibilityLabel, "Withheld pending quality");
    assert.ok(Number(payload.withheldSpCommission30) > 0);
    assert.equal(payload.spRatingDisplay, "2.0");

    assert.match(res.text, /field-agent-ec-payable-summary--clickable/);
    const ecPayload = parseEcPayablePayload(res.text);
    assert.ok(ecPayload);
    assert.equal(ecPayload.lowThresholdDisplay, "3.0");
    assert.equal(ecPayload.highThresholdDisplay, "4.5");
    assert.equal(ecPayload.qualityEligibilityLabel, "Withheld pending quality");
    assert.equal(Number(ecPayload.withheldEcCommission30), 100);
    assert.notStrictEqual(ecPayload.earnedDisplay, ecPayload.payableDisplay);

    await pool.query(`DELETE FROM public.intake_deal_reviews WHERE tenant_id = $1 AND assignment_id = $2`, [
      TENANT_ZM,
      assignmentId,
    ]);
    await pool.query(`DELETE FROM public.intake_project_assignments WHERE id = $1`, [assignmentId]);
    await pool.query(`DELETE FROM public.intake_client_projects WHERE id = $1`, [projectId]);
    await pool.query(`DELETE FROM public.intake_clients WHERE id = $1`, [clientId]);
    await pool.query(`DELETE FROM public.companies WHERE id = $1`, [co.id]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [faId]);
    await restoreTenantZmDefaults(pool);
  }
);

test(
  "field-agent dashboard: SP payable JSON reflects high-rating bonus from tenant settings",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureTenantCommerceSettingsSchema(pool);
    await ensureCompaniesDirectoryFlagsSchema(pool);
    const u = `hib_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await tenantCommerceSettingsRepo.upsert(pool, TENANT_ZM, {
      currency: "ZMW",
      currency_name: "",
      currency_symbol: "K",
      deal_price_percentage: 3,
      minimum_credit_balance: 0,
      starting_credit_balance: 250,
      minimum_review_rating: 3,
      field_agent_sp_commission_percent: 10,
      field_agent_ec_commission_percent: 10,
      field_agent_sp_high_rating_bonus_percent: 5,
      field_agent_sp_rating_low_threshold: 2.5,
      field_agent_sp_rating_high_threshold: 4.0,
    });

    const faId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_hib_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });

    const cats = await categoriesRepo.listByTenantId(pool, TENANT_ZM);
    const catId = cats && cats[0] ? cats[0].id : null;
    const sub = `hib-${u}`.replace(/[^a-z0-9-]/gi, "").toLowerCase().slice(0, 36);

    const co = await companiesRepo.insertFull(pool, {
      tenantId: TENANT_ZM,
      subdomain: sub || `h${u.slice(-8)}`,
      name: "Co Hib",
      categoryId: catId,
      headline: "",
      about: "",
      services: "",
      phone: "",
      email: "",
      location: "",
      featuredCtaLabel: "Call us",
      featuredCtaPhone: "",
      yearsExperience: null,
      serviceAreas: "",
      hoursText: "",
      galleryJson: "[]",
      logoUrl: "",
      accountManagerFieldAgentId: faId,
      sourceFieldAgentSubmissionId: null,
    });

    const clientIns = await pool.query(
      `INSERT INTO public.intake_clients (tenant_id, client_code, phone_normalized)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [TENANT_ZM, `cli_hib_${u}`.slice(0, 32), `26096${u.replace(/\D/g, "").slice(0, 7)}`]
    );
    const clientId = clientIns.rows[0].id;

    const projRes = await pool.query(
      `INSERT INTO public.intake_client_projects (
         tenant_id, client_id, project_code, status, deal_price, deal_validation_status
       ) VALUES ($1, $2, $3, 'published', 1000, 'validated')
       RETURNING id`,
      [TENANT_ZM, clientId, `hib_prj_${u}`.slice(0, 40)]
    );
    const projectId = projRes.rows[0].id;

    const aRes = await pool.query(
      `INSERT INTO public.intake_project_assignments (
         tenant_id, project_id, company_id, status, deal_fee_recorded, responded_at, updated_at
       ) VALUES ($1, $2, $3, 'interested', true, now(), now())
       RETURNING id`,
      [TENANT_ZM, projectId, co.id]
    );
    const assignmentId = aRes.rows[0].id;

    await pool.query(
      `INSERT INTO public.intake_deal_reviews (tenant_id, project_id, assignment_id, reviewer_role, rating, body, created_at)
       VALUES ($1, $2, $3, 'client', 5, 'top', now())`,
      [TENANT_ZM, projectId, assignmentId]
    );

    const app = createTestApp(faId);
    const res = await request(app).get("/field-agent/dashboard").expect(200);
    const payload = parseSpPayablePayload(res.text);
    assert.ok(payload);
    assert.equal(payload.lowThresholdDisplay, "2.5");
    assert.equal(payload.highThresholdDisplay, "4.0");
    assert.equal(payload.qualityEligibilityLabel, "Eligible this period");
    assert.ok(Number(payload.highRatingBonusSpCommission30) > 0);
    assert.equal(payload.spRatingDisplay, "5.0");

    const ecPayload = parseEcPayablePayload(res.text);
    assert.ok(ecPayload);
    assert.equal(ecPayload.lowThresholdDisplay, "2.5");
    assert.equal(ecPayload.highThresholdDisplay, "4.0");
    assert.equal(ecPayload.qualityEligibilityLabel, "Eligible this period");
    assert.equal(Number(ecPayload.withheldEcCommission30), 0);
    assert.strictEqual(ecPayload.earnedDisplay, ecPayload.payableDisplay);

    await pool.query(`DELETE FROM public.intake_deal_reviews WHERE tenant_id = $1 AND assignment_id = $2`, [
      TENANT_ZM,
      assignmentId,
    ]);
    await pool.query(`DELETE FROM public.intake_project_assignments WHERE id = $1`, [assignmentId]);
    await pool.query(`DELETE FROM public.intake_client_projects WHERE id = $1`, [projectId]);
    await pool.query(`DELETE FROM public.intake_clients WHERE id = $1`, [clientId]);
    await pool.query(`DELETE FROM public.companies WHERE id = $1`, [co.id]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [faId]);
    await restoreTenantZmDefaults(pool);
  }
);

test(
  "field-agent dashboard: EC payable JSON no rating matches earned and tenant thresholds",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureTenantCommerceSettingsSchema(pool);
    const u = `nr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await tenantCommerceSettingsRepo.upsert(pool, TENANT_ZM, {
      currency: "ZMW",
      currency_name: "",
      currency_symbol: "K",
      deal_price_percentage: 3,
      minimum_credit_balance: 0,
      starting_credit_balance: 250,
      minimum_review_rating: 3,
      field_agent_sp_commission_percent: null,
      field_agent_ec_commission_percent: 10,
      field_agent_sp_high_rating_bonus_percent: null,
      field_agent_sp_rating_low_threshold: 2.8,
      field_agent_sp_rating_high_threshold: 4.2,
    });
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_nr_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const app = createTestApp(agentId);
    const res = await request(app).get("/field-agent/dashboard").expect(200);
    assert.match(res.text, /EC Commission \(30d\)/);
    const ecPayload = parseEcPayablePayload(res.text);
    assert.ok(ecPayload);
    assert.equal(ecPayload.spRatingDisplay, "—");
    assert.equal(ecPayload.qualityEligibilityLabel, "No quality adjustment this period");
    assert.equal(ecPayload.lowThresholdDisplay, "2.8");
    assert.equal(ecPayload.highThresholdDisplay, "4.2");
    assert.strictEqual(ecPayload.earnedDisplay, ecPayload.payableDisplay);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
    await restoreTenantZmDefaults(pool);
  }
);

test("field-agent-dashboard.js: payable breakdown modal includes static rule copy and no-rating note", () => {
  const p = path.join(__dirname, "..", "public", "field-agent-dashboard.js");
  const src = fs.readFileSync(p, "utf8");
  assert.match(
    src,
    /If SP_Rating \(30d\) is below the low threshold, payable SP commission is withheld/
  );
  assert.match(
    src,
    /If SP_Rating \(30d\) is at or above the high threshold, the configured high-rating bonus is included/
  );
  assert.match(src, /No SP_Rating \(30d\) yet/);
  assert.match(src, /Reporting estimate only — not payroll, settlement, or a payment promise/);
});

test("field-agent-dashboard.js: EC payable modal includes holdback rule and no EC bonus", () => {
  const p = path.join(__dirname, "..", "public", "field-agent-dashboard.js");
  const src = fs.readFileSync(p, "utf8");
  assert.match(
    src,
    /If SP_Rating \(30d\) is below the low threshold, EC commission is withheld for this rolling 30-day view/
  );
  assert.match(src, /EC commission payable does not include a high-rating bonus \(holdback only\)/);
});
