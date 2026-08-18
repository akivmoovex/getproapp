"use strict";

const { PRODUCT, REVIEW_REASON } = require("../../platform/registration/constants");
const {
  validateClinicRegistrationInput,
  createClinicRegistrationApplication,
} = require("../services/activeClinicPublicOnboardingService");
const {
  approveAndProvisionClinicRegistration,
  rejectClinicRegistration,
} = require("../services/approveClinicRegistrationService");
const {
  resolveClinicRegistrationIdentityCollision,
} = require("../services/clinicRegistrationIdentityCollisionService");
const { appendReviewEvent } = require("../services/clinicRegistrationReviewService");
const instanceRepo = require("../../platform/website/instanceRepository");
const { CODE_ACTIVECLINIC_ORG_V6 } = require("../../platform/config/deploymentProfiles");

const productCode = PRODUCT.ACTIVECLINIC;

async function validate(payload) {
  const result = validateClinicRegistrationInput(payload || {});
  if (!result.ok) {
    return { ok: false, errors: result.errors || {}, code: result.code };
  }
  return { ok: true, normalized: { ...result.normalized, password: result.password }, data: result.normalized };
}

async function findDuplicate(db, normalized) {
  const email = normalized && normalized.contactEmail;
  const phone = normalized && normalized.contactPhone;
  if (!email && !phone) return { block: false };
  const rows = await db.query(
    `SELECT id, application_number, status, organization_id, provisioning_status
       FROM activeclinic.clinic_registration_applications
      WHERE created_at > now() - interval '30 days'
        AND status NOT IN ('rejected', 'withdrawn')
        AND (
          contact_email_normalized = $1
          OR contact_phone_normalized = $2
        )
      ORDER BY created_at DESC
      LIMIT 1`,
    [email || null, phone || null]
  );
  if (!rows.rows[0]) return { block: false };
  return { block: true, application: rows.rows[0] };
}

async function persistSubmitted(db, input) {
  const created = await createClinicRegistrationApplication(db, {
    ...(input.payload || {}),
    ...(input.normalized || {}),
  });
  if (!created.ok) {
    return {
      ok: false,
      code: created.code === "duplicate_application" ? "duplicate" : created.code,
      errors: created.errors || {},
      application: created.application || null,
    };
  }
  return { ok: true, application: created.application };
}

async function collectReviewSignals(db, input) {
  const app = input.application;
  const row = await db.query(
    `SELECT * FROM activeclinic.clinic_registration_applications WHERE id = $1`,
    [app.id]
  );
  const full = row.rows[0] || app;
  const collision = await resolveClinicRegistrationIdentityCollision(db, full);
  const identityCollision = Boolean(collision && collision.existingIdentity);
  let identityCollisionReason = null;
  if (identityCollision) {
    identityCollisionReason =
      collision.requiresSecondClinicAcknowledgement || collision.existingActiveClinicIdentity
        ? REVIEW_REASON.IDENTITY_COLLISION
        : REVIEW_REASON.IDENTITY_COLLISION;
  }
  return {
    identityCollision,
    identityCollisionReason,
    plan: null,
  };
}

async function markReviewRequiredAdapter(db, input) {
  if (!input.application || !input.application.id) return { ok: false };
  await db.query(
    `UPDATE activeclinic.clinic_registration_applications
        SET status = 'review_required',
            last_provision_error = $2,
            updated_at = now()
      WHERE id = $1
        AND status IN ('pending_review', 'review_required')`,
    [input.application.id, String(input.reason || "review_required").slice(0, 500)]
  );
  await appendReviewEvent(db, {
    applicationId: input.application.id,
    eventType: "review_started",
    body: String(input.reason || "Exceptional review required before activation.").slice(0, 500),
    actorId: null,
    visibility: "history",
    deliveryStatus: "not_applicable",
  });
  return { ok: true };
}

async function provision(db, input) {
  const provisioned = await approveAndProvisionClinicRegistration(db, {
    applicationId: input.application.id,
    actorIdentityId: null,
    dataEnvironment: input.dataEnvironment || "testing",
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    env: input.env,
    actorKind: (input.actor && input.actor.kind) || "public_self_registration",
  });
  if (
    !provisioned.ok &&
    provisioned.code === "existing_identity_acknowledgement_required"
  ) {
    return {
      ok: false,
      reviewRequired: true,
      reason: REVIEW_REASON.EXISTING_IDENTITY_ACK_REQUIRED,
      code: provisioned.code,
    };
  }
  if (!provisioned.ok) {
    return {
      ok: false,
      reviewRequired: true,
      reason: provisioned.code || REVIEW_REASON.PROVISION_FAILURE,
      code: provisioned.code,
    };
  }
  const refreshed = await db.query(
    `SELECT id, application_number, status, provisioning_status, organization_id, created_at
       FROM activeclinic.clinic_registration_applications
      WHERE id = $1`,
    [input.application.id]
  );
  const latest = refreshed.rows[0] || input.application;
  return {
    ok: true,
    organizationId: provisioned.organizationId || latest.organization_id,
    identityId: provisioned.identityId,
    staffMemberId: provisioned.staffMemberId,
    slug: provisioned.slug,
    facility: provisioned.facility,
    healthcareOrganization: provisioned.healthcareOrganization,
    application: {
      id: latest.id,
      applicationNumber: latest.application_number,
      status: latest.status,
      provisioningStatus: latest.provisioning_status,
      organizationId: latest.organization_id,
      createdAt: latest.created_at,
    },
    provisioned,
  };
}

async function ensureWebsite(db, input) {
  const organizationId = input.organizationId;
  if (!organizationId) return { ok: true, skipped: true };
  const existing = await instanceRepo.findWebsiteInstanceByOrgProduct(db, {
    organizationId,
    productCode,
  });
  return { ok: true, existed: Boolean(existing), instance: existing || null };
}

async function approve(db, input) {
  return approveAndProvisionClinicRegistration(db, {
    applicationId: input.applicationId,
    actorIdentityId: input.actorIdentityId || null,
    dataEnvironment: input.dataEnvironment || "testing",
    deploymentCode: input.deploymentCode,
    env: input.env,
    acknowledgeExistingIdentity: input.acknowledgeExistingIdentity,
  });
}

async function reject(db, input) {
  return rejectClinicRegistration(db, {
    applicationId: input.applicationId,
    rejectionReason: input.rejectionReason || input.reason,
    actorIdentityId: input.actorIdentityId || null,
  });
}

module.exports = {
  productCode,
  validate,
  findDuplicate,
  persistSubmitted,
  collectReviewSignals,
  markReviewRequired: markReviewRequiredAdapter,
  provision,
  ensureWebsite,
  approve,
  reject,
};
