"use strict";

/**
 * V5 Growth trial expiry → grace → Foundation downgrade.
 *
 * Grace representation (no new column):
 *   trialing + ends_at <= now  →  status=past_due, ends_at = trial_ends_at + graceDays
 *   During grace, Growth entitlements apply (past_due ∈ active statuses and ends_at open).
 *   past_due Growth + ends_at <= now  →  expire Growth row, insert active Foundation (free).
 *
 * Billing gap (resolved for Prompt 25):
 *   Paid Growth is detected via billing_payment_status IN (externally_paid, succeeded)
 *   or compat open-ended active Growth. Provider APIs are not integrated yet.
 *
 * Notifications: none outbound — V5 has no subscription mail abstraction.
 * Platform-admin dashboard derives operational alerts from subscription/audit state.
 * Does not touch V4 church growth-trial jobs or tables.
 */

const entitlementRepo = require("../repositories/entitlementRepository");
const { recordAuditEventSafe } = require("./auditEventService");
const { addCalendarDaysUtc } = require("../time/addCalendarDaysUtc");

const PRODUCT_KEY = "blessboard";
const PLAN_KEY_GROWTH = "growth";
const PLAN_KEY_FREE = "free";

const DEFAULT_BATCH_LIMIT = 50;
const MAX_BATCH_LIMIT = 500;
const DEFAULT_GRACE_DAYS = 7;
const MIN_GRACE_DAYS = 1;
const MAX_GRACE_DAYS = 30;

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  LOOKUP_ERROR: "lookup_error",
});

const ACTION = Object.freeze({
  ENTERED_GRACE: "subscription.trial_entered_grace",
  DOWNGRADED: "subscription.trial_downgraded_to_foundation",
  SKIPPED_PAID: "subscription.trial_expiry_skipped",
  FAILED: "subscription.trial_expiry_failed",
});

/**
 * @param {unknown} raw
 * @param {number} fallback
 * @param {number} min
 * @param {number} max
 */
