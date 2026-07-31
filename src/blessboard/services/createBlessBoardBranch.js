"use strict";

/**
 * Create a BlessBoard campus/branch with transactional entitlement limit enforcement.
 * Provisions the minimal foundation: branch row + default branch_settings + audit.
 * Does not delete existing branches on plan downgrade — only blocks new creates over limit.
 * Does not create domains, subscriptions, org tenants, or starter public pages.
 */

const {
  evaluateBranchCreateLimit,
  STATUS: ENTITLEMENT_STATUS,
  FEATURE_KEYS,
} = require("../../platform/services/entitlementService");
const {
  prepareBranchDisplayName,
  isUniqueBranchDisplayNameViolation,
  DUPLICATE_BRANCH_DISPLAY_NAME_MESSAGE,
} = require("./normalizeBranchDisplayName");
const { normalizeBranchKey } = require("./branchKey");
const {
  validateBranchSettingsInput,
  friendlySettingsError,
} = require("./settingsValidation");
const repo = require("../repositories/blessBoardSettingsRepository");
const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");
const {
  ensureBranchWebsiteGovernance,
} = require("./branchWebsiteGovernanceService");
const { detectWebsiteModeTransition } = require("./websiteModeTransition");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  LIMIT_EXCEEDED: "limit_exceeded",
  SUBSCRIPTION_INACTIVE: "subscription_inactive",
  CONFLICT: "conflict",
  LOOKUP_ERROR: "lookup_error",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {object} gate
 */
function maxBranchesSource(gate) {
  const features = gate && gate.entitlements && gate.entitlements.features;
  const feature = features && features[FEATURE_KEYS.MAX_BRANCHES];
  return feature && feature.source ? String(feature.source) : "plan";
}

/**
 * Best-effort failure/denied audit outside a rolled-back transaction.
 * @param {{ query: Function, connect?: Function }} db
 * @param {object} input
 */
async function auditBranchCreateOutcome(db, input) {
  try {
    await recordBlessBoardAudit(db, {
      churchId: input.churchId,
      organizationId: input.organizationId,
      branchId: input.branchId || null,
      actorUserId: input.actorUserId || null,
      actionKey: "branch.created",
      entityType: "branch",
      entityId: input.branchId || null,
      outcome: input.outcome || "failure",
      metadata: {
        reason_code: input.reasonCode || "unknown",
        branch_key: input.branchKey || undefined,
        status: input.statusCode || undefined,
        source: input.source || undefined,
        count: input.current != null ? Number(input.current) : undefined,
      },
    });
  } catch {
    /* never block create path on audit */
  }
}

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {object} input
 */
