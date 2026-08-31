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
const { ACTION: LIFECYCLE_ACTION, recordLifecycleAudit } = require("../../platform/registration/lifecycleAudit");
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
const {
  allocateUniqueOrganizationKey,
} = require("../../platform/organization/allocateUniqueOrganizationKey");
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
const {
  inspectOrganizationProvisioningCompleteness,
} = require("../../platform/registration/provisioningRecovery");
const { STAGE } = require("../../platform/registration/provisioningStages");

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

/** @deprecated Use allocateUniqueOrganizationKey — kept for legacy tests only. */
function slugFromClinicName(name) {
  const { resolveBaseOrganizationKey } = require("../../blessboard/services/organizationKey");
  return resolveBaseOrganizationKey(name || "clinic").key || "clinic";
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

function testFailureInjectionEnabled(input) {
  if (!input || input.allowTestFailureInjection !== true) return false;
  if (String(process.env.NODE_ENV || "") === "production") return false;
  if (String((input && input.dataEnvironment) || "") === "production") return false;
  return true;
}

function requestedFailAfter(input) {
  return testFailureInjectionEnabled(input) ? String(input.failAfter || "").trim() : "";
}

const PRE_WEBSITE_FAIL_AFTER = new Set([
  STAGE.ORGANIZATION,
  STAGE.ADMINISTRATOR,
  STAGE.ROLE_ASSIGNMENT,
  STAGE.FACILITY_HQ,
  STAGE.MEMBERSHIPS,
  STAGE.DEFAULT_DEPARTMENTS,
  STAGE.WEBSITE_INSTANCE,
]);

function provisioningStatusForStage(stage) {
  if (stage === STAGE.WEBSITE_INSTANCE || stage === STAGE.TEMPLATE_CONTENT) {
    return "website_pending";
  }
  if (stage === STAGE.AUDIT_COMPLETION || stage === STAGE.DEFAULT_DEPARTMENTS) {
    return "failed";
  }
  return "failed";
}

async function persistProvisionFailure(client, appId, patch) {
  await updateApplication(client, appId, patch);
}

function clinicLifecycleBase(app, input, organizationId) {
  return {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId,
    applicationId: app.id,
    entityId: app.id,
    entityType: "clinic_registration_application",
    actorIdentityId: input.actorIdentityId || null,
    actorType: input.actorKind || "platform_admin",
    productCode: "activeclinic",
    source: "clinic_registration_provision",
  };
}

async function recordClinicLifecycle(client, app, input, organizationId, actionKey, extra) {
  if (!organizationId) return;
  await recordLifecycleAudit(client, {
    ...clinicLifecycleBase(app, input, organizationId),
    actionKey,
    ...(extra || {}),
  });
}

async function maybeSendReadyToSignInEmail(client, input) {
  const app = input.application;
  if (!app || (String(app.status) !== "approved" && String(app.status) !== "active")) {
    return { skipped: true };
  }
  const provisioning = String(app.provisioning_status || "");
  if (provisioning !== "provisioned") {
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
      app.organization_id
    ) {
      const completeness = await inspectOrganizationProvisioningCompleteness(client, {
        productCode: "activeclinic",
        organizationId: app.organization_id,
        application: app,
      });
      if (completeness.complete) {
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
          failedStage: null,
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

    const failAfter = requestedFailAfter(input);
    const isRetry =
      Boolean(app.organization_id) ||
      String(app.provisioning_status || "") === "failed" ||
      String(app.status || "") === "provision_failed";
    await updateApplication(client, app.id, {
      provisioning_status: "in_progress",
      last_provision_stage: STAGE.ORGANIZATION,
    });
    await appendReviewEvent(client, {
      applicationId: app.id,
      eventType: isRetry ? "provisioning_retry" : "provisioning_started",
      actorId: input.actorIdentityId,
      visibility: "history",
      deliveryStatus: "not_applicable",
    });
    if (isRetry && app.organization_id) {
      await recordClinicLifecycle(
        client,
        app,
        input,
        app.organization_id,
        LIFECYCLE_ACTION.PROVISIONING_RETRY,
        { retry: true, provisioningStatus: "in_progress" }
      );
    }

    let organizationId = app.organization_id;
    let slug = null;
    if (!organizationId) {
      slug = await allocateUniqueOrganizationKey(client, {
        displayName: app.clinic_name,
      });
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
        const existingOrg = await client.query(
          `SELECT id, organization_key FROM platform.organizations
            WHERE organization_key = $1
            LIMIT 1`,
          [slug]
        );
        if (existingOrg.rows[0]) {
          organizationId = existingOrg.rows[0].id;
          slug = existingOrg.rows[0].organization_key || slug;
          await persistProvisionFailure(client, app.id, {
            organization_id: organizationId,
            provisioning_status: "failed",
            last_provision_stage: STAGE.ORGANIZATION,
            last_provision_error: tenant.message || tenant.status || "tenant_failed",
          });
        } else {
          await persistProvisionFailure(client, app.id, {
            provisioning_status: "failed",
            last_provision_stage: STAGE.ORGANIZATION,
            last_provision_error: tenant.message || tenant.status || "tenant_failed",
          });
        }
        await appendReviewEvent(client, {
          applicationId: app.id,
          eventType: "provisioning_failed",
          body: String(tenant.message || tenant.status || "tenant_failed").slice(0, 200),
          actorId: input.actorIdentityId,
          visibility: "history",
          deliveryStatus: "not_applicable",
        });
        await recordClinicLifecycle(client, app, input, organizationId, LIFECYCLE_ACTION.PROVISIONING_FAILED, {
          outcome: "failure",
          failedStage: STAGE.ORGANIZATION,
          reasonCode: String(tenant.status || "tenant_failed").slice(0, 120),
          provisioningStatus: "failed",
        });
        return {
          ok: false,
          code: RESULT.TENANT_FAILED,
          reason: tenant.status,
          failedStage: STAGE.ORGANIZATION,
          organizationId: organizationId || null,
        };
      }
      organizationId = tenant.records.organization.id;
      slug = tenant.records.organization.organization_key || slug;
      await updateApplication(client, app.id, {
        organization_id: organizationId,
        last_provision_stage: STAGE.ORGANIZATION,
      });
      await recordClinicLifecycle(client, app, input, organizationId, LIFECYCLE_ACTION.ORGANIZATION_CREATED, {
        entityKey: slug,
        entityType: "organization",
        entityId: organizationId,
      });
      await recordClinicLifecycle(client, app, input, organizationId, LIFECYCLE_ACTION.PROVISIONING_STARTED, {
        provisioningStatus: "in_progress",
      });
    } else {
      const org = await client.query(
        `SELECT organization_key FROM platform.organizations WHERE id = $1`,
        [organizationId]
      );
      slug = org.rows[0] && org.rows[0].organization_key;
    }

    if (failAfter === STAGE.ORGANIZATION) {
      await persistProvisionFailure(client, app.id, {
        organization_id: organizationId,
        status: "provision_failed",
        provisioning_status: "failed",
        last_provision_stage: STAGE.ORGANIZATION,
        last_provision_error: "injected_failure:organization",
      });
      await appendReviewEvent(client, {
        applicationId: app.id,
        eventType: "provisioning_failed",
        body: "injected_failure:organization",
        actorId: input.actorIdentityId,
        visibility: "history",
        deliveryStatus: "not_applicable",
      });
      await recordClinicLifecycle(client, app, input, organizationId, LIFECYCLE_ACTION.PROVISIONING_FAILED, {
        outcome: "failure",
        failedStage: STAGE.ORGANIZATION,
        reasonCode: "injected_failure",
        provisioningStatus: "failed",
      });
      return {
        ok: false,
        code: RESULT.TENANT_FAILED,
        reason: "injected_failure",
        failedStage: STAGE.ORGANIZATION,
        organizationId,
      };
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
      facilityType: input.facilityType || "clinic",
      actorIdentityId: input.actorIdentityId || null,
      websiteStatus: "coming_soon",
      templateVersion: input.websiteTemplateVersion || undefined,
      skipWebsite: PRE_WEBSITE_FAIL_AFTER.has(failAfter),
    });

    if (!clinic.ok && clinic.code !== "website_provision_failed") {
      const failedStage =
        clinic.code === "healthcare_organization_failed"
          ? STAGE.ORGANIZATION
          : clinic.code === "facility_failed"
            ? STAGE.FACILITY_HQ
            : STAGE.FACILITY_HQ;
      await persistProvisionFailure(client, app.id, {
        organization_id: organizationId,
        provisioning_status: "failed",
        last_provision_stage: failedStage,
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
      await recordClinicLifecycle(client, app, input, organizationId, LIFECYCLE_ACTION.PROVISIONING_FAILED, {
        outcome: "failure",
        failedStage,
        reasonCode: String(clinic.code || "clinic_failed").slice(0, 120),
        provisioningStatus: "failed",
      });
      return {
        ok: false,
        code: RESULT.CLINIC_FAILED,
        reason: clinic.code,
        failedStage,
        organizationId,
      };
    }

    const hco = clinic.healthcareOrganization || null;
    const facility = clinic.facility || null;
    let instance = clinic.instance || null;
    if (!instance && organizationId && !PRE_WEBSITE_FAIL_AFTER.has(failAfter)) {
      instance = await instanceRepo.findWebsiteInstanceByOrgProduct(client, {
        organizationId,
        productCode: "activeclinic",
      });
    }

    if (failAfter === STAGE.FACILITY_HQ) {
      await persistProvisionFailure(client, app.id, {
        organization_id: organizationId,
        healthcare_organization_id: hco ? hco.id : null,
        facility_id: facility ? facility.id : null,
        status: "provision_failed",
        provisioning_status: "failed",
        last_provision_stage: STAGE.FACILITY_HQ,
        last_provision_error: "injected_failure:facility_hq",
      });
      await recordClinicLifecycle(client, app, input, organizationId, LIFECYCLE_ACTION.PROVISIONING_FAILED, {
        outcome: "failure",
        failedStage: STAGE.FACILITY_HQ,
        reasonCode: "injected_failure",
        provisioningStatus: "failed",
      });
      return {
        ok: false,
        code: RESULT.CLINIC_FAILED,
        reason: "injected_failure",
        failedStage: STAGE.FACILITY_HQ,
        organizationId,
      };
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
        await persistProvisionFailure(client, app.id, {
          organization_id: organizationId,
          healthcare_organization_id: hco.id,
          facility_id: facility ? facility.id : app.facility_id,
          provisioning_status: "failed",
          last_provision_stage: STAGE.ADMINISTRATOR,
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
        await recordClinicLifecycle(client, app, input, organizationId, LIFECYCLE_ACTION.PROVISIONING_FAILED, {
          outcome: "failure",
          failedStage: STAGE.ADMINISTRATOR,
          reasonCode: String(admin.code || "clinic_admin_failed").slice(0, 120),
          provisioningStatus: "failed",
        });
        return {
          ok: false,
          code: RESULT.ADMIN_FAILED,
          reason: admin.code,
          failedStage: STAGE.ADMINISTRATOR,
          organizationId,
        };
      }
      if (failAfter === STAGE.ADMINISTRATOR || failAfter === STAGE.ROLE_ASSIGNMENT || failAfter === STAGE.MEMBERSHIPS) {
        await persistProvisionFailure(client, app.id, {
          organization_id: organizationId,
          healthcare_organization_id: hco.id,
          facility_id: facility ? facility.id : app.facility_id,
          clinic_admin_staff_id: admin.staffMemberId,
          status: "provision_failed",
          provisioning_status: "failed",
          last_provision_stage: failAfter,
          last_provision_error: `injected_failure:${failAfter}`,
        });
        await recordClinicLifecycle(client, app, input, organizationId, LIFECYCLE_ACTION.PROVISIONING_FAILED, {
          outcome: "failure",
          failedStage: failAfter,
          reasonCode: "injected_failure",
          provisioningStatus: "failed",
        });
        return {
          ok: false,
          code: RESULT.ADMIN_FAILED,
          reason: "injected_failure",
          failedStage: failAfter,
          organizationId,
          staffMemberId: admin.staffMemberId,
          identityId: admin.identityId || null,
        };
      }
      if (facility && facility.id) {
        const departments = await ensureDefaultDepartments(client, {
          organizationId,
          healthcareOrganizationId: hco.id,
          facilityId: facility.id,
        });
        if (!departments.ok) {
          await persistProvisionFailure(client, app.id, {
            organization_id: organizationId,
            healthcare_organization_id: hco.id,
            facility_id: facility.id,
            clinic_admin_staff_id: admin.staffMemberId,
            provisioning_status: "failed",
            last_provision_stage: STAGE.DEFAULT_DEPARTMENTS,
            last_provision_error: departments.result || "departments_failed",
          });
          await recordClinicLifecycle(client, app, input, organizationId, LIFECYCLE_ACTION.PROVISIONING_FAILED, {
            outcome: "failure",
            failedStage: STAGE.DEFAULT_DEPARTMENTS,
            reasonCode: "departments_failed",
            provisioningStatus: "failed",
          });
          return {
            ok: false,
            code: RESULT.CLINIC_FAILED,
            reason: "departments_failed",
            failedStage: STAGE.DEFAULT_DEPARTMENTS,
            organizationId,
          };
        }
      }
      if (failAfter === STAGE.DEFAULT_DEPARTMENTS) {
        await persistProvisionFailure(client, app.id, {
          organization_id: organizationId,
          healthcare_organization_id: hco.id,
          facility_id: facility ? facility.id : app.facility_id,
          clinic_admin_staff_id: admin.staffMemberId,
          status: "provision_failed",
          provisioning_status: "failed",
          last_provision_stage: STAGE.DEFAULT_DEPARTMENTS,
          last_provision_error: "injected_failure:default_departments",
        });
        await recordClinicLifecycle(client, app, input, organizationId, LIFECYCLE_ACTION.PROVISIONING_FAILED, {
          outcome: "failure",
          failedStage: STAGE.DEFAULT_DEPARTMENTS,
          reasonCode: "injected_failure",
          provisioningStatus: "failed",
        });
        return {
          ok: false,
          code: RESULT.CLINIC_FAILED,
          reason: "injected_failure",
          failedStage: STAGE.DEFAULT_DEPARTMENTS,
          organizationId,
        };
      }
    }

    if (failAfter === STAGE.WEBSITE_INSTANCE) {
      await persistProvisionFailure(client, app.id, {
        organization_id: organizationId,
        healthcare_organization_id: hco ? hco.id : app.healthcare_organization_id,
        facility_id: facility ? facility.id : app.facility_id,
        clinic_admin_staff_id: admin.ok ? admin.staffMemberId : app.clinic_admin_staff_id,
        status: "active",
        provisioning_status: "website_pending",
        last_provision_stage: STAGE.WEBSITE_INSTANCE,
        last_provision_error: "injected_failure:website_instance",
        administrator_password_hash: null,
      });
      await recordClinicLifecycle(client, app, input, organizationId, LIFECYCLE_ACTION.PROVISIONING_FAILED, {
        outcome: "failure",
        failedStage: STAGE.WEBSITE_INSTANCE,
        reasonCode: "injected_failure",
        provisioningStatus: "website_pending",
      });
      return {
        ok: true,
        code: RESULT.WEBSITE_PENDING,
        organizationId,
        healthcareOrganization: hco,
        facility,
        instance: null,
        failedStage: STAGE.WEBSITE_INSTANCE,
        staffMemberId: admin.ok ? admin.staffMemberId : null,
        identityId: admin.identityId || null,
        reusedIdentity: admin.reusedIdentity === true,
        slug,
        alreadyProvisioned: false,
      };
    }

    if (instance && failAfter === STAGE.TEMPLATE_CONTENT) {
      await client.query(`DELETE FROM platform.website_content WHERE instance_id = $1`, [instance.id]);
      await persistProvisionFailure(client, app.id, {
        organization_id: organizationId,
        healthcare_organization_id: hco ? hco.id : app.healthcare_organization_id,
        facility_id: facility ? facility.id : app.facility_id,
        website_instance_id: instance.id,
        clinic_admin_staff_id: admin.ok ? admin.staffMemberId : app.clinic_admin_staff_id,
        status: "active",
        provisioning_status: "website_pending",
        last_provision_stage: STAGE.TEMPLATE_CONTENT,
        last_provision_error: "injected_failure:template_content",
        administrator_password_hash: null,
      });
      await recordClinicLifecycle(client, app, input, organizationId, LIFECYCLE_ACTION.PROVISIONING_FAILED, {
        outcome: "failure",
        failedStage: STAGE.TEMPLATE_CONTENT,
        reasonCode: "injected_failure",
        provisioningStatus: "website_pending",
      });
      return {
        ok: true,
        code: RESULT.WEBSITE_PENDING,
        organizationId,
        healthcareOrganization: hco,
        facility,
        instance,
        failedStage: STAGE.TEMPLATE_CONTENT,
        staffMemberId: admin.ok ? admin.staffMemberId : null,
        identityId: admin.identityId || null,
        reusedIdentity: admin.reusedIdentity === true,
        slug,
        alreadyProvisioned: false,
      };
    }

    const completeness = await inspectOrganizationProvisioningCompleteness(client, {
      productCode: "activeclinic",
      organizationId,
      application: {
        ...app,
        clinic_admin_staff_id: admin.ok ? admin.staffMemberId : app.clinic_admin_staff_id,
        contact_email_normalized: app.contact_email_normalized,
        provisioning_status: instance ? "provisioned" : "website_pending",
      },
    });
    const websiteOk = completeness.stages && completeness.stages[STAGE.WEBSITE_INSTANCE] && completeness.stages[STAGE.TEMPLATE_CONTENT];
    const departmentsOk = completeness.stages && completeness.stages[STAGE.DEFAULT_DEPARTMENTS];
    const fullyComplete =
      websiteOk &&
      departmentsOk &&
      completeness.stages[STAGE.ADMINISTRATOR] &&
      completeness.stages[STAGE.FACILITY_HQ];
    const failedStage = fullyComplete
      ? failAfter === STAGE.AUDIT_COMPLETION
        ? STAGE.AUDIT_COMPLETION
        : null
      : completeness.failedStage && completeness.failedStage !== STAGE.AUDIT_COMPLETION
        ? completeness.failedStage
        : websiteOk
          ? STAGE.DEFAULT_DEPARTMENTS
          : STAGE.WEBSITE_INSTANCE;
    const provisioningStatus = fullyComplete && failAfter !== STAGE.AUDIT_COMPLETION ? "provisioned" : provisioningStatusForStage(failedStage || STAGE.WEBSITE_INSTANCE);

    if (failAfter === STAGE.AUDIT_COMPLETION) {
      await persistProvisionFailure(client, app.id, {
        organization_id: organizationId,
        healthcare_organization_id: hco ? hco.id : app.healthcare_organization_id,
        facility_id: facility ? facility.id : app.facility_id,
        website_instance_id: instance ? instance.id : null,
        clinic_admin_staff_id: admin.ok ? admin.staffMemberId : app.clinic_admin_staff_id,
        status: "active",
        provisioning_status: "failed",
        last_provision_stage: STAGE.AUDIT_COMPLETION,
        last_provision_error: "injected_failure:audit_completion",
        administrator_password_hash: null,
      });
      await recordClinicLifecycle(client, app, input, organizationId, LIFECYCLE_ACTION.PROVISIONING_FAILED, {
        outcome: "failure",
        failedStage: STAGE.AUDIT_COMPLETION,
        reasonCode: "injected_failure",
        provisioningStatus: "failed",
      });
      return {
        ok: false,
        code: RESULT.WEBSITE_PENDING,
        organizationId,
        healthcareOrganization: hco,
        facility,
        instance,
        failedStage: STAGE.AUDIT_COMPLETION,
        staffMemberId: admin.ok ? admin.staffMemberId : null,
        identityId: admin.identityId || null,
        slug,
        alreadyProvisioned: false,
      };
    }

    await updateApplication(client, app.id, {
      status: "active",
      organization_id: organizationId,
      healthcare_organization_id: hco ? hco.id : app.healthcare_organization_id,
      facility_id: facility ? facility.id : app.facility_id,
      website_instance_id: instance ? instance.id : null,
      clinic_admin_staff_id: admin.ok ? admin.staffMemberId : app.clinic_admin_staff_id,
      provisioning_status: provisioningStatus,
      provisioned_at: fullyComplete ? new Date().toISOString() : null,
      reviewed_at: new Date().toISOString(),
      reviewed_by_platform_identity_id: input.actorIdentityId || null,
      last_provision_error: fullyComplete
        ? null
        : String(clinic.reason || clinic.code || failedStage || "provision_incomplete").slice(0, 500),
      last_provision_stage: fullyComplete ? null : failedStage,
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
      eventType: fullyComplete ? "provisioning_succeeded" : "provisioning_failed",
      body: fullyComplete
        ? null
        : String(clinic.reason || clinic.code || failedStage || "provision_incomplete").slice(0, 200),
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
      outcome: fullyComplete ? "success" : "failure",
      metadata: {
        actor_type: input.actorKind || "platform_admin",
        actor_identity_id: input.actorIdentityId || null,
        product_code: "activeclinic",
        provisioning_status: provisioningStatus,
        failed_stage: fullyComplete ? null : failedStage,
        application_id: app.id,
        instance_id: instance ? instance.id : null,
        source: "clinic_registration_provision",
      },
    });
    await recordClinicLifecycle(client, app, input, organizationId, LIFECYCLE_ACTION.APPROVED, {
      status: "active",
      provisioningStatus,
      instanceId: instance ? instance.id : null,
    });
    if (admin.ok && admin.staffMemberId) {
      await recordClinicLifecycle(client, app, input, organizationId, LIFECYCLE_ACTION.ADMIN_ROLE_ASSIGNED, {
        entityType: "staff_role_assignment",
        entityKey: ORGANIZATION_ADMIN,
        instanceId: instance ? instance.id : null,
      });
    }
    if (instance) {
      await recordClinicLifecycle(client, app, input, organizationId, LIFECYCLE_ACTION.WEBSITE_INITIALIZED, {
        entityType: "website_instance",
        entityId: instance.id,
        instanceId: instance.id,
        entityKey: slug,
      });
    }
    await recordClinicLifecycle(
      client,
      app,
      input,
      organizationId,
      fullyComplete ? LIFECYCLE_ACTION.PROVISIONING_COMPLETED : LIFECYCLE_ACTION.PROVISIONING_FAILED,
      {
        outcome: fullyComplete ? "success" : "failure",
        provisioningStatus,
        failedStage: fullyComplete ? null : failedStage,
        reasonCode: fullyComplete ? undefined : String(failedStage || "provision_incomplete"),
        instanceId: instance ? instance.id : null,
      }
    );
    if (instance) {
      await recordWebsiteAudit(client, {
        organizationId,
        instanceId: instance.id,
        actorIdentityId: input.actorIdentityId || null,
        actionKey: "website.clinic.registration_provision",
        metadata: { application_id: app.id, entity_key: slug },
      });
    }

    const loginEligible = Boolean(admin.ok && admin.staffMemberId && fullyComplete);
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
      code: fullyComplete ? RESULT.OK : RESULT.WEBSITE_PENDING,
      organizationId,
      healthcareOrganization: hco,
      facility,
      instance,
      staffMemberId: admin.ok ? admin.staffMemberId : null,
      identityId: admin.identityId || null,
      reusedIdentity: admin.reusedIdentity === true,
      slug,
      alreadyProvisioned: false,
      failedStage: fullyComplete ? null : failedStage,
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
      last_provision_stage: null,
    });
    await appendReviewEvent(client, {
      applicationId: app.id,
      eventType: "rejection",
      body: rejectionReason,
      actorId: input.actorIdentityId,
      visibility: "history",
      deliveryStatus: "sending_unavailable",
    });
    await recordClinicLifecycle(client, app, input, app.organization_id, LIFECYCLE_ACTION.REJECTED, {
      outcome: "success",
      status: "rejected",
      reasonCode: "rejected",
      actorType: input.actorKind || "platform_admin",
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
  testFailureInjectionEnabled,
};
