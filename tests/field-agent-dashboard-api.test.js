"use strict";

/**
 * Field-agent dashboard JSON API: tenant + ownership checks for list/detail drill-down.
 * Skips when PostgreSQL is not configured.
 */

const path = require("path");
const express = require("express");
const session = require("express-session");
const request = require("supertest");

const test = require("node:test");
const assert = require("node:assert/strict");

const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const fieldAgentRoutes = require("../src/routes/fieldAgent");
const fieldAgentsRepo = require("../src/db/pg/fieldAgentsRepo");
const fieldAgentSubmissionsRepo = require("../src/db/pg/fieldAgentSubmissionsRepo");
const companiesRepo = require("../src/db/pg/companiesRepo");
const categoriesRepo = require("../src/db/pg/categoriesRepo");
const { setFieldAgentSession } = require("../src/auth/fieldAgentAuth");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const { ensureCompaniesDirectoryFlagsSchema } = require("../src/db/pg/ensureCompaniesDirectoryFlagsSchema");

function makePhoneNorm(suffix) {
  const tail = String(suffix).replace(/\D/g, "").slice(0, 8).padStart(8, "0");
  return `26097${tail}`;
}

function createTestApp(fieldAgentId) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "field_agent_dash_api_test",
      resave: false,
      saveUninitialized: true,
      name: "fa_dash_api_sid",
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
      username: "fa_dash_api",
      displayName: "",
    });
    next();
  });
  app.use(fieldAgentRoutes());
  return app;
}

