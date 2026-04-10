"use strict";

/**
 * PostgreSQL integration tests for Field Agent provider moderation (repo + HTTP).
 * HTTP suite: supertest against a minimal Express app mounting production `adminRoutes` with
 * memory sessions and POST /admin/login (tenant_manager / tenant_viewer / super_admin seeds).
 * Skips when DATABASE_URL / GETPRO_DATABASE_URL is unset (CI without DB).
 * Requires schema: db/postgres/000_full_schema.sql + db/postgres/002_field_agent.sql
 */

const path = require("path");
const express = require("express");
const session = require("express-session");
const request = require("supertest");

const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

const { runBootstrap, resetBootstrapForTests } = require("../src/startup/bootstrap");
const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const { ROLES } = require("../src/auth/roles");
const { db } = require("../src/db");
const adminRoutes = require("../src/routes/admin");
const adminUsersRepo = require("../src/db/pg/adminUsersRepo");
const fieldAgentsRepo = require("../src/db/pg/fieldAgentsRepo");
const fieldAgentSubmissionsRepo = require("../src/db/pg/fieldAgentSubmissionsRepo");
const fieldAgentCallbackLeadsRepo = require("../src/db/pg/fieldAgentCallbackLeadsRepo");
const { createCrmTaskFromEvent } = require("../src/crm/crmAutoTasks");
const { authenticateFieldAgent } = require("../src/auth/fieldAgentAuth");
const { TENANT_ZM, TENANT_IL } = require("../src/tenants/tenantIds");

function uniq() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function makePhoneNorm(u) {
  const digits = String(u).replace(/\D/g, "");
  const tail = (digits + "12345678").slice(0, 8);
  return `26097${tail}`;
}

/** Minimal Express app matching production `/admin` mounting (session + tenant stub for login render). */
function createModerationHttpApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "field_agent_http_integration_secret",
      resave: false,
      saveUninitialized: false,
      name: "fa_http_it_sid",
    })
  );
  app.use((req, res, next) => {
    req.tenant = { id: TENANT_ZM, slug: "zm" };
    req.tenantUrlPrefix = "";
    next();
  });
  app.use("/admin", adminRoutes({ db }));
  return app;
}

async function adminLoginAgent(app, username, password) {
  const agent = request.agent(app);
  await agent.post("/admin/login").type("form").send({ username, password }).expect(302);
  return agent;
}

async function countCommentsForTask(pool, taskId) {
  const r = await pool.query(`SELECT COUNT(*)::int AS c FROM public.crm_task_comments WHERE task_id = $1`, [taskId]);
  return r.rows[0].c;
}

async function countAuditForTask(pool, taskId) {
  const r = await pool.query(`SELECT COUNT(*)::int AS c FROM public.crm_audit_logs WHERE task_id = $1`, [taskId]);
  return r.rows[0].c;
}

async function countCrmTasksForTenant(pool, tenantId) {
  const r = await pool.query(`SELECT COUNT(*)::int AS c FROM public.crm_tasks WHERE tenant_id = $1`, [tenantId]);
  return r.rows[0].c;
}

async function insertCrmTaskRaw(pool, { tenantId, title, sourceType, sourceRefId }) {
  const r = await pool.query(
    `
    INSERT INTO public.crm_tasks (tenant_id, title, description, status, attachment_url, source_type, source_ref_id)
    VALUES ($1, $2, $3, 'new', '', $4, $5)
    RETURNING id
    `,
    [tenantId, title, "http-test", sourceType, sourceRefId]
  );
  return Number(r.rows[0].id);
}

async function insertProviderSubmission(pool, { tenantId, fieldAgentId, phoneNorm }) {
  return fieldAgentSubmissionsRepo.insertSubmission(pool, null, {
    tenantId,
    fieldAgentId,
    phoneRaw: phoneNorm,
    phoneNorm,
    whatsappRaw: "",
    whatsappNorm: "",
    firstName: "Http",
    lastName: "Test",
    profession: "X",
    city: "Lusaka",
    pacra: "P",
    addressStreet: "S",
    addressLandmarks: "",
    addressNeighbourhood: "",
    addressCity: "Lusaka",
    nrcNumber: "N",
    photoProfileUrl: "",
    workPhotosJson: "[]",
  });
}

