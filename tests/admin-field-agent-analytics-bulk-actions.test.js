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

function createApp(tenantId, role = ROLES.TENANT_MANAGER) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(express.json());
  app.use(
    session({
      secret: "admin_fa_analytics_bulk_test",
      resave: false,
      saveUninitialized: true,
      name: "adm_faa_bulk_sid",
    })
  );
  app.use((req, res, next) => {
    req.session.adminUser = {
      id: 1,
      role,
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

async function insertSubmission(pool, row) {
  const r = await pool.query(
    `
    INSERT INTO public.field_agent_provider_submissions
    (tenant_id, field_agent_id, first_name, last_name, profession, city, phone_raw, phone_norm, whatsapp_raw, whatsapp_norm, pacra, address_street, address_landmarks, address_neighbourhood, address_city, nrc_number, photo_profile_url, work_photos_json, status, commission_amount, created_at, updated_at)
    VALUES ($1, $2, $3, $4, 'Plumber', 'Lusaka', $5, $5, '', '', '', '', '', '', '', '', '', '[]', $6, 0, now(), now())
    RETURNING id
    `,
    [row.tenantId, row.fieldAgentId, row.firstName, row.lastName, row.phone, row.status]
  );
  return Number(r.rows[0].id);
}

test(
  "bulk actions: approve succeeds for valid ids; invalid states fail per-item",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const app = createApp(TENANT_ZM);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_bulk_ap_${tag}`,
      passwordHash: "x",
      displayName: "Bulk Agent",
      phone: "",
    });
    const sPending = await insertSubmission(pool, {
      tenantId: TENANT_ZM,
      fieldAgentId: fa,
      firstName: "Ap",
      lastName: "Pending",
      phone: "6011",
      status: "pending",
    });
    const sRejected = await insertSubmission(pool, {
      tenantId: TENANT_ZM,
      fieldAgentId: fa,
      firstName: "Ap",
      lastName: "Rejected",
      phone: "6012",
      status: "rejected",
    });

    const res = await request(app)
      .post("/admin/field-agent-analytics/drilldown/submissions/bulk-action")
      .send({ action: "approve", ids: [sPending, sRejected] })
      .expect(200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.processed, 2);
    assert.equal(res.body.succeeded, 1);
    assert.equal(res.body.failed, 1);
    assert.ok(Array.isArray(res.body.results));
    assert.ok(res.body.results.some((r) => Number(r.id) === sRejected && r.ok === false));

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = ANY($1::int[])`, [[sPending, sRejected]]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [fa]);
  }
);

test(
  "bulk actions: reject requires reason",
  { skip: !isPgConfigured() },
  async () => {
    const app = createApp(TENANT_ZM);
    const res = await request(app)
      .post("/admin/field-agent-analytics/drilldown/submissions/bulk-action")
      .send({ action: "reject", ids: [1, 2], reason: "" })
      .expect(400);
    assert.equal(res.body.ok, false);
    assert.match(String(res.body.error || ""), /Rejection reason is required/i);
  }
);

test(
  "bulk actions: info_needed and appeal follow valid transitions",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const app = createApp(TENANT_ZM);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_bulk_tr_${tag}`,
      passwordHash: "x",
      displayName: "Bulk Agent",
      phone: "",
    });
    const sPending = await insertSubmission(pool, {
      tenantId: TENANT_ZM,
      fieldAgentId: fa,
      firstName: "Tr",
      lastName: "Pending",
      phone: "6111",
      status: "pending",
    });
    const sRejected = await insertSubmission(pool, {
      tenantId: TENANT_ZM,
      fieldAgentId: fa,
      firstName: "Tr",
      lastName: "Rejected",
      phone: "6112",
      status: "rejected",
    });

    const rInfo = await request(app)
      .post("/admin/field-agent-analytics/drilldown/submissions/bulk-action")
      .send({ action: "info_needed", ids: [sPending, sRejected] })
      .expect(200);
    assert.equal(rInfo.body.succeeded, 1);
    assert.equal(rInfo.body.failed, 1);

    const rAppeal = await request(app)
      .post("/admin/field-agent-analytics/drilldown/submissions/bulk-action")
      .send({ action: "appeal", ids: [sRejected, sPending] })
      .expect(200);
    assert.equal(rAppeal.body.succeeded, 1);
    assert.equal(rAppeal.body.failed, 1);

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = ANY($1::int[])`, [[sPending, sRejected]]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [fa]);
  }
);