test(
  "field-agent repo: getSubmissionByIdForFieldAgent rejects other agent",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentA = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_own_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const agentB = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_other_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const p = makePhoneNorm(u);
    const subId = await fieldAgentSubmissionsRepo.insertSubmission(pool, null, {
      tenantId: TENANT_ZM,
      fieldAgentId: agentA,
      phoneRaw: p,
      phoneNorm: p,
      whatsappRaw: "",
      whatsappNorm: "",
      firstName: "A",
      lastName: "One",
      profession: "X",
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

    const own = await fieldAgentSubmissionsRepo.getSubmissionByIdForFieldAgent(pool, TENANT_ZM, agentA, subId);
    assert.ok(own);
    assert.equal(own.id, subId);

    const wrongAgent = await fieldAgentSubmissionsRepo.getSubmissionByIdForFieldAgent(pool, TENANT_ZM, agentB, subId);
    assert.equal(wrongAgent, null);

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subId]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = ANY($1::int[])`, [[agentA, agentB]]);
  }
);

test(
  "field-agent API: list by status and detail are scoped to session agent",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentA = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_list_a_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const agentB = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_list_b_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const pA = makePhoneNorm(`${u}_a`);
    const pB = makePhoneNorm(`${u}_b`);
    const subA = await fieldAgentSubmissionsRepo.insertSubmission(pool, null, {
      tenantId: TENANT_ZM,
      fieldAgentId: agentA,
      phoneRaw: pA,
      phoneNorm: pA,
      whatsappRaw: "",
      whatsappNorm: "",
      firstName: "Mine",
      lastName: "Pending",
      profession: "Plumber",
      city: "Lusaka",
      pacra: "",
      addressStreet: "",
      addressLandmarks: "",
      addressNeighbourhood: "",
      addressCity: "Lusaka",
      nrcNumber: "N1",
      photoProfileUrl: "",
      workPhotosJson: "[]",
    });
    const subB = await fieldAgentSubmissionsRepo.insertSubmission(pool, null, {
      tenantId: TENANT_ZM,
      fieldAgentId: agentB,
      phoneRaw: pB,
      phoneNorm: pB,
      whatsappRaw: "",
      whatsappNorm: "",
      firstName: "Other",
      lastName: "Agent",
      profession: "X",
      city: "C",
      pacra: "",
      addressStreet: "",
      addressLandmarks: "",
      addressNeighbourhood: "",
      addressCity: "C",
      nrcNumber: "N2",
      photoProfileUrl: "",
      workPhotosJson: "[]",
    });

    const app = createTestApp(agentA);

    const listRes = await request(app).get("/field-agent/api/submissions").query({ status: "pending" }).expect(200);
    assert.equal(listRes.body.ok, true);
    const ids = (listRes.body.items || []).map((r) => r.id);
    assert.ok(ids.includes(subA));
    assert.ok(!ids.includes(subB));

    const ownDetail = await request(app).get(`/field-agent/api/submissions/${subA}`).expect(200);
    assert.equal(ownDetail.body.ok, true);
    assert.equal(ownDetail.body.submission.id, subA);
    assert.ok(Array.isArray(ownDetail.body.history));

    const otherDetail = await request(app).get(`/field-agent/api/submissions/${subB}`).expect(404);
    assert.equal(otherDetail.body.ok, false);

    const badStatus = await request(app).get("/field-agent/api/submissions").query({ status: "not_a_status" }).expect(200);
    assert.deepEqual(badStatus.body.items, []);

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = ANY($1::int[])`, [[subA, subB]]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = ANY($1::int[])`, [[agentA, agentB]]);
  }
);

test("field-agent API: submissions JSON redirects when not signed in", async () => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.tenant = { id: TENANT_ZM, slug: "zm" };
    req.tenantUrlPrefix = "";
    next();
  });
  app.use(fieldAgentRoutes());
  const res = await request(app).get("/field-agent/api/submissions").query({ status: "pending" });
  assert.equal(res.status, 302);
  assert.match(res.headers.location || "", /field-agent\/login/);
});

test("field-agent API: linked-companies JSON redirects when not signed in", async () => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.tenant = { id: TENANT_ZM, slug: "zm" };
    req.tenantUrlPrefix = "";
    next();
  });
  app.use(fieldAgentRoutes());
  const res = await request(app).get("/field-agent/api/linked-companies");
  assert.equal(res.status, 302);
  assert.match(res.headers.location || "", /field-agent\/login/);
});

test(
  "field-agent API: linked-companies scoped to session field agent; empty when none",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCompaniesDirectoryFlagsSchema(pool);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentA = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_lc_a_${u}`,
      passwordHash: "x",
      displayName: "Agent A",
      phone: "",
    });
    const agentB = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_lc_b_${u}`,
      passwordHash: "x",
      displayName: "Agent B",
      phone: "",
    });
    const cats = await categoriesRepo.listByTenantId(pool, TENANT_ZM);
    const catId = cats && cats[0] ? cats[0].id : null;
    const sub = `lc-${u}`.replace(/[^a-z0-9-]/gi, "").toLowerCase().slice(0, 36);
    const company = await companiesRepo.insertFull(pool, {
      tenantId: TENANT_ZM,
      subdomain: sub || `lc${u.slice(-8)}`,
      name: "Linked Co",
      categoryId: catId,
      headline: "",
      about: "",
      services: "Plumbing",
      phone: "+260971111111",
      email: "x@test",
      location: "Lusaka",
      featuredCtaLabel: "Call us",
      featuredCtaPhone: "",
      yearsExperience: null,
      serviceAreas: "",
      hoursText: "",
      galleryJson: "[]",
      logoUrl: "",
      accountManagerFieldAgentId: agentA,
      sourceFieldAgentSubmissionId: null,
    });

    const appA = createTestApp(agentA);
    const resA = await request(appA).get("/field-agent/api/linked-companies").expect(200);
    assert.equal(resA.body.ok, true);
    assert.equal((resA.body.items || []).length, 1);
    assert.equal(resA.body.items[0].id, company.id);
    assert.equal(resA.body.items[0].name, "Linked Co");

    const appB = createTestApp(agentB);
    const resB = await request(appB).get("/field-agent/api/linked-companies").expect(200);
    assert.equal(resB.body.ok, true);
    assert.deepEqual(resB.body.items || [], []);

    await pool.query(`DELETE FROM public.companies WHERE id = $1`, [company.id]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = ANY($1::int[])`, [[agentA, agentB]]);
  }
);

