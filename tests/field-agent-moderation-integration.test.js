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
const companiesRepo = require("../src/db/pg/companiesRepo");
const categoriesRepo = require("../src/db/pg/categoriesRepo");
const { ensureFieldAgentSchema } = require("../src/db/pg/ensureFieldAgentSchema");
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
  await ensureFieldAgentSchema(pool);
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
  await ensureFieldAgentSchema(pool);
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

test("field agent extended statuses: info_needed, appealed, open-pipeline duplicate", { skip: !isPgConfigured() }, async () => {
  runBootstrap();
  const pool = getPgPool();
  await ensureFieldAgentSchema(pool);
  const tenantId = TENANT_ZM;
  const suffix = uniq();
  const hash = await bcrypt.hash("t1", 4);
  let agentId;
  let subInfo;
  let subRejAppeal;
  let taskInfo;
  let taskRej;
  let taskHttpInf;
  let subHttp;
  let mutAdminIdHttp;

  try {
    agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId,
      username: `fa_ext_${suffix}`,
      passwordHash: hash,
      displayName: "Ext status",
      phone: "",
    });

    const phoneInfo = makePhoneNorm(`${suffix}_info`);
    subInfo = await fieldAgentSubmissionsRepo.insertSubmission(pool, null, {
      tenantId,
      fieldAgentId: agentId,
      phoneRaw: phoneInfo,
      phoneNorm: phoneInfo,
      whatsappRaw: "",
      whatsappNorm: "",
      firstName: "Info",
      lastName: "Needed",
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

    assert.equal(
      await fieldAgentSubmissionsRepo.markFieldAgentSubmissionInfoNeeded(pool, {
        tenantId,
        submissionId: subInfo,
        adminInfoRequest: "Please upload clearer PACRA.",
      }),
      true
    );
    assert.equal(
      (await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tenantId, subInfo)).status,
      "info_needed"
    );

    let dupErr = null;
    try {
      await fieldAgentSubmissionsRepo.insertSubmission(pool, null, {
        tenantId,
        fieldAgentId: agentId,
        phoneRaw: phoneInfo,
        phoneNorm: phoneInfo,
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
      dupErr = e;
    }
    assert.ok(dupErr);
    assert.equal(dupErr.code, "23505");

    assert.equal(
      await fieldAgentSubmissionsRepo.approveFieldAgentSubmission(pool, {
        tenantId,
        submissionId: subInfo,
        commissionAmount: 1,
      }),
      true
    );

    const phoneRA = makePhoneNorm(`${suffix}_rejapp`);
    subRejAppeal = await fieldAgentSubmissionsRepo.insertSubmission(pool, null, {
      tenantId,
      fieldAgentId: agentId,
      phoneRaw: phoneRA,
      phoneNorm: phoneRA,
      whatsappRaw: "",
      whatsappNorm: "",
      firstName: "Rej",
      lastName: "App",
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

    taskInfo = await createCrmTaskFromEvent({
      tenantId,
      title: `ext info ${subInfo}`,
      description: "d",
      sourceType: "field_agent_provider",
      sourceRefId: subInfo,
    });
    taskRej = await createCrmTaskFromEvent({
      tenantId,
      title: `ext rej ${subRejAppeal}`,
      description: "d",
      sourceType: "field_agent_provider",
      sourceRefId: subRejAppeal,
    });

    assert.equal(
      await fieldAgentSubmissionsRepo.rejectFieldAgentSubmission(pool, {
        tenantId,
        submissionId: subRejAppeal,
        rejectionReason: "Not yet",
      }),
      true
    );

    assert.equal(
      await fieldAgentSubmissionsRepo.markFieldAgentSubmissionAppealed(pool, {
        tenantId,
        submissionId: subRejAppeal,
      }),
      true
    );
    assert.equal(
      (await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tenantId, subRejAppeal)).status,
      "appealed"
    );

    assert.equal(
      await fieldAgentSubmissionsRepo.approveFieldAgentSubmission(pool, {
        tenantId,
        submissionId: subRejAppeal,
        commissionAmount: 0,
      }),
      true
    );

    const app = createModerationHttpApp();
    const mutName = `fa_ext_http_${suffix}`;
    const pw = "HttpExt1!";
    const h2 = await bcrypt.hash(pw, 4);
    mutAdminIdHttp = await adminUsersRepo.insertUser(pool, {
      username: mutName,
      passwordHash: h2,
      role: ROLES.TENANT_MANAGER,
      tenantId,
      displayName: "",
    });
    const agentMut = await adminLoginAgent(app, mutName, pw);
    const pHttp = makePhoneNorm(`${suffix}_httpinf`);
    subHttp = await insertProviderSubmission(pool, { tenantId, fieldAgentId: agentId, phoneNorm: pHttp });
    taskHttpInf = await createCrmTaskFromEvent({
      tenantId,
      title: `http inf ${subHttp}`,
      description: "d",
      sourceType: "field_agent_provider",
      sourceRefId: subHttp,
    });
    const resInf = await agentMut
      .post(`/admin/crm/tasks/${taskHttpInf}/field-agent-submission/info-needed`)
      .type("form")
      .send({ info_request: "Need clearer ID copy." });
    assert.equal(resInf.status, 302);
    assert.equal(
      (await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tenantId, subHttp)).status,
      "info_needed"
    );
  } finally {
    try {
      if (taskHttpInf) await pool.query(`DELETE FROM public.crm_tasks WHERE id = $1`, [taskHttpInf]);
      if (subHttp) await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subHttp]);
      if (mutAdminIdHttp) await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [mutAdminIdHttp]);
      if (taskInfo) await pool.query(`DELETE FROM public.crm_tasks WHERE id = $1`, [taskInfo]);
      if (taskRej) await pool.query(`DELETE FROM public.crm_tasks WHERE id = $1`, [taskRej]);
      if (subInfo) await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subInfo]);
      if (subRejAppeal) await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subRejAppeal]);
      if (agentId) await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
    } catch {
      /* ignore */
    }
    resetBootstrapForTests();
  }
});

test("admin websites queue + review reject/publish workflow", { skip: !isPgConfigured() }, async () => {
  runBootstrap();
  const pool = getPgPool();
  await ensureFieldAgentSchema(pool);
  const app = createModerationHttpApp();
  const tenantId = TENANT_ZM;
  const suffix = uniq();
  const pw = "WebQueue_1!";
  const hash = await bcrypt.hash(pw, 4);

  let managerId;
  let editorId;
  let viewerId;
  let agentId;
  let subId;
  let websiteTaskId;
  let providerTaskId;
  let companyId;

  try {
    managerId = await adminUsersRepo.insertUser(pool, {
      username: `web_mgr_${suffix}`,
      passwordHash: hash,
      role: ROLES.TENANT_MANAGER,
      tenantId,
      displayName: "",
    });
    editorId = await adminUsersRepo.insertUser(pool, {
      username: `web_edit_${suffix}`,
      passwordHash: hash,
      role: ROLES.TENANT_EDITOR,
      tenantId,
      displayName: "",
    });
    viewerId = await adminUsersRepo.insertUser(pool, {
      username: `web_view_${suffix}`,
      passwordHash: hash,
      role: ROLES.TENANT_VIEWER,
      tenantId,
      displayName: "",
    });
    agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId,
      username: `web_fa_${suffix}`,
      passwordHash: hash,
      displayName: "",
      phone: "",
    });

    const p = makePhoneNorm(`${suffix}_web`);
    subId = await insertProviderSubmission(pool, { tenantId, fieldAgentId: agentId, phoneNorm: p });
    await fieldAgentSubmissionsRepo.approveFieldAgentSubmission(pool, {
      tenantId,
      submissionId: subId,
      commissionAmount: 0,
    });
    await fieldAgentSubmissionsRepo.patchWebsiteListingDraftForFieldAgent(pool, {
      tenantId,
      fieldAgentId: agentId,
      submissionId: subId,
      draft: { listing_name: "WF Listing", headline: "WF Headline", about: "WF About" },
    });
    websiteTaskId = await createCrmTaskFromEvent({
      tenantId,
      title: `Website listing review ${subId}`,
      description: "website-review",
      sourceType: "field_agent_website_listing",
      sourceRefId: subId,
    });
    providerTaskId = await createCrmTaskFromEvent({
      tenantId,
      title: `Provider moderation ${subId}`,
      description: "provider-review",
      sourceType: "field_agent_provider",
      sourceRefId: subId,
    });

    const managerAgent = await adminLoginAgent(app, `web_mgr_${suffix}`, pw);
    const queueRes = await managerAgent.get("/admin/crm?queue=websites");
    assert.equal(queueRes.status, 200);
    assert.match(queueRes.text || "", /Website listing review/);
    assert.doesNotMatch(queueRes.text || "", /Provider moderation/);

    const viewerAgent = await adminLoginAgent(app, `web_view_${suffix}`, pw);
    const deniedRes = await viewerAgent.get("/admin/crm?queue=websites");
    assert.equal(deniedRes.status, 403);
    const deniedSaveRes = await viewerAgent
      .post(`/admin/field-agent/submissions/${subId}/website-listing-review/save`)
      .type("form")
      .send({ specialities: ["Viewer Try"], specialities_verified: ["Viewer Try"] });
    assert.equal(deniedSaveRes.status, 403);

    const editorAgent = await adminLoginAgent(app, `web_edit_${suffix}`, pw);
    const openRes = await editorAgent.get(`/admin/field-agent/submissions/${subId}/website-listing-review`);
    assert.equal(openRes.status, 200);
    assert.match(openRes.text || "", /Specialities/);
    assert.match(openRes.text || "", /Established in year/i);

    const saveRes = await editorAgent
      .post(`/admin/field-agent/submissions/${subId}/website-listing-review/save`)
      .type("form")
      .send({
        listing_name: "WF Listing Updated",
        established_year: "2011",
        specialities: ["Plumbing", "Electrical", "Plumbing"],
        specialities_verified: ["Plumbing"],
        hours_monday_closed: "",
        hours_monday_from: "08:00",
        hours_monday_to: "17:00",
        hours_tuesday_closed: "1",
      });
    assert.equal(saveRes.status, 302);
    const spRows = await pool.query(
      `SELECT speciality_name, is_verified FROM public.field_agent_submission_website_specialities WHERE tenant_id = $1 AND submission_id = $2`,
      [tenantId, subId]
    );
    assert.ok(spRows.rows.length >= 2);
    const pRow = spRows.rows.find((r) => String(r.speciality_name || "").toLowerCase() === "plumbing");
    const eRow = spRows.rows.find((r) => String(r.speciality_name || "").toLowerCase() === "electrical");
    assert.ok(pRow && pRow.is_verified === true);
    assert.ok(eRow && eRow.is_verified === false);
    const hourRows = await pool.query(
      `SELECT day_of_week, is_closed, opens_at::text AS opens_at_text, closes_at::text AS closes_at_text
       FROM public.field_agent_submission_website_hours WHERE tenant_id = $1 AND submission_id = $2`,
      [tenantId, subId]
    );
    assert.ok(hourRows.rows.some((r) => Number(r.day_of_week) === 1 && r.is_closed === false));
    const draftAfterSave = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tenantId, subId);
    assert.equal(Number(draftAfterSave.website_listing_draft_json.established_year), 2011);

    const rejectRes = await editorAgent
      .post(`/admin/field-agent/submissions/${subId}/website-listing-review/reject`)
      .type("form")
      .send({ rejection_reason: "Please add clearer services and hours text." });
    assert.equal(rejectRes.status, 302);
    const afterReject = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tenantId, subId);
    assert.equal(String(afterReject.website_listing_review_status || ""), "changes_requested");
    assert.match(String(afterReject.website_listing_review_comment || ""), /clearer services/i);

    const missingReject = await editorAgent
      .post(`/admin/field-agent/submissions/${subId}/website-listing-review/reject`)
      .type("form")
      .send({ rejection_reason: "   " });
    assert.equal(missingReject.status, 400);

    const publishRes = await editorAgent
      .post(`/admin/field-agent/submissions/${subId}/website-listing-review/publish`)
      .type("form")
      .send({
        listing_name: "WF Published Name",
        headline: "WF Published Headline",
        about: "WF Published About",
        established_year: "2011",
        specialities: ["Plumbing", "Electrical"],
        hours_monday_closed: "",
        hours_monday_from: "08:00",
        hours_monday_to: "17:00",
      });
    assert.equal(publishRes.status, 302);
    const loc = String(publishRes.headers.location || "");
    assert.match(loc, /\/admin\/companies\/\d+\/workspace\?published=1/);
    const m = loc.match(/\/admin\/companies\/(\d+)\/workspace/);
    companyId = m ? Number(m[1]) : null;
    assert.ok(companyId && companyId > 0);
    const companyRow = await companiesRepo.getByIdAndTenantId(pool, companyId, tenantId);
    assert.equal(Number(companyRow.established_year), 2011);
    const afterPublish = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tenantId, subId);
    assert.equal(String(afterPublish.status || ""), "approved");
    assert.equal(String(afterPublish.website_listing_review_status || ""), "published");
  } finally {
    try {
      if (companyId) await pool.query(`DELETE FROM public.companies WHERE id = $1`, [companyId]);
      for (const tid of [websiteTaskId, providerTaskId].filter(Boolean)) {
        await pool.query(`DELETE FROM public.crm_tasks WHERE id = $1`, [tid]);
      }
      if (subId) await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [subId]);
      if (agentId) await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
      for (const aid of [managerId, editorId, viewerId].filter(Boolean)) {
        await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [aid]);
      }
    } catch {
      /* ignore */
    }
    resetBootstrapForTests();
  }
});

