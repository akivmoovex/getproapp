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
      secret: "admin_fa_audit_test",
      resave: false,
      saveUninitialized: true,
      name: "adm_faa_audit_sid",
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

async function countAudits(pool, submissionId) {
  const r = await pool.query(`SELECT COUNT(*)::int AS c FROM public.field_agent_submission_audit WHERE submission_id = $1`, [
    submissionId,
  ]);
  return Number(r.rows[0].c) || 0;
}

test(
  "audit: approve creates row with statuses",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const adminId = await getFirstAdminId(pool);
    assert.ok(adminId, "need admin_users row for FK");
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_audit_ap_${tag}`,
      passwordHash: "x",
      displayName: "Audit Agent",
      phone: "",
    });
    const sid = await insertSubmission(pool, {
      tenantId: TENANT_ZM,
      fieldAgentId: fa,
      firstName: "Au",
      lastName: "Approve",
      phone: "8011",
      status: "pending",
    });
    const ok = await fieldAgentSubmissionsRepo.approveFieldAgentSubmission(pool, {
      tenantId: TENANT_ZM,
      submissionId: sid,
      commissionAmount: 0,
      auditContext: { adminUserId: adminId },
    });
    assert.equal(ok, true);
    const rows = await fieldAgentSubmissionAuditRepo.listAuditBySubmission(pool, TENANT_ZM, sid);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].action_type, "approve");
    assert.equal(rows[0].previous_status, "pending");
    assert.equal(rows[0].new_status, "approved");
    assert.equal(rows[0].admin_user_id, adminId);

    await pool.query(`DELETE FROM public.field_agent_submission_audit WHERE submission_id = $1`, [sid]);
    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [sid]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [fa]);
  }
);

test(
  "audit: reject stores reason in metadata",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const adminId = await getFirstAdminId(pool);
    assert.ok(adminId);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_audit_rj_${tag}`,
      passwordHash: "x",
      displayName: "Audit Agent",
      phone: "",
    });
    const sid = await insertSubmission(pool, {
      tenantId: TENANT_ZM,
      fieldAgentId: fa,
      firstName: "Au",
      lastName: "Reject",
      phone: "8021",
      status: "pending",
    });
    const ok = await fieldAgentSubmissionsRepo.rejectFieldAgentSubmission(pool, {
      tenantId: TENANT_ZM,
      submissionId: sid,
      rejectionReason: "Missing docs",
      auditContext: { adminUserId: adminId },
    });
    assert.equal(ok, true);
    const rows = await fieldAgentSubmissionAuditRepo.listAuditBySubmission(pool, TENANT_ZM, sid);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].action_type, "reject");
    assert.ok(rows[0].metadata && String(rows[0].metadata.reject_reason || "").includes("Missing"));

    await pool.query(`DELETE FROM public.field_agent_submission_audit WHERE submission_id = $1`, [sid]);
    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [sid]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [fa]);
  }
);

test(
  "audit: info_needed and appeal",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const adminId = await getFirstAdminId(pool);
    assert.ok(adminId);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_audit_tr_${tag}`,
      passwordHash: "x",
      displayName: "Audit Agent",
      phone: "",
    });
    const s1 = await insertSubmission(pool, {
      tenantId: TENANT_ZM,
      fieldAgentId: fa,
      firstName: "Au",
      lastName: "Info",
      phone: "8031",
      status: "pending",
    });
    assert.ok(
      await fieldAgentSubmissionsRepo.markFieldAgentSubmissionInfoNeeded(pool, {
        tenantId: TENANT_ZM,
        submissionId: s1,
        auditContext: { adminUserId: adminId },
      })
    );
    const s2 = await insertSubmission(pool, {
      tenantId: TENANT_ZM,
      fieldAgentId: fa,
      firstName: "Au",
      lastName: "Appeal",
      phone: "8032",
      status: "rejected",
    });
    assert.ok(
      await fieldAgentSubmissionsRepo.markFieldAgentSubmissionAppealed(pool, {
        tenantId: TENANT_ZM,
        submissionId: s2,
        auditContext: { adminUserId: adminId },
      })
    );
    const r1 = await fieldAgentSubmissionAuditRepo.listAuditBySubmission(pool, TENANT_ZM, s1);
    assert.equal(r1.length, 1);
    assert.equal(r1[0].action_type, "info_needed");
    const r2 = await fieldAgentSubmissionAuditRepo.listAuditBySubmission(pool, TENANT_ZM, s2);
    assert.equal(r2.length, 1);
    assert.equal(r2[0].action_type, "appeal");
    assert.equal(r2[0].previous_status, "rejected");
    assert.equal(r2[0].new_status, "appealed");

    await pool.query(`DELETE FROM public.field_agent_submission_audit WHERE submission_id = ANY($1::int[])`, [[s1, s2]]);
    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = ANY($1::int[])`, [[s1, s2]]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [fa]);
  }
);

