"use strict";

const { ENGINE, RESULT, LIFECYCLE, REVIEW_REASON } = require("./constants");
const { toCanonicalLifecycle } = require("./lifecycle");
const { decideReview } = require("./reviewPolicy");
const { isSelfRegistrationProvisioningEnabled } = require("./killSwitch");
const { initializeOrganizationWebsite } = require("./initializeOrganizationWebsite");
const { ACTION, recordLifecycleAudit } = require("./lifecycleAudit");

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

async function maybeAudit(db, input, application, organizationId, extra) {
  const organization =
    organizationId ||
    (application && (application.organization_id || application.organizationId)) ||
    null;
  if (!organization) return { recorded: false, reason: "no_organization" };
  const actor = (input && input.actor) || {};
  return recordLifecycleAudit(db, {
    deploymentCode: (input && input.deploymentCode) || "moovex-platform-testing",
    organizationId: organization,
    actionKey: (extra && extra.actionKey) || ACTION.PROVISIONING_COMPLETED,
    entityType: "registration_application",
    entityId: application && application.id ? application.id : null,
    applicationId: application && application.id ? application.id : null,
    outcome: (extra && extra.outcome) || "success",
    productCode: (input && input.productCode) || (extra && extra.productCode),
    actorType: actor.kind || actor.type || (extra && extra.actorType) || "system",
    actorUserId: actor.userId || actor.actorUserId || null,
    actorIdentityId: actor.identityId || actor.actorIdentityId || null,
    source: extra && extra.source ? extra.source : "registration_orchestrator",
    status: extra && extra.status ? extra.status : input && input.resultCode,
    reasonCode: extra && extra.reasonCode ? extra.reasonCode : input && input.reason,
    failedStage: extra && extra.failedStage,
    retry: extra && extra.retry === true,
    instanceId: extra && extra.instanceId,
  });
}

