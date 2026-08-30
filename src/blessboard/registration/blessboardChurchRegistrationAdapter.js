"use strict";

const { PRODUCT, REVIEW_REASON, LIFECYCLE } = require("../../platform/registration/constants");
const repo = require("../repositories/platformChurchRegistrationRepository");
const {
  provisionRegisteredBlessBoardChurch,
} = require("../services/provisionRegisteredBlessBoardChurch");
const {
  evaluateRegistrationRisk,
  RISK_DECISIONS,
  RISK_REASON_CODES,
  PUBLIC_REJECT_MESSAGE,
} = require("../services/registrationRiskDecision");
const {
  isNetworkPlanSelection,
  NETWORK_PLAN_CODE,
} = require("../services/platformChurchRegistrationValidation");
const { DUPLICATE_PHONE_MESSAGE } = require("../services/normalizeRegistrationPhone");
const {
  registerBlessBoardWebsiteTemplate,
  BLESSBOARD_TEMPLATE_ID,
  BLESSBOARD_TEMPLATE_VERSION,
} = require("../website/blessboardChurchTemplate");
const {
  seedTenantOwnedWebsiteTemplateContent,
} = require("../services/seedTenantWebsiteTemplateContent");

const productCode = PRODUCT.BLESSBOARD;

function clientMeta(payload) {
  const req = payload && payload.req;
  if (!req) return { source_ip: null, user_agent: null };
  const ip = String(req.ip || (req.connection && req.connection.remoteAddress) || "").slice(0, 64);
  const userAgent = String((req.get && req.get("user-agent")) || "").slice(0, 500);
  return { source_ip: ip || null, user_agent: userAgent || null };
}

function registrationData(payload) {
  if (payload && payload.data && typeof payload.data === "object") return payload.data;
  return payload || {};
}

function mapPersistError(err) {
  if (err && (err.code === "duplicate_registration_phone" || err.name === "DuplicateRegistrationPhoneError")) {
    return {
      error: err.message || DUPLICATE_PHONE_MESSAGE,
      field: "phone",
      code: "duplicate_registration_phone",
      httpStatus: 400,
    };
  }
  if (err && (err.code === "schema_mismatch" || err.name === "PublicRegistrationSchemaMismatchError")) {
    return {
      error: "We could not save your request right now. Please try again shortly.",
      code: "schema_mismatch",
      httpStatus: 503,
    };
  }
  return {
    error: "We could not save your request right now. Please try again shortly.",
    code: err && err.code ? String(err.code) : "db_error",
    pgCode: err && err.code ? String(err.code) : null,
    httpStatus: 503,
  };
}

function riskPersistFields(risk) {
  return {
    application_status: "submitted",
    risk_decision: risk && risk.decision,
    risk_reason_codes: (risk && risk.reasonCodes) || [],
    risk_decided_at: (risk && risk.decidedAt) || new Date().toISOString(),
  };
}

async function validate(payload) {
  const data = registrationData(payload);
  if (!data || !data.church_name) {
    return { ok: false, error: "Please complete the registration form.", field: "church_name" };
  }
  return { ok: true, normalized: data, data };
}

async function findDuplicate() {
  return { block: false };
}

async function persistSubmitted(db, input) {
  const data = input.normalized || {};
  const meta = clientMeta(input.payload);
  let risk = { decision: RISK_DECISIONS.ALLOW, reasonCodes: [] };
  try {
    risk = await evaluateRegistrationRisk(db, {
      data,
      sourceIp: meta.source_ip,
      honeypot: false,
      organizationKey: data.organization_key || null,
    });
  } catch (err) {
    const mapped = mapPersistError(err);
    return {
      ok: false,
      error: mapped.error,
      code: mapped.code || "risk_evaluation_failed",
      pgCode: mapped.pgCode || null,
      httpStatus: mapped.httpStatus || 503,
    };
  }

  if (risk.decision === RISK_DECISIONS.REJECT) {
    if (risk.reasonCodes && risk.reasonCodes.includes(RISK_REASON_CODES.DUPLICATE_PHONE)) {
      return {
        ok: false,
        error: risk.publicMessage || DUPLICATE_PHONE_MESSAGE,
        field: "phone",
        code: "duplicate_registration_phone",
        httpStatus: 400,
        riskDecision: risk.decision,
        riskReasonCodes: risk.reasonCodes,
      };
    }
    return {
      ok: false,
      error: PUBLIC_REJECT_MESSAGE,
      code: "registration_rejected",
      httpStatus: 400,
      field: risk.field || null,
      riskDecision: risk.decision,
      riskReasonCodes: risk.reasonCodes,
    };
  }

  const {
    administrator_password: _pw,
    organization_key: _ok,
    wants_instant_free: _w,
    req: _req,
    provisionFn: _fn,
    ...persistable
  } = data;
  const networkSupport = isNetworkPlanSelection(persistable.selected_plan);
  try {
    const created = await repo.createApplicationIdempotent(db, {
      ...persistable,
      ...meta,
      ...riskPersistFields(risk),
      ...(networkSupport
        ? {
            support_requested: true,
            follow_up_status: "validation_pending",
            selected_plan: NETWORK_PLAN_CODE,
          }
        : {}),
    });
    if (!created.duplicate && created.application && created.application.id) {
      await repo.updateApplicationRiskReviewState(db, created.application.id, {
        reviewEvent: {
          at: new Date().toISOString(),
          action: "submitted",
          actor_type: "applicant",
          product_key: productCode,
        },
      });
    }
    return {
      ok: true,
      application: created.application,
      duplicate: created.duplicate,
      risk,
    };
  } catch (err) {
    const mapped = mapPersistError(err);
    return {
      ok: false,
      error: mapped.error,
      code: mapped.code,
      pgCode: mapped.pgCode || null,
      httpStatus: mapped.httpStatus || 503,
      field: mapped.field || null,
    };
  }
}

