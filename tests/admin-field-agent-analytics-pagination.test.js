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
      secret: "admin_fa_analytics_pagination_test",
      resave: false,
      saveUninitialized: true,
      name: "adm_faa_pagination_sid",
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
  "submissions pagination keeps FIFO, filters, metadata and tenant scope",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const app = createApp(TENANT_ZM);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const faZm = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_page_sub_${tag}`,
      passwordHash: "x",
      displayName: "Sub Pager",
      phone: "",
    });
    const faIl = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_IL,
      username: `fa_page_sub_il_${tag}`,
      passwordHash: "x",
      displayName: "Sub IL",
      phone: "",
    });

    const ids = [];
    for (let i = 0; i < 5; i += 1) {
      const r = await pool.query(
        `
        INSERT INTO public.field_agent_provider_submissions
        (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, created_at, updated_at)
        VALUES ($1, $2, $3, 'Row', 'Plumber', 'Lusaka', $4, $4, '', '', '', '', '', '', '', '', '', '[]', 'pending', 0, '2026-04-01T09:00:00.000Z', now())
        RETURNING id
        `,
        [TENANT_ZM, faZm, `PageSub_${i + 1}`, `91${i}`]
      );
      ids.push(Number(r.rows[0].id));
    }
    const hidden = await pool.query(
      `
      INSERT INTO public.field_agent_provider_submissions
      (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, created_at, updated_at)
      VALUES ($1, $2, 'PageSub_Hidden', 'IL', 'Painter', 'Haifa', '9999', '9999', '', '', '', '', '', '', '', '', '', '[]', 'pending', 0, '2026-04-01T09:00:00.000Z', now())
      RETURNING id
      `,
      [TENANT_IL, faIl]
    );

    const p1 = await request(app)
      .get("/admin/field-agent-analytics/drilldown/submissions")
      .query({ bucket: "pending", page: 1, page_size: 2, q: "PageSub" })
      .expect(200);
    const b1 = String(p1.text || "");
    assert.ok(b1.includes("5 total"));
    assert.ok(b1.includes("1 / 3"));
    assert.ok(b1.includes(`>${ids[0]}<`));
    assert.ok(b1.includes(`>${ids[1]}<`));
    assert.ok(!b1.includes(`>${ids[2]}<`));
    assert.ok(!b1.includes("PageSub_Hidden"));
    assert.ok(b1.includes('data-faa-page-nav="next"'));

    const p2 = await request(app)
      .get("/admin/field-agent-analytics/drilldown/submissions")
      .query({ bucket: "pending", page: 2, page_size: 2, q: "PageSub" })
      .expect(200);
    const b2 = String(p2.text || "");
    assert.ok(b2.includes("2 / 3"));
    assert.ok(!b2.includes(`>${ids[0]}<`));
    assert.ok(!b2.includes(`>${ids[1]}<`));
    assert.ok(b2.includes(`>${ids[2]}<`));
    assert.ok(b2.includes(`>${ids[3]}<`));

    const invalid = await request(app)
      .get("/admin/field-agent-analytics/drilldown/submissions")
      .query({ bucket: "pending", page: -9, page_size: 999 })
      .expect(200);
    const bi = String(invalid.text || "");
    assert.ok(bi.includes("1 / 1"));
    assert.ok(bi.includes('data-faa-page-size="1"'));

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = ANY($1::int[])`, [[...ids, Number(hidden.rows[0].id)]]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = ANY($1::int[])`, [[faZm, faIl]]);
  }
);

test(
  "callback leads pagination keeps FIFO, filters and metadata",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const app = createApp(TENANT_ZM);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_page_cb_${tag}`,
      passwordHash: "x",
      displayName: "CB Pager",
      phone: "",
    });
    const ids = [];
    for (let i = 0; i < 4; i += 1) {
      const r = await pool.query(
        `
        INSERT INTO public.field_agent_callback_leads
        (tenant_id, field_agent_id, first_name, last_name, phone, email, location_city, created_at)
        VALUES ($1, $2, 'CallPage', $3, $4, $5, 'Lusaka', '2026-04-02T09:00:00.000Z')
        RETURNING id
        `,
        [TENANT_ZM, fa, `Row${i + 1}`, `81${i}`, `cb${i}@example.com`]
      );
      ids.push(Number(r.rows[0].id));
    }

    const p1 = await request(app)
      .get("/admin/field-agent-analytics/drilldown/callback-leads")
      .query({ bucket: "callback_leads", q: "CallPage", page: 1, page_size: 2 })
      .expect(200);
    const b1 = String(p1.text || "");
    assert.ok(b1.includes("4 total"));
    assert.ok(b1.includes("1 / 2"));
    assert.ok(b1.includes(`>${ids[0]}<`));
    assert.ok(b1.includes(`>${ids[1]}<`));
    assert.ok(!b1.includes(`>${ids[2]}<`));

    const p2 = await request(app)
      .get("/admin/field-agent-analytics/drilldown/callback-leads")
      .query({ bucket: "callback_leads", q: "CallPage", page: 2, page_size: 2 })
      .expect(200);
    const b2 = String(p2.text || "");
    assert.ok(b2.includes("2 / 2"));
    assert.ok(b2.includes(`>${ids[2]}<`));
    assert.ok(b2.includes(`>${ids[3]}<`));

    await pool.query(`DELETE FROM public.field_agent_callback_leads WHERE id = ANY($1::int[])`, [ids]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [fa]);
  }
);

test(
  "CSV export remains full filtered dataset regardless of page params",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const app = createApp(TENANT_ZM);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_page_csv_${tag}`,
      passwordHash: "x",
      displayName: "CSV Pager",
      phone: "",
    });
    const ids = [];
    for (let i = 0; i < 3; i += 1) {
      const r = await pool.query(
        `
        INSERT INTO public.field_agent_provider_submissions
        (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, created_at, updated_at)
        VALUES ($1, $2, 'CsvKeep', $3, 'Plumber', 'Lusaka', $4, $4, '', '', '', '', '', '', '', '', '', '[]', 'pending', 0, '2026-04-03T09:00:00.000Z', now())
        RETURNING id
        `,
        [TENANT_ZM, fa, `Row${i + 1}`, `71${i}`]
      );
      ids.push(Number(r.rows[0].id));
    }

    const res = await request(app)
      .get("/admin/field-agent-analytics/drilldown/submissions/export.csv")
      .query({ bucket: "pending", q: "CsvKeep", page: 2, page_size: 1 })
      .expect(200);
    const body = String(res.text || "");
    assert.ok(body.includes(`"${ids[0]}"`));
    assert.ok(body.includes(`"${ids[1]}"`));
    assert.ok(body.includes(`"${ids[2]}"`));

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = ANY($1::int[])`, [ids]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [fa]);
  }
);