test("admin website content report + csv export with filters and mixed data", { skip: !isPgConfigured() }, async () => {
  runBootstrap();
  const pool = getPgPool();
  await ensureFieldAgentSchema(pool);
  const app = createModerationHttpApp();
  const tenantId = TENANT_ZM;
  const suffix = uniq();
  const pw = "WebReport_1!";
  const hash = await bcrypt.hash(pw, 4);

  let managerId;
  let viewerId;
  let agentId;
  let subPublishedId;
  let subLegacyId;
  let companyId;

  try {
    managerId = await adminUsersRepo.insertUser(pool, {
      username: `web_rep_mgr_${suffix}`,
      passwordHash: hash,
      role: ROLES.TENANT_MANAGER,
      tenantId,
      displayName: "",
    });
    viewerId = await adminUsersRepo.insertUser(pool, {
      username: `web_rep_view_${suffix}`,
      passwordHash: hash,
      role: ROLES.TENANT_VIEWER,
      tenantId,
      displayName: "",
    });
    agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId,
      username: `web_rep_fa_${suffix}`,
      passwordHash: hash,
      displayName: "Web Report Agent",
      phone: "",
    });

    subPublishedId = await insertProviderSubmission(pool, { tenantId, fieldAgentId: agentId, phoneNorm: makePhoneNorm(`${suffix}_rep_pub`) });
    subLegacyId = await insertProviderSubmission(pool, { tenantId, fieldAgentId: agentId, phoneNorm: makePhoneNorm(`${suffix}_rep_old`) });
    await fieldAgentSubmissionsRepo.approveFieldAgentSubmission(pool, {
      tenantId,
      submissionId: subPublishedId,
      commissionAmount: 0,
    });
    await fieldAgentSubmissionsRepo.approveFieldAgentSubmission(pool, {
      tenantId,
      submissionId: subLegacyId,
      commissionAmount: 0,
    });
    const reportCatRows = await categoriesRepo.listByTenantId(pool, tenantId);
    const reportCat = reportCatRows && reportCatRows[0] ? reportCatRows[0] : null;
    const reportCatName = reportCat ? String(reportCat.name || "").trim() : "";
    await fieldAgentSubmissionsRepo.patchWebsiteListingDraftForAdmin(pool, {
      tenantId,
      submissionId: subPublishedId,
      draft: {
        listing_name: "Published Report Listing",
        established_year: "2010",
        location: "Kitwe",
        category_id: reportCat ? String(reportCat.id) : "",
        about: "This published listing has sufficient about text for badge computation.",
        email: "published-report@example.com",
      },
    });
    await fieldAgentSubmissionsRepo.patchWebsiteListingDraftForAdmin(pool, {
      tenantId,
      submissionId: subLegacyId,
      draft: { listing_name: "Legacy Report Listing" },
    });
    await fieldAgentSubmissionsRepo.replaceWebsiteSpecialityEntriesForSubmission(pool, {
      tenantId,
      submissionId: subPublishedId,
      entries: [
        { name: "Plumbing", isVerified: true },
        { name: "Electrical", isVerified: false },
      ],
      verifiedByAdminUserId: managerId,
    });
    await fieldAgentSubmissionsRepo.replaceWebsiteWeeklyHoursForSubmission(pool, {
      tenantId,
      submissionId: subPublishedId,
      weeklyHours: {
        monday: { closed: false, from: "08:00", to: "17:00" },
        tuesday: { closed: true, from: "", to: "" },
      },
    });
    await fieldAgentSubmissionsRepo.setWebsiteListingReviewOutcomeForAdmin(pool, {
      tenantId,
      submissionId: subPublishedId,
      reviewStatus: "published",
      reviewComment: "",
    });
    companyId = (
      await companiesRepo.insertFull(pool, {
        tenantId,
        subdomain: `rep-${suffix}`,
        name: "Report Company",
        categoryId: null,
        headline: "h",
        about: "a",
        services: "s",
        phone: "",
        email: "",
        location: "",
        featuredCtaLabel: "Call us",
        featuredCtaPhone: "",
        yearsExperience: null,
        establishedYear: 2010,
        serviceAreas: "",
        hoursText: "",
        galleryJson: "[]",
        logoUrl: "",
        accountManagerFieldAgentId: agentId,
        sourceFieldAgentSubmissionId: subPublishedId,
      })
    ).id;

    const managerAgent = await adminLoginAgent(app, `web_rep_mgr_${suffix}`, pw);
    const viewerAgent = await adminLoginAgent(app, `web_rep_view_${suffix}`, pw);

    const denied = await viewerAgent.get("/admin/crm/websites/report");
    assert.equal(denied.status, 403);

    const pageRes = await managerAgent.get("/admin/crm/websites/report");
    assert.equal(pageRes.status, 200);
    assert.match(pageRes.text || "", /Website content report/i);
    assert.match(pageRes.text || "", /<strong>Permalink<\/strong>/);
    assert.match(pageRes.text || "", /class="card admin-form-card website-share-card"/);
    assert.match(pageRes.text || "", /Open current state in new tab/);
    assert.match(pageRes.text || "", /target="_blank"[^>]*rel="noopener noreferrer"|rel="noopener noreferrer"[^>]*target="_blank"/);
    assert.match(pageRes.text || "", /<strong>Summary:<\/strong>/);
    assert.match(pageRes.text || "", /Websites report/);
    assert.match(pageRes.text || "", /id="website-report-share-operational-states"/);
    assert.match(pageRes.text || "", /id="website-report-share-operational-hint"/);
    assert.match(pageRes.text || "", /Operational share states/);
    assert.match(pageRes.text || "", /URL for this report/);
    assert.match(pageRes.text || "", /<strong>Snippet<\/strong>/);
    assert.match(pageRes.text || "", /preset filtered views \(not saved\)/);
    assert.match(pageRes.text || "", /same copy as Advanced, one click/);
    assert.match(pageRes.text || "", /same filters; Advanced opens with one format focused/);
    assert.match(pageRes.text || "", /<strong>Copy bundles<\/strong>/);
    assert.match(pageRes.text || "", />Needs attention report</);
    assert.match(pageRes.text || "", />High quality report</);
    assert.match(pageRes.text || "", />Missing hours report</);
    assert.match(pageRes.text || "", />No established year report</);
    const reportShareHtml = pageRes.text || "";
    assert.match(reportShareHtml, /website-share-card--copy-wrap/);
    assert.match(reportShareHtml, /website-share-copy-row/);
    assert.match(reportShareHtml, /website-share-direct-link-block/);
    assert.match(reportShareHtml, /website-share-copy-btn--secondary-compact/);
    assert.match(reportShareHtml, /website-share-copy-btn--primary/);
    assert.match(reportShareHtml, /website-share-copy-btn--secondary/);
    assert.match(
      reportShareHtml,
      /class="btn btn--primary website-share-copy-btn--primary" id="website-report-share-copy"/
    );
    assert.match(reportShareHtml, /role="group"/);
    assert.match(reportShareHtml, /website-share-a11y-group--permalink/);
    assert.match(reportShareHtml, /website-share-a11y-group--snippet/);
    assert.match(reportShareHtml, /website-share-a11y-group--operational/);
    assert.match(reportShareHtml, /website-share-a11y-group--best-for/);
    assert.match(reportShareHtml, /website-share-a11y-group--direct-links/);
    assert.match(reportShareHtml, /website-share-a11y-group--copy-bundles/);
    assert.match(
      reportShareHtml,
      /aria-label="Permalink: report URL, copy, and open in new tab"/
    );
    assert.match(
      reportShareHtml,
      /aria-label="Copy bundles: combined and format-specific blocks"/
    );
    assert.match(
      reportShareHtml,
      /class="[^"]*website-share-card--focus-a11y[^"]*"/
    );
    assert.match(
      reportShareHtml,
      /website-share-card--focus-a11y a:focus-visible/
    );
    assert.match(
      reportShareHtml,
      /class="[^"]*website-share-card--group-focus-a11y[^"]*"/
    );
    assert.match(
      reportShareHtml,
      /website-share-a11y-group:focus-within/
    );
    assert.match(
      reportShareHtml,
      /website-share-direct-link-block:focus-within/
    );
    assert.match(reportShareHtml, /WEBSITE_SHARE_COPY_OK_MS/);
    assert.match(reportShareHtml, /WEBSITE_SHARE_COPY_FAIL_MS/);
    assert.match(reportShareHtml, /website-share-copy-btn--copied-state/);
    assert.match(reportShareHtml, /website-share-copy-btn--failed-state/);
    assert.match(reportShareHtml, /applyCopyButtonFeedback/);
    assert.match(reportShareHtml, /btn\.textContent = "Copied"/);
    assert.match(reportShareHtml, /btn\.textContent = "Select and copy"/);
    assert.match(
      reportShareHtml,
      /id="website-report-share-copy-live"[^>]*aria-live="polite"/
    );
    assert.match(reportShareHtml, /getElementById\("website-report-share-copy-live"\)/);
    assert.match(reportShareHtml, /setCopyLiveAnnounce\("Copied"\)/);
    assert.match(reportShareHtml, /setCopyLiveAnnounce\("Select and copy"\)/);
    assert.match(reportShareHtml, /setCopyLiveAnnounce/);
    assert.match(reportShareHtml, /website-share-copy-btn--busy/);
    assert.match(reportShareHtml, /setAttribute\("aria-busy", "true"\)/);
    assert.match(reportShareHtml, /removeAttribute\("aria-busy"\)/);
    assert.match(reportShareHtml, /website-share-card__hint-line/);
    assert.match(reportShareHtml, /_copyLiveRearmTimer/);
    assert.match(reportShareHtml, /resetAllCopyButtonStatesInShareCard/);
    assert.match(
      reportShareHtml,
      /copyLiveEl\._copyLiveRearmTimer/
    );
    assert.match(
      reportShareHtml,
      /resetAllCopyButtonStatesInShareCard\(btn\);[\s\S]*?clearCopyLiveForNewAttempt\(\)/
    );
    assert.match(reportShareHtml, /function clearCopyLiveForNewAttempt/);
    assert.match(reportShareHtml, /if \(!btn\) return/);
    assert.match(reportShareHtml, /btn\.isConnected === false/);
    assert.match(reportShareHtml, /id="website-report-share-bundles-hint"/);
    assert.match(reportShareHtml, /id="website-report-share-advanced-target-presets-hint"/);
    assert.match(
      reportShareHtml,
      /class="website-share-advanced-target-preset-block website-share-a11y-group website-share-a11y-group--target-markdown"/
    );
    assert.match(reportShareHtml, /wireCopy\("website-report-share-advanced-target-preset-bundles-snippet-chat-copy"/);
    assert.match(reportShareHtml, /class="website-share-card__advanced"/);
    assert.match(reportShareHtml, /Advanced share formats \(markdown, chat, email, bundles\)/);
    const reportAdvIdx = reportShareHtml.indexOf('class="website-share-card__advanced"');
    const reportUrlIdx = reportShareHtml.indexOf('id="website-report-share-url"');
    const reportSnippetIdx = reportShareHtml.indexOf('id="website-report-share-snippet"');
    const reportOpStatesIdx = reportShareHtml.indexOf('id="website-report-share-operational-states"');
    assert.ok(reportUrlIdx > 0 && reportSnippetIdx > 0 && reportOpStatesIdx > 0 && reportAdvIdx > 0);
    assert.ok(reportUrlIdx < reportSnippetIdx, "share card basic: URL before plain snippet");
    assert.ok(reportSnippetIdx < reportOpStatesIdx, "share card basic: plain snippet before operational states");
    assert.ok(reportOpStatesIdx < reportAdvIdx, "share card: operational states before advanced details");
    const reportBestFmtIdx = reportShareHtml.indexOf('id="website-report-share-best-format-hint"');
    assert.ok(reportBestFmtIdx > 0 && reportOpStatesIdx < reportBestFmtIdx, "best format shortcuts after operational states");
    assert.match(reportShareHtml, /class="website-share-best-format-shortcuts"/);
    assert.match(reportShareHtml, /id="website-report-share-copy-best-legend"/);
    assert.match(reportShareHtml, /website-share-best-for-copy-best-legend/);
    assert.match(
      reportShareHtml,
      /Slack uses chat bundle; Email uses plain bundle; Docs uses markdown bundle/
    );
    const reportCopyBestLegendIdx = reportShareHtml.indexOf('id="website-report-share-copy-best-legend"');
    const reportBestActionsIdxEarly = reportShareHtml.indexOf('id="website-report-share-best-format-actions"');
    assert.ok(
      reportCopyBestLegendIdx > 0 &&
        reportBestFmtIdx < reportCopyBestLegendIdx &&
        reportCopyBestLegendIdx < reportBestActionsIdxEarly,
      "report Copy best card legend between Best-for hint and row actions"
    );
    assert.match(reportShareHtml, /id="website-report-share-best-format-actions"/);
    assert.match(reportShareHtml, /website-share-best-for-row website-share-best-for-row--/);
    assert.match(reportShareHtml, /website-share-best-for-row--slack/);
    assert.match(reportShareHtml, /website-share-best-for-row--email/);
    assert.match(reportShareHtml, /website-share-best-for-row--docs/);
    assert.match(reportShareHtml, /website-share-best-for-row__primary/);
    assert.match(reportShareHtml, /website-share-best-for-row__links/);
    assert.match(reportShareHtml, /website-share-best-for-row__bundles/);
    assert.match(reportShareHtml, /id="website-report-share-best-slack-copy"/);
    assert.match(reportShareHtml, /id="website-report-share-best-email-copy"/);
    assert.match(reportShareHtml, /id="website-report-share-best-docs-copy"/);
    assert.match(
      reportShareHtml,
      /wireCopy\("website-report-share-best-slack-copy", "website-report-share-chat-snippet"\)/
    );
    assert.match(
      reportShareHtml,
      /wireCopy\("website-report-share-best-email-copy", "website-report-share-bundle-email"\)/
    );
    assert.match(
      reportShareHtml,
      /wireCopy\("website-report-share-best-docs-copy", "website-report-share-snippet-md"\)/
    );
    assert.match(reportShareHtml, /id="website-report-share-best-slack-copy-best"/);
    assert.match(reportShareHtml, /id="website-report-share-best-email-copy-best"/);
    assert.match(reportShareHtml, /id="website-report-share-best-docs-copy-best"/);
    assert.match(
      reportShareHtml,
      /wireCopy\("website-report-share-best-slack-copy-best", "website-report-share-best-slack-open-bundle-chat"\)/
    );
    assert.match(
      reportShareHtml,
      /wireCopy\("website-report-share-best-email-copy-best", "website-report-share-best-email-open-bundle"\)/
    );
    assert.match(
      reportShareHtml,
      /wireCopy\("website-report-share-best-docs-copy-best", "website-report-share-best-docs-open-bundle-md"\)/
    );
    assert.match(reportShareHtml, /website-share-best-for-copy-best-hint/);
    assert.ok(
      (reportShareHtml.match(/website-share-best-for-copy-best-hint/g) || []).length >= 3,
      "report: Copy best source hints for Slack, Email, Docs"
    );
    assert.match(reportShareHtml, /uses chat bundle/);
    assert.match(reportShareHtml, /uses plain bundle/);
    assert.match(reportShareHtml, /uses markdown bundle/);
    assert.ok(
      reportShareHtml.indexOf('id="website-report-share-best-slack-copy-best"') <
        reportShareHtml.indexOf("uses chat bundle"),
      "report: Slack Copy best hint follows Slack Copy best control"
    );
    assert.ok(
      reportShareHtml.indexOf('id="website-report-share-best-email-copy-best"') <
        reportShareHtml.indexOf("uses plain bundle"),
      "report: Email Copy best hint follows Email Copy best control"
    );
    assert.ok(
      reportShareHtml.indexOf('id="website-report-share-best-docs-copy-best"') <
        reportShareHtml.indexOf("uses markdown bundle"),
      "report: Docs Copy best hint follows Docs Copy best control"
    );
    const reportBestOpenSource = [
      [
        "website-report-share-best-slack-open-source",
        "chat",
        "website-report-share-best-slack-open-url",
        "website-report-share-best-slack-open-copy",
        "website-report-share-best-slack-open-bundle",
        "website-report-share-best-slack-open-bundle-copy",
        "Slack",
        "website-report-share-best-slack-open-bundle-md",
        "website-report-share-best-slack-open-bundle-md-copy",
        "website-report-share-best-slack-open-bundle-chat",
        "website-report-share-best-slack-open-bundle-chat-copy",
      ],
      [
        "website-report-share-best-email-open-source",
        "bundles",
        "website-report-share-best-email-open-url",
        "website-report-share-best-email-open-copy",
        "website-report-share-best-email-open-bundle",
        "website-report-share-best-email-open-bundle-copy",
        "Email",
        "website-report-share-best-email-open-bundle-md",
        "website-report-share-best-email-open-bundle-md-copy",
        "website-report-share-best-email-open-bundle-chat",
        "website-report-share-best-email-open-bundle-chat-copy",
      ],
      [
        "website-report-share-best-docs-open-source",
        "markdown",
        "website-report-share-best-docs-open-url",
        "website-report-share-best-docs-open-copy",
        "website-report-share-best-docs-open-bundle",
        "website-report-share-best-docs-open-bundle-copy",
        "Docs",
        "website-report-share-best-docs-open-bundle-md",
        "website-report-share-best-docs-open-bundle-md-copy",
        "website-report-share-best-docs-open-bundle-chat",
        "website-report-share-best-docs-open-bundle-chat-copy",
      ],
    ];
    const decodeReportBestBundle = (chunk) =>
      String(chunk || "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    for (const [
      rid,
      rTarget,
      urlId,
      copyId,
      bundleId,
      bundleCopyId,
      bestForName,
      mdBundleId,
      mdCopyId,
      chatBundleId,
      chatCopyId,
    ] of reportBestOpenSource) {
      const rOpen = new RegExp(`id="${rid}"[^>]*href="([^"]*)"`);
      const rOm = reportShareHtml.match(rOpen);
      assert.ok(rOm, `report best-format open source link: ${rid}`);
      const rOh = rOm[1].replace(/&amp;/g, "&");
      assert.match(rOh, /share_view=advanced/, `report ${rid} share_view`);
      assert.match(rOh, new RegExp(`share_target=${rTarget}`), `report ${rid} share_target`);
      const rValRe = new RegExp(`id="${urlId}"[^>]*value="([^"]*)"`);
      const rValM = reportShareHtml.match(rValRe);
      assert.ok(rValM, `report best-format deep-link copy field: ${urlId}`);
      const rVal = rValM[1].replace(/&amp;/g, "&");
      assert.equal(rVal, rOh, `report ${urlId} value matches open-source href`);
      assert.match(
        reportShareHtml,
        new RegExp(`wireCopy\\("${copyId}", "${urlId}"\\)`),
        `report wireCopy for ${copyId}`
      );
      const rBundRe = new RegExp(`id="${bundleId}"[^>]*>([\\s\\S]*?)<\\/textarea>`, "m");
      const rBundM = reportShareHtml.match(rBundRe);
      assert.ok(rBundM, `report best-format deep-link bundle: ${bundleId}`);
      const rBundTxt = decodeReportBestBundle(rBundM[1]).trim();
      assert.match(rBundTxt, /Websites report/, `report bundle ${bundleId} includes share label`);
      assert.ok(
        rBundTxt.includes(`Best for: ${bestForName}`),
        `report bundle ${bundleId} includes Best for line`
      );
      assert.ok(rBundTxt.includes(rOh), `report bundle ${bundleId} includes open-source URL`);
      assert.match(
        reportShareHtml,
        new RegExp(`wireCopy\\("${bundleCopyId}", "${bundleId}"\\)`),
        `report wireCopy for ${bundleCopyId}`
      );
      const rMdRe = new RegExp(`id="${mdBundleId}"[^>]*>([\\s\\S]*?)<\\/textarea>`, "m");
      const rMdM = reportShareHtml.match(rMdRe);
      assert.ok(rMdM, `report best-format md deep-link bundle: ${mdBundleId}`);
      const rMdTxt = decodeReportBestBundle(rMdM[1]).trim();
      assert.match(rMdTxt, /^\[[^\]]+\]\([^)]+\)$/, `report md bundle ${mdBundleId} is [text](url)`);
      assert.ok(rMdTxt.includes(`(${rOh})`), `report md bundle ${mdBundleId} embeds open-source URL`);
      assert.ok(
        rMdTxt.includes(`Best for: ${bestForName}`),
        `report md bundle ${mdBundleId} includes Best for label`
      );
      assert.match(
        reportShareHtml,
        new RegExp(`wireCopy\\("${mdCopyId}", "${mdBundleId}"\\)`),
        `report wireCopy for ${mdCopyId}`
      );
      const rChatRe = new RegExp(`id="${chatBundleId}"[^>]*>([\\s\\S]*?)<\\/textarea>`, "m");
      const rChatM = reportShareHtml.match(rChatRe);
      assert.ok(rChatM, `report best-format chat deep-link bundle: ${chatBundleId}`);
      const rChatTxt = decodeReportBestBundle(rChatM[1]).trim();
      assert.match(rChatTxt, /^<[^|]+\|[^>]+>$/, `report chat bundle ${chatBundleId} is <url|label>`);
      assert.ok(rChatTxt.includes(rOh), `report chat bundle ${chatBundleId} embeds open-source URL`);
      assert.ok(
        rChatTxt.includes(`Best for: ${bestForName}`),
        `report chat bundle ${chatBundleId} includes Best for label`
      );
      assert.match(
        reportShareHtml,
        new RegExp(`wireCopy\\("${chatCopyId}", "${chatBundleId}"\\)`),
        `report wireCopy for ${chatCopyId}`
      );
    }
    assert.match(reportShareHtml, /id="website-report-share-advanced-target-presets"/);
    assert.match(reportShareHtml, /id="website-report-share-advanced-target-presets-hint"/);
    assert.match(reportShareHtml, /class="website-share-advanced-target-presets"/);
    assert.match(reportShareHtml, /class="website-share-advanced-target-preset-snippets"/);
    assert.ok(
      (reportShareHtml.match(/class="website-share-advanced-target-preset-block"/g) || []).length >= 5,
      "report advanced-target preset area has grouped blocks"
    );
    const reportPresetIdx = reportShareHtml.indexOf('id="website-report-share-advanced-target-presets"');
    assert.ok(
      reportPresetIdx > 0 &&
        reportBestFmtIdx < reportPresetIdx &&
        reportPresetIdx < reportAdvIdx,
      "advanced target presets after best-format shortcuts and before Advanced details"
    );
    const decodeShareBundleTextarea = (chunk) =>
      String(chunk || "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    const advancedTargetPresetKeys = ["markdown", "chat", "named", "email", "bundles"];
    for (const dt of advancedTargetPresetKeys) {
      const pr = new RegExp(`id="website-report-share-advanced-target-preset-${dt}"[^>]*href="([^"]*)"`);
      const pm = reportShareHtml.match(pr);
      assert.ok(pm, `report advanced preset link: ${dt}`);
      const ph = pm[1].replace(/&amp;/g, "&");
      assert.match(ph, /share_view=advanced/, `report preset ${dt} share_view`);
      assert.match(ph, new RegExp(`share_target=${dt}`), `report preset ${dt} share_target`);
      assert.match(reportShareHtml, new RegExp(`id="website-report-share-advanced-target-preset-${dt}-snippet-copy"`));
      const psr = new RegExp(
        `id="website-report-share-advanced-target-preset-${dt}-snippet"[^>]*>([\\s\\S]*?)<\\/textarea>`,
        "m"
      );
      const psm = reportShareHtml.match(psr);
      assert.ok(psm, `report advanced preset snippet textarea: ${dt}`);
      const pst = decodeShareBundleTextarea(psm[1]).trim();
      const ptt = dt.charAt(0).toUpperCase() + dt.slice(1);
      assert.match(pst, /Websites report/, `report preset snippet ${dt} includes share label`);
      assert.match(pst, new RegExp(`Target: ${ptt}`), `report preset snippet ${dt} target line`);
      assert.ok(pst.includes(ph), `report preset snippet ${dt} includes preset permalink`);
      assert.match(
        reportShareHtml,
        new RegExp(`id="website-report-share-advanced-target-preset-${dt}-snippet-md-copy"`)
      );
      assert.match(
        reportShareHtml,
        new RegExp(`id="website-report-share-advanced-target-preset-${dt}-snippet-chat-copy"`)
      );
      const pmdRe = new RegExp(
        `id="website-report-share-advanced-target-preset-${dt}-snippet-md"[^>]*>([\\s\\S]*?)<\\/textarea>`,
        "m"
      );
      const pmdM = reportShareHtml.match(pmdRe);
      assert.ok(pmdM, `report preset markdown variant textarea: ${dt}`);
      const pmdTxt = decodeShareBundleTextarea(pmdM[1]).trim();
      assert.match(pmdTxt, /^\[[^\]]+\]\([^)]+\)$/, `report preset md variant ${dt} shape`);
      assert.ok(pmdTxt.includes(`(${ph})`), `report preset md variant ${dt} uses preset href`);
      const pchRe = new RegExp(
        `id="website-report-share-advanced-target-preset-${dt}-snippet-chat"[^>]*>([\\s\\S]*?)<\\/textarea>`,
        "m"
      );
      const pchM = reportShareHtml.match(pchRe);
      assert.ok(pchM, `report preset chat variant textarea: ${dt}`);
      const pchTxt = decodeShareBundleTextarea(pchM[1]).trim();
      assert.match(pchTxt, /^<[^|]+\|[^>]+>$/, `report preset chat variant ${dt} shape`);
      assert.ok(pchTxt.startsWith(`<${ph}|`), `report preset chat variant ${dt} uses preset href`);
    }
    assert.ok(
      reportShareHtml.indexOf('id="website-report-share-snippet-md"') > reportAdvIdx,
      "markdown snippet follows advanced disclosure"
    );
    assert.ok(
      reportShareHtml.indexOf('id="website-report-share-bundles-hint"') > reportAdvIdx,
      "bundles hint follows advanced disclosure"
    );
    assert.doesNotMatch(reportShareHtml, /website-share-card__target-note/, "no deep-link emphasis without share_target");
    assert.match(reportShareHtml, /id="website-report-share-direct-links"/);
    assert.match(reportShareHtml, /id="website-report-share-direct-links-hint"/);
    const reportDirectAfter = reportShareHtml.split('id="website-report-share-direct-links"')[1] || "";
    const reportDirectEnd = reportDirectAfter.indexOf("</p>");
    const reportDirectSlice =
      reportDirectEnd > 0 ? reportDirectAfter.slice(0, reportDirectEnd + 4) : reportDirectAfter;
    assert.match(reportDirectSlice, /share_view=advanced/);
    assert.match(reportDirectSlice, /share_target=markdown/);
    assert.match(reportDirectSlice, /share_target=chat/);
    assert.match(reportDirectSlice, /share_target=named/);
    assert.match(reportDirectSlice, /share_target=email/);
    assert.match(reportDirectSlice, /share_target=bundles/);
    const reportDirectTargets = ["markdown", "chat", "named", "email", "bundles"];
    for (const dt of reportDirectTargets) {
      assert.match(reportShareHtml, new RegExp(`id="website-report-share-direct-${dt}-copy"`));
      assert.match(reportShareHtml, new RegExp(`id="website-report-share-direct-${dt}-bundle-copy"`));
      const urlFieldRe = new RegExp(`id="website-report-share-direct-${dt}-url"[^>]*value="([^"]*)"`);
      const urlM = reportShareHtml.match(urlFieldRe);
      assert.ok(urlM, `report direct copy URL field: ${dt}`);
      const dec = urlM[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"');
      assert.match(dec, /share_view=advanced/, `report ${dt} copy value has share_view`);
      assert.match(dec, new RegExp(`share_target=${dt}`), `report ${dt} copy value has share_target`);
      const bundleRe = new RegExp(
        `id="website-report-share-direct-${dt}-bundle"[^>]*>([\\s\\S]*?)<\\/textarea>`,
        "m"
      );
      const bundleM = reportShareHtml.match(bundleRe);
      assert.ok(bundleM, `report deep-link bundle textarea: ${dt}`);
      const btxt = decodeShareBundleTextarea(bundleM[1]).trim();
      const tt = dt.charAt(0).toUpperCase() + dt.slice(1);
      assert.match(btxt, /Websites report/, `report bundle ${dt} includes share label`);
      assert.match(btxt, new RegExp(`Target: ${tt}`), `report bundle ${dt} target line`);
      assert.ok(btxt.includes(dec), `report bundle ${dt} includes direct permalink`);
    }
    const reportAdvDetailsTag = (pageRes.text || "").match(/<details class="website-share-card__advanced"[^>]*>/);
    assert.ok(reportAdvDetailsTag);
    assert.doesNotMatch(
      reportAdvDetailsTag[0],
      /\sopen[\s>]/,
      "report Advanced share formats collapsed by default"
    );
    const pageReportShareAdv = await managerAgent.get("/admin/crm/websites/report?share_view=advanced");
    assert.equal(pageReportShareAdv.status, 200);
    const reportAdvOpenTag = (pageReportShareAdv.text || "").match(
      /<details class="website-share-card__advanced"[^>]*>/
    );
    assert.ok(reportAdvOpenTag);
    assert.match(reportAdvOpenTag[0], /\sopen[\s>]/, "report share_view=advanced opens Advanced block");
    const pageReportShareViewBad = await managerAgent.get("/admin/crm/websites/report?share_view=other");
    assert.equal(pageReportShareViewBad.status, 200);
    const reportBadTag = (pageReportShareViewBad.text || "").match(
      /<details class="website-share-card__advanced"[^>]*>/
    );
    assert.ok(reportBadTag);
    assert.doesNotMatch(reportBadTag[0], /\sopen[\s>]/, "invalid share_view leaves Advanced collapsed");
    const pageReportShareViewCi = await managerAgent.get("/admin/crm/websites/report?share_view=ADVANCED");
    assert.equal(pageReportShareViewCi.status, 200);
    const reportCiTag = (pageReportShareViewCi.text || "").match(/<details class="website-share-card__advanced"[^>]*>/);
    assert.ok(reportCiTag);
    assert.match(reportCiTag[0], /\sopen[\s>]/, "share_view=advanced is case-insensitive");
    const pageReportShareTargetMd = await managerAgent.get("/admin/crm/websites/report?share_target=markdown");
    assert.equal(pageReportShareTargetMd.status, 200);
    const reportTargetMdTag = (pageReportShareTargetMd.text || "").match(
      /<details class="website-share-card__advanced"[^>]*>/
    );
    assert.ok(reportTargetMdTag);
    assert.match(reportTargetMdTag[0], /\sopen[\s>]/, "share_target=markdown opens Advanced without share_view");
    const reportTargetNotes = (pageReportShareTargetMd.text || "").match(/website-share-card__target-note/g) || [];
    assert.equal(reportTargetNotes.length, 1, "one deep-link emphasis note for markdown");
    const reportNoteIdx = (pageReportShareTargetMd.text || "").indexOf("website-share-card__target-note");
    const reportMdCtlIdx = (pageReportShareTargetMd.text || "").indexOf('id="website-report-share-snippet-md"');
    assert.ok(reportNoteIdx > 0 && reportMdCtlIdx > reportNoteIdx, "emphasis precedes markdown field");
    const pageReportShareTargetBad = await managerAgent.get("/admin/crm/websites/report?share_target=invalid_key");
    assert.equal(pageReportShareTargetBad.status, 200);
    const reportTargetBadTag = (pageReportShareTargetBad.text || "").match(
      /<details class="website-share-card__advanced"[^>]*>/
    );
    assert.ok(reportTargetBadTag);
    assert.doesNotMatch(
      reportTargetBadTag[0],
      /\sopen[\s>]/,
      "invalid share_target does not open Advanced"
    );
    assert.doesNotMatch(pageReportShareTargetBad.text || "", /website-share-card__target-note/);
    const pageReportShareTargetCi = await managerAgent.get("/admin/crm/websites/report?share_target=BUNDLES");
    assert.equal(pageReportShareTargetCi.status, 200);
    const reportBundlesOpenTag = (pageReportShareTargetCi.text || "").match(
      /<details class="website-share-card__advanced"[^>]*>/
    );
    assert.ok(reportBundlesOpenTag);
    assert.match(reportBundlesOpenTag[0], /\sopen[\s>]/, "share_target=bundles opens Advanced");
    const reportBundlesNote = (pageReportShareTargetCi.text || "").match(/website-share-card__target-note/g) || [];
    assert.equal(reportBundlesNote.length, 1);
    const bundlesHintIdx = (pageReportShareTargetCi.text || "").indexOf('id="website-report-share-bundles-hint"');
    const bundlesNoteIdx = (pageReportShareTargetCi.text || "").indexOf("website-share-card__target-note");
    assert.ok(bundlesNoteIdx > 0 && bundlesHintIdx > bundlesNoteIdx);
    const reportSharePresetsIdx = (pageRes.text || "").indexOf('id="website-report-share-operational-states"');
    assert.ok(reportSharePresetsIdx > 0);
    const reportSharePresetsSlice = (pageRes.text || "").slice(reportSharePresetsIdx, reportSharePresetsIdx + 1400);
    assert.match(reportSharePresetsSlice, /review_status=changes_requested/);
    assert.match(reportSharePresetsSlice, /quality_tier=low/);
    assert.match(reportSharePresetsSlice, /quality_tier=high/);
    assert.match(reportSharePresetsSlice, /has_hours=no/);
    assert.match(reportSharePresetsSlice, /has_established_year=no/);
    const reportOpCtxQs =
      "view_set=quality&city=Kitwe" + (reportCatName ? `&category=${encodeURIComponent(reportCatName)}` : "");
    const pageReportOpCtx = await managerAgent.get("/admin/crm/websites/report?" + reportOpCtxQs);
    assert.equal(pageReportOpCtx.status, 200);
    const reportOpCtxM = (pageReportOpCtx.text || "").match(
      /id="website-report-share-operational-states"[^>]*>([\s\S]*?)<\/p>/
    );
    assert.ok(reportOpCtxM, "report operational states paragraph");
    assert.match(reportOpCtxM[1], /view_set=quality/);
    assert.match(reportOpCtxM[1], /city=Kitwe/);
    if (reportCatName) assert.match(reportOpCtxM[1], /category=/);
    const pageReportOmitMin = await managerAgent.get("/admin/crm/websites/report?quality_min=40");
    assert.equal(pageReportOmitMin.status, 200);
    const reportOmitMinM = (pageReportOmitMin.text || "").match(
      /id="website-report-share-operational-states"[^>]*>([\s\S]*?)<\/p>/
    );
    assert.ok(reportOmitMinM);
    assert.doesNotMatch(
      reportOmitMinM[1],
      /quality_min=40/,
      "operational report links omit ad-hoc quality_min (permalink may still include it)"
    );
    assert.match(pageRes.text || "", /id="website-report-share-url"/);
    assert.match(pageRes.text || "", /id="website-report-share-copy"/);
    assert.match(pageRes.text || "", /id="website-report-share-snippet"/);
    assert.match(pageRes.text || "", /id="website-report-share-snippet-copy"/);
    assert.match(pageRes.text || "", /id="website-report-share-snippet-md"/);
    assert.match(pageRes.text || "", /id="website-report-share-snippet-md-copy"/);
    const reportMdM = (pageRes.text || "").match(/id="website-report-share-snippet-md"[^>]*>([\s\S]*?)<\/textarea>/);
    assert.ok(reportMdM, "report markdown snippet textarea");
    const reportMd = reportMdM[1].trim().replace(/&amp;/g, "&");
    const reportMdMid = reportMd.indexOf("](");
    assert.ok(reportMdMid > 0 && reportMd.startsWith("[") && reportMd.endsWith(")"), "markdown link shape");
    assert.ok(reportMd.slice(1, reportMdMid).includes("Websites report"), "markdown label");
    assert.ok(reportMd.slice(reportMdMid + 2, -1).includes("/admin/crm/websites/report"), "markdown url");
    assert.match(pageRes.text || "", /id="website-report-share-chat-snippet"/);
    assert.match(pageRes.text || "", /id="website-report-share-chat-copy"/);
    const reportChatM = (pageRes.text || "").match(/id="website-report-share-chat-snippet"[^>]*>([\s\S]*?)<\/textarea>/);
    assert.ok(reportChatM);
    const reportChat = reportChatM[1].trim().replace(/&amp;/g, "&");
    assert.ok(reportChat.startsWith("<") && reportChat.endsWith(">"), "Slack link wrapper");
    const reportChatPipe = reportChat.indexOf("|");
    assert.ok(reportChatPipe > 1 && reportChatPipe < reportChat.length - 2);
    assert.ok(reportChat.slice(1, reportChatPipe).includes("/admin/crm/websites/report"), "chat url first");
    assert.ok(reportChat.slice(reportChatPipe + 1, -1).includes("Websites report"), "chat label after pipe");
    assert.match(pageRes.text || "", /id="website-report-share-named"/);
    assert.match(pageRes.text || "", /id="website-report-share-named-copy"/);
    const reportNamedM = (pageRes.text || "").match(/id="website-report-share-named"[^>]*>([\s\S]*?)<\/textarea>/);
    assert.ok(reportNamedM, "report named link textarea");
    const reportNamed = reportNamedM[1].trim().replace(/&amp;/g, "&");
    const reportNamedSep = " — ";
    const reportNamedIdx = reportNamed.indexOf(reportNamedSep);
    assert.ok(reportNamedIdx > 0, "named link has label — url separator");
    assert.ok(reportNamed.slice(0, reportNamedIdx).includes("Websites report"));
    assert.ok(reportNamed.slice(reportNamedIdx + reportNamedSep.length).includes("/admin/crm/websites/report"));
    assert.match(pageRes.text || "", /id="website-report-share-email-subject"/);
    assert.match(pageRes.text || "", /id="website-report-share-email-subject-copy"/);
    assert.match(pageRes.text || "", /id="website-report-share-email-body"/);
    assert.match(pageRes.text || "", /id="website-report-share-email-body-copy"/);
    const reportEmailSubjM = (pageRes.text || "").match(
      /id="website-report-share-email-subject"[^>]*value="([^"]*)"/
    );
    assert.ok(reportEmailSubjM);
    const reportEmailSubj = reportEmailSubjM[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"');
    assert.ok(reportEmailSubj.includes("Websites report"));
    const reportEmailBodyM = (pageRes.text || "").match(
      /id="website-report-share-email-body"[^>]*>([\s\S]*?)<\/textarea>/
    );
    assert.ok(reportEmailBodyM);
    const reportEmailBody = reportEmailBodyM[1].trim().replace(/&amp;/g, "&");
    const reportEmailParts = reportEmailBody.split("\n\n");
    assert.equal(reportEmailParts.length, 2, "email body is label then blank line then URL");
    assert.equal(reportEmailParts[0].trim(), reportEmailSubj.trim());
    assert.ok(reportEmailParts[1].includes("/admin/crm/websites/report"));
    assert.match(pageRes.text || "", /Open email draft/);
    const reportMailtoM = (pageRes.text || "").match(
      /id="website-report-share-email-draft"[^>]*href="([^"]+)"/
    );
    assert.ok(reportMailtoM);
    const reportMailtoHref = reportMailtoM[1].replace(/&amp;/g, "&");
    assert.match(reportMailtoHref, /^mailto:\?/);
    const reportMailtoParams = new URLSearchParams(reportMailtoHref.replace(/^mailto:\?/, ""));
    assert.equal(reportMailtoParams.get("subject"), reportEmailSubj.trim());
    assert.equal(reportMailtoParams.get("body"), reportEmailBody);
    assert.match(pageRes.text || "", /id="website-report-share-bundles-hint"/);
    assert.match(pageRes.text || "", /id="website-report-share-bundle-all"/);
    assert.match(pageRes.text || "", /id="website-report-share-bundle-all-copy"/);
    const reportBundleAllM = (pageRes.text || "").match(/id="website-report-share-bundle-all"[^>]*>([\s\S]*?)<\/textarea>/);
    assert.ok(reportBundleAllM, "report all-formats bundle textarea");
    const reportBundleAll = reportBundleAllM[1].trim().replace(/&amp;/g, "&");
    assert.ok(reportBundleAll.startsWith("Summary\n"), "all-formats bundle starts with Summary section");
    const reportBundleSectionOrder = [
      "Summary",
      "URL",
      "Plain snippet",
      "Markdown",
      "Chat",
      "Named link",
      "Email subject",
      "Email body",
    ];
    let reportBundlePrev = -1;
    for (const h of reportBundleSectionOrder) {
      const idx = reportBundleAll.indexOf(h, reportBundlePrev + 1);
      assert.ok(idx > reportBundlePrev, `report bundle section order: ${h}`);
      reportBundlePrev = idx;
    }
    assert.ok(reportBundleAll.includes(reportMd.trim()), "bundle includes markdown snippet");
    assert.ok(reportBundleAll.includes(reportChat.trim()), "bundle includes chat snippet");
    assert.ok(reportBundleAll.includes(reportNamed.trim()), "bundle includes named link");
    assert.ok(reportBundleAll.includes(reportEmailSubj.trim()), "bundle includes email subject");
    assert.ok(reportBundleAll.includes(reportEmailBody.trim()), "bundle includes email body");
    const reportBundleQuickM = (pageRes.text || "").match(/id="website-report-share-bundle-quick"[^>]*>([\s\S]*?)<\/textarea>/);
    assert.ok(reportBundleQuickM);
    assert.equal(reportBundleQuickM[1].trim().replace(/&amp;/g, "&"), reportNamed);
    const reportBundleEmailM = (pageRes.text || "").match(/id="website-report-share-bundle-email"[^>]*>([\s\S]*?)<\/textarea>/);
    assert.ok(reportBundleEmailM);
    const reportBundleEmail = reportBundleEmailM[1].trim().replace(/&amp;/g, "&");
    assert.ok(reportBundleEmail.startsWith("Subject: "));
    assert.equal(reportBundleEmail, `Subject: ${reportEmailSubj.trim()}\n\n${reportEmailBody}`);
    const reportBundleChatM = (pageRes.text || "").match(/id="website-report-share-bundle-chat"[^>]*>([\s\S]*?)<\/textarea>/);
    assert.ok(reportBundleChatM);
    assert.equal(reportBundleChatM[1].trim().replace(/&amp;/g, "&"), reportChat);
    const reportSnippetM = (pageRes.text || "").match(
      /id="website-report-share-snippet"[^>]*>([\s\S]*?)<\/textarea>/
    );
    assert.ok(reportSnippetM, "report combined snippet textarea");
    const reportSnippetLines = reportSnippetM[1].trim().split(/\n/);
    assert.ok(reportSnippetLines.length >= 2, "snippet is label then URL");
    assert.ok(reportSnippetLines[0].includes("Websites report"));
    assert.ok(reportSnippetLines[1].includes("/admin/crm/websites/report"));
    assert.match(
      pageRes.text || "",
      /id="website-report-share-url"[^>]*value="[^"]*\/admin\/crm\/websites\/report"/,
      "share field contains canonical report path"
    );
    assert.match(pageRes.text || "", /Report presets/i);
    assert.match(pageRes.text || "", /href="\/admin\/crm\/websites\/report\?review_status=changes_requested&amp;quality_tier=low"/);
    assert.match(pageRes.text || "", /href="\/admin\/crm\/websites\/report\?review_status=changes_requested"/);
    assert.match(pageRes.text || "", /href="\/admin\/crm\/websites\/report\?published=yes&amp;quality_tier=high&amp;has_hours=yes&amp;has_verified_specialities=yes"/);
    assert.match(pageRes.text || "", /href="\/admin\/crm\/websites\/report\?has_hours=no"/);
    assert.match(pageRes.text || "", /href="\/admin\/crm\/websites\/report\?has_established_year=no"/);
    assert.match(pageRes.text || "", /href="\/admin\/crm\/websites\/report\?quality_tier=high"/);
    assert.doesNotMatch(
      pageRes.text || "",
      /\/admin\/crm\/websites\/report\?review_status=changes_requested&amp;quality_tier=low&amp;category=/
    );
    assert.match(pageRes.text || "", new RegExp(`#${subPublishedId}`));
    assert.match(pageRes.text || "", new RegExp(`#${subLegacyId}`));
    assert.match(pageRes.text || "", /Quality tier/i);
    assert.match(pageRes.text || "", /Min quality score/i);
    assert.match(pageRes.text || "", /Has verified specialities/i);
    assert.match(pageRes.text || "", /Has hours/i);
    assert.match(pageRes.text || "", /Established year present/i);
    assert.match(pageRes.text || "", /id="report_category"/);
    assert.match(pageRes.text || "", /name="category"/);
    assert.match(pageRes.text || "", /<th>Missing data<\/th>/);
    assert.match(pageRes.text || "", /Open review/i);
    assert.match(pageRes.text || "", /View in queue/i);
    assert.match(pageRes.text || "", new RegExp(`/admin/field-agent/submissions/${subPublishedId}/website-listing-review`));
    assert.match(pageRes.text || "", /\/admin\/crm\?queue=websites/);
    assert.match(pageRes.text || "", /review_status=/);
    assert.match(pageRes.text || "", /city=Kitwe/);
    assert.match(pageRes.text || "", /quality_tier=/);
    assert.match(pageRes.text || "", /missing_badge=/);
    const missingSliceAnchors = (pageRes.text || "").match(/Missing:/g) || [];
    assert.equal(missingSliceAnchors.length, 1);
    const afterMissing = (pageRes.text || "").split("Missing:")[1];
    assert.ok(afterMissing);
    const missingChunk = afterMissing.split("</div>")[0] || "";
    const missingLinkAnchors = missingChunk.match(/<a\s/g) || [];
    assert.ok(missingLinkAnchors.length >= 2 && missingLinkAnchors.length <= 3);
    assert.match(pageRes.text || "", /missing_badge=missing_about/);
    assert.match(pageRes.text || "", /Missing about text<\/a>/);
    assert.match(pageRes.text || "", /\(\+[1-9]\d* more\)/, "missing-data summary shows +N more when row has >2 gaps");
    const legacyRowHtml = (pageRes.text || "").split(`#${subLegacyId}`)[1] || "";
    const legacyRowSlice = legacyRowHtml.slice(0, 4000);
    assert.match(legacyRowSlice, /gap(s)?/i, "legacy row shows gap count in Missing data column");
    const publishedRowHtml = (pageRes.text || "").split(`#${subPublishedId}`)[1] || "";
    const publishedRowSlice = publishedRowHtml.slice(0, 4000);
    assert.match(publishedRowSlice, /—/, "complete row shows em dash in Missing data column");

    const pageHighlightLegacy = await managerAgent.get("/admin/crm/websites/report?highlight_submission_id=" + subLegacyId);
    assert.equal(pageHighlightLegacy.status, 200);
    assert.match(pageHighlightLegacy.text || "", /website-report-row--highlight/);
    const hlCount =
      ((pageHighlightLegacy.text || "").match(/class="[^"]*website-report-row--highlight/g) || []).length;
    assert.equal(hlCount, 1, "exactly one row highlighted when id matches");
    const hlLegacyIdx = (pageHighlightLegacy.text || "").indexOf("#" + subLegacyId);
    assert.ok(hlLegacyIdx > 0);
    assert.match(
      (pageHighlightLegacy.text || "").slice(Math.max(0, hlLegacyIdx - 600), hlLegacyIdx),
      /website-report-row--highlight/
    );
    const pageHighlightInvalid = await managerAgent.get("/admin/crm/websites/report?highlight_submission_id=xyz");
    assert.equal(pageHighlightInvalid.status, 200);
    const pageHighlightGhost = await managerAgent.get("/admin/crm/websites/report?highlight_submission_id=999999999");
    assert.equal(pageHighlightGhost.status, 200);
    assert.doesNotMatch(pageHighlightGhost.text || "", /website-report-row--highlight/);
    const csvReportNoHl = await managerAgent.get("/admin/crm/websites/report?format=csv");
    assert.equal(csvReportNoHl.status, 200);
    const csvReportWithHl = await managerAgent.get(
      "/admin/crm/websites/report?format=csv&highlight_submission_id=" + subPublishedId
    );
    assert.equal(csvReportWithHl.status, 200);
    assert.equal((csvReportWithHl.text || "").trim(), (csvReportNoHl.text || "").trim());

    if (reportCatName) {
      assert.ok((pageRes.text || "").includes("category=" + encodeURIComponent(reportCatName)));
      const reportByCategory = await managerAgent.get(
        "/admin/crm/websites/report?category=" + encodeURIComponent(reportCatName)
      );
      assert.equal(reportByCategory.status, 200);
      const catEnc = encodeURIComponent(reportCatName);
      assert.ok(
        (reportByCategory.text || "").includes(
          "review_status=changes_requested&amp;quality_tier=low&amp;category=" + catEnc
        ),
        "Needs attention preset preserves category"
      );
      assert.match(reportByCategory.text || "", new RegExp(`#${subPublishedId}`));
      assert.doesNotMatch(reportByCategory.text || "", new RegExp(`#${subLegacyId}`));
      const csvModHrefFiltered = (reportByCategory.text || "").match(
        /href="(\/admin\/crm\/websites\/report[^"]+)"[^>]*>\s*CSV · Moderation/
      );
      assert.ok(csvModHrefFiltered);
      const csvModDecoded = csvModHrefFiltered[1].replace(/&amp;/g, "&");
      assert.ok(csvModDecoded.includes("category=" + catEnc), "CSV · Moderation preserves category");
      assert.ok(csvModDecoded.includes("export_set=moderation"));
      const reportCatCsv = await managerAgent.get(
        "/admin/crm/websites/report?format=csv&published=yes&category=" + encodeURIComponent(reportCatName)
      );
      assert.equal(reportCatCsv.status, 200);
      assert.match(reportCatCsv.text || "", new RegExp(`"${subPublishedId}"`));
      assert.doesNotMatch(reportCatCsv.text || "", new RegExp(`"${subLegacyId}"`));
      const reportCatWithHours = await managerAgent.get(
        "/admin/crm/websites/report?has_hours=yes&category=" + encodeURIComponent(reportCatName)
      );
      assert.equal(reportCatWithHours.status, 200);
      assert.match(reportCatWithHours.text || "", new RegExp(`#${subPublishedId}`));
    }
    assert.match(pageRes.text || "", /\(\s*high|medium|low\s*\)/i);
    assert.match(pageRes.text || "", />2<\/td>/);
    assert.match(pageRes.text || "", />1<\/td>/);
    assert.match(pageRes.text || "", /complete|partial|none/i);
    assert.match(pageRes.text || "", /Export CSV \(default columns\)/i);
    assert.match(pageRes.text || "", /export_set=moderation/);
    assert.match(pageRes.text || "", /export_set=quality/);
    assert.match(pageRes.text || "", /export_set=publish_readiness/);

    const shareFiltered = await managerAgent.get(
      "/admin/crm/websites/report?review_status=submitted&quality_tier=low&has_hours=yes&view_set=quality"
    );
    assert.equal(shareFiltered.status, 200);
    const shareInputM = (shareFiltered.text || "").match(/id="website-report-share-url"[^>]*value="([^"]*)"/);
    assert.ok(shareInputM, "share URL input present");
    const shareDecoded = shareInputM[1].replace(/&amp;/g, "&");
    assert.ok(shareDecoded.includes("review_status=submitted"), "share preserves review_status");
    assert.ok(shareDecoded.includes("quality_tier=low"), "share preserves quality_tier");
    assert.ok(shareDecoded.includes("has_hours=yes"), "share preserves has_hours");
    assert.ok(shareDecoded.includes("view_set=quality"), "share preserves view_set");
    assert.ok(!shareDecoded.includes("export_set="), "share URL omits CSV export_set");
    assert.ok(!shareDecoded.includes("format=csv"), "share URL omits CSV format");
    assert.match(shareFiltered.text || "", /columns quality/);
    assert.match(shareFiltered.text || "", /review submitted/);
    const sfSn = (shareFiltered.text || "").match(/id="website-report-share-snippet"[^>]*>([\s\S]*?)<\/textarea>/);
    assert.ok(sfSn);
    const sfLines = sfSn[1].trim().split(/\n/);
    assert.ok(sfLines[0].includes("review submitted"), "snippet line 1 reflects summary");
    assert.ok(sfLines[1].includes("/admin/crm/websites/report"), "snippet line 2 is URL");

    const reportRoundTrip = await managerAgent.get(
      "/admin/crm/websites/report?view_set=quality&quality_tier=low&highlight_submission_id=" + subLegacyId
    );
    assert.equal(reportRoundTrip.status, 200);
    const vqM = (reportRoundTrip.text || "").match(/href="(\/admin\/crm\?queue=websites[^"]*report_return[^"]*)"/);
    assert.ok(vqM, "View in queue includes report_return");
    const queueFromReport = await managerAgent.get(vqM[1].replace(/&amp;/g, "&"));
    assert.equal(queueFromReport.status, 200);
    assert.match(queueFromReport.text || "", /Back to report/i);
    assert.ok(
      (queueFromReport.text || "").includes("highlight_submission_id=" + subLegacyId),
      "queue card View in report restores highlight for that submission"
    );
    assert.ok(
      (queueFromReport.text || "").includes("view_set=quality"),
      "queue card View in report preserves view_set from report_return"
    );
    const badReturnQueue = await managerAgent.get(
      "/admin/crm?queue=websites&report_return=" + encodeURIComponent("http://evil.example/")
    );
    assert.equal(badReturnQueue.status, 200);
    assert.doesNotMatch(badReturnQueue.text || "", /Back to report/);

    const csvModHrefDefault = (pageRes.text || "").match(
      /href="(\/admin\/crm\/websites\/report[^"]+)"[^>]*>\s*CSV · Moderation/
    );
    assert.ok(csvModHrefDefault);
    assert.ok(!csvModHrefDefault[1].replace(/&amp;/g, "&").includes("category="));
    assert.match(pageRes.text || "", /Table column view/i);
    assert.match(pageRes.text || "", /view_set=moderation/);
    assert.match(pageRes.text || "", /view_set=quality/);
    assert.match(pageRes.text || "", /view_set=publish_readiness/);

    const htmlQuality = await managerAgent.get("/admin/crm/websites/report?view_set=quality");
    assert.equal(htmlQuality.status, 200);
    assert.match(htmlQuality.text || "", /Open review/i);
    assert.doesNotMatch(htmlQuality.text || "", /<th>Tenant<\/th>/);
    assert.match(htmlQuality.text || "", /<th>Quality<\/th>/);
    assert.match(htmlQuality.text || "", /<th>Missing data<\/th>/);

    const htmlModeration = await managerAgent.get("/admin/crm/websites/report?view_set=moderation");
    assert.equal(htmlModeration.status, 200);
    assert.match(htmlModeration.text || "", /Open review/i);
    assert.match(htmlModeration.text || "", /<th>Tenant<\/th>/);
    assert.doesNotMatch(htmlModeration.text || "", /<th>Specs<\/th>/);
    assert.match(htmlModeration.text || "", /<th>Missing data<\/th>/);

    const htmlPublishV = await managerAgent.get("/admin/crm/websites/report?view_set=publish_readiness");
    assert.equal(htmlPublishV.status, 200);
    assert.match(htmlPublishV.text || "", /Open review/i);
    assert.doesNotMatch(htmlPublishV.text || "", /<th>Specs<\/th>/);
    assert.match(htmlPublishV.text || "", /<th>Published at<\/th>/);
    assert.match(htmlPublishV.text || "", /<th>Missing data<\/th>/);

    const htmlBadVs = await managerAgent.get("/admin/crm/websites/report?view_set=not_a_valid_view");
    assert.equal(htmlBadVs.status, 200);
    assert.match(htmlBadVs.text || "", /<th>Tenant<\/th>/);
    assert.match(htmlBadVs.text || "", /<th>Specs<\/th>/);

    const csvRes = await managerAgent.get("/admin/crm/websites/report?format=csv&published=yes");
    assert.equal(csvRes.status, 200);
    assert.match(String(csvRes.headers["content-type"] || ""), /text\/csv/i);
    assert.doesNotMatch(csvRes.text || "", /Open review/i);
    assert.match(csvRes.text || "", /"submission_id","lead_name","tenant","field_agent"/);
    assert.match(csvRes.text || "", /"quality_score","quality_tier","established_year","has_established_year"/);
    assert.match(csvRes.text || "", /"missing_count","missing_summary"/);
    assert.match(csvRes.text || "", new RegExp(`"${subPublishedId}"`));
    assert.doesNotMatch(csvRes.text || "", new RegExp(`"${subLegacyId}"`));
    const publishedCsvLine = (csvRes.text || "").split("\n").find((ln) => ln.includes(`"${subPublishedId}"`));
    assert.ok(publishedCsvLine);
    assert.match(publishedCsvLine, /,"0",""\s*$/);
    const csvAll = await managerAgent.get("/admin/crm/websites/report?format=csv");
    assert.equal(csvAll.status, 200);
    const legacyCsvLine = (csvAll.text || "").split("\n").find((ln) => ln.includes(`"${subLegacyId}"`));
    assert.ok(legacyCsvLine);
    assert.ok(!/,"0",""\s*$/.test(legacyCsvLine), "legacy row exports non-zero missing_count");
    assert.ok(legacyCsvLine.includes("Missing about"), "legacy CSV row lists missing_summary labels");

    const csvWithHtmlViewParam = await managerAgent.get(
      "/admin/crm/websites/report?format=csv&published=yes&view_set=quality"
    );
    assert.equal(csvWithHtmlViewParam.status, 200);
    assert.equal(
      (csvWithHtmlViewParam.text || "").trim().split("\n")[0],
      (csvRes.text || "").trim().split("\n")[0]
    );

    const csvModeration = await managerAgent.get(
      "/admin/crm/websites/report?format=csv&published=yes&export_set=moderation"
    );
    assert.equal(csvModeration.status, 200);
    const modHead = (csvModeration.text || "").trim().split("\n")[0];
    assert.equal(
      modHead,
      '"submission_id","lead_name","city","tenant","field_agent","phone_raw","review_status","published","submission_updated_at","review_requested_at"'
    );
    const csvQuality = await managerAgent.get("/admin/crm/websites/report?format=csv&published=yes&export_set=quality");
    assert.equal(csvQuality.status, 200);
    const qualHead = (csvQuality.text || "").trim().split("\n")[0];
    assert.equal(
      qualHead,
      '"submission_id","lead_name","city","quality_score","quality_tier","established_year","has_established_year","specialities_count","verified_specialities_count","hours_completeness","has_hours","missing_count","missing_summary"'
    );
    const csvPublishReady = await managerAgent.get(
      "/admin/crm/websites/report?format=csv&published=yes&export_set=publish_readiness"
    );
    assert.equal(csvPublishReady.status, 200);
    const pubHead = (csvPublishReady.text || "").trim().split("\n")[0];
    assert.equal(
      pubHead,
      '"submission_id","lead_name","tenant","field_agent","review_status","published","company_id","quality_score","quality_tier","verified_specialities_count","has_hours","has_established_year","established_year","review_requested_at","company_created_at","missing_count","missing_summary"'
    );
    const csvInvalidSet = await managerAgent.get(
      "/admin/crm/websites/report?format=csv&published=yes&export_set=__invalid__"
    );
    assert.equal(csvInvalidSet.status, 200);
    assert.equal((csvInvalidSet.text || "").trim().split("\n")[0], (csvRes.text || "").trim().split("\n")[0]);
    const lineCountDefault = (csvRes.text || "").trim().split("\n").length;
    assert.equal((csvModeration.text || "").trim().split("\n").length, lineCountDefault);
    assert.equal((csvQuality.text || "").trim().split("\n").length, lineCountDefault);
    assert.equal((csvPublishReady.text || "").trim().split("\n").length, lineCountDefault);

    const htmlFiltered = await managerAgent.get(
      "/admin/crm/websites/report?has_verified_specialities=yes&has_hours=yes&has_established_year=yes&quality_tier=high"
    );
    assert.equal(htmlFiltered.status, 200);
    assert.match(htmlFiltered.text || "", new RegExp(`#${subPublishedId}`));
    assert.doesNotMatch(htmlFiltered.text || "", new RegExp(`#${subLegacyId}`));

    const csvFiltered = await managerAgent.get(
      "/admin/crm/websites/report?format=csv&has_verified_specialities=yes&has_hours=yes&has_established_year=yes&quality_tier=high"
    );
    assert.equal(csvFiltered.status, 200);
    assert.match(csvFiltered.text || "", new RegExp(`"${subPublishedId}"`));
    assert.doesNotMatch(csvFiltered.text || "", new RegExp(`"${subLegacyId}"`));

    const csvPreset = await managerAgent.get(
      "/admin/crm/websites/report?format=csv&review_status=changes_requested&quality_tier=low"
    );
    assert.equal(csvPreset.status, 200);
    assert.match(String(csvPreset.headers["content-type"] || ""), /text\/csv/i);

    const htmlManual = await managerAgent.get(
      "/admin/crm/websites/report?review_status=changes_requested&quality_tier=low&city=Lusaka"
    );
    assert.equal(htmlManual.status, 200);
    assert.match(htmlManual.text || "", /value="Lusaka"/);
  } finally {
    try {
      if (companyId) await pool.query(`DELETE FROM public.companies WHERE id = $1`, [companyId]);
      for (const sid of [subPublishedId, subLegacyId].filter(Boolean)) {
        await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [sid]);
      }
      if (agentId) await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
      for (const aid of [managerId, viewerId].filter(Boolean)) {
        await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [aid]);
      }
    } catch {
      /* ignore */
    }
    resetBootstrapForTests();
  }
});