async function collectReviewSignals(db, input) {
  const data = input.normalized || {};
  const meta = clientMeta(input.payload);
  let risk = { decision: RISK_DECISIONS.ALLOW, reasonCodes: [] };
  try {
    risk = await evaluateRegistrationRisk(db, {
      data,
      sourceIp: meta.source_ip,
      honeypot: false,
      organizationKey: data.organization_key || null,
    });
  } catch {
    risk = { decision: RISK_DECISIONS.REVIEW_REQUIRED, reasonCodes: ["risk_evaluation_failed"] };
  }
  const networkPlan = isNetworkPlanSelection(data.selected_plan);
  const missingCredentials = !data.administrator_password || !data.organization_key;
  return {
    networkPlan,
    plan: data.selected_plan || null,
    riskHold: risk.decision === RISK_DECISIONS.REVIEW_REQUIRED,
    riskReason: REVIEW_REASON.RISK_HOLD,
    riskDecision: risk.decision,
    riskReasonCodes: risk.reasonCodes || [],
    manualPlatformHold: missingCredentials && !networkPlan,
    extraReasons: [],
  };
}

async function markReviewRequired(db, input) {
  const application = input.application;
  if (!application || !application.id) return { ok: false };
  const reason = String(input.reason || "");
  await repo.updateApplicationRiskReviewState(db, application.id, {
    applicationStatus: LIFECYCLE.REVIEW_REQUIRED,
    reviewNotes: reason.slice(0, 500),
    reviewEvent: {
      at: new Date().toISOString(),
      action: "review_required",
      reason_codes: Array.isArray(input.reasons) ? input.reasons.slice(0, 20) : [reason].filter(Boolean),
    },
  });
  return { ok: true };
}

async function provision(db, input) {
  const data = input.normalized || {};
  const password = data.administrator_password;
  const organizationKey = data.organization_key;
  if (!password || !organizationKey) {
    return {
      ok: false,
      reviewRequired: true,
      reason: REVIEW_REASON.MANUAL_PLATFORM_HOLD,
      code: "password_or_organization_key_required",
    };
  }
  const provisionFn =
    (input.payload && input.payload.provisionFn) || provisionRegisteredBlessBoardChurch;
  const provisioned = await provisionFn(
    db,
    {
      applicationId: input.application.id,
      administratorPassword: password,
      requestedOrganizationKey: organizationKey,
      requestId: input.payload && input.payload.req && input.payload.req.requestId,
      actorContext: {
        type: "public_self_registration",
        source: "register_church",
        dataEnvironment: input.dataEnvironment || "testing",
        deploymentCode: input.deploymentCode || "blessboard-org-v5",
      },
    },
    { allowRetry: true }
  );
  if (!provisioned.ok) {
    const status = String(provisioned.status || "");
    if (status === "duplicate_email_review" || status === "DUPLICATE_EMAIL_REVIEW") {
      return {
        ok: false,
        reviewRequired: true,
        reason: REVIEW_REASON.DUPLICATE_CANDIDATE,
        code: status,
        provisioned,
      };
    }
    return {
      ok: false,
      reviewRequired: false,
      reason: REVIEW_REASON.PROVISION_FAILURE,
      code: status || "provisioning_failed",
      provisioned,
    };
  }
  const records = provisioned.records || {};
  return {
    ok: true,
    organizationId: records.organizationId || null,
    identityId: records.administratorUserId || null,
    application: input.application,
    provisioned,
    records,
    alreadyProvisioned: Boolean(provisioned.alreadyProvisioned),
  };
}

