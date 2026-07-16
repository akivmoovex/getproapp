"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  computeReminderDueDates,
  addDays,
  DEFAULT_DURATION_DAYS,
  CONFIG_RETENTION_DAYS,
  REMINDER_DAYS_BEFORE,
  grantGrowthTrial,
  processTrialReminders,
  processTrialExpiries,
  processTrialConfigRetention,
  getOrganisationTrialStatus,
  findActiveGrowthTrial,
} = require("../src/services/church/churchGrowthTrialService");
const {
  getOrganisationPlan,
  hasEntitlement,
} = require("../src/services/church/churchEntitlementService");
const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

test("trial reminder dates are 7, 3 and 1 day before expiry", () => {
  assert.deepEqual([...REMINDER_DAYS_BEFORE], [7, 3, 1]);
  const {
    DEFAULT_GROWTH_TRIAL_DURATION_DAYS,
  } = require("../src/church/blessBoardPackageCatalogue");
  assert.equal(DEFAULT_DURATION_DAYS, DEFAULT_GROWTH_TRIAL_DURATION_DAYS);
  assert.equal(DEFAULT_DURATION_DAYS, 30);
  assert.equal(CONFIG_RETENTION_DAYS, 90);
  const ends = new Date("2026-08-15T12:00:00.000Z");
  const dues = computeReminderDueDates(ends);
  assert.equal(dues.length, 3);
  assert.equal(dues[0].daysBeforeExpiry, 7);
  assert.equal(dues[0].dueAt, addDays(ends, -7).toISOString());
  assert.equal(dues[1].dueAt, addDays(ends, -3).toISOString());
  assert.equal(dues[2].dueAt, addDays(ends, -1).toISOString());
});

