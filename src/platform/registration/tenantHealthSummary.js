"use strict";

/**
 * Compact Platform Admin tenant-health summary for newly registered organizations.
 * Live inspect of existing resources; retry only through idempotent recovery.
 */

const { PRODUCT } = require("./constants");
const { STAGE } = require("./provisioningStages");
const { toCanonicalLifecycle } = require("./lifecycle");
const {
  inspectOrganizationProvisioningCompleteness,
  isRetryablePartialProvision,
  resumeOrganizationProvisioning,
} = require("./provisioningRecovery");

const TONE = Object.freeze({
  OK: "ok",
  WARN: "warn",
  FAIL: "fail",
  MUTED: "muted",
});

const PRODUCT_LABEL = Object.freeze({
  [PRODUCT.ACTIVECLINIC]: "ActiveClinic",
  [PRODUCT.BLESSBOARD]: "BlessBoard",
});

function okRow(key, label, ok) {
  return {
    key,
    label,
    value: ok ? "OK" : "FAILED",
    tone: ok ? TONE.OK : TONE.FAIL,
  };
}

function publicationRow(publication) {
  const value = String(publication || "missing").toUpperCase();
  let tone = TONE.MUTED;
  if (value === "PUBLIC") tone = TONE.OK;
  else if (value === "UNPUBLISHED") tone = TONE.WARN;
  else if (value === "MISSING") tone = TONE.FAIL;
  return {
    key: "website_publication",
    label: "Website publication",
    value,
    tone,
  };
}

function normalizeApplication(app) {
  if (!app) return null;
  return {
    id: app.id || null,
    organization_id: app.organization_id || app.organizationId || null,
    organization_key: app.organization_key || app.organizationKey || null,
    provisioning_status: app.provisioning_status || app.provisioningStatus || "",
    last_provision_stage: app.last_provision_stage || app.lastProvisionStage || null,
    last_provision_error:
      app.last_provision_error ||
      app.lastProvisionError ||
      app.provisioning_error_code ||
      app.provisioningErrorCode ||
      app.provisioning_error_detail ||
      app.provisioningErrorDetail ||
      null,
    contact_email:
      app.contact_email || app.contactEmail || app.contact_email_display || null,
    contact_email_normalized:
      app.contact_email_normalized ||
      app.contactEmailNormalized ||
      (app.contact_email || app.contactEmail
        ? String(app.contact_email || app.contactEmail).trim().toLowerCase()
        : null),
    clinic_admin_staff_id: app.clinic_admin_staff_id || app.clinicAdminStaffId || null,
    status: app.status || app.application_status || app.applicationStatus || "",
    application_status: app.application_status || app.applicationStatus || app.status || "",
  };
}

async function queryOne(db, sql, params) {
  const result = await db.query(sql, params);
  return (result && result.rows && result.rows[0]) || null;
}

async function findApplication(db, productCode, input) {
  if (productCode === PRODUCT.ACTIVECLINIC) {
    if (input.applicationId) {
      return queryOne(
        db,
        `SELECT id, organization_id, status, provisioning_status,
                last_provision_stage, last_provision_error,
                contact_email_normalized, contact_email_display AS contact_email,
                clinic_admin_staff_id
           FROM activeclinic.clinic_registration_applications
          WHERE id = $1
          LIMIT 1`,
        [input.applicationId]
      );
    }
    if (input.organizationId) {
      return queryOne(
        db,
        `SELECT id, organization_id, status, provisioning_status,
                last_provision_stage, last_provision_error,
                contact_email_normalized, contact_email_display AS contact_email,
                clinic_admin_staff_id
           FROM activeclinic.clinic_registration_applications
          WHERE organization_id = $1
          ORDER BY created_at DESC
          LIMIT 1`,
        [input.organizationId]
      );
    }
  }
  if (productCode === PRODUCT.BLESSBOARD) {
    if (input.applicationId) {
      return queryOne(
        db,
        `SELECT id, organization_id, application_status AS status, provisioning_status,
                last_provision_stage, provisioning_error_code AS last_provision_error,
                contact_email, lower(contact_email) AS contact_email_normalized
           FROM blessboard.platform_church_registration_applications
          WHERE id = $1
          LIMIT 1`,
        [input.applicationId]
      );
    }
    if (input.organizationId) {
      return queryOne(
        db,
        `SELECT id, organization_id, application_status AS status, provisioning_status,
                last_provision_stage, provisioning_error_code AS last_provision_error,
                contact_email, lower(contact_email) AS contact_email_normalized
           FROM blessboard.platform_church_registration_applications
          WHERE organization_id = $1
          ORDER BY created_at DESC
          LIMIT 1`,
        [input.organizationId]
      );
    }
  }
  return null;
}

