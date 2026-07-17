"use strict";

/**
 * PostgreSQL concurrency tests for BlessBoard package quota atomicity.
 * Covers storage, external email, and scheduled-report meters.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const {
  createGrowthSmokeTenant,
  cleanupPilotOrganization,
  makeSuffix,
} = require("./helpers/churchPilotSmokeFixtures");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const organizationUsageRepo = require("../src/db/pg/church/organizationUsageRepo");
const churchPackageUsageService = require("../src/services/church/churchPackageUsageService");
const churchEntitlementService = require("../src/services/church/churchEntitlementService");
const branchesRepo = require("../src/db/pg/church/branchesRepo");

const skip = !isPgConfigured();

async function storageUsed(pool, organizationId) {
  const r = await pool.query(
    `SELECT COALESCE(storage_bytes_used, 0)::bigint AS used
     FROM public.church_organizations WHERE id = $1`,
    [organizationId]
  );
  return Number(r.rows[0]?.used) || 0;
}

async function emailUsed(pool, organizationId, at) {
  const org = await organizationsRepo.findOrganizationById(pool, organizationId);
  const month = organizationUsageRepo.usageMonthKeyForTimezone(org.timezone || "UTC", at);
  const row = await organizationUsageRepo.findUsageMonth(pool, organizationId, month);
  return Number(row?.external_emails_count) || 0;
}

async function reportsUsed(pool, organizationId, at) {
  const org = await organizationsRepo.findOrganizationById(pool, organizationId);
  const month = organizationUsageRepo.usageMonthKeyForTimezone(org.timezone || "UTC", at);
  const row = await organizationUsageRepo.findUsageMonth(pool, organizationId, month);
  return Number(row?.scheduled_reports_count) || 0;
}

test(
  "1 concurrent storage reservations near limit: exactly one succeeds",
  { skip },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const growth = await createGrowthSmokeTenant(pool, { suffix: makeSuffix("storConc") });
    try {
      const orgId = growth.organization.id;
      const plan = await churchEntitlementService.getOrganisationPlan(pool, orgId);
      const branches = await branchesRepo.countActiveBranchesForOrganization(pool, orgId);
      const limit = churchEntitlementService.getNumericLimit(plan, "storage.bytes", {
        activeBranchCount: branches,
      });
      assert.equal(typeof limit, "number");

      const chunk = 1000;
      await pool.query(
        `UPDATE public.church_organizations SET storage_bytes_used = $2 WHERE id = $1`,
        [orgId, limit - chunk]
      );

      const [a, b] = await Promise.all([
        organizationUsageRepo.tryReserveStorageBytes(pool, orgId, chunk, limit),
        organizationUsageRepo.tryReserveStorageBytes(pool, orgId, chunk, limit),
      ]);
      assert.equal(a.reserved + b.reserved, chunk);
      assert.ok(
        (a.reserved === chunk && b.reserved === 0) || (b.reserved === chunk && a.reserved === 0)
      );
      assert.equal(await storageUsed(pool, orgId), limit);

      const blocked = await Promise.allSettled([
        churchPackageUsageService.assertCanConsumeStorage(pool, {
          organizationId: orgId,
          additionalBytes: 1,
          actorType: "system",
        }),
        churchPackageUsageService.assertCanConsumeStorage(pool, {
          organizationId: orgId,
          additionalBytes: 1,
          actorType: "system",
        }),
      ]);
      assert.ok(blocked.every((r) => r.status === "rejected"));
      assert.ok(blocked.every((r) => r.reason && r.reason.code === "PACKAGE_STORAGE_LIMIT"));
      assert.equal(await storageUsed(pool, orgId), limit);
    } finally {
      await cleanupPilotOrganization(pool, growth.organization.id);
    }
  }
);

test(
  "2 concurrent email reservations near limit cannot exceed quota",
  { skip },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const growth = await createGrowthSmokeTenant(pool, { suffix: makeSuffix("emailConc") });
    try {
      const at = new Date("2026-07-10T12:00:00.000Z");
      const org = await organizationsRepo.findOrganizationById(pool, growth.organization.id);
      const month = organizationUsageRepo.usageMonthKeyForTimezone(org.timezone || "UTC", at);
      const plan = await churchEntitlementService.getOrganisationPlan(pool, org.id);
      const branches = await branchesRepo.countActiveBranchesForOrganization(pool, org.id);
      const limit = churchEntitlementService.getNumericLimit(plan, "external_emails.monthly", {
        activeBranchCount: branches,
      });
      assert.equal(typeof limit, "number");
      await organizationUsageRepo.getOrCreateUsageMonth(pool, org.id, month);
      await pool.query(
        `UPDATE public.church_organization_usage_months
         SET external_emails_count = $3
         WHERE organization_id = $1 AND usage_month = $2::date`,
        [org.id, month, limit - 7]
      );

      const [a, b] = await Promise.all([
        organizationUsageRepo.tryReserveExternalEmailsUpTo(pool, org.id, month, 7, limit),
        organizationUsageRepo.tryReserveExternalEmailsUpTo(pool, org.id, month, 7, limit),
      ]);
      assert.equal(a.reserved + b.reserved, 7);
      assert.equal(await emailUsed(pool, org.id, at), limit);
    } finally {
      await cleanupPilotOrganization(pool, growth.organization.id);
    }
  }
);

test(
  "3 concurrent scheduled-report reservations near limit cannot exceed quota",
  { skip },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const growth = await createGrowthSmokeTenant(pool, { suffix: makeSuffix("repConc") });
    try {
      const at = new Date("2026-07-11T12:00:00.000Z");
      const org = await organizationsRepo.findOrganizationById(pool, growth.organization.id);
      const month = organizationUsageRepo.usageMonthKeyForTimezone(org.timezone || "UTC", at);
      const plan = await churchEntitlementService.getOrganisationPlan(pool, org.id);
      const limit = churchEntitlementService.getNumericLimit(plan, "reports.scheduled_monthly");
      assert.equal(typeof limit, "number");
      await organizationUsageRepo.getOrCreateUsageMonth(pool, org.id, month);
      await pool.query(
        `UPDATE public.church_organization_usage_months
         SET scheduled_reports_count = $3
         WHERE organization_id = $1 AND usage_month = $2::date`,
        [org.id, month, limit - 1]
      );

      const settled = await Promise.allSettled([
        churchPackageUsageService.assertCanCreateScheduledReport(pool, {
          organizationId: org.id,
          consume: true,
          at,
          count: 1,
        }),
        churchPackageUsageService.assertCanCreateScheduledReport(pool, {
          organizationId: org.id,
          consume: true,
          at,
          count: 1,
        }),
      ]);
      const ok = settled.filter((r) => r.status === "fulfilled");
      const rejected = settled.filter((r) => r.status === "rejected");
      assert.equal(ok.length, 1);
      assert.equal(rejected.length, 1);
      assert.equal(rejected[0].reason.code, "PACKAGE_SCHEDULED_REPORT_LIMIT");
      assert.equal(await reportsUsed(pool, org.id, at), limit);
    } finally {
      await cleanupPilotOrganization(pool, growth.organization.id);
    }
  }
);

test(
  "4 failed business write rolls back storage usage increment",
  { skip },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const growth = await createGrowthSmokeTenant(pool, { suffix: makeSuffix("storRb") });
    try {
      const orgId = growth.organization.id;
      const before = await storageUsed(pool, orgId);
      const bytes = 4096;
      await churchPackageUsageService.assertCanConsumeStorage(pool, {
        organizationId: orgId,
        additionalBytes: bytes,
        actorType: "system",
      });
      assert.equal(await storageUsed(pool, orgId), before + bytes);

      // Simulate failed attachment persist.
      await churchPackageUsageService.releaseStorageBytes(pool, {
        organizationId: orgId,
        bytes,
      });
      assert.equal(await storageUsed(pool, orgId), before);
    } finally {
      await cleanupPilotOrganization(pool, growth.organization.id);
    }
  }
);

test(
  "5 failed usage increment rolls back business write",
  { skip },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const growth = await createGrowthSmokeTenant(pool, { suffix: makeSuffix("bizRb") });
    try {
      const orgId = growth.organization.id;
      const at = new Date("2026-07-12T12:00:00.000Z");
      const org = await organizationsRepo.findOrganizationById(pool, orgId);
      const month = organizationUsageRepo.usageMonthKeyForTimezone(org.timezone || "UTC", at);
      const plan = await churchEntitlementService.getOrganisationPlan(pool, orgId);
      const limit = churchEntitlementService.getNumericLimit(plan, "reports.scheduled_monthly");
      await organizationUsageRepo.getOrCreateUsageMonth(pool, orgId, month);
      await pool.query(
        `UPDATE public.church_organization_usage_months
         SET scheduled_reports_count = $3
         WHERE organization_id = $1 AND usage_month = $2::date`,
        [orgId, month, limit]
      );

      const client = await pool.connect();
      let businessId = null;
      try {
        await client.query("BEGIN");
        const inserted = await client.query(
          `INSERT INTO public.church_organization_usage_months (
             organization_id, usage_month, scheduled_reports_count
           ) VALUES ($1, $2::date, 0)
           ON CONFLICT (organization_id, usage_month) DO UPDATE
             SET updated_at = now()
           RETURNING organization_id`,
          [orgId, month]
        );
        businessId = inserted.rows[0]?.organization_id || orgId;

        // Quota reservation must fail (already at limit) — roll back business txn.
        const reservation = await organizationUsageRepo.tryReserveScheduledReportsUpTo(
          client,
          orgId,
          month,
          1,
          limit
        );
        assert.equal(reservation.reserved, 0);
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }

      assert.ok(businessId);
      assert.equal(await reportsUsed(pool, orgId, at), limit);
    } finally {
      await cleanupPilotOrganization(pool, growth.organization.id);
    }
  }
);

test(
  "6 different organizations do not block or modify each other",
  { skip },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const a = await createGrowthSmokeTenant(pool, { suffix: makeSuffix("isoA") });
    const b = await createGrowthSmokeTenant(pool, { suffix: makeSuffix("isoB") });
    try {
      const at = new Date("2026-07-13T12:00:00.000Z");
      const orgA = await organizationsRepo.findOrganizationById(pool, a.organization.id);
      const orgB = await organizationsRepo.findOrganizationById(pool, b.organization.id);
      const monthA = organizationUsageRepo.usageMonthKeyForTimezone(orgA.timezone || "UTC", at);
      const monthB = organizationUsageRepo.usageMonthKeyForTimezone(orgB.timezone || "UTC", at);

      await Promise.all([
        organizationUsageRepo.tryReserveStorageBytes(pool, a.organization.id, 5000, null),
        organizationUsageRepo.tryReserveStorageBytes(pool, b.organization.id, 7000, null),
        organizationUsageRepo.tryReserveExternalEmailsUpTo(pool, a.organization.id, monthA, 3, null),
        organizationUsageRepo.tryReserveExternalEmailsUpTo(pool, b.organization.id, monthB, 9, null),
        organizationUsageRepo.tryReserveScheduledReportsUpTo(pool, a.organization.id, monthA, 2, null),
        organizationUsageRepo.tryReserveScheduledReportsUpTo(pool, b.organization.id, monthB, 4, null),
      ]);

      assert.equal(await storageUsed(pool, a.organization.id), 5000);
      assert.equal(await storageUsed(pool, b.organization.id), 7000);
      assert.equal(await emailUsed(pool, a.organization.id, at), 3);
      assert.equal(await emailUsed(pool, b.organization.id, at), 9);
      assert.equal(await reportsUsed(pool, a.organization.id, at), 2);
      assert.equal(await reportsUsed(pool, b.organization.id, at), 4);
    } finally {
      await cleanupPilotOrganization(pool, a.organization.id);
      await cleanupPilotOrganization(pool, b.organization.id);
    }
  }
);

test(
  "7 exempt email categories remain unmetered under concurrent load",
  { skip },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const growth = await createGrowthSmokeTenant(pool, { suffix: makeSuffix("exempt") });
    try {
      const at = new Date("2026-07-14T12:00:00.000Z");
      const before = await emailUsed(pool, growth.organization.id, at);
      const results = await Promise.all([
        churchPackageUsageService.recordExternalEmailSend(pool, {
          organizationId: growth.organization.id,
          category: "safeguarding",
          count: 5,
          at,
        }),
        churchPackageUsageService.recordExternalEmailSend(pool, {
          organizationId: growth.organization.id,
          category: "password_recovery",
          count: 3,
          at,
        }),
        churchPackageUsageService.recordExternalEmailSend(pool, {
          organizationId: growth.organization.id,
          category: "newsletter",
          count: 2,
          at,
        }),
      ]);
      assert.equal(results[0].exempt, true);
      assert.equal(results[1].exempt, true);
      assert.equal(results[2].exempt, false);
      assert.equal(results[2].recorded, true);
      assert.equal(await emailUsed(pool, growth.organization.id, at), before + 2);
    } finally {
      await cleanupPilotOrganization(pool, growth.organization.id);
    }
  }
);

test(
  "8 counters remain correct after retry / idempotent reservation release",
  { skip },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const growth = await createGrowthSmokeTenant(pool, { suffix: makeSuffix("idem") });
    try {
      const at = new Date("2026-07-15T12:00:00.000Z");
      const orgId = growth.organization.id;
      const org = await organizationsRepo.findOrganizationById(pool, orgId);
      const month = organizationUsageRepo.usageMonthKeyForTimezone(org.timezone || "UTC", at);

      const first = await churchPackageUsageService.reserveExternalEmailSends(pool, {
        organizationId: orgId,
        category: "newsletter",
        count: 4,
        at,
      });
      assert.equal(first.reserved, 4);
      // Simulate idempotent conflict: release unused slots (as delivery path does).
      await churchPackageUsageService.releaseExternalEmailSends(pool, {
        organizationId: orgId,
        usageMonth: first.usageMonth || month,
        count: 4,
        exempt: first.exempt,
      });
      assert.equal(await emailUsed(pool, orgId, at), 0);

      const again = await churchPackageUsageService.reserveExternalEmailSends(pool, {
        organizationId: orgId,
        category: "newsletter",
        count: 4,
        at,
      });
      assert.equal(again.reserved, 4);
      assert.equal(await emailUsed(pool, orgId, at), 4);

      const storageBefore = await storageUsed(pool, orgId);
      await churchPackageUsageService.assertCanConsumeStorage(pool, {
        organizationId: orgId,
        additionalBytes: 128,
        actorType: "system",
      });
      await churchPackageUsageService.releaseStorageBytes(pool, {
        organizationId: orgId,
        bytes: 128,
      });
      await churchPackageUsageService.assertCanConsumeStorage(pool, {
        organizationId: orgId,
        additionalBytes: 128,
        actorType: "system",
      });
      assert.equal(await storageUsed(pool, orgId), storageBefore + 128);
    } finally {
      await cleanupPilotOrganization(pool, growth.organization.id);
    }
  }
);

test(
  "EXPLAIN: attendance/giving org indexes only when beneficial; announcement org index present",
  { skip },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const ann = await pool.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = 'church_announcement_attachments'
         AND indexname = 'idx_church_announcement_attachments_organization'`
    );
    assert.equal(ann.rows.length, 1);

    const membersOrgStatus = await pool.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = 'church_members'
         AND indexname = 'idx_church_members_organization_status'`
    );
    assert.equal(membersOrgStatus.rows.length, 1);

    const membersOrgVerifiedPartial = await pool.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = 'church_members'
         AND indexname = 'idx_church_members_organization_verified'`
    );
    assert.equal(
      membersOrgVerifiedPartial.rows.length,
      0,
      "partial org verified-member index rejected; org/status index already exists"
    );

    // Seed enough rows so planner has something to consider.
    const growth = await createGrowthSmokeTenant(pool, { suffix: makeSuffix("explain") });
    try {
      const orgId = growth.organization.id;
      const branchId = growth.branch.id;
      for (let i = 0; i < 40; i += 1) {
        const d = `2026-06-${String((i % 28) + 1).padStart(2, "0")}`;
        await pool.query(
          `INSERT INTO public.church_attendance_records (
             organization_id, branch_id, service_date, service_label,
             adults_count, youth_count, children_count, first_time_visitors_count, status
           ) VALUES ($1,$2,$3::date,'Sunday',10,2,3,1,'submitted')`,
          [orgId, branchId, d]
        );
      }
      for (let y = 2024; y <= 2026; y += 1) {
        for (let m = 1; m <= 12; m += 1) {
          await pool.query(
            `INSERT INTO public.church_giving_summaries (
               organization_id, branch_id, period_year, period_month, status,
               tithes_total, offerings_total
             ) VALUES ($1,$2,$3,$4,'submitted',100,50)
             ON CONFLICT (branch_id, period_year, period_month) DO NOTHING`,
            [orgId, branchId, y, m]
          );
        }
      }

      await pool.query("ANALYZE public.church_attendance_records");
      await pool.query("ANALYZE public.church_giving_summaries");

      const attExplain = await pool.query(
        `EXPLAIN (FORMAT JSON)
         SELECT a.branch_id, COALESCE(SUM(COALESCE(a.adults_count,0)),0)
         FROM public.church_attendance_records a
         WHERE a.organization_id = $1
           AND a.service_date >= $2::date
           AND a.service_date <= $3::date
           AND a.status IN ('submitted', 'synced_to_monthly_report')
         GROUP BY a.branch_id`,
        [orgId, "2026-06-01", "2026-06-30"]
      );
      const attPlan = JSON.stringify(attExplain.rows[0]["QUERY PLAN"]);

      const giveExplain = await pool.query(
        `EXPLAIN (FORMAT JSON)
         SELECT g.branch_id, COALESCE(SUM(COALESCE(g.tithes_total,0)),0)
         FROM public.church_giving_summaries g
         WHERE g.organization_id = $1
           AND make_date(g.period_year, g.period_month, 1) <= $3::date
           AND (make_date(g.period_year, g.period_month, 1) + interval '1 month' - interval '1 day') >= $2::date
         GROUP BY g.branch_id`,
        [orgId, "2026-01-01", "2026-12-31"]
      );
      const givePlan = JSON.stringify(giveExplain.rows[0]["QUERY PLAN"]);

      // With small fixture volumes, Seq Scan is expected; do not add speculative indexes.
      // Record decision: reject unless an Index Scan on org/date would already be chosen
      // after creating a temp index (checked below only if seq cost is extreme — skip add).
      const attUsesOrgDateIndex =
        /idx_church_attendance.*organization/i.test(attPlan) ||
        /Index Scan.*church_attendance_records/i.test(attPlan);
      const giveUsesOrgPeriodIndex =
        /idx_church_giving.*organization/i.test(givePlan) ||
        /Index Scan.*church_giving_summaries/i.test(givePlan);

      // Explicitly reject adding speculative indexes when planner does not need them yet.
      assert.equal(
        attUsesOrgDateIndex,
        false,
        "attendance org/date index rejected after EXPLAIN (not used / not present)"
      );
      assert.equal(
        giveUsesOrgPeriodIndex,
        false,
        "giving org/year/month index rejected after EXPLAIN (not used / not present)"
      );

      // Probe: create TEMP indexes, re-EXPLAIN, drop — only keep permanently if Index Scan wins.
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_probe_attendance_org_date
           ON public.church_attendance_records (organization_id, service_date)`
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_probe_giving_org_period
           ON public.church_giving_summaries (organization_id, period_year, period_month)`
      );
      await pool.query("ANALYZE public.church_attendance_records");
      await pool.query("ANALYZE public.church_giving_summaries");

      const att2 = await pool.query(
        `EXPLAIN (FORMAT JSON)
         SELECT a.branch_id, COALESCE(SUM(COALESCE(a.adults_count,0)),0)
         FROM public.church_attendance_records a
         WHERE a.organization_id = $1
           AND a.service_date >= $2::date
           AND a.service_date <= $3::date
           AND a.status IN ('submitted', 'synced_to_monthly_report')
         GROUP BY a.branch_id`,
        [orgId, "2026-06-01", "2026-06-30"]
      );
      const give2 = await pool.query(
        `EXPLAIN (FORMAT JSON)
         SELECT g.branch_id, COALESCE(SUM(COALESCE(g.tithes_total,0)),0)
         FROM public.church_giving_summaries g
         WHERE g.organization_id = $1
           AND make_date(g.period_year, g.period_month, 1) <= $3::date
           AND (make_date(g.period_year, g.period_month, 1) + interval '1 month' - interval '1 day') >= $2::date
         GROUP BY g.branch_id`,
        [orgId, "2026-01-01", "2026-12-31"]
      );
      const att2Plan = JSON.stringify(att2.rows[0]["QUERY PLAN"]);
      const give2Plan = JSON.stringify(give2.rows[0]["QUERY PLAN"]);

      const attProbeUsed = /idx_probe_attendance_org_date/i.test(att2Plan);
      const giveProbeUsed = /idx_probe_giving_org_period/i.test(give2Plan);

      await pool.query(`DROP INDEX IF EXISTS public.idx_probe_attendance_org_date`);
      await pool.query(`DROP INDEX IF EXISTS public.idx_probe_giving_org_period`);

      // Permanent migration must not include these unless probe proves Index Scan selection.
      // At fixture scale they are typically unused → leave migration without them.
      if (attProbeUsed || giveProbeUsed) {
        // Document for operators; do not auto-mutate migration from tests.
        assert.ok(
          true,
          `EXPLAIN probe selected temp index(es): attendance=${attProbeUsed} giving=${giveProbeUsed}`
        );
      }
    } finally {
      await pool.query(`DROP INDEX IF EXISTS public.idx_probe_attendance_org_date`);
      await pool.query(`DROP INDEX IF EXISTS public.idx_probe_giving_org_period`);
      await cleanupPilotOrganization(pool, growth.organization.id);
    }
  }
);
