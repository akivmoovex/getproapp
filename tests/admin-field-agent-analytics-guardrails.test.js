"use strict";

const path = require("path");
const express = require("express");
const session = require("express-session");
const request = require("supertest");

const test = require("node:test");
const assert = require("node:assert/strict");

const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const fieldAgentsRepo = require("../src/db/pg/fieldAgentsRepo");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const { ROLES } = require("../src/auth/roles");

function createApp(tenantId) {
  const routePath = path.join(__dirname, "..", "src", "routes", "admin", "adminFieldAgentAnalytics.js");
  delete require.cache[require.resolve(routePath)];
  const registerAdminFieldAgentAnalyticsRoutes = require(routePath);
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(express.json());
  app.use(
    session({
      secret: "admin_fa_analytics_guardrails_test",
      resave: false,
      saveUninitialized: true,
      name: "adm_faa_guard_sid",
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

test(
  "guardrails: page_size cap remains server-side enforced",
  { skip: !isPgConfigured() },
  async () => {
    const app = createApp(TENANT_ZM);
    const res = await request(app)
      .get("/admin/field-agent-analytics/drilldown/submissions")
      .query({ bucket: "pending", page_size: 9999 })
      .expect(200);
    const html = String(res.text || "");
    assert.ok(html.includes('data-faa-page-size="1"'));
    assert.ok(html.includes('<option value="100" selected'));
  }
);

test(
  "guardrails: oversized export rejected with clear message",
  { skip: !isPgConfigured() },
  async () => {
    process.env.FA_ANALYTICS_EXPORT_MAX_ROWS = "2";
    const pool = getPgPool();
    const app = createApp(TENANT_ZM);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_guard_exp_${tag}`,
      passwordHash: "x",
      displayName: "Guard Export",
      phone: "",
    });
    const ids = [];
    for (let i = 0; i < 3; i += 1) {
      const r = await pool.query(
        `
        INSERT INTO public.field_agent_provider_submissions
        (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, created_at, updated_at)
        VALUES ($1, $2, 'GuardExport', $3, 'Plumber', 'Lusaka', $4, $4, '', '', '', '', '', '', '', '', '', '[]', 'pending', 0, now(), now())
        RETURNING id
        `,
        [TENANT_ZM, fa, `Row${i + 1}`, `771${i}`]
      );
      ids.push(Number(r.rows[0].id));
    }
    const res = await request(app)
      .get("/admin/field-agent-analytics/drilldown/submissions/export.csv")
      .query({ bucket: "pending", q: "GuardExport" })
      .expect(413);
    const msg = String(res.text || "");
    assert.match(msg, /too large to run safely/i);
    assert.match(msg, /2 rows or fewer/i);
    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = ANY($1::int[])`, [ids]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [fa]);
    delete process.env.FA_ANALYTICS_EXPORT_MAX_ROWS;
  }
);

test(
  "guardrails: oversized bulk action rejected safely",
  { skip: !isPgConfigured() },
  async () => {
    process.env.FA_ANALYTICS_BULK_MAX_IDS = "2";
    const app = createApp(TENANT_ZM);
    const res = await request(app)
      .post("/admin/field-agent-analytics/drilldown/submissions/bulk-action")
      .send({ action: "approve", ids: [1, 2, 3] })
      .expect(413);
    assert.equal(res.body.ok, false);
    assert.match(String(res.body.error || ""), /Too many ids/i);
    delete process.env.FA_ANALYTICS_BULK_MAX_IDS;
  }
);

test(
  "guardrails: valid export still works unchanged under cap",
  { skip: !isPgConfigured() },
  async () => {
    process.env.FA_ANALYTICS_EXPORT_MAX_ROWS = "10";
    const pool = getPgPool();
    const app = createApp(TENANT_ZM);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_guard_ok_${tag}`,
      passwordHash: "x",
      displayName: "Guard OK",
      phone: "",
    });
    const r = await pool.query(
      `
      INSERT INTO public.field_agent_provider_submissions
      (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, created_at, updated_at)
      VALUES ($1, $2, 'GuardOk', 'One', 'Plumber', 'Lusaka', '8801', '8801', '', '', '', '', '', '', '', '', '', '[]', 'pending', 0, now(), now())
      RETURNING id
      `,
      [TENANT_ZM, fa]
    );
    const res = await request(app)
      .get("/admin/field-agent-analytics/drilldown/submissions/export.csv")
      .query({ bucket: "pending", q: "GuardOk" })
      .expect(200);
    assert.match(String(res.headers["content-type"] || ""), /text\/csv/i);
    assert.ok(String(res.text || "").includes("GuardOk One"));
    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [Number(r.rows[0].id)]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [fa]);
    delete process.env.FA_ANALYTICS_EXPORT_MAX_ROWS;
  }
);