async function listActiveProductKeys(db, organizationId) {
  const result = await db.query(
    `SELECT p.product_key
       FROM platform.organization_products op
       JOIN platform.products p ON p.id = op.product_id
      WHERE op.organization_id = $1
        AND op.status = 'active'
      ORDER BY p.product_key ASC`,
    [organizationId]
  );
  return (result.rows || []).map((row) => String(row.product_key));
}

async function resolveOrganizationId(db, organizationKey) {
  const row = await queryOne(
    db,
    `SELECT id FROM platform.organizations WHERE organization_key = $1 LIMIT 1`,
    [String(organizationKey || "").trim().toLowerCase()]
  );
  return row ? row.id : null;
}

function retryHrefFor(productCode, applicationId, organizationKey) {
  if (organizationKey) {
    return `/admin/organizations/${encodeURIComponent(organizationKey)}/retry-provision`;
  }
  if (!applicationId) return null;
  return `/admin/registrations/${encodeURIComponent(productCode)}/${encodeURIComponent(applicationId)}/retry-provision`;
}

function presentTenantHealthSummary(inspect, extras) {
  const productCode = String((extras && extras.productCode) || "");
  const stages = (inspect && inspect.stages) || {};
  const details = (inspect && inspect.details) || {};
  const application = extras && extras.application ? extras.application : null;
  const orgStatus = String(details.organizationStatus || "").toUpperCase() || "MISSING";
  const facilityLabel = productCode === PRODUCT.BLESSBOARD ? "HQ" : "Facility";
  const departmentsApplicable = details.departmentsApplicable !== false;
  const websiteOk = Boolean(stages[STAGE.WEBSITE_INSTANCE] && stages[STAGE.TEMPLATE_CONTENT]);
  const lastError =
    (application && application.last_provision_error) ||
    details.reason ||
    null;
  const failedStage = (inspect && inspect.failedStage) || null;
  const complete = Boolean(inspect && inspect.complete);
  const retryableStored = application
    ? isRetryablePartialProvision(productCode, application)
    : Boolean(failedStage);
  const retryEligible = complete ? false : retryableStored && Boolean(application && application.id);

  const checks = [
    {
      key: "organization",
      label: "Organization",
      value: orgStatus,
      tone: orgStatus === "ACTIVE" ? TONE.OK : orgStatus === "MISSING" ? TONE.FAIL : TONE.WARN,
    },
    okRow("administrator", "Administrator", Boolean(stages[STAGE.ADMINISTRATOR])),
    okRow("roles", "Roles", Boolean(stages[STAGE.ROLE_ASSIGNMENT])),
    okRow("facility", facilityLabel, Boolean(stages[STAGE.FACILITY_HQ])),
    okRow("memberships", "Memberships", Boolean(stages[STAGE.MEMBERSHIPS])),
    departmentsApplicable
      ? okRow("departments", "Departments", Boolean(stages[STAGE.DEFAULT_DEPARTMENTS]))
      : { key: "departments", label: "Departments", value: "N/A", tone: TONE.MUTED },
    okRow("website", "Website", websiteOk),
    publicationRow(details.websitePublication),
  ];
  if (failedStage) {
    checks.push({
      key: "failed_stage",
      label: "Failed stage",
      value: String(failedStage),
      tone: TONE.FAIL,
    });
  }
  if (lastError) {
    checks.push({
      key: "reason",
      label: "Reason",
      value: String(lastError),
      tone: TONE.FAIL,
    });
  }

  const organizationKey =
    details.organizationKey || (extras && extras.organizationKey) || null;
  return {
    productCode,
    productLabel: PRODUCT_LABEL[productCode] || productCode,
    lifecycle: application ? toCanonicalLifecycle(productCode, application) : null,
    organizationStatus: details.organizationStatus || null,
    complete,
    failedStage,
    lastProvisioningError: lastError ? String(lastError) : null,
    retryEligible,
    retryHref: retryEligible
      ? retryHrefFor(productCode, application && application.id, organizationKey)
      : null,
    applicationId: application && application.id ? String(application.id) : null,
    checks,
    stages,
    details,
  };
}

