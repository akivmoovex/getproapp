"use strict";

/**
 * P5/P6 regression: scheduled broadcast/report delivery must not fan out
 * per-recipient plan/auth/quota queries.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const hqBroadcastsRepo = require("../src/db/pg/church/hqBroadcastsRepo");
const organizationUsageRepo = require("../src/db/pg/church/organizationUsageRepo");
const scheduledBroadcastService = require("../src/services/church/scheduledBroadcastService");
const scheduledReportService = require("../src/services/church/scheduledReportService");
const churchEntitlementService = require("../src/services/church/churchEntitlementService");
const { createGrowthSmokeTenant, cleanupPilotOrganization } = require("./helpers/churchPilotSmokeFixtures");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function withQueryCapture(fn) {
  const queries = [];
  const orig = Pool.prototype.query;
  Pool.prototype.query = function patched(text, params, callback) {
    const sql = typeof text === "object" && text && text.text != null ? String(text.text) : String(text);
    queries.push(sql);
    return orig.call(this, text, params, callback);
  };
  return Promise.resolve()
    .then(() => fn())
    .finally(() => {
      Pool.prototype.query = orig;
    })
    .then((result) => ({ result, queries }));
}

function countMatches(queries, re) {
  return queries.filter((q) => re.test(q)).length;
}

async function seedMembers(pool, org, branch, count, prefix) {
  const passwordHash = await bcrypt.hash("DelivPerf_pw_2026!", 12);
  const members = [];
  for (let i = 0; i < count; i += 1) {
    const email = `${prefix}_m${i}_${org.id}@example.com`;
    const row = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      full_name: `Member ${i}`,
      email,
      phone: `0977${String(1000000 + i).slice(-7)}`,
      password_hash: passwordHash,
    });
    await pool.query(`UPDATE public.church_members SET status = 'verified', communication_consent = true WHERE id = $1`, [
      row.id,
    ]);
    members.push({ ...row, email });
  }
  return members;
}

async function emailUsage(pool, orgId, at) {
  const org = await organizationsRepo.findOrganizationById(pool, orgId);
  const month = organizationUsageRepo.usageMonthKeyForTimezone(org.timezone || "UTC", at);
  const row = await organizationUsageRepo.findUsageMonth(pool, orgId, month);
  return row ? Number(row.external_emails_count) || 0 : 0;
}

test(
  "P5 broadcast: 50 recipients batch auth/quota; isolation; idempotent; plan bounded",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("bcast50");
    const growth = await createGrowthSmokeTenant(pool, { suffix });
    const other = await createGrowthSmokeTenant(pool, { suffix: makeSuffix("bcast50o") });

    try {
      const members = await seedMembers(pool, growth.organization, growth.branch, 50, `b50_${suffix}`);
      const foreign = await seedMembers(pool, other.organization, other.branch, 1, `b50f_${suffix}`);

      const at = new Date("2026-09-10T12:00:00.000Z");
      const beforeUsage = await emailUsage(pool, growth.organization.id, at);

      const broadcast = await hqBroadcastsRepo.createBroadcastForOrganization(pool, growth.organization.id, {
        title: "Perf broadcast 50",
        body: "Hello",
        category: "general",
        audience: "selected_recipients",
        delivery_channels: ["in_app", "email"],
        selected_recipients: [
          ...members.map((m) => ({ recipient_type: "member", recipient_id: m.id })),
          { recipient_type: "member", recipient_id: foreign[0].id },
        ],
        status: "scheduled",
        publish_at: at.toISOString(),
        created_by_hq_admin_id: growth.hqAdmin.id,
      });

      let planCalls = 0;
      const entitlement = require("../src/services/church/churchEntitlementService");
      const origPlan = entitlement.getOrganisationPlan;
      entitlement.getOrganisationPlan = async (...args) => {
        planCalls += 1;
        return origPlan(...args);
      };
      // Services may hold a destructured binding — also count trial SQL as the plan-resolve signal.
      let captured;
      try {
        captured = await withQueryCapture(() =>
          scheduledBroadcastService.processBroadcastDelivery(pool, broadcast.id, growth.organization.id, {
            at,
          })
        );
      } finally {
        entitlement.getOrganisationPlan = origPlan;
      }

      const { result, queries } = captured;
      assert.equal(result.outcome, "published");
      assert.ok(result.delivered >= 50, `delivered ${result.delivered}`);

      const delR = await pool.query(
        `SELECT channel, status, recipient_id FROM public.church_hq_broadcast_deliveries
         WHERE broadcast_id = $1 AND organization_id = $2`,
        [broadcast.id, growth.organization.id]
      );
      const deliveries = delR.rows;
      const emailDelivered = deliveries.filter((d) => d.channel === "email" && d.status === "delivered");
      const emailSkippedForeign = deliveries.filter(
        (d) =>
          d.channel === "email" &&
          d.status === "skipped_unauthorised" &&
          Number(d.recipient_id) === Number(foreign[0].id)
      );
      assert.equal(emailDelivered.length, 50);
      assert.equal(emailSkippedForeign.length, 1);
      assert.ok(
        !emailDelivered.some((d) => Number(d.recipient_id) === Number(foreign[0].id)),
        "foreign member must not receive email"
      );

      const afterUsage = await emailUsage(pool, growth.organization.id, at);
      assert.equal(afterUsage - beforeUsage, 50);

      // Plan resolve is tightly bounded (trial lookup is the reliable signal when bindings are destructured).
      const trialLookups = countMatches(queries, /church_organization_package_trials/i);
      assert.ok(trialLookups <= 2, `trial lookups ${trialLookups}`);
      assert.ok(planCalls <= 3 || trialLookups <= 2, `planCalls=${planCalls} trial=${trialLookups}`);
      // Before: ~50 auth SELECTs by primary key; after: batched ANY/IN (≤4 type queries).
      const memberByIdLookups = countMatches(
        queries,
        /FROM public\.church_members WHERE id = \$1 AND organization_id/i
      );
      assert.equal(memberByIdLookups, 0, "must not resolve members one-by-one");
      console.log(
        `[delivery-perf] broadcast50 queries=${queries.length} planCalls=${planCalls} trial=${trialLookups}`
      );
      assert.ok(
        queries.length < 50 * 6,
        `query count ${queries.length} should be far below pre-optimization ~R×6 path`
      );

      // Idempotent re-run: no duplicate deliveries, no extra quota.
      const again = await scheduledBroadcastService.processBroadcastDelivery(
        pool,
        broadcast.id,
        growth.organization.id,
        { at }
      );
      assert.ok(again.outcome === "duplicate_job" || again.outcome === "published");
      const usageAfterRetry = await emailUsage(pool, growth.organization.id, at);
      assert.equal(usageAfterRetry, afterUsage);

      const delR2 = await pool.query(
        `SELECT status FROM public.church_hq_broadcast_deliveries
         WHERE broadcast_id = $1 AND organization_id = $2 AND channel = 'email' AND status = 'delivered'`,
        [broadcast.id, growth.organization.id]
      );
      assert.equal(delR2.rows.length, 50);
    } finally {
      await cleanupPilotOrganization(pool, growth.organization.id);
      await cleanupPilotOrganization(pool, other.organization.id);
    }
  }
);

test(
  "P5 concurrent quota reservation cannot exceed monthly limit",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("qconc");
    const growth = await createGrowthSmokeTenant(pool, { suffix });
    try {
      const at = new Date("2026-10-05T12:00:00.000Z");
      const org = await organizationsRepo.findOrganizationById(pool, growth.organization.id);
      const month = organizationUsageRepo.usageMonthKeyForTimezone(org.timezone || "UTC", at);
      await organizationUsageRepo.getOrCreateUsageMonth(pool, org.id, month);
      // Leave room for exactly 5 emails.
      const plan = await churchEntitlementService.getOrganisationPlan(pool, org.id);
      const { getNumericLimit } = churchEntitlementService;
      const branches = await branchesRepo.countActiveBranchesForOrganization(pool, org.id);
      const limit = getNumericLimit(plan, "external_emails.monthly", { activeBranchCount: branches });
      assert.equal(typeof limit, "number");
      await pool.query(
        `UPDATE public.church_organization_usage_months
         SET external_emails_count = $3
         WHERE organization_id = $1 AND usage_month = $2::date`,
        [org.id, month, limit - 5]
      );

      const [a, b] = await Promise.all([
        organizationUsageRepo.tryReserveExternalEmailsUpTo(pool, org.id, month, 5, limit),
        organizationUsageRepo.tryReserveExternalEmailsUpTo(pool, org.id, month, 5, limit),
      ]);
      assert.equal(a.reserved + b.reserved, 5);
      assert.ok(a.reserved === 5 || b.reserved === 5);
      assert.ok(a.reserved === 0 || b.reserved === 0 || a.reserved + b.reserved === 5);

      const used = await emailUsage(pool, org.id, at);
      assert.equal(used, limit);
    } finally {
      await cleanupPilotOrganization(pool, growth.organization.id);
    }
  }
);

test(
  "P6 report: 20 recipients batch auth; wrong org excluded; plan once; idempotent",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("rep20");
    const growth = await createGrowthSmokeTenant(pool, { suffix });
    const other = await createGrowthSmokeTenant(pool, { suffix: makeSuffix("rep20o") });
    const passwordHash = await bcrypt.hash("DelivPerf_pw_2026!", 12);

    try {
      const hqRecipients = [];
      for (let i = 0; i < 19; i += 1) {
        const hq = await hqAdminsRepo.createHqAdmin(pool, {
          organization_id: growth.organization.id,
          full_name: `HQ Rec ${i}`,
          email: `rep20_hq_${i}_${suffix}@example.com`,
          phone: `0978${String(1000000 + i).slice(-7)}`,
          password_hash: passwordHash,
          role: "hq_admin",
          status: "active",
        });
        hqRecipients.push(hq);
      }

      const at = new Date("2026-09-12T08:00:00.000Z");
      const beforeUsage = await emailUsage(pool, growth.organization.id, at);

      const schedule = await scheduledReportService.createSchedule(pool, {
        organizationId: growth.organization.id,
        branchId: growth.branch.id,
        actorType: "branch_admin",
        actorId: growth.branchAdmin.id,
        at,
        body: {
          report_type: "branch_attendance_summary",
          export_format: "csv",
          frequency: "daily",
          timezone: "UTC",
          delivery_time_local: "09:00",
          period_month: "2026-08",
          recipients: [
            { recipient_type: "branch_admin", recipient_id: growth.branchAdmin.id },
            ...hqRecipients.map((h) => ({ recipient_type: "hq_admin", recipient_id: h.id })),
          ],
        },
      });

      // Inject wrong-org recipient row (must be excluded at run time).
      await pool.query(
        `INSERT INTO public.church_scheduled_report_recipients (
           schedule_id, organization_id, recipient_type, recipient_id
         ) VALUES ($1,$2,'hq_admin',$3)
         ON CONFLICT DO NOTHING`,
        [schedule.id, growth.organization.id, other.hqAdmin.id]
      );

      let planCalls = 0;
      const origPlan = churchEntitlementService.getOrganisationPlan;
      churchEntitlementService.getOrganisationPlan = async (...args) => {
        planCalls += 1;
        return origPlan(...args);
      };

      let captured;
      try {
        captured = await withQueryCapture(() =>
          scheduledReportService.executeScheduleRun(pool, schedule, {
            at,
            scheduledFor: new Date(schedule.next_run_at || at),
          })
        );
      } finally {
        churchEntitlementService.getOrganisationPlan = origPlan;
      }

      const { result, queries } = captured;
      assert.ok(["delivered", "failed"].includes(result.outcome), result.outcome);
      assert.equal(result.delivered, 20);
      assert.ok(result.skipped >= 1);

      const deliveryPage = await scheduledReportService.listDeliveriesForRun(
        pool,
        result.runId,
        growth.organization.id,
        { page: 1, limit: 100 }
      );
      const deliveries = deliveryPage.rows;
      assert.equal(deliveries.filter((d) => d.status === "delivered").length, 20);
      assert.ok(
        deliveries.some(
          (d) =>
            d.status === "skipped_unauthorised" && Number(d.recipient_id) === Number(other.hqAdmin.id)
        )
      );

      const afterUsage = await emailUsage(pool, growth.organization.id, at);
      assert.equal(afterUsage - beforeUsage, 20);

      assert.ok(planCalls <= 3, `getOrganisationPlan calls ${planCalls}`);
      const perIdHq = countMatches(
        queries,
        /FROM public\.church_hq_admins WHERE id = \$1/i
      );
      const perIdBa = countMatches(
        queries,
        /FROM public\.church_branch_admins WHERE id = \$1/i
      );
      assert.equal(perIdHq, 0);
      assert.equal(perIdBa, 0);
      console.log(`[delivery-perf] report20 queries=${queries.length} planCalls=${planCalls}`);
      assert.ok(queries.length < 20 * 6, `query count ${queries.length}`);

      // Duplicate job key must not re-deliver.
      const dup = await scheduledReportService.executeScheduleRun(pool, schedule, {
        at,
        scheduledFor: new Date(schedule.next_run_at || at),
      });
      assert.equal(dup.outcome, "duplicate_job");
      const usageDup = await emailUsage(pool, growth.organization.id, at);
      assert.equal(usageDup, afterUsage);
    } finally {
      await cleanupPilotOrganization(pool, growth.organization.id);
      await cleanupPilotOrganization(pool, other.organization.id);
    }
  }
);

test(
  "P5/P6 downgraded and suspended orgs remain blocked; retry stays entitlement-protected",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("gate");
    const growth = await createGrowthSmokeTenant(pool, { suffix });

    try {
      const member = (await seedMembers(pool, growth.organization, growth.branch, 1, `gate_${suffix}`))[0];
      const at = new Date("2026-09-15T12:00:00.000Z");
      const broadcast = await hqBroadcastsRepo.createBroadcastForOrganization(pool, growth.organization.id, {
        title: "Gate broadcast",
        body: "x",
        category: "general",
        audience: "selected_recipients",
        delivery_channels: ["email", "in_app"],
        selected_recipients: [{ recipient_type: "member", recipient_id: member.id }],
        status: "scheduled",
        publish_at: at.toISOString(),
        created_by_hq_admin_id: growth.hqAdmin.id,
      });

      await organizationsRepo.updateOrganizationPlan(
        pool,
        growth.organization.id,
        { plan_code: "foundation", plan_status: "active", plan_notes: "downgrade" },
        null
      );
      const downgraded = await scheduledBroadcastService.processBroadcastDelivery(
        pool,
        broadcast.id,
        growth.organization.id,
        { at }
      );
      assert.equal(downgraded.outcome, "paused_no_entitlement");

      await organizationsRepo.updateOrganizationPlan(
        pool,
        growth.organization.id,
        { plan_code: "growth", plan_status: "active", plan_notes: null },
        null
      );
      await pool.query(`UPDATE public.church_organizations SET status = 'suspended' WHERE id = $1`, [
        growth.organization.id,
      ]);
      // Reset broadcast status for suspended check
      await pool.query(
        `UPDATE public.church_hq_broadcasts SET status = 'scheduled' WHERE id = $1`,
        [broadcast.id]
      );
      const suspended = await scheduledBroadcastService.processBroadcastDelivery(
        pool,
        broadcast.id,
        growth.organization.id,
        { at }
      );
      assert.equal(suspended.outcome, "paused_organization_inactive");

      await pool.query(`UPDATE public.church_organizations SET status = 'active' WHERE id = $1`, [
        growth.organization.id,
      ]);
      await pool.query(
        `UPDATE public.church_hq_broadcasts SET status = 'failed' WHERE id = $1`,
        [broadcast.id]
      );
      await organizationsRepo.updateOrganizationPlan(
        pool,
        growth.organization.id,
        { plan_code: "foundation", plan_status: "active", plan_notes: "retry block" },
        null
      );
      await assert.rejects(
        () => scheduledBroadcastService.retryFailedDeliveries(pool, broadcast.id, growth.organization.id),
        (err) => err && err.code === "ENTITLEMENT_REQUIRED"
      );
    } finally {
      await cleanupPilotOrganization(pool, growth.organization.id);
    }
  }
);

test(
  "failed recipients do not corrupt successful delivery or quota counts",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("partial");
    const growth = await createGrowthSmokeTenant(pool, { suffix });

    try {
      const members = await seedMembers(pool, growth.organization, growth.branch, 3, `part_${suffix}`);
      // One recipient withdraws consent (no email path) — must not consume quota.
      await pool.query(`UPDATE public.church_members SET communication_consent = false WHERE id = $1`, [
        members[1].id,
      ]);

      const at = new Date("2026-09-20T12:00:00.000Z");
      const before = await emailUsage(pool, growth.organization.id, at);
      const broadcast = await hqBroadcastsRepo.createBroadcastForOrganization(pool, growth.organization.id, {
        title: "Partial",
        body: "x",
        category: "general",
        audience: "selected_recipients",
        delivery_channels: ["email"],
        selected_recipients: members.map((m) => ({ recipient_type: "member", recipient_id: m.id })),
        status: "scheduled",
        publish_at: at.toISOString(),
        created_by_hq_admin_id: growth.hqAdmin.id,
      });

      const result = await scheduledBroadcastService.processBroadcastDelivery(
        pool,
        broadcast.id,
        growth.organization.id,
        { at }
      );
      assert.ok(result.delivered >= 2);
      assert.ok(result.skipped >= 1);
      const after = await emailUsage(pool, growth.organization.id, at);
      assert.equal(after - before, result.delivered);

      const dels = (await scheduledBroadcastService.listDeliveries(pool, broadcast.id, growth.organization.id))
        .rows;
      assert.equal(dels.filter((d) => d.status === "delivered").length, after - before);
      assert.ok(dels.some((d) => d.status === "skipped_consent" || d.status === "skipped_unauthorised"));
    } finally {
      await cleanupPilotOrganization(pool, growth.organization.id);
    }
  }
);
