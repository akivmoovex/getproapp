"use strict";

const { ENGINE, RESULT, LIFECYCLE, REVIEW_REASON } = require("./constants");
const { toCanonicalLifecycle } = require("./lifecycle");
const { decideReview } = require("./reviewPolicy");
const { isSelfRegistrationProvisioningEnabled } = require("./killSwitch");
const { recordAuditEventSafe } = require("../services/auditEventService");

function fail(code, extra) {
  return {
    ok: false,
    engine: ENGINE,
    code,
    canonicalLifecycle: extra && extra.canonicalLifecycle ? extra.canonicalLifecycle : null,
    ...extra,
  };
}

function ok(code, extra) {
  return {
    ok: code === RESULT.ACTIVE || code === RESULT.REVIEW_REQUIRED,
    engine: ENGINE,
    code,
    ...extra,
  };
}

async function maybeAudit(db, input, application, organizationId) {
  if (!organizationId) return { recorded: false, reason: "no_organization" };
  return recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || "moovex-platform-testing",
    organizationId,
    actionKey: "registration.lifecycle",
    entityType: "registration_application",
    entityId: application && application.id ? application.id : null,
    outcome: "success",
    metadata: {
      product_code: String(input.productCode || ""),
      result: String(input.resultCode || ""),
      reason: input.reason || null,
    },
  });
}

/**
 * Shared self-registration orchestrator.
 * Product adapters own validation shape, persistence tables, and product records.
 * This function owns lifecycle, review policy, kill switch, and normalized results.
 *
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   productCode: string,
 *   adapter: object,
 *   payload: object,
 *   env?: object,
 *   deploymentCode?: string,
 *   dataEnvironment?: string,
 *   actor?: object,
 * }} input
 */
