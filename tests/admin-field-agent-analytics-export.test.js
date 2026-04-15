"use strict";

const path = require("path");
const express = require("express");
const session = require("express-session");
const request = require("supertest");

const test = require("node:test");
const assert = require("node:assert/strict");

const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const registerAdminFieldAgentAnalyticsRoutes = require("../src/routes/admin/adminFieldAgentAnalytics");
const fieldAgentsRepo = require("../src/db/pg/fieldAgentsRepo");
const { TENANT_ZM, TENANT_IL } = require("../src/tenants/tenantIds");
const { ROLES } = require("../src/auth/roles");

function createApp(tenantId) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(
    session({
      secret: "admin_fa_analytics_export_test",
      resave: false,
      saveUninitialized: true,
      name: "adm_faa_export_sid",
    })
  );
  app.use((req, res, next) => {
    req.session.adminUser = {
      id: 1,
      role: ROLES.TENANT_MANAGER,
      tenantId,
    };
    res.locals.asset = () => "/styles.css";
    res.locals.bodyEmbedClass = "";
    res.locals.embed = false;
    next();
  });
  const router = express.Router();
  registerAdminFieldAgentAnalyticsRoutes(router);
  app.use("/admin", router);
  return app;
}

function stripBom(s) {
  return String(s || "").replace(/^\uFEFF/, "");
}

