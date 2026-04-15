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
      secret: "admin_fa_analytics_detail_test",
      resave: false,
      saveUninitialized: true,
      name: "adm_faa_detail_sid",
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
  "admin field-agent analytics detail: submissions panel returns scoped record and hides cross-tenant",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const app = createApp(TENANT_ZM);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const faZm = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_det_sub_zm_${tag}`,
      passwordHash: "x",
      displayName: "ZM Field Agent",
      phone: "",
    });
    const faIl = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_IL,
      username: `fa_det_sub_il_${tag}`,
      passwordHash: "x",
      displayName: "IL Field Agent",
      phone: "",
    });

    const own = await pool.query(
      `
      INSERT INTO public.field_agent_provider_submissions
      (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, rejection_reason, created_at, updated_at)
      VALUES ($1, $2, 'Own_Sub', 'One', 'Plumber', 'Lusaka', '111', '111', '222', '222', 'PACRA-1', 'Street 1', '', '', 'Lusaka', 'NRC-1', '', '[]', 'approved', 99.5, '', now(), now())
      RETURNING id
      `,
      [TENANT_ZM, faZm]
    );
    const other = await pool.query(
      `
      INSERT INTO public.field_agent_provider_submissions
      (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, rejection_reason, created_at, updated_at)
      VALUES ($1, $2, 'Other_Sub', 'Two', 'Painter', 'Haifa', '333', '333', '', '', '', '', '', '', 'Haifa', '', '', '[]', 'rejected', 0, 'No docs', now(), now())
      RETURNING id
      `,
      [TENANT_IL, faIl]
    );

    const ok = await request(app)
      .get(`/admin/field-agent-analytics/drilldown/submissions/${own.rows[0].id}/panel`)
      .expect(200);
    const html = String(ok.text || "");
    assert.ok(html.includes("Submission #"));
    assert.ok(html.includes("Own_Sub"));
    assert.ok(html.includes("ZM Field Agent"));
    assert.ok(html.includes("Commission amount"));
    assert.ok(html.includes("Read-only drill-down detail."));
    assert.ok(html.includes('id="faa_detail_title"'));
    assert.ok(!html.includes("<form"));
    assert.ok(!html.includes("Approve submission"));
    assert.ok(!html.includes("Reject submission"));

    await request(app)
      .get(`/admin/field-agent-analytics/drilldown/submissions/${other.rows[0].id}/panel`)
      .expect(404);

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = ANY($1::int[])`, [
      [own.rows[0].id, other.rows[0].id],
    ]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = ANY($1::int[])`, [[faZm, faIl]]);
  }
);

test(
  "admin field-agent analytics detail: callback-lead panel returns scoped record and 404 for cross-tenant",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const app = createApp(TENANT_ZM);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const faZm = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_det_cb_zm_${tag}`,
      passwordHash: "x",
      displayName: "ZM Callback Agent",
      phone: "",
    });
    const faIl = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_IL,
      username: `fa_det_cb_il_${tag}`,
      passwordHash: "x",
      displayName: "IL Callback Agent",
      phone: "",
    });

    const own = await pool.query(
      `
      INSERT INTO public.field_agent_callback_leads
      (tenant_id, field_agent_id, first_name, last_name, phone, email, location_city, created_at)
      VALUES ($1, $2, 'Cb_Own', 'One', '111', 'own@example.com', 'Lusaka', now())
      RETURNING id
      `,
      [TENANT_ZM, faZm]
    );
    const other = await pool.query(
      `
      INSERT INTO public.field_agent_callback_leads
      (tenant_id, field_agent_id, first_name, last_name, phone, email, location_city, created_at)
      VALUES ($1, $2, 'Cb_Other', 'Two', '222', 'other@example.com', 'Haifa', now())
      RETURNING id
      `,
      [TENANT_IL, faIl]
    );

    const ok = await request(app)
      .get(`/admin/field-agent-analytics/drilldown/callback-leads/${own.rows[0].id}/panel`)
      .expect(200);
    const html = String(ok.text || "");
    assert.ok(html.includes("Callback lead #"));
    assert.ok(html.includes("Cb_Own"));
    assert.ok(html.includes("ZM Callback Agent"));
    assert.ok(html.includes("Read-only drill-down detail."));
    assert.ok(html.includes('id="faa_detail_title"'));
    assert.ok(!html.includes("<form"));
    assert.ok(!html.includes("Save"));

    await request(app)
      .get(`/admin/field-agent-analytics/drilldown/callback-leads/${other.rows[0].id}/panel`)
      .expect(404);

    await pool.query(`DELETE FROM public.field_agent_callback_leads WHERE id = ANY($1::int[])`, [
      [own.rows[0].id, other.rows[0].id],
    ]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = ANY($1::int[])`, [[faZm, faIl]]);
  }
);
