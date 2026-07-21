"use strict";

/**
 * Foundation→Growth introductory trial offer lifecycle (V5 only).
 * Trial starts only after authorized HQ admin acceptance.
 */

const offerRepo = require("../repositories/growthTrialOfferRepository");
const entitlementRepo = require("../repositories/entitlementRepository");
const { assignOrganizationPlan } = require("./entitlementService");
const { growthTrialEndsAtIso } = require("../time/addGrowthTrialDurationUtc");
const { recordAuditEventSafe } = require("./auditEventService");
const { getPlatformDeploymentCode } = require("../config/platformDeploymentCode");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  NOT_ELIGIBLE: "not_eligible",
  LOOKUP_ERROR: "lookup_error",
});

const ELIGIBILITY = Object.freeze({
  ELIGIBLE: "eligible",
  OFFERED: "offered",
  ACTIVE: "active",
  CONSUMED: "consumed",
  DECLINED: "declined",
  CANCELED: "canceled",
  INELIGIBLE: "ineligible",
  EXCEPTION_GRANTED: "exception_granted",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function remainingDays(endsAt, at) {
  if (!endsAt) return null;
  const end = endsAt instanceof Date ? endsAt : new Date(endsAt);
  const now = at instanceof Date ? at : new Date(at || Date.now());
  if (Number.isNaN(end.getTime()) || Number.isNaN(now.getTime())) return null;
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationId
 */
async function evaluateEligibility(client, organizationId) {
  const sub = await offerRepo.findCurrentFoundationSubscription(client, organizationId);
  const open = await offerRepo.findOpenOffer(client, organizationId);
  const latest = await offerRepo.findLatestOffer(client, organizationId);
  const consumed = await offerRepo.hasConsumedIntroductoryTrial(client, organizationId);

  const planKey = sub ? String(sub.plan_key || "") : "";
  const subStatus = sub ? String(sub.status || "") : "";

  if (open) {
    return {
      state: ELIGIBILITY.OFFERED,
      offer: open,
      subscription: sub,
      consumed,
      remainingDays: null,
    };
  }

  if (
    planKey === "growth" &&
    (subStatus === "trialing" || subStatus === "past_due") &&
    latest &&
    (latest.status === "active" || latest.status === "accepted")
  ) {
    return {
      state: ELIGIBILITY.ACTIVE,
      offer: latest,
      subscription: sub,
      consumed: true,
      remainingDays: remainingDays(sub.ends_at || latest.endsAt),
    };
  }

  if (latest && latest.status === "exception_granted") {
    return {
      state: ELIGIBILITY.EXCEPTION_GRANTED,
      offer: latest,
      subscription: sub,
      consumed: false,
      remainingDays: null,
    };
  }

  if (consumed) {
    return {
      state: ELIGIBILITY.CONSUMED,
      offer: latest,
      subscription: sub,
      consumed: true,
      remainingDays: null,
    };
  }

  if (latest && latest.status === "declined") {
    return {
      state: ELIGIBILITY.DECLINED,
      offer: latest,
      subscription: sub,
      consumed: false,
      remainingDays: null,
    };
  }

  if (planKey === "free" && subStatus === "active") {
    return {
      state: ELIGIBILITY.ELIGIBLE,
      offer: null,
      subscription: sub,
      consumed: false,
      remainingDays: null,
    };
  }

  return {
    state: ELIGIBILITY.INELIGIBLE,
    offer: latest,
    subscription: sub,
    consumed,
    remainingDays: null,
  };
}

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {string} organizationId
 */
async function getGrowthTrialOfferState(db, organizationId) {
  const orgId = String(organizationId || "").trim();
  if (!UUID_RE.test(orgId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "organization_id" };
  }
  try {
    return await withClient(db, async (client) => {
      const eligibility = await evaluateEligibility(client, orgId);
      let growthBenefits = [];
      try {
        const plan = await entitlementRepo.findPlanByKey(client, "growth");
        if (plan) {
          growthBenefits = await entitlementRepo.listPlanFeatures(client, plan.id);
        }
      } catch {
        growthBenefits = [];
      }
      const previewStartsAt = new Date();
      const previewEndsAt = growthTrialEndsAtIso(previewStartsAt);
      return {
        ok: true,
        status: STATUS.OK,
        ...eligibility,
        growthBenefits,
        previewStartsAt: previewStartsAt.toISOString(),
        previewEndsAt,
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message).slice(0, 120) : "lookup_failed",
    };
  }
}

/**
 * Platform admin creates an offer (does not start the trial).
 */
async function createGrowthTrialOffer(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const deploymentCode = String((input && input.deploymentCode) || "").trim();
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "scope" };
  }
  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const eligibility = await evaluateEligibility(client, organizationId);
        if (
          eligibility.state !== ELIGIBILITY.ELIGIBLE &&
          eligibility.state !== ELIGIBILITY.EXCEPTION_GRANTED &&
          eligibility.state !== ELIGIBILITY.CANCELED &&
          eligibility.state !== ELIGIBILITY.DECLINED
        ) {
          if (eligibility.state === ELIGIBILITY.OFFERED) {
            await client.query("ROLLBACK");
            return {
              ok: true,
              status: STATUS.OK,
              offer: eligibility.offer,
              alreadyOffered: true,
            };
          }
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.NOT_ELIGIBLE,
            reason: eligibility.state,
          };
        }

        const isException = eligibility.state === ELIGIBILITY.EXCEPTION_GRANTED;
        const offer = await offerRepo.insertOffer(client, {
          organizationId,
          offerSource: isException ? "platform_exception" : "foundation_upgrade",
          status: "offered",
          offeredAt: new Date().toISOString(),
          offeredBy: actorUserId,
          isException,
          exceptionReason:
            isException && eligibility.offer ? eligibility.offer.exceptionReason : null,
        });

        if (deploymentCode) {
          await recordAuditEventSafe(client, {
            deploymentCode,
            organizationId,
            actorUserId,
            actionKey: "growth_trial.offer_created",
            entityType: "growth_trial_offer",
            entityId: offer.id,
            outcome: "success",
            metadata: { offer_source: offer.offerSource, is_exception: offer.isException },
          });
        }

        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, offer, alreadyOffered: false };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });
  } catch (err) {
    const msg = err && err.message ? String(err.message) : "";
    if (/unique|duplicate/i.test(msg)) {
      return { ok: false, status: STATUS.CONFLICT, reason: "duplicate_offer" };
    }
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: msg.slice(0, 120),
    };
  }
}