test(
  "Growth trial grant, duplicate rejection, reminders, expiry idempotency, restore, retention, isolation",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("gtrial");

    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `gta_${suffix}`.slice(0, 40),
      name: `Growth Trial A ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgA.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: null },
      null
    );

    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `gtb_${suffix}`.slice(0, 40),
      name: `Growth Trial B ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgB.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: null },
      null
    );

    const startsAt = new Date("2026-07-01T00:00:00.000Z");
    const granted = await grantGrowthTrial(pool, orgA.id, {
      reason: "Pilot evaluation",
      startsAt,
      grantedByPlatformAdminId: 99,
    });
    assert.equal(granted.status.status, "active");
    assert.equal(granted.trial.duration_days, 30);

    const planActive = await getOrganisationPlan(pool, orgA.id);
    assert.equal(planActive.packageCode, "growth");
    assert.equal(planActive.entitlementSource, "growth_trial");
    assert.ok(planActive.trial && planActive.trial.isTrial);

    await assert.rejects(
      () =>
        grantGrowthTrial(pool, orgA.id, {
          reason: "Second attempt",
          startsAt,
          grantedByPlatformAdminId: 99,
        }),
      (err) => err && err.code === "DUPLICATE_TRIAL"
    );

    const reminders = await pool.query(
      `SELECT days_before_expiry, due_at, job_key, status
       FROM public.church_organization_package_trial_reminders
       WHERE trial_id = $1
       ORDER BY days_before_expiry DESC`,
      [granted.trial.id]
    );
    assert.equal(reminders.rows.length, 3);
    assert.deepEqual(
      reminders.rows.map((r) => r.days_before_expiry),
      [7, 3, 1]
    );

    // Reminder at 7 days before end
    const endsAt = new Date(granted.trial.ends_at);
    const day7 = addDays(endsAt, -7);
    const rem1 = await processTrialReminders(pool, { at: day7 });
    assert.ok(rem1.processed.some((p) => p.outcome === "sent" && p.daysBeforeExpiry === 7));
    const rem1Again = await processTrialReminders(pool, { at: day7 });
    assert.ok(
      rem1Again.processed.every((p) => p.outcome === "already_processed") || rem1Again.count === 0
    );

    // Org B untouched
    const statusB = await getOrganisationTrialStatus(pool, orgB.id, { at: day7 });
    assert.equal(statusB.hasTrial, false);
    assert.equal(statusB.canGrant, true);
    const planB = await getOrganisationPlan(pool, orgB.id);
    assert.equal(planB.packageCode, "foundation");
    assert.notEqual(planB.organizationId, planActive.organizationId);

    // Expiry
    const afterEnd = addDays(endsAt, 1);
    const exp1 = await processTrialExpiries(pool, { at: afterEnd });
    assert.ok(exp1.processed.some((p) => p.outcome === "expired" && p.organizationId === orgA.id));
    assert.equal(
      exp1.processed.find((p) => p.organizationId === orgA.id).restoredPackageCode,
      "foundation"
    );

    const exp2 = await processTrialExpiries(pool, { at: afterEnd });
    assert.ok(
      exp2.processed.every((p) => p.outcome === "already_expired") ||
        !exp2.processed.some((p) => p.organizationId === orgA.id && p.outcome === "expired")
    );

    const planRestored = await getOrganisationPlan(pool, orgA.id);
    assert.equal(planRestored.packageCode, "foundation");
    assert.equal(await findActiveGrowthTrial(pool, orgA.id, { at: afterEnd }), null);

    const afterExpiryStatus = await getOrganisationTrialStatus(pool, orgA.id, { at: afterEnd });
    assert.equal(afterExpiryStatus.status, "expired_retaining_config");
    assert.equal(afterExpiryStatus.configRetained, true);
    assert.ok(afterExpiryStatus.trial.configRetainUntil);

    const retainUntil = new Date(afterExpiryStatus.trial.configRetainUntil);
    assert.equal(retainUntil.toISOString(), addDays(endsAt, 90).toISOString());

    const retention = await processTrialConfigRetention(pool, { at: addDays(retainUntil, 1) });
    assert.ok(retention.processed >= 1);
    const afterPurge = await getOrganisationTrialStatus(pool, orgA.id, {
      at: addDays(retainUntil, 1),
    });
    assert.equal(afterPurge.status, "expired");
    assert.equal(afterPurge.configRetained, false);

    const audits = await pool.query(
      `SELECT action FROM public.church_audit_logs
       WHERE organization_id = $1
         AND action LIKE 'platform_growth_trial%'
       ORDER BY id ASC`,
      [orgA.id]
    );
    const actions = audits.rows.map((r) => r.action);
    assert.ok(actions.includes("platform_growth_trial_granted"));
    assert.ok(actions.includes("platform_growth_trial_reminder"));
    assert.ok(actions.includes("platform_growth_trial_expired"));
    assert.ok(actions.includes("platform_growth_trial_config_retention_ended"));

    // Cleanup
    await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = ANY($1::int[])`, [
      [orgA.id, orgB.id],
    ]);
    await pool.query(
      `DELETE FROM public.church_organization_package_trial_reminders WHERE organization_id = ANY($1::int[])`,
      [[orgA.id, orgB.id]]
    );
    await pool.query(
      `DELETE FROM public.church_organization_package_trials WHERE organization_id = ANY($1::int[])`,
      [[orgA.id, orgB.id]]
    );
    await pool.query(
      `DELETE FROM public.church_organization_package_history WHERE organization_id = ANY($1::int[])`,
      [[orgA.id, orgB.id]]
    );
    await pool.query(`DELETE FROM public.church_organizations WHERE id = ANY($1::int[])`, [
      [orgA.id, orgB.id],
    ]);
  }
);

test(
  "F1: overdue Growth trial does not keep Growth entitlements before expiry job (tenant isolation)",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("f1trial");

    const orgTrial = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `f1t_${suffix}`.slice(0, 40),
      name: `F1 Trial Org ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgTrial.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: null },
      null
    );

    // Paid Growth neighbour — must remain Growth when trial org loses entitlements.
    const orgPaid = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `f1p_${suffix}`.slice(0, 40),
      name: `F1 Paid Growth ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgPaid.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );

    const startsAt = new Date("2026-06-01T00:00:00.000Z");
    await grantGrowthTrial(pool, orgTrial.id, {
      reason: "F1 regression",
      startsAt,
      grantedByPlatformAdminId: 1,
    });

    const endsAt = addDays(startsAt, DEFAULT_DURATION_DAYS);
    const afterEnd = addDays(endsAt, 1);

    assert.equal(await findActiveGrowthTrial(pool, orgTrial.id, { at: afterEnd }), null);

    // Stored plan_code remains growth until processTrialExpiries — entitlements must not.
    const stored = await organizationsRepo.findOrganizationById(pool, orgTrial.id);
    assert.equal(String(stored.plan_code).toLowerCase(), "growth");

    const planOverdue = await getOrganisationPlan(pool, orgTrial.id, { at: afterEnd });
    assert.equal(planOverdue.packageCode, "foundation");
    assert.equal(planOverdue.entitlementSource, "growth_trial_ended");
    assert.equal(planOverdue.trial && planOverdue.trial.isTrial, false);
    assert.equal(hasEntitlement(planOverdue, "reports.scheduled"), false);
    assert.equal(hasEntitlement(planOverdue, "broadcasts.scheduled"), false);

    // Negative tenant isolation: other org with paid Growth is unaffected.
    const planPaid = await getOrganisationPlan(pool, orgPaid.id, { at: afterEnd });
    assert.equal(planPaid.packageCode, "growth");
    assert.equal(hasEntitlement(planPaid, "reports.scheduled"), true);
    assert.notEqual(planPaid.organizationId, planOverdue.organizationId);

    // Active window still Growth for the trial org.
    const midTrial = addDays(startsAt, 10);
    const planActive = await getOrganisationPlan(pool, orgTrial.id, { at: midTrial });
    assert.equal(planActive.packageCode, "growth");
    assert.equal(planActive.entitlementSource, "growth_trial");
    assert.equal(hasEntitlement(planActive, "reports.scheduled"), true);

    await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = ANY($1::int[])`, [
      [orgTrial.id, orgPaid.id],
    ]);
    await pool.query(
      `DELETE FROM public.church_organization_package_trial_reminders WHERE organization_id = ANY($1::int[])`,
      [[orgTrial.id, orgPaid.id]]
    );
    await pool.query(
      `DELETE FROM public.church_organization_package_trials WHERE organization_id = ANY($1::int[])`,
      [[orgTrial.id, orgPaid.id]]
    );
    await pool.query(
      `DELETE FROM public.church_organization_package_history WHERE organization_id = ANY($1::int[])`,
      [[orgTrial.id, orgPaid.id]]
    );
    await pool.query(`DELETE FROM public.church_organizations WHERE id = ANY($1::int[])`, [
      [orgTrial.id, orgPaid.id],
    ]);
  }
);