async function createBlessBoardBranch(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const actorUserId =
    input && input.actorUserId != null && String(input.actorUserId).trim()
      ? String(input.actorUserId).trim()
      : null;

  const prepared = prepareBranchDisplayName(input && input.displayName, {
    field: "displayName",
    required: true,
  });
  const keyNorm = normalizeBranchKey(input && input.branchKey);

  if (!UUID_RE.test(churchId) || !UUID_RE.test(organizationId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, branch: null, reason: "scope" };
  }
  if (!prepared.ok) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      branch: null,
      reason: "display_name",
      message: prepared.error,
      fieldErrors: { displayName: prepared.error },
    };
  }
  if (!keyNorm.ok) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      branch: null,
      reason: keyNorm.reason,
      message: keyNorm.message,
      fieldErrors: { branchKey: keyNorm.message },
    };
  }
  const branchKey = keyNorm.key;

  const settingsValidated = validateBranchSettingsInput({
    publicName: prepared.display,
    email: input && input.email,
    phone: input && input.phone,
    timezone: input && input.timezone,
    countryCode: input && input.countryCode,
    addressLine1: input && input.addressLine1,
    addressLine2: input && input.addressLine2,
    city: input && input.city,
    provinceState: input && input.provinceState,
    postalCode: input && input.postalCode,
    latitude: input && input.latitude,
    longitude: input && input.longitude,
  });
  if (!settingsValidated.ok) {
    const reason = settingsValidated.reason || "constraint";
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      branch: null,
      reason,
      message: friendlySettingsError(reason),
      fieldErrors: { [reason]: friendlySettingsError(reason) },
    };
  }
  const settings = settingsValidated.value;

  // Product policy: additional campuses are created active (activation limits apply later).
  const initialStatus = "active";

  let client = null;
  let owned = false;
  try {
    if (db && typeof db.connect === "function" && typeof db.release !== "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }
    await client.query("BEGIN");
    const church = await client.query(
      `SELECT id, organization_id, status FROM blessboard.churches WHERE id = $1 FOR UPDATE`,
      [churchId]
    );
    if (!church.rows[0] || String(church.rows[0].organization_id) !== organizationId) {
      await client.query("ROLLBACK");
      return { ok: false, status: STATUS.NOT_FOUND, branch: null, reason: "church" };
    }
    const gate = await evaluateBranchCreateLimit(client, {
      organizationId,
      productKey: input.productKey,
      at: input.at,
    });
    if (!gate.ok) {
      await client.query("ROLLBACK");
      const mapped =
        gate.status === ENTITLEMENT_STATUS.LIMIT_EXCEEDED
          ? STATUS.LIMIT_EXCEEDED
          : gate.status === ENTITLEMENT_STATUS.SUBSCRIPTION_INACTIVE
            ? STATUS.SUBSCRIPTION_INACTIVE
            : STATUS.FORBIDDEN;
      await auditBranchCreateOutcome(db, {
        churchId,
        organizationId,
        actorUserId,
        branchKey,
        outcome: mapped === STATUS.LIMIT_EXCEEDED ? "denied" : "failure",
        reasonCode: gate.reason || mapped,
        statusCode: mapped,
        current: gate.current,
        source: maxBranchesSource(gate),
      });
      return {
        ok: false,
        status: mapped,
        branch: null,
        reason: gate.reason,
        current: gate.current,
        limit: gate.limit,
        message:
          mapped === STATUS.LIMIT_EXCEEDED
            ? "Your plan’s active branch limit has been reached. Upgrade to add another campus."
            : undefined,
      };
    }

    const timezone = settings.timezone || "UTC";
    const countryCode = settings.countryCode || null;

    const { rows } = await client.query(
      `INSERT INTO blessboard.branches
         (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
       VALUES ($1, $2, $3, 'branch', $4, false, $5, $6)
       RETURNING id, church_id, branch_key, display_name, display_name_normalized, branch_type, status, is_primary, timezone, country_code`,
      [churchId, branchKey, prepared.display, initialStatus, timezone, countryCode]
    );
    const branch = rows[0];

    const settingsRow = await repo.upsertBranchSettings(client, branch.id, settings);
    if (!settingsRow) {
      await client.query("ROLLBACK");
      await auditBranchCreateOutcome(db, {
        churchId,
        organizationId,
        actorUserId,
        branchKey,
        outcome: "failure",
        reasonCode: "settings_init_failed",
        statusCode: STATUS.LOOKUP_ERROR,
      });
      return { ok: false, status: STATUS.LOOKUP_ERROR, branch: null, reason: "settings" };
    }

    await ensureBranchWebsiteGovernance(client, {
      organizationId,
      churchId,
      branchId: branch.id,
      updatedBy: actorUserId || null,
    });

    const limitSource = maxBranchesSource(gate);
    await recordBlessBoardAudit(client, {
      churchId,
      organizationId,
      branchId: branch.id,
      actorUserId,
      actionKey: "branch.created",
      entityType: "branch",
      entityId: branch.id,
      outcome: "success",
      metadata: {
        status: initialStatus,
        branch_key: branchKey,
        source: limitSource,
        count: gate.current != null ? Number(gate.current) + 1 : undefined,
        reason_code: limitSource === "override" ? "platform_override_capacity" : "plan_capacity",
      },
    });

    await client.query("COMMIT");
    const previousActiveCount =
      gate.current != null ? Number(gate.current) : null;
    const nextActiveCount =
      previousActiveCount != null ? previousActiveCount + 1 : null;
    const websiteModeTransition = detectWebsiteModeTransition({
      previousActiveCount: previousActiveCount != null ? previousActiveCount : 0,
      nextActiveCount: nextActiveCount != null ? nextActiveCount : 1,
    });
    return {
      ok: true,
      status: STATUS.OK,
      branch,
      settings: settingsRow,
      current: nextActiveCount,
      previousActiveCount,
      nextActiveCount,
      limit: gate.limit,
      websiteModeTransition,
      /** Create never seeds or copies public CMS pages into the new branch. */
      cmsContentCopied: false,
    };
  } catch (err) {
    try {
      if (client) await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    if (isUniqueBranchDisplayNameViolation(err)) {
      await auditBranchCreateOutcome(db, {
        churchId,
        organizationId,
        actorUserId,
        branchKey,
        outcome: "denied",
        reasonCode: "duplicate_display_name",
        statusCode: STATUS.CONFLICT,
      });
      return {
        ok: false,
        status: STATUS.CONFLICT,
        branch: null,
        reason: "duplicate_display_name",
        message: DUPLICATE_BRANCH_DISPLAY_NAME_MESSAGE,
        fieldErrors: { displayName: DUPLICATE_BRANCH_DISPLAY_NAME_MESSAGE },
      };
    }
    if (err && String(err.code) === "23505") {
      await auditBranchCreateOutcome(db, {
        churchId,
        organizationId,
        actorUserId,
        branchKey,
        outcome: "denied",
        reasonCode: "duplicate_branch_key",
        statusCode: STATUS.CONFLICT,
      });
      return {
        ok: false,
        status: STATUS.CONFLICT,
        branch: null,
        reason: "duplicate_branch_key",
        message: "That branch key is already in use for this church. Please choose another.",
        fieldErrors: {
          branchKey: "That branch key is already in use for this church. Please choose another.",
        },
      };
    }
    const msg = err && err.message ? String(err.message) : "";
    await auditBranchCreateOutcome(db, {
      churchId,
      organizationId,
      actorUserId,
      branchKey,
      outcome: "failure",
      reasonCode: "lookup_error",
      statusCode: STATUS.LOOKUP_ERROR,
    });
    return { ok: false, status: STATUS.LOOKUP_ERROR, branch: null, reason: msg };
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

module.exports = {
  STATUS,
  createBlessBoardBranch,
};
