"use strict";

/**
 * Provider-neutral billing boundary for BlessBoard V5 product subscriptions.
 *
 * State ownership:
 * - Product plan + subscription status + trial dates → entitlementService.assignOrganizationPlan
 * - Entitlement features → resolveOrganizationEntitlements (product status window)
 * - Trial grace → growthTrialExpiryService (past_due product status for Growth trials)
 * - Payment status / provider refs / period / cancel flags → this module (billing_* columns)
 * - Downgrade after unpaid trial → growthTrialExpiryService
 *
 * Does NOT call Stripe/PayPal/mobile-money/bank APIs.
 * Does NOT store card or bank credentials.
 * Registration controllers must not import this module for provision — keep provider-independent.
 */

const repo = require("../repositories/entitlementRepository");
const {
  assignOrganizationPlan,
  PRODUCT_KEY_DEFAULT,
} = require("./entitlementService");
const { recordAuditEventSafe } = require("./auditEventService");
const { getPlatformDeploymentCode } = require("../config/platformDeploymentCode");
const {
  mapPublicPlanToDbPlanKey,
  DB_PLAN_KEYS,
} = require("../../blessboard/services/registrationPlanMapping");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  CONFIRMATION_REQUIRED: "confirmation_required",
  CONFLICT: "conflict",
  LOOKUP_ERROR: "lookup_error",
});

const PAYMENT_STATUS = Object.freeze({
  NOT_APPLICABLE: "not_applicable",
  PENDING: "pending",
  EXTERNALLY_PAID: "externally_paid",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  CANCELED: "canceled",
});

const PAID_PAYMENT_STATUSES = Object.freeze([
  PAYMENT_STATUS.EXTERNALLY_PAID,
  PAYMENT_STATUS.SUCCEEDED,
]);