function clampInt(raw, fallback, min, max) {
  const n = Number.parseInt(String(raw == null ? "" : raw), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * @param {unknown} raw
 * @returns {Date}
 */
function resolveClock(raw) {
  if (raw == null || raw === "") return new Date();
  const d = raw instanceof Date ? new Date(raw.getTime()) : new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new TypeError("invalid_clock");
  }
  return d;
}

/**
 * Paid / retained Growth: active Growth with open window OR explicit paid billing marker.
 * Billing payment statuses succeeded|externally_paid are the canonical paid signal.
 * @param {{ query: Function }} client
 * @param {string} organizationId
 * @param {Date} at
 */
async function findActivePaidGrowthMarker(client, organizationId, at) {
  const { rows } = await client.query(
    `SELECT os.id, os.billing_payment_status
       FROM platform.organization_subscriptions os
       INNER JOIN platform.plans pl ON pl.id = os.plan_id
      WHERE os.organization_id = $1
        AND os.product_key = $2
        AND pl.plan_key = $3
        AND os.status = 'active'
        AND os.starts_at <= $4::timestamptz
        AND (
          os.billing_payment_status IN ('externally_paid', 'succeeded')
          OR os.ends_at IS NULL
          OR os.ends_at > $4::timestamptz
        )
      LIMIT 1`,
    [organizationId, PRODUCT_KEY, PLAN_KEY_GROWTH, at.toISOString()]
  );
  return rows[0] || null;
}

/**
 * Candidate Growth rows needing grace or downgrade (bounded).
 * @param {{ query: Function }} client
 * @param {{ at: Date, limit: number }} opts
 */
async function listExpiryCandidates(client, opts) {
  const atIso = opts.at.toISOString();
  const limit = opts.limit;
  const { rows } = await client.query(
    `SELECT os.id, os.organization_id, os.product_key, os.plan_id, os.status,
            os.starts_at, os.ends_at, pl.plan_key
       FROM platform.organization_subscriptions os
       INNER JOIN platform.plans pl ON pl.id = os.plan_id
      WHERE os.product_key = $1
        AND pl.plan_key = $2
        AND os.ends_at IS NOT NULL
        AND os.ends_at <= $3::timestamptz
        AND (
          os.status = 'trialing'
          OR os.status = 'past_due'
        )
      ORDER BY os.ends_at ASC, os.id ASC
      LIMIT $4`,
    [PRODUCT_KEY, PLAN_KEY_GROWTH, atIso, limit]
  );
  return rows;
}

/**
 * @param {{ query: Function }} client
 * @param {string} subscriptionId
 */
async function lockSubscriptionById(client, subscriptionId) {
  const { rows } = await client.query(
    `SELECT os.id, os.organization_id, os.product_key, os.plan_id, os.status,
            os.starts_at, os.ends_at, pl.plan_key
       FROM platform.organization_subscriptions os
       INNER JOIN platform.plans pl ON pl.id = os.plan_id
      WHERE os.id = $1
      FOR UPDATE OF os SKIP LOCKED`,
    [subscriptionId]
  );
  return rows[0] || null;
}

/**
 * @param {object} row
 * @param {Date} at
 * @param {number} graceDays
 */
function classifyAction(row, at, graceDays) {
  if (!row || String(row.plan_key) !== PLAN_KEY_GROWTH) {
    return { action: "skip", reason: "not_growth" };
  }
  const endsAt = row.ends_at ? new Date(row.ends_at) : null;
  if (!endsAt || Number.isNaN(endsAt.getTime()) || endsAt.getTime() > at.getTime()) {
    return { action: "skip", reason: "not_expired" };
  }
  const status = String(row.status || "");
  if (status === "trialing") {
    const graceEndsAt = addCalendarDaysUtc(endsAt, graceDays);
    if (graceEndsAt.getTime() > at.getTime()) {
      return { action: "enter_grace", graceEndsAt };
    }
    return { action: "downgrade", reason: "grace_already_elapsed" };
  }
  if (status === "past_due") {
    return { action: "downgrade", reason: "grace_expired" };
  }
  if (status === "active") {
    return { action: "skip", reason: "paid_or_active_growth" };
  }
  return { action: "skip", reason: "status_not_eligible" };
}

async function writeAudit(client, input) {
  await recordAuditEventSafe(client, {
    deploymentCode: input.deploymentCode,
    organizationId: input.organizationId,
    actorUserId: null,
    outcome: input.outcome || "success",
    actionKey: input.actionKey,
    entityType: "organization_subscription",
    entityId: input.entityId || null,
    metadata: {
      product_key: PRODUCT_KEY,
      plan_key: input.planKey || undefined,
      from_status: input.fromStatus || undefined,
      to_status: input.toStatus || undefined,
      reason_code: input.reasonCode || undefined,
      count: input.count != null ? input.count : undefined,
      actor_type: "system",
      source: "growth_trial_expiry_job",
    },
  });
}

/**
 * Expire Growth row then insert active Foundation (history-preserving).
 * Bypasses assignOrganizationPlan capacity gate so multi-branch orgs keep data;
 * Free entitlements still enforce max_branches for *new* creates.
 * @param {{ query: Function }} client
 * @param {object} locked
 * @param {object} freePlan
 * @param {Date} at
 * @param {string} deploymentCode
 */
async function downgradeToFoundation(client, locked, freePlan, at, deploymentCode) {
  const fromStatus = String(locked.status);
  await client.query(
    `UPDATE platform.organization_subscriptions
        SET status = 'expired',
            updated_at = now()
      WHERE id = $1
        AND status IN ('trialing', 'past_due')`,
    [locked.id]
  );

  const inserted = await entitlementRepo.insertSubscription(client, {
    organizationId: locked.organization_id,
    productKey: PRODUCT_KEY,
    planId: freePlan.id,
    status: "active",
    startsAt: at.toISOString(),
    endsAt: null,
    notes: null,
  });

  await writeAudit(client, {
    deploymentCode,
    organizationId: locked.organization_id,
    actionKey: ACTION.DOWNGRADED,
    entityId: inserted.id,
    planKey: PLAN_KEY_FREE,
    fromStatus,
    toStatus: "active",
    reasonCode: "growth_trial_grace_expired",
  });

  return { freeSubscriptionId: inserted.id, expiredSubscriptionId: locked.id };
}

/**
 * Process a single locked candidate inside an open transaction.
 * @param {{ query: Function }} client
 * @param {object} locked
 * @param {{
 *   at: Date,
 *   graceDays: number,
 *   dryRun: boolean,
 *   deploymentCode: string,
 *   freePlan: object,
 * }} opts
 */
async function processLockedRow(client, locked, opts) {
  const classification = classifyAction(locked, opts.at, opts.graceDays);

  if (classification.action === "skip") {
    return { outcome: "skipped", reason: classification.reason };
  }

  const paid = await findActivePaidGrowthMarker(client, locked.organization_id, opts.at);
  if (paid) {
    if (!opts.dryRun) {
      await writeAudit(client, {
        deploymentCode: opts.deploymentCode,
        organizationId: locked.organization_id,
        actionKey: ACTION.SKIPPED_PAID,
        entityId: locked.id,
        planKey: PLAN_KEY_GROWTH,
        fromStatus: String(locked.status),
        toStatus: String(locked.status),
        reasonCode: "active_growth_present",
        outcome: "denied",
      });
    }
    return { outcome: "skipped", reason: "paid_or_active_growth" };
  }

  if (classification.action === "enter_grace") {
    if (opts.dryRun) {
      return {
        outcome: "would_enter_grace",
        graceEndsAt: classification.graceEndsAt.toISOString(),
      };
    }
    const fromStatus = String(locked.status);
    await client.query(
      `UPDATE platform.organization_subscriptions
          SET status = 'past_due',
              ends_at = $2::timestamptz,
              updated_at = now()
        WHERE id = $1
          AND status = 'trialing'`,
      [locked.id, classification.graceEndsAt.toISOString()]
    );
    await writeAudit(client, {
      deploymentCode: opts.deploymentCode,
      organizationId: locked.organization_id,
      actionKey: ACTION.ENTERED_GRACE,
      entityId: locked.id,
      planKey: PLAN_KEY_GROWTH,
      fromStatus,
      toStatus: "past_due",
      reasonCode: "growth_trial_ended",
      count: opts.graceDays,
    });
    return {
      outcome: "entered_grace",
      graceEndsAt: classification.graceEndsAt.toISOString(),
    };
  }

  if (classification.action === "downgrade") {
    if (opts.dryRun) {
      return { outcome: "would_downgrade", reason: classification.reason };
    }
    const result = await downgradeToFoundation(
      client,
      locked,
      opts.freePlan,
      opts.at,
      opts.deploymentCode
    );
    return { outcome: "downgraded", ...result, reason: classification.reason };
  }

  return { outcome: "skipped", reason: "unhandled" };
}

/**
 * Run one bounded batch of Growth trial expiry maintenance.
 * @param {import('pg').Pool|{ query: Function, connect?: Function }} db
 * @param {{
 *   dryRun?: boolean,
 *   limit?: number,
 *   graceDays?: number,
 *   at?: Date|string,
 *   deploymentCode?: string,
 * }} [input]
 */
async function runGrowthTrialExpiryBatch(db, input = {}) {
  let at;
  try {
    at = resolveClock(input.at);
  } catch {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      message: "invalid_at",
      summary: emptySummary(true),
    };
  }

  const dryRun = input.dryRun !== false;
  const limit = clampInt(input.limit, DEFAULT_BATCH_LIMIT, 1, MAX_BATCH_LIMIT);
  const graceDays = clampInt(input.graceDays, DEFAULT_GRACE_DAYS, MIN_GRACE_DAYS, MAX_GRACE_DAYS);
  const deploymentCode = String(input.deploymentCode || "blessboard-org-v5")
    .trim()
    .toLowerCase() || "blessboard-org-v5";

  const summary = emptySummary(dryRun);
  summary.limit = limit;
  summary.graceDays = graceDays;
  summary.at = at.toISOString();

  if (!db || (typeof db.query !== "function" && typeof db.connect !== "function")) {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "database_required", summary };
  }

  let client = null;
  let owned = false;
  try {
    if (db && typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }

    const freePlan = await entitlementRepo.findPlanByKey(client, PLAN_KEY_FREE);
    if (!freePlan || freePlan.status !== "active") {
      return {
        ok: false,
        status: STATUS.LOOKUP_ERROR,
        message: "foundation_plan_missing",
        summary,
      };
    }

    const candidates = await listExpiryCandidates(client, { at, limit });
    summary.candidates = candidates.length;

    for (const candidate of candidates) {
      try {
        await client.query("BEGIN");
        const locked = await lockSubscriptionById(client, candidate.id);
        if (!locked) {
          await client.query("ROLLBACK");
          summary.skippedLocked += 1;
          continue;
        }
        // Re-check eligibility after lock (idempotent under concurrent runs).
        const refreshed = classifyAction(locked, at, graceDays);
        if (refreshed.action === "skip" && refreshed.reason === "not_expired") {
          await client.query("ROLLBACK");
          summary.skippedNotExpired += 1;
          continue;
        }

        const result = await processLockedRow(client, locked, {
          at,
          graceDays,
          dryRun,
          deploymentCode,
          freePlan,
        });

        if (dryRun) {
          await client.query("ROLLBACK");
        } else {
          await client.query("COMMIT");
        }

        applyResultToSummary(summary, result);
        summary.results.push({
          organizationId: locked.organization_id,
          subscriptionId: locked.id,
          outcome: result.outcome,
          reason: result.reason || null,
          graceEndsAt: result.graceEndsAt || null,
        });
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        summary.failures += 1;
        const orgId = candidate.organization_id;
        try {
          if (!dryRun && orgId) {
            await writeAudit(client, {
              deploymentCode,
              organizationId: orgId,
              actionKey: ACTION.FAILED,
              entityId: candidate.id,
              planKey: PLAN_KEY_GROWTH,
              reasonCode: "processing_exception",
              outcome: "failure",
            });
          }
        } catch {
          /* audit must not mask failure */
        }
        summary.results.push({
          organizationId: orgId,
          subscriptionId: candidate.id,
          outcome: "failed",
          reason: "processing_exception",
        });
        // Do not include err.message (may leak SQL) in summary.
      }
    }

    return { ok: true, status: STATUS.OK, summary };
  } catch {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      message: "batch_failed",
      summary,
    };
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