test(
  "bulk actions: cross-tenant ids fail safely per item",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const app = createApp(TENANT_ZM);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const faZm = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_bulk_zm_${tag}`,
      passwordHash: "x",
      displayName: "ZM Agent",
      phone: "",
    });
    const faIl = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_IL,
      username: `fa_bulk_il_${tag}`,
      passwordHash: "x",
      displayName: "IL Agent",
      phone: "",
    });
    const sZm = await insertSubmission(pool, {
      tenantId: TENANT_ZM,
      fieldAgentId: faZm,
      firstName: "Zm",
      lastName: "One",
      phone: "6211",
      status: "pending",
    });
    const sIl = await insertSubmission(pool, {
      tenantId: TENANT_IL,
      fieldAgentId: faIl,
      firstName: "Il",
      lastName: "Two",
      phone: "6212",
      status: "pending",
    });

    const res = await request(app)
      .post("/admin/field-agent-analytics/drilldown/submissions/bulk-action")
      .send({ action: "approve", ids: [sZm, sIl] })
      .expect(200);
    assert.equal(res.body.succeeded, 1);
    assert.equal(res.body.failed, 1);
    assert.ok(res.body.results.some((r) => Number(r.id) === sIl && r.ok === false));

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = ANY($1::int[])`, [[sZm, sIl]]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = ANY($1::int[])`, [[faZm, faIl]]);
  }
);

test(
  "bulk actions: permission gating blocks read-only users",
  { skip: !isPgConfigured() },
  async () => {
    const app = createApp(TENANT_ZM, ROLES.TENANT_VIEWER);
    await request(app)
      .post("/admin/field-agent-analytics/drilldown/submissions/bulk-action")
      .send({ action: "approve", ids: [1] })
      .expect(403);
  }
);

test(
  "bulk actions UI hooks: submissions list shows checkboxes/select-all/selected-count; callback list does not",
  { skip: !isPgConfigured() },
  async () => {
    const app = createApp(TENANT_ZM);
    const subList = await request(app)
      .get("/admin/field-agent-analytics/drilldown/submissions")
      .query({ bucket: "pending" })
      .expect(200);
    const s = String(subList.text || "");
    assert.ok(s.includes('data-faa-select-all="1"'));
    assert.ok(s.includes('data-faa-select-row="1"'));
    assert.ok(s.includes('id="faa_bulk_selected_count"'));
    assert.ok(s.includes('data-faa-bulk-action="approve"'));
    assert.ok(s.includes('data-faa-bulk-action="reject"'));

    const cbList = await request(app)
      .get("/admin/field-agent-analytics/drilldown/callback-leads")
      .query({ bucket: "callback_leads" })
      .expect(200);
    const c = String(cbList.text || "");
    assert.ok(!c.includes('data-faa-select-all="1"'));
    assert.ok(!c.includes('data-faa-select-row="1"'));
    assert.ok(!c.includes('id="faa_bulk_selected_count"'));
  }
);

test(
  "bulk actions flow: list keeps filter values in rendered UI",
  { skip: !isPgConfigured() },
  async () => {
    const app = createApp(TENANT_ZM);
    const res = await request(app)
      .get("/admin/field-agent-analytics/drilldown/submissions")
      .query({
        bucket: "pending",
        q: "FindX",
        status: "approved",
        from: "2026-01-01",
        to: "2026-01-31",
      })
      .expect(200);
    const html = String(res.text || "");
    assert.ok(html.includes('name="q"'));
    assert.ok(html.includes('value="FindX"'));
    assert.ok(html.includes('name="status"'));
    assert.ok(html.includes('value="approved" selected'));
    assert.ok(html.includes('name="from"'));
    assert.ok(html.includes('value="2026-01-01"'));
    assert.ok(html.includes('name="to"'));
    assert.ok(html.includes('value="2026-01-31"'));
  }
);
