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
      secret: "admin_fa_analytics_inline_test",
      resave: false,
      saveUninitialized: true,
      name: "adm_faa_inline_sid",
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
  "inline actions UI hooks: submissions list shows action buttons; callback list does not",
  { skip: !isPgConfigured() },
  async () => {
    const app = createApp(TENANT_ZM);
    const subList = await request(app)
      .get("/admin/field-agent-analytics/drilldown/submissions")
      .query({ bucket: "pending" })
      .expect(200);
    const s = String(subList.text || "");
    assert.ok(s.includes('data-faa-feedback="1"'));
    assert.ok(s.includes('data-faa-inline-action="approve"'));
    assert.ok(s.includes('data-faa-inline-action="info_needed"'));
    assert.ok(s.includes('data-faa-inline-action="reject"'));
    assert.ok(s.includes('data-faa-inline-action="appeal"'));

    const cbList = await request(app)
      .get("/admin/field-agent-analytics/drilldown/callback-leads")
      .query({ bucket: "callback_leads" })
      .expect(200);
    const c = String(cbList.text || "");
    assert.ok(!c.includes('data-faa-inline-action="approve"'));
    assert.ok(!c.includes('data-faa-inline-action="reject"'));
  }
);

test(
  "inline approve via shared endpoint: valid id succeeds",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const app = createApp(TENANT_ZM);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_inline_ap_${tag}`,
      passwordHash: "x",
      displayName: "Inline Agent",
      phone: "",
    });
    const submissionId = await insertSubmission(pool, {
      tenantId: TENANT_ZM,
      fieldAgentId: fa,
      firstName: "In",
      lastName: "Approve",
      phone: "7111",
      status: "pending",
    });

    const res = await request(app)
      .post("/admin/field-agent-analytics/drilldown/submissions/bulk-action")
      .send({ action: "approve", ids: [submissionId] })
      .expect(200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.processed, 1);
    assert.equal(res.body.succeeded, 1);
    assert.equal(res.body.failed, 0);

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [submissionId]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [fa]);
  }
);

test(
  "inline reject via shared endpoint: reason required",
  { skip: !isPgConfigured() },
  async () => {
    const app = createApp(TENANT_ZM);
    await request(app)
      .post("/admin/field-agent-analytics/drilldown/submissions/bulk-action")
      .send({ action: "reject", ids: [123], reason: "" })
      .expect(400);
  }
);

test(
  "inline info_needed and appeal: valid transitions succeed and invalid fail safely",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const app = createApp(TENANT_ZM);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_inline_tr_${tag}`,
      passwordHash: "x",
      displayName: "Inline Agent",
      phone: "",
    });
    const pendingId = await insertSubmission(pool, {
      tenantId: TENANT_ZM,
      fieldAgentId: fa,
      firstName: "In",
      lastName: "Pending",
      phone: "7221",
      status: "pending",
    });
    const rejectedId = await insertSubmission(pool, {
      tenantId: TENANT_ZM,
      fieldAgentId: fa,
      firstName: "In",
      lastName: "Rejected",
      phone: "7222",
      status: "rejected",
    });

    const infoRes = await request(app)
      .post("/admin/field-agent-analytics/drilldown/submissions/bulk-action")
      .send({ action: "info_needed", ids: [pendingId], info_request: "Need updated photos." })
      .expect(200);
    assert.equal(infoRes.body.succeeded, 1);

    const appealRes = await request(app)
      .post("/admin/field-agent-analytics/drilldown/submissions/bulk-action")
      .send({ action: "appeal", ids: [pendingId] })
      .expect(200);
    assert.equal(appealRes.body.succeeded, 0);
    assert.equal(appealRes.body.failed, 1);

    const validAppealRes = await request(app)
      .post("/admin/field-agent-analytics/drilldown/submissions/bulk-action")
      .send({ action: "appeal", ids: [rejectedId] })
      .expect(200);
    assert.equal(validAppealRes.body.succeeded, 1);
    assert.equal(validAppealRes.body.failed, 0);

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = ANY($1::int[])`, [[pendingId, rejectedId]]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [fa]);
  }
);

test(
  "inline actions keep permission and tenant scoping enforced",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const appZm = createApp(TENANT_ZM);
    const appViewer = createApp(TENANT_ZM, ROLES.TENANT_VIEWER);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const faIl = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_IL,
      username: `fa_inline_il_${tag}`,
      passwordHash: "x",
      displayName: "Inline IL",
      phone: "",
    });
    const ilSubmissionId = await insertSubmission(pool, {
      tenantId: TENANT_IL,
      fieldAgentId: faIl,
      firstName: "IL",
      lastName: "Scope",
      phone: "7331",
      status: "pending",
    });

    const crossTenantRes = await request(appZm)
      .post("/admin/field-agent-analytics/drilldown/submissions/bulk-action")
      .send({ action: "approve", ids: [ilSubmissionId] })
      .expect(200);
    assert.equal(crossTenantRes.body.succeeded, 0);
    assert.equal(crossTenantRes.body.failed, 1);

    await request(appViewer)
      .post("/admin/field-agent-analytics/drilldown/submissions/bulk-action")
      .send({ action: "approve", ids: [ilSubmissionId] })
      .expect(403);

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [ilSubmissionId]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [faIl]);
  }
);