test(
  "companiesRepo: enrichCompaniesWithAccountManagerLabels sets label from field_agents",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCompaniesDirectoryFlagsSchema(pool);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_enr_${u}`,
      passwordHash: "x",
      displayName: "Display FA",
      phone: "",
    });
    const raw = [
      {
        id: 1,
        account_manager_field_agent_id: agentId,
        name: "X",
      },
    ];
    const enriched = await companiesRepo.enrichCompaniesWithAccountManagerLabels(pool, TENANT_ZM, raw);
    assert.equal(enriched.length, 1);
    assert.equal(enriched[0].account_manager_field_agent_label, "Display FA");
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);

test("field-agent API: sp-commission-charges JSON redirects when not signed in", async () => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.tenant = { id: TENANT_ZM, slug: "zm" };
    req.tenantUrlPrefix = "";
    next();
  });
  app.use(fieldAgentRoutes());
  const res = await request(app).get("/field-agent/api/sp-commission-charges");
  assert.equal(res.status, 302);
  assert.match(res.headers.location || "", /field-agent\/login/);
});

test(
  "field-agent API: sp-commission-charges empty when no eligible assignments",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCompaniesDirectoryFlagsSchema(pool);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_sp_empty_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const app = createTestApp(agentId);
    const res = await request(app).get("/field-agent/api/sp-commission-charges").expect(200);
    assert.equal(res.body.ok, true);
    assert.deepEqual(res.body.items, []);
    assert.ok(typeof res.body.currency_code === "string");
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);

test(
  "field-agent API: sp-commission-charges scoped; deal_fee_recorded only; not other FA",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCompaniesDirectoryFlagsSchema(pool);
    const u = `spapi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const faOwn = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_sp_own_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const faOther = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_sp_oth_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });

    const cats = await categoriesRepo.listByTenantId(pool, TENANT_ZM);
    const catId = cats && cats[0] ? cats[0].id : null;
    const subOwn = `spapi-o-${u}`.replace(/[^a-z0-9-]/gi, "").toLowerCase().slice(0, 36);
    const subOth = `spapi-t-${u}`.replace(/[^a-z0-9-]/gi, "").toLowerCase().slice(0, 36);

    const coOwn = await companiesRepo.insertFull(pool, {
      tenantId: TENANT_ZM,
      subdomain: subOwn || `o${u.slice(-8)}`,
      name: "Co Own",
      categoryId: catId,
      headline: "",
      about: "",
      services: "",
      phone: "",
      email: "",
      location: "Lusaka",
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
    const coOther = await companiesRepo.insertFull(pool, {
      tenantId: TENANT_ZM,
      subdomain: subOth || `t${u.slice(-8)}`,
      name: "Co Other FA",
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
      [TENANT_ZM, `cli_sp_${u}`.slice(0, 32), `26099${u.replace(/\D/g, "").slice(0, 7)}`]
    );
    const clientId = clientIns.rows[0].id;

    const p1 = (
      await pool.query(
        `INSERT INTO public.intake_client_projects (
           tenant_id, client_id, project_code, status, deal_price, deal_validation_status
         ) VALUES ($1, $2, $3, 'published', 100, 'validated')
         RETURNING id`,
        [TENANT_ZM, clientId, `prj_sp_${u}_a`.slice(0, 40)]
      )
    ).rows[0].id;
    const p2 = (
      await pool.query(
        `INSERT INTO public.intake_client_projects (
           tenant_id, client_id, project_code, status, deal_price, deal_validation_status
         ) VALUES ($1, $2, $3, 'published', 200, 'validated')
         RETURNING id`,
        [TENANT_ZM, clientId, `prj_sp_${u}_b`.slice(0, 40)]
      )
    ).rows[0].id;
    const p3 = (
      await pool.query(
        `INSERT INTO public.intake_client_projects (
           tenant_id, client_id, project_code, status, deal_price, deal_validation_status
         ) VALUES ($1, $2, $3, 'published', 50, 'validated')
         RETURNING id`,
        [TENANT_ZM, clientId, `prj_sp_${u}_c`.slice(0, 40)]
      )
    ).rows[0].id;

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
      [TENANT_ZM, p2, coOther.id]
    );
    await pool.query(
      `INSERT INTO public.intake_project_assignments (
         tenant_id, project_id, company_id, status, deal_fee_recorded, responded_at, updated_at
       ) VALUES ($1, $2, $3, 'interested', false, now(), now())`,
      [TENANT_ZM, p3, coOwn.id]
    );

    const appOwn = createTestApp(faOwn);
    const resOwn = await request(appOwn).get("/field-agent/api/sp-commission-charges").expect(200);
    assert.equal(resOwn.body.ok, true);
    assert.equal(resOwn.body.items.length, 1);
    assert.equal(Number(resOwn.body.items[0].deal_price), 100);
    assert.equal(resOwn.body.items[0].company_name, "Co Own");

    const appOth = createTestApp(faOther);
    const resOth = await request(appOth).get("/field-agent/api/sp-commission-charges").expect(200);
    assert.equal(resOth.body.ok, true);
    assert.equal(resOth.body.items.length, 1);
    assert.equal(Number(resOth.body.items[0].deal_price), 200);

    await pool.query(`DELETE FROM public.intake_project_assignments WHERE tenant_id = $1 AND project_id = ANY($2::int[])`, [
      TENANT_ZM,
      [p1, p2, p3],
    ]);
    await pool.query(`DELETE FROM public.intake_client_projects WHERE tenant_id = $1 AND id = ANY($2::int[])`, [
      TENANT_ZM,
      [p1, p2, p3],
    ]);
    await pool.query(`DELETE FROM public.intake_clients WHERE id = $1`, [clientId]);
    await pool.query(`DELETE FROM public.companies WHERE id = ANY($1::int[])`, [[coOwn.id, coOther.id]]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = ANY($1::int[])`, [[faOwn, faOther]]);
  }
);