test("field agent moderation lifecycle (repos + CRM link + auth)", { skip: !isPgConfigured() }, async () => {
  runBootstrap();
  const pool = getPgPool();
  const tenantId = TENANT_ZM;
  const wrongTenantId = 3;
  const suffix = uniq();
  const username = `fa_mod_${suffix}`;
  const password = "testpass_stage2";
  const hash = await bcrypt.hash(password, 4);
  let agentId;
  let agentId2;
  let subApproveId;
  let subRejectId;
  let taskApproveId;
  let taskRejectId;
  let callbackLeadId;
  let callbackTaskId;
  let dupAgentId;
  let subDupId;

  try {
    agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId,
      username,
      passwordHash: hash,
      displayName: "Moderation test",
      phone: "",
    });

    const authUser = await authenticateFieldAgent(pool, username, password, tenantId);
    assert.ok(authUser);
    assert.equal(Number(authUser.tenant_id), tenantId);

    const phoneA = makePhoneNorm(suffix + "a");
    const phoneB = makePhoneNorm(suffix + "b");
    const phoneDup = makePhoneNorm(suffix + "dup");

    subApproveId = await fieldAgentSubmissionsRepo.insertSubmission(pool, null, {
      tenantId,
      fieldAgentId: agentId,
      phoneRaw: phoneA,
      phoneNorm: phoneA,
      whatsappRaw: "",
      whatsappNorm: "",
      firstName: "Jane",
      lastName: "Provider",
      profession: "Electrician",
      city: "Lusaka",
      pacra: "P-1",
      addressStreet: "St1",
      addressLandmarks: "",
      addressNeighbourhood: "",
      addressCity: "Lusaka",
      nrcNumber: "NRC1",
      photoProfileUrl: "",
      workPhotosJson: "[]",
    });

    const dupCheck = await fieldAgentSubmissionsRepo.duplicateExistsAgainstSubmissions(
      pool,
      tenantId,
      phoneA,
      "",
      null
    );
    assert.equal(dupCheck.duplicate, true);

    taskApproveId = await createCrmTaskFromEvent({
      tenantId,
      title: `Field agent provider · test ${subApproveId}`,
      description: `Submission #${subApproveId}`,
      sourceType: "field_agent_provider",
      sourceRefId: subApproveId,
    });
    assert.ok(taskApproveId && taskApproveId > 0);

    const rowBefore = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tenantId, subApproveId);
    assert.ok(rowBefore);
    assert.equal(rowBefore.status, "pending");
    assert.equal(String(rowBefore.field_agent_username || "").toLowerCase(), username);

    const rowWrongTenant = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, wrongTenantId, subApproveId);
    assert.equal(rowWrongTenant, null);

    const approved = await fieldAgentSubmissionsRepo.approveFieldAgentSubmission(pool, {
      tenantId,
      submissionId: subApproveId,
      commissionAmount: 42.5,
    });
    assert.equal(approved, true);
    const rowApproved = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tenantId, subApproveId);
    assert.equal(rowApproved.status, "approved");
    assert.equal(Number(rowApproved.commission_amount), 42.5);

    const approveTwice = await fieldAgentSubmissionsRepo.approveFieldAgentSubmission(pool, {
      tenantId,
      submissionId: subApproveId,
      commissionAmount: 0,
    });
    assert.equal(approveTwice, false);

    const pendingC = await fieldAgentSubmissionsRepo.countByAgentAndStatus(pool, agentId, "pending");
    const approvedC = await fieldAgentSubmissionsRepo.countByAgentAndStatus(pool, agentId, "approved");
    assert.equal(pendingC, 0);
    assert.equal(approvedC, 1);

    const commissionOk = await fieldAgentSubmissionsRepo.updateFieldAgentSubmissionCommission(pool, {
      tenantId,
      submissionId: subApproveId,
      commissionAmount: 100,
    });
    assert.equal(commissionOk, true);
    const rev = await fieldAgentSubmissionsRepo.sumCommissionLastDays(pool, agentId, 30);
    assert.ok(Number(rev) >= 100);

    agentId2 = await fieldAgentsRepo.insertAgent(pool, {
      tenantId,
      username: `${username}_r`,
      passwordHash: hash,
      displayName: "Reject test",
      phone: "",
    });

    subRejectId = await fieldAgentSubmissionsRepo.insertSubmission(pool, null, {
      tenantId,
      fieldAgentId: agentId2,
      phoneRaw: phoneB,
      phoneNorm: phoneB,
      whatsappRaw: "",
      whatsappNorm: "",
      firstName: "John",
      lastName: "Reject",
      profession: "Plumber",
      city: "Ndola",
      pacra: "P-2",
      addressStreet: "St2",
      addressLandmarks: "",
      addressNeighbourhood: "",
      addressCity: "Ndola",
      nrcNumber: "NRC2",
      photoProfileUrl: "",
      workPhotosJson: "[]",
    });

    assert.equal(
      await fieldAgentSubmissionsRepo.updateFieldAgentSubmissionCommission(pool, {
        tenantId,
        submissionId: subRejectId,
        commissionAmount: 1,
      }),
      false
    );
    assert.equal(
      await fieldAgentSubmissionsRepo.rejectFieldAgentSubmission(pool, {
        tenantId,
        submissionId: subRejectId,
        rejectionReason: "",
      }),
      false
    );

    taskRejectId = await createCrmTaskFromEvent({
      tenantId,
      title: `Field agent provider · rej ${subRejectId}`,
      description: `Submission #${subRejectId}`,
      sourceType: "field_agent_provider",
      sourceRefId: subRejectId,
    });
    assert.ok(taskRejectId);

    const rejectedOk = await fieldAgentSubmissionsRepo.rejectFieldAgentSubmission(pool, {
      tenantId,
      submissionId: subRejectId,
      rejectionReason: "Incomplete PACRA documentation",
    });
    assert.equal(rejectedOk, true);
    const rowRej = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tenantId, subRejectId);
    assert.equal(rowRej.status, "rejected");
    assert.match(rowRej.rejection_reason, /PACRA/);

    const rejectedRows = await fieldAgentSubmissionsRepo.listRejectedWithReason(pool, agentId2, 10);
    assert.ok(rejectedRows.some((r) => Number(r.id) === subRejectId));

    const phoneDupUnique = makePhoneNorm(suffix + "pdup");
    dupAgentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId,
      username: `fa_dup_${suffix}`,
      passwordHash: hash,
      displayName: "Dup test",
      phone: "",
    });
    subDupId = await fieldAgentSubmissionsRepo.insertSubmission(pool, null, {
      tenantId,
      fieldAgentId: dupAgentId,
      phoneRaw: phoneDupUnique,
      phoneNorm: phoneDupUnique,
      whatsappRaw: "",
      whatsappNorm: "",
      firstName: "Dup",
      lastName: "One",
      profession: "X",
      city: "C",
      pacra: "P",
      addressStreet: "S",
      addressLandmarks: "",
      addressNeighbourhood: "",
      addressCity: "C",
      nrcNumber: "N",
      photoProfileUrl: "",
      workPhotosJson: "[]",
    });
    let dupSecondError = null;
    try {
      await fieldAgentSubmissionsRepo.insertSubmission(pool, null, {
        tenantId,
        fieldAgentId: dupAgentId,
        phoneRaw: phoneDupUnique,
        phoneNorm: phoneDupUnique,
        whatsappRaw: "",
        whatsappNorm: "",
        firstName: "Dup",
        lastName: "Two",
        profession: "Y",
        city: "C",
        pacra: "P",
        addressStreet: "S",
        addressLandmarks: "",
        addressNeighbourhood: "",
        addressCity: "C",
        nrcNumber: "N2",
        photoProfileUrl: "",
        workPhotosJson: "[]",
      });
    } catch (e) {
      dupSecondError = e;
    }
    assert.ok(dupSecondError);
    assert.equal(dupSecondError.code, "23505");

    callbackLeadId = await fieldAgentCallbackLeadsRepo.insertCallbackLead(pool, null, {
      tenantId,
      fieldAgentId: agentId,
      firstName: "Cb",
      lastName: "Lead",
      phone: makePhoneNorm(suffix + "cb"),
      email: `cb_${suffix}@example.com`,
      locationCity: "Lusaka",
    });
    callbackTaskId = await createCrmTaskFromEvent({
      tenantId,
      title: "Field agent callback · Cb",
      description: "cb",
      sourceType: "field_agent_callback",
      sourceRefId: callbackLeadId,
    });
    assert.ok(callbackTaskId);

    const listed = await fieldAgentSubmissionsRepo.listFieldAgentSubmissionsForAdmin(pool, tenantId, { limit: 5 });
    assert.ok(listed.some((r) => Number(r.id) === subApproveId));
  } finally {
    try {
      if (taskApproveId) await pool.query(`DELETE FROM public.crm_tasks WHERE id = $1`, [taskApproveId]);
      if (taskRejectId) await pool.query(`DELETE FROM public.crm_tasks WHERE id = $1`, [taskRejectId]);
      if (callbackTaskId) await pool.query(`DELETE FROM public.crm_tasks WHERE id = $1`, [callbackTaskId]);
      if (subApproveId) {
        await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subApproveId]);
      }
      if (subRejectId) {
        await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subRejectId]);
      }
      if (subDupId) {
        await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subDupId]);
      }
      if (callbackLeadId) {
        await pool.query(`DELETE FROM public.field_agent_callback_leads WHERE id = $1`, [callbackLeadId]);
      }
      if (agentId) await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
      if (agentId2) await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId2]);
      if (dupAgentId) await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [dupAgentId]);
    } catch {
      /* ignore cleanup errors */
    }
    resetBootstrapForTests();
  }
});