test(
  "audit: bulk success writes one row per succeeded id",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const adminId = await getFirstAdminId(pool);
    assert.ok(adminId);
    const app = createApp(TENANT_ZM, adminId);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_audit_bk_${tag}`,
      passwordHash: "x",
      displayName: "Audit Agent",
      phone: "",
    });
    const a = await insertSubmission(pool, {
      tenantId: TENANT_ZM,
      fieldAgentId: fa,
      firstName: "B",
      lastName: "One",
      phone: "8041",
      status: "pending",
    });
    const b = await insertSubmission(pool, {
      tenantId: TENANT_ZM,
      fieldAgentId: fa,
      firstName: "B",
      lastName: "Two",
      phone: "8042",
      status: "pending",
    });
    const res = await request(app)
      .post("/admin/field-agent-analytics/drilldown/submissions/bulk-action")
      .send({ action: "approve", ids: [a, b] })
      .expect(200);
    assert.equal(res.body.succeeded, 2);
    assert.equal(await countAudits(pool, a), 1);
    assert.equal(await countAudits(pool, b), 1);

    await pool.query(`DELETE FROM public.field_agent_submission_audit WHERE submission_id = ANY($1::int[])`, [[a, b]]);
    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = ANY($1::int[])`, [[a, b]]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [fa]);
  }
);

test(
  "audit: no row when transition fails",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const adminId = await getFirstAdminId(pool);
    assert.ok(adminId);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_audit_fl_${tag}`,
      passwordHash: "x",
      displayName: "Audit Agent",
      phone: "",
    });
    const sid = await insertSubmission(pool, {
      tenantId: TENANT_ZM,
      fieldAgentId: fa,
      firstName: "F",
      lastName: "ail",
      phone: "8051",
      status: "pending",
    });
    const ok = await fieldAgentSubmissionsRepo.markFieldAgentSubmissionAppealed(pool, {
      tenantId: TENANT_ZM,
      submissionId: sid,
      auditContext: { adminUserId: adminId },
    });
    assert.equal(ok, false);
    assert.equal(await countAudits(pool, sid), 0);

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [sid]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [fa]);
  }
);

test(
  "audit: tenant isolation on list",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const adminId = await getFirstAdminId(pool);
    assert.ok(adminId);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_audit_iso_${tag}`,
      passwordHash: "x",
      displayName: "Audit Agent",
      phone: "",
    });
    const sid = await insertSubmission(pool, {
      tenantId: TENANT_ZM,
      fieldAgentId: fa,
      firstName: "I",
      lastName: "so",
      phone: "8061",
      status: "pending",
    });
    await fieldAgentSubmissionsRepo.approveFieldAgentSubmission(pool, {
      tenantId: TENANT_ZM,
      submissionId: sid,
      commissionAmount: 0,
      auditContext: { adminUserId: adminId },
    });
    const wrongTenant = await fieldAgentSubmissionAuditRepo.listAuditBySubmission(pool, TENANT_IL, sid);
    assert.equal(wrongTenant.length, 0);

    await pool.query(`DELETE FROM public.field_agent_submission_audit WHERE submission_id = $1`, [sid]);
    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [sid]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [fa]);
  }
);

test(
  "audit: detail panel includes history section when entries exist",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const adminId = await getFirstAdminId(pool);
    assert.ok(adminId);
    const app = createApp(TENANT_ZM, adminId);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_audit_ui_${tag}`,
      passwordHash: "x",
      displayName: "Audit Agent",
      phone: "",
    });
    const sid = await insertSubmission(pool, {
      tenantId: TENANT_ZM,
      fieldAgentId: fa,
      firstName: "U",
      lastName: "i",
      phone: "8071",
      status: "pending",
    });
    await fieldAgentSubmissionsRepo.approveFieldAgentSubmission(pool, {
      tenantId: TENANT_ZM,
      submissionId: sid,
      commissionAmount: 0,
      auditContext: { adminUserId: adminId },
    });
    const res = await request(app).get(`/admin/field-agent-analytics/drilldown/submissions/${sid}/panel`).expect(200);
    const html = String(res.text || "");
    assert.ok(html.includes("Action history"));
    assert.ok(html.includes("approve"));

    await pool.query(`DELETE FROM public.field_agent_submission_audit WHERE submission_id = $1`, [sid]);
    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [sid]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [fa]);
  }
);

test(
  "audit: ordering newest first for two events",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const adminId = await getFirstAdminId(pool);
    assert.ok(adminId);
    const tag = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_audit_ord_${tag}`,
      passwordHash: "x",
      displayName: "Audit Agent",
      phone: "",
    });
    const sid = await insertSubmission(pool, {
      tenantId: TENANT_ZM,
      fieldAgentId: fa,
      firstName: "O",
      lastName: "rd",
      phone: "8081",
      status: "pending",
    });
    await fieldAgentSubmissionsRepo.rejectFieldAgentSubmission(pool, {
      tenantId: TENANT_ZM,
      submissionId: sid,
      rejectionReason: "r1",
      auditContext: { adminUserId: adminId },
    });
    await fieldAgentSubmissionsRepo.markFieldAgentSubmissionAppealed(pool, {
      tenantId: TENANT_ZM,
      submissionId: sid,
      auditContext: { adminUserId: adminId },
    });
    const rows = await fieldAgentSubmissionAuditRepo.listAuditBySubmission(pool, TENANT_ZM, sid);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].action_type, "appeal");
    assert.equal(rows[1].action_type, "reject");

    await pool.query(`DELETE FROM public.field_agent_submission_audit WHERE submission_id = $1`, [sid]);
    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [sid]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [fa]);
  }
);
