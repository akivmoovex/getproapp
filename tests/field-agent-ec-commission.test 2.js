"use strict";

/**
 * EC_Commission (30d): tenant EC percent, distinct-project deal_price sum repo, and dashboard formula.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const path = require("path");
const express = require("express");
const session = require("express-session");
const request = require("supertest");

const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const { normalizeCommerceRow } = require("../src/tenants/tenantCommerceSettings");
const tenantCommerceSettingsRepo = require("../src/db/pg/tenantCommerceSettingsRepo");
const fieldAgentEcCommissionRepo = require("../src/db/pg/fieldAgentEcCommissionRepo");
const fieldAgentsRepo = require("../src/db/pg/fieldAgentsRepo");
const companiesRepo = require("../src/db/pg/companiesRepo");
const categoriesRepo = require("../src/db/pg/categoriesRepo");
const fieldAgentRoutes = require("../src/routes/fieldAgent");
const { setFieldAgentSession } = require("../src/auth/fieldAgentAuth");
const { TENANT_ZM, TENANT_DEMO } = require("../src/tenants/tenantIds");
const { ensureTenantCommerceSettingsSchema } = require("../src/db/pg/ensureTenantCommerceSettingsSchema");
const { ensureCompaniesDirectoryFlagsSchema } = require("../src/db/pg/ensureCompaniesDirectoryFlagsSchema");

function createTestApp(fieldAgentId) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "field_agent_ec_test",
      resave: false,
      saveUninitialized: true,
      name: "fa_ec_sid",
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
      username: "fa_ec_test",
      displayName: "",
    });
    next();
  });
  app.use(fieldAgentRoutes());
  return app;
}

test("normalizeCommerceRow: field_agent_ec_commission_percent", () => {
  const a = normalizeCommerceRow({ field_agent_ec_commission_percent: null });
  assert.equal(a.field_agent_ec_commission_percent, null);
  const b = normalizeCommerceRow({ field_agent_ec_commission_percent: 5 });
  assert.equal(b.field_agent_ec_commission_percent, 5);
});

test("normalizeCommerceRow: field_agent_sp_high_rating_bonus_percent", () => {
  const a = normalizeCommerceRow({ field_agent_sp_high_rating_bonus_percent: null });
  assert.equal(a.field_agent_sp_high_rating_bonus_percent, null);
  const b = normalizeCommerceRow({ field_agent_sp_high_rating_bonus_percent: 7.5 });
  assert.equal(b.field_agent_sp_high_rating_bonus_percent, 7.5);
});

test("normalizeCommerceRow: field_agent_sp_rating thresholds", () => {
  const a = normalizeCommerceRow({ field_agent_sp_rating_low_threshold: null, field_agent_sp_rating_high_threshold: null });
  assert.equal(a.field_agent_sp_rating_low_threshold, null);
  assert.equal(a.field_agent_sp_rating_high_threshold, null);
  const b = normalizeCommerceRow({ field_agent_sp_rating_low_threshold: 3, field_agent_sp_rating_high_threshold: 4.2 });
  assert.equal(b.field_agent_sp_rating_low_threshold, 3);
  assert.equal(b.field_agent_sp_rating_high_threshold, 4.2);
});

test(
  "tenantCommerceSettingsRepo: upsert read/write field_agent_sp_rating thresholds",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureTenantCommerceSettingsSchema(pool);
    const tid = TENANT_ZM;
    await tenantCommerceSettingsRepo.upsert(pool, tid, {
      currency: "ZMW",
      currency_name: "",
      currency_symbol: "",
      deal_price_percentage: 3,
      minimum_credit_balance: 0,
      starting_credit_balance: 250,
      minimum_review_rating: 3,
      field_agent_sp_commission_percent: null,
      field_agent_ec_commission_percent: null,
      field_agent_sp_high_rating_bonus_percent: null,
      field_agent_sp_rating_low_threshold: 2.8,
      field_agent_sp_rating_high_threshold: 4.2,
    });
    const row = await tenantCommerceSettingsRepo.getByTenantId(pool, tid);
    assert.equal(Number(row.field_agent_sp_rating_low_threshold), 2.8);
    assert.equal(Number(row.field_agent_sp_rating_high_threshold), 4.2);
    await tenantCommerceSettingsRepo.upsert(pool, tid, {
      currency: "ZMW",
      currency_name: "",
      currency_symbol: "",
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
    const cleared = await tenantCommerceSettingsRepo.getByTenantId(pool, tid);
    assert.equal(cleared.field_agent_sp_rating_low_threshold, null);
    assert.equal(cleared.field_agent_sp_rating_high_threshold, null);
  }
);

test(
  "tenantCommerceSettingsRepo: upsert rejects SP high rating when high < low",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureTenantCommerceSettingsSchema(pool);
    await assert.rejects(
      () =>
        tenantCommerceSettingsRepo.upsert(pool, TENANT_ZM, {
          currency: "ZMW",
          currency_name: "",
          currency_symbol: "",
          deal_price_percentage: 3,
          minimum_credit_balance: 0,
          starting_credit_balance: 250,
          minimum_review_rating: 3,
          field_agent_sp_commission_percent: null,
          field_agent_ec_commission_percent: null,
          field_agent_sp_high_rating_bonus_percent: null,
          field_agent_sp_rating_low_threshold: 4,
          field_agent_sp_rating_high_threshold: 3,
        }),
      /greater than or equal to the low threshold/
    );
  }
);

test(
  "tenantCommerceSettingsRepo: upsert read/write field_agent_sp_high_rating_bonus_percent",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureTenantCommerceSettingsSchema(pool);
    const tid = TENANT_ZM;
    await tenantCommerceSettingsRepo.upsert(pool, tid, {
      currency: "ZMW",
      currency_name: "",
      currency_symbol: "",
      deal_price_percentage: 3,
      minimum_credit_balance: 0,
      starting_credit_balance: 250,
      minimum_review_rating: 3,
      field_agent_sp_commission_percent: null,
      field_agent_ec_commission_percent: null,
      field_agent_sp_high_rating_bonus_percent: 5.25,
    });
    const row = await tenantCommerceSettingsRepo.getByTenantId(pool, tid);
    assert.equal(Number(row.field_agent_sp_high_rating_bonus_percent), 5.25);
    const norm = normalizeCommerceRow(row);
    assert.equal(norm.field_agent_sp_high_rating_bonus_percent, 5.25);
    await tenantCommerceSettingsRepo.upsert(pool, tid, {
      currency: "ZMW",
      currency_name: "",
      currency_symbol: "",
      deal_price_percentage: 3,
      minimum_credit_balance: 0,
      starting_credit_balance: 250,
      minimum_review_rating: 3,
      field_agent_sp_commission_percent: null,
      field_agent_ec_commission_percent: null,
      field_agent_sp_high_rating_bonus_percent: null,
    });
    const cleared = await tenantCommerceSettingsRepo.getByTenantId(pool, tid);
    assert.equal(cleared.field_agent_sp_high_rating_bonus_percent, null);
  }
);

test(
  "tenantCommerceSettingsRepo: upsert read/write field_agent_ec_commission_percent",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureTenantCommerceSettingsSchema(pool);
    const tid = TENANT_ZM;
    await tenantCommerceSettingsRepo.upsert(pool, tid, {
      currency: "ZMW",
      currency_name: "",
      currency_symbol: "",
      deal_price_percentage: 3,
      minimum_credit_balance: 0,
      starting_credit_balance: 250,
      minimum_review_rating: 3,
      field_agent_sp_commission_percent: null,
      field_agent_ec_commission_percent: 4.5,
    });
    const row = await tenantCommerceSettingsRepo.getByTenantId(pool, tid);
    assert.ok(row);
    assert.equal(Number(row.field_agent_ec_commission_percent), 4.5);
    const norm = normalizeCommerceRow(row);
    assert.equal(norm.field_agent_ec_commission_percent, 4.5);
    await tenantCommerceSettingsRepo.upsert(pool, tid, {
      currency: "ZMW",
      currency_name: "",
      currency_symbol: "",
      deal_price_percentage: 3,
      minimum_credit_balance: 0,
      starting_credit_balance: 250,
      minimum_review_rating: 3,
      field_agent_sp_commission_percent: null,
      field_agent_ec_commission_percent: null,
    });
    const cleared = await tenantCommerceSettingsRepo.getByTenantId(pool, tid);
    assert.equal(cleared.field_agent_ec_commission_percent, null);
  }
);

test(
  "fieldAgentEcCommissionRepo: sum 0 when no rows; percent null behaves as 0 in formula",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCompaniesDirectoryFlagsSchema(pool);
    const ecPct = null;
    const pctNum = ecPct != null && Number.isFinite(Number(ecPct)) ? Number(ecPct) : 0;
    const sum = await fieldAgentEcCommissionRepo.sumDistinctDealPriceProjectCreatedLastDaysForAccountManagerFieldAgent(
      pool,
      TENANT_ZM,
      999999002,
      30
    );
    assert.equal(sum, 0);
    const metric = Math.round(sum * (pctNum / 100) * 100) / 100;
    assert.equal(metric, 0);
  }
);

test(
  "fieldAgentEcCommissionRepo: attribution, NULL deal_price, window, dedupe, tenant isolation",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCompaniesDirectoryFlagsSchema(pool);
    await ensureTenantCommerceSettingsSchema(pool);
    const u = `faec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const faOwn = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_ec_own_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const faOther = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_ec_oth_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });

    const cats = await categoriesRepo.listByTenantId(pool, TENANT_ZM);
    const catId = cats && cats[0] ? cats[0].id : null;
    const subOwn = `faec-o-${u}`.replace(/[^a-z0-9-]/gi, "").toLowerCase().slice(0, 36);
    const subOther = `faec-t-${u}`.replace(/[^a-z0-9-]/gi, "").toLowerCase().slice(0, 36);

    const coOwn = await companiesRepo.insertFull(pool, {
      tenantId: TENANT_ZM,
      subdomain: subOwn || `o${u.slice(-8)}`,
      name: "EC Linked Own",
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
      accountManagerFieldAgentId: faOwn,
      sourceFieldAgentSubmissionId: null,
    });
    const coOtherFa = await companiesRepo.insertFull(pool, {
      tenantId: TENANT_ZM,
      subdomain: subOther || `t${u.slice(-8)}`,
      name: "EC Other FA",
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
      accountManagerFieldAgentId: faOther,
      sourceFieldAgentSubmissionId: null,
    });

    const clientIns = await pool.query(
      `INSERT INTO public.intake_clients (tenant_id, client_code, phone_normalized)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [TENANT_ZM, `cli_ec_${u}`.slice(0, 32), `26098${u.replace(/\D/g, "").slice(0, 7)}`]
    );
    const clientId = clientIns.rows[0].id;

    const pIncluded = (
      await pool.query(
        `INSERT INTO public.intake_client_projects (
           tenant_id, client_id, project_code, status, deal_price, deal_validation_status
         ) VALUES ($1, $2, $3, 'published', 100, 'validated')
         RETURNING id`,
        [TENANT_ZM, clientId, `prj_ec_${u}_in`.slice(0, 40)]
      )
    ).rows[0].id;

    const pDup = (
      await pool.query(
        `INSERT INTO public.intake_client_projects (
           tenant_id, client_id, project_code, status, deal_price, deal_validation_status
         ) VALUES ($1, $2, $3, 'published', 50, 'validated')
         RETURNING id`,
        [TENANT_ZM, clientId, `prj_ec_${u}_dup`.slice(0, 40)]
      )
    ).rows[0].id;

    const pNullPrice = (
      await pool.query(
        `INSERT INTO public.intake_client_projects (
           tenant_id, client_id, project_code, status, deal_price, deal_validation_status
         ) VALUES ($1, $2, $3, 'published', NULL, 'validated')
         RETURNING id`,
        [TENANT_ZM, clientId, `prj_ec_${u}_null`.slice(0, 40)]
      )
    ).rows[0].id;

    const pOtherFa = (
      await pool.query(
        `INSERT INTO public.intake_client_projects (
           tenant_id, client_id, project_code, status, deal_price, deal_validation_status
         ) VALUES ($1, $2, $3, 'published', 999, 'validated')
         RETURNING id`,
        [TENANT_ZM, clientId, `prj_ec_${u}_oth`.slice(0, 40)]
      )
    ).rows[0].id;

    const pOld = (
      await pool.query(
        `INSERT INTO public.intake_client_projects (
           tenant_id, client_id, project_code, status, deal_price, deal_validation_status, created_at
         ) VALUES ($1, $2, $3, 'published', 888, 'validated', now() - interval '40 days')
         RETURNING id`,
        [TENANT_ZM, clientId, `prj_ec_${u}_old`.slice(0, 40)]
      )
    ).rows[0].id;

    await pool.query(
      `INSERT INTO public.intake_project_assignments (
         tenant_id, project_id, company_id, status, deal_fee_recorded, responded_at, updated_at
       ) VALUES ($1, $2, $3, 'interested', false, now(), now())`,
      [TENANT_ZM, pIncluded, coOwn.id]
    );

    await pool.query(
      `INSERT INTO public.intake_project_assignments (
         tenant_id, project_id, company_id, status, deal_fee_recorded, responded_at, updated_at
       ) VALUES ($1, $2, $3, 'interested', false, now(), now())`,
      [TENANT_ZM, pDup, coOwn.id]
    );
    await pool.query(
      `INSERT INTO public.intake_project_assignments (
         tenant_id, project_id, company_id, status, deal_fee_recorded, responded_at, updated_at
       ) VALUES ($1, $2, $3, 'interested', false, now(), now())`,
      [TENANT_ZM, pDup, coOwn.id]
    );

    await pool.query(
      `INSERT INTO public.intake_project_assignments (
         tenant_id, project_id, company_id, status, deal_fee_recorded, responded_at, updated_at
       ) VALUES ($1, $2, $3, 'interested', false, now(), now())`,
      [TENANT_ZM, pNullPrice, coOwn.id]
    );

    await pool.query(
      `INSERT INTO public.intake_project_assignments (
         tenant_id, project_id, company_id, status, deal_fee_recorded, responded_at, updated_at
       ) VALUES ($1, $2, $3, 'interested', false, now(), now())`,
      [TENANT_ZM, pOtherFa, coOtherFa.id]
    );

    await pool.query(
      `INSERT INTO public.intake_project_assignments (
         tenant_id, project_id, company_id, status, deal_fee_recorded, responded_at, updated_at
       ) VALUES ($1, $2, $3, 'interested', false, now(), now())`,
      [TENANT_ZM, pOld, coOwn.id]
    );

    const sumOwn = await fieldAgentEcCommissionRepo.sumDistinctDealPriceProjectCreatedLastDaysForAccountManagerFieldAgent(
      pool,
      TENANT_ZM,
      faOwn,
      30
    );
    assert.equal(sumOwn, 150);

    const sumOther = await fieldAgentEcCommissionRepo.sumDistinctDealPriceProjectCreatedLastDaysForAccountManagerFieldAgent(
      pool,
      TENANT_ZM,
      faOther,
      30
    );
    assert.equal(sumOther, 999);

    const wrongTenant = await fieldAgentEcCommissionRepo.sumDistinctDealPriceProjectCreatedLastDaysForAccountManagerFieldAgent(
      pool,
      TENANT_DEMO,
      faOwn,
      30
    );
    assert.equal(wrongTenant, 0);

    const listOwn = await fieldAgentEcCommissionRepo.listDistinctEcCommissionProjectsForAccountManagerFieldAgent(
      pool,
      TENANT_ZM,
      faOwn,
      30
    );
    const ids = listOwn.map((r) => Number(r.project_id)).sort((a, b) => a - b);
    assert.deepEqual(ids, [pDup, pIncluded].sort((a, b) => a - b));
    const dupRow = listOwn.find((r) => Number(r.project_id) === pDup);
    assert.ok(dupRow);
    assert.equal(Number(dupRow.assignment_count), 2);

    await pool.query(`DELETE FROM public.intake_project_assignments WHERE tenant_id = $1 AND project_id = ANY($2::int[])`, [
      TENANT_ZM,
      [pIncluded, pDup, pNullPrice, pOtherFa, pOld],
    ]);
    await pool.query(`DELETE FROM public.intake_client_projects WHERE tenant_id = $1 AND id = ANY($2::int[])`, [
      TENANT_ZM,
      [pIncluded, pDup, pNullPrice, pOtherFa, pOld],
    ]);
    await pool.query(`DELETE FROM public.intake_clients WHERE id = $1`, [clientId]);
    await pool.query(`DELETE FROM public.companies WHERE id = ANY($1::int[])`, [[coOwn.id, coOtherFa.id]]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = ANY($1::int[])`, [[faOwn, faOther]]);
  }
);

test(
  "field-agent API: ec-commission-projects distinct projects + scoped",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCompaniesDirectoryFlagsSchema(pool);
    await ensureTenantCommerceSettingsSchema(pool);
    const u = `ecapi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const faOwn = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_ec_api_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const faOther = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_ec_api_o_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });

    const cats = await categoriesRepo.listByTenantId(pool, TENANT_ZM);
    const catId = cats && cats[0] ? cats[0].id : null;
    const subA = `ecapi-a-${u}`.replace(/[^a-z0-9-]/gi, "").toLowerCase().slice(0, 36);

    const coOwn = await companiesRepo.insertFull(pool, {
      tenantId: TENANT_ZM,
      subdomain: subA || `a${u.slice(-8)}`,
      name: "EC API Co",
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
      accountManagerFieldAgentId: faOwn,
      sourceFieldAgentSubmissionId: null,
    });

    const clientIns = await pool.query(
      `INSERT INTO public.intake_clients (tenant_id, client_code, phone_normalized)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [TENANT_ZM, `cli_ecapi_${u}`.slice(0, 32), `26097${u.replace(/\D/g, "").slice(0, 7)}`]
    );
    const clientId = clientIns.rows[0].id;

    const p1 = (
      await pool.query(
        `INSERT INTO public.intake_client_projects (
           tenant_id, client_id, project_code, status, deal_price, deal_validation_status
         ) VALUES ($1, $2, $3, 'published', 80, 'validated')
         RETURNING id`,
        [TENANT_ZM, clientId, `prj_ecapi_${u}_1`.slice(0, 40)]
      )
    ).rows[0].id;

    await pool.query(
      `INSERT INTO public.intake_project_assignments (
         tenant_id, project_id, company_id, status, deal_fee_recorded, responded_at, updated_at
       ) VALUES ($1, $2, $3, 'interested', false, now(), now()),
              ($1, $2, $3, 'interested', false, now(), now())`,
      [TENANT_ZM, p1, coOwn.id]
    );

    const appOwn = createTestApp(faOwn);
    const resOwn = await request(appOwn).get("/field-agent/api/ec-commission-projects").expect(200);
    assert.equal(resOwn.body.ok, true);
    assert.equal(resOwn.body.items.length, 1);
    assert.equal(Number(resOwn.body.items[0].project_id), p1);
    assert.equal(Number(resOwn.body.items[0].assignment_count), 2);
    assert.ok(resOwn.body.currency_code);

    const appOth = createTestApp(faOther);
    const resOth = await request(appOth).get("/field-agent/api/ec-commission-projects").expect(200);
    assert.equal(resOth.body.ok, true);
    assert.equal(resOth.body.items.length, 0);

    await pool.query(`DELETE FROM public.intake_project_assignments WHERE tenant_id = $1 AND project_id = $2`, [
      TENANT_ZM,
      p1,
    ]);
    await pool.query(`DELETE FROM public.intake_client_projects WHERE tenant_id = $1 AND id = $2`, [TENANT_ZM, p1]);
    await pool.query(`DELETE FROM public.intake_clients WHERE id = $1`, [clientId]);
    await pool.query(`DELETE FROM public.companies WHERE id = $1`, [coOwn.id]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = ANY($1::int[])`, [[faOwn, faOther]]);
  }
);

test(
  "field-agent dashboard: payable card includes high-rating bonus line and reporting copy",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureTenantCommerceSettingsSchema(pool);
    const u = `dash_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_dash_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
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
      field_agent_sp_high_rating_bonus_percent: 5,
      field_agent_sp_rating_low_threshold: 3.1,
      field_agent_sp_rating_high_threshold: 4.4,
    });
    const app = createTestApp(agentId);
    const res = await request(app).get("/field-agent/dashboard").expect(200);
    assert.match(res.text, /EC Commission \(30d\)/);
    assert.match(res.text, /Estimated payable EC commission \(30d\)/);
    assert.match(res.text, /field-agent-ec-payable-summary--clickable/);
    assert.match(res.text, /id="fa-ec-payable-breakdown-data"/);
    const ecPayloadMatch = res.text.match(/id="fa-ec-payable-breakdown-data"[^>]*>([\s\S]*?)<\/script>/);
    assert.ok(ecPayloadMatch, "embedded EC payable breakdown JSON");
    const ecPayload = JSON.parse(ecPayloadMatch[1].trim());
    assert.equal(ecPayload.lowThresholdDisplay, "3.1");
    assert.equal(ecPayload.highThresholdDisplay, "4.4");
    assert.match(res.text, /field-agent-sp-payable-summary--clickable/);
    assert.match(res.text, /id="fa-sp-payable-breakdown-data"/);
    const payloadMatch = res.text.match(/id="fa-sp-payable-breakdown-data"[^>]*>([\s\S]*?)<\/script>/);
    assert.ok(payloadMatch, "embedded SP payable breakdown JSON");
    const payload = JSON.parse(payloadMatch[1].trim());
    assert.equal(payload.lowThresholdDisplay, "3.1");
    assert.equal(payload.highThresholdDisplay, "4.4");
    assert.equal(payload.spRatingDisplay, "—");
    assert.equal(payload.qualityEligibilityLabel, "No quality adjustment this period");
    assert.match(res.text, /High-rating bonus \(est\.\)/);
    assert.match(res.text, /Reporting estimate only/);
    assert.match(res.text, /not payroll/);
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
      field_agent_sp_high_rating_bonus_percent: 5,
      field_agent_sp_rating_low_threshold: null,
      field_agent_sp_rating_high_threshold: null,
    });
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);
