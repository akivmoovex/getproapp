"use strict";

const { PRODUCT, REVIEW_REASON } = require("../../platform/registration/constants");
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
const instanceRepo = require("../../platform/website/instanceRepository");

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
  const reviewRequired = risk && risk.decision === RISK_DECISIONS.REVIEW_REQUIRED;
  return {
    application_status: reviewRequired ? "duplicate_review" : "submitted",
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
  const legacyDuplicate =
    reason === REVIEW_REASON.DUPLICATE_CANDIDATE ||
    reason === REVIEW_REASON.RISK_HOLD ||
    reason === "duplicate_email";
  const applicationStatus = legacyDuplicate ? "duplicate_review" : "review_required";
  try {
    await repo.updateApplicationRiskReviewState(db, application.id, {
      applicationStatus,
      reviewNotes: reason.slice(0, 500),
    });
  } catch {
    await repo.updateApplicationRiskReviewState(db, application.id, {
      applicationStatus: "duplicate_review",
      reviewNotes: reason.slice(0, 500),
    });
  }
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
  ensureWebsite,
  approve,
  reject,
};
