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

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "application_not_found",
  NOT_ELIGIBLE: "application_not_eligible",
  ALREADY_PROVISIONED: "already_provisioned",
  ALREADY_REJECTED: "already_rejected",
  TENANT_FAILED: "tenant_provision_failed",
  CLINIC_FAILED: "clinic_provision_failed",
  ADMIN_FAILED: "clinic_admin_failed",
  WEBSITE_PENDING: "website_pending",
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

async function ensureClinicAdmin(client, input) {
  if (input.existingStaffId) {
    return { ok: true, staffMemberId: input.existingStaffId, created: false };
  }
  let identityId = null;
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
  if (!staff.ok) return { ok: false, code: staff.code };
  if (input.facilityId) {
    await assignStaffToFacility(client, {
      organizationId: input.organizationId,
      staffMemberId: staff.staffMember.id,
      facilityId: input.facilityId,
      isPrimary: true,
    });
  }
  const role = await assignStaffRole(client, {
    organizationId: input.organizationId,
    staffMemberId: staff.staffMember.id,
    roleKey: ORGANIZATION_ADMIN,
    scopeType: "organisation",
    assignmentOrigin: "system",
    assignedByPlatformIdentityId: input.actorIdentityId || null,
  });
  if (!role.ok && role.code !== "role_assignment_exists") {
    return { ok: false, code: role.code };
  }
  return { ok: true, staffMemberId: staff.staffMember.id, identityId, created: true };
}

async function approveAndProvisionClinicRegistration(db, input) {
  const applicationId = String((input && input.applicationId) || "").trim();
  if (!UUID_RE.test(applicationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const run = async (client) => {
    const app = await loadApplication(client, applicationId);
    if (!app) return { ok: false, code: RESULT.NOT_FOUND };

    if (app.status === "approved" && app.provisioning_status === "provisioned" && app.organization_id) {
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
      };
    }

    if (app.status === "rejected" || app.status === "withdrawn") {
      return { ok: false, code: RESULT.NOT_ELIGIBLE, application: app };
    }

    await updateApplication(client, app.id, { provisioning_status: "in_progress" });

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

    let admin = { ok: true, staffMemberId: app.clinic_admin_staff_id, created: false };
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
      status: "approved",
      organization_id: organizationId,
      healthcare_organization_id: hco ? hco.id : app.healthcare_organization_id,
      facility_id: facility ? facility.id : app.facility_id,
      website_instance_id: instance ? instance.id : null,
      clinic_admin_staff_id: admin.ok ? admin.staffMemberId : app.clinic_admin_staff_id,
      provisioning_status: provisioningStatus,
      provisioned_at: websiteOk ? new Date().toISOString() : null,
      reviewed_at: new Date().toISOString(),
      reviewed_by_platform_identity_id: input.actorIdentityId || null,
      last_provision_error: websiteOk ? null : clinic.code || "website_provision_failed",
      administrator_password_hash: null,
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
        actor_kind: "platform_admin",
        actor_platform_identity_id: input.actorIdentityId || null,
        provisioning_status: provisioningStatus,
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

    return {
      ok: true,
      code: websiteOk ? RESULT.OK : RESULT.WEBSITE_PENDING,
      organizationId,
      healthcareOrganization: hco,
      facility,
      instance,
      staffMemberId: admin.ok ? admin.staffMemberId : null,
      slug,
      alreadyProvisioned: false,
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
  const run = async (client) => {
    const app = await loadApplication(client, applicationId);
    if (!app) return { ok: false, code: RESULT.NOT_FOUND };
    if (app.status === "rejected") {
      return { ok: true, code: RESULT.ALREADY_REJECTED, application: app };
    }
    if (app.status !== "pending_review") {
      return { ok: false, code: RESULT.NOT_ELIGIBLE, application: app };
    }
    await updateApplication(client, app.id, {
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by_platform_identity_id: input.actorIdentityId || null,
      administrator_password_hash: null,
      last_provision_error: null,
    });
    return { ok: true, code: RESULT.OK, applicationId: app.id };
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