async function submitPlatformRegistration(db, input) {
  const adapter = input && input.adapter;
  if (!adapter || typeof adapter.validate !== "function") {
    return fail(RESULT.INVALID, { error: "registration_adapter_required" });
  }
  const productCode = String((input && input.productCode) || adapter.productCode || "");
  const env = (input && input.env) || {};
  const provisioningEnabled = isSelfRegistrationProvisioningEnabled(env);

  const validated = await adapter.validate(input.payload || {}, { env, provisioningEnabled });
  if (!validated || validated.ok === false) {
    return fail(RESULT.INVALID, {
      errors: (validated && validated.errors) || {},
      error: validated && validated.error,
      field: validated && validated.field,
      persistCode: validated && validated.code,
      canonicalLifecycle: null,
    });
  }

  if (typeof adapter.findDuplicate === "function") {
    const duplicate = await adapter.findDuplicate(db, validated.normalized || validated.data);
    if (duplicate && duplicate.block) {
      return fail(RESULT.DUPLICATE, {
        application: duplicate.application || null,
        canonicalLifecycle: duplicate.application
          ? toCanonicalLifecycle(productCode, duplicate.application)
          : LIFECYCLE.ACTIVE,
      });
    }
  }

  const persisted = await adapter.persistSubmitted(db, {
    normalized: validated.normalized || validated.data,
    payload: input.payload,
    env,
    deploymentCode: input.deploymentCode,
    dataEnvironment: input.dataEnvironment,
  });
  if (!persisted || persisted.ok === false) {
    if (persisted && persisted.code === "duplicate") {
      return fail(RESULT.DUPLICATE, {
        application: persisted.application || null,
        canonicalLifecycle: persisted.application
          ? toCanonicalLifecycle(productCode, persisted.application)
          : null,
      });
    }
    return fail(RESULT.INVALID, {
      errors: (persisted && persisted.errors) || {},
      error: persisted && persisted.error,
      field: persisted && persisted.field,
      pgCode: persisted && persisted.pgCode,
      httpStatus: persisted && persisted.httpStatus,
      persistCode: persisted && persisted.code,
      riskDecision: persisted && persisted.riskDecision,
      riskReasonCodes: persisted && persisted.riskReasonCodes,
      application: persisted && persisted.application,
    });
  }

  const application = persisted.application;
  if (persisted.duplicate && application) {
    const canonical = toCanonicalLifecycle(productCode, application);
    if (canonical === LIFECYCLE.ACTIVE || canonical === LIFECYCLE.ONBOARDING) {
      const provisioned = await adapter.provision(db, {
        application,
        normalized: validated.normalized || validated.data,
        payload: input.payload,
        env,
        deploymentCode: input.deploymentCode,
        dataEnvironment: input.dataEnvironment,
        actor: input.actor || { kind: "public_self_registration" },
      });
      const records = (provisioned && (provisioned.records || (provisioned.provisioned && provisioned.provisioned.records))) || {};
      return ok(RESULT.ACTIVE, {
        reviewRequired: false,
        application,
        canonicalLifecycle: LIFECYCLE.ACTIVE,
        productCode,
        organizationId:
          (provisioned && provisioned.organizationId) ||
          application.organization_id ||
          application.organizationId ||
          records.organizationId ||
          null,
        identityId: (provisioned && provisioned.identityId) || records.administratorUserId || null,
        alreadyProvisioned: true,
        onboarding: { state: LIFECYCLE.ONBOARDING, productCode },
        provision: provisioned && provisioned.ok ? provisioned : { records, alreadyProvisioned: true },
      });
    }
    if (canonical === LIFECYCLE.REVIEW_REQUIRED) {
      return ok(RESULT.REVIEW_REQUIRED, {
        reviewRequired: true,
        reason: REVIEW_REASON.DUPLICATE_CANDIDATE,
        application,
        canonicalLifecycle: LIFECYCLE.REVIEW_REQUIRED,
        productCode,
        duplicate: true,
      });
    }
  }

  let signals = {};
  if (typeof adapter.collectReviewSignals === "function") {
    signals = await adapter.collectReviewSignals(db, {
      application,
      normalized: validated.normalized || validated.data,
      payload: input.payload,
      env,
    });
  }
  signals = { ...signals, provisioningEnabled };

  const decision = decideReview({ productCode, signals });
  if (decision.reviewRequired) {
    if (typeof adapter.markReviewRequired === "function") {
      await adapter.markReviewRequired(db, {
        application,
        reason: decision.reason,
        reasons: decision.reasons,
      });
    }
    const held = {
      ...application,
      status: LIFECYCLE.REVIEW_REQUIRED,
    };
    return ok(RESULT.REVIEW_REQUIRED, {
      reviewRequired: true,
      reason: decision.reason,
      reasons: decision.reasons,
      application: held,
      canonicalLifecycle: LIFECYCLE.REVIEW_REQUIRED,
      productCode,
      plan: signals.plan || null,
    });
  }

  const provisioned = await adapter.provision(db, {
    application,
    normalized: validated.normalized || validated.data,
    payload: input.payload,
    env,
    deploymentCode: input.deploymentCode,
    dataEnvironment: input.dataEnvironment,
    actor: input.actor || { kind: "public_self_registration" },
  });

  if (!provisioned || provisioned.ok === false) {
    const reason =
      provisioned && provisioned.reviewRequired
        ? provisioned.reason || REVIEW_REASON.IDENTITY_COLLISION
        : REVIEW_REASON.PROVISION_FAILURE;
    if (typeof adapter.markReviewRequired === "function") {
      await adapter.markReviewRequired(db, {
        application,
        reason: provisioned && provisioned.reason ? provisioned.reason : reason,
        reasons: [reason],
      });
    }
    const code =
      provisioned && provisioned.reviewRequired ? RESULT.REVIEW_REQUIRED : RESULT.PROVISION_FAILED;
    return ok(code, {
      reviewRequired: code === RESULT.REVIEW_REQUIRED,
      reason: provisioned && provisioned.reason ? provisioned.reason : reason,
      application: {
        ...application,
        status: code === RESULT.REVIEW_REQUIRED ? LIFECYCLE.REVIEW_REQUIRED : LIFECYCLE.PROVISION_FAILED,
      },
      canonicalLifecycle:
        code === RESULT.REVIEW_REQUIRED ? LIFECYCLE.REVIEW_REQUIRED : LIFECYCLE.PROVISION_FAILED,
      productCode,
      provision: provisioned,
    });
  }

  if (typeof adapter.ensureWebsite === "function") {
    await adapter.ensureWebsite(db, {
      organizationId: provisioned.organizationId,
      application,
      provision: provisioned,
      env,
    });
  }

  await maybeAudit(
    db,
    {
      ...input,
      productCode,
      resultCode: RESULT.ACTIVE,
    },
    application,
    provisioned.organizationId
  );

  return ok(RESULT.ACTIVE, {
    reviewRequired: false,
    application: provisioned.application || application,
    canonicalLifecycle: LIFECYCLE.ACTIVE,
    productCode,
    organizationId: provisioned.organizationId || null,
    identityId: provisioned.identityId || null,
    onboarding: {
      state: LIFECYCLE.ONBOARDING,
      productCode,
    },
    provision: provisioned,
  });
}

async function resolvePlatformRegistrationReview(db, input) {
  const adapter = input && input.adapter;
  const action = String((input && input.action) || "").toLowerCase();
  if (!adapter) return fail(RESULT.INVALID, { error: "registration_adapter_required" });
  if (action === "reject" && typeof adapter.reject === "function") {
    const rejected = await adapter.reject(db, input);
    return {
      ok: Boolean(rejected && rejected.ok),
      engine: ENGINE,
      code: rejected && rejected.ok ? RESULT.REJECTED : RESULT.INVALID,
      canonicalLifecycle: LIFECYCLE.REJECTED,
      ...rejected,
    };
  }
  if (action === "approve" && typeof adapter.approve === "function") {
    const approved = await adapter.approve(db, input);
    if (!approved || approved.ok === false) {
      return fail(RESULT.PROVISION_FAILED, { provision: approved });
    }
    return ok(RESULT.ACTIVE, {
      canonicalLifecycle: LIFECYCLE.ACTIVE,
      organizationId: approved.organizationId,
      provision: approved,
    });
  }
  return fail(RESULT.INVALID, { error: "unsupported_review_action" });
}

module.exports = {
  submitPlatformRegistration,
  resolvePlatformRegistrationReview,
};
