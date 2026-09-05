"use strict";

const { PRODUCT, REVIEW_REASON, LIFECYCLE } = require("../../platform/registration/constants");
const {
  validateClinicRegistrationInput,
  createClinicRegistrationApplication,
  findSoftTwinClinicRegistrationApplication,
} = require("../services/activeClinicPublicOnboardingService");
const {
  approveAndProvisionClinicRegistration,
  rejectClinicRegistration,
} = require("../services/approveClinicRegistrationService");
const {
  resolveClinicRegistrationIdentityCollision,
} = require("../services/clinicRegistrationIdentityCollisionService");
const {
  ACTION: IDENTITY_ACTION,
  resolveActiveClinicRegistrationAdministrator,
} = require("../services/resolveActiveClinicRegistrationAdministrator");
const { appendReviewEvent } = require("../services/clinicRegistrationReviewService");
const { ensureDefaultDepartments } = require("../services/activeClinicDepartmentService");
const { CODE_ACTIVECLINIC_ORG_V6 } = require("../../platform/config/deploymentProfiles");
const {
  ACTIVECLINIC_TEMPLATE_ID,
  ACTIVECLINIC_TEMPLATE_VERSION,
  registerActiveClinicWebsiteTemplate,
} = require("../website/activeClinicWebsiteTemplate");
const { starterOverrides } = require("../website/provisionActiveClinicWebsite");
const { FACILITY_TYPES } = require("../services/facilityService");

const productCode = PRODUCT.ACTIVECLINIC;

function administratorPasswordFrom(input) {
  const normalized = (input && input.normalized) || {};
  const payload = (input && input.payload) || {};
  return (
    normalized.password ||
    payload.password ||
    payload.administratorPassword ||
    payload.administrator_password ||
    null
  );
}

async function validate(payload) {
  const result = validateClinicRegistrationInput(payload || {}, { requireTermsAcceptance: true });
  if (!result.ok) {
    return { ok: false, errors: result.errors || {}, code: result.code };
  }
  return { ok: true, normalized: { ...result.normalized, password: result.password }, data: result.normalized };
}

/**
 * Do not hard-block on contact alone. Soft twins are returned from persistSubmitted
 * so the orchestrator can re-enter provisioning (same-clinic retry).
 */
async function findDuplicate() {
  return { block: false };
}

async function persistSubmitted(db, input) {
  const normalized = input.normalized || {};
  const password = administratorPasswordFrom(input);

  const softTwin = await findSoftTwinClinicRegistrationApplication(db, {
    clinicName: normalized.clinicName || (input.payload && input.payload.clinicName),
    contactEmail: normalized.contactEmail || null,
    contactPhone: normalized.contactPhone || null,
  });
  if (softTwin) {
    return {
      ok: true,
      duplicate: true,
      application: {
        id: softTwin.id,
        applicationNumber: softTwin.application_number,
        application_number: softTwin.application_number,
        status: softTwin.status,
        organization_id: softTwin.organization_id,
        organizationId: softTwin.organization_id,
        provisioning_status: softTwin.provisioning_status,
        clinic_name: softTwin.clinic_name,
        contact_email: softTwin.contact_email_normalized,
        contactEmail: softTwin.contact_email_normalized,
        contact_phone: softTwin.contact_phone_normalized,
        contactPhone: softTwin.contact_phone_normalized,
        clinic_admin_staff_id: softTwin.clinic_admin_staff_id,
        createdAt: softTwin.created_at,
        created_at: softTwin.created_at,
      },
    };
  }

  const preResolve = await resolveActiveClinicRegistrationAdministrator(db, {
    email: normalized.contactEmail || null,
    phoneNormalized: normalized.contactPhone || null,
    clinicName: normalized.clinicName || (input.payload && input.payload.clinicName) || null,
    administratorPassword: password,
    actorKind: "public_self_registration",
  });
  if (preResolve.action === IDENTITY_ACTION.REJECT_IDENTITY_CONFLICT) {
    return {
      ok: false,
      code: "identity_conflict",
      error: "Email and phone belong to different accounts.",
      field: "contactEmail",
      errors: {
        contactEmail: "Email and phone belong to different accounts.",
        contactPhone: "Email and phone belong to different accounts.",
      },
    };
  }
  if (
    preResolve.action === IDENTITY_ACTION.REJECT_EXISTING_ACCOUNT &&
    (preResolve.reason === "existing_account_password_mismatch" ||
      preResolve.reason === "existing_account_requires_sign_in")
  ) {
    return {
      ok: false,
      code: preResolve.reason,
      error:
        preResolve.reason === "existing_account_password_mismatch"
          ? "That password does not match the existing account."
          : "An account already exists for this contact. Sign in with your existing password.",
      field: "password",
      errors: {
        password:
          preResolve.reason === "existing_account_password_mismatch"
            ? "That password does not match the existing account."
            : "An account already exists for this contact. Sign in with your existing password.",
      },
    };
  }

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
  return {
    ok: true,
    duplicate: created.duplicate === true,
    application: {
      ...created.application,
      clinic_name:
        created.application.clinic_name ||
        (input.normalized && input.normalized.clinicName) ||
        (input.payload && input.payload.clinicName),
      contact_email: (input.normalized && input.normalized.contactEmail) || null,
      contactEmail: (input.normalized && input.normalized.contactEmail) || null,
      contact_phone: (input.normalized && input.normalized.contactPhone) || null,
      contactPhone: (input.normalized && input.normalized.contactPhone) || null,
      contact_phone_display: (input.normalized && input.normalized.contactPhoneDisplay) || null,
      contactPhoneDisplay: (input.normalized && input.normalized.contactPhoneDisplay) || null,
      address: (input.normalized && input.normalized.address) || (input.payload && input.payload.address) || null,
    },
  };
}