const ACTIVATION_SOURCES = Object.freeze({
  MANUAL_EXTERNAL: "manual_external",
  PROVIDER: "provider",
  TRIAL_CONVERSION: "trial_conversion",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function deploymentCode(env) {
  const id = getPlatformDeploymentCode(env || process.env);
  return id && id.ok ? id.code : "blessboard-org-v5";
}

async function withClient(db, fn) {
  let client = null;
  let owned = false;
  try {
    if (db && typeof db.query === "function" && typeof db.release === "function") {
      return await fn(db);
    }
    if (db && typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }
    return await fn(client);
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

/**
 * Resolve Growth/Network/Foundation aliases to DB plan_key.
 * Network (public) → professional.
 * @param {unknown} raw
 */
function resolvePaidPlanKey(raw) {
  const token = String(raw == null ? "" : raw)
    .trim()
    .toLowerCase();
  if (!token) return null;
  if (token === "network" || token === DB_PLAN_KEYS.PROFESSIONAL) {
    return DB_PLAN_KEYS.PROFESSIONAL;
  }
  if (token === "growth" || token === DB_PLAN_KEYS.GROWTH) {
    return DB_PLAN_KEYS.GROWTH;
  }
  if (token === "foundation" || token === "free" || token === DB_PLAN_KEYS.FREE) {
    return DB_PLAN_KEYS.FREE;
  }
  const mapped = mapPublicPlanToDbPlanKey(token);
  return mapped || null;
}

function isPaidBillingStatus(status) {
  return PAID_PAYMENT_STATUSES.includes(String(status || ""));
}

/**
 * Whether a Growth subscription is safely activated as paid (blocks trial downgrade).
 * @param {object|null} subscription mapped row (with optional planKey)
 */
function isSafelyActivatedPaidGrowth(subscription, planKey) {
  if (!subscription) return false;
  const key = String(planKey || subscription.planKey || "").toLowerCase();
  if (key !== DB_PLAN_KEYS.GROWTH) return false;
  if (String(subscription.status) !== "active") return false;
  if (isPaidBillingStatus(subscription.billingPaymentStatus)) return true;
  // Compat: open-ended active Growth without billing marker (operator retained).
  if (subscription.endsAt == null) return true;
  return false;
}

/**
 * Activate a paid product subscription (Growth paid or Network/professional contract).
 * Product state via assignOrganizationPlan; billing_* via updateSubscriptionBilling.
 *
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   organizationId: string,
 *   planKey: string,
 *   source?: string,
 *   reason: string,
 *   actorUserId?: string|null,
 *   confirmed?: boolean,
 *   billingProvider?: string|null,
 *   billingCustomerRef?: string|null,
 *   billingSubscriptionRef?: string|null,
 *   billingCurrentPeriodEnd?: string|Date|null,
 *   eventId?: string|null,
 *   env?: object,
 *   productKey?: string,
 * }} input
 */
async function activatePaidSubscription(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const planKey = resolvePaidPlanKey(input && input.planKey);
  const reason = String((input && input.reason) || "").trim();
  const source = String((input && input.source) || ACTIVATION_SOURCES.MANUAL_EXTERNAL)
    .trim()
    .toLowerCase();
  const productKey = String((input && input.productKey) || PRODUCT_KEY_DEFAULT)
    .trim()
    .toLowerCase();
  const actorUserId =
    input && input.actorUserId && UUID_RE.test(String(input.actorUserId))
      ? String(input.actorUserId)
      : null;

  if (!UUID_RE.test(organizationId) || !planKey) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "scope" };
  }
  if (!reason || reason.length > 2000) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "reason" };
  }
  if (input && input.requireConfirm === true && input.confirmed !== true) {
    return { ok: false, status: STATUS.CONFIRMATION_REQUIRED, reason: "confirm" };
  }
  if (
    source !== ACTIVATION_SOURCES.MANUAL_EXTERNAL &&
    source !== ACTIVATION_SOURCES.PROVIDER &&
    source !== ACTIVATION_SOURCES.TRIAL_CONVERSION
  ) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "source" };
  }
  if (planKey === DB_PLAN_KEYS.FREE) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "plan_not_paid" };
  }

  const paymentStatus =
    source === ACTIVATION_SOURCES.MANUAL_EXTERNAL
      ? PAYMENT_STATUS.EXTERNALLY_PAID
      : PAYMENT_STATUS.SUCCEEDED;
  const provider =
    input && input.billingProvider
      ? String(input.billingProvider).trim().slice(0, 64)
      : source === ACTIVATION_SOURCES.MANUAL_EXTERNAL
        ? "manual_external"
        : null;
  const customerRef =
    input && input.billingCustomerRef != null
      ? String(input.billingCustomerRef).trim().slice(0, 200) || null
      : null;
  const subscriptionRef =
    input && input.billingSubscriptionRef != null
      ? String(input.billingSubscriptionRef).trim().slice(0, 200) || null
      : null;
  const eventId =
    input && input.eventId != null ? String(input.eventId).trim().slice(0, 120) || null : null;

  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const at = new Date();
        const plan = await repo.findPlanByKey(client, planKey);
        if (!plan || plan.productKey !== productKey || plan.status !== "active") {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, reason: "plan" };
        }

        const current = await repo.findOpenStatusSubscription(
          client,
          organizationId,
          productKey
        );

        // Idempotent provider event: same subscription ref + already paid.
        if (
          current &&
          subscriptionRef &&
          current.billingSubscriptionRef === subscriptionRef &&
          isPaidBillingStatus(current.billingPaymentStatus) &&
          String(current.status) === "active"
        ) {
          const currentPlan = await repo.findPlanById(client, current.planId);
          if (currentPlan && currentPlan.planKey === planKey) {
            await client.query("COMMIT");
            return {
              ok: true,
              status: STATUS.OK,
              subscription: current,
              plan: currentPlan,
              idempotent: true,
            };
          }
        }

        let subscription;
        if (current) {
          subscription = await repo.updateSubscription(client, current.id, {
            planId: plan.id,
            status: "active",
            clearEndsAt: true,
            notes: reason.slice(0, 1000),
          });
        } else {
          const assigned = await assignOrganizationPlan(client, {
            organizationId,
            planKey,
            productKey,
            status: "active",
            clearEndsAt: true,
            notes: reason.slice(0, 1000),
          });
          if (!assigned.ok) {
            await client.query("ROLLBACK");
            return {
              ok: false,
              status:
                assigned.status === "not_found"
                  ? STATUS.NOT_FOUND
                  : assigned.status === "limit_exceeded"
                    ? STATUS.CONFLICT
                    : STATUS.LOOKUP_ERROR,
              reason: assigned.reason,
              current: assigned.current,
              limit: assigned.limit,
            };
          }
          subscription = assigned.subscription;
        }

        const subId = subscription.id;
        const updated = await repo.updateSubscriptionBilling(client, subId, {
          setProvider: true,
          billingProvider: provider,
          setCustomerRef: customerRef != null,
          billingCustomerRef: customerRef,
          setSubscriptionRef: subscriptionRef != null,
          billingSubscriptionRef: subscriptionRef,
          setPaymentStatus: true,
          billingPaymentStatus: paymentStatus,
          setPeriodEnd: input && input.billingCurrentPeriodEnd != null,
          billingCurrentPeriodEnd:
            input && input.billingCurrentPeriodEnd
              ? new Date(input.billingCurrentPeriodEnd).toISOString()
              : null,
          setCancelAtPeriodEnd: true,
          billingCancelAtPeriodEnd: false,
          setSyncedAt: true,
          billingSyncedAt: at.toISOString(),
        });

        await recordAuditEventSafe(client, {
          deploymentCode: deploymentCode(input && input.env),
          organizationId,
          actorUserId,
          actionKey: "billing.paid_activated",
          entityType: "organization_subscription",
          entityId: subId,
          outcome: "success",
          metadata: {
            product_key: productKey,
            plan_key: planKey,
            reason_code: source,
            source,
            status: paymentStatus,
            entity_key: eventId || subscriptionRef || undefined,
            actor_type: actorUserId ? "platform_admin" : "system",
          },
        });

        await client.query("COMMIT");
        return {
          ok: true,
          status: STATUS.OK,
          subscription: updated,
          plan,
          idempotent: false,
        };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