async function markLifecycle(db, input) {
  const application = input.application;
  if (!application || !application.id) return { ok: false };
  const status = String(input.status || "");
  if (status === LIFECYCLE.PROVISIONING) {
    await repo.updateApplicationRiskReviewState(db, application.id, {
      applicationStatus: LIFECYCLE.PROVISIONING,
      reviewNotes: "provisioning",
    });
    return { ok: true };
  }
  if (status === LIFECYCLE.ACTIVE) {
    await repo.updateApplicationProvisioningState(db, application.id, {
      applicationStatus: LIFECYCLE.ACTIVE,
      provisioningStatus: "provisioned",
      organizationId: input.organizationId || undefined,
      provisionedAt: new Date().toISOString(),
      clearFailureMetadata: true,
      // Legacy column CHECK allows only pending/contacted/closed.
      legacyStatus: "closed",
    });
    return { ok: true };
  }
  if (status === LIFECYCLE.PROVISION_FAILED) {
    await repo.updateApplicationProvisioningState(db, application.id, {
      applicationStatus: LIFECYCLE.PROVISION_FAILED,
      provisioningStatus: "provisioning_failed",
      organizationId: input.organizationId || undefined,
      provisioningFailedAt: new Date().toISOString(),
      provisioningErrorCode: String(input.reason || "provision_failed").slice(0, 80),
      lastProvisionStage: input.failedStage || "website_instance",
    });
    return { ok: true };
  }
  return { ok: false };
}

async function websiteDefaults(input) {
  registerBlessBoardWebsiteTemplate();
  const records =
    (input.provision && (input.provision.records || (input.provision.provisioned && input.provision.provisioned.records))) ||
    {};
  const slug =
    records.organizationKey ||
    (input.application && input.application.organization_key) ||
    String(input.organizationId || "").slice(0, 8);
  if (!slug) return { skip: true, reason: "slug_unavailable" };
  return {
    templateId: BLESSBOARD_TEMPLATE_ID,
    templateVersion: BLESSBOARD_TEMPLATE_VERSION,
    slug,
    status: "coming_soon",
    scopeKind: records.branchId ? "branch" : "church_wide",
    scopeRef: records.branchId || null,
    contentOverrides: {},
    seedDefaults: false,
    adapterMode: "shared_engine",
    publishPolicy: "TENANT_PUBLISH",
    lifecycleStatus: "provisional",
  };
}

async function seedTemplateContent(db, input) {
  const records =
    (input.provision &&
      (input.provision.records ||
        (input.provision.provisioned && input.provision.provisioned.records))) ||
    {};
  const application = input.application || {};
  let churchId =
    records.churchId ||
    (records.church && records.church.id) ||
    null;
  if (!churchId && input.organizationId) {
    const row = await db.query(
      `SELECT id FROM blessboard.churches WHERE organization_id = $1 LIMIT 1`,
      [input.organizationId]
    );
    churchId = row.rows[0] ? row.rows[0].id : null;
  }
  if (!churchId) return { ok: false, skipped: true, reason: "church_unavailable" };
  const publicName =
    application.church_name ||
    application.churchName ||
    (records.church && records.church.displayName) ||
    "Church";
  const city = application.city || "";
  const seeded = await seedTenantOwnedWebsiteTemplateContent(db, {
    churchId,
    publicName,
    primaryEmail: application.contact_email || application.email || null,
    primaryPhone: application.contact_phone || application.phone || null,
    address: application.address || city || null,
    city,
  });
  const {
    seedUnpublishedEngineContent,
  } = require("../website/blessboardEngineContentService");
  await seedUnpublishedEngineContent(db, {
    organizationId: input.organizationId,
    churchId,
    branchId: records.branchId || null,
    slug: records.organizationKey || null,
  });
  return seeded;
}

async function approve(db, input) {
  const { approveAndProvisionRegistrationApplication } = require("../services/registrationApplicationsAdminService");
  return approveAndProvisionRegistrationApplication(db, input);
}

async function reject(db, input) {
  const { rejectRegistrationApplication } = require("../services/registrationApplicationsAdminService");
  return rejectRegistrationApplication(db, input);
}

module.exports = {
  productCode,
  validate,
  findDuplicate,
  persistSubmitted,
  collectReviewSignals,
  markReviewRequired,
  provision,
  websiteDefaults,
  seedTemplateContent,
  markLifecycle,
  approve,
  reject,
};
