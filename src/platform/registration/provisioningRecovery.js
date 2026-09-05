"use strict";

/**
 * Shared provisioning completeness inspector and resume dispatcher.
 * Detects the first incomplete stage. Resume is product-owned and idempotent.
 */

const { PRODUCT } = require("./constants");
const { STAGE, ORDER, isCoreLoginStage } = require("./provisioningStages");
const { DEFAULT_DEPARTMENT_SPECS } = require("../../activeclinic/services/activeClinicDepartmentService");
const { ORGANIZATION_ADMIN } = require("../../activeclinic/services/activeClinicAuthorizationService");

const DEFAULT_DEPARTMENT_KEYS = Object.freeze(
  DEFAULT_DEPARTMENT_SPECS.map((spec) => spec.key)
);

function emptyInspect(failedStage, details) {
  const stages = {};
  for (const key of ORDER) stages[key] = false;
  return {
    complete: false,
    failedStage,
    stages,
    details: details || {},
  };
}

async function queryOne(db, sql, params) {
  const result = await db.query(sql, params);
  return (result && result.rows && result.rows[0]) || null;
}

function finishInspect(stages, details) {
  const failedStage = ORDER.find((key) => stages[key] !== true) || null;
  return {
    complete: !failedStage,
    failedStage,
    stages,
    details,
  };
}