test("admin websites queue bulk changes-requested updates selected items safely", { skip: !isPgConfigured() }, async () => {
  runBootstrap();
  const pool = getPgPool();
  await ensureFieldAgentSchema(pool);
  const app = createModerationHttpApp();
  const tenantId = TENANT_ZM;
  const suffix = uniq();
  const pw = "WebBulk_1!";
  const hash = await bcrypt.hash(pw, 4);

  let managerId;
  let editorId;
  let viewerId;
  let agentId;
  let subA;
  let subB;
  let subC;
  let taskA;
  let taskB;
  let taskC;
  let publishedCompanyC = null;
  let publishedCompanyA = null;
  let categoryAName = "";

  try {
    managerId = await adminUsersRepo.insertUser(pool, {
      username: `web_bulk_mgr_${suffix}`,
      passwordHash: hash,
      role: ROLES.TENANT_MANAGER,
      tenantId,
      displayName: "",
    });
    editorId = await adminUsersRepo.insertUser(pool, {
      username: `web_bulk_edit_${suffix}`,
      passwordHash: hash,
      role: ROLES.TENANT_EDITOR,
      tenantId,
      displayName: "",
    });
    viewerId = await adminUsersRepo.insertUser(pool, {
      username: `web_bulk_view_${suffix}`,
      passwordHash: hash,
      role: ROLES.TENANT_VIEWER,
      tenantId,
      displayName: "",
    });
    agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId,
      username: `web_bulk_fa_${suffix}`,
      passwordHash: hash,
      displayName: "",
      phone: "",
    });

    subA = await insertProviderSubmission(pool, { tenantId, fieldAgentId: agentId, phoneNorm: makePhoneNorm(`${suffix}_a`) });
    subB = await insertProviderSubmission(pool, { tenantId, fieldAgentId: agentId, phoneNorm: makePhoneNorm(`${suffix}_b`) });
    subC = await insertProviderSubmission(pool, { tenantId, fieldAgentId: agentId, phoneNorm: makePhoneNorm(`${suffix}_c`) });
    const catRows = await categoriesRepo.listByTenantId(pool, tenantId);
    const catA = catRows && catRows[0] ? catRows[0] : null;
    categoryAName = catA ? String(catA.name || "").trim() : "";
    for (const sid of [subA, subB, subC]) {
      await fieldAgentSubmissionsRepo.approveFieldAgentSubmission(pool, {
        tenantId,
        submissionId: sid,
        commissionAmount: 0,
      });
      await fieldAgentSubmissionsRepo.submitWebsiteListingReviewRequestForFieldAgent(pool, {
        tenantId,
        fieldAgentId: agentId,
        submissionId: sid,
        draft: { listing_name: `Bulk listing ${sid}` },
      });
    }
    await fieldAgentSubmissionsRepo.patchWebsiteListingDraftForAdmin(pool, {
      tenantId,
      submissionId: subA,
      draft: {
        listing_name: `Bulk listing ${subA}`,
        location: "Lusaka",
        category_id: catA ? String(catA.id) : "",
        about: "This is a bulk test listing with enough text for quality scoring rules.",
        email: "bulk_a@example.com",
      },
    });
    await fieldAgentSubmissionsRepo.replaceWebsiteSpecialityEntriesForSubmission(pool, {
      tenantId,
      submissionId: subA,
      entries: [{ name: "Electrical", isVerified: false }],
    });
    await fieldAgentSubmissionsRepo.replaceWebsiteWeeklyHoursForSubmission(pool, {
      tenantId,
      submissionId: subA,
      weeklyHours: {
        monday: { closed: false, from: "09:00", to: "17:00" },
      },
    });
    await fieldAgentSubmissionsRepo.patchWebsiteListingDraftForAdmin(pool, {
      tenantId,
      submissionId: subB,
      draft: {
        listing_name: `Bulk listing ${subB}`,
        location: "Ndola",
        established_year: "2015",
      },
    });
    taskA = await createCrmTaskFromEvent({
      tenantId,
      title: `Website listing review ${subA}`,
      description: "website-review-a",
      sourceType: "field_agent_website_listing",
      sourceRefId: subA,
    });
    taskB = await createCrmTaskFromEvent({
      tenantId,
      title: `Website listing review ${subB}`,
      description: "website-review-b",
      sourceType: "field_agent_website_listing",
      sourceRefId: subB,
    });
    taskC = await createCrmTaskFromEvent({
      tenantId,
      title: `Website listing review ${subC}`,
      description: "website-review-c",
      sourceType: "field_agent_website_listing",
      sourceRefId: subC,
    });

    const managerAgent = await adminLoginAgent(app, `web_bulk_mgr_${suffix}`, pw);
    const editorAgent = await adminLoginAgent(app, `web_bulk_edit_${suffix}`, pw);
    const viewerAgent = await adminLoginAgent(app, `web_bulk_view_${suffix}`, pw);

    const reportHrefFromHtml = (html) => {
      const hrefs = [];
      const re = /href="(\/admin\/crm\/websites\/report[^"]*)"/g;
      let m;
      while ((m = re.exec(html || "")) !== null) {
        hrefs.push(m[1].replace(/&amp;/g, "&"));
      }
      return hrefs;
    };

    const websitesQueue = await managerAgent.get("/admin/crm?queue=websites");
    assert.equal(websitesQueue.status, 200);
    assert.match(websitesQueue.text || "", /Apply to selected/i);
    assert.match(websitesQueue.text || "", /Apply quality filters/i);
    assert.match(websitesQueue.text || "", /Queue presets/i);
    assert.match(websitesQueue.text || "", /href="\/admin\/crm\?queue=websites&amp;quality_tier=low&amp;quality_sort=asc"/);
    assert.match(websitesQueue.text || "", /href="\/admin\/crm\?queue=websites&amp;quality_tier=high&amp;quality_sort=desc"/);
    assert.match(websitesQueue.text || "", /href="\/admin\/crm\?queue=websites&amp;has_hours=no&amp;quality_sort=asc"/);
    assert.match(websitesQueue.text || "", /href="\/admin\/crm\?queue=websites&amp;review_status=changes_requested&amp;quality_sort=asc"/);
    assert.match(websitesQueue.text || "", /href="\/admin\/crm\?queue=websites&amp;review_status=submitted&amp;quality_sort=asc"/);
    assert.match(websitesQueue.text || "", /name="quality_tier"/);
    assert.match(websitesQueue.text || "", /name="quality_min"/);
    assert.match(websitesQueue.text || "", /name="quality_sort"/);
    assert.match(websitesQueue.text || "", /name="city"/);
    assert.match(websitesQueue.text || "", /name="category"/);
    assert.match(websitesQueue.text || "", /name="missing_badge"/);
    assert.match(websitesQueue.text || "", /type="checkbox"[^>]*name="missing_badge"|name="missing_badge"[^>]*type="checkbox"/);
    assert.match(websitesQueue.text || "", /Match any selected/i);
    assert.match(websitesQueue.text || "", /publish selected/i);
    assert.match(websitesQueue.text || "", /name="crm_task_ids"/);
    assert.match(websitesQueue.text || "", /View in report/i);
    assert.match(websitesQueue.text || "", /\/admin\/crm\/websites\/report/);
    const viewerQueueGet = await viewerAgent.get("/admin/crm?queue=websites");
    assert.equal(viewerQueueGet.status, 403);
    const perCardViewInReport = ((websitesQueue.text || "").match(/View in report<\/a>/g) || []).length;
    assert.ok(perCardViewInReport >= 4, "queue toolbar plus each website card exposes View in report");

    assert.match(websitesQueue.text || "", /<strong>Permalink<\/strong>/);
    assert.match(websitesQueue.text || "", /class="website-share-card"/);
    assert.match(websitesQueue.text || "", /Open current state in new tab/);
    assert.match(websitesQueue.text || "", /target="_blank"[^>]*rel="noopener noreferrer"|rel="noopener noreferrer"[^>]*target="_blank"/);
    assert.match(websitesQueue.text || "", /<strong>Summary:<\/strong>/);
    assert.match(websitesQueue.text || "", /Websites queue/);
    assert.match(websitesQueue.text || "", /id="website-queue-share-operational-states"/);
    assert.match(websitesQueue.text || "", /id="website-queue-share-operational-hint"/);
    assert.match(websitesQueue.text || "", /Operational share states/);
    assert.match(websitesQueue.text || "", /URL for this queue/);
    assert.match(websitesQueue.text || "", /<strong>Snippet<\/strong>/);
    assert.match(websitesQueue.text || "", /preset filtered views \(not saved\)/);
    assert.match(websitesQueue.text || "", /same copy as Advanced, one click/);
    assert.match(websitesQueue.text || "", /same filters; Advanced opens with one format focused/);
    assert.match(websitesQueue.text || "", /<strong>Copy bundles<\/strong>/);
    assert.match(websitesQueue.text || "", />Low quality queue</);
    assert.match(websitesQueue.text || "", />Missing hours queue</);
    assert.match(websitesQueue.text || "", />Changes requested queue</);
    assert.match(websitesQueue.text || "", />Ready to review queue</);
    const queueShareHtml = websitesQueue.text || "";
    assert.match(queueShareHtml, /website-share-card--copy-wrap/);
    assert.match(queueShareHtml, /website-share-copy-row/);
    assert.match(queueShareHtml, /website-share-direct-link-block/);
    assert.match(queueShareHtml, /website-share-copy-btn--secondary-compact/);
    assert.match(queueShareHtml, /website-share-copy-btn--primary/);
    assert.match(queueShareHtml, /website-share-copy-btn--secondary/);
    assert.match(
      queueShareHtml,
      /class="btn btn--primary website-share-copy-btn--primary" id="website-queue-share-copy"/
    );
    assert.match(queueShareHtml, /role="group"/);
    assert.match(queueShareHtml, /website-share-a11y-group--permalink/);
    assert.match(queueShareHtml, /website-share-a11y-group--snippet/);
    assert.match(queueShareHtml, /website-share-a11y-group--operational/);
    assert.match(queueShareHtml, /website-share-a11y-group--best-for/);
    assert.match(queueShareHtml, /website-share-a11y-group--direct-links/);
    assert.match(queueShareHtml, /website-share-a11y-group--copy-bundles/);
    assert.match(
      queueShareHtml,
      /aria-label="Permalink: queue URL, copy, and open in new tab"/
    );
    assert.match(
      queueShareHtml,
      /aria-label="Copy bundles: combined and format-specific blocks"/
    );
    assert.match(
      queueShareHtml,
      /class="[^"]*website-share-card--focus-a11y[^"]*"/
    );
    assert.match(
      queueShareHtml,
      /website-share-card--focus-a11y a:focus-visible/
    );
    assert.match(
      queueShareHtml,
      /class="[^"]*website-share-card--group-focus-a11y[^"]*"/
    );
    assert.match(
      queueShareHtml,
      /website-share-a11y-group:focus-within/
    );
    assert.match(
      queueShareHtml,
      /website-share-direct-link-block:focus-within/
    );
    assert.match(queueShareHtml, /WEBSITE_SHARE_COPY_OK_MS/);
    assert.match(queueShareHtml, /WEBSITE_SHARE_COPY_FAIL_MS/);
    assert.match(queueShareHtml, /website-share-copy-btn--copied-state/);
    assert.match(queueShareHtml, /website-share-copy-btn--failed-state/);
    assert.match(queueShareHtml, /applyCopyButtonFeedback/);
    assert.match(queueShareHtml, /btn\.textContent = "Copied"/);
    assert.match(queueShareHtml, /btn\.textContent = "Select and copy"/);
    assert.match(
      queueShareHtml,
      /id="website-queue-share-copy-live"[^>]*aria-live="polite"/
    );
    assert.match(queueShareHtml, /getElementById\("website-queue-share-copy-live"\)/);
    assert.match(queueShareHtml, /setCopyLiveAnnounce\("Copied"\)/);
    assert.match(queueShareHtml, /setCopyLiveAnnounce\("Select and copy"\)/);
    assert.match(queueShareHtml, /setCopyLiveAnnounce/);
    assert.match(queueShareHtml, /website-share-copy-btn--busy/);
    assert.match(queueShareHtml, /setAttribute\("aria-busy", "true"\)/);
    assert.match(queueShareHtml, /removeAttribute\("aria-busy"\)/);
    assert.match(queueShareHtml, /website-share-card__hint-line/);
    assert.match(queueShareHtml, /_copyLiveRearmTimer/);
    assert.match(queueShareHtml, /resetAllCopyButtonStatesInShareCard/);
    assert.match(
      queueShareHtml,
      /copyLiveEl\._copyLiveRearmTimer/
    );
    assert.match(
      queueShareHtml,
      /resetAllCopyButtonStatesInShareCard\(btn\);[\s\S]*?clearCopyLiveForNewAttempt\(\)/
    );
    assert.match(queueShareHtml, /function clearCopyLiveForNewAttempt/);
    assert.match(queueShareHtml, /if \(!btn\) return/);
    assert.match(queueShareHtml, /btn\.isConnected === false/);
    assert.match(queueShareHtml, /id="website-queue-share-bundles-hint"/);
    assert.match(queueShareHtml, /id="website-queue-share-advanced-target-presets-hint"/);
    assert.match(
      queueShareHtml,
      /class="website-share-advanced-target-preset-block website-share-a11y-group website-share-a11y-group--target-markdown"/
    );
    assert.match(queueShareHtml, /wireCopy\("website-queue-share-advanced-target-preset-bundles-snippet-chat-copy"/);
    assert.match(queueShareHtml, /class="website-share-card__advanced"/);
    assert.match(queueShareHtml, /Advanced share formats \(markdown, chat, email, bundles\)/);
    const queueAdvIdx = queueShareHtml.indexOf('class="website-share-card__advanced"');
    const queueUrlIdx = queueShareHtml.indexOf('id="website-queue-share-url"');
    const queueSnippetIdx = queueShareHtml.indexOf('id="website-queue-share-snippet"');
    const queueOpStatesIdx = queueShareHtml.indexOf('id="website-queue-share-operational-states"');
    assert.ok(queueUrlIdx > 0 && queueSnippetIdx > 0 && queueOpStatesIdx > 0 && queueAdvIdx > 0);
    assert.ok(queueUrlIdx < queueSnippetIdx, "queue share basic: URL before plain snippet");
    assert.ok(queueSnippetIdx < queueOpStatesIdx, "queue share basic: plain snippet before operational states");
    assert.ok(queueOpStatesIdx < queueAdvIdx, "queue share: operational states before advanced details");
    const queueBestFmtIdx = queueShareHtml.indexOf('id="website-queue-share-best-format-hint"');
    assert.ok(queueBestFmtIdx > 0 && queueOpStatesIdx < queueBestFmtIdx, "queue best format shortcuts after operational states");
    assert.match(queueShareHtml, /class="website-share-best-format-shortcuts"/);
    assert.match(queueShareHtml, /id="website-queue-share-copy-best-legend"/);
    assert.match(queueShareHtml, /website-share-best-for-copy-best-legend/);
    assert.match(
      queueShareHtml,
      /Slack uses chat bundle; Email uses plain bundle; Docs uses markdown bundle/
    );
    const queueCopyBestLegendIdx = queueShareHtml.indexOf('id="website-queue-share-copy-best-legend"');
    const queueBestActionsIdxEarly = queueShareHtml.indexOf('id="website-queue-share-best-format-actions"');
    assert.ok(
      queueCopyBestLegendIdx > 0 &&
        queueBestFmtIdx < queueCopyBestLegendIdx &&
        queueCopyBestLegendIdx < queueBestActionsIdxEarly,
      "queue Copy best card legend between Best-for hint and row actions"
    );
    assert.match(queueShareHtml, /id="website-queue-share-best-format-actions"/);
    assert.match(queueShareHtml, /website-share-best-for-row website-share-best-for-row--/);
    assert.match(queueShareHtml, /website-share-best-for-row--slack/);
    assert.match(queueShareHtml, /website-share-best-for-row--email/);
    assert.match(queueShareHtml, /website-share-best-for-row--docs/);
    assert.match(queueShareHtml, /website-share-best-for-row__primary/);
    assert.match(queueShareHtml, /website-share-best-for-row__links/);
    assert.match(queueShareHtml, /website-share-best-for-row__bundles/);
    assert.match(queueShareHtml, /id="website-queue-share-best-slack-copy"/);
    assert.match(queueShareHtml, /id="website-queue-share-best-email-copy"/);
    assert.match(queueShareHtml, /id="website-queue-share-best-docs-copy"/);
    assert.match(
      queueShareHtml,
      /wireCopy\("website-queue-share-best-slack-copy", "website-queue-share-chat-snippet"\)/
    );
    assert.match(
      queueShareHtml,
      /wireCopy\("website-queue-share-best-email-copy", "website-queue-share-bundle-email"\)/
    );
    assert.match(
      queueShareHtml,
      /wireCopy\("website-queue-share-best-docs-copy", "website-queue-share-snippet-md"\)/
    );
    assert.match(queueShareHtml, /id="website-queue-share-best-slack-copy-best"/);
    assert.match(queueShareHtml, /id="website-queue-share-best-email-copy-best"/);
    assert.match(queueShareHtml, /id="website-queue-share-best-docs-copy-best"/);
    assert.match(
      queueShareHtml,
      /wireCopy\("website-queue-share-best-slack-copy-best", "website-queue-share-best-slack-open-bundle-chat"\)/
    );
    assert.match(
      queueShareHtml,
      /wireCopy\("website-queue-share-best-email-copy-best", "website-queue-share-best-email-open-bundle"\)/
    );
    assert.match(
      queueShareHtml,
      /wireCopy\("website-queue-share-best-docs-copy-best", "website-queue-share-best-docs-open-bundle-md"\)/
    );
    assert.match(queueShareHtml, /website-share-best-for-copy-best-hint/);
    assert.ok(
      (queueShareHtml.match(/website-share-best-for-copy-best-hint/g) || []).length >= 3,
      "queue: Copy best source hints for Slack, Email, Docs"
    );
    assert.match(queueShareHtml, /uses chat bundle/);
    assert.match(queueShareHtml, /uses plain bundle/);
    assert.match(queueShareHtml, /uses markdown bundle/);
    assert.ok(
      queueShareHtml.indexOf('id="website-queue-share-best-slack-copy-best"') <
        queueShareHtml.indexOf("uses chat bundle"),
      "queue: Slack Copy best hint follows Slack Copy best control"
    );
    assert.ok(
      queueShareHtml.indexOf('id="website-queue-share-best-email-copy-best"') <
        queueShareHtml.indexOf("uses plain bundle"),
      "queue: Email Copy best hint follows Email Copy best control"
    );
    assert.ok(
      queueShareHtml.indexOf('id="website-queue-share-best-docs-copy-best"') <
        queueShareHtml.indexOf("uses markdown bundle"),
      "queue: Docs Copy best hint follows Docs Copy best control"
    );
    const queueBestOpenSource = [
      [
        "website-queue-share-best-slack-open-source",
        "chat",
        "website-queue-share-best-slack-open-url",
        "website-queue-share-best-slack-open-copy",
        "website-queue-share-best-slack-open-bundle",
        "website-queue-share-best-slack-open-bundle-copy",
        "Slack",
        "website-queue-share-best-slack-open-bundle-md",
        "website-queue-share-best-slack-open-bundle-md-copy",
        "website-queue-share-best-slack-open-bundle-chat",
        "website-queue-share-best-slack-open-bundle-chat-copy",
      ],
      [
        "website-queue-share-best-email-open-source",
        "bundles",
        "website-queue-share-best-email-open-url",
        "website-queue-share-best-email-open-copy",
        "website-queue-share-best-email-open-bundle",
        "website-queue-share-best-email-open-bundle-copy",
        "Email",
        "website-queue-share-best-email-open-bundle-md",
        "website-queue-share-best-email-open-bundle-md-copy",
        "website-queue-share-best-email-open-bundle-chat",
        "website-queue-share-best-email-open-bundle-chat-copy",
      ],
      [
        "website-queue-share-best-docs-open-source",
        "markdown",
        "website-queue-share-best-docs-open-url",
        "website-queue-share-best-docs-open-copy",
        "website-queue-share-best-docs-open-bundle",
        "website-queue-share-best-docs-open-bundle-copy",
        "Docs",
        "website-queue-share-best-docs-open-bundle-md",
        "website-queue-share-best-docs-open-bundle-md-copy",
        "website-queue-share-best-docs-open-bundle-chat",
        "website-queue-share-best-docs-open-bundle-chat-copy",
      ],
    ];
    const decodeQueueBestBundle = (chunk) =>
      String(chunk || "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    for (const [
      qid,
      qTarget,
      urlId,
      copyId,
      bundleId,
      bundleCopyId,
      bestForName,
      mdBundleId,
      mdCopyId,
      chatBundleId,
      chatCopyId,
    ] of queueBestOpenSource) {
      const qOpen = new RegExp(`id="${qid}"[^>]*href="([^"]*)"`);
      const qOm = queueShareHtml.match(qOpen);
      assert.ok(qOm, `queue best-format open source link: ${qid}`);
      const qOh = qOm[1].replace(/&amp;/g, "&");
      assert.match(qOh, /share_view=advanced/, `queue ${qid} share_view`);
      assert.match(qOh, new RegExp(`share_target=${qTarget}`), `queue ${qid} share_target`);
      const qValRe = new RegExp(`id="${urlId}"[^>]*value="([^"]*)"`);
      const qValM = queueShareHtml.match(qValRe);
      assert.ok(qValM, `queue best-format deep-link copy field: ${urlId}`);
      const qVal = qValM[1].replace(/&amp;/g, "&");
      assert.equal(qVal, qOh, `queue ${urlId} value matches open-source href`);
      assert.match(
        queueShareHtml,
        new RegExp(`wireCopy\\("${copyId}", "${urlId}"\\)`),
        `queue wireCopy for ${copyId}`
      );
      const qBundRe = new RegExp(`id="${bundleId}"[^>]*>([\\s\\S]*?)<\\/textarea>`, "m");
      const qBundM = queueShareHtml.match(qBundRe);
      assert.ok(qBundM, `queue best-format deep-link bundle: ${bundleId}`);
      const qBundTxt = decodeQueueBestBundle(qBundM[1]).trim();
      assert.match(qBundTxt, /Websites queue/, `queue bundle ${bundleId} includes share label`);
      assert.ok(
        qBundTxt.includes(`Best for: ${bestForName}`),
        `queue bundle ${bundleId} includes Best for line`
      );
      assert.ok(qBundTxt.includes(qOh), `queue bundle ${bundleId} includes open-source URL`);
      assert.match(
        queueShareHtml,
        new RegExp(`wireCopy\\("${bundleCopyId}", "${bundleId}"\\)`),
        `queue wireCopy for ${bundleCopyId}`
      );
      const qMdRe = new RegExp(`id="${mdBundleId}"[^>]*>([\\s\\S]*?)<\\/textarea>`, "m");
      const qMdM = queueShareHtml.match(qMdRe);
      assert.ok(qMdM, `queue best-format md deep-link bundle: ${mdBundleId}`);
      const qMdTxt = decodeQueueBestBundle(qMdM[1]).trim();
      assert.match(qMdTxt, /^\[[^\]]+\]\([^)]+\)$/, `queue md bundle ${mdBundleId} is [text](url)`);
      assert.ok(qMdTxt.includes(`(${qOh})`), `queue md bundle ${mdBundleId} embeds open-source URL`);
      assert.ok(
        qMdTxt.includes(`Best for: ${bestForName}`),
        `queue md bundle ${mdBundleId} includes Best for label`
      );
      assert.match(
        queueShareHtml,
        new RegExp(`wireCopy\\("${mdCopyId}", "${mdBundleId}"\\)`),
        `queue wireCopy for ${mdCopyId}`
      );
      const qChatRe = new RegExp(`id="${chatBundleId}"[^>]*>([\\s\\S]*?)<\\/textarea>`, "m");
      const qChatM = queueShareHtml.match(qChatRe);
      assert.ok(qChatM, `queue best-format chat deep-link bundle: ${chatBundleId}`);
      const qChatTxt = decodeQueueBestBundle(qChatM[1]).trim();
      assert.match(qChatTxt, /^<[^|]+\|[^>]+>$/, `queue chat bundle ${chatBundleId} is <url|label>`);
      assert.ok(qChatTxt.includes(qOh), `queue chat bundle ${chatBundleId} embeds open-source URL`);
      assert.ok(
        qChatTxt.includes(`Best for: ${bestForName}`),
        `queue chat bundle ${chatBundleId} includes Best for label`
      );
      assert.match(
        queueShareHtml,
        new RegExp(`wireCopy\\("${chatCopyId}", "${chatBundleId}"\\)`),
        `queue wireCopy for ${chatCopyId}`
      );
    }
    assert.match(queueShareHtml, /id="website-queue-share-advanced-target-presets"/);
    assert.match(queueShareHtml, /id="website-queue-share-advanced-target-presets-hint"/);
    assert.match(queueShareHtml, /class="website-share-advanced-target-presets"/);
    assert.match(queueShareHtml, /class="website-share-advanced-target-preset-snippets"/);
    assert.ok(
      (queueShareHtml.match(/class="website-share-advanced-target-preset-block"/g) || []).length >= 5,
      "queue advanced-target preset area has grouped blocks"
    );
    const queuePresetIdx = queueShareHtml.indexOf('id="website-queue-share-advanced-target-presets"');
    assert.ok(
      queuePresetIdx > 0 &&
        queueBestFmtIdx < queuePresetIdx &&
        queuePresetIdx < queueAdvIdx,
      "queue advanced target presets after best-format shortcuts and before Advanced details"
    );
    const decodeQueueShareBundleTextarea = (chunk) =>
      String(chunk || "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
    const queueAdvancedTargetPresetKeys = ["markdown", "chat", "named", "email", "bundles"];
    for (const dt of queueAdvancedTargetPresetKeys) {
      const qr = new RegExp(`id="website-queue-share-advanced-target-preset-${dt}"[^>]*href="([^"]*)"`);
      const qm = queueShareHtml.match(qr);
      assert.ok(qm, `queue advanced preset link: ${dt}`);
      const qh = qm[1].replace(/&amp;/g, "&");
      assert.match(qh, /share_view=advanced/, `queue preset ${dt} share_view`);
      assert.match(qh, new RegExp(`share_target=${dt}`), `queue preset ${dt} share_target`);
      assert.match(queueShareHtml, new RegExp(`id="website-queue-share-advanced-target-preset-${dt}-snippet-copy"`));
      const qpsr = new RegExp(
        `id="website-queue-share-advanced-target-preset-${dt}-snippet"[^>]*>([\\s\\S]*?)<\\/textarea>`,
        "m"
      );
      const qpsm = queueShareHtml.match(qpsr);
      assert.ok(qpsm, `queue advanced preset snippet textarea: ${dt}`);
      const qpst = decodeQueueShareBundleTextarea(qpsm[1]).trim();
      const qptt = dt.charAt(0).toUpperCase() + dt.slice(1);
      assert.match(qpst, /Websites queue/, `queue preset snippet ${dt} includes share label`);
      assert.match(qpst, new RegExp(`Target: ${qptt}`), `queue preset snippet ${dt} target line`);
      assert.ok(qpst.includes(qh), `queue preset snippet ${dt} includes preset permalink`);
      assert.match(
        queueShareHtml,
        new RegExp(`id="website-queue-share-advanced-target-preset-${dt}-snippet-md-copy"`)
      );
      assert.match(
        queueShareHtml,
        new RegExp(`id="website-queue-share-advanced-target-preset-${dt}-snippet-chat-copy"`)
      );
      const qpmdRe = new RegExp(
        `id="website-queue-share-advanced-target-preset-${dt}-snippet-md"[^>]*>([\\s\\S]*?)<\\/textarea>`,
        "m"
      );
      const qpmdM = queueShareHtml.match(qpmdRe);
      assert.ok(qpmdM, `queue preset markdown variant textarea: ${dt}`);
      const qpmdTxt = decodeQueueShareBundleTextarea(qpmdM[1]).trim();
      assert.match(qpmdTxt, /^\[[^\]]+\]\([^)]+\)$/, `queue preset md variant ${dt} shape`);
      assert.ok(qpmdTxt.includes(`(${qh})`), `queue preset md variant ${dt} uses preset href`);
      const qpchRe = new RegExp(
        `id="website-queue-share-advanced-target-preset-${dt}-snippet-chat"[^>]*>([\\s\\S]*?)<\\/textarea>`,
        "m"
      );
      const qpchM = queueShareHtml.match(qpchRe);
      assert.ok(qpchM, `queue preset chat variant textarea: ${dt}`);
      const qpchTxt = decodeQueueShareBundleTextarea(qpchM[1]).trim();
      assert.match(qpchTxt, /^<[^|]+\|[^>]+>$/, `queue preset chat variant ${dt} shape`);
      assert.ok(qpchTxt.startsWith(`<${qh}|`), `queue preset chat variant ${dt} uses preset href`);
    }
    assert.ok(
      queueShareHtml.indexOf('id="website-queue-share-snippet-md"') > queueAdvIdx,
      "queue markdown snippet follows advanced disclosure"
    );
    assert.ok(
      queueShareHtml.indexOf('id="website-queue-share-bundles-hint"') > queueAdvIdx,
      "queue bundles hint follows advanced disclosure"
    );
    assert.doesNotMatch(queueShareHtml, /website-share-card__target-note/, "queue: no emphasis without share_target");
    assert.match(queueShareHtml, /id="website-queue-share-direct-links"/);
    assert.match(queueShareHtml, /id="website-queue-share-direct-links-hint"/);
    const queueDirectAfter = queueShareHtml.split('id="website-queue-share-direct-links"')[1] || "";
    const queueDirectEnd = queueDirectAfter.indexOf("</p>");
    const queueDirectSlice =
      queueDirectEnd > 0 ? queueDirectAfter.slice(0, queueDirectEnd + 4) : queueDirectAfter;
    assert.match(queueDirectSlice, /share_view=advanced/);
    assert.match(queueDirectSlice, /share_target=markdown/);
    assert.match(queueDirectSlice, /share_target=chat/);
    assert.match(queueDirectSlice, /share_target=named/);
    assert.match(queueDirectSlice, /share_target=email/);
    assert.match(queueDirectSlice, /share_target=bundles/);
    const queueDirectTargets = ["markdown", "chat", "named", "email", "bundles"];
    for (const dt of queueDirectTargets) {
      assert.match(queueShareHtml, new RegExp(`id="website-queue-share-direct-${dt}-copy"`));
      assert.match(queueShareHtml, new RegExp(`id="website-queue-share-direct-${dt}-bundle-copy"`));
      const qUrlFieldRe = new RegExp(`id="website-queue-share-direct-${dt}-url"[^>]*value="([^"]*)"`);
      const qUrlM = queueShareHtml.match(qUrlFieldRe);
      assert.ok(qUrlM, `queue direct copy URL field: ${dt}`);
      const qDec = qUrlM[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"');
      assert.match(qDec, /share_view=advanced/, `queue ${dt} copy value has share_view`);
      assert.match(qDec, new RegExp(`share_target=${dt}`), `queue ${dt} copy value has share_target`);
      const qBundleRe = new RegExp(
        `id="website-queue-share-direct-${dt}-bundle"[^>]*>([\\s\\S]*?)<\\/textarea>`,
        "m"
      );
      const qBundleM = queueShareHtml.match(qBundleRe);
      assert.ok(qBundleM, `queue deep-link bundle textarea: ${dt}`);
      const qbtxt = decodeQueueShareBundleTextarea(qBundleM[1]).trim();
      const qtt = dt.charAt(0).toUpperCase() + dt.slice(1);
      assert.match(qbtxt, /Websites queue/, `queue bundle ${dt} includes share label`);
      assert.match(qbtxt, new RegExp(`Target: ${qtt}`), `queue bundle ${dt} target line`);
      assert.ok(qbtxt.includes(qDec), `queue bundle ${dt} includes direct permalink`);
    }
    const queueAdvDetailsTag = (websitesQueue.text || "").match(/<details class="website-share-card__advanced"[^>]*>/);
    assert.ok(queueAdvDetailsTag);
    assert.doesNotMatch(
      queueAdvDetailsTag[0],
      /\sopen[\s>]/,
      "queue Advanced share formats collapsed by default"
    );
    const queueShareAdvPage = await managerAgent.get("/admin/crm?queue=websites&share_view=advanced");
    assert.equal(queueShareAdvPage.status, 200);
    const queueAdvOpenTag = (queueShareAdvPage.text || "").match(
      /<details class="website-share-card__advanced"[^>]*>/
    );
    assert.ok(queueAdvOpenTag);
    assert.match(queueAdvOpenTag[0], /\sopen[\s>]/, "queue share_view=advanced opens Advanced block");
    const queueShareBadPage = await managerAgent.get("/admin/crm?queue=websites&share_view=nope");
    assert.equal(queueShareBadPage.status, 200);
    const queueBadTag = (queueShareBadPage.text || "").match(/<details class="website-share-card__advanced"[^>]*>/);
    assert.ok(queueBadTag);
    assert.doesNotMatch(queueBadTag[0], /\sopen[\s>]/, "invalid share_view leaves queue Advanced collapsed");
    const queueShareTargetMd = await managerAgent.get("/admin/crm?queue=websites&share_target=markdown");
    assert.equal(queueShareTargetMd.status, 200);
    const queueTargetMdTag = (queueShareTargetMd.text || "").match(
      /<details class="website-share-card__advanced"[^>]*>/
    );
    assert.ok(queueTargetMdTag);
    assert.match(queueTargetMdTag[0], /\sopen[\s>]/, "queue share_target=markdown opens Advanced");
    const queueTargetNotes = (queueShareTargetMd.text || "").match(/website-share-card__target-note/g) || [];
    assert.equal(queueTargetNotes.length, 1);
    const qNoteIdx = (queueShareTargetMd.text || "").indexOf("website-share-card__target-note");
    const qMdCtlIdx = (queueShareTargetMd.text || "").indexOf('id="website-queue-share-snippet-md"');
    assert.ok(qNoteIdx > 0 && qMdCtlIdx > qNoteIdx);
    const queueShareTargetBad = await managerAgent.get("/admin/crm?queue=websites&share_target=bad");
    assert.equal(queueShareTargetBad.status, 200);
    const queueTargetBadTag = (queueShareTargetBad.text || "").match(
      /<details class="website-share-card__advanced"[^>]*>/
    );
    assert.ok(queueTargetBadTag);
    assert.doesNotMatch(queueTargetBadTag[0], /\sopen[\s>]/, "invalid share_target does not open queue Advanced");
    assert.doesNotMatch(queueShareTargetBad.text || "", /website-share-card__target-note/);
    const queueSharePresetsIdx = (websitesQueue.text || "").indexOf('id="website-queue-share-operational-states"');
    assert.ok(queueSharePresetsIdx > 0);
    const queueSharePresetsSlice = (websitesQueue.text || "").slice(queueSharePresetsIdx, queueSharePresetsIdx + 1600);
    assert.match(queueSharePresetsSlice, /queue=websites/);
    assert.match(queueSharePresetsSlice, /quality_tier=low/);
    assert.match(queueSharePresetsSlice, /has_hours=no/);
    assert.match(queueSharePresetsSlice, /review_status=changes_requested/);
    assert.match(queueSharePresetsSlice, /review_status=submitted/);
    assert.match(websitesQueue.text || "", /id="website-queue-share-url"/);
    assert.match(websitesQueue.text || "", /id="website-queue-share-copy"/);
    assert.match(websitesQueue.text || "", /id="website-queue-share-snippet"/);
    assert.match(websitesQueue.text || "", /id="website-queue-share-snippet-copy"/);
    assert.match(websitesQueue.text || "", /id="website-queue-share-snippet-md"/);
    assert.match(websitesQueue.text || "", /id="website-queue-share-snippet-md-copy"/);
    const qMdM = (websitesQueue.text || "").match(/id="website-queue-share-snippet-md"[^>]*>([\s\S]*?)<\/textarea>/);
    assert.ok(qMdM);
    const qMd = qMdM[1].trim().replace(/&amp;/g, "&");
    const qMdMid = qMd.indexOf("](");
    assert.ok(qMdMid > 0 && qMd.startsWith("[") && qMd.endsWith(")"));
    assert.ok(qMd.slice(1, qMdMid).includes("Websites queue"));
    assert.ok(qMd.slice(qMdMid + 2, -1).includes("/admin/crm?queue=websites"));
    assert.match(websitesQueue.text || "", /id="website-queue-share-chat-snippet"/);
    assert.match(websitesQueue.text || "", /id="website-queue-share-chat-copy"/);
    const qChatM = (websitesQueue.text || "").match(/id="website-queue-share-chat-snippet"[^>]*>([\s\S]*?)<\/textarea>/);
    assert.ok(qChatM);
    const qChat = qChatM[1].trim().replace(/&amp;/g, "&");
    assert.ok(qChat.startsWith("<") && qChat.endsWith(">"));
    const qChatPipe = qChat.indexOf("|");
    assert.ok(qChatPipe > 1);
    assert.ok(qChat.slice(1, qChatPipe).includes("/admin/crm?queue=websites"));
    assert.ok(qChat.slice(qChatPipe + 1, -1).includes("Websites queue"));
    assert.match(websitesQueue.text || "", /id="website-queue-share-named"/);
    assert.match(websitesQueue.text || "", /id="website-queue-share-named-copy"/);
    const qNamedM = (websitesQueue.text || "").match(/id="website-queue-share-named"[^>]*>([\s\S]*?)<\/textarea>/);
    assert.ok(qNamedM);
    const qNamed = qNamedM[1].trim().replace(/&amp;/g, "&");
    const qNamedSep = " — ";
    const qNamedIdx = qNamed.indexOf(qNamedSep);
    assert.ok(qNamedIdx > 0);
    assert.ok(qNamed.slice(0, qNamedIdx).includes("Websites queue"));
    assert.ok(qNamed.slice(qNamedIdx + qNamedSep.length).includes("/admin/crm?queue=websites"));
    assert.match(websitesQueue.text || "", /id="website-queue-share-email-subject"/);
    assert.match(websitesQueue.text || "", /id="website-queue-share-email-subject-copy"/);
    assert.match(websitesQueue.text || "", /id="website-queue-share-email-body"/);
    assert.match(websitesQueue.text || "", /id="website-queue-share-email-body-copy"/);
    const qEmailSubjM = (websitesQueue.text || "").match(/id="website-queue-share-email-subject"[^>]*value="([^"]*)"/);
    assert.ok(qEmailSubjM);
    const qEmailSubj = qEmailSubjM[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"');
    assert.ok(qEmailSubj.includes("Websites queue"));
    const qEmailBodyM = (websitesQueue.text || "").match(/id="website-queue-share-email-body"[^>]*>([\s\S]*?)<\/textarea>/);
    assert.ok(qEmailBodyM);
    const qEmailBody = qEmailBodyM[1].trim().replace(/&amp;/g, "&");
    const qEmailParts = qEmailBody.split("\n\n");
    assert.equal(qEmailParts.length, 2);
    assert.equal(qEmailParts[0].trim(), qEmailSubj.trim());
    assert.ok(qEmailParts[1].includes("/admin/crm?queue=websites"));
    assert.match(websitesQueue.text || "", /Open email draft/);
    const qMailtoM = (websitesQueue.text || "").match(/id="website-queue-share-email-draft"[^>]*href="([^"]+)"/);
    assert.ok(qMailtoM);
    const qMailtoHref = qMailtoM[1].replace(/&amp;/g, "&");
    assert.match(qMailtoHref, /^mailto:\?/);
    const qMailtoParams = new URLSearchParams(qMailtoHref.replace(/^mailto:\?/, ""));
    assert.equal(qMailtoParams.get("subject"), qEmailSubj.trim());
    assert.equal(qMailtoParams.get("body"), qEmailBody);
    assert.match(websitesQueue.text || "", /id="website-queue-share-bundles-hint"/);
    assert.match(websitesQueue.text || "", /id="website-queue-share-bundle-all"/);
    assert.match(websitesQueue.text || "", /id="website-queue-share-bundle-all-copy"/);
    const qBundleAllM = (websitesQueue.text || "").match(/id="website-queue-share-bundle-all"[^>]*>([\s\S]*?)<\/textarea>/);
    assert.ok(qBundleAllM, "queue all-formats bundle textarea");
    const qBundleAll = qBundleAllM[1].trim().replace(/&amp;/g, "&");
    assert.ok(qBundleAll.startsWith("Summary\n"), "queue all-formats bundle starts with Summary section");
    const qBundleSectionOrder = [
      "Summary",
      "URL",
      "Plain snippet",
      "Markdown",
      "Chat",
      "Named link",
      "Email subject",
      "Email body",
    ];
    let qBundlePrev = -1;
    for (const h of qBundleSectionOrder) {
      const idx = qBundleAll.indexOf(h, qBundlePrev + 1);
      assert.ok(idx > qBundlePrev, `queue bundle section order: ${h}`);
      qBundlePrev = idx;
    }
    assert.ok(qBundleAll.includes(qMd.trim()), "queue bundle includes markdown snippet");
    assert.ok(qBundleAll.includes(qChat.trim()), "queue bundle includes chat snippet");
    assert.ok(qBundleAll.includes(qNamed.trim()), "queue bundle includes named link");
    assert.ok(qBundleAll.includes(qEmailSubj.trim()), "queue bundle includes email subject");
    assert.ok(qBundleAll.includes(qEmailBody.trim()), "queue bundle includes email body");
    const qBundleQuickM = (websitesQueue.text || "").match(/id="website-queue-share-bundle-quick"[^>]*>([\s\S]*?)<\/textarea>/);
    assert.ok(qBundleQuickM);
    assert.equal(qBundleQuickM[1].trim().replace(/&amp;/g, "&"), qNamed);
    const qBundleEmailM = (websitesQueue.text || "").match(/id="website-queue-share-bundle-email"[^>]*>([\s\S]*?)<\/textarea>/);
    assert.ok(qBundleEmailM);
    const qBundleEmail = qBundleEmailM[1].trim().replace(/&amp;/g, "&");
    assert.ok(qBundleEmail.startsWith("Subject: "));
    assert.equal(qBundleEmail, `Subject: ${qEmailSubj.trim()}\n\n${qEmailBody}`);
    const qBundleChatM = (websitesQueue.text || "").match(/id="website-queue-share-bundle-chat"[^>]*>([\s\S]*?)<\/textarea>/);
    assert.ok(qBundleChatM);
    assert.equal(qBundleChatM[1].trim().replace(/&amp;/g, "&"), qChat);
    const qSnippetM = (websitesQueue.text || "").match(/id="website-queue-share-snippet"[^>]*>([\s\S]*?)<\/textarea>/);
    assert.ok(qSnippetM);
    const qLines = qSnippetM[1].trim().split(/\n/);
    assert.ok(qLines.length >= 2);
    assert.ok(qLines[0].includes("Websites queue"));
    assert.ok(qLines[1].includes("/admin/crm?queue=websites"));
    const defaultShareM = (websitesQueue.text || "").match(/id="website-queue-share-url"[^>]*value="([^"]*)"/);
    assert.ok(defaultShareM);
    const defaultShareDec = defaultShareM[1].replace(/&amp;/g, "&");
    assert.ok(defaultShareDec.includes("queue=websites"), "default share URL is base queue slice");
    assert.ok(!defaultShareDec.includes("bulk_notice"), "share URL omits bulk notice params");

    const multiBadgeQueue = await managerAgent.get(
      "/admin/crm?queue=websites&missing_badge=missing_hours&missing_badge=missing_established_year"
    );
    assert.equal(multiBadgeQueue.status, 200);
    const mbShareM = (multiBadgeQueue.text || "").match(/id="website-queue-share-url"[^>]*value="([^"]*)"/);
    assert.ok(mbShareM);
    const mbShareDec = mbShareM[1].replace(/&amp;/g, "&");
    assert.ok((mbShareDec.match(/missing_badge=/g) || []).length >= 2, "share preserves repeated missing_badge");
    assert.ok((multiBadgeQueue.text || "").includes("2 missing badges"), "queue share label reflects missing badge count");
    const mbOpM = (multiBadgeQueue.text || "").match(
      /id="website-queue-share-operational-states"[^>]*>([\s\S]*?)<\/p>/
    );
    assert.ok(mbOpM, "operational queue states paragraph");
    assert.doesNotMatch(mbOpM[1], /missing_badge=/, "operational queue links omit missing_badge filters");

    const withReportReturn = await managerAgent.get(
      "/admin/crm?queue=websites&city=Ndola&report_return=" +
        encodeURIComponent("/admin/crm/websites/report?view_set=quality")
    );
    assert.equal(withReportReturn.status, 200);
    const wrShareM = (withReportReturn.text || "").match(/id="website-queue-share-url"[^>]*value="([^"]*)"/);
    assert.ok(wrShareM);
    const wrShareDec = wrShareM[1].replace(/&amp;/g, "&");
    assert.ok(wrShareDec.includes("city=Ndola"), "share preserves queue filters with report_return");
    assert.ok(wrShareDec.includes("report_return="), "share preserves validated report_return");
    assert.ok((withReportReturn.text || "").includes("linked from report"), "queue share label notes report return");
    const wrOpM = (withReportReturn.text || "").match(
      /id="website-queue-share-operational-states"[^>]*>([\s\S]*?)<\/p>/
    );
    assert.ok(wrOpM);
    assert.match(wrOpM[1], /city=Ndola/);
    assert.match(wrOpM[1], /report_return=/);

    const queueReportReturn = await managerAgent.get(
      "/admin/crm?queue=websites&review_status=submitted&city=Ndola&quality_tier=low&quality_sort=asc&missing_badge=missing_hours"
    );
    assert.equal(queueReportReturn.status, 200);
    const qrText = queueReportReturn.text || "";
    const reportReturnHrefMatch = qrText.match(/<a href="(\/admin\/crm\/websites\/report[^"]*)">View in report<\/a>/);
    assert.ok(reportReturnHrefMatch, "View in report link with href");
    const reportReturnHref = reportReturnHrefMatch[1].replace(/&amp;/g, "&");
    assert.ok(reportReturnHref.includes("review_status=submitted"));
    assert.ok(reportReturnHref.includes("city=Ndola"));
    assert.ok(reportReturnHref.includes("quality_tier=low"));
    assert.ok(!reportReturnHref.includes("quality_sort"));
    assert.ok(!reportReturnHref.includes("missing_badge"));

    const cityFiltered = await managerAgent.get("/admin/crm?queue=websites&city=Ndola");
    assert.equal(cityFiltered.status, 200);
    assert.match(cityFiltered.text || "", new RegExp(`Website listing review ${subB}`));
    assert.doesNotMatch(cityFiltered.text || "", new RegExp(`Website listing review ${subA}`));
    const cityFilteredHrefs = reportHrefFromHtml(cityFiltered.text || "");
    const ndolaCardReports = cityFilteredHrefs.filter(
      (h) => h.includes("city=Ndola") && h.includes("review_status=submitted")
    );
    assert.ok(ndolaCardReports.length >= 1, "website card View in report carries city and review_status");
    assert.ok(
      ndolaCardReports.every((h) => !h.includes("quality_sort") && !h.includes("missing_badge")),
      "card report href omits queue-only params"
    );
    assert.ok(
      ndolaCardReports.every((h) => h.includes("highlight_submission_id=" + subB)),
      "per-card View in report includes highlight_submission_id"
    );

    if (categoryAName) {
      const categoryFiltered = await managerAgent.get(
        "/admin/crm?queue=websites&category=" + encodeURIComponent(categoryAName)
      );
      assert.equal(categoryFiltered.status, 200);
      assert.match(categoryFiltered.text || "", new RegExp(`Website listing review ${subA}`));
      assert.doesNotMatch(categoryFiltered.text || "", new RegExp(`Website listing review ${subB}`));
      const catOpM = (categoryFiltered.text || "").match(
        /id="website-queue-share-operational-states"[^>]*>([\s\S]*?)<\/p>/
      );
      assert.ok(catOpM);
      assert.match(catOpM[1], /category=/);
      const catFilteredHrefs = reportHrefFromHtml(categoryFiltered.text || "");
      const catEnc = encodeURIComponent(categoryAName);
      const lusakaCatReports = catFilteredHrefs.filter(
        (h) =>
          h.includes("category=" + catEnc) && h.includes("city=Lusaka") && h.includes("review_status=submitted")
      );
      assert.ok(lusakaCatReports.length >= 1, "card report link preserves category when set on listing");
      assert.ok(lusakaCatReports.every((h) => !h.includes("quality_sort") && !h.includes("missing_badge")));
      assert.ok(
        lusakaCatReports.every((h) => h.includes("highlight_submission_id=" + subA)),
        "Lusaka card report link includes highlight_submission_id"
      );
    }

    const tierFiltered = await managerAgent.get("/admin/crm?queue=websites&quality_tier=low");
    assert.equal(tierFiltered.status, 200);
    assert.match(tierFiltered.text || "", new RegExp(`Website listing review ${subB}`));
    assert.doesNotMatch(tierFiltered.text || "", new RegExp(`Website listing review ${subA}`));

    const minFiltered = await managerAgent.get("/admin/crm?queue=websites&quality_min=50");
    assert.equal(minFiltered.status, 200);
    assert.match(minFiltered.text || "", new RegExp(`Website listing review ${subA}`));
    assert.doesNotMatch(minFiltered.text || "", new RegExp(`Website listing review ${subB}`));

    const combinedFiltered = await managerAgent.get("/admin/crm?queue=websites&city=Lusaka&quality_min=50");
    assert.equal(combinedFiltered.status, 200);
    assert.match(combinedFiltered.text || "", new RegExp(`Website listing review ${subA}`));
    assert.doesNotMatch(combinedFiltered.text || "", new RegExp(`Website listing review ${subB}`));

    const missingBadgeFiltered = await managerAgent.get("/admin/crm?queue=websites&missing_badge=missing_hours");
    assert.equal(missingBadgeFiltered.status, 200);
    assert.match(missingBadgeFiltered.text || "", new RegExp(`Website listing review ${subB}`));
    assert.doesNotMatch(missingBadgeFiltered.text || "", new RegExp(`Website listing review ${subA}`));

    const multiBadgeOr = await managerAgent.get(
      "/admin/crm?queue=websites&missing_badge=missing_hours&missing_badge=missing_established_year"
    );
    assert.equal(multiBadgeOr.status, 200);
    assert.match(multiBadgeOr.text || "", new RegExp(`Website listing review ${subA}`));
    assert.match(multiBadgeOr.text || "", new RegExp(`Website listing review ${subB}`));
    assert.match(multiBadgeOr.text || "", new RegExp(`Website listing review ${subC}`));

    const multiBadgeOrCity = await managerAgent.get(
      "/admin/crm?queue=websites&missing_badge=missing_hours&missing_badge=missing_established_year&city=Lusaka"
    );
    assert.equal(multiBadgeOrCity.status, 200);
    assert.match(multiBadgeOrCity.text || "", new RegExp(`Website listing review ${subA}`));
    assert.doesNotMatch(multiBadgeOrCity.text || "", new RegExp(`Website listing review ${subB}`));

    const mixedControlsFiltered = await managerAgent.get(
      "/admin/crm?queue=websites&missing_badge=missing_hours&city=Ndola&quality_tier=low"
    );
    assert.equal(mixedControlsFiltered.status, 200);
    assert.match(mixedControlsFiltered.text || "", new RegExp(`Website listing review ${subB}`));

    const presetFiltered = await managerAgent.get("/admin/crm?queue=websites&review_status=submitted&quality_sort=asc&city=Lusaka");
    assert.equal(presetFiltered.status, 200);
    assert.match(presetFiltered.text || "", new RegExp(`Website listing review ${subA}`));

    const viewerPost = await viewerAgent
      .post("/admin/crm/websites/bulk-review")
      .type("form")
      .send({ bulk_action: "changes_requested", bulk_comment: "x", crm_task_ids: [taskA] });
    assert.equal(viewerPost.status, 403);
    const viewerPublishPost = await viewerAgent
      .post("/admin/crm/websites/bulk-review")
      .type("form")
      .send({ bulk_action: "publish_ready", crm_task_ids: [taskA] });
    assert.equal(viewerPublishPost.status, 403);

    const missingComment = await managerAgent
      .post("/admin/crm/websites/bulk-review")
      .type("form")
      .send({ bulk_action: "changes_requested", bulk_comment: "  ", crm_task_ids: [taskA, taskB] });
    assert.equal(missingComment.status, 302);
    assert.match(String(missingComment.headers.location || ""), /bulk_error=/);

    const missingSelection = await managerAgent
      .post("/admin/crm/websites/bulk-review")
      .type("form")
      .send({ bulk_action: "changes_requested", bulk_comment: "Need updates", crm_task_ids: [] });
    assert.equal(missingSelection.status, 302);
    assert.match(String(missingSelection.headers.location || ""), /bulk_error=/);

    const bulkComment = "Please update your website details and resubmit.";
    const bulkApply = await editorAgent
      .post("/admin/crm/websites/bulk-review")
      .type("form")
      .send({
        bulk_action: "changes_requested",
        bulk_comment: bulkComment,
        crm_task_ids: [taskA, taskB],
        return_query:
          "?queue=websites&quality_tier=low&city=Ndola&missing_badge=missing_hours&missing_badge=missing_established_year",
      });
    assert.equal(bulkApply.status, 302);
    assert.match(String(bulkApply.headers.location || ""), /bulk_notice=/);
    assert.match(String(bulkApply.headers.location || ""), /quality_tier=low/);
    assert.match(String(bulkApply.headers.location || ""), /city=Ndola/);
    assert.match(String(bulkApply.headers.location || ""), /missing_badge=missing_hours/);
    assert.match(String(bulkApply.headers.location || ""), /missing_badge=missing_established_year/);

    const afterA = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tenantId, subA);
    const afterB = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tenantId, subB);
    const afterC = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tenantId, subC);
    assert.equal(String(afterA.website_listing_review_status || ""), "changes_requested");
    assert.equal(String(afterB.website_listing_review_status || ""), "changes_requested");
    assert.equal(String(afterA.website_listing_review_comment || ""), bulkComment);
    assert.equal(String(afterB.website_listing_review_comment || ""), bulkComment);
    assert.equal(String(afterC.website_listing_review_status || ""), "submitted");

    const singleReject = await editorAgent
      .post(`/admin/field-agent/submissions/${subC}/website-listing-review/reject`)
      .type("form")
      .send({ rejection_reason: "Single flow still works." });
    assert.equal(singleReject.status, 302);
    const afterSingle = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tenantId, subC);
    assert.equal(String(afterSingle.website_listing_review_status || ""), "changes_requested");
    assert.match(String(afterSingle.website_listing_review_comment || ""), /single flow still works/i);

    const singlePublishC = await editorAgent
      .post(`/admin/field-agent/submissions/${subC}/website-listing-review/publish`)
      .type("form")
      .send({ listing_name: "Bulk Publish C" });
    assert.equal(singlePublishC.status, 302);
    assert.match(String(singlePublishC.headers.location || ""), /\/admin\/companies\/\d+\/workspace\?published=1/);
    const cMatch = String(singlePublishC.headers.location || "").match(/\/admin\/companies\/(\d+)\/workspace/);
    publishedCompanyC = cMatch ? Number(cMatch[1]) : null;
    assert.ok(publishedCompanyC && publishedCompanyC > 0);

    const bulkPublish = await editorAgent
      .post("/admin/crm/websites/bulk-review")
      .type("form")
      .send({ bulk_action: "publish_ready", crm_task_ids: [taskA, taskC] });
    assert.equal(bulkPublish.status, 302);
    const bulkLoc = decodeURIComponent(String(bulkPublish.headers.location || ""));
    assert.match(bulkLoc, /bulk_notice=/);
    assert.match(bulkLoc, /1 published, 1 skipped, 0 failed/i);

    const afterPublishA = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tenantId, subA);
    assert.equal(String(afterPublishA.website_listing_review_status || ""), "published");
    const rowA = await pool.query(
      `SELECT id FROM public.companies WHERE tenant_id = $1 AND source_field_agent_submission_id = $2 ORDER BY id DESC LIMIT 1`,
      [tenantId, subA]
    );
    publishedCompanyA = rowA.rows[0] ? Number(rowA.rows[0].id) : null;
    assert.ok(publishedCompanyA && publishedCompanyA > 0);
  } finally {
    try {
      for (const cid of [publishedCompanyA, publishedCompanyC].filter(Boolean)) {
        await pool.query(`DELETE FROM public.companies WHERE id = $1`, [cid]);
      }
      for (const tid of [taskA, taskB, taskC].filter(Boolean)) {
        await pool.query(`DELETE FROM public.crm_tasks WHERE id = $1`, [tid]);
      }
      for (const sid of [subA, subB, subC].filter(Boolean)) {
        await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [sid]);
      }
      if (agentId) await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
      for (const aid of [managerId, editorId, viewerId].filter(Boolean)) {
        await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [aid]);
      }
    } catch {
      /* ignore */
    }
    resetBootstrapForTests();
  }
});