async function loadTenantHealthSummary(db, input) {
  const productCode = String((input && input.productCode) || "").trim();
  let organizationId = input && input.organizationId;
  const organizationKey = input && input.organizationKey;
  if (!organizationId && organizationKey) {
    organizationId = await resolveOrganizationId(db, organizationKey);
  }
  let application = normalizeApplication(input && input.application);
  if (!application || !application.id) {
    application = normalizeApplication(
      await findApplication(db, productCode, {
        applicationId: input && input.applicationId,
        organizationId,
      })
    );
  }
  if (!organizationId && application && application.organization_id) {
    organizationId = application.organization_id;
  }
  const inspect = await inspectOrganizationProvisioningCompleteness(db, {
    productCode,
    organizationId,
    application,
    staffMemberId: input && input.staffMemberId,
  });
  return presentTenantHealthSummary(inspect, {
    productCode,
    application,
    organizationKey: organizationKey || (inspect.details && inspect.details.organizationKey),
  });
}

async function loadTenantHealthSummariesForOrganization(db, input) {
  const organizationKey = String((input && input.organizationKey) || "").trim().toLowerCase();
  const organizationId =
    (input && input.organizationId) || (await resolveOrganizationId(db, organizationKey));
  if (!organizationId) return [];
  let products = await listActiveProductKeys(db, organizationId);
  if (!products.length) {
    const ac = await findApplication(db, PRODUCT.ACTIVECLINIC, { organizationId });
    const bb = await findApplication(db, PRODUCT.BLESSBOARD, { organizationId });
    if (ac) products.push(PRODUCT.ACTIVECLINIC);
    if (bb) products.push(PRODUCT.BLESSBOARD);
  }
  const summaries = [];
  for (const productCode of products) {
    summaries.push(
      await loadTenantHealthSummary(db, {
        productCode,
        organizationId,
        organizationKey,
      })
    );
  }
  return summaries;
}

async function retryTenantProvisioningIfUnhealthy(db, input) {
  const health = await loadTenantHealthSummary(db, input);
  if (health.complete) {
    return { ok: false, code: "already_healthy", health };
  }
  if (!health.retryEligible || !health.applicationId) {
    return { ok: false, code: "not_retryable", health };
  }
  const result = await resumeOrganizationProvisioning(db, {
    productCode: health.productCode,
    applicationId: health.applicationId,
    actorUserId: input && input.actorUserId,
    actorIdentityId: input && (input.actorIdentityId || input.actorUserId),
    dataEnvironment: (input && input.dataEnvironment) || "testing",
    deploymentCode: input && input.deploymentCode,
    env: input && input.env,
  });
  return { ...result, health };
}

module.exports = {
  TONE,
  presentTenantHealthSummary,
  loadTenantHealthSummary,
  loadTenantHealthSummariesForOrganization,
  retryTenantProvisioningIfUnhealthy,
};