async function inspectActiveClinic(db, organizationId, application, staffMemberId) {
  const details = {};
  const stages = {};
  for (const key of ORDER) stages[key] = false;
  details.departmentsApplicable = true;

  const org = await queryOne(
    db,
    `SELECT id, organization_key, status
       FROM platform.organizations
      WHERE id = $1
      LIMIT 1`,
    [organizationId]
  );
  stages[STAGE.ORGANIZATION] = Boolean(org && org.status === "active");
  details.organizationKey = org ? org.organization_key : null;
  details.organizationStatus = org ? String(org.status || "") : "missing";

  const hco = await queryOne(
    db,
    `SELECT id, status, website_published
       FROM activeclinic.healthcare_organizations
      WHERE organization_id = $1
      LIMIT 1`,
    [organizationId]
  );
  details.healthcareOrganizationId = hco ? hco.id : null;
  details.websitePublication =
    hco && hco.website_published === true ? "public" : hco ? "unpublished" : "missing";

  const hintedStaffId =
    (application && application.clinic_admin_staff_id) || staffMemberId || null;
  const hintedEmail =
    (application &&
      (application.contact_email_normalized || application.contact_email)) ||
    null;
  let adminStaff = await queryOne(
    db,
    `SELECT sm.id, sm.platform_identity_id, sm.status
       FROM activeclinic.staff_members sm
      WHERE sm.organization_id = $1
        AND (
          sm.id = $2::uuid
          OR (
            $3::text IS NOT NULL
            AND sm.platform_identity_id IN (
              SELECT id FROM platform.identities
               WHERE email_normalized = $3
            )
          )
        )
      ORDER BY CASE WHEN sm.id = $2::uuid THEN 0 ELSE 1 END
      LIMIT 1`,
    [organizationId, hintedStaffId, hintedEmail]
  );
  if (!adminStaff) {
    adminStaff = await queryOne(
      db,
      `SELECT sm.id, sm.platform_identity_id, sm.status
         FROM activeclinic.staff_members sm
         JOIN activeclinic.staff_role_assignments a
           ON a.staff_member_id = sm.id AND a.organization_id = sm.organization_id
         JOIN blessboard.roles r ON r.id = a.role_id
        WHERE sm.organization_id = $1
          AND sm.status = 'active'
          AND a.status = 'active'
          AND r.role_key = $2
        LIMIT 1`,
      [organizationId, ORGANIZATION_ADMIN]
    );
  }
  stages[STAGE.ADMINISTRATOR] = Boolean(
    adminStaff && adminStaff.status === "active" && adminStaff.platform_identity_id
  );
  details.staffMemberId = adminStaff ? adminStaff.id : null;

  if (adminStaff) {
    const role = await queryOne(
      db,
      `SELECT a.id
         FROM activeclinic.staff_role_assignments a
         JOIN blessboard.roles r ON r.id = a.role_id
        WHERE a.organization_id = $1
          AND a.staff_member_id = $2
          AND r.role_key = $3
          AND a.status = 'active'
        LIMIT 1`,
      [organizationId, adminStaff.id, ORGANIZATION_ADMIN]
    );
    stages[STAGE.ROLE_ASSIGNMENT] = Boolean(role);
  }

  // HQ stage = active facility keyed "hq" OR the designated primary facility.
  // Demo/Julflona seeds historically used non-hq keys (e.g. lusaka) while still
  // marking is_primary; clinic-setup checklist already treats primary as HQ.
  const facility = await queryOne(
    db,
    `SELECT f.id, f.facility_key, f.status, f.is_primary
       FROM activeclinic.facilities f
      WHERE f.organization_id = $1
        AND f.status = 'active'
        AND (f.facility_key = 'hq' OR f.is_primary = true)
      ORDER BY CASE WHEN f.facility_key = 'hq' THEN 0 ELSE 1 END,
               CASE WHEN f.is_primary THEN 0 ELSE 1 END,
               f.created_at ASC
      LIMIT 1`,
    [organizationId]
  );
  stages[STAGE.FACILITY_HQ] = Boolean(facility);
  details.facilityId = facility ? facility.id : null;
  details.facilityKey = facility ? facility.facility_key : null;

  if (adminStaff && facility) {
    const membership = await queryOne(
      db,
      `SELECT id
         FROM activeclinic.staff_facility_assignments
        WHERE organization_id = $1
          AND staff_member_id = $2
          AND facility_id = $3
          AND status = 'active'
        LIMIT 1`,
      [organizationId, adminStaff.id, facility.id]
    );
    stages[STAGE.MEMBERSHIPS] = Boolean(membership);
  }

  if (facility) {
    const departments = await queryOne(
      db,
      `SELECT COUNT(*)::int AS n
         FROM activeclinic.departments
        WHERE organization_id = $1
          AND facility_id = $2
          AND department_key = ANY($3::text[])
          AND status = 'active'`,
      [organizationId, facility.id, DEFAULT_DEPARTMENT_KEYS.slice()]
    );
    const departmentCount = departments && departments.n != null ? Number(departments.n) : 0;
    details.defaultDepartmentCount = departmentCount;
    stages[STAGE.DEFAULT_DEPARTMENTS] = departmentCount >= DEFAULT_DEPARTMENT_KEYS.length;
  }

  const instance = await queryOne(
    db,
    `SELECT id, template_id, template_version, status
       FROM platform.website_instances
      WHERE organization_id = $1
        AND product_code = 'activeclinic'
        AND status <> 'archived'
      ORDER BY CASE WHEN scope_ref IS NULL THEN 0 ELSE 1 END, created_at ASC
      LIMIT 1`,
    [organizationId]
  );
  stages[STAGE.WEBSITE_INSTANCE] = Boolean(instance);
  details.websiteInstanceId = instance ? instance.id : null;
  details.websiteInstanceStatus = instance ? instance.status : null;

  if (instance) {
    const content = await queryOne(
      db,
      `SELECT COUNT(*)::int AS n
         FROM platform.website_content
        WHERE instance_id = $1`,
      [instance.id]
    );
    const contentCount = content && content.n != null ? Number(content.n) : 0;
    details.websiteContentCount = contentCount;
    stages[STAGE.TEMPLATE_CONTENT] = contentCount > 0;
  }

  let applicationRow = application;
  if (!applicationRow) {
    applicationRow = await queryOne(
      db,
      `SELECT provisioning_status
         FROM activeclinic.clinic_registration_applications
        WHERE organization_id = $1
        ORDER BY CASE WHEN provisioning_status = 'provisioned' THEN 0 ELSE 1 END,
                 created_at DESC
        LIMIT 1`,
      [organizationId]
    );
  }
  const provisioning = String(
    (applicationRow &&
      (applicationRow.provisioning_status || applicationRow.provisioningStatus)) ||
      ""
  );
  if (provisioning) {
    stages[STAGE.AUDIT_COMPLETION] = provisioning === "provisioned";
  } else {
    stages[STAGE.AUDIT_COMPLETION] =
      stages[STAGE.WEBSITE_INSTANCE] === true && stages[STAGE.TEMPLATE_CONTENT] === true;
  }
  return finishInspect(stages, details);
}