test("admin websites queue shows informational quality score for triage", { skip: !isPgConfigured() }, async () => {
  runBootstrap();
  const pool = getPgPool();
  await ensureFieldAgentSchema(pool);
  const app = createModerationHttpApp();
  const tenantId = TENANT_ZM;
  const suffix = uniq();
  const pw = "WebQuality_1!";
  const hash = await bcrypt.hash(pw, 4);

  let managerId;
  let viewerId;
  let agentId;
  let subComplete;
  let subSparse;
  let taskComplete;
  let taskSparse;

  try {
    managerId = await adminUsersRepo.insertUser(pool, {
      username: `web_q_mgr_${suffix}`,
      passwordHash: hash,
      role: ROLES.TENANT_MANAGER,
      tenantId,
      displayName: "",
    });
    viewerId = await adminUsersRepo.insertUser(pool, {
      username: `web_q_view_${suffix}`,
      passwordHash: hash,
      role: ROLES.TENANT_VIEWER,
      tenantId,
      displayName: "",
    });
    agentId = await fieldAgentsRepo.insertAgent(pool, {
      tenantId,
      username: `web_q_fa_${suffix}`,
      passwordHash: hash,
      displayName: "",
      phone: "",
    });

    subComplete = await insertProviderSubmission(pool, { tenantId, fieldAgentId: agentId, phoneNorm: makePhoneNorm(`${suffix}_qc`) });
    subSparse = await insertProviderSubmission(pool, { tenantId, fieldAgentId: agentId, phoneNorm: makePhoneNorm(`${suffix}_qs`) });
    for (const sid of [subComplete, subSparse]) {
      await fieldAgentSubmissionsRepo.approveFieldAgentSubmission(pool, {
        tenantId,
        submissionId: sid,
        commissionAmount: 0,
      });
    }
    await fieldAgentSubmissionsRepo.patchWebsiteListingDraftForAdmin(pool, {
      tenantId,
      submissionId: subComplete,
      draft: {
        listing_name: "Complete Listing",
        about: "This is a complete listing with enough detail for quality scoring.",
        email: "complete@example.com",
        established_year: "2012",
      },
    });
    await fieldAgentSubmissionsRepo.replaceWebsiteSpecialityEntriesForSubmission(pool, {
      tenantId,
      submissionId: subComplete,
      entries: [{ name: "Plumbing", isVerified: true }],
      verifiedByAdminUserId: managerId,
    });
    await fieldAgentSubmissionsRepo.replaceWebsiteWeeklyHoursForSubmission(pool, {
      tenantId,
      submissionId: subComplete,
      weeklyHours: {
        sunday: { closed: false, from: "08:00", to: "17:00" },
        monday: { closed: false, from: "08:00", to: "17:00" },
        tuesday: { closed: false, from: "08:00", to: "17:00" },
        wednesday: { closed: false, from: "08:00", to: "17:00" },
        thursday: { closed: false, from: "08:00", to: "17:00" },
      },
    });
    await fieldAgentSubmissionsRepo.patchWebsiteListingDraftForAdmin(pool, {
      tenantId,
      submissionId: subSparse,
      draft: { listing_name: "Sparse Listing" },
    });

    taskComplete = await createCrmTaskFromEvent({
      tenantId,
      title: `Website listing review ${subComplete}`,
      description: "website-quality-complete",
      sourceType: "field_agent_website_listing",
      sourceRefId: subComplete,
    });
    taskSparse = await createCrmTaskFromEvent({
      tenantId,
      title: `Website listing review ${subSparse}`,
      description: "website-quality-sparse",
      sourceType: "field_agent_website_listing",
      sourceRefId: subSparse,
    });

    const managerAgent = await adminLoginAgent(app, `web_q_mgr_${suffix}`, pw);
    const viewerAgent = await adminLoginAgent(app, `web_q_view_${suffix}`, pw);
    const denied = await viewerAgent.get("/admin/crm?queue=websites");
    assert.equal(denied.status, 403);

    const queueRes = await managerAgent.get("/admin/crm?queue=websites");
    assert.equal(queueRes.status, 200);
    assert.match(queueRes.text || "", /Quality:\s*<strong>\d+\/100<\/strong>/i);
    assert.match(queueRes.text || "", /Missing business name|Missing about text|Short about text|Missing contact info|Missing specialities|Missing hours|Missing established year/i);
    assert.match(queueRes.text || "", /Apply quality filters/i);
    const completeMatch = (queueRes.text || "").match(
      new RegExp(`Website listing review ${subComplete}[\\s\\S]*?Quality:\\s*<strong>(\\d+)\\/100<\\/strong>`, "i")
    );
    const sparseMatch = (queueRes.text || "").match(
      new RegExp(`Website listing review ${subSparse}[\\s\\S]*?Quality:\\s*<strong>(\\d+)\\/100<\\/strong>`, "i")
    );
    assert.ok(completeMatch && sparseMatch);
    assert.ok(Number(completeMatch[1]) > Number(sparseMatch[1]));
    const sparseBadgeRegion = String(queueRes.text || "").match(
      new RegExp(`Website listing review ${subSparse}[\\s\\S]*?(Missing about text|Missing specialities|Missing hours|Missing established year)`, "i")
    );
    assert.ok(sparseBadgeRegion);

    const sortedDesc = await managerAgent.get("/admin/crm?queue=websites&quality_sort=desc");
    assert.equal(sortedDesc.status, 200);
    const descText = String(sortedDesc.text || "");
    const idxCompleteDesc = descText.indexOf(`Website listing review ${subComplete}`);
    const idxSparseDesc = descText.indexOf(`Website listing review ${subSparse}`);
    assert.ok(idxCompleteDesc >= 0 && idxSparseDesc >= 0);
    assert.ok(idxCompleteDesc < idxSparseDesc);

    const sortedAsc = await managerAgent.get("/admin/crm?queue=websites&quality_sort=asc");
    assert.equal(sortedAsc.status, 200);
    const ascText = String(sortedAsc.text || "");
    const idxCompleteAsc = ascText.indexOf(`Website listing review ${subComplete}`);
    const idxSparseAsc = ascText.indexOf(`Website listing review ${subSparse}`);
    assert.ok(idxCompleteAsc >= 0 && idxSparseAsc >= 0);
    assert.ok(idxSparseAsc < idxCompleteAsc);

    const unchanged = await managerAgent
      .post(`/admin/field-agent/submissions/${subSparse}/website-listing-review/reject`)
      .type("form")
      .send({ rejection_reason: "Manual moderation still required." });
    assert.equal(unchanged.status, 302);
    const afterReject = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tenantId, subSparse);
    assert.equal(String(afterReject.website_listing_review_status || ""), "changes_requested");
  } finally {
    try {
      for (const tid of [taskComplete, taskSparse].filter(Boolean)) {
        await pool.query(`DELETE FROM public.crm_tasks WHERE id = $1`, [tid]);
      }
      for (const sid of [subComplete, subSparse].filter(Boolean)) {
        await pool.query(`DELETE FROM public.field_agent_provider_submissions WHERE id = $1`, [sid]);
      }
      if (agentId) await pool.query(`DELETE FROM public.field_agents WHERE id = $1`, [agentId]);
      for (const aid of [managerId, viewerId].filter(Boolean)) {
        await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [aid]);
      }
    } catch {
      /* ignore */
    }
    resetBootstrapForTests();
  }
});
