"use strict";

/**
 * Approve a public clinic registration and provision the canonical clinic+website.
 * Idempotent. Website failure leaves core clinic intact (website_pending).
 */

const { withProvisioningTransaction } = require("../../platform/db/provisioningTransaction");
const { provisionPlatformTenant } = require("../../platform/services/provisionPlatformTenant");
const {
  createPlatformIdentity,
} = require("../../platform/services/platformIdentityService");
const {
  updateIdentityPasswordHash,
} = require("../../platform/repositories/platformIdentityRepository");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const { createStaffMember } = require("./activeClinicStaffService");
const staffMemberRepo = require("../repositories/staffMemberRepository");
const { assignStaffToFacility } = require("./activeClinicStaffFacilityService");
const {
  assignStaffRole,
  ORGANIZATION_ADMIN,
} = require("./activeClinicAuthorizationService");
const {
  provisionActiveClinicClinic,
} = require("../website/provisionActiveClinicWebsite");
const { ensureDefaultDepartments } = require("./activeClinicDepartmentService");
const instanceRepo = require("../../platform/website/instanceRepository");
const { recordWebsiteAudit } = require("../../platform/website/auditService");
const { appendReviewEvent, updateReviewEventDelivery } = require("./clinicRegistrationReviewService");
const {
  resolveClinicRegistrationIdentityCollision,
} = require("./clinicRegistrationIdentityCollisionService");
const {
  TEMPLATE,
  sendActiveClinicEmail,
} = require("./activeClinicEmailDelivery");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "application_not_found",
  NOT_ELIGIBLE: "application_not_eligible",
  ALREADY_PROVISIONED: "already_provisioned",
  ALREADY_REJECTED: "already_rejected",
  REJECTION_REASON_REQUIRED: "rejection_reason_required",
  TENANT_FAILED: "tenant_provision_failed",
  CLINIC_FAILED: "clinic_provision_failed",
  ADMIN_FAILED: "clinic_admin_failed",
  WEBSITE_PENDING: "website_pending",
  EXISTING_IDENTITY_ACK_REQUIRED: "existing_identity_acknowledgement_required",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function slugFromClinicName(name, applicationNumber) {
  const base = String(name || "clinic")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = String(applicationNumber || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(-6);
  const slug = `${base || "clinic"}${suffix ? `-${suffix}` : ""}`.slice(0, 64);
  return slug.replace(/^[^a-z0-9]+/, "c") || "clinic";
}

function splitName(contactName) {
  const parts = String(contactName || "Clinic Admin").trim().split(/\s+/);
  const firstName = parts[0] || "Clinic";
  const lastName = parts.slice(1).join(" ") || "Admin";
  return { firstName, lastName };
}

/**
 * staff_role_assignments.assigned_by_platform_identity_id FKs to platform.identities.
 * Platform Admin is typically a BlessBoard user, so actorIdentityId must not be
 * written there unless it is actually a platform identity.
 */
async function platformIdentityIdOrNull(client, candidateId) {
  const id = String(candidateId || "").trim();
  if (!UUID_RE.test(id)) return null;
  const found = await client.query(
    `SELECT id FROM platform.identities WHERE id = $1 LIMIT 1`,
    [id]
  );
  return found.rows[0] ? found.rows[0].id : null;
}

async function loadApplication(client, applicationId) {
  const rows = await client.query(
    `SELECT * FROM activeclinic.clinic_registration_applications WHERE id = $1 FOR UPDATE`,
    [applicationId]
  );
  return rows.rows[0] || null;
}

async function updateApplication(client, id, patch) {
  const fields = [];
  const values = [];
  for (const [key, value] of Object.entries(patch)) {
    values.push(value);
    fields.push(`${key} = $${values.length}`);
  }
  values.push(id);
  await client.query(
    `UPDATE activeclinic.clinic_registration_applications
        SET ${fields.join(", ")}, updated_at = now()
      WHERE id = $${values.length}`,
    values
  );
}

async function readyEmailAlreadyAccepted(client, applicationId) {
  const result = await client.query(
    `SELECT 1 FROM activeclinic.clinic_registration_review_events
      WHERE application_id = $1
        AND event_type = 'approval'
        AND delivery_status IN ('queued', 'sent')
      LIMIT 1`,
    [applicationId]
  );
  return Boolean(result.rows[0]);
}

async function markLatestApprovalDelivery(client, applicationId, deliveryStatus) {
  const latest = await client.query(
    `SELECT id FROM activeclinic.clinic_registration_review_events
      WHERE application_id = $1 AND event_type = 'approval'
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [applicationId]
  );
  if (!latest.rows[0]) return;
  await updateReviewEventDelivery(client, latest.rows[0].id, deliveryStatus);
}

async function maybeSendReadyToSignInEmail(client, input) {
  const app = input.application;
  if (!app || (String(app.status) !== "approved" && String(app.status) !== "active")) {
    return { skipped: true };
  }
  const provisioning = String(app.provisioning_status || "");
  if (provisioning !== "provisioned" && provisioning !== "website_pending") {
    return { skipped: true };
  }
  if (!input.loginEligible) return { skipped: true };
  if (await readyEmailAlreadyAccepted(client, app.id)) {
    return { skipped: true, duplicate: true };
  }
  const result = await sendActiveClinicEmail({
    env: input.env,
    adapter: input.emailAdapter,
    publicOrigin: input.publicOrigin,
    deploymentCode: input.deploymentCode,
    templateKey: TEMPLATE.READY_TO_SIGN_IN,
    recipient: app.contact_email_normalized,
    idempotencyKey: `ready_to_sign_in:${app.id}`,
    fields: {
      clinicName: app.clinic_name,
      applicationNumber: app.application_number,
    },
  });
  await markLatestApprovalDelivery(client, app.id, result.reviewDeliveryStatus);
  return result;
}

async function ensureClinicAdmin(client, input) {
  if (input.existingStaffId) {
    return { ok: true, staffMemberId: input.existingStaffId, created: false, reusedIdentity: false };
  }
  let identityId = null;
  let reusedIdentity = false;
  const existing = await client.query(
    `SELECT id, password_hash FROM platform.identities
      WHERE email_normalized = $1
         OR ($2::text IS NOT NULL AND phone_normalized = $2)
      ORDER BY CASE WHEN email_normalized = $1 THEN 0 ELSE 1 END
      LIMIT 1`,
    [input.email, input.phone || null]
  );
  if (existing.rows[0]) {
    identityId = existing.rows[0].id;
    reusedIdentity = true;
    if (input.passwordHash && !existing.rows[0].password_hash) {
      await updateIdentityPasswordHash(client, {
        identityId,
        passwordHash: input.passwordHash,
        mustChangePassword: false,
      });
    }
  } else {
    const created = await createPlatformIdentity(client, {
      status: "active",
      primaryEmail: input.email,
      emailNormalized: input.email,
      emailVerifiedAt: new Date().toISOString(),
      primaryPhone: input.phone,
      phoneNormalized: input.phone,
      phoneVerifiedAt: new Date().toISOString(),
      passwordHash: input.passwordHash || null,
    });
    if (!created.ok) return { ok: false, code: created.code };
    identityId = created.identity.id;
  }
  const names = splitName(input.contactName);
  let staffMemberId = null;
  let createdStaff = false;
  const existingStaffId = String(input.existingStaffId || "").trim();
  if (UUID_RE.test(existingStaffId)) {
    const byId = await staffMemberRepo.findByIdAndOrganization(client, {
      id: existingStaffId,
      organizationId: input.organizationId,
    });
    if (byId) staffMemberId = byId.id;
  }
  if (!staffMemberId && identityId) {
    const byIdentity = await staffMemberRepo.findByIdentityAndOrganization(client, {
      platformIdentityId: identityId,
      organizationId: input.organizationId,
    });
    if (byIdentity) staffMemberId = byIdentity.id;
  }
  if (!staffMemberId) {
    const staff = await createStaffMember(client, {
      organizationId: input.organizationId,
      healthcareOrganizationId: input.healthcareOrganizationId,
      firstName: names.firstName,
      lastName: names.lastName,
      employmentType: "permanent",
      status: "active",
      phone: input.phone,
      platformIdentityId: identityId,
    });
    if (!staff.ok && staff.code === "duplicate_staff_identity" && identityId) {
      const again = await staffMemberRepo.findByIdentityAndOrganization(client, {
        platformIdentityId: identityId,
        organizationId: input.organizationId,
      });
      if (again) staffMemberId = again.id;
    } else if (!staff.ok) {
      return { ok: false, code: staff.code };
    } else {
      staffMemberId = staff.staffMember.id;
      createdStaff = true;
    }
  }
  if (!staffMemberId) return { ok: false, code: "clinic_admin_failed" };
  if (input.facilityId) {
    const assigned = await assignStaffToFacility(client, {
      organizationId: input.organizationId,
      staffMemberId,
      facilityId: input.facilityId,
      isPrimary: true,
    });
    if (
      !assigned.ok &&
      assigned.code !== "facility_assignment_exists" &&
      assigned.code !== "primary_facility_conflict"
    ) {
      return { ok: false, code: assigned.code };
    }
  }
  const role = await assignStaffRole(client, {
    organizationId: input.organizationId,
    staffMemberId,
    roleKey: ORGANIZATION_ADMIN,
    scopeType: "organisation",
    assignmentOrigin: "system",
    assignedByPlatformIdentityId: await platformIdentityIdOrNull(
      client,
      input.actorIdentityId
    ),
  });
  if (!role.ok && role.code !== "role_assignment_exists") {
    return { ok: false, code: role.code };
  }
  return { ok: true, staffMemberId, identityId, created: createdStaff, reusedIdentity };
}

async function approveAndProvisionClinicRegistration(db, input) {
  const applicationId = String((input && input.applicationId) || "").trim();
  if (!UUID_RE.test(applicationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const run = async (client) => {
    const app = await loadApplication(client, applicationId);
    if (!app) return { ok: false, code: RESULT.NOT_FOUND };

    if (
      (app.status === "approved" || app.status === "active") &&
      app.provisioning_status === "provisioned" &&
      app.organization_id
    ) {
      const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(client, {
        organizationId: app.organization_id,
        productCode: "activeclinic",
      });
      return {
        ok: true,
        code: RESULT.ALREADY_PROVISIONED,
        alreadyProvisioned: true,
        application: app,
        organizationId: app.organization_id,
        healthcareOrganizationId: app.healthcare_organization_id,
        facilityId: app.facility_id,
        instance,
        emailDelivery: await maybeSendReadyToSignInEmail(client, {
          application: app,
          loginEligible: Boolean(app.clinic_admin_staff_id),
          env: input.env,
          emailAdapter: input.emailAdapter,
          publicOrigin: input.publicOrigin,
          deploymentCode: input.deploymentCode,
        }),
      };
    }

    if (app.status === "rejected" || app.status === "withdrawn") {
      return { ok: false, code: RESULT.NOT_ELIGIBLE, application: app };
    }

    const identityCollision = await resolveClinicRegistrationIdentityCollision(client, app);
    const acknowledged =
      input.acknowledgeExistingIdentity === true ||
      input.acknowledgeExistingIdentity === "1" ||
      input.acknowledgeExistingIdentity === "on";
    if (identityCollision.requiresSecondClinicAcknowledgement && !acknowledged) {
      return {
        ok: false,
        code: RESULT.EXISTING_IDENTITY_ACK_REQUIRED,
        application: app,
        identityCollision,
      };
    }

    await updateApplication(client, app.id, { provisioning_status: "in_progress" });
    await appendReviewEvent(client, {
      applicationId: app.id,
      eventType: "provisioning_started",
      actorId: input.actorIdentityId,
      visibility: "history",
      deliveryStatus: "not_applicable",
    });

    let organizationId = app.organization_id;
    let slug = null;
    if (!organizationId) {
      slug = slugFromClinicName(app.clinic_name, app.application_number);
      const tenant = await provisionPlatformTenant(client, {
        skipDomain: true,
        dataEnvironment: input.dataEnvironment || "testing",
        organizationKey: slug,
        displayName: app.clinic_name,
        productKey: "activeclinic",
        productTenantKey: slug,
        deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
      }, { manageTransaction: false });
      if (!tenant.ok || !tenant.records || !tenant.records.organization) {
        await updateApplication(client, app.id, {
          provisioning_status: "failed",
          last_provision_error: tenant.message || tenant.status || "tenant_failed",
        });
        await appendReviewEvent(client, {
          applicationId: app.id,
          eventType: "provisioning_failed",
          body: String(tenant.message || tenant.status || "tenant_failed").slice(0, 200),
          actorId: input.actorIdentityId,
          visibility: "history",
          deliveryStatus: "not_applicable",
        });
        return { ok: false, code: RESULT.TENANT_FAILED, reason: tenant.status };
      }
      organizationId = tenant.records.organization.id;
      slug = tenant.records.organization.organization_key || slug;
    } else {
      const org = await client.query(
        `SELECT organization_key FROM platform.organizations WHERE id = $1`,
        [organizationId]
      );
      slug = org.rows[0] && org.rows[0].organization_key;
    }

    const clinic = await provisionActiveClinicClinic(client, {
      organizationId,
      slug,
      publicName: app.clinic_name,
      countryCode: app.country_code || "ZM",
      timezone: "Africa/Lusaka",
      phone: app.contact_phone_normalized,
      email: app.contact_email_normalized,
      address: app.address,
      city: app.city,
      province: app.province,
      actorIdentityId: input.actorIdentityId || null,
      websiteStatus: "coming_soon",
      templateVersion: input.websiteTemplateVersion || undefined,
    });

    if (!clinic.ok && clinic.code !== "website_provision_failed") {
      await updateApplication(client, app.id, {
        organization_id: organizationId,
        provisioning_status: "failed",
        last_provision_error: clinic.code || "clinic_failed",
      });
      await appendReviewEvent(client, {
        applicationId: app.id,
        eventType: "provisioning_failed",
        body: String(clinic.code || "clinic_failed").slice(0, 200),
        actorId: input.actorIdentityId,
        visibility: "history",
        deliveryStatus: "not_applicable",
      });
      return { ok: false, code: RESULT.CLINIC_FAILED, reason: clinic.code, organizationId };
    }

    const hco = clinic.healthcareOrganization || null;
    const facility = clinic.facility || null;
    let instance = clinic.instance || null;
    if (!instance && organizationId) {
      instance = await instanceRepo.findWebsiteInstanceByOrgProduct(client, {
        organizationId,
        productCode: "activeclinic",
      });
    }

    let admin = { ok: true, staffMemberId: app.clinic_admin_staff_id, created: false, reusedIdentity: false };
    if (hco) {
      admin = await ensureClinicAdmin(client, {
        organizationId,
        healthcareOrganizationId: hco.id,
        facilityId: facility && facility.id,
        email: app.contact_email_normalized,
        phone: app.contact_phone_normalized,
        contactName: app.contact_name,
        actorIdentityId: input.actorIdentityId || null,
        existingStaffId: app.clinic_admin_staff_id,
        passwordHash: app.administrator_password_hash || null,
      });
      if (!admin.ok) {
        await updateApplication(client, app.id, {
          organization_id: organizationId,
          healthcare_organization_id: hco.id,
          facility_id: facility ? facility.id : app.facility_id,
          provisioning_status: "failed",
          last_provision_error: admin.code || "clinic_admin_failed",
        });
        await appendReviewEvent(client, {
          applicationId: app.id,
          eventType: "provisioning_failed",
          body: String(admin.code || "clinic_admin_failed").slice(0, 200),
          actorId: input.actorIdentityId,
          visibility: "history",
          deliveryStatus: "not_applicable",
        });
        return { ok: false, code: RESULT.ADMIN_FAILED, reason: admin.code, organizationId };
      }
      if (facility && facility.id) {
        await ensureDefaultDepartments(client, {
          organizationId,
          healthcareOrganizationId: hco.id,
          facilityId: facility.id,
        });
      }
    }

    const websiteOk = Boolean(instance);
    const provisioningStatus = websiteOk ? "provisioned" : "website_pending";
    await updateApplication(client, app.id, {
      status: "active",
      organization_id: organizationId,
      healthcare_organization_id: hco ? hco.id : app.healthcare_organization_id,
      facility_id: facility ? facility.id : app.facility_id,
      website_instance_id: instance ? instance.id : null,
      clinic_admin_staff_id: admin.ok ? admin.staffMemberId : app.clinic_admin_staff_id,
      provisioning_status: provisioningStatus,
      provisioned_at: websiteOk ? new Date().toISOString() : null,
      reviewed_at: new Date().toISOString(),
      reviewed_by_platform_identity_id: input.actorIdentityId || null,
      last_provision_error: websiteOk
        ? null
        : String(clinic.reason || clinic.code || "website_provision_failed").slice(0, 500),
      administrator_password_hash: null,
    });

    const approvalBody =
      admin.reusedIdentity && identityCollision.existingActiveClinicIdentity
        ? `Existing ActiveClinic identity linked as administrator of this additional clinic. Current memberships: ${
            identityCollision.existingOrganizations
              .map((org) => org.displayName || org.organizationKey)
              .join(", ") || "recorded"
          }. Password was not changed.`
        : admin.reusedIdentity
          ? "Existing platform identity reused as clinic administrator. Password was not changed."
          : null;
    await appendReviewEvent(client, {
      applicationId: app.id,
      eventType: "approval",
      body: approvalBody,
      actorId: input.actorIdentityId,
      visibility: "history",
      deliveryStatus: "not_applicable",
    });
    await appendReviewEvent(client, {
      applicationId: app.id,
      eventType: websiteOk ? "provisioning_succeeded" : "provisioning_failed",
      body: websiteOk
        ? null
        : String(clinic.reason || clinic.code || "website_provision_failed").slice(0, 200),
      actorId: input.actorIdentityId,
      visibility: "history",
      deliveryStatus: "not_applicable",
    });

    await recordAuditEventSafe(client, {
      deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
      organizationId,
      actorUserId: null,
      actionKey: "activeclinic.clinic_registration.approve",
      entityType: "clinic_registration_application",
      entityId: app.id,
      outcome: websiteOk ? "success" : "partial",
      metadataJson: {
        actor_kind: input.actorKind || "platform_admin",
        actor_platform_identity_id: input.actorIdentityId || null,
        provisioning_status: provisioningStatus,
        existing_identity_linked: admin.reusedIdentity === true,
        second_clinic_attachment: Boolean(
          admin.reusedIdentity && identityCollision.existingActiveClinicIdentity
        ),
        acknowledged_existing_identity: acknowledged,
      },
    });
    if (instance) {
      await recordWebsiteAudit(client, {
        organizationId,
        instanceId: instance.id,
        actorIdentityId: input.actorIdentityId || null,
        actionKey: "website.clinic.registration_provision",
        metadata: { application_id: app.id, entity_key: slug },
      });
    }

    const loginEligible = Boolean(admin.ok && admin.staffMemberId);
    app.status = "active";
    app.provisioning_status = provisioningStatus;
    const emailDelivery = await maybeSendReadyToSignInEmail(client, {
      application: app,
      loginEligible,
      env: input.env,
      emailAdapter: input.emailAdapter,
      publicOrigin: input.publicOrigin,
      deploymentCode: input.deploymentCode,
    });

    return {
      ok: true,
      code: websiteOk ? RESULT.OK : RESULT.WEBSITE_PENDING,
      organizationId,
      healthcareOrganization: hco,
      facility,
      instance,
      staffMemberId: admin.ok ? admin.staffMemberId : null,
      identityId: admin.identityId || null,
      reusedIdentity: admin.reusedIdentity === true,
      slug,
      alreadyProvisioned: false,
      emailDelivery,
    };
  };

  if (db && typeof db.connect === "function" && typeof db.release !== "function") {
    return withProvisioningTransaction(db, run);
  }
  return run(db);
}

async function rejectClinicRegistration(db, input) {
  const applicationId = String((input && input.applicationId) || "").trim();
  if (!UUID_RE.test(applicationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  const rejectionReason = String(
    (input && (input.rejectionReason != null ? input.rejectionReason : input.reason)) || ""
  ).trim();
  const run = async (client) => {
    const app = await loadApplication(client, applicationId);
    if (!app) return { ok: false, code: RESULT.NOT_FOUND };
    if (app.status === "rejected") {
      return { ok: true, code: RESULT.ALREADY_REJECTED, application: app };
    }
    if (
      app.status !== "pending_review" &&
      app.status !== "review_required" &&
      app.status !== "submitted" &&
      app.status !== "provisioning"
    ) {
      return { ok: false, code: RESULT.NOT_ELIGIBLE, application: app };
    }
    if (rejectionReason.length < 3 || rejectionReason.length > 2000) {
      return { ok: false, code: RESULT.REJECTION_REASON_REQUIRED };
    }
    await updateApplication(client, app.id, {
      status: "rejected",
      rejection_reason: rejectionReason,
      reviewed_at: new Date().toISOString(),
      reviewed_by_platform_identity_id: input.actorIdentityId || null,
      administrator_password_hash: null,
      last_provision_error: null,
    });
    await appendReviewEvent(client, {
      applicationId: app.id,
      eventType: "rejection",
      body: rejectionReason,
      actorId: input.actorIdentityId,
      visibility: "history",
      deliveryStatus: "sending_unavailable",
    });
    return {
      ok: true,
      code: RESULT.OK,
      applicationId: app.id,
      rejectionReason,
      emailSent: false,
    };
  };
  if (db && typeof db.connect === "function" && typeof db.release !== "function") {
    return withProvisioningTransaction(db, run);
  }
  return run(db);
}

module.exports = {
  RESULT,
  slugFromClinicName,
  approveAndProvisionClinicRegistration,
  rejectClinicRegistration,
};
