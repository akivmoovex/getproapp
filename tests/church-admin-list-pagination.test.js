"use strict";

/**
 * Safe pagination for broadcast deliveries, report deliveries, and schedule lists.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const {
  parseAdminListPageParams,
  buildAdminListPageResult,
  buildAdminListPageUrls,
  MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
} = require("../src/church/adminListPagination");
const scheduledBroadcastService = require("../src/services/church/scheduledBroadcastService");
const scheduledReportService = require("../src/services/church/scheduledReportService");
const hqBroadcastsRepo = require("../src/db/pg/church/hqBroadcastsRepo");
const {
  createGrowthSmokeTenant,
  cleanupPilotOrganization,
} = require("./helpers/churchPilotSmokeFixtures");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

test("parseAdminListPageParams clamps invalid and excessive sizes", () => {
  assert.deepEqual(parseAdminListPageParams({}), {
    page: 1,
    limit: DEFAULT_PAGE_SIZE,
    offset: 0,
  });
  assert.equal(parseAdminListPageParams({ page: 0, limit: 0 }).page, 1);
  assert.equal(parseAdminListPageParams({ page: -3, limit: -1 }).limit, DEFAULT_PAGE_SIZE);
  assert.equal(parseAdminListPageParams({ limit: 9999 }).limit, MAX_PAGE_SIZE);
  assert.equal(parseAdminListPageParams({ limit: "50" }).limit, 50);
  assert.equal(parseAdminListPageParams({ page: "2", limit: "75" }).offset, 75);

  const meta = buildAdminListPageResult({ page: 99, limit: 50, total: 120 });
  assert.equal(meta.page, 3);
  assert.equal(meta.from, 101);
  assert.equal(meta.to, 120);
  assert.equal(meta.hasNext, false);
  assert.equal(meta.hasPrev, true);

  const urls = buildAdminListPageUrls(
    "/branch/scheduled-reports",
    { notice: "x", page: "2", limit: "50" },
    { page: 2, hasPrev: true, hasNext: true, totalPages: 5 }
  );
  assert.match(urls.prevUrl, /notice=x/);
  assert.doesNotMatch(urls.prevUrl, /page=/);
  assert.match(urls.nextUrl, /page=3/);
});

test(
  "broadcast deliveries: >200 rows, first/middle/final pages, isolation, stable order",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const a = await createGrowthSmokeTenant(pool, { suffix: makeSuffix("bpagea") });
    const b = await createGrowthSmokeTenant(pool, { suffix: makeSuffix("bpageb") });

    try {
      const broadcast = await hqBroadcastsRepo.createBroadcastForOrganization(pool, a.organization.id, {
        title: "Page broadcast",
        body: "x",
        category: "general",
        audience: "members",
        delivery_channels: ["in_app"],
        status: "published",
        created_by_hq_admin_id: a.hqAdmin.id,
      });
      const foreign = await hqBroadcastsRepo.createBroadcastForOrganization(pool, b.organization.id, {
        title: "Other org",
        body: "y",
        category: "general",
        audience: "members",
        delivery_channels: ["in_app"],
        status: "published",
        created_by_hq_admin_id: b.hqAdmin.id,
      });

      const stamp = new Date("2026-09-01T12:00:00.000Z").toISOString();
      for (let i = 0; i < 220; i += 1) {
        await pool.query(
          `INSERT INTO public.church_hq_broadcast_deliveries (
             organization_id, broadcast_id, channel, recipient_type, recipient_id,
             status, idempotency_key, delivered_at, created_at
           ) VALUES ($1,$2,'in_app','member',$3,'delivered',$4,$5,$5)`,
          [
            a.organization.id,
            broadcast.id,
            10000 + i,
            `bcast:${broadcast.id}:in_app:member:${10000 + i}`,
            stamp,
          ]
        );
      }
      await pool.query(
        `INSERT INTO public.church_hq_broadcast_deliveries (
           organization_id, broadcast_id, channel, recipient_type, recipient_id,
           status, idempotency_key, delivered_at
         ) VALUES ($1,$2,'in_app','member',1,'delivered',$3,now())`,
        [b.organization.id, foreign.id, `bcast:${foreign.id}:in_app:member:1`]
      );

      const first = await scheduledBroadcastService.listDeliveries(pool, broadcast.id, a.organization.id, {
        page: 1,
        limit: 50,
      });
      assert.equal(first.total, 220);
      assert.equal(first.rows.length, 50);
      assert.equal(first.from, 1);
      assert.equal(first.to, 50);
      assert.equal(first.hasPrev, false);
      assert.equal(first.hasNext, true);

      const middle = await scheduledBroadcastService.listDeliveries(pool, broadcast.id, a.organization.id, {
        page: 3,
        limit: 50,
      });
      assert.equal(middle.rows.length, 50);
      assert.equal(middle.from, 101);
      assert.equal(middle.to, 150);

      const final = await scheduledBroadcastService.listDeliveries(pool, broadcast.id, a.organization.id, {
        page: 5,
        limit: 50,
      });
      assert.equal(final.rows.length, 20);
      assert.equal(final.from, 201);
      assert.equal(final.to, 220);
      assert.equal(final.hasNext, false);

      const oversized = await scheduledBroadcastService.listDeliveries(pool, broadcast.id, a.organization.id, {
        page: 1,
        limit: 500,
      });
      assert.equal(oversized.limit, 100);
      assert.equal(oversized.rows.length, 100);

      // Stable order when timestamps match: id ASC
      const ids = first.rows.map((r) => Number(r.id));
      for (let i = 1; i < ids.length; i += 1) {
        assert.ok(ids[i] > ids[i - 1], "delivery ids must increase");
      }

      const isolated = await scheduledBroadcastService.listDeliveries(pool, broadcast.id, b.organization.id, {
        page: 1,
        limit: 50,
      });
      assert.equal(isolated.total, 0);
      assert.equal(isolated.rows.length, 0);

      const foreignPage = await scheduledBroadcastService.listDeliveries(
        pool,
        foreign.id,
        b.organization.id,
        { page: 1, limit: 50 }
      );
      assert.equal(foreignPage.total, 1);
    } finally {
      await cleanupPilotOrganization(pool, a.organization.id);
      await cleanupPilotOrganization(pool, b.organization.id);
    }
  }
);

test(
  "report deliveries: >200 rows paginated; schedules >50; isolation; stable order",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const a = await createGrowthSmokeTenant(pool, { suffix: makeSuffix("rpagea") });
    const b = await createGrowthSmokeTenant(pool, { suffix: makeSuffix("rpageb") });
    const passwordHash = await bcrypt.hash("PageTest_pw_2026!", 12);

    try {
      const schedule = await scheduledReportService.createSchedule(pool, {
        organizationId: a.organization.id,
        branchId: a.branch.id,
        actorType: "branch_admin",
        actorId: a.branchAdmin.id,
        at: new Date("2026-09-01T08:00:00.000Z"),
        body: {
          report_type: "branch_attendance_summary",
          export_format: "csv",
          frequency: "daily",
          timezone: "UTC",
          delivery_time_local: "09:00",
          recipients: [{ recipient_type: "branch_admin", recipient_id: a.branchAdmin.id }],
        },
      });

      const run = await pool.query(
        `INSERT INTO public.church_scheduled_report_runs (
           schedule_id, organization_id, job_key, scheduled_for, status, export_format, attempt_count, started_at, finished_at
         ) VALUES ($1,$2,$3,$4,'delivered','csv',1,now(),now())
         RETURNING *`,
        [
          schedule.id,
          a.organization.id,
          `sched_report:${schedule.id}:2026-09-01T09:00:00.000Z`,
          "2026-09-01T09:00:00.000Z",
        ]
      );
      const runId = run.rows[0].id;
      const stamp = new Date("2026-09-01T09:05:00.000Z").toISOString();
      for (let i = 0; i < 210; i += 1) {
        await pool.query(
          `INSERT INTO public.church_scheduled_report_deliveries (
             run_id, organization_id, recipient_type, recipient_id, recipient_email,
             status, idempotency_key, delivered_at, created_at
           ) VALUES ($1,$2,'hq_admin',$3,$4,'delivered',$5,$6,$6)`,
          [
            runId,
            a.organization.id,
            20000 + i,
            `r${i}@example.com`,
            `delivery:${runId}:hq_admin:${20000 + i}`,
            stamp,
          ]
        );
      }

      // Extra schedules beyond one page
      for (let i = 0; i < 55; i += 1) {
        await pool.query(
          `INSERT INTO public.church_scheduled_reports (
             organization_id, branch_id, report_type, filters_json, export_format,
             frequency, timezone, delivery_time_local, status,
             created_by_actor_type, created_by_actor_id, updated_at
           ) VALUES ($1,$2,'branch_attendance_summary','{}'::jsonb,'csv',
             'daily','UTC','09:00','paused','branch_admin',$3,$4)`,
          [
            a.organization.id,
            a.branch.id,
            a.branchAdmin.id,
            new Date(Date.UTC(2026, 8, 1, 10, 0, 0) - i * 1000).toISOString(),
          ]
        );
      }

      const otherSchedule = await scheduledReportService.createSchedule(pool, {
        organizationId: b.organization.id,
        branchId: b.branch.id,
        actorType: "branch_admin",
        actorId: b.branchAdmin.id,
        at: new Date("2026-09-01T08:00:00.000Z"),
        body: {
          report_type: "branch_attendance_summary",
          export_format: "csv",
          frequency: "daily",
          timezone: "UTC",
          delivery_time_local: "09:00",
          recipients: [{ recipient_type: "branch_admin", recipient_id: b.branchAdmin.id }],
        },
      });

      const first = await scheduledReportService.listDeliveriesForSchedule(
        pool,
        schedule.id,
        a.organization.id,
        { page: 1, limit: 50 }
      );
      assert.equal(first.total, 210);
      assert.equal(first.rows.length, 50);
      assert.equal(first.from, 1);
      assert.equal(first.to, 50);

      const middle = await scheduledReportService.listDeliveriesForSchedule(
        pool,
        schedule.id,
        a.organization.id,
        { page: 3, limit: 50 }
      );
      assert.equal(middle.from, 101);
      assert.equal(middle.to, 150);

      const final = await scheduledReportService.listDeliveriesForSchedule(
        pool,
        schedule.id,
        a.organization.id,
        { page: 5, limit: 50 }
      );
      assert.equal(final.rows.length, 10);
      assert.equal(final.to, 210);
      assert.equal(final.hasNext, false);

      const capped = await scheduledReportService.listDeliveriesForSchedule(
        pool,
        schedule.id,
        a.organization.id,
        { page: 1, limit: 1000 }
      );
      assert.equal(capped.limit, 100);

      const ids = first.rows.map((r) => Number(r.id));
      for (let i = 1; i < ids.length; i += 1) {
        assert.ok(ids[i] > ids[i - 1]);
      }

      const leak = await scheduledReportService.listDeliveriesForSchedule(
        pool,
        schedule.id,
        b.organization.id,
        { page: 1, limit: 50 }
      );
      assert.equal(leak.total, 0);

      const other = await scheduledReportService.listDeliveriesForSchedule(
        pool,
        otherSchedule.id,
        b.organization.id,
        { page: 1, limit: 50 }
      );
      assert.equal(other.total, 0);

      const schedulesFirst = await scheduledReportService.listSchedulesForBranch(
        pool,
        a.organization.id,
        a.branch.id,
        { page: 1, limit: 50 }
      );
      assert.ok(schedulesFirst.total >= 56);
      assert.equal(schedulesFirst.rows.length, 50);
      assert.equal(schedulesFirst.hasNext, true);

      const schedulesLast = await scheduledReportService.listSchedulesForBranch(
        pool,
        a.organization.id,
        a.branch.id,
        { page: schedulesFirst.totalPages, limit: 50 }
      );
      assert.ok(schedulesLast.rows.length >= 1);
      assert.equal(schedulesLast.hasNext, false);

      // Same updated_at tie-breaker uses id DESC (deterministic)
      const sameStamp = new Date("2026-08-15T12:00:00.000Z").toISOString();
      const idsR = await pool.query(
        `SELECT id FROM public.church_scheduled_reports
         WHERE organization_id = $1 AND branch_id = $2 AND status = 'paused'
         ORDER BY id DESC LIMIT 5`,
        [a.organization.id, a.branch.id]
      );
      await pool.query(
        `UPDATE public.church_scheduled_reports SET updated_at = $2 WHERE id = ANY($1::bigint[])`,
        [idsR.rows.map((r) => r.id), sameStamp]
      );

      const tied = await scheduledReportService.listSchedulesForBranch(
        pool,
        a.organization.id,
        a.branch.id,
        { page: 1, limit: 50 }
      );
      const tiedIds = tied.rows.map((r) => Number(r.id));
      assert.equal(tiedIds.length, new Set(tiedIds).size);
      // Among rows sharing sameStamp, ordering must be id DESC
      const sameStampRows = tied.rows.filter(
        (r) => r.updated_at && new Date(r.updated_at).toISOString() === sameStamp
      );
      for (let i = 1; i < sameStampRows.length; i += 1) {
        assert.ok(Number(sameStampRows[i - 1].id) > Number(sameStampRows[i].id));
      }

      void passwordHash;
    } finally {
      await cleanupPilotOrganization(pool, a.organization.id);
      await cleanupPilotOrganization(pool, b.organization.id);
    }
  }
);