/**
 * Record a provider payment failure against the current product subscription.
 * Updates billing_* and moves active (non-trial) product status to past_due.
 * Does not affect trialing rows (trial grace owns past_due for Growth trials).
 */
async function recordPaymentFailure(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const productKey = String((input && input.productKey) || PRODUCT_KEY_DEFAULT)
    .trim()
    .toLowerCase();
  const reason = String((input && input.reason) || "payment_failed").trim().slice(0, 200);
  const eventId =
    input && input.eventId != null ? String(input.eventId).trim().slice(0, 120) || null : null;
  const subscriptionRef =
    input && input.billingSubscriptionRef != null
      ? String(input.billingSubscriptionRef).trim().slice(0, 200) || null
      : null;

  if (!UUID_RE.test(organizationId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "organization_id" };
  }

  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const at = new Date();
        const current = await repo.findOpenStatusSubscription(client, organizationId, productKey);
        if (!current) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, reason: "subscription" };
        }

        // Idempotent: already failed with same event/subscription ref.
        if (
          current.billingPaymentStatus === PAYMENT_STATUS.FAILED &&
          ((eventId && current.notes && String(current.notes).includes(eventId)) ||
            (subscriptionRef && current.billingSubscriptionRef === subscriptionRef))
        ) {
          await client.query("COMMIT");
          return { ok: true, status: STATUS.OK, subscription: current, idempotent: true };
        }

        if (String(current.status) === "trialing") {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.CONFLICT, reason: "trialing_not_billable" };
        }

        await client.query(
          `SELECT id FROM platform.organization_subscriptions WHERE id = $1 FOR UPDATE`,
          [current.id]
        );

        if (String(current.status) === "active") {
          await repo.updateSubscription(client, current.id, {
            status: "past_due",
            notes: reason.slice(0, 1000),
          });
        }

        const updated = await repo.updateSubscriptionBilling(client, current.id, {
          setPaymentStatus: true,
          billingPaymentStatus: PAYMENT_STATUS.FAILED,
          setSubscriptionRef: subscriptionRef != null,
          billingSubscriptionRef: subscriptionRef,
          setSyncedAt: true,
          billingSyncedAt: at.toISOString(),
        });

        await recordAuditEventSafe(client, {
          deploymentCode: deploymentCode(input && input.env),
          organizationId,
          actorUserId: null,
          actionKey: "billing.payment_failed",
          entityType: "organization_subscription",
          entityId: current.id,
          outcome: "success",
          metadata: {
            product_key: productKey,
            reason_code: "payment_failed",
            status: PAYMENT_STATUS.FAILED,
            from_status: current.status,
            to_status: String(current.status) === "active" ? "past_due" : current.status,
            entity_key: eventId || subscriptionRef || undefined,
            source: "provider",
            actor_type: "system",
          },
        });

        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, subscription: updated, idempotent: false };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

