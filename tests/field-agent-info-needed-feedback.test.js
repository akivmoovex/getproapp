"use strict";

/**
 * Info-needed feedback: DB columns, admin persistence, FA GET/PATCH reply/POST resubmit.
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
const fieldAgentSubmissionsRepo = require("../src/db/pg/fieldAgentSubmissionsRepo");
const { setFieldAgentSession } = require("../src/auth/fieldAgentAuth");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const { ensureFieldAgentSchema } = require("../src/db/pg/ensureFieldAgentSchema");
const fieldAgentSubmissionAuditRepo = require("../src/db/pg/fieldAgentSubmissionAuditRepo");

function makePhoneNorm(suffix) {
  const tail = String(suffix).replace(/\D/g, "").slice(0, 8).padStart(8, "0");
  return `26097${tail}`;
}

function createTestApp(fieldAgentId) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "fa_info_needed_test",
      resave: false,
      saveUninitialized: true,
      name: "fa_info_sid",
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
      username: "fa_info",
      displayName: "",
    });
    next();
  });
  app.use(fieldAgentRoutes());
  return app;
}

test(
  "info needed: admin message stored; FA reads, replies, resubmits to pending",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentSchema(pool);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_inf_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const otherFa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_other_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const p = makePhoneNorm(u);
    const subId = await fieldAgentSubmissionsRepo.insertSubmission(pool, null, {
      tenantId: TENANT_ZM,
      fieldAgentId: fa,
      phoneRaw: p,
      phoneNorm: p,
      whatsappRaw: "",
      whatsappNorm: "",
      firstName: "A",
      lastName: "B",
      profession: "Plumber",
      city: "Lusaka",
      pacra: "P",
      addressStreet: "S1",
      addressLandmarks: "LM1",
      addressNeighbourhood: "NH1",
      addressCity: "Lusaka",
      nrcNumber: "N1",
      photoProfileUrl: "",
      workPhotosJson: "[]",
    });

    const adminMsg = "Please upload clearer PACRA.";
    const okMark = await fieldAgentSubmissionsRepo.markFieldAgentSubmissionInfoNeeded(pool, {
      tenantId: TENANT_ZM,
      submissionId: subId,
      adminInfoRequest: adminMsg,
    });
    assert.equal(okMark, true);
    const rowAdmin = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, TENANT_ZM, subId);
    assert.equal(String(rowAdmin.status), "info_needed");
    assert.equal(String(rowAdmin.admin_info_request || "").trim(), adminMsg);

    const app = createTestApp(fa);
    const getRes = await request(app).get(`/field-agent/api/submissions/${subId}`).expect(200);
    assert.equal(getRes.body.submission.admin_info_request, adminMsg);
    assert.ok(Array.isArray(getRes.body.history));

    const editHtml = await request(app).get(`/field-agent/submissions/${subId}/edit`).expect(200);
    assert.match(String(editHtml.text || ""), /Admin comment/);
    assert.match(String(editHtml.text || ""), /Resubmit/);

    const patchRes = await request(app)
      .patch(`/field-agent/api/submissions/${subId}/reply`)
      .send({ message: "Will send tomorrow." })
      .expect(200);
    assert.match(String(patchRes.body.submission.field_agent_reply || ""), /Will send tomorrow/);

    const noopResubmit = await request(app)
      .post(`/field-agent/api/submissions/${subId}/resubmit`)
      .send({
        phone: p,
        whatsapp: "",
        first_name: "A",
        last_name: "B",
        profession: "Plumber",
        pacra: "P",
        address_street: "S1",
        address_landmarks: "LM1",
        address_neighbourhood: "NH1",
        address_city: "Lusaka",
        nrc_number: "N1",
        field_agent_reply: "Will send tomorrow.",
      })
      .expect(400);
    assert.match(String(noopResubmit.body.error || ""), /Update your contact details/);

    const resubmitBody = {
      phone: p,
      whatsapp: "",
      first_name: "A",
      last_name: "B",
      profession: "Plumber",
      pacra: "P2",
      address_street: "S2",
      address_landmarks: "LM1",
      address_neighbourhood: "NH1",
      address_city: "Lusaka",
      nrc_number: "N1",
      field_agent_reply: "Updated PACRA attached.",
    };
    const resubmit = await request(app).post(`/field-agent/api/submissions/${subId}/resubmit`).send(resubmitBody).expect(200);
    assert.equal(resubmit.body.submission.status, "pending");
    assert.equal(String(resubmit.body.submission.admin_info_request || ""), "");
    assert.match(String(resubmit.body.submission.field_agent_reply || ""), /Updated PACRA/);

    const appOther = createTestApp(otherFa);
    await request(appOther).get(`/field-agent/api/submissions/${subId}`).expect(404);

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subId]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = ANY($1::int[])`, [[fa, otherFa]]);
  }
);

test(
  "FA submission detail: moderation audit appears in history when present",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentSchema(pool);
    const adminRow = (await pool.query(`SELECT id FROM public.admin_users ORDER BY id ASC LIMIT 1`)).rows[0];
    assert.ok(adminRow, "need admin_users row for audit FK");
    const adminId = Number(adminRow.id);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_hist_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const p = makePhoneNorm(u);
    const subId = await fieldAgentSubmissionsRepo.insertSubmission(pool, null, {
      tenantId: TENANT_ZM,
      fieldAgentId: fa,
      phoneRaw: p,
      phoneNorm: p,
      whatsappRaw: "",
      whatsappNorm: "",
      firstName: "A",
      lastName: "B",
      profession: "Plumber",
      city: "Lusaka",
      pacra: "P",
      addressStreet: "S1",
      addressLandmarks: "LM1",
      addressNeighbourhood: "NH1",
      addressCity: "Lusaka",
      nrcNumber: "N1",
      photoProfileUrl: "",
      workPhotosJson: "[]",
    });
    await fieldAgentSubmissionAuditRepo.insertAuditRecord(pool, {
      tenantId: TENANT_ZM,
      submissionId: subId,
      adminUserId: adminId,
      actionType: "info_needed",
      previousStatus: "pending",
      newStatus: "info_needed",
      metadata: { info_request: "Audit-visible note for FA." },
    });

    const app = createTestApp(fa);
    const getRes = await request(app).get(`/field-agent/api/submissions/${subId}`).expect(200);
    assert.ok(Array.isArray(getRes.body.history));
    const joined = (getRes.body.history || []).map((h) => String(h.summary || "")).join(" ");
    assert.match(joined, /Audit-visible note/);

    await pool.query(`DELETE FROM public.field_agent_submission_audit WHERE submission_id = $1`, [subId]);
    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subId]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [fa]);
  }
);

test(
  "rejected: FA edit page, resubmit to pending, noop fails, other agent blocked",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureFieldAgentSchema(pool);
    const u = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_rej_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const otherFa = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: TENANT_ZM,
      username: `fa_rej_other_${u}`,
      passwordHash: "x",
      displayName: "",
      phone: "",
    });
    const p = makePhoneNorm(u);
    const subId = await fieldAgentSubmissionsRepo.insertSubmission(pool, null, {
      tenantId: TENANT_ZM,
      fieldAgentId: fa,
      phoneRaw: p,
      phoneNorm: p,
      whatsappRaw: "",
      whatsappNorm: "",
      firstName: "A",
      lastName: "B",
      profession: "Plumber",
      city: "Lusaka",
      pacra: "P",
      addressStreet: "S1",
      addressLandmarks: "LM1",
      addressNeighbourhood: "NH1",
      addressCity: "Lusaka",
      nrcNumber: "N1",
      photoProfileUrl: "",
      workPhotosJson: "[]",
    });
    const okRej = await fieldAgentSubmissionsRepo.rejectFieldAgentSubmission(pool, {
      tenantId: TENANT_ZM,
      submissionId: subId,
      rejectionReason: "Incomplete documents.",
    });
    assert.equal(okRej, true);

    const app = createTestApp(fa);
    const editHtml = await request(app).get(`/field-agent/submissions/${subId}/edit`).expect(200);
    assert.match(String(editHtml.text || ""), /Rejected/);
    assert.match(String(editHtml.text || ""), /Incomplete documents/);

    const getRes = await request(app).get(`/field-agent/api/submissions/${subId}`).expect(200);
    assert.equal(getRes.body.submission.status, "rejected");

    const baseBody = {
      phone: p,
      whatsapp: "",
      first_name: "A",
      last_name: "B",
      profession: "Plumber",
      pacra: "P",
      address_street: "S1",
      address_landmarks: "LM1",
      address_neighbourhood: "NH1",
      address_city: "Lusaka",
      nrc_number: "N1",
      field_agent_reply: "",
    };
    const noopResubmit = await request(app).post(`/field-agent/api/submissions/${subId}/resubmit`).send(baseBody).expect(400);
    assert.match(String(noopResubmit.body.error || ""), /Update your contact details/);

    const resubmitBody = { ...baseBody, pacra: "P2", field_agent_reply: "Please reconsider." };
    const resubmit = await request(app).post(`/field-agent/api/submissions/${subId}/resubmit`).send(resubmitBody).expect(200);
    assert.equal(resubmit.body.submission.status, "pending");
    assert.equal(String(resubmit.body.submission.rejection_reason || "").trim(), "");

    const appOther = createTestApp(otherFa);
    await request(appOther).get(`/field-agent/submissions/${subId}/edit`).expect(404);

    await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subId]);
    await pool.query(`DELETE FROM public.field_agents WHERE id = ANY($1::int[])`, [[fa, otherFa]]);
  }
);
