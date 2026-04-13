"use strict";

/**
 * SP_Commission (30d): tenant commerce percent, lead-fee sum repo, and manual recruitment commission separation.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const { normalizeCommerceRow, pickNullablePercent } = require("../src/tenants/tenantCommerceSettings");
const tenantCommerceSettingsRepo = require("../src/db/pg/tenantCommerceSettingsRepo");
const fieldAgentLeadFeeCommissionRepo = require("../src/db/pg/fieldAgentLeadFeeCommissionRepo");
const fieldAgentsRepo = require("../src/db/pg/fieldAgentsRepo");
const companiesRepo = require("../src/db/pg/companiesRepo");
const categoriesRepo = require("../src/db/pg/categoriesRepo");
const fieldAgentSubmissionsRepo = require("../src/db/pg/fieldAgentSubmissionsRepo");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const { ensureTenantCommerceSettingsSchema } = require("../src/db/pg/ensureTenantCommerceSettingsSchema");
const { ensureCompaniesDirectoryFlagsSchema } = require("../src/db/pg/ensureCompaniesDirectoryFlagsSchema");

test("pickNullablePercent: null and empty -> null", () => {
  assert.equal(pickNullablePercent(null), null);
  assert.equal(pickNullablePercent(""), null);
  assert.equal(pickNullablePercent("5"), 5);
});

test("normalizeCommerceRow: field_agent_sp_commission_percent", () => {
  const a = normalizeCommerceRow({ field_agent_sp_commission_percent: null });
  assert.equal(a.field_agent_sp_commission_percent, null);
  const b = normalizeCommerceRow({ field_agent_sp_commission_percent: 12.5 });
  assert.equal(b.field_agent_sp_commission_percent, 12.5);
});

test(
  "tenantCommerceSettingsRepo: upsert read/write field_agent_sp_commission_percent",
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
      field_agent_sp_commission_percent: 7.25,
    });
    const row = await tenantCommerceSettingsRepo.getByTenantId(pool, tid);
    assert.ok(row);
    assert.equal(Number(row.field_agent_sp_commission_percent), 7.25);
    const norm = normalizeCommerceRow(row);
    assert.equal(norm.field_agent_sp_commission_percent, 7.25);
    await tenantCommerceSettingsRepo.upsert(pool, tid, {
      currency: "ZMW",
      currency_name: "",
      currency_symbol: "",
      deal_price_percentage: 3,
      minimum_credit_balance: 0,
      starting_credit_balance: 250,
      minimum_review_rating: 3,
      field_agent_sp_commission_percent: null,
    });
    const cleared = await tenantCommerceSettingsRepo.getByTenantId(pool, tid);
    assert.equal(cleared.field_agent_sp_commission_percent, null);
  }
);

test(
  "fieldAgentLeadFeeCommissionRepo: sum 0 when no eligible rows; percent null behaves as 0 in formula",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCompaniesDirectoryFlagsSchema(pool);
    const faPct = null;
    const pctNum = faPct != null && Number.isFinite(Number(faPct)) ? Number(faPct) : 0;
    const sum = await fieldAgentLeadFeeCommissionRepo.sumDealPriceCollectedLastDaysForAccountManagerFieldAgent(
      pool,
      TENANT_ZM,
      999999001,
      30
    );
    assert.equal(sum, 0);
    const metric = Math.round(sum * (pctNum / 100) * 100) / 100;
    assert.equal(metric, 0);
  }
);

test(
  "fieldAgentLeadFeeCommissionRepo: only deal_fee_recorded + linked company + window",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCompaniesDirectoryFlagsSchema(pool);
    await ensureTenantCommerceSettingsSchema(pool);
    const u = `fasp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const faOwn = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_own_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const faOther = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_oth_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });

    const cats = await categoriesRepo.listByTenantId(pool, TENANT_ZM);
    const catId = cats && cats[0] ? cats[0].id : null;
    const subOwn = `fasp-own-${u}`.replace(/[^a-z0-9-]/gi, "").toLowerCase().slice(0, 36);
    const subOther = `fasp-oth-${u}`.replace(/[^a-z0-9-]/gi, "").toLowerCase().slice(0, 36);
    const subUnlinked = `fasp-unl-${u}`.replace(/[^a-z0-9-]/gi, "").toLowerCase().slice(0, 36);

    const coOwn = await companiesRepo.insertFull(pool, {
      tenantId: TENANT_ZM,
      subdomain: subOwn || `o${u.slice(-8)}`,
      name: "Linked Own",
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
      name: "Other FA",
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
    const coUnlinked = await companiesRepo.insertFull(pool, {
      tenantId: TENANT_ZM,
      subdomain: subUnlinked || `u${u.slice(-8)}`,
      name: "Unlinked",
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
      accountManagerFieldAgentId: null,
      sourceFieldAgentSubmissionId: null,
    });

    const clientIns = await pool.query(
      `INSERT INTO public.intake_clients (tenant_id, client_code, phone_normalized)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [TENANT_ZM, `cli_${u}`.slice(0, 32), `26099${u.replace(/\D/g, "").slice(0, 7)}`]
    );
    const clientId = clientIns.rows[0].id;

    const mkProject = async (codeSuffix, dealPrice) => {
      const r = await pool.query(
        `INSERT INTO public.intake_client_projects (
           tenant_id, client_id, project_code, status, deal_price, deal_validation_status
         ) VALUES ($1, $2, $3, 'published', $4, 'validated')
         RETURNING id`,
        [TENANT_ZM, clientId, `prj_${codeSuffix}`.slice(0, 40), dealPrice]
      );
      return r.rows[0].id;
    };

    const p1 = await mkProject(`${u}_a`, 100);
    const p2 = await mkProject(`${u}_b`, 200);
    const p3 = await mkProject(`${u}_c`, 50);

    await pool.query(
      `INSERT INTO public.intake_project_assignments (
         tenant_id, project_id, company_id, status, deal_fee_recorded, responded_at, updated_at
       ) VALUES ($1, $2, $3, 'interested', true, now(), now())`,
      [TENANT_ZM, p1, coOwn.id]
    );
    await pool.query(
      `INSERT INTO public.intake_project_assignments (
         tenant_id, project_id, company_id, status, deal_fee_recorded, responded_at, updated_at
       ) VALUES ($1, $2, $3, 'interested', true, now(), now())`,
      [TENANT_ZM, p2, coOtherFa.id]
    );
    await pool.query(
      `INSERT INTO public.intake_project_assignments (
         tenant_id, project_id, company_id, status, deal_fee_recorded, responded_at, updated_at
       ) VALUES ($1, $2, $3, 'interested', true, now(), now())`,
      [TENANT_ZM, p3, coUnlinked.id]
    );

    const oldResp = await pool.query(
      `INSERT INTO public.intake_client_projects (
         tenant_id, client_id, project_code, status, deal_price, deal_validation_status
       ) VALUES ($1, $2, $3, 'published', 999, 'validated')
       RETURNING id`,
      [TENANT_ZM, clientId, `prj_old_${u}`.slice(0, 36)]
    );
    const pOld = oldResp.rows[0].id;
    await pool.query(
      `INSERT INTO public.intake_project_assignments (
         tenant_id, project_id, company_id, status, deal_fee_recorded, responded_at, updated_at
       ) VALUES ($1, $2, $3, 'interested', true, now() - interval '40 days', now() - interval '40 days')`,
      [TENANT_ZM, pOld, coOwn.id]
    );

    const p4 = await mkProject(`${u}_d`, 77);
    await pool.query(
      `INSERT INTO public.intake_project_assignments (
         tenant_id, project_id, company_id, status, deal_fee_recorded, responded_at, updated_at
       ) VALUES ($1, $2, $3, 'declined', false, now(), now())`,
      [TENANT_ZM, p4, coOwn.id]
    );

    const sumOwn = await fieldAgentLeadFeeCommissionRepo.sumDealPriceCollectedLastDaysForAccountManagerFieldAgent(
      pool,
      TENANT_ZM,
      faOwn,
      30
    );
    assert.equal(sumOwn, 100);

    const sumOther = await fieldAgentLeadFeeCommissionRepo.sumDealPriceCollectedLastDaysForAccountManagerFieldAgent(
      pool,
      TENANT_ZM,
      faOther,
      30
    );
    assert.equal(sumOther, 200);

    const list = await fieldAgentLeadFeeCommissionRepo.listDealFeeChargesForAccountManagerFieldAgent(
      pool,
      TENANT_ZM,
      faOwn,
      { days: 30, limit: 10 }
    );
    assert.equal(list.length, 1);
    assert.equal(Number(list[0].deal_price), 100);

    await pool.query(`DELETE FROM public.intake_project_assignments WHERE tenant_id = $1 AND project_id = ANY($2::int[])`, [
      TENANT_ZM,
      [p1, p2, p3, pOld, p4],
    ]);
    await pool.query(`DELETE FROM public.intake_client_projects WHERE tenant_id = $1 AND id = ANY($2::int[])`, [
      TENANT_ZM,
      [p1, p2, p3, pOld, p4],
    ]);
    await pool.query(`DELETE FROM public.intake_clients WHERE id = $1`, [clientId]);
    await pool.query(`DELETE FROM public.companies WHERE id = ANY($1::int[])`, [[coOwn.id, coOtherFa.id, coUnlinked.id]]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = ANY($1::int[])`, [[faOwn, faOther]]);
  }
);

test(
  "fieldAgentSubmissionsRepo.sumCommissionLastDays unchanged (manual recruitment commission)",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_rc_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const phone = `2609712345${String(u).replace(/\D/g, "").slice(0, 4)}`;
    const subId = await fieldAgentSubmissionsRepo.insertSubmission(pool, null, {
      tenantId: TENANT_ZM,
      fieldAgentId: agentId,
      phoneRaw: phone,
      phoneNorm: phone,
      whatsappRaw: "",
      whatsappNorm: "",
      firstName: "X",
      lastName: "Y",
      profession: "Z",
      city: "C",
      pacra: "",
      addressStreet: "",
      addressLandmarks: "",
      addressNeighbourhood: "",
      addressCity: "C",
      nrcNumber: "N",
      photoProfileUrl: "",
      workPhotosJson: "[]",
    });
    await fieldAgentSubmissionsRepo.approveFieldAgentSubmission(pool, {
      tenantId: TENANT_ZM,
      submissionId: subId,
      commissionAmount: 42,
    });
    const s = await fieldAgentSubmissionsRepo.sumCommissionLastDays(pool, agentId, 30);
    assert.ok(s >= 42);
    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subId]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);
