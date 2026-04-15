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

function createApp(tenantId, adminId = 1) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(express.json());
  app.use(
    session({
      secret: "admin_fa_analytics_preset_test",
      resave: false,
      saveUninitialized: true,
      name: "adm_faa_preset_sid",
    })
  );
  app.use((req, res, next) => {
    req.session.adminUser = {
      id: adminId,
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

test(
  "presets: create + list + apply filter semantics",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const app = createApp(TENANT_ZM, 1);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_preset_${tag}`,
      passwordHash: "x",
      displayName: "Preset Agent",
      phone: "",
    });
    const s1 = await pool.query(
      `
      INSERT INTO public.field_agent_provider_submissions
      (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, created_at, updated_at)
      VALUES ($1, $2, 'PresetFind', 'One', 'Plumber', 'Lusaka', '9011', '9011', '', '', '', '', '', '', '', '', '', '[]', 'approved', 1, now(), now())
      RETURNING id
      `,
      [TENANT_ZM, fa]
    );
    const s2 = await pool.query(
      `
      INSERT INTO public.field_agent_provider_submissions
      (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, created_at, updated_at)
      VALUES ($1, $2, 'PresetOther', 'Two', 'Plumber', 'Lusaka', '9012', '9012', '', '', '', '', '', '', '', '', '', '[]', 'pending', 1, now(), now())
      RETURNING id
      `,
      [TENANT_ZM, fa]
    );

    const create = await request(app)
      .post("/admin/field-agent-analytics/presets")
      .send({
        name: `My Preset ${tag}`,
        record_type: "submissions",
        bucket: "total_submissions",
        filters: {
          q: "PresetFind",
          status: "approved",
          from: "2026-01-01",
          to: "2026-01-31",
          agent: String(fa),
          page_size: 25,
          page: 9,
        },
      })
      .expect(201);
    assert.equal(create.body.ok, true);
    assert.equal(create.body.preset.record_type, "submissions");
    assert.equal(create.body.preset.bucket, "total_submissions");
    assert.equal(String(create.body.preset.filters.page || ""), ""); // not persisted
    assert.equal(Number(create.body.preset.filters.page_size), 25);

    const listed = await request(app)
      .get("/admin/field-agent-analytics/presets")
      .query({ record_type: "submissions" })
      .expect(200);
    assert.equal(listed.body.ok, true);
    assert.ok(Array.isArray(listed.body.presets));
    const preset = listed.body.presets.find((p) => Number(p.id) === Number(create.body.preset.id));
    assert.ok(preset);

    const appliedList = await request(app)
      .get("/admin/field-agent-analytics/drilldown/submissions")
      .query({
        bucket: preset.bucket,
        q: preset.filters.q,
        status: preset.filters.status,
        from: preset.filters.from,
        to: preset.filters.to,
        agent: preset.filters.agent,
        page: 1,
        page_size: preset.filters.page_size,
      })
      .expect(200);
    const html = String(appliedList.text || "");
    assert.ok(html.includes("PresetFind"));
    assert.ok(!html.includes("PresetOther"));

    await pool.query(`DELETE FROM public.admin_field_agent_analytics_presets WHERE id = $1`, [create.body.preset.id]);
    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = ANY($1::int[])`, [[s1.rows[0].id, s2.rows[0].id]]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [fa]);
  }
);

test(
  "presets: rename and delete",
  { skip: !isPgConfigured() },
  async () => {
    const app = createApp(TENANT_ZM, 1);
    const create = await request(app)
      .post("/admin/field-agent-analytics/presets")
      .send({
        name: "Preset Rename Me",
        record_type: "callback_leads",
        bucket: "callback_leads",
        filters: { q: "x", page_size: 50 },
      })
      .expect(201);
    const id = Number(create.body.preset.id);

    const renamed = await request(app)
      .post(`/admin/field-agent-analytics/presets/${id}`)
      .send({ name: "Preset Renamed" })
      .expect(200);
    assert.equal(renamed.body.ok, true);
    assert.equal(renamed.body.preset.name, "Preset Renamed");

    await request(app)
      .post(`/admin/field-agent-analytics/presets/${id}/delete`)
      .expect(200);

    const listed = await request(app)
      .get("/admin/field-agent-analytics/presets")
      .query({ record_type: "callback_leads" })
      .expect(200);
    assert.ok(!listed.body.presets.some((p) => Number(p.id) === id));
  }
);

test(
  "presets: ownership/tenant scoping and invalid payload safety",
  { skip: !isPgConfigured() },
  async () => {
    const appA = createApp(TENANT_ZM, 1);
    const appB = createApp(TENANT_ZM, 2);
    const appOtherTenant = createApp(TENANT_IL, 1);

    const created = await request(appA)
      .post("/admin/field-agent-analytics/presets")
      .send({
        name: "Scoped Preset",
        record_type: "submissions",
        bucket: "pending",
        filters: { q: "scope" },
      })
      .expect(201);
    const id = Number(created.body.preset.id);

    await request(appB)
      .post(`/admin/field-agent-analytics/presets/${id}`)
      .send({ name: "Should Fail" })
      .expect(404);
    await request(appB)
      .post(`/admin/field-agent-analytics/presets/${id}/delete`)
      .expect(404);

    const listOtherTenant = await request(appOtherTenant)
      .get("/admin/field-agent-analytics/presets")
      .query({ record_type: "submissions" })
      .expect(200);
    assert.ok(!listOtherTenant.body.presets.some((p) => Number(p.id) === id));

    await request(appA)
      .post("/admin/field-agent-analytics/presets")
      .send({
        name: "Bad RT",
        record_type: "bad",
        bucket: "pending",
        filters: {},
      })
      .expect(400);
    await request(appA)
      .post("/admin/field-agent-analytics/presets")
      .send({
        name: "Bad Bucket",
        record_type: "submissions",
        bucket: "bad_bucket",
        filters: {},
      })
      .expect(400);

    await request(appA).post(`/admin/field-agent-analytics/presets/${id}/delete`).expect(200);
  }
);

test(
  "drilldown list still renders without preset usage",
  { skip: !isPgConfigured() },
  async () => {
    const app = createApp(TENANT_ZM, 1);
    const res = await request(app)
      .get("/admin/field-agent-analytics/drilldown/submissions")
      .query({ bucket: "pending" })
      .expect(200);
    const html = String(res.text || "");
    assert.ok(html.includes('data-faa-preset-save="1"'));
    assert.ok(html.includes("Saved views"));
  }
);