/**
 * Cancel an unaccepted offer.
 */
async function cancelGrowthTrialOffer(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const deploymentCode = String((input && input.deploymentCode) || "").trim();
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "scope" };
  }
  try {
    return await withClient(db, async (client) => {
      const open = await offerRepo.findOpenOffer(client, organizationId);
      if (!open) {
        return { ok: false, status: STATUS.NOT_FOUND, reason: "no_open_offer" };
      }
      const updated = await offerRepo.updateOffer(client, open.id, {
        status: "canceled",
        canceledAt: new Date().toISOString(),
      });
      if (deploymentCode) {
        await recordAuditEventSafe(client, {
          deploymentCode,
          organizationId,
          actorUserId,
          actionKey: "growth_trial.offer_canceled",
          entityType: "growth_trial_offer",
          entityId: open.id,
          outcome: "success",
          metadata: {},
        });
      }
      return { ok: true, status: STATUS.OK, offer: updated };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message).slice(0, 120) : "cancel_failed",
    };
  }
}

/**
 * Grant one-time exception after introductory trial was consumed.
 */
async function grantGrowthTrialException(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const reason = String((input && input.reason) || "").trim();
  const deploymentCode = String((input && input.deploymentCode) || "").trim();
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "scope" };
  }
  if (!reason || reason.length > 1000) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "exception_reason_required" };
  }
  try {
    return await withClient(db, async (client) => {
      const eligibility = await evaluateEligibility(client, organizationId);
      if (eligibility.state !== ELIGIBILITY.CONSUMED) {
        return { ok: false, status: STATUS.NOT_ELIGIBLE, reason: eligibility.state };
      }
      const open = await offerRepo.findOpenOffer(client, organizationId);
      if (open) {
        return { ok: false, status: STATUS.CONFLICT, reason: "open_offer_exists" };
      }
      const offer = await offerRepo.insertOffer(client, {
        organizationId,
        offerSource: "platform_exception",
        status: "exception_granted",
        offeredAt: new Date().toISOString(),
        offeredBy: actorUserId,
        isException: true,
        exceptionReason: reason,
      });
      if (deploymentCode) {
        await recordAuditEventSafe(client, {
          deploymentCode,
          organizationId,
          actorUserId,
          actionKey: "growth_trial.exception_granted",
          entityType: "growth_trial_offer",
          entityId: offer.id,
          outcome: "success",
          metadata: { reason_len: reason.length },
        });
      }
      return { ok: true, status: STATUS.OK, offer };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message).slice(0, 120) : "exception_failed",
    };
  }
}