/**
 * Mark cancel-at-period-end on billing metadata (no provider call).
 */
async function cancelAtPeriodEnd(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const productKey = String((input && input.productKey) || PRODUCT_KEY_DEFAULT)
    .trim()
    .toLowerCase();
  if (!UUID_RE.test(organizationId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "organization_id" };
  }
  try {
    return await withClient(db, async (client) => {
      const at = new Date();
      const current = await repo.findOpenStatusSubscription(client, organizationId, productKey);
      if (!current) {
        return { ok: false, status: STATUS.NOT_FOUND, reason: "subscription" };
      }
      if (current.billingCancelAtPeriodEnd === true) {
        return { ok: true, status: STATUS.OK, subscription: current, idempotent: true };
      }
      const updated = await repo.updateSubscriptionBilling(client, current.id, {
        setCancelAtPeriodEnd: true,
        billingCancelAtPeriodEnd: true,
        setPeriodEnd: input && input.billingCurrentPeriodEnd != null,
        billingCurrentPeriodEnd:
          input && input.billingCurrentPeriodEnd
            ? new Date(input.billingCurrentPeriodEnd).toISOString()
            : null,
        setSyncedAt: true,
        billingSyncedAt: at.toISOString(),
      });
      await recordAuditEventSafe(client, {
        deploymentCode: deploymentCode(input && input.env),
        organizationId,
        actorUserId:
          input && input.actorUserId && UUID_RE.test(String(input.actorUserId))
            ? String(input.actorUserId)
            : null,
        actionKey: "billing.cancel_at_period_end",
        entityType: "organization_subscription",
        entityId: current.id,
        outcome: "success",
        metadata: {
          product_key: productKey,
          reason_code: "cancel_at_period_end",
          status: "scheduled",
          source: "billing_boundary",
        },
      });
      return { ok: true, status: STATUS.OK, subscription: updated, idempotent: false };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

/**
 * Apply a provider billing snapshot to billing_* columns only (idempotent).
 * Does not change product plan; paid activation must use activatePaidSubscription.
 */
async function synchronizeBillingState(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const productKey = String((input && input.productKey) || PRODUCT_KEY_DEFAULT)
    .trim()
    .toLowerCase();
  if (!UUID_RE.test(organizationId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "organization_id" };
  }
  const paymentStatus =
    input && input.billingPaymentStatus != null
      ? String(input.billingPaymentStatus).trim().toLowerCase()
      : null;
  if (
    paymentStatus &&
    !Object.values(PAYMENT_STATUS).includes(paymentStatus)
  ) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "payment_status" };
  }

  try {
    return await withClient(db, async (client) => {
      const at = new Date();
      const current = await repo.findOpenStatusSubscription(client, organizationId, productKey);
      if (!current) {
        return { ok: false, status: STATUS.NOT_FOUND, reason: "subscription" };
      }

      const nextProvider =
        input.billingProvider != null ? String(input.billingProvider).trim().slice(0, 64) : null;
      const nextCustomer =
        input.billingCustomerRef != null
          ? String(input.billingCustomerRef).trim().slice(0, 200)
          : null;
      const nextSubRef =
        input.billingSubscriptionRef != null
          ? String(input.billingSubscriptionRef).trim().slice(0, 200)
          : null;

      const unchanged =
        (nextProvider == null || current.billingProvider === nextProvider) &&
        (nextCustomer == null || current.billingCustomerRef === nextCustomer) &&
        (nextSubRef == null || current.billingSubscriptionRef === nextSubRef) &&
        (paymentStatus == null || current.billingPaymentStatus === paymentStatus) &&
        (input.billingCancelAtPeriodEnd == null ||
          current.billingCancelAtPeriodEnd === Boolean(input.billingCancelAtPeriodEnd));

      if (unchanged && input.force !== true) {
        return { ok: true, status: STATUS.OK, subscription: current, idempotent: true };
      }

      const updated = await repo.updateSubscriptionBilling(client, current.id, {
        setProvider: nextProvider != null,
        billingProvider: nextProvider,
        setCustomerRef: nextCustomer != null,
        billingCustomerRef: nextCustomer,
        setSubscriptionRef: nextSubRef != null,
        billingSubscriptionRef: nextSubRef,
        setPaymentStatus: paymentStatus != null,
        billingPaymentStatus: paymentStatus,
        setPeriodEnd: input.billingCurrentPeriodEnd != null || input.clearPeriodEnd === true,
        clearPeriodEnd: input.clearPeriodEnd === true,
        billingCurrentPeriodEnd:
          input.billingCurrentPeriodEnd != null
            ? new Date(input.billingCurrentPeriodEnd).toISOString()
            : null,
        setCancelAtPeriodEnd: input.billingCancelAtPeriodEnd != null,
        billingCancelAtPeriodEnd: Boolean(input.billingCancelAtPeriodEnd),
        setSyncedAt: true,
        billingSyncedAt: at.toISOString(),
      });

      return { ok: true, status: STATUS.OK, subscription: updated, idempotent: false };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

/**
 * Platform-admin: mark externally paid / activate Network after contract.
 * Requires reason + confirmed + actor.
 */
async function activatePaidSubscriptionByOrganizationKey(db, input) {
  const organizationKey = String((input && input.organizationKey) || "")
    .trim()
    .toLowerCase();
  const reason = String((input && input.reason) || "").trim();
  if (!organizationKey || !reason) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "scope" };
  }
  if (input && input.confirmed !== true) {
    return { ok: false, status: STATUS.CONFIRMATION_REQUIRED, reason: "confirm" };
  }
  try {
    const org = await withClient(db, async (client) => {
      const { rows } = await client.query(
        `SELECT id, organization_key FROM platform.organizations WHERE organization_key = $1 LIMIT 1`,
        [organizationKey]
      );
      return rows[0] || null;
    });
    if (!org) {
      return { ok: false, status: STATUS.NOT_FOUND, reason: "organization" };
    }
    let planKey = resolvePaidPlanKey(input && input.planKey);
    if (!planKey) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: "plan_key" };
    }
    return activatePaidSubscription(db, {
      organizationId: org.id,
      planKey,
      reason,
      source: ACTIVATION_SOURCES.MANUAL_EXTERNAL,
      actorUserId: input.actorUserId,
      confirmed: true,
      requireConfirm: false,
      billingProvider: input.billingProvider || "manual_external",
      billingCustomerRef: input.billingCustomerRef,
      billingSubscriptionRef: input.billingSubscriptionRef,
      billingCurrentPeriodEnd: input.billingCurrentPeriodEnd,
      env: input.env,
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

module.exports = {
  STATUS,
  PAYMENT_STATUS,
  PAID_PAYMENT_STATUSES,
  ACTIVATION_SOURCES,
  resolvePaidPlanKey,
  isPaidBillingStatus,
  isSafelyActivatedPaidGrowth,
  activatePaidSubscription,
  activatePaidSubscriptionByOrganizationKey,
  recordPaymentFailure,
  cancelAtPeriodEnd,
  synchronizeBillingState,
};
