"use strict";

const { PRODUCT, REVIEW_REASON, LIFECYCLE } = require("../../platform/registration/constants");
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
const { ensureDefaultDepartments } = require("../services/activeClinicDepartmentService");
const { CODE_ACTIVECLINIC_ORG_V6 } = require("../../platform/config/deploymentProfiles");
const {
  ACTIVECLINIC_TEMPLATE_ID,
  ACTIVECLINIC_TEMPLATE_VERSION,
  registerActiveClinicWebsiteTemplate,
} = require("../website/activeClinicWebsiteTemplate");
const { starterOverrides } = require("../website/provisionActiveClinicWebsite");

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
  return { ok: true, application: {
    ...created.application,
    clinic_name: created.application.clinic_name || (input.normalized && input.normalized.clinicName) || (input.payload && input.payload.clinicName),
    contact_email: (input.normalized && input.normalized.contactEmail) || null,
    contactEmail: (input.normalized && input.normalized.contactEmail) || null,
    contact_phone: (input.normalized && input.normalized.contactPhone) || null,
    contactPhone: (input.normalized && input.normalized.contactPhone) || null,
    contact_phone_display: (input.normalized && input.normalized.contactPhoneDisplay) || null,
    contactPhoneDisplay: (input.normalized && input.normalized.contactPhoneDisplay) || null,
    address: (input.normalized && input.normalized.address) || (input.payload && input.payload.address) || null,
  } };
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
      reviewRequired: false,
      reason: provisioned.code || REVIEW_REASON.PROVISION_FAILURE,
      code: provisioned.code,
      organizationId: provisioned.organizationId || null,
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
                ELSE 'failed'
              END,
              last_provision_error = $2,
              organization_id = COALESCE(organization_id, $3),
              updated_at = now()
        WHERE id = $1`,
      [
        input.application.id,
        String(input.reason || "provision_failed").slice(0, 500),
        input.organizationId || null,
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