test("field agent moderation HTTP (admin CRM routes)", { skip: !isPgConfigured() }, async () => {
  runBootstrap();
  const pool = getPgPool();
  const app = createModerationHttpApp();
  const tenantId = TENANT_ZM;
  const suffix = uniq();
  const pw = "HttpItest_1!";
  const hash = await bcrypt.hash(pw, 4);

  let mutAdminId;
  let viewAdminId;
  let superAdminId;
  let faAgentId;
  const taskIds = [];
  const subIds = [];
  const badTaskIds = [];
  let callbackLeadId;
  let callbackTaskHttpId;

  const mutName = `fa_http_mut_${suffix}`;
  const viewName = `fa_http_view_${suffix}`;
  const supName = `fa_http_sup_${suffix}`;

  try {
    mutAdminId = await adminUsersRepo.insertUser(pool, {
      username: mutName,
      passwordHash: hash,
      role: ROLES.TENANT_MANAGER,
      tenantId,
      displayName: "",
    });
    viewAdminId = await adminUsersRepo.insertUser(pool, {
      username: viewName,
      passwordHash: hash,
      role: ROLES.TENANT_VIEWER,
      tenantId,
      displayName: "",
    });
    superAdminId = await adminUsersRepo.insertUser(pool, {
      username: supName,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    faAgentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId,
      username: `fa_http_fa_${suffix}`,
      passwordHash: hash,
      displayName: "HTTP FA",
      phone: "",
    });

    const crmBefore = await countCrmTasksForTenant(pool, tenantId);

    const agentMut = await adminLoginAgent(app, mutName, pw);

    // --- A. Approve (commission optional), comment+audit, no extra CRM row
    const p1 = makePhoneNorm(`${suffix}_http1`);
    const sub1 = await insertProviderSubmission(pool, { tenantId, fieldAgentId: faAgentId, phoneNorm: p1 });
    subIds.push(sub1);
    const task1 = await createCrmTaskFromEvent({
      tenantId,
      title: `HTTP ap ${sub1}`,
      description: "d",
      sourceType: "field_agent_provider",
      sourceRefId: sub1,
    });
    taskIds.push(task1);
    const c0 = await countCommentsForTask(pool, task1);
    const au0 = await countAuditForTask(pool, task1);
    const resA = await agentMut
      .post(`/admin/crm/tasks/${task1}/field-agent-submission/approve`)
      .type("form")
      .send({ commission_amount: "12.5" });
    assert.equal(resA.status, 302);
    assert.ok(String(resA.headers.location || "").includes(`/admin/crm/tasks/${task1}`));
    assert.equal(await countCrmTasksForTenant(pool, tenantId), crmBefore + taskIds.length);
    const rowA = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tenantId, sub1);
    assert.equal(rowA.status, "approved");
    assert.equal(Number(rowA.commission_amount), 12.5);
    assert.equal(String(rowA.rejection_reason || "").trim(), "");
    assert.equal(await countCommentsForTask(pool, task1), c0 + 1);
    assert.equal(await countAuditForTask(pool, task1), au0 + 1);

    // --- B. Reject + note
    const p2 = makePhoneNorm(`${suffix}_http2`);
    const sub2 = await insertProviderSubmission(pool, { tenantId, fieldAgentId: faAgentId, phoneNorm: p2 });
    subIds.push(sub2);
    const task2 = await createCrmTaskFromEvent({
      tenantId,
      title: `HTTP rj ${sub2}`,
      description: "d",
      sourceType: "field_agent_provider",
      sourceRefId: sub2,
    });
    taskIds.push(task2);
    const resB = await agentMut
      .post(`/admin/crm/tasks/${task2}/field-agent-submission/reject`)
      .type("form")
      .send({ rejection_reason: "HTTP reject reason text" });
    assert.equal(resB.status, 302);
    const rowB = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tenantId, sub2);
    assert.equal(rowB.status, "rejected");
    assert.equal(Number(rowB.commission_amount), 0);
    assert.match(String(rowB.rejection_reason || ""), /HTTP reject/);
    assert.ok((await countCommentsForTask(pool, task2)) >= 1);

    // --- C. Commission-only does not add comment (approve first, then commission)
    const p3 = makePhoneNorm(`${suffix}_http3`);
    const sub3 = await insertProviderSubmission(pool, { tenantId, fieldAgentId: faAgentId, phoneNorm: p3 });
    subIds.push(sub3);
    const task3 = await createCrmTaskFromEvent({
      tenantId,
      title: `HTTP cm ${sub3}`,
      description: "d",
      sourceType: "field_agent_provider",
      sourceRefId: sub3,
    });
    taskIds.push(task3);
    await agentMut.post(`/admin/crm/tasks/${task3}/field-agent-submission/approve`).type("form").send({});
    const ccAfterApprove = await countCommentsForTask(pool, task3);
    const resC = await agentMut
      .post(`/admin/crm/tasks/${task3}/field-agent-submission/commission`)
      .type("form")
      .send({ commission_amount: "77" });
    assert.equal(resC.status, 302);
    assert.equal(await countCommentsForTask(pool, task3), ccAfterApprove);
    const rowC = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tenantId, sub3);
    assert.equal(Number(rowC.commission_amount), 77);

    // --- D. Unauthenticated → redirect login
    const resD = await request(app)
      .post(`/admin/crm/tasks/${task3}/field-agent-submission/commission`)
      .type("form")
      .send({ commission_amount: "1" });
    assert.equal(resD.status, 302);
    assert.match(String(resD.headers.location || ""), /\/admin\/login/);

    // --- E. Viewer cannot mutate
    const p5 = makePhoneNorm(`${suffix}_http5`);
    const sub5 = await insertProviderSubmission(pool, { tenantId, fieldAgentId: faAgentId, phoneNorm: p5 });
    subIds.push(sub5);
    const task5 = await createCrmTaskFromEvent({
      tenantId,
      title: `HTTP vw ${sub5}`,
      description: "d",
      sourceType: "field_agent_provider",
      sourceRefId: sub5,
    });
    taskIds.push(task5);
    const agentView = await adminLoginAgent(app, viewName, pw);
    const resE = await agentView.post(`/admin/crm/tasks/${task5}/field-agent-submission/approve`).type("form").send({});
    assert.equal(resE.status, 403);
    assert.match(resE.text, /Read-only access/);

    // --- E2. Wrong source_type (callback task)
    callbackLeadId = await fieldAgentCallbackLeadsRepo.insertCallbackLead(pool, null, {
      tenantId,
      fieldAgentId: faAgentId,
      firstName: "Cb",
      lastName: "H",
      phone: makePhoneNorm(`${suffix}_cbh`),
      email: `cbh_${suffix}@example.com`,
      locationCity: "Lusaka",
    });
    callbackTaskHttpId = await createCrmTaskFromEvent({
      tenantId,
      title: "HTTP callback",
      description: "d",
      sourceType: "field_agent_callback",
      sourceRefId: callbackLeadId,
    });
    const resE2 = await agentMut.post(`/admin/crm/tasks/${callbackTaskHttpId}/field-agent-submission/approve`).type("form").send({});
    assert.equal(resE2.status, 400);

    // --- E3. Missing source_ref_id on provider-shaped task
    const taskNullRef = await insertCrmTaskRaw(pool, {
      tenantId,
      title: "null ref",
      sourceType: "field_agent_provider",
      sourceRefId: null,
    });
    badTaskIds.push(taskNullRef);
    const resE3 = await agentMut.post(`/admin/crm/tasks/${taskNullRef}/field-agent-submission/approve`).type("form").send({});
    assert.equal(resE3.status, 400);

    // --- E4. Invalid source_ref_id (no submission row)
    const taskBadRef = await insertCrmTaskRaw(pool, {
      tenantId,
      title: "bad ref",
      sourceType: "field_agent_provider",
      sourceRefId: 999999999,
    });
    badTaskIds.push(taskBadRef);
    const resE4 = await agentMut.post(`/admin/crm/tasks/${taskBadRef}/field-agent-submission/approve`).type("form").send({});
    assert.equal(resE4.status, 404);

    // --- E5. Tenant mismatch (super admin scoped to IL, task is ZM)
    const p6 = makePhoneNorm(`${suffix}_http6`);
    const sub6 = await insertProviderSubmission(pool, { tenantId, fieldAgentId: faAgentId, phoneNorm: p6 });
    subIds.push(sub6);
    const task6 = await createCrmTaskFromEvent({
      tenantId,
      title: `HTTP tm ${sub6}`,
      description: "d",
      sourceType: "field_agent_provider",
      sourceRefId: sub6,
    });
    taskIds.push(task6);
    const agentSup = await adminLoginAgent(app, supName, pw);
    await agentSup
      .post("/admin/super/scope")
      .type("form")
      .send({ tenant_id: String(TENANT_IL), redirect: "/admin/dashboard" })
      .expect(302);
    const resE5 = await agentSup.post(`/admin/crm/tasks/${task6}/field-agent-submission/approve`).type("form").send({});
    assert.equal(resE5.status, 404);

    // Back to mutating agent for remaining checks
    const agentMut2 = await adminLoginAgent(app, mutName, pw);

    // --- F. Double approve / double reject / commission on pending
    const p7 = makePhoneNorm(`${suffix}_http7`);
    const sub7 = await insertProviderSubmission(pool, { tenantId, fieldAgentId: faAgentId, phoneNorm: p7 });
    subIds.push(sub7);
    const task7 = await createCrmTaskFromEvent({
      tenantId,
      title: `HTTP dbl ${sub7}`,
      description: "d",
      sourceType: "field_agent_provider",
      sourceRefId: sub7,
    });
    taskIds.push(task7);
    await agentMut2.post(`/admin/crm/tasks/${task7}/field-agent-submission/approve`).type("form").send({});
    const resF1 = await agentMut2.post(`/admin/crm/tasks/${task7}/field-agent-submission/approve`).type("form").send({});
    assert.equal(resF1.status, 400);

    const p8 = makePhoneNorm(`${suffix}_http8`);
    const sub8 = await insertProviderSubmission(pool, { tenantId, fieldAgentId: faAgentId, phoneNorm: p8 });
    subIds.push(sub8);
    const task8 = await createCrmTaskFromEvent({
      tenantId,
      title: `HTTP dbr ${sub8}`,
      description: "d",
      sourceType: "field_agent_provider",
      sourceRefId: sub8,
    });
    taskIds.push(task8);
    await agentMut2
      .post(`/admin/crm/tasks/${task8}/field-agent-submission/reject`)
      .type("form")
      .send({ rejection_reason: "first reject" });
    const resF2 = await agentMut2
      .post(`/admin/crm/tasks/${task8}/field-agent-submission/reject`)
      .type("form")
      .send({ rejection_reason: "second try" });
    assert.equal(resF2.status, 400);

    const p9 = makePhoneNorm(`${suffix}_http9`);
    const sub9 = await insertProviderSubmission(pool, { tenantId, fieldAgentId: faAgentId, phoneNorm: p9 });
    subIds.push(sub9);
    const task9 = await createCrmTaskFromEvent({
      tenantId,
      title: `HTTP cnp ${sub9}`,
      description: "d",
      sourceType: "field_agent_provider",
      sourceRefId: sub9,
    });
    taskIds.push(task9);
    const resF3 = await agentMut2
      .post(`/admin/crm/tasks/${task9}/field-agent-submission/commission`)
      .type("form")
      .send({ commission_amount: "5" });
    assert.equal(resF3.status, 400);

    // --- G. safeCrmRedirect
    const p10 = makePhoneNorm(`${suffix}_h10`);
    const sub10 = await insertProviderSubmission(pool, { tenantId, fieldAgentId: faAgentId, phoneNorm: p10 });
    subIds.push(sub10);
    const task10 = await createCrmTaskFromEvent({
      tenantId,
      title: `HTTP rd ${sub10}`,
      description: "d",
      sourceType: "field_agent_provider",
      sourceRefId: sub10,
    });
    taskIds.push(task10);
    const nextSafe = `/admin/crm?openTask=${task10}`;
    const resG1 = await agentMut2
      .post(`/admin/crm/tasks/${task10}/field-agent-submission/approve`)
      .type("form")
      .send({ commission_amount: "", next: nextSafe });
    assert.equal(resG1.status, 302);
    assert.equal(String(resG1.headers.location || ""), nextSafe);

    const p11 = makePhoneNorm(`${suffix}_h11`);
    const sub11 = await insertProviderSubmission(pool, { tenantId, fieldAgentId: faAgentId, phoneNorm: p11 });
    subIds.push(sub11);
    const task11 = await createCrmTaskFromEvent({
      tenantId,
      title: `HTTP rdx ${sub11}`,
      description: "d",
      sourceType: "field_agent_provider",
      sourceRefId: sub11,
    });
    taskIds.push(task11);
    const resG2 = await agentMut2
      .post(`/admin/crm/tasks/${task11}/field-agent-submission/approve`)
      .type("form")
      .send({ next: "https://evil.com/phish" });
    assert.equal(resG2.status, 302);
    const locU = String(resG2.headers.location || "");
    assert.ok(!locU.startsWith("https://evil.com"));
    assert.ok(locU.includes(`/admin/crm/tasks/${task11}`));

    // --- H. Reject without usable reason → 400; submission stays pending
    const p12 = makePhoneNorm(`${suffix}_h12`);
    const sub12 = await insertProviderSubmission(pool, { tenantId, fieldAgentId: faAgentId, phoneNorm: p12 });
    subIds.push(sub12);
    const task12 = await createCrmTaskFromEvent({
      tenantId,
      title: `HTTP rjempty ${sub12}`,
      description: "d",
      sourceType: "field_agent_provider",
      sourceRefId: sub12,
    });
    taskIds.push(task12);
    const resH = await agentMut2
      .post(`/admin/crm/tasks/${task12}/field-agent-submission/reject`)
      .type("form")
      .send({ rejection_reason: "   " });
    assert.equal(resH.status, 400);
    assert.match(resH.text, /Rejection reason is required/);
    assert.equal(
      (await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tenantId, sub12)).status,
      "pending"
    );

    // --- I. Approve with invalid commission → 400; submission stays pending
    const p13 = makePhoneNorm(`${suffix}_h13`);
    const sub13 = await insertProviderSubmission(pool, { tenantId, fieldAgentId: faAgentId, phoneNorm: p13 });
    subIds.push(sub13);
    const task13 = await createCrmTaskFromEvent({
      tenantId,
      title: `HTTP apinv ${sub13}`,
      description: "d",
      sourceType: "field_agent_provider",
      sourceRefId: sub13,
    });
    taskIds.push(task13);
    const resI = await agentMut2
      .post(`/admin/crm/tasks/${task13}/field-agent-submission/approve`)
      .type("form")
      .send({ commission_amount: "-1" });
    assert.equal(resI.status, 400);
    assert.match(resI.text, /Invalid commission amount/);
    assert.equal(
      (await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tenantId, sub13)).status,
      "pending"
    );

    // --- J. Commission POST invalid amount on approved submission → 400; amount unchanged
    const resJ = await agentMut2
      .post(`/admin/crm/tasks/${task3}/field-agent-submission/commission`)
      .type("form")
      .send({ commission_amount: "bad" });
    assert.equal(resJ.status, 400);
    assert.match(resJ.text, /Invalid commission amount/);
    assert.equal(
      Number(
        (await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tenantId, sub3)).commission_amount
      ),
      77
    );

    assert.equal(await countCrmTasksForTenant(pool, tenantId), crmBefore + taskIds.length + badTaskIds.length + (callbackTaskHttpId ? 1 : 0));
  } finally {
    try {
      for (const tid of [...taskIds, ...badTaskIds, callbackTaskHttpId].filter(Boolean)) {
        await pool.query(`DELETE FROM public.crm_tasks WHERE id = $1`, [tid]);
      }
      for (const sid of subIds) {
        await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [sid]);
      }
      if (callbackLeadId) await pool.query(`DELETE FROM public.field_agent_callback_leads WHERE id = $1`, [callbackLeadId]);
      if (faAgentId) await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [faAgentId]);
      for (const aid of [mutAdminId, viewAdminId, superAdminId].filter(Boolean)) {
        await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [aid]);
      }
    } catch {
      /* ignore */
    }
    resetBootstrapForTests();
  }
});