async function inspectBlessBoard(db, organizationId, application) {
  const details = {};
  const stages = {};
  for (const key of ORDER) stages[key] = false;

  const org = await queryOne(
    db,
    `SELECT id, organization_key, status
       FROM platform.organizations
      WHERE id = $1
      LIMIT 1`,
    [organizationId]
  );
  stages[STAGE.ORGANIZATION] = Boolean(org && org.status === "active");
  details.organizationKey = org ? org.organization_key : null;
  details.organizationStatus = org ? String(org.status || "") : "missing";

  const email =
    (application &&
      (application.contact_email_normalized || application.contact_email)) ||
    null;
  const admin = email
    ? await queryOne(
        db,
        `SELECT id, status
           FROM blessboard.users
          WHERE email_normalized = lower($1)
          LIMIT 1`,
        [String(email).trim().toLowerCase()]
      )
    : null;
  stages[STAGE.ADMINISTRATOR] = Boolean(admin && admin.status && admin.status !== "disabled");
  details.administratorUserId = admin ? admin.id : null;

  let role = null;
  if (admin) {
    role = await queryOne(
      db,
      `SELECT id
         FROM blessboard.user_roles
        WHERE user_id = $1
          AND organization_id = $2
          AND role_key IN ('church_hq_admin', 'branch_admin')
          AND status = 'active'
        LIMIT 1`,
      [admin.id, organizationId]
    );
  }
  stages[STAGE.ROLE_ASSIGNMENT] = Boolean(role);

  const church = await queryOne(
    db,
    `SELECT id, status
       FROM blessboard.churches
      WHERE organization_id = $1
      LIMIT 1`,
    [organizationId]
  );
  const branch = church
    ? await queryOne(
        db,
        `SELECT id, status
           FROM blessboard.branches
          WHERE church_id = $1
            AND branch_type = 'hq'
          LIMIT 1`,
        [church.id]
      )
    : null;
  stages[STAGE.FACILITY_HQ] = Boolean(
    church && church.status === "active" && branch && branch.status === "active"
  );
  details.churchId = church ? church.id : null;
  details.branchId = branch ? branch.id : null;

  stages[STAGE.MEMBERSHIPS] = Boolean(role);
  stages[STAGE.DEFAULT_DEPARTMENTS] = true;
  details.departmentsApplicable = false;

  if (church) {
    let settings = null;
    try {
      settings = await queryOne(
        db,
        `SELECT website_status
           FROM blessboard.church_settings
          WHERE church_id = $1
          LIMIT 1`,
        [church.id]
      );
    } catch {
      settings = null;
    }
    const websiteStatus = settings ? String(settings.website_status || "") : "";
    details.websitePublication =
      websiteStatus === "published" ? "public" : settings ? "unpublished" : "missing";
  } else {
    details.websitePublication = "missing";
  }

  const instance = await queryOne(
    db,
    `SELECT id
       FROM platform.website_instances
      WHERE organization_id = $1
        AND product_code = 'blessboard'
        AND status <> 'archived'
      ORDER BY created_at ASC
      LIMIT 1`,
    [organizationId]
  );
  let pageCount = 0;
  if (church) {
    const pages = await queryOne(
      db,
      `SELECT COUNT(*)::int AS n
         FROM blessboard.public_pages
        WHERE church_id = $1`,
      [church.id]
    );
    pageCount = pages && pages.n != null ? Number(pages.n) : 0;
  }
  stages[STAGE.WEBSITE_INSTANCE] = Boolean(instance) || pageCount > 0;
  details.websiteInstanceId = instance ? instance.id : null;
  details.legacyPageCount = pageCount;

  let contentCount = 0;
  if (instance) {
    const content = await queryOne(
      db,
      `SELECT COUNT(*)::int AS n
         FROM platform.website_content
        WHERE instance_id = $1`,
      [instance.id]
    );
    contentCount = content && content.n != null ? Number(content.n) : 0;
  }
  details.websiteContentCount = contentCount;
  stages[STAGE.TEMPLATE_CONTENT] = contentCount > 0 || pageCount > 0;

  const provisioning = String((application && application.provisioning_status) || "");
  stages[STAGE.AUDIT_COMPLETION] = provisioning === "provisioned";
  return finishInspect(stages, details);
}