async function collectReviewSignals(db, input) {
  const app = input.application;
  const row = await db.query(
    `SELECT * FROM activeclinic.clinic_registration_applications WHERE id = $1`,
    [app.id]
  );
  const full = row.rows[0] || app;
  const password = administratorPasswordFrom(input);
  const resolved = await resolveActiveClinicRegistrationAdministrator(db, {
    email: full.contact_email_normalized,
    phoneNormalized: full.contact_phone_normalized,
    clinicName: full.clinic_name,
    applicationOrganizationId: full.organization_id,
    administratorPassword: password,
    actorKind: "public_self_registration",
  });

  if (
    resolved.action === IDENTITY_ACTION.REJECT_IDENTITY_CONFLICT ||
    resolved.action === IDENTITY_ACTION.REJECT_SUSPENDED
  ) {
    return {
      identityCollision: true,
      identityCollisionReason: REVIEW_REASON.IDENTITY_COLLISION,
      plan: null,
      identityResolution: resolved,
    };
  }

  if (
    resolved.action === IDENTITY_ACTION.REJECT_EXISTING_ACCOUNT &&
    resolved.requiresSecondClinicAcknowledgement &&
    !password
  ) {
    const collision = await resolveClinicRegistrationIdentityCollision(db, full);
    return {
      identityCollision: Boolean(collision && collision.existingIdentity),
      identityCollisionReason: REVIEW_REASON.EXISTING_IDENTITY_ACK_REQUIRED,
      plan: null,
      identityResolution: resolved,
    };
  }

  return {
    identityCollision: false,
    identityCollisionReason: null,
    plan: null,
    identityResolution: resolved,
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
        AND status IN ('submitted', 'pending_review', 'review_required', 'provisioning')`,
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
  await appendReviewEvent(db, {
    applicationId: input.application.id,
    eventType: "review_required",
    body: String(input.reason || "review_required").slice(0, 200),
    actorId: null,
    visibility: "history",
    deliveryStatus: "not_applicable",
  });
  return { ok: true };
}

async function provision(db, input) {
  const requestedType = String(
    (input.normalized && input.normalized.clinicType) ||
      (input.payload && (input.payload.clinicType || input.payload.facilityType)) ||
      "clinic"
  ).trim();
  const facilityType = FACILITY_TYPES.includes(requestedType) ? requestedType : "clinic";
  const provisioned = await approveAndProvisionClinicRegistration(db, {
    applicationId: input.application.id,
    actorIdentityId: null,
    dataEnvironment: input.dataEnvironment || "testing",
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    env: input.env,
    actorKind: (input.actor && input.actor.kind) || "public_self_registration",
    facilityType,
    administratorPassword: administratorPasswordFrom(input),
    acknowledgeExistingIdentity: Boolean(
      (input.payload && input.payload.acknowledgeExistingIdentity) ||
        (input.normalized && input.normalized.acknowledgeExistingIdentity)
    ),
  });
  if (
    !provisioned.ok &&
    (provisioned.code === "existing_identity_acknowledgement_required" ||
      provisioned.code === "existing_account_requires_sign_in" ||
      provisioned.code === "existing_account_password_mismatch")
  ) {
    return {
      ok: false,
      reviewRequired: provisioned.code === "existing_identity_acknowledgement_required",
      reason:
        provisioned.code === "existing_identity_acknowledgement_required"
          ? REVIEW_REASON.EXISTING_IDENTITY_ACK_REQUIRED
          : REVIEW_REASON.IDENTITY_COLLISION,
      code: provisioned.code,
      errors: provisioned.errors || {},
    };
  }
  if (!provisioned.ok && provisioned.code === "identity_conflict") {
    return {
      ok: false,
      reviewRequired: false,
      reason: REVIEW_REASON.IDENTITY_COLLISION,
      code: provisioned.code,
      errors: { contact: "Email and phone belong to different accounts." },
    };
  }
  if (!provisioned.ok) {
    return {
      ok: false,
      reviewRequired: false,
      reason: provisioned.code || REVIEW_REASON.PROVISION_FAILURE,
      code: provisioned.code,
      organizationId: provisioned.organizationId || null,
      failedStage: provisioned.failedStage || null,
    };
  }
  if (provisioned.facility && provisioned.healthcareOrganization && provisioned.organizationId) {
    await ensureDefaultDepartments(db, {
      organizationId: provisioned.organizationId,
      healthcareOrganizationId: provisioned.healthcareOrganization.id,
      facilityId: provisioned.facility.id,
    });
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
    failedStage: provisioned.failedStage || null,
    alreadyProvisioned: provisioned.alreadyProvisioned === true,
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

async function markLifecycle(db, input) {
  if (!input.application || !input.application.id) return { ok: false };
  const status = String(input.status || "");
  if (status === LIFECYCLE.PROVISIONING) {
    await db.query(
      `UPDATE activeclinic.clinic_registration_applications
          SET status = 'provisioning',
              provisioning_status = 'in_progress',
              updated_at = now()
        WHERE id = $1
          AND status IN ('submitted', 'pending_review', 'review_required', 'provisioning')`,
      [input.application.id]
    );
    return { ok: true };
  }
  if (status === LIFECYCLE.ACTIVE) {
    const websiteId = input.website && input.website.instance && input.website.instance.id;
    await db.query(
      `UPDATE activeclinic.clinic_registration_applications
          SET status = 'active',
              provisioning_status = 'provisioned',
              website_instance_id = COALESCE($2, website_instance_id),
              last_provision_error = NULL,
              last_provision_stage = NULL,
              updated_at = now()
        WHERE id = $1
          AND status IN ('submitted', 'pending_review', 'review_required', 'provisioning', 'approved', 'active', 'provision_failed')`,
      [input.application.id, websiteId || null]
    );
    return { ok: true };
  }
  if (status === LIFECYCLE.PROVISION_FAILED) {
    await db.query(
      `UPDATE activeclinic.clinic_registration_applications
          SET status = 'provision_failed',
              provisioning_status = CASE
                WHEN provisioning_status = 'website_pending' THEN provisioning_status
                WHEN $4::text IN ('website_instance', 'template_content') THEN 'website_pending'
                ELSE 'failed'
              END,
              last_provision_error = $2,
              last_provision_stage = COALESCE($4, last_provision_stage),
              organization_id = COALESCE(organization_id, $3),
              updated_at = now()
        WHERE id = $1`,
      [
        input.application.id,
        String(input.reason || "provision_failed").slice(0, 500),
        input.organizationId || null,
        input.failedStage || null,
      ]
    );
    return { ok: true };
  }
  return { ok: false };
}

async function websiteDefaults(input) {
  registerActiveClinicWebsiteTemplate();
  const provision = input.provision || {};
  const application = input.application || {};
  const slug =
    provision.slug ||
    (provision.provisioned && provision.provisioned.slug) ||
    null;
  const publicName =
    application.clinic_name ||
    application.clinicName ||
    (provision.healthcareOrganization && provision.healthcareOrganization.publicName) ||
    "Clinic";
  if (!slug) {
    return { skip: true, reason: "slug_unavailable" };
  }
  return {
    templateId: ACTIVECLINIC_TEMPLATE_ID,
    templateVersion: ACTIVECLINIC_TEMPLATE_VERSION,
    slug,
    status: "coming_soon",
    scopeKind: "clinic",
    scopeRef: null,
    contentOverrides: starterOverrides(publicName, {
      phone:
        application.contact_phone_display ||
        application.contactPhoneDisplay ||
        application.contact_phone ||
        application.contactPhone ||
        "",
      email: application.contact_email || application.contactEmail || "",
      address: application.address || "",
    }),
  };
}

async function seedTemplateContent() {
  return { ok: true, skipped: true, reason: "seeded_via_contentOverrides" };
}

async function approve(db, input) {
  return approveAndProvisionClinicRegistration(db, {
    applicationId: input.applicationId,
    actorIdentityId: input.actorIdentityId || null,
    dataEnvironment: input.dataEnvironment || "testing",
    deploymentCode: input.deploymentCode,
    env: input.env,
    acknowledgeExistingIdentity: input.acknowledgeExistingIdentity,
    actorKind: "platform_admin",
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
  websiteDefaults,
  seedTemplateContent,
  markLifecycle,
  approve,
  reject,
};
