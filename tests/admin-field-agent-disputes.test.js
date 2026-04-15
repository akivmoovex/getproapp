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
const fieldAgentSubmissionsRepo = require("../src/db/pg/fieldAgentSubmissionsRepo");
const fieldAgentSubmissionAuditRepo = require("../src/db/pg/fieldAgentSubmissionAuditRepo");
const { TENANT_ZM, TENANT_IL } = require("../src/tenants/tenantIds");
const { ROLES } = require("../src/auth/roles");

async function getFirstAdminId(pool) {
  const r = await pool.query(`SELECT id FROM public.admin_users ORDER BY id ASC LIMIT 1`);
  return r.rows[0] ? Number(r.rows[0].id) : null;
}

function createApp(tenantId, adminUserId, role = ROLES.TENANT_MANAGER) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(express.json());
  app.use(
    session({
      secret: "admin_fa_disputes_test",
      resave: false,
      saveUninitialized: true,
      name: "adm_faa_disp_sid",
    })
  );
  app.use((req, res, next) => {
    req.session.adminUser = {
      id: adminUserId,
      role,
      tenantId,
    };
    res.locals.asset = () => "/styles.css";
    res.locals.bodyEmbedClass = "";
    res.locals.embed = false;
    res.locals.brandProductName = "Test";
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
  "correction: rejected → approved creates audit with correction metadata",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const adminId = await getFirstAdminId(pool);
    assert.ok(adminId);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_disp_ap_${tag}`,
      passwordHash: "x",
      displayName: "Disp Agent",
      phone: "",
    });
    const sid = await insertSubmission(pool, {
      tenantId: TENANT_ZM,
      fieldAgentId: fa,
      firstName: "D",
      lastName: "One",
      phone: "9011",
      status: "rejected",
    });
    const r = await fieldAgentSubmissionsRepo.correctFieldAgentSubmissionStatus(pool, {
      tenantId: TENANT_ZM,
      submissionId: sid,
      adminUserId: adminId,
      targetStatus: "approved",
      correctionReason: "Wrongly rejected — dispute resolved",
    });
    assert.equal(r.ok, true);
    const rows = await fieldAgentSubmissionAuditRepo.listAuditBySubmission(pool, TENANT_ZM, sid);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].action_type, "approve");
    assert.equal(rows[0].previous_status, "rejected");
    assert.equal(rows[0].new_status, "approved");
    assert.equal(rows[0].metadata.correction, true);
    assert.equal(rows[0].metadata.trigger, "manual_override");
    assert.match(String(rows[0].metadata.reason || ""), /dispute/i);

    await pool.query(`DELETE FROM public.field_agent_submission_audit WHERE submission_id = $1`, [sid]);
    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [sid]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [fa]);
  }
);

test(
  "correction: requires reason",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const adminId = await getFirstAdminId(pool);
    assert.ok(adminId);
    const r = await fieldAgentSubmissionsRepo.correctFieldAgentSubmissionStatus(pool, {
      tenantId: TENANT_ZM,
      submissionId: 1,
      adminUserId: adminId,
      targetStatus: "approved",
      correctionReason: "",
    });
    assert.equal(r.ok, false);
    assert.match(String(r.error || ""), /reason/i);
  }
);

test(
  "correction: same-state rejected",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const adminId = await getFirstAdminId(pool);
    assert.ok(adminId);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_disp_same_${tag}`,
      passwordHash: "x",
      displayName: "Disp Agent",
      phone: "",
    });
    const sid = await insertSubmission(pool, {
      tenantId: TENANT_ZM,
      fieldAgentId: fa,
      firstName: "D",
      lastName: "Same",
      phone: "9021",
      status: "pending",
    });
    const r = await fieldAgentSubmissionsRepo.correctFieldAgentSubmissionStatus(pool, {
      tenantId: TENANT_ZM,
      submissionId: sid,
      adminUserId: adminId,
      targetStatus: "pending",
      correctionReason: "noop",
    });
    assert.equal(r.ok, false);

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [sid]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [fa]);
  }
);