async function inspectOrganizationProvisioningCompleteness(db, input) {
  const productCode = String((input && input.productCode) || "").trim();
  const organizationId = input && input.organizationId;
  const application = (input && input.application) || null;
  if (!organizationId) {
    return emptyInspect(STAGE.ORGANIZATION, { reason: "missing_organization_id" });
  }
  if (productCode === PRODUCT.ACTIVECLINIC) {
    return inspectActiveClinic(db, organizationId, application, input.staffMemberId || null);
  }
  if (productCode === PRODUCT.BLESSBOARD) {
    return inspectBlessBoard(db, organizationId, application);
  }
  return emptyInspect(STAGE.ORGANIZATION, { reason: "unknown_product" });
}

function isRetryablePartialProvision(productCode, row) {
  if (!row) return false;
  const provisioning = String(row.provisioning_status || "");
  const status = String(row.status || row.application_status || "");
  if (status === "rejected" || status === "withdrawn" || status === "cancelled") {
    return false;
  }
  if (provisioning === "provisioned" && row.organization_id) return false;
  if (provisioning === "website_pending" || provisioning === "failed" || provisioning === "provisioning_failed") {
    return true;
  }
  if (provisioning === "in_progress" && row.organization_id) return true;
  if (status === "provision_failed") return true;
  if (row.organization_id && provisioning !== "provisioned") return true;
  if (row.last_provision_stage) return true;
  return false;
}

function describePartialProvision(productCode, row) {
  const retryable = isRetryablePartialProvision(productCode, row);
  const provisioning = String((row && row.provisioning_status) || "");
  const failedStage =
    (row && (row.last_provision_stage || row.lastProvisionStage)) ||
    (provisioning === "website_pending" ? STAGE.WEBSITE_INSTANCE : null);
  return {
    failedStage,
    partialProvision: retryable || provisioning === "website_pending",
    retryable,
    retryHref: retryable
      ? `/admin/registrations/${encodeURIComponent(productCode)}/${encodeURIComponent(row.id)}/retry-provision`
      : null,
  };
}

/**
 * Resume product provisioning. Lazy-requires product orchestrators to avoid cycles.
 */
async function resumeOrganizationProvisioning(db, input) {
  const productCode = String((input && input.productCode) || "").trim();
  if (productCode === PRODUCT.ACTIVECLINIC) {
    const {
      approveAndProvisionClinicRegistration,
    } = require("../../activeclinic/services/approveClinicRegistrationService");
    return approveAndProvisionClinicRegistration(db, {
      applicationId: input.applicationId,
      actorIdentityId: input.actorIdentityId || input.actorUserId || null,
      dataEnvironment: input.dataEnvironment || "testing",
      deploymentCode: input.deploymentCode,
      env: input.env,
      acknowledgeExistingIdentity: input.acknowledgeExistingIdentity,
    });
  }
  if (productCode === PRODUCT.BLESSBOARD) {
    if (input.actorUserId) {
      const {
        approveAndProvisionRegistrationApplication,
      } = require("../../blessboard/services/registrationApplicationsAdminService");
      return approveAndProvisionRegistrationApplication(db, {
        applicationId: input.applicationId,
        actorUserId: input.actorUserId,
        organizationKey: input.organizationKey,
        deploymentCode: input.deploymentCode,
        dataEnvironment: input.dataEnvironment || "testing",
      });
    }
    const {
      provisionRegisteredBlessBoardChurch,
    } = require("../../blessboard/services/provisionRegisteredBlessBoardChurch");
    return provisionRegisteredBlessBoardChurch(
      db,
      {
        applicationId: input.applicationId,
        administratorPassword: input.administratorPassword,
        requestedOrganizationKey: input.organizationKey,
        actorContext: {
          type: (input.actor && input.actor.kind) || "platform_admin",
          source: "provisioning_recovery",
          dataEnvironment: input.dataEnvironment || "testing",
          deploymentCode: input.deploymentCode || "blessboard-org-v5",
        },
      },
      { allowRetry: true }
    );
  }
  return { ok: false, code: "unknown_product" };
}

module.exports = {
  inspectOrganizationProvisioningCompleteness,
  resumeOrganizationProvisioning,
  isRetryablePartialProvision,
  describePartialProvision,
  isCoreLoginStage,
  DEFAULT_DEPARTMENT_KEYS,
};
