"use strict";

/**
 * SP_Rating (30d): client intake_deal_reviews only; field-agent + tenant scope.
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
const companiesRepo = require("../src/db/pg/companiesRepo");
const categoriesRepo = require("../src/db/pg/categoriesRepo");
const fieldAgentSpRatingRepo = require("../src/db/pg/fieldAgentSpRatingRepo");
const { setFieldAgentSession } = require("../src/auth/fieldAgentAuth");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const { ensureCompaniesDirectoryFlagsSchema } = require("../src/db/pg/ensureCompaniesDirectoryFlagsSchema");

function createTestApp(fieldAgentId) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "fa_sp_rating_test",
      resave: false,
      saveUninitialized: true,
      name: "fa_sp_rating_sid",
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
      username: "fa_sp_rating",
      displayName: "",
    });
    next();
  });
  app.use(fieldAgentRoutes());
  return app;
}

test(
  "fieldAgentSpRatingRepo: avg null when no client reviews",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const v = await fieldAgentSpRatingRepo.getAvgRatingLastDaysForAccountManagerFieldAgent(
      pool,
      TENANT_ZM,
      999888001,
      30
    );
    assert.equal(v, null);
  }
);

test(
  "fieldAgentSpRatingRepo: AVG uses client rows only; excludes provider and other FA; 30d window",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCompaniesDirectoryFlagsSchema(pool);
    const u = `spr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const faOwn = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_spr_o_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const faOther = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_spr_t_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });

    const cats = await categoriesRepo.listByTenantId(pool, TENANT_ZM);
    const catId = cats && cats[0] ? cats[0].id : null;
    const subOwn = `spr-o-${u}`.replace(/[^a-z0-9-]/gi, "").toLowerCase().slice(0, 36);
    const subOth = `spr-t-${u}`.replace(/[^a-z0-9-]/gi, "").toLowerCase().slice(0, 36);

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
    const coOther = await companiesRepo.insertFull(pool, {
      tenantId: TENANT_ZM,
      subdomain: subOth || `t${u.slice(-8)}`,
      name: "Co Other",
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
      [TENANT_ZM, `cli_spr_${u}`.slice(0, 32), `26098${u.replace(/\D/g, "").slice(0, 7)}`]
    );
    const clientId = clientIns.rows[0].id;

    const insProj = async (code) => {
      const r = await pool.query(
        `INSERT INTO public.intake_client_projects (
           tenant_id, client_id, project_code, status, deal_validation_status
         ) VALUES ($1, $2, $3, 'closed', 'validated')
         RETURNING id`,
        [TENANT_ZM, clientId, code.slice(0, 40)]
      );
      return r.rows[0].id;
    };

    const p1 = await insProj(`spr_${u}_a`);
    const p2 = await insProj(`spr_${u}_b`);
    const p3 = await insProj(`spr_${u}_c`);
    const pOld = await insProj(`spr_${u}_old`);

    const insA = async (projectId, companyId) => {
      const r = await pool.query(
        `INSERT INTO public.intake_project_assignments (
           tenant_id, project_id, company_id, status, updated_at
         ) VALUES ($1, $2, $3, 'interested', now())
         RETURNING id`,
        [TENANT_ZM, projectId, companyId]
      );
      return r.rows[0].id;
    };

    const a1 = await insA(p1, coOwn.id);
    const a2 = await insA(p2, coOwn.id);
    const a3 = await insA(p3, coOther.id);
    const aOld = await insA(pOld, coOwn.id);

    await pool.query(
      `INSERT INTO public.intake_deal_reviews (tenant_id, project_id, assignment_id, reviewer_role, rating, body, created_at)
       VALUES ($1, $2, $3, 'client', 4, 'a', now())`,
      [TENANT_ZM, p1, a1]
    );
    await pool.query(
      `INSERT INTO public.intake_deal_reviews (tenant_id, project_id, assignment_id, reviewer_role, rating, body, created_at)
       VALUES ($1, $2, $3, 'client', 5, 'b', now())`,
      [TENANT_ZM, p2, a2]
    );
    await pool.query(
      `INSERT INTO public.intake_deal_reviews (tenant_id, project_id, assignment_id, reviewer_role, rating, body, created_at)
       VALUES ($1, $2, $3, 'provider', 1, 'p', now())`,
      [TENANT_ZM, p2, a2]
    );
    await pool.query(
      `INSERT INTO public.intake_deal_reviews (tenant_id, project_id, assignment_id, reviewer_role, rating, body, created_at)
       VALUES ($1, $2, $3, 'client', 2, 'other', now())`,
      [TENANT_ZM, p3, a3]
    );
    await pool.query(
      `INSERT INTO public.intake_deal_reviews (tenant_id, project_id, assignment_id, reviewer_role, rating, body, created_at)
       VALUES ($1, $2, $3, 'client', 1, 'old', now() - interval '40 days')`,
      [TENANT_ZM, pOld, aOld]
    );

    const avgOwn = await fieldAgentSpRatingRepo.getAvgRatingLastDaysForAccountManagerFieldAgent(pool, TENANT_ZM, faOwn, 30);
    assert.ok(avgOwn != null);
    assert.ok(Math.abs(Number(avgOwn) - 4.5) < 0.01);

    const avgOther = await fieldAgentSpRatingRepo.getAvgRatingLastDaysForAccountManagerFieldAgent(pool, TENANT_ZM, faOther, 30);
    assert.ok(avgOther != null);
    assert.equal(Number(avgOther), 2);

    const list = await fieldAgentSpRatingRepo.listRecentClientReviewsForAccountManagerFieldAgent(pool, TENANT_ZM, faOwn, {
      days: 30,
      limit: 20,
    });
    assert.equal(list.length, 2);

    const app = createTestApp(faOwn);
    const apiRes = await request(app).get("/field-agent/api/sp-rating-reviews").expect(200);
    assert.equal(apiRes.body.ok, true);
    assert.ok(apiRes.body.avg_rating != null);
    assert.ok(Math.abs(Number(apiRes.body.avg_rating) - 4.5) < 0.01);
    assert.equal(apiRes.body.items.length, 2);

    await pool.query(`DELETE FROM public.intake_deal_reviews WHERE tenant_id = $1 AND assignment_id = ANY($2::int[])`, [
      TENANT_ZM,
      [a1, a2, a3, aOld],
    ]);
    await pool.query(`DELETE FROM public.intake_project_assignments WHERE tenant_id = $1 AND project_id = ANY($2::int[])`, [
      TENANT_ZM,
      [p1, p2, p3, pOld],
    ]);
    await pool.query(`DELETE FROM public.intake_client_projects WHERE tenant_id = $1 AND id = ANY($2::int[])`, [
      TENANT_ZM,
      [p1, p2, p3, pOld],
    ]);
    await pool.query(`DELETE FROM public.intake_clients WHERE id = $1`, [clientId]);
    await pool.query(`DELETE FROM public.companies WHERE id = ANY($1::int[])`, [[coOwn.id, coOther.id]]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = ANY($1::int[])`, [[faOwn, faOther]]);
  }
);

test(
  "field-agent API: sp-rating-reviews ok with null avg and empty items when no data",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCompaniesDirectoryFlagsSchema(pool);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_spr_empty_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const app = createTestApp(agentId);
    const res = await request(app).get("/field-agent/api/sp-rating-reviews").expect(200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.avg_rating, null);
    assert.deepEqual(res.body.items, []);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
  }
);

test("field-agent API: sp-rating-reviews redirects when not signed in", async () => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.tenant = { id: TENANT_ZM, slug: "zm" };
    req.tenantUrlPrefix = "";
    next();
  });
  app.use(fieldAgentRoutes());
  const res = await request(app).get("/field-agent/api/sp-rating-reviews");
  assert.equal(res.status, 302);
  assert.match(res.headers.location || "", /field-agent\/login/);
});