test(
  "export submissions: tenant scoped, filtered, FIFO, headers and CSV safety",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const app = createApp(TENANT_ZM);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const faZm = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_exp_zm_${tag}`,
      passwordHash: "x",
      displayName: "Export ZM",
      phone: "",
    });
    const faIl = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_IL,
      username: `fa_exp_il_${tag}`,
      passwordHash: "x",
      displayName: "Export IL",
      phone: "",
    });

    const s1 = await pool.query(
      `
      INSERT INTO public.field_agent_provider_submissions
      (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, created_at, updated_at)
      VALUES ($1, $2, '=HACK', 'Alpha', 'Plumber', 'Lusaka', '8101', '8101', '', '', '', '', '', '', '', '', '', '[]', 'approved', 10, '2026-03-01T09:00:00.000Z', now())
      RETURNING id
      `,
      [TENANT_ZM, faZm]
    );
    const s2 = await pool.query(
      `
      INSERT INTO public.field_agent_provider_submissions
      (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, created_at, updated_at)
      VALUES ($1, $2, 'Findable', 'Beta', 'Electrician', 'Lusaka', '8102', '8102', '', '', '', '', '', '', '', '', '', '[]', 'approved', 12, '2026-03-01T09:00:00.000Z', now())
      RETURNING id
      `,
      [TENANT_ZM, faZm]
    );
    const s3 = await pool.query(
      `
      INSERT INTO public.field_agent_provider_submissions
      (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, created_at, updated_at)
      VALUES ($1, $2, 'Findable', 'Rejected', 'Painter', 'Lusaka', '8103', '8103', '', '', '', '', '', '', '', '', '', '[]', 'rejected', 0, '2026-03-01T09:00:00.000Z', now())
      RETURNING id
      `,
      [TENANT_ZM, faZm]
    );
    const sOtherTenant = await pool.query(
      `
      INSERT INTO public.field_agent_provider_submissions
      (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, created_at, updated_at)
      VALUES ($1, $2, 'Findable', 'IL', 'Painter', 'Haifa', '8104', '8104', '', '', '', '', '', '', '', '', '', '[]', 'approved', 10, '2026-03-01T09:00:00.000Z', now())
      RETURNING id
      `,
      [TENANT_IL, faIl]
    );

    const res = await request(app)
      .get("/admin/field-agent-analytics/drilldown/submissions/export.csv")
      .query({
        bucket: "approved",
        q: "Findable",
        status: "approved",
      })
      .expect(200);
    assert.match(String(res.headers["content-type"] || ""), /text\/csv/i);
    assert.match(String(res.headers["content-disposition"] || ""), /attachment/i);
    const body = stripBom(res.text);
    assert.ok(body.includes('"id","created_at","updated_at","status","field_agent_name","business_name","contact_name","phone","whatsapp","category_name","commission_amount","rejection_reason"'));
    assert.ok(body.includes('"Findable Beta"'));
    assert.ok(!body.includes("Rejected"));
    assert.ok(!body.includes('"Findable IL"'));
    assert.ok(body.includes(`"${s1.rows[0].id}"`) === false);
    assert.ok(body.includes(`"${s2.rows[0].id}"`));

    const i1 = body.indexOf(`"${s1.rows[0].id}"`);
    const i2 = body.indexOf(`"${s2.rows[0].id}"`);
    if (i1 >= 0 && i2 >= 0) assert.ok(i1 < i2);

    const safeRes = await request(app)
      .get("/admin/field-agent-analytics/drilldown/submissions/export.csv")
      .query({
        bucket: "approved",
      })
      .expect(200);
    const safeBody = stripBom(safeRes.text);
    assert.ok(safeBody.includes(`"'=HACK Alpha"`)); // CSV injection mitigation

    await request(app)
      .get("/admin/field-agent-analytics/drilldown/submissions/export.csv")
      .query({ bucket: "bad_bucket" })
      .expect(400);

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = ANY($1::int[])`, [
      [s1.rows[0].id, s2.rows[0].id, s3.rows[0].id, sOtherTenant.rows[0].id],
    ]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = ANY($1::int[])`, [[faZm, faIl]]);
  }
);

test(
  "export callback leads: tenant scoped, filtered, FIFO, headers",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const app = createApp(TENANT_ZM);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const faZm = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_cb_exp_zm_${tag}`,
      passwordHash: "x",
      displayName: "CB Export ZM",
      phone: "",
    });
    const faIl = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_IL,
      username: `fa_cb_exp_il_${tag}`,
      passwordHash: "x",
      displayName: "CB Export IL",
      phone: "",
    });
    const c1 = await pool.query(
      `
      INSERT INTO public.field_agent_callback_leads
      (tenant_id, field_agent_id, first_name, last_name, phone, email, location_city, created_at)
      VALUES ($1, $2, 'Call', 'Alpha', '9001', 'a@example.com', 'Lusaka', '2026-03-10T09:00:00.000Z')
      RETURNING id
      `,
      [TENANT_ZM, faZm]
    );
    const c2 = await pool.query(
      `
      INSERT INTO public.field_agent_callback_leads
      (tenant_id, field_agent_id, first_name, last_name, phone, email, location_city, created_at)
      VALUES ($1, $2, 'Call', 'Beta', '9002', 'b@example.com', 'Lusaka', '2026-03-10T09:00:00.000Z')
      RETURNING id
      `,
      [TENANT_ZM, faZm]
    );
    const c3 = await pool.query(
      `
      INSERT INTO public.field_agent_callback_leads
      (tenant_id, field_agent_id, first_name, last_name, phone, email, location_city, created_at)
      VALUES ($1, $2, 'Skip', 'Gamma', '9003', 'g@example.com', 'Ndola', '2026-03-11T09:00:00.000Z')
      RETURNING id
      `,
      [TENANT_ZM, faZm]
    );
    const c4 = await pool.query(
      `
      INSERT INTO public.field_agent_callback_leads
      (tenant_id, field_agent_id, first_name, last_name, phone, email, location_city, created_at)
      VALUES ($1, $2, 'Call', 'IL', '9004', 'il@example.com', 'Haifa', '2026-03-10T09:00:00.000Z')
      RETURNING id
      `,
      [TENANT_IL, faIl]
    );

    const res = await request(app)
      .get("/admin/field-agent-analytics/drilldown/callback-leads/export.csv")
      .query({ bucket: "callback_leads", q: "Call" })
      .expect(200);
    const body = stripBom(res.text);
    assert.ok(body.includes('"id","created_at","field_agent_name","contact_name","phone","email","city"'));
    assert.ok(body.includes('"Call Alpha"'));
    assert.ok(body.includes('"Call Beta"'));
    assert.ok(!body.includes('"Skip Gamma"'));
    assert.ok(!body.includes('"Call IL"'));
    assert.ok(body.indexOf(`"${c1.rows[0].id}"`) < body.indexOf(`"${c2.rows[0].id}"`));

    await request(app)
      .get("/admin/field-agent-analytics/drilldown/callback-leads/export.csv")
      .query({ bucket: "bad_bucket" })
      .expect(400);

    await pool.query(`DELETE FROM public.field_agent_callback_leads WHERE id = ANY($1::int[])`, [
      [c1.rows[0].id, c2.rows[0].id, c3.rows[0].id, c4.rows[0].id],
    ]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = ANY($1::int[])`, [[faZm, faIl]]);
  }
);

test(
  "export link is wired for supported drill-down list types",
  { skip: !isPgConfigured() },
  async () => {
    const app = createApp(TENANT_ZM);
    const sub = await request(app)
      .get("/admin/field-agent-analytics/drilldown/submissions")
      .query({ bucket: "pending", q: "abc", from: "2026-01-01", to: "2026-01-31", agent: "12" })
      .expect(200);
    const s = String(sub.text || "");
    assert.ok(s.includes('data-faa-export-csv="1"'));
    assert.ok(s.includes("/admin/field-agent-analytics/drilldown/submissions/export.csv?"));
    assert.ok(s.includes("bucket=pending"));
    assert.ok(s.includes("q=abc"));
    assert.ok(s.includes("from=2026-01-01"));
    assert.ok(s.includes("to=2026-01-31"));
    assert.ok(s.includes("agent=12"));

    const cb = await request(app)
      .get("/admin/field-agent-analytics/drilldown/callback-leads")
      .query({ bucket: "callback_leads", q: "xyz" })
      .expect(200);
    const c = String(cb.text || "");
    assert.ok(c.includes('data-faa-export-csv="1"'));
    assert.ok(c.includes("/admin/field-agent-analytics/drilldown/callback-leads/export.csv?"));
    assert.ok(c.includes("bucket=callback_leads"));
  }
);
