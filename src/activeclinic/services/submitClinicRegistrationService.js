"use strict";

/**
 * Public clinic registration entry. Lifecycle, review policy, and provisioning
 * orchestration live in the shared platform registration engine.
 */

const { appendReviewEvent } = require("./clinicRegistrationReviewService");
const {
  PRODUCT,
  RESULT: ENGINE_RESULT,
  submitProductRegistration,
} = require("../../platform/registration");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  DUPLICATE: "duplicate_application",
  REVIEW_REQUIRED: "review_required",
  PROVISION_FAILED: "provision_failed",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function markReviewRequired(db, applicationId, reason, actorIdentityId) {
  await db.query(
    `UPDATE activeclinic.clinic_registration_applications
        SET status = 'review_required',
            last_provision_error = $2,
            updated_at = now()
      WHERE id = $1
        AND status IN ('submitted', 'pending_review', 'review_required', 'provisioning')`,
    [applicationId, String(reason || "review_required").slice(0, 500)]
  );
  await appendReviewEvent(db, {
    applicationId,
    eventType: "review_started",
    body: String(reason || "Exceptional review required before activation.").slice(0, 500),
    actorId: actorIdentityId || null,
    visibility: "history",
    deliveryStatus: "not_applicable",
  });
}

/**
 * Insert the application, then auto-provision unless exceptional review is required.
 *
 * @param {{ query: Function, connect?: Function }} db
 * @param {object} input public form fields plus { deploymentCode, dataEnvironment, env }
 */
async function submitAndProvisionClinicRegistration(db, input) {
  const result = await submitProductRegistration(db, {
    productCode: PRODUCT.ACTIVECLINIC,
    payload: input || {},
    env: (input && input.env) || {},
    deploymentCode: input && input.deploymentCode,
    dataEnvironment: input && input.dataEnvironment,
    actor: { kind: "public_self_registration" },
  });

  if (result.code === ENGINE_RESULT.DUPLICATE) {
    return {
      ok: false,
      code: RESULT.DUPLICATE,
      engine: result.engine,
      errors: {},
      application: result.application || null,
    };
  }
  if (result.code === ENGINE_RESULT.INVALID) {
    return {
      ok: false,
      code: RESULT.INVALID_INPUT,
      engine: result.engine,
      errors: result.errors || {},
      error: result.error || null,
      application: result.application || null,
    };
  }
  if (result.code === ENGINE_RESULT.REVIEW_REQUIRED) {
    return {
      ok: true,
      code: RESULT.REVIEW_REQUIRED,
      engine: result.engine,
      reviewRequired: true,
      reason: result.reason || RESULT.REVIEW_REQUIRED,
      application: result.application,
      canonicalLifecycle: result.canonicalLifecycle,
    };
  }
  if (result.code === ENGINE_RESULT.PROVISION_FAILED) {
    return {
      ok: true,
      code: RESULT.REVIEW_REQUIRED,
      engine: result.engine,
      reviewRequired: true,
      reason: result.reason || RESULT.PROVISION_FAILED,
      application: result.application,
      provision: result.provision,
    };
  }
  if (result.code !== ENGINE_RESULT.ACTIVE) {
    return {
      ok: false,
      code: RESULT.PROVISION_FAILED,
      engine: result.engine,
      application: result.application || null,
    };
  }

  const provisioned = result.provision || {};
  const application = result.application || {};
  return {
    ok: true,
    code: RESULT.OK,
    engine: result.engine,
    reviewRequired: false,
    application: {
      id: application.id,
      applicationNumber: application.applicationNumber || application.application_number,
      status: application.status || "active",
      provisioningStatus: application.provisioningStatus || application.provisioning_status,
      organizationId: result.organizationId || application.organization_id || application.organizationId,
      createdAt: application.createdAt || application.created_at,
    },
    organizationId: result.organizationId || provisioned.organizationId || null,
    identityId: result.identityId || provisioned.identityId || null,
    staffMemberId: provisioned.staffMemberId || null,
    slug: provisioned.slug || null,
    facility: provisioned.facility || null,
    healthcareOrganization: provisioned.healthcareOrganization || null,
    canonicalLifecycle: result.canonicalLifecycle,
    onboarding: result.onboarding || null,
  };
}

function isReviewHoldStatus(status) {
  const value = String(status || "");
  return value === "pending_review" || value === "review_required" || value === "submitted";
}

module.exports = {
  RESULT,
  UUID_RE,
  submitAndProvisionClinicRegistration,
  markReviewRequired,
  isReviewHoldStatus,
};