function emptySummary(dryRun) {
  return {
    dryRun: Boolean(dryRun),
    candidates: 0,
    enteredGrace: 0,
    wouldEnterGrace: 0,
    downgraded: 0,
    wouldDowngrade: 0,
    skippedLocked: 0,
    skippedNotExpired: 0,
    skippedPaid: 0,
    skippedOther: 0,
    failures: 0,
    limit: DEFAULT_BATCH_LIMIT,
    graceDays: DEFAULT_GRACE_DAYS,
    at: null,
    results: [],
  };
}

function applyResultToSummary(summary, result) {
  switch (result.outcome) {
    case "entered_grace":
      summary.enteredGrace += 1;
      break;
    case "would_enter_grace":
      summary.wouldEnterGrace += 1;
      break;
    case "downgraded":
      summary.downgraded += 1;
      break;
    case "would_downgrade":
      summary.wouldDowngrade += 1;
      break;
    case "skipped":
      if (result.reason === "paid_or_active_growth") summary.skippedPaid += 1;
      else if (result.reason === "not_expired") summary.skippedNotExpired += 1;
      else summary.skippedOther += 1;
      break;
    default:
      break;
  }
}

module.exports = {
  STATUS,
  ACTION,
  PRODUCT_KEY,
  PLAN_KEY_GROWTH,
  PLAN_KEY_FREE,
  DEFAULT_BATCH_LIMIT,
  MAX_BATCH_LIMIT,
  DEFAULT_GRACE_DAYS,
  MIN_GRACE_DAYS,
  MAX_GRACE_DAYS,
  classifyAction,
  listExpiryCandidates,
  runGrowthTrialExpiryBatch,
  addCalendarDaysUtc,
};