async function markAdapterLifecycle(adapter, db, application, status, extra) {
  if (!adapter || typeof adapter.markLifecycle !== "function") return null;
  return adapter.markLifecycle(db, {
    application,
    status,
    ...(extra || {}),
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

  {
    const { rejectIfV7SchemaIncompatible } = require("../schema/v7RuntimeSchemaCompatibility");
    const blocked = await rejectIfV7SchemaIncompatible(db, env);
    if (blocked) {
      return fail(RESULT.INVALID, {
        error: "schema_mismatch",
        persistCode: "schema_mismatch",
        capability: blocked.capability,
        missing: blocked.missing,
        httpStatus: 503,
        canonicalLifecycle: null,
      });
    }
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
    // Stale review_required / submitted duplicates fall through to re-evaluate
    // decideReview so uniqueness/email holds can auto-provision after a policy fix.
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

  await markAdapterLifecycle(adapter, db, application, LIFECYCLE.PROVISIONING);

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
    if (provisioned && provisioned.reviewRequired) {
      if (typeof adapter.markReviewRequired === "function") {
        await adapter.markReviewRequired(db, {
          application,
          reason: provisioned.reason || reason,
          reasons: [reason],
        });
      }
      return ok(RESULT.REVIEW_REQUIRED, {
        reviewRequired: true,
        reason: provisioned.reason || reason,
        application: {
          ...application,
          status: LIFECYCLE.REVIEW_REQUIRED,
        },
        canonicalLifecycle: LIFECYCLE.REVIEW_REQUIRED,
        productCode,
        provision: provisioned,
        organizationId: provisioned.organizationId || null,
      });
    }
    await markAdapterLifecycle(adapter, db, application, LIFECYCLE.PROVISION_FAILED, {
      reason,
      organizationId: provisioned && provisioned.organizationId,
      failedStage:
        (provisioned &&
          (provisioned.failedStage ||
            provisioned.provisioningStage ||
            (provisioned.provisioned && provisioned.provisioned.provisioningStage))) ||
        null,
    });
    await maybeAudit(
      db,
      { ...input, productCode },
      application,
      provisioned && provisioned.organizationId,
      {
        actionKey: ACTION.PROVISIONING_FAILED,
        outcome: "failure",
        status: RESULT.PROVISION_FAILED,
        reasonCode: reason,
        failedStage: provisioned && provisioned.failedStage,
      }
    );
    return fail(RESULT.PROVISION_FAILED, {
      reviewRequired: false,
      reason,
      application: {
        ...application,
        status: LIFECYCLE.PROVISION_FAILED,
      },
      canonicalLifecycle: LIFECYCLE.PROVISION_FAILED,
      productCode,
      provision: provisioned,
      organizationId: (provisioned && provisioned.organizationId) || null,
      identityId: (provisioned && provisioned.identityId) || null,
    });
  }

  const website = await initializeOrganizationWebsite(db, {
    adapter,
    productCode,
    organizationId: provisioned.organizationId,
    application,
    provision: provisioned,
    env,
  });
  if (!website || website.ok === false) {
    await markAdapterLifecycle(adapter, db, application, LIFECYCLE.PROVISION_FAILED, {
      reason: REVIEW_REASON.PROVISION_FAILURE,
      organizationId: provisioned.organizationId,
      website,
      failedStage: "website_instance",
    });
    await maybeAudit(
      db,
      { ...input, productCode },
      application,
      provisioned.organizationId,
      {
        actionKey: ACTION.PROVISIONING_FAILED,
        outcome: "failure",
        status: RESULT.PROVISION_FAILED,
        reasonCode: "website_initialization_failed",
        failedStage: "website_instance",
        instanceId: website && website.instance && website.instance.id,
      }
    );
    return fail(RESULT.PROVISION_FAILED, {
      reason: "website_initialization_failed",
      application: {
        ...application,
        status: LIFECYCLE.PROVISION_FAILED,
      },
      canonicalLifecycle: LIFECYCLE.PROVISION_FAILED,
      productCode,
      provision: provisioned,
      website,
      organizationId: provisioned.organizationId || null,
      identityId: provisioned.identityId || null,
    });
  }

  await markAdapterLifecycle(adapter, db, application, LIFECYCLE.ACTIVE, {
    organizationId: provisioned.organizationId,
    website,
  });

  await maybeAudit(
    db,
    {
      ...input,
      productCode,
      resultCode: RESULT.ACTIVE,
    },
    application,
    provisioned.organizationId,
    {
      actionKey: ACTION.PROVISIONING_COMPLETED,
      status: RESULT.ACTIVE,
      instanceId: website && website.instance && website.instance.id,
    }
  );

  return ok(RESULT.ACTIVE, {
    reviewRequired: false,
    application: provisioned.application || application,
    canonicalLifecycle: LIFECYCLE.ACTIVE,
    productCode,
    organizationId: provisioned.organizationId || null,
    identityId: provisioned.identityId || null,
    website,
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
    const website = await initializeOrganizationWebsite(db, {
      adapter,
      productCode: adapter.productCode,
      organizationId: approved.organizationId,
      application: approved.application || { id: input.applicationId },
      provision: approved,
      env: input.env,
    });
    if (!website || website.ok === false) {
      await markAdapterLifecycle(
        adapter,
        db,
        approved.application || { id: input.applicationId },
        LIFECYCLE.PROVISION_FAILED,
        {
          reason: REVIEW_REASON.PROVISION_FAILURE,
          organizationId: approved.organizationId,
          website,
          failedStage: "website_instance",
        }
      );
      await maybeAudit(
        db,
        { ...input, productCode: adapter.productCode },
        approved.application || { id: input.applicationId },
        approved.organizationId,
        {
          actionKey: ACTION.PROVISIONING_FAILED,
          outcome: "failure",
          status: RESULT.PROVISION_FAILED,
          reasonCode: "website_initialization_failed",
          failedStage: "website_instance",
          instanceId: website && website.instance && website.instance.id,
        }
      );
      return fail(RESULT.PROVISION_FAILED, {
        reason: "website_initialization_failed",
        organizationId: approved.organizationId,
        provision: approved,
        website,
      });
    }
    await markAdapterLifecycle(adapter, db, approved.application || { id: input.applicationId }, LIFECYCLE.ACTIVE, {
      organizationId: approved.organizationId,
      website,
    });
    await maybeAudit(
      db,
      { ...input, productCode: adapter.productCode, resultCode: RESULT.ACTIVE },
      approved.application || { id: input.applicationId },
      approved.organizationId,
      {
        actionKey: ACTION.PROVISIONING_COMPLETED,
        status: RESULT.ACTIVE,
        instanceId: website && website.instance && website.instance.id,
      }
    );
    return ok(RESULT.ACTIVE, {
      canonicalLifecycle: LIFECYCLE.ACTIVE,
      organizationId: approved.organizationId,
      provision: approved,
      website,
    });
  }
  return fail(RESULT.INVALID, { error: "unsupported_review_action" });
}

module.exports = {
  submitPlatformRegistration,
  resolvePlatformRegistrationReview,
};