test(
  "correction: invalid edge rejected (appealed from pending)",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const adminId = await getFirstAdminId(pool);
    assert.ok(adminId);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_disp_inv_${tag}`,
      passwordHash: "x",
      displayName: "Disp Agent",
      phone: "",
    });
    const sid = await insertSubmission(pool, {
      tenantId: TENANT_ZM,
      fieldAgentId: fa,
      firstName: "D",
      lastName: "Inv",
      phone: "9031",
      status: "pending",
    });
    const r = await fieldAgentSubmissionsRepo.correctFieldAgentSubmissionStatus(pool, {
      tenantId: TENANT_ZM,
      submissionId: sid,
      adminUserId: adminId,
      targetStatus: "appealed",
      correctionReason: "should fail",
    });
    assert.equal(r.ok, false);

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [sid]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [fa]);
  }
);

test(
  "correction HTTP: tenant isolation and CSR blocked",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const adminId = await getFirstAdminId(pool);
    assert.ok(adminId);
    const appZm = createApp(TENANT_ZM, adminId, ROLES.TENANT_MANAGER);
    const appCsr = createApp(TENANT_ZM, adminId, ROLES.CSR);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const faIl = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_IL,
      username: `fa_disp_il_${tag}`,
      passwordHash: "x",
      displayName: "IL",
      phone: "",
    });
    const sidIl = await insertSubmission(pool, {
      tenantId: TENANT_IL,
      fieldAgentId: faIl,
      firstName: "I",
      lastName: "l",
      phone: "9041",
      status: "rejected",
    });

    await request(appCsr)
      .post(`/admin/field-agent-analytics/drilldown/submissions/${sidIl}/correct`)
      .send({ target_status: "approved", reason: "x" })
      .expect(403);

    const resZm = await request(appZm)
      .post(`/admin/field-agent-analytics/drilldown/submissions/${sidIl}/correct`)
      .send({ target_status: "approved", reason: "cross-tenant attempt" })
      .expect(400);
    assert.equal(resZm.body.ok, false);

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [sidIl]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [faIl]);
  }
);

test(
  "correction: detail panel shows correction UI for manager",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const adminId = await getFirstAdminId(pool);
    assert.ok(adminId);
    const app = createApp(TENANT_ZM, adminId, ROLES.TENANT_MANAGER);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_disp_ui_${tag}`,
      passwordHash: "x",
      displayName: "Disp Agent",
      phone: "",
    });
    const sid = await insertSubmission(pool, {
      tenantId: TENANT_ZM,
      fieldAgentId: fa,
      firstName: "D",
      lastName: "Ui",
      phone: "9051",
      status: "pending",
    });
    const res = await request(app).get(`/admin/field-agent-analytics/drilldown/submissions/${sid}/panel`).expect(200);
    const html = String(res.text || "");
    assert.ok(html.includes("data-faa-correction-form"));
    assert.ok(html.includes("Correction / dispute"));

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [sid]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [fa]);
  }
);

test(
  "correction HTTP: applies and audit lists correction flag",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const adminId = await getFirstAdminId(pool);
    assert.ok(adminId);
    const app = createApp(TENANT_ZM, adminId, ROLES.TENANT_MANAGER);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_disp_http_${tag}`,
      passwordHash: "x",
      displayName: "Disp Agent",
      phone: "",
    });
    const sid = await insertSubmission(pool, {
      tenantId: TENANT_ZM,
      fieldAgentId: fa,
      firstName: "D",
      lastName: "Http",
      phone: "9061",
      status: "rejected",
    });
    await request(app)
      .post(`/admin/field-agent-analytics/drilldown/submissions/${sid}/correct`)
      .send({ target_status: "approved", reason: "Dispute resolved via API test" })
      .expect(200)
      .expect("Content-Type", /json/);

    const panel = await request(app).get(`/admin/field-agent-analytics/drilldown/submissions/${sid}/panel`).expect(200);
    const html = String(panel.text || "");
    assert.ok(html.includes("Correction applied"));

    await pool.query(`DELETE FROM public.field_agent_submission_audit WHERE submission_id = $1`, [sid]);
    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [sid]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [fa]);
  }
);