/**
 * Tenant HQ admin accepts an open offer. Server clock only.
 */
async function acceptGrowthTrialOffer(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const deploymentCode =
    String((input && input.deploymentCode) || "").trim() ||
    (() => {
      const d = getPlatformDeploymentCode(input && input.env);
      return d && d.ok ? d.code : "blessboard-org-v5";
    })();

  if (!UUID_RE.test(organizationId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "scope" };
  }

  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        await client.query(
          `SELECT id FROM platform.organizations WHERE id = $1 FOR UPDATE`,
          [organizationId]
        );

        const open = await offerRepo.findOpenOffer(client, organizationId);
        if (!open) {
          // Idempotent: already accepted / active for this org.
          const eligibility = await evaluateEligibility(client, organizationId);
          if (
            eligibility.state === ELIGIBILITY.ACTIVE &&
            eligibility.offer &&
            eligibility.offer.acceptedBy === actorUserId
          ) {
            await client.query("COMMIT");
            return {
              ok: true,
              status: STATUS.OK,
              offer: eligibility.offer,
              alreadyAccepted: true,
              subscription: eligibility.subscription,
            };
          }
          if (eligibility.state === ELIGIBILITY.ACTIVE) {
            await client.query("COMMIT");
            return {
              ok: true,
              status: STATUS.OK,
              offer: eligibility.offer,
              alreadyAccepted: true,
              subscription: eligibility.subscription,
            };
          }
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_ELIGIBLE, reason: eligibility.state };
        }

        const startsAt = new Date();
        const endsAtIso = growthTrialEndsAtIso(startsAt);

        const assigned = await assignOrganizationPlan(client, {
          organizationId,
          planKey: "growth",
          status: "trialing",
          startsAt: startsAt.toISOString(),
          endsAt: endsAtIso,
          trialSource: "foundation_trial_offer",
          at: startsAt,
        });
        if (!assigned.ok || !assigned.subscription) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.LOOKUP_ERROR,
            reason: assigned.reason || "plan_assign_failed",
          };
        }

        const updated = await offerRepo.updateOffer(client, open.id, {
          status: "active",
          acceptedAt: startsAt.toISOString(),
          acceptedBy: actorUserId,
          trialSubscriptionId: assigned.subscription.id,
          startsAt: startsAt.toISOString(),
          endsAt: endsAtIso,
        });

        await recordAuditEventSafe(client, {
          deploymentCode,
          organizationId,
          actorUserId,
          actionKey: "growth_trial.offer_accepted",
          entityType: "growth_trial_offer",
          entityId: open.id,
          outcome: "success",
          metadata: {
            trial_subscription_id: assigned.subscription.id,
            starts_at: startsAt.toISOString(),
            ends_at: endsAtIso,
            trial_source: "foundation_trial_offer",
          },
        });

        await client.query("COMMIT");
        return {
          ok: true,
          status: STATUS.OK,
          offer: updated,
          alreadyAccepted: false,
          subscription: assigned.subscription,
          startsAt: startsAt.toISOString(),
          endsAt: endsAtIso,
        };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });
  } catch (err) {
    const msg = err && err.message ? String(err.message) : "";
    if (/unique|duplicate|intro_consumed/i.test(msg)) {
      return { ok: false, status: STATUS.CONFLICT, reason: "trial_already_consumed" };
    }
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: msg.slice(0, 160),
    };
  }
}

module.exports = {
  STATUS,
  ELIGIBILITY,
  remainingDays,
  getGrowthTrialOfferState,
  createGrowthTrialOffer,
  cancelGrowthTrialOffer,
  grantGrowthTrialException,
  acceptGrowthTrialOffer,
};
