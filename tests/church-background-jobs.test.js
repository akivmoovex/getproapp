"use strict";

const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const hqBroadcastsRepo = require("../src/db/pg/church/hqBroadcastsRepo");
const auditLogsRepo = require("../src/db/pg/church/auditLogsRepo");
const {
  safeErrorSummary,
  parseJobRef,
  listBackgroundJobs,
  getBackgroundJob,
  retryBackgroundJob,
  cancelBackgroundJob,
} = require("../src/services/church/churchBackgroundJobStatusService");
const scheduledReportService = require("../src/services/church/scheduledReportService");
const blessboardAdminRoutes = require("../src/routes/blessboardAdmin");
const { ROLES } = require("../src/auth/roles");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makePlatformApp(role) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "test-background-jobs",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isBlessBoardApexHost = true;
    if (role) {
      req.session.adminUser = {
        id: 99,
        username: "super",
        display_name: "Super",
        role,
      };
    }
    next();
  });
  app.use("/admin", blessboardAdminRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

async function cleanup(pool, orgIds) {
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
    await pool.query(
      `DELETE FROM public.church_scheduled_report_deliveries WHERE organization_id = $1`,
      [orgId]
    );
    await pool.query(`DELETE FROM public.church_scheduled_report_runs WHERE organization_id = $1`, [
      orgId,
    ]);
    await pool.query(`DELETE FROM public.church_scheduled_report_recipients WHERE organization_id = $1`, [
      orgId,
    ]);
    await pool.query(`DELETE FROM public.church_scheduled_reports WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_hq_broadcast_deliveries WHERE organization_id = $1`, [
      orgId,
    ]);
    await pool.query(`DELETE FROM public.church_hq_broadcasts WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("secret redaction strips password/token patterns from error summaries", () => {
  assert.equal(safeErrorSummary(null), null);
  assert.match(safeErrorSummary("failed with password=hunter2"), /\[redacted\]/);
  assert.match(safeErrorSummary("Bearer abc.def.ghi"), /\[redacted\]/);
  assert.equal(safeErrorSummary("full_name,email,phone\nada,"), "Job failed (details withheld).");
  assert.equal(safeErrorSummary("timeout contacting delivery"), "timeout contacting delivery");
});

test("parseJobRef validates typed references", () => {
  assert.equal(parseJobRef("scheduled_report_run:12").ok, true);
  assert.equal(parseJobRef("quota_period:3_2026-07-01").ok, true);
  assert.equal(parseJobRef("nope:1").ok, false);
  assert.equal(parseJobRef("scheduled_report_run").ok, false);
});

test("anonymous and non-super-admin cannot access background jobs", async () => {
  const anon = await request(makePlatformApp(null)).get("/admin/church/jobs").set("Host", "blessboard.com");
  assert.ok([302, 303].includes(anon.status));
  assert.match(String(anon.headers.location || ""), /login/i);

  const tm = await request(makePlatformApp(ROLES.TENANT_MANAGER))
    .get("/admin/church/jobs")
    .set("Host", "blessboard.com");
  assert.equal(tm.status, 403);
});

test(
  "background jobs: successful/failed, safe retry, duplicate retry, cancellation, audit",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("bgj");
    const passwordHash = await bcrypt.hash("testpass123456", 12);

    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `bgj_${suffix}`.slice(0, 40),
      name: `BG Jobs ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      org.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      host_slug: `bgjb_${suffix}`.slice(0, 30),
      name: "Main",
      status: "active",
    });
    const hq = await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: org.id,
      full_name: "HQ Jobs",
      email: `hq_bgj_${suffix}@example.com`,
      phone: "0977222001",
      password_hash: passwordHash,
    });

    // Successful delivered run
    const schedOk = await pool.query(
      `INSERT INTO public.church_scheduled_reports (
         organization_id, branch_id, report_type, export_format, frequency, timezone,
         delivery_time_local, status, created_by_actor_type, created_by_actor_id, next_run_at
       ) VALUES ($1,$2,'branch_monthly_summary','csv','monthly','UTC','09:00','enabled','hq_admin',$3,now())
       RETURNING *`,
      [org.id, branch.id, hq.id]
    );
    const scheduleOk = schedOk.rows[0];
    const okRun = await pool.query(
      `INSERT INTO public.church_scheduled_report_runs (
         schedule_id, organization_id, job_key, scheduled_for, status, attempt_count,
         export_format, export_body, started_at, finished_at
       ) VALUES ($1,$2,$3,now(),'delivered',1,'csv','ok',now(),now())
       RETURNING *`,
      [scheduleOk.id, org.id, `sched_report:${scheduleOk.id}:ok-${suffix}`]
    );

    // Failed run for retry
    const schedFail = await pool.query(
      `INSERT INTO public.church_scheduled_reports (
         organization_id, branch_id, report_type, export_format, frequency, timezone,
         delivery_time_local, status, created_by_actor_type, created_by_actor_id, next_run_at
       ) VALUES ($1,$2,'branch_monthly_summary','csv','monthly','UTC','09:00','enabled','hq_admin',$3,now())
       RETURNING *`,
      [org.id, branch.id, hq.id]
    );
    const scheduleFail = schedFail.rows[0];
    await pool.query(
      `INSERT INTO public.church_scheduled_report_recipients (
         schedule_id, organization_id, recipient_type, recipient_id
       ) VALUES ($1,$2,'hq_admin',$3)`,
      [scheduleFail.id, org.id, hq.id]
    );
    const failRun = await pool.query(
      `INSERT INTO public.church_scheduled_report_runs (
         schedule_id, organization_id, job_key, scheduled_for, status, attempt_count,
         last_error, export_format, export_body, started_at, finished_at
       ) VALUES ($1,$2,$3,now(),'failed',1,$4,'csv','col1\n1',now(),now())
       RETURNING *`,
      [
        scheduleFail.id,
        org.id,
        `sched_report:${scheduleFail.id}:fail-${suffix}`,
        "delivery timeout password=secret123",
      ]
    );
    const failedRunId = failRun.rows[0].id;

    // Pending broadcast for cancel
    const toCancelCreated = await hqBroadcastsRepo.createBroadcastForOrganization(pool, org.id, {
      title: "Pending cancel broadcast",
      body: "Confidential body must not appear on jobs page",
      status: "scheduled",
      publish_at: new Date(Date.now() + 3600_000).toISOString(),
      created_by_hq_admin_id: hq.id,
      delivery_channels: ["in_app"],
    });
    await pool.query(
      `UPDATE public.church_hq_broadcasts SET job_key = $2 WHERE id = $1`,
      [toCancelCreated.id, `sched_broadcast:pending-${suffix}`]
    );
    const toCancel = { id: toCancelCreated.id };

    // Failed broadcast for retry
    const toRetryCreated = await hqBroadcastsRepo.createBroadcastForOrganization(pool, org.id, {
      title: "Failed broadcast",
      body: "Do not leak",
      status: "failed",
      publish_at: new Date().toISOString(),
      created_by_hq_admin_id: hq.id,
      delivery_channels: ["in_app"],
    });
    await pool.query(
      `UPDATE public.church_hq_broadcasts
       SET job_key = $2, last_error = $3
       WHERE id = $1`,
      [toRetryCreated.id, `sched_broadcast:fail-${suffix}`, "token leak check Bearer xyz.token.value"]
    );
    const toRetryBroadcast = { id: toRetryCreated.id };

    const listed = await listBackgroundJobs(pool, {
      organization_id: String(org.id),
      limit: "50",
    });
    assert.ok(listed.jobs.some((j) => j.ref === `scheduled_report_run:${okRun.rows[0].id}`));
    const okJob = listed.jobs.find((j) => j.ref === `scheduled_report_run:${okRun.rows[0].id}`);
    assert.equal(okJob.status, "delivered");
    assert.equal(okJob.canRetry, false);

    const failedJob = await getBackgroundJob(pool, `scheduled_report_run:${failedRunId}`);
    assert.equal(failedJob.status, "failed");
    assert.equal(failedJob.canRetry, true);
    assert.match(failedJob.errorSummary, /\[redacted\]/);
    assert.doesNotMatch(failedJob.errorSummary || "", /secret123/);

    const page = await request(makePlatformApp(ROLES.SUPER_ADMIN))
      .get("/admin/church/jobs")
      .set("Host", "blessboard.com");
    assert.equal(page.status, 200);
    assert.match(page.text, /Background jobs/);
    assert.doesNotMatch(page.text, /Confidential body must not appear/);
    assert.doesNotMatch(page.text, /secret123/);

    const detail = await request(makePlatformApp(ROLES.SUPER_ADMIN))
      .get(`/admin/church/jobs/scheduled_report_run/${failedRunId}`)
      .set("Host", "blessboard.com");
    assert.equal(detail.status, 200);
    assert.match(detail.text, /Retry failed job/);
    assert.doesNotMatch(detail.text, /secret123/);

    const retry1 = await retryBackgroundJob(pool, `scheduled_report_run:${failedRunId}`, {
      platformAdminId: 99,
    });
    assert.ok(retry1.job);
    const afterRetry = await scheduledReportService.findRunForOrganization(pool, failedRunId, org.id);
    assert.ok(["delivered", "failed", "running"].includes(afterRetry.status));

    const auditRetry = await pool.query(
      `SELECT * FROM public.church_audit_logs
       WHERE organization_id = $1 AND action = 'platform_background_job_retry'
       ORDER BY id DESC LIMIT 1`,
      [org.id]
    );
    assert.equal(auditRetry.rows.length, 1);
    assert.equal(auditRetry.rows[0].actor_type, "platform_admin");

    // Duplicate retry: if already not failed, should reject; force delivered then retry
    await pool.query(
      `UPDATE public.church_scheduled_report_runs SET status = 'delivered', last_error = NULL WHERE id = $1`,
      [failedRunId]
    );
    await assert.rejects(
      () => retryBackgroundJob(pool, `scheduled_report_run:${failedRunId}`, { platformAdminId: 99 }),
      (err) => err && (err.code === "RETRY_UNSUPPORTED" || err.code === "INVALID_STATUS")
    );

    const cancelJob = await getBackgroundJob(pool, `scheduled_broadcast:${toCancel.id}`);
    assert.equal(cancelJob.canCancel, true);
    assert.doesNotMatch(JSON.stringify(cancelJob.detailSafe), /Confidential|body/i);

    const cancelled = await cancelBackgroundJob(pool, `scheduled_broadcast:${toCancel.id}`, {
      platformAdminId: 99,
    });
    assert.equal(cancelled.job.status, "cancelled");
    const auditCancel = await pool.query(
      `SELECT * FROM public.church_audit_logs
       WHERE organization_id = $1 AND action = 'platform_background_job_cancelled'
       ORDER BY id DESC LIMIT 1`,
      [org.id]
    );
    assert.equal(auditCancel.rows.length, 1);

    // Duplicate cancel should fail (no longer pending)
    await assert.rejects(
      () => cancelBackgroundJob(pool, `scheduled_broadcast:${toCancel.id}`, { platformAdminId: 99 }),
      (err) => err && (err.code === "CANCEL_UNSUPPORTED" || err.code === "INVALID_STATUS")
    );

    const failBc = await getBackgroundJob(pool, `scheduled_broadcast:${toRetryBroadcast.id}`);
    assert.equal(failBc.canRetry, true);
    assert.match(failBc.errorSummary || "", /\[redacted\]/);
    assert.doesNotMatch(failBc.errorSummary || "", /xyz\.token/);

    await cleanup(pool, [org.id]);
  }
);
