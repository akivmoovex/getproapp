"use strict";

/**
 * Apex-only platform-admin shell.
 * Dashboard, org directory, plans/entitlements, deployments, settings.
 * Writes limited to plan assign, billing activation (manual external), and entitlement override
 * (CSRF + confirmation). No payment-provider APIs, card collection, DNS automation, or
 * destructive controls.
 */

const express = require("express");
const { renderV5Ejs } = require("../../blessboard/http/v5EjsTemplateCache");
const { createV5AuthLogger } = require("./v5AuthObservability");

const {
  listActiveAuthorizationRoles,
  findUserStatusById,
} = require("../../blessboard/repositories/blessBoardAuthorizationRepository");
const {
  listPlatformOrganizations,
  getPlatformAdminDashboardStats,
  STATUS: LIST_STATUS,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  ALLOWED_LIMITS,
  ALLOWED_PRODUCTS,
  ALLOWED_ONBOARDING,
  ALLOWED_FOLLOW_UP: ORG_FOLLOW_UP_FILTERS,
  ALLOWED_PUBLICATION,
  ALLOWED_PLANS,
} = require("../services/listPlatformOrganizations");
const {
  listPlatformAdminOpsAlerts,
  STATUS: OPS_ALERTS_STATUS,
  DEFAULT_LIMIT: OPS_ALERTS_DEFAULT_LIMIT,
  MAX_LIMIT: OPS_ALERTS_MAX_LIMIT,
  ALLOWED_LIMITS: OPS_ALERTS_ALLOWED_LIMITS,
} = require("../services/platformAdminOpsAlerts");
const {
  getPlatformAdminRegistrationAnalytics,
  STATUS: ANALYTICS_STATUS,
  ALLOWED_ANALYTICS_RANGES,
  DEFAULT_ANALYTICS_RANGE_DAYS,
} = require("../services/platformAdminRegistrationAnalyticsService");
const {
  getPlatformOrganizationSummary,
  STATUS: DETAIL_STATUS,
} = require("../services/getPlatformOrganizationSummary");
const {
  listPlatformPlansCatalogue,
  STATUS: PLANS_STATUS,
} = require("../services/listPlatformPlansCatalogue");
const {
  listPlatformSubscriptions,
  STATUS: SUBSCRIPTIONS_STATUS,
  DEFAULT_LIMIT: SUB_DEFAULT_LIMIT,
  MAX_LIMIT: SUB_MAX_LIMIT,
  ALLOWED_LIMITS: SUB_ALLOWED_LIMITS,
  ALLOWED_STATUSES: SUB_ALLOWED_STATUSES,
} = require("../services/listPlatformSubscriptions");
const {
  listPlatformDomains,
  STATUS: DOMAINS_STATUS,
  DEFAULT_LIMIT: DOMAIN_DEFAULT_LIMIT,
  MAX_LIMIT: DOMAIN_MAX_LIMIT,
  ALLOWED_LIMITS: DOMAIN_ALLOWED_LIMITS,
  ALLOWED_STATUSES: DOMAIN_ALLOWED_STATUSES,
  ALLOWED_DOMAIN_TYPES,
} = require("../services/listPlatformDomains");
const {
  getPlatformDomainDetail,
  updatePlatformDomainStatus,
  assignPlatformDomainOrganization,
  STATUS: DOMAIN_DETAIL_STATUS,
  ALLOWED_STATUSES: DOMAIN_DETAIL_STATUSES,
} = require("../services/platformAdminDomains");
const {
  getPlatformOrganizationEntitlementsView,
  assignOrganizationPlanByKey,
  setOrganizationEntitlementOverrideByKey,
  STATUS: ENTITLEMENTS_ADMIN_STATUS,
} = require("../services/platformAdminEntitlements");
const {
  activatePaidSubscriptionByOrganizationKey,
  STATUS: BILLING_STATUS,
} = require("../services/billingSubscriptionService");
const {
  listPlatformDeployments,
  STATUS: DEPLOY_STATUS,
} = require("../services/listPlatformDeployments");
const {
  getPlatformDeploymentDetail,
  STATUS: DEPLOY_DETAIL_STATUS,
} = require("../services/getPlatformDeploymentDetail");
const {
  listRegistrationApplicationsAdmin,
  getRegistrationApplicationDetail,
  updateRegistrationFollowUpStatus,
  markNetworkValidationComplete,
  assignRegistrationSupport,
  addRegistrationSupportContact,
  rejectRegistrationApplication,
  reopenRegistrationApplication,
  approveAndProvisionRegistrationApplication,
  linkRegistrationApplicationToOrganization,
  STATUS: REG_APP_STATUS,
  DEFAULT_LIMIT: REG_DEFAULT_LIMIT,
  MAX_LIMIT: REG_MAX_LIMIT,
  ALLOWED_LIMITS: REG_ALLOWED_LIMITS,
  QUEUE_FILTERS,
  REJECTION_CATEGORIES,
} = require("../../blessboard/services/registrationApplicationsAdminService");
const {
  getOrganizationOnboardingSummary,
  ONBOARDING_STATUSES,
} = require("../../blessboard/services/organizationOnboardingSummaryService");
const {
  setOrganizationSupportRequested,
  setOrganizationNextFollowUp,
  overrideOrganizationOnboardingStatus,
  updateOrganizationFollowUpStatus,
  assignOrganizationSupport,
  STATUS: ONBOARDING_ADMIN_STATUS,
} = require("../../blessboard/services/organizationOnboardingAdminService");
const registrationAppRepo = require("../../blessboard/repositories/platformChurchRegistrationRepository");
const {
  recordPhoneVerificationAttempt,
} = require("../../blessboard/services/registrationPhoneVerificationService");
const {
  recordInformationRequest,
} = require("../../blessboard/services/registrationApplicationCommunicationService");
const {
  resendRegistrationVerificationEmail,
  RESEND_STATUS: EMAIL_RESEND_STATUS,
} = require("../../blessboard/services/registrationEmailVerificationDelivery");
const {
  loadRegistrationDuplicateMatchesForAdmin,
  loadRegistrationDuplicateComparisonForAdmin,
  STATUS: DUPLICATE_MATCHES_STATUS,
} = require("../../blessboard/services/registrationDuplicateMatchesAdminLoader");
const {
  recordDuplicateMatchReviewDecision,
  STATUS: DUPLICATE_DECISION_STATUS,
} = require("../../blessboard/services/registrationDuplicateReviewDecisionService");
const { formatRoleLabel } = require("../../blessboard/http/renderTenantLandingPage");
const { buildPlatformAdminShellLocals } = require("./platformAdminShellLocals");
const {
  CSRF_FIELD,
  validateCsrf,
} = require("./v5Csrf");
const {
  clearV5SessionCookie,
  readV5SessionCookie,
} = require("../session/v5SessionCookie");
const { revokeV5Session } = require("../session/revokeV5Session");
const { getPlatformDeploymentCode } = require("../config/platformDeploymentCode");
const { getApexOrigin } = require("../../blessboard/http/tenantLoginHelpers");
const {
  inviteBlessBoardStaff,
  listPendingInvitations,
} = require("../../blessboard/services/inviteBlessBoardStaff");

const INVITE_ONCE_COOKIE = "bb_pa_invite_once";
const INVITE_ONCE_MAX_AGE_MS = 5 * 60 * 1000;
const {
  createGrowthTrialOffer,
  cancelGrowthTrialOffer,
  grantGrowthTrialException,
  getGrowthTrialOfferState,
  STATUS: GROWTH_TRIAL_OFFER_STATUS,
} = require("../services/growthTrialOfferService");
const { isTestingDataMaintenanceAllowed } = require("../config/testingDataMaintenance");
const {
  loadMaintenancePageModel,
  previewTestingDataReset,
  executeTestingDataReset,
  FULL_RESET_CONFIRM_PHRASE,
  CATEGORY_ACTIONS,
  STATUS: MAINT_STATUS,
} = require("../services/testingDataResetService");
const { parseSessionSecret } = require("../config/v5EnvValidation");
const {
  ORGANIZATION_RESERVED_SLUGS,
  BRANCH_HOST_RESERVED_SLUGS,
} = require("../../church/platformProvisioningValidation");

/**
 * @param {string} relativePath
 * @param {object} data
 */
function renderPlatformAdminView(relativePath, data) {
  return renderV5Ejs(relativePath, data);
}

/**
 * @param {import('express').Response} res
 */
function setAdminNoStore(res) {
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {number} status
 * @param {string} message
 */
function sendControlled(req, res, status, message) {
  const safe = escapeHtml(message);
  const wantsHtml = String(req.get("accept") || "").includes("text/html");
  if (!wantsHtml) {
    return res.status(status).type("text").send(String(message == null ? "" : message));
  }
  return res.status(status).type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Platform admin · BlessBoard</title>
  <link rel="stylesheet" href="/blessboard/v5/platform-admin.css?v=33" />
</head>
<body class="bb-pa-body">
  <main class="bb-pa-notice">
    <h1>${status === 401 ? "Sign in required" : status === 404 ? "Not found" : "Unavailable"}</h1>
    <p>${safe}</p>
    <p><a href="/">Home</a>${status === 401 ? ' · <a href="/login">Sign in</a>' : ""}</p>
  </main>
</body>
</html>`);
}

/**
 * @param {import('express').Request} req
 * @returns {{ notice: string | null, error: string | null }}
 */
function readFlash(req) {
  const notice = String((req.query && req.query.notice) || "").trim() || null;
  const error = String((req.query && req.query.error) || "").trim() || null;
  return { notice, error };
}

/**
 * One-time copy invite link for platform admin (never put raw token in URL query).
 * @param {import('express').Response} res
 * @param {{ organizationKey: string, inviteLink: string }} payload
 * @param {{ secure?: boolean }} opts
 */
function setInviteOnceCookie(res, payload, opts) {
  const organizationKey = String((payload && payload.organizationKey) || "")
    .trim()
    .toLowerCase();
  const inviteLink = String((payload && payload.inviteLink) || "").trim();
  if (!organizationKey || !inviteLink || !inviteLink.startsWith("http")) return;
  const value = Buffer.from(
    JSON.stringify({ organizationKey, inviteLink }),
    "utf8"
  ).toString("base64url");
  res.cookie(INVITE_ONCE_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: Boolean(opts && opts.secure),
    path: "/admin",
    maxAge: INVITE_ONCE_MAX_AGE_MS,
  });
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {string} organizationKey
 */
function consumeInviteOnceCookie(req, res, organizationKey) {
  const raw = req.cookies && req.cookies[INVITE_ONCE_COOKIE];
  res.clearCookie(INVITE_ONCE_COOKIE, { path: "/admin" });
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(raw), "base64url").toString("utf8"));
    const key = String((parsed && parsed.organizationKey) || "")
      .trim()
      .toLowerCase();
    const inviteLink = String((parsed && parsed.inviteLink) || "").trim();
    if (key !== String(organizationKey || "").trim().toLowerCase()) return null;
    if (!inviteLink || !inviteLink.startsWith("http")) return null;
    return inviteLink;
  } catch {
    return null;
  }
}

function buildAdministratorInviteLink(rawToken, env) {
  const token = String(rawToken || "").trim();
  if (!token) return null;
  return `${getApexOrigin(env)}/invite/accept?token=${encodeURIComponent(token)}`;
}

function mapApproveError(result) {
  if (!result || result.ok) return null;
  if (result.status === REG_APP_STATUS.INVALID_INPUT) {
    if (result.message === "administrator_email_required") return "administrator_email_required";
    return "invalid";
  }
  if (result.status === REG_APP_STATUS.NOT_FOUND) return "not_found";
  if (result.status === REG_APP_STATUS.NOT_ELIGIBLE) {
    if (result.message === "network_validation_required") return "network_validation_required";
    return "not_eligible";
  }
  if (result.status === REG_APP_STATUS.PROVISION_FAILED) return "provision_failed";
  return "approve_failed";
}

const PHONE_VERIFY_ATTEMPT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * HTTP-boundary parse for phone-verification attempt forms.
 * Does not apply business rules (verified requires answered, etc.) — those stay in the service.
 * @param {unknown} body
 * @param {string} applicationIdFromRoute
 * @returns {{ ok: true, input: object } | { ok: false, code: string }}
 */
function parsePhoneVerificationAttemptForm(body, applicationIdFromRoute) {
  const applicationId = String(applicationIdFromRoute || "").trim();
  if (!PHONE_VERIFY_ATTEMPT_UUID_RE.test(applicationId)) {
    return { ok: false, code: "invalid_application_id" };
  }

  const src = body && typeof body === "object" ? body : {};

  function asOptionalString(value, max) {
    if (value == null) return { ok: true, value: null };
    if (typeof value !== "string" && typeof value !== "number") {
      return { ok: false, code: "invalid" };
    }
    const trimmed = String(value).trim();
    if (!trimmed) return { ok: true, value: null };
    if (trimmed.length > max) return { ok: false, code: "invalid" };
    return { ok: true, value: trimmed };
  }

  function asRequiredString(value, max) {
    if (value == null || (typeof value !== "string" && typeof value !== "number")) {
      return { ok: false, code: "invalid" };
    }
    const trimmed = String(value).trim();
    if (!trimmed) return { ok: false, code: "invalid" };
    if (trimmed.length > max) return { ok: false, code: "invalid" };
    return { ok: true, value: trimmed };
  }

  function asEnumString(value, { required }) {
    if (value == null || value === "") {
      return required ? { ok: false, code: "invalid" } : { ok: true, value: null };
    }
    if (typeof value !== "string") return { ok: false, code: "invalid" };
    const trimmed = value.trim();
    if (!trimmed) return required ? { ok: false, code: "invalid" } : { ok: true, value: null };
    return { ok: true, value: trimmed };
  }

  function asDate(value, { required }) {
    if (value == null || value === "") {
      return required ? { ok: false, code: "invalid" } : { ok: true, value: null };
    }
    if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) {
      return { ok: false, code: "invalid" };
    }
    const d = value instanceof Date ? value : new Date(String(value).trim());
    if (Number.isNaN(d.getTime())) return { ok: false, code: "invalid" };
    return { ok: true, value: d };
  }

  const phone = asRequiredString(src.phone_number_called, 64);
  if (!phone.ok) {
    return { ok: false, code: phone.code === "invalid" && !String(src.phone_number_called || "").trim()
      ? "phone_required"
      : "invalid" };
  }

  const country = asOptionalString(src.country, 120);
  if (!country.ok) return country;

  const contactPersonName = asOptionalString(src.contact_person_name, 200);
  if (!contactPersonName.ok) return contactPersonName;

  const contactPersonRole = asOptionalString(src.contact_person_role, 120);
  if (!contactPersonRole.ok) return contactPersonRole;

  const attemptedAt = asDate(src.attempted_at, { required: true });
  if (!attemptedAt.ok) return attemptedAt;

  const outcome = asEnumString(src.outcome, { required: true });
  if (!outcome.ok) return outcome;

  const applicantIdentityStatus = asEnumString(src.applicant_identity_status, { required: false });
  if (!applicantIdentityStatus.ok) return applicantIdentityStatus;

  const applicantAuthorityStatus = asEnumString(src.applicant_authority_status, { required: false });
  if (!applicantAuthorityStatus.ok) return applicantAuthorityStatus;

  const verificationResult = asEnumString(src.verification_result, { required: false });
  if (!verificationResult.ok) return verificationResult;

  const verificationReason = asOptionalString(src.verification_reason, 1000);
  if (!verificationReason.ok) return verificationReason;

  const notes = asOptionalString(src.notes, 5000);
  if (!notes.ok) return notes;

  const followUpAt = asDate(src.follow_up_at, { required: false });
  if (!followUpAt.ok) return followUpAt;

  return {
    ok: true,
    input: {
      applicationId,
      phoneNumberCalled: phone.value,
      country: country.value,
      contactPersonName: contactPersonName.value,
      contactPersonRole: contactPersonRole.value,
      attemptedAt: attemptedAt.value,
      outcome: outcome.value,
      applicantIdentityStatus: applicantIdentityStatus.value,
      applicantAuthorityStatus: applicantAuthorityStatus.value,
      verificationResult: verificationResult.value,
      verificationReason: verificationReason.value,
      notes: notes.value,
      followUpAt: followUpAt.value,
    },
  };
}

/**
 * Map service/parse failures to safe redirect error codes (no SQL/stack leakage).
 * @param {unknown} err
 */
function mapPhoneVerificationAttemptError(err) {
  const code = err && (err.code || err.message) ? String(err.code || err.message) : "";
  if (
    code === "invalid_application_id" ||
    code === "application_id_required" ||
    code === "not_found"
  ) {
    return "not_found";
  }
  if (
    code === "phone_required" ||
    code === "phone_number_called_required" ||
    code === "attempted_at_required" ||
    code === "invalid_phone_verification_outcome" ||
    code === "invalid_applicant_identity_status" ||
    code === "invalid_applicant_authority_status" ||
    code === "invalid_verification_result" ||
    code === "verification_reason_required" ||
    code === "verified_requires_answered_outcome" ||
    code === "verified_requires_identity_confirmed" ||
    code === "authority_confirmed_requires_answered_outcome" ||
    code === "invalid_phone_number" ||
    code === "invalid" ||
    code === "phone_number_invalid"
  ) {
    return "invalid";
  }
  return "phone_attempt_failed";
}

/**
 * Map email-verification resend failures to safe redirect error codes (no token leakage).
 * @param {unknown} resultOrErr
 */
function mapEmailVerificationResendError(resultOrErr) {
  const code =
    resultOrErr && resultOrErr.code != null
      ? String(resultOrErr.code)
      : resultOrErr && resultOrErr.message
        ? String(resultOrErr.message)
        : "";
  if (code === EMAIL_RESEND_STATUS.COOLDOWN || code === "resend_cooldown" || code === "cooldown") {
    return "cooldown";
  }
  if (
    code === EMAIL_RESEND_STATUS.INVALID_EMAIL ||
    code === "invalid_email" ||
    code === "email_required"
  ) {
    return "invalid_email";
  }
  if (
    code === EMAIL_RESEND_STATUS.SENDING_UNAVAILABLE ||
    code === "email_sending_unavailable"
  ) {
    return "email_sending_unavailable";
  }
  if (code === EMAIL_RESEND_STATUS.NOT_FOUND || code === "not_found" || code === "invalid_application_id") {
    return "not_found";
  }
  return "email_verification_failed";
}

/**
 * Parse multi-value form fields into string arrays (arrays, JSON arrays, or comma-separated).
 * @param {unknown} value
 * @returns {string[]}
 */
function parseRequestInformationListField(value) {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  const raw = String(value).trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v).trim()).filter(Boolean);
      }
    } catch {
      /* fall through to comma split */
    }
  }
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Parse information-request form body. Application/admin IDs never come from the form.
 * @param {object|null|undefined} body
 * @param {string} applicationId
 * @returns {{ ok: true, input: object } | { ok: false, code: string }}
 */
function parseInformationRequestForm(body, applicationId) {
  const id = String(applicationId || "").trim();
  if (!id) return { ok: false, code: "invalid_application_id" };
  const src = body && typeof body === "object" ? body : {};
  return {
    ok: true,
    input: {
      applicationId: id,
      recipient: src.recipient,
      subject: src.subject,
      applicantMessage: src.applicant_message,
      internalNote: src.internal_note,
      requestCategory: src.request_category,
      requestedFields: parseRequestInformationListField(src.requested_fields),
      requestedDocuments: parseRequestInformationListField(src.requested_documents),
      responseDueAt: src.response_due_at,
      channel: src.channel,
    },
  };
}

/**
 * Map information-request failures to safe redirect error codes.
 * @param {unknown} err
 * @returns {string}
 */
function mapInformationRequestError(err) {
  const code = err && err.message != null ? String(err.message) : "";
  if (
    code === "invalid_application_id" ||
    code === "not_found" ||
    code === "application_id_required"
  ) {
    return "not_found";
  }
  if (
    code === "email_sending_unavailable" ||
    code === "sending_unavailable"
  ) {
    return "sending_unavailable";
  }
  if (
    code === "invalid_administrator_id" ||
    code === "recipient_required" ||
    code === "subject_required" ||
    code === "applicant_message_required" ||
    code === "request_category_required" ||
    code === "invalid_request_category" ||
    code === "invalid_email_recipient" ||
    code === "invalid_channel" ||
    code === "invalid_response_deadline" ||
    code === "invalid_requested_array" ||
    code === "invalid" ||
    code.startsWith("invalid_")
  ) {
    return "invalid";
  }
  return "information_request_failed";
}

/**
 * Parse reject form body. Application/admin IDs and delivery/status never come from the form.
 * Legacy `rejection_reason` maps to internal decision note for existing tests/forms.
 * @param {object|null|undefined} body
 * @param {string} applicationId
 * @returns {{ ok: true, input: object } | { ok: false, code: string }}
 */
function parseRejectForm(body, applicationId) {
  const id = String(applicationId || "").trim();
  if (!id) return { ok: false, code: "invalid_application_id" };
  const src = body && typeof body === "object" ? body : {};

  const internalDecisionNote = String(
    src.internal_decision_note != null && String(src.internal_decision_note).trim() !== ""
      ? src.internal_decision_note
      : src.rejection_reason != null
        ? src.rejection_reason
        : ""
  )
    .trim()
    .slice(0, 500);
  if (!internalDecisionNote || internalDecisionNote.length < 3) {
    return { ok: false, code: "rejection_reason_required" };
  }

  let rejectionCategory = null;
  if (src.rejection_category != null && String(src.rejection_category).trim() !== "") {
    rejectionCategory = String(src.rejection_category).trim().toLowerCase();
    if (!REJECTION_CATEGORIES.includes(rejectionCategory)) {
      return { ok: false, code: "invalid_rejection_category" };
    }
  }

  const applicantExplanation = String(
    src.applicant_explanation != null ? src.applicant_explanation : ""
  )
    .trim()
    .slice(0, 8000);

  const notifyRaw = src.notify_applicant;
  const notifyApplicant =
    notifyRaw === true ||
    notifyRaw === 1 ||
    notifyRaw === "1" ||
    String(notifyRaw || "").trim().toLowerCase() === "true" ||
    String(notifyRaw || "").trim().toLowerCase() === "on" ||
    String(notifyRaw || "").trim().toLowerCase() === "yes";

  if (notifyApplicant && !applicantExplanation) {
    return { ok: false, code: "applicant_explanation_required" };
  }

  const hasReapplication = Object.prototype.hasOwnProperty.call(src, "reapplication_allowed");
  let reapplicationAllowed;
  if (hasReapplication) {
    const raw = src.reapplication_allowed;
    if (raw == null || String(raw).trim() === "") {
      reapplicationAllowed = null;
    } else {
      reapplicationAllowed =
        raw === true ||
        raw === 1 ||
        raw === "1" ||
        String(raw).trim().toLowerCase() === "true" ||
        String(raw).trim().toLowerCase() === "on" ||
        String(raw).trim().toLowerCase() === "yes";
    }
  }

  return {
    ok: true,
    input: {
      applicationId: id,
      rejectionCategory,
      internalDecisionNote,
      applicantExplanation: applicantExplanation || null,
      reapplicationAllowed: hasReapplication ? reapplicationAllowed : undefined,
      notifyApplicant,
    },
  };
}

/**
 * Map reject service / parse failures to safe redirect error codes.
 * @param {{ status?: string, message?: string }|null|undefined} result
 * @returns {string}
 */
function mapRejectRouteError(result) {
  const status = result && result.status != null ? String(result.status) : "";
  const message = result && result.message != null ? String(result.message) : "";
  if (
    status === REG_APP_STATUS.NOT_FOUND ||
    message === "not_found" ||
    message === "invalid_application_id"
  ) {
    return "not_found";
  }
  if (status === REG_APP_STATUS.NOT_ELIGIBLE || message === "already_provisioned") {
    return "not_eligible";
  }
  if (
    status === REG_APP_STATUS.INVALID_INPUT ||
    message === "invalid_input" ||
    message === "rejection_reason_required" ||
    message === "invalid_rejection_category" ||
    message === "applicant_explanation_required" ||
    message.startsWith("invalid_")
  ) {
    return "invalid";
  }
  return "reject_failed";
}

/**
 * Parse reopen form body. Application/admin IDs never come from the form.
 * @param {object|null|undefined} body
 * @param {string} applicationId
 * @returns {{ ok: true, input: object } | { ok: false, code: string }}
 */
function parseReopenForm(body, applicationId) {
  const id = String(applicationId || "").trim();
  if (!id) return { ok: false, code: "invalid_application_id" };
  const src = body && typeof body === "object" ? body : {};
  const reason = String(src.reopen_reason != null ? src.reopen_reason : "")
    .trim()
    .slice(0, 500);
  if (!reason || reason.length < 3) {
    return { ok: false, code: "reopen_reason_required" };
  }
  return {
    ok: true,
    input: {
      applicationId: id,
      reason,
    },
  };
}

/**
 * Map reopen service / parse failures to safe redirect error codes.
 * @param {{ status?: string, message?: string }|null|undefined} result
 * @returns {string}
 */
function mapReopenRouteError(result) {
  const status = result && result.status != null ? String(result.status) : "";
  const message = result && result.message != null ? String(result.message) : "";
  if (
    status === REG_APP_STATUS.NOT_FOUND ||
    message === "not_found" ||
    message === "invalid_application_id"
  ) {
    return "not_found";
  }
  if (
    status === REG_APP_STATUS.NOT_ELIGIBLE ||
    message === "not_eligible" ||
    message === "already_provisioned"
  ) {
    return "not_eligible";
  }
  if (
    status === REG_APP_STATUS.INVALID_INPUT ||
    message === "invalid_input" ||
    message === "reopen_reason_required" ||
    message.startsWith("invalid_")
  ) {
    return "invalid";
  }
  return "reopen_failed";
}

/**
 * Map duplicate decision service failures to safe redirect error codes.
 * @param {{ status?: string, message?: string }|null|undefined} result
 * @returns {string}
 */
function mapDuplicateDecisionError(result) {
  const status = result && result.status != null ? String(result.status) : "";
  const message = result && result.message != null ? String(result.message) : "";
  if (status === DUPLICATE_DECISION_STATUS.REASON_REQUIRED || message === "reason_required") {
    return "reason_required";
  }
  if (
    status === DUPLICATE_DECISION_STATUS.INVALID_DECISION ||
    message === "invalid_decision" ||
    message === "invalid_review_decision"
  ) {
    return "invalid_decision";
  }
  if (status === DUPLICATE_DECISION_STATUS.NOT_FOUND || message === "match_not_found") {
    return "not_found";
  }
  if (
    status === DUPLICATE_DECISION_STATUS.INVALID_INPUT ||
    message === "invalid_ids" ||
    message === "invalid_reason"
  ) {
    return "invalid";
  }
  return "decision_failed";
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 *   sendUnavailable?: Function,
 *   findUserStatusById?: Function,
 *   listActiveAuthorizationRoles?: Function,
 *   findRegistrationApplicationById?: Function,
 *   recordPhoneVerificationAttempt?: Function,
 *   resendRegistrationVerificationEmail?: Function,
 *   loadRegistrationDuplicateMatchesForAdmin?: Function,
 *   loadRegistrationDuplicateComparisonForAdmin?: Function,
 *   recordDuplicateMatchReviewDecision?: Function,
 *   log?: Function,
 * }} deps
 */
function createPlatformAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const isProduction = String(env.NODE_ENV || "") === "production";
  const authLog = createV5AuthLogger({
    log: typeof deps.log === "function" ? deps.log : undefined,
  });
  const findUserStatusByIdFn =
    typeof deps.findUserStatusById === "function" ? deps.findUserStatusById : findUserStatusById;
  const listActiveAuthorizationRolesFn =
    typeof deps.listActiveAuthorizationRoles === "function"
      ? deps.listActiveAuthorizationRoles
      : listActiveAuthorizationRoles;
  const findRegistrationApplicationByIdFn =
    typeof deps.findRegistrationApplicationById === "function"
      ? deps.findRegistrationApplicationById
      : (db, id) => registrationAppRepo.getRegistrationApplicationById(db, id);
  const recordPhoneVerificationAttemptFn =
    typeof deps.recordPhoneVerificationAttempt === "function"
      ? deps.recordPhoneVerificationAttempt
      : recordPhoneVerificationAttempt;
  const recordInformationRequestFn =
    typeof deps.recordInformationRequest === "function"
      ? deps.recordInformationRequest
      : recordInformationRequest;
  const updateApplicationSupportFollowUpFn =
    typeof deps.updateApplicationSupportFollowUp === "function"
      ? deps.updateApplicationSupportFollowUp
      : (client, applicationId, patch) =>
          registrationAppRepo.updateApplicationSupportFollowUp(client, applicationId, patch);
  const resendRegistrationVerificationEmailFn =
    typeof deps.resendRegistrationVerificationEmail === "function"
      ? deps.resendRegistrationVerificationEmail
      : resendRegistrationVerificationEmail;
  const loadRegistrationDuplicateMatchesForAdminFn =
    typeof deps.loadRegistrationDuplicateMatchesForAdmin === "function"
      ? deps.loadRegistrationDuplicateMatchesForAdmin
      : loadRegistrationDuplicateMatchesForAdmin;
  const loadRegistrationDuplicateComparisonForAdminFn =
    typeof deps.loadRegistrationDuplicateComparisonForAdmin === "function"
      ? deps.loadRegistrationDuplicateComparisonForAdmin
      : loadRegistrationDuplicateComparisonForAdmin;
  const recordDuplicateMatchReviewDecisionFn =
    typeof deps.recordDuplicateMatchReviewDecision === "function"
      ? deps.recordDuplicateMatchReviewDecision
      : recordDuplicateMatchReviewDecision;
  const rejectRegistrationApplicationFn =
    typeof deps.rejectRegistrationApplication === "function"
      ? deps.rejectRegistrationApplication
      : rejectRegistrationApplication;
  const reopenRegistrationApplicationFn =
    typeof deps.reopenRegistrationApplication === "function"
      ? deps.reopenRegistrationApplication
      : reopenRegistrationApplication;
  const router = express.Router();

  function requireApex(req, res, next) {
    if (!isApexHost(req)) {
      if (typeof sendUnavailable === "function") {
        return sendUnavailable(req, res);
      }
      return res.status(503).type("text").send("Unavailable");
    }
    return next();
  }

  async function requirePlatformAdmin(req, res, next) {
    try {
      const session =
        req.v5Session && req.v5Session.authenticated && req.v5Session.session
          ? req.v5Session.session
          : null;
      if (!session) {
        authLog.logAuthEvent(req, "platform_admin_denied", {
          outcome: "denied",
          failureCategory: "unauthenticated",
          cookieHeaderPresent: Boolean(req.headers && req.headers.cookie),
          sessionFound: false,
        });
        const wantsHtml = String(req.get("accept") || "").includes("text/html");
        if (wantsHtml) {
          return res.redirect(
            303,
            `/login?next=${encodeURIComponent(req.originalUrl || "/admin")}`
          );
        }
        return sendControlled(req, res, 401, "Sign-in is required.");
      }

      const pool = getPool();
      if (!pool || typeof pool.query !== "function") {
        authLog.logAuthEvent(req, "platform_admin_unexpected_error", {
          outcome: "error",
          failureCategory: "pool_unavailable",
          sessionFound: true,
        });
        return sendControlled(req, res, 503, "Platform admin is temporarily unavailable.");
      }

      const user = await findUserStatusByIdFn(pool, session.userId);
      if (!user || String(user.status) !== "active") {
        authLog.logAuthEvent(req, "platform_admin_denied", {
          outcome: "denied",
          failureCategory: "inactive_user",
          sessionFound: true,
        });
        return sendControlled(req, res, 401, "Sign-in is required.");
      }

      const roles = await listActiveAuthorizationRolesFn(pool, session.userId);
      const isPlatformAdmin = roles.some((r) => r.roleKey === "platform_admin");
      if (!isPlatformAdmin) {
        authLog.logAuthEvent(req, "platform_admin_denied", {
          outcome: "denied",
          failureCategory: "missing_platform_admin_role",
          sessionFound: true,
          roleKeys: roles,
        });
        return sendControlled(req, res, 403, "You do not have access to platform administration.");
      }

      req.platformAdminContext = {
        authenticated: true,
        authorized: true,
        userId: session.userId,
        displayName: session.user && session.user.displayName ? session.user.displayName : "",
        roleLabel: formatRoleLabel("platform_admin"),
      };
      authLog.logAuthEvent(req, "platform_admin_authorized", {
        outcome: "ok",
        sessionFound: true,
        roleKeys: ["platform_admin"],
      });
      return next();
    } catch (err) {
      authLog.logAuthEvent(req, "platform_admin_unexpected_error", {
        outcome: "error",
        failureCategory: "unexpected",
        sessionFound: Boolean(req.v5Session && req.v5Session.authenticated),
      });
      // eslint-disable-next-line no-console
      console.error("[platform-admin] requirePlatformAdmin unexpected failure", {
        path: String(req.originalUrl || req.path || "").slice(0, 200),
        message: err && err.message ? String(err.message).slice(0, 200) : "unknown",
      });
      return sendControlled(req, res, 503, "Platform admin is temporarily unavailable.");
    }
  }

  function shellLocals(req, res, activeNav, extra) {
    return buildPlatformAdminShellLocals(req, res, {
      env,
      isProduction,
      activeNav,
      pageTitle: extra && extra.pageTitle,
      extra,
    });
  }

  router.get("/admin", requireApex, requirePlatformAdmin, async (req, res) => {
    const startedAt = Date.now();
    const [statsResult, list, alertsResult, analyticsResult] = await Promise.all([
      getPlatformAdminDashboardStats(getPool()),
      listPlatformOrganizations(getPool(), { page: 1, limit: 5 }),
      listPlatformAdminOpsAlerts(getPool(), {
        page: req.query.alerts_page,
        limit: req.query.alerts_limit,
      }),
      getPlatformAdminRegistrationAnalytics(getPool(), {
        analyticsRange: req.query.analytics_range,
      }),
    ]);
    if (analyticsResult.status === ANALYTICS_STATUS.INVALID_INPUT) {
      return sendControlled(req, res, 400, "Invalid analytics date range.");
    }

    // Organization list is required for the dashboard shell. Stats/alerts/analytics
    // soft-degrade so platform-admin authentication is never blocked by optional metrics.
    if (!list.ok && list.status === LIST_STATUS.LOOKUP_ERROR) {
      authLog.logAuthEvent(req, "apex_login_directory_lookup_failed", {
        outcome: "failed",
        failureCategory: "organization_list_lookup",
        operation: "listPlatformOrganizations",
        durationMs: Date.now() - startedAt,
      });
      return sendControlled(req, res, 503, "Organization directory is temporarily unavailable.");
    }

    let directoryWarning = null;
    if (!statsResult.ok && statsResult.status === LIST_STATUS.LOOKUP_ERROR) {
      authLog.logAuthEvent(req, "apex_login_directory_lookup_failed", {
        outcome: "failed",
        failureCategory: "dashboard_stats_lookup",
        operation: "getPlatformAdminDashboardStats",
        pgCode: statsResult.pgCode || null,
        schema: statsResult.schema || null,
        relation: statsResult.relation || null,
        column: statsResult.column || null,
        durationMs: Date.now() - startedAt,
      });
      directoryWarning =
        "Some platform overview metrics are temporarily unavailable. Sign-in and organization management remain available.";
    } else if (
      !alertsResult.ok &&
      alertsResult.status === OPS_ALERTS_STATUS.LOOKUP_ERROR
    ) {
      authLog.logAuthEvent(req, "apex_login_directory_lookup_failed", {
        outcome: "failed",
        failureCategory: "ops_alerts_lookup",
        operation: "listPlatformAdminOpsAlerts",
        durationMs: Date.now() - startedAt,
      });
      directoryWarning =
        "Registration operations alerts are temporarily unavailable. Sign-in and organization management remain available.";
    } else if (
      !analyticsResult.ok &&
      analyticsResult.status === ANALYTICS_STATUS.LOOKUP_ERROR
    ) {
      authLog.logAuthEvent(req, "apex_login_directory_lookup_failed", {
        outcome: "failed",
        failureCategory: "registration_analytics_lookup",
        operation: "getPlatformAdminRegistrationAnalytics",
        durationMs: Date.now() - startedAt,
      });
      directoryWarning =
        "Registration analytics are temporarily unavailable. Sign-in and organization management remain available.";
    }

    const orgTotal =
      (statsResult.stats && statsResult.stats.totalOrganizations) || list.total || 0;
    if (list.ok && Number(orgTotal) === 0) {
      authLog.logAuthEvent(req, "apex_login_directory_empty", {
        outcome: "ok",
        failureCategory: "empty_directory",
        operation: "listPlatformOrganizations",
        durationMs: Date.now() - startedAt,
      });
    }

    const stats = statsResult.stats || {};
    const html = renderPlatformAdminView(
      "platform-admin/dashboard.ejs",
      shellLocals(req, res, "home", {
        pageTitle: "Platform admin",
        directorySample: list.organizations || [],
        directoryWarning,
        totalOrganizations: stats.totalOrganizations || list.total || 0,
        organizationsWithChurch: stats.organizationsWithChurch || 0,
        recentFoundationRegistrations: stats.recentFoundationRegistrations || 0,
        activeGrowthTrials: stats.activeGrowthTrials || 0,
        growthTrialsEndingSoon: stats.growthTrialsEndingSoon || 0,
        growthSubscriptionsInGrace: stats.growthSubscriptionsInGrace || 0,
        registrationsRequiringReview: stats.registrationsRequiringReview || 0,
        pendingNetworkSupportRequests: stats.pendingNetworkSupportRequests || 0,
        newRegistrations7d: stats.newRegistrations7d || 0,
        provisioningFailures: stats.provisioningFailures || 0,
        foundationEligibleForGrowthTrial: stats.foundationEligibleForGrowthTrial || 0,
        growthTrialOffersPending: stats.growthTrialOffersPending || 0,
        foundationOriginActiveTrials: stats.foundationOriginActiveTrials || 0,
        foundationTrialOffersConsumed: stats.foundationTrialOffersConsumed || 0,
        paidGrowthSubscriptions: stats.paidGrowthSubscriptions || 0,
        networkValidationPending: stats.networkValidationPending || 0,
        networkValidationInProgress: stats.networkValidationInProgress || 0,
        networkAwaitingApplicant: stats.networkAwaitingApplicant || 0,
        networkApprovedNotProvisioned: stats.networkApprovedNotProvisioned || 0,
        networkFirstContactOverdue: stats.networkFirstContactOverdue || 0,
        opsAlerts: alertsResult.alerts || [],
        opsAlertsPage: alertsResult.page || 1,
        opsAlertsLimit: alertsResult.limit || OPS_ALERTS_DEFAULT_LIMIT,
        opsAlertsTotal: alertsResult.total || 0,
        opsAlertsTotalPages: alertsResult.totalPages || 0,
        opsAlertsAllowedLimits: OPS_ALERTS_ALLOWED_LIMITS,
        opsAlertsMaxLimit: OPS_ALERTS_MAX_LIMIT,
        registrationAnalytics: analyticsResult.analytics || null,
        analyticsAllowedRanges: ALLOWED_ANALYTICS_RANGES,
        analyticsDefaultRange: DEFAULT_ANALYTICS_RANGE_DAYS,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/admin/account", requireApex, requirePlatformAdmin, (req, res) => {
    const deployment = getPlatformDeploymentCode(env);
    const html = renderPlatformAdminView(
      "platform-admin/account.ejs",
      shellLocals(req, res, "account", {
        pageTitle: "Account",
        deploymentCode: deployment && deployment.ok ? deployment.code : "",
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.post("/admin/logout", requireApex, async (req, res) => {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return res.status(403).type("text").send("Invalid or missing CSRF token.");
    }
    const deployment = getPlatformDeploymentCode(env);
    const rawToken = readV5SessionCookie(req, env);
    try {
      if (deployment.ok && deployment.code && rawToken) {
        await revokeV5Session(getPool(), {
          rawToken,
          deploymentCode: deployment.code,
        });
      }
    } catch {
      /* fail-open clear cookie */
    }
    clearV5SessionCookie(res, { secure: isProduction, env });
    return res.redirect(303, "/login");
  });

  router.get("/admin/organizations", requireApex, requirePlatformAdmin, async (req, res) => {
    setAdminNoStore(res);
    const list = await listPlatformOrganizations(getPool(), {
      page: req.query.page,
      limit: req.query.limit,
      q: req.query.q,
      product: req.query.product,
      onboarding: req.query.onboarding,
      follow_up: req.query.follow_up,
      support_requested: req.query.support_requested,
      publication: req.query.publication,
      plan: req.query.plan,
    });
    if (!list.ok) {
      if (list.status === LIST_STATUS.INVALID_INPUT) {
        return sendControlled(req, res, 400, "Invalid list parameters.");
      }
      return sendControlled(req, res, 503, "Organization directory is temporarily unavailable.");
    }
    const html = renderPlatformAdminView(
      "platform-admin/organizations.ejs",
      shellLocals(req, res, "organizations", {
        pageTitle: "Organizations",
        organizations: list.organizations,
        page: list.page,
        limit: list.limit,
        total: list.total,
        totalPages: list.totalPages,
        keyPrefix: list.keyPrefix || "",
        filters: list.filters || {},
        defaultLimit: DEFAULT_LIMIT,
        maxLimit: MAX_LIMIT,
        allowedLimits: ALLOWED_LIMITS,
        allowedProducts: ALLOWED_PRODUCTS,
        allowedOnboarding: ALLOWED_ONBOARDING,
        allowedFollowUp: ORG_FOLLOW_UP_FILTERS,
        allowedPublication: ALLOWED_PUBLICATION,
        allowedPlans: ALLOWED_PLANS,
        rangeFrom: list.total === 0 ? 0 : (list.page - 1) * list.limit + 1,
        rangeTo: Math.min(list.page * list.limit, list.total),
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get(
    "/admin/registration-applications",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const list = await listRegistrationApplicationsAdmin(getPool(), {
        page: req.query.page,
        limit: req.query.limit,
        q: req.query.q,
        application_status: req.query.application_status,
        provisioning_status: req.query.provisioning_status,
        follow_up_status: req.query.follow_up_status,
        selected_plan: req.query.selected_plan || req.query.plan,
        support_requested: req.query.support_requested,
        requires_review: req.query.requires_review,
        overdue_follow_up: req.query.overdue_follow_up || req.query.overdue,
        queue: req.query.queue,
        linked: req.query.linked,
        from: req.query.from,
        to: req.query.to,
      });
      if (!list.ok) {
        if (list.status === REG_APP_STATUS.INVALID_INPUT) {
          return sendControlled(req, res, 400, "Invalid registration application filters.");
        }
        const errorHtml = renderPlatformAdminView(
          "platform-admin/registration-applications.ejs",
          shellLocals(req, res, "registration-applications", {
            pageTitle: "Registration Applications",
            listError: true,
            applications: [],
            page: 1,
            limit: REG_DEFAULT_LIMIT,
            total: 0,
            totalPages: 0,
            filters: {},
            queueFilters: QUEUE_FILTERS,
            defaultLimit: REG_DEFAULT_LIMIT,
            maxLimit: REG_MAX_LIMIT,
            allowedLimits: REG_ALLOWED_LIMITS,
            allowedPlans: ["foundation", "growth", "network"],
            applicationStatuses: registrationAppRepo.APPLICATION_STATUSES,
            provisioningStatuses: registrationAppRepo.PROVISIONING_STATUSES,
            followUpStatuses: registrationAppRepo.FOLLOW_UP_STATUSES,
            linkedFilters: registrationAppRepo.LINKED_FILTERS,
            rangeFrom: 0,
            rangeTo: 0,
          })
        );
        return res.status(503).type("html").send(errorHtml);
      }
      const html = renderPlatformAdminView(
        "platform-admin/registration-applications.ejs",
        shellLocals(req, res, "registration-applications", {
          pageTitle: "Registration Applications",
          listError: false,
          applications: list.applications,
          page: list.page,
          limit: list.limit,
          total: list.total,
          totalPages: list.totalPages,
          filters: list.filters || {},
          queueFilters: list.queueFilters || QUEUE_FILTERS,
          defaultLimit: REG_DEFAULT_LIMIT,
          maxLimit: REG_MAX_LIMIT,
          allowedLimits: REG_ALLOWED_LIMITS,
          allowedPlans: ["foundation", "growth", "network"],
          applicationStatuses: registrationAppRepo.APPLICATION_STATUSES,
          provisioningStatuses: registrationAppRepo.PROVISIONING_STATUSES,
          followUpStatuses: registrationAppRepo.FOLLOW_UP_STATUSES,
          linkedFilters: registrationAppRepo.LINKED_FILTERS,
          rangeFrom: list.total === 0 ? 0 : (list.page - 1) * list.limit + 1,
          rangeTo: Math.min(list.page * list.limit, list.total),
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  router.get(
    "/admin/registration-applications/:id",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const detail = await getRegistrationApplicationDetail(getPool(), req.params.id, env);
      if (!detail.ok) {
        if (detail.status === REG_APP_STATUS.INVALID_INPUT) {
          return sendControlled(req, res, 400, "Invalid application id.");
        }
        if (detail.status === REG_APP_STATUS.NOT_FOUND) {
          return sendControlled(req, res, 404, "This registration application could not be found.");
        }
        return sendControlled(
          req,
          res,
          503,
          "Registration application detail is temporarily unavailable."
        );
      }
      const flash = readFlash(req);
      let onboardingSummary = null;
      if (detail.application && detail.application.organizationId) {
        const onboard = await getOrganizationOnboardingSummary(getPool(), {
          organizationId: detail.application.organizationId,
        });
        if (onboard.ok && onboard.summary) onboardingSummary = onboard.summary;
      }
      const html = renderPlatformAdminView(
        "platform-admin/registration-application-detail.ejs",
        shellLocals(req, res, "registration-applications", {
          pageTitle: detail.application.churchName || "Registration application",
          application: detail.application,
          verification: detail.verification || null,
          reviewRecommendation: detail.reviewRecommendation || null,
          approvalChecklist: detail.approvalChecklist || null,
          phoneVerification: detail.phoneVerification || null,
          emailVerification: detail.emailVerification || null,
          communications: detail.communications || null,
          contacts: detail.contacts || [],
          auditEvents: detail.auditEvents || [],
          platformAdmins: detail.platformAdmins || [],
          followUpStatuses: detail.followUpStatuses || registrationAppRepo.FOLLOW_UP_STATUSES,
          contactMethods: detail.contactMethods || registrationAppRepo.CONTACT_METHODS,
          contactOutcomes: detail.contactOutcomes || registrationAppRepo.CONTACT_OUTCOMES,
          onboardingSummary,
          notice: flash.notice,
          error: flash.error,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  router.get(
    "/admin/registration-applications/:id/duplicates",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const id = String(req.params.id || "");
      const loaded = await loadRegistrationDuplicateMatchesForAdminFn(getPool(), id);
      if (!loaded.ok) {
        if (loaded.status === DUPLICATE_MATCHES_STATUS.INVALID_INPUT) {
          return sendControlled(req, res, 400, "Invalid application id.");
        }
        if (loaded.status === DUPLICATE_MATCHES_STATUS.NOT_FOUND) {
          return sendControlled(req, res, 404, "This registration application could not be found.");
        }
        return sendControlled(
          req,
          res,
          503,
          "Duplicate matches are temporarily unavailable."
        );
      }
      const churchName =
        loaded.subject && loaded.subject.churchName
          ? String(loaded.subject.churchName)
          : "Registration application";
      const html = renderPlatformAdminView(
        "platform-admin/registration-application-duplicates.ejs",
        shellLocals(req, res, "registration-applications", {
          pageTitle: `Duplicates · ${churchName}`,
          duplicates: loaded,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  router.get(
    "/admin/registration-applications/:id/duplicates/:matchId",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const id = String(req.params.id || "");
      const matchId = String(req.params.matchId || "");
      const listPath = `/admin/registration-applications/${encodeURIComponent(id)}/duplicates`;
      const loaded = await loadRegistrationDuplicateComparisonForAdminFn(
        getPool(),
        id,
        matchId
      );
      if (!loaded.ok) {
        if (loaded.status === DUPLICATE_MATCHES_STATUS.INVALID_INPUT) {
          return sendControlled(req, res, 400, "Invalid application or match id.");
        }
        if (loaded.status === DUPLICATE_MATCHES_STATUS.NOT_FOUND) {
          if (loaded.message === "match_not_found") {
            return res.redirect(303, listPath);
          }
          return sendControlled(
            req,
            res,
            404,
            "This registration application could not be found."
          );
        }
        return sendControlled(
          req,
          res,
          503,
          "Duplicate comparison is temporarily unavailable."
        );
      }
      const churchName =
        loaded.comparison &&
        loaded.comparison.subject &&
        loaded.comparison.subject.churchName
          ? String(loaded.comparison.subject.churchName)
          : "Registration application";
      const flash = readFlash(req);
      const html = renderPlatformAdminView(
        "platform-admin/registration-application-duplicate-compare.ejs",
        shellLocals(req, res, "registration-applications", {
          pageTitle: `Compare · ${churchName}`,
          comparison: loaded,
          notice: flash.notice,
          error: flash.error,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  router.post(
    "/admin/registration-applications/:id/duplicates/:matchId/decision",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const id = String(req.params.id || "");
      const matchId = String(req.params.matchId || "");
      const comparePath = `/admin/registration-applications/${encodeURIComponent(id)}/duplicates/${encodeURIComponent(matchId)}`;
      const listPath = `/admin/registration-applications/${encodeURIComponent(id)}/duplicates`;
      const returnTo = String((req.body && req.body.return_to) || "").trim().toLowerCase();
      const redirectBase = returnTo === "list" || returnTo === "matches" ? listPath : comparePath;

      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${redirectBase}?error=csrf`);
      }

      const decision = String(
        (req.body && (req.body.decision || req.body.review_decision)) || ""
      ).trim();
      const reason = String(
        (req.body && (req.body.reason || req.body.review_reason)) || ""
      ).trim();

      try {
        const deployment = getPlatformDeploymentCode(env);
        const result = await recordDuplicateMatchReviewDecisionFn(
          getPool(),
          {
            applicationId: id,
            matchId,
            decision,
            reason,
            actorUserId: req.platformAdminContext.userId,
            deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
          }
        );

        if (!result || !result.ok) {
          const error = mapDuplicateDecisionError(result);
          if (error === "not_found") {
            return res.redirect(303, `${listPath}?error=not_found`);
          }
          return res.redirect(303, `${redirectBase}?error=${error}`);
        }

        return res.redirect(303, `${redirectBase}?notice=duplicate_decision_saved`);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[platform-admin] duplicate match decision failed", {
          applicationId: id.slice(0, 36),
          matchId: matchId.slice(0, 36),
          message: err && err.message ? String(err.message).slice(0, 200) : "unknown",
        });
        return res.redirect(303, `${redirectBase}?error=decision_failed`);
      }
    }
  );

  router.post(
    "/admin/registration-applications/:id/follow-up-status",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const id = String(req.params.id || "");
      const detailPath = `/admin/registration-applications/${encodeURIComponent(id)}`;
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const result = await updateRegistrationFollowUpStatus(getPool(), {
        applicationId: id,
        followUpStatus: req.body && req.body.follow_up_status,
        actorUserId: req.platformAdminContext.userId,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
      });
      if (!result.ok) {
        let error = "follow_up_failed";
        if (result.status === REG_APP_STATUS.INVALID_INPUT) error = "invalid";
        else if (result.status === REG_APP_STATUS.NOT_FOUND) error = "not_found";
        else if (result.status === REG_APP_STATUS.NOT_PROVISIONED) error = "not_provisioned";
        return res.redirect(303, `${detailPath}?error=${error}`);
      }
      return res.redirect(303, `${detailPath}?notice=follow_up_saved`);
    }
  );

  router.post(
    "/admin/registration-applications/:id/assign-support",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const id = String(req.params.id || "");
      const detailPath = `/admin/registration-applications/${encodeURIComponent(id)}`;
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const rawSupport = req.body && req.body.support_user_id;
      const result = await assignRegistrationSupport(getPool(), {
        applicationId: id,
        supportUserId: rawSupport === "" || rawSupport == null ? null : rawSupport,
        actorUserId: req.platformAdminContext.userId,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
      });
      if (!result.ok) {
        let error = "assign_failed";
        if (result.status === REG_APP_STATUS.INVALID_INPUT) error = "invalid";
        else if (result.status === REG_APP_STATUS.NOT_FOUND) error = "not_found";
        else if (result.status === REG_APP_STATUS.NOT_PROVISIONED) error = "not_provisioned";
        else if (result.status === REG_APP_STATUS.FORBIDDEN) error = "not_platform_admin";
        return res.redirect(303, `${detailPath}?error=${error}`);
      }
      return res.redirect(303, `${detailPath}?notice=support_assigned`);
    }
  );

  router.post(
    "/admin/registration-applications/:id/contact",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const id = String(req.params.id || "");
      const detailPath = `/admin/registration-applications/${encodeURIComponent(id)}`;
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const result = await addRegistrationSupportContact(getPool(), {
        applicationId: id,
        actorUserId: req.platformAdminContext.userId,
        contactMethod: req.body && req.body.contact_method,
        outcome: req.body && req.body.outcome,
        note: req.body && req.body.note,
        followUpStatus: req.body && req.body.follow_up_status,
        nextFollowUpAt: req.body && req.body.next_follow_up_at,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
      });
      if (!result.ok) {
        let error = "contact_failed";
        if (result.status === REG_APP_STATUS.INVALID_INPUT) error = "invalid";
        else if (result.status === REG_APP_STATUS.NOT_FOUND) error = "not_found";
        else if (result.status === REG_APP_STATUS.NOT_PROVISIONED) error = "not_provisioned";
        return res.redirect(303, `${detailPath}?error=${error}`);
      }
      return res.redirect(303, `${detailPath}?notice=contact_saved`);
    }
  );

  router.post(
    "/admin/registration-applications/:id/phone-verification/attempts",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const id = String(req.params.id || "");
      const detailPath = `/admin/registration-applications/${encodeURIComponent(id)}`;
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf#reg-phone-verification`);
      }

      const parsed = parsePhoneVerificationAttemptForm(req.body, id);
      if (!parsed.ok) {
        const error =
          parsed.code === "invalid_application_id" || parsed.code === "not_found"
            ? "not_found"
            : "invalid";
        return res.redirect(303, `${detailPath}?error=${error}#reg-phone-verification`);
      }

      try {
        const existing = await findRegistrationApplicationByIdFn(getPool(), id);
        if (!existing) {
          return res.redirect(303, `${detailPath}?error=not_found#reg-phone-verification`);
        }

        await recordPhoneVerificationAttemptFn(
          parsed.input,
          { platformAdminUserId: req.platformAdminContext.userId },
          { client: getPool() }
        );
        return res.redirect(303, `${detailPath}?notice=phone_attempt_recorded#reg-phone-verification`);
      } catch (err) {
        const errorCode = mapPhoneVerificationAttemptError(err);
        if (errorCode === "phone_attempt_failed") {
          // eslint-disable-next-line no-console
          console.error("[platform-admin] phone verification attempt failed", {
            applicationId: id.slice(0, 36),
            message: err && err.message ? String(err.message).slice(0, 200) : "unknown",
          });
        }
        return res.redirect(303, `${detailPath}?error=${errorCode}#reg-phone-verification`);
      }
    }
  );

  router.post(
    "/admin/registration-applications/:id/email-verification/resend",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const id = String(req.params.id || "");
      const detailPath = `/admin/registration-applications/${encodeURIComponent(id)}`;
      const anchor = "#reg-email-verification";
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf${anchor}`);
      }

      try {
        const result = await resendRegistrationVerificationEmailFn(
          {
            applicationId: id,
            actorUserId: req.platformAdminContext.userId,
            publicBaseUrl: getApexOrigin(env, req.hostname),
          },
          {
            client: getPool(),
            findRegistrationApplicationById: findRegistrationApplicationByIdFn,
          }
        );

        if (result && result.ok && result.code === EMAIL_RESEND_STATUS.SENT) {
          return res.redirect(
            303,
            `${detailPath}?notice=email_verification_sent${anchor}`
          );
        }

        const error = mapEmailVerificationResendError(result || {});
        if (error === "email_verification_failed") {
          // eslint-disable-next-line no-console
          console.error("[platform-admin] email verification resend failed", {
            applicationId: id.slice(0, 36),
            code: result && result.code ? String(result.code).slice(0, 64) : "unknown",
          });
        }
        return res.redirect(303, `${detailPath}?error=${error}${anchor}`);
      } catch (err) {
        const error = mapEmailVerificationResendError(err);
        // eslint-disable-next-line no-console
        console.error("[platform-admin] email verification resend failed", {
          applicationId: id.slice(0, 36),
          code: error,
          message: err && err.message ? String(err.message).slice(0, 200) : "unknown",
        });
        return res.redirect(303, `${detailPath}?error=${error}${anchor}`);
      }
    }
  );

  router.post(
    "/admin/registration-applications/:id/request-information",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const id = String(req.params.id || "");
      const detailPath = `/admin/registration-applications/${encodeURIComponent(id)}`;
      const anchor = "#reg-communications";
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf${anchor}`);
      }

      const parsed = parseInformationRequestForm(req.body, id);
      if (!parsed.ok) {
        return res.redirect(303, `${detailPath}?error=invalid${anchor}`);
      }

      try {
        const existing = await findRegistrationApplicationByIdFn(getPool(), id);
        if (!existing) {
          return res.redirect(303, `${detailPath}?error=not_found${anchor}`);
        }

        const result = await recordInformationRequestFn(
          parsed.input,
          { platformAdminUserId: req.platformAdminContext.userId },
          { client: getPool() }
        );

        if (!result || result.recorded !== true) {
          return res.redirect(303, `${detailPath}?error=information_request_failed${anchor}`);
        }

        // Honest delivery: recorded may be sending_unavailable — never claim sent in notice.
        const deliveryStatus =
          result.delivery && result.delivery.status != null
            ? String(result.delivery.status)
            : "";

        const noteLen =
          parsed.input.applicantMessage != null
            ? String(parsed.input.applicantMessage).trim().length
            : 0;
        await updateApplicationSupportFollowUpFn(getPool(), id, {
          followUpStatus: "awaiting_customer",
          reviewEvent: {
            at: new Date().toISOString(),
            action: "information_requested",
            actor_user_id: req.platformAdminContext.userId,
            to_status: "awaiting_customer",
            reason_codes: parsed.input.requestCategory
              ? [String(parsed.input.requestCategory).trim().toLowerCase()]
              : [],
            note_len: noteLen,
            delivery_status: deliveryStatus || undefined,
          },
        });

        return res.redirect(303, `${detailPath}?notice=information_requested${anchor}`);
      } catch (err) {
        const error = mapInformationRequestError(err);
        if (error === "information_request_failed") {
          // eslint-disable-next-line no-console
          console.error("[platform-admin] information request failed", {
            applicationId: id.slice(0, 36),
            message: err && err.message ? String(err.message).slice(0, 200) : "unknown",
          });
        }
        return res.redirect(303, `${detailPath}?error=${error}${anchor}`);
      }
    }
  );

  router.post(
    "/admin/registration-applications/:id/reject",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const id = String(req.params.id || "");
      const detailPath = `/admin/registration-applications/${encodeURIComponent(id)}`;
      const anchor = "#reg-rejection";
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf${anchor}`);
      }

      const parsed = parseRejectForm(req.body, id);
      if (!parsed.ok) {
        const error =
          parsed.code === "invalid_application_id" ? "not_found" : "invalid";
        return res.redirect(303, `${detailPath}?error=${error}${anchor}`);
      }

      try {
        const result = await rejectRegistrationApplicationFn(
          getPool(),
          {
            applicationId: parsed.input.applicationId,
            platformAdminUserId: req.platformAdminContext.userId,
            rejectionCategory: parsed.input.rejectionCategory,
            internalDecisionNote: parsed.input.internalDecisionNote,
            applicantExplanation: parsed.input.applicantExplanation,
            reapplicationAllowed: parsed.input.reapplicationAllowed,
            notifyApplicant: parsed.input.notifyApplicant,
            deploymentCode: (() => {
              const deployment = getPlatformDeploymentCode(env);
              return deployment && deployment.ok ? deployment.code : "blessboard-org-v5";
            })(),
          },
          typeof deps.rejectRegistrationOptions === "object" && deps.rejectRegistrationOptions
            ? deps.rejectRegistrationOptions
            : undefined
        );

        if (!result || !result.ok) {
          const error = mapRejectRouteError(result);
          return res.redirect(303, `${detailPath}?error=${error}${anchor}`);
        }

        // Do not trust client-submitted delivery/status; notice is fixed and honest.
        return res.redirect(
          303,
          `${detailPath}?notice=application_rejected${anchor}`
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[platform-admin] reject registration failed", {
          applicationId: id.slice(0, 36),
          message: err && err.message ? String(err.message).slice(0, 200) : "unknown",
        });
        return res.redirect(303, `${detailPath}?error=reject_failed${anchor}`);
      }
    }
  );

  router.post(
    "/admin/registration-applications/:id/reopen",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const id = String(req.params.id || "");
      const detailPath = `/admin/registration-applications/${encodeURIComponent(id)}`;
      const errorAnchor = "#reg-rejection";
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf${errorAnchor}`);
      }

      const parsed = parseReopenForm(req.body, id);
      if (!parsed.ok) {
        const error =
          parsed.code === "invalid_application_id"
            ? "not_found"
            : parsed.code === "reopen_reason_required"
              ? "invalid"
              : "invalid";
        return res.redirect(303, `${detailPath}?error=${error}${errorAnchor}`);
      }

      try {
        const result = await reopenRegistrationApplicationFn(getPool(), {
          applicationId: parsed.input.applicationId,
          platformAdminUserId: req.platformAdminContext.userId,
          reason: parsed.input.reason,
        });

        if (!result || !result.ok) {
          const error = mapReopenRouteError(result);
          return res.redirect(303, `${detailPath}?error=${error}${errorAnchor}`);
        }

        return res.redirect(303, `${detailPath}?notice=application_reopened`);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[platform-admin] reopen registration failed", {
          applicationId: id.slice(0, 36),
          message: err && err.message ? String(err.message).slice(0, 200) : "unknown",
        });
        return res.redirect(303, `${detailPath}?error=reopen_failed${errorAnchor}`);
      }
    }
  );

  router.post(
    "/admin/registration-applications/:id/approve",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const id = String(req.params.id || "");
      const detailPath = `/admin/registration-applications/${encodeURIComponent(id)}`;
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const result = await approveAndProvisionRegistrationApplication(getPool(), {
        applicationId: id,
        actorUserId: req.platformAdminContext.userId,
        organizationKey: req.body && req.body.organization_key,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
        dataEnvironment: "testing",
      });
      if (!result.ok) {
        return res.redirect(303, `${detailPath}?error=${mapApproveError(result)}`);
      }
      if (result.alreadyProvisioned) {
        const key = result.organizationKey || (result.records && result.records.organizationKey);
        if (key) {
          return res.redirect(
            303,
            `/admin/organizations/${encodeURIComponent(key)}?notice=already_provisioned`
          );
        }
        return res.redirect(303, `${detailPath}?notice=already_provisioned`);
      }
      const orgKey = result.organizationKey || (result.records && result.records.organizationKey);
      if (!orgKey) {
        return res.redirect(303, `${detailPath}?notice=approved`);
      }
      const inviteLink = buildAdministratorInviteLink(
        result.invitation && result.invitation.rawToken,
        env
      );
      if (inviteLink) {
        setInviteOnceCookie(
          res,
          { organizationKey: orgKey, inviteLink },
          { secure: isProduction }
        );
      }
      const notice = result.networkOrganizationCreated
        ? "network_organization_created"
        : "organization_provisioned";
      return res.redirect(
        303,
        `/admin/organizations/${encodeURIComponent(orgKey)}?notice=${notice}#pa-org-invitation`
      );
    }
  );

  router.post(
    "/admin/registration-applications/:id/mark-validation-complete",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const id = String(req.params.id || "");
      const detailPath = `/admin/registration-applications/${encodeURIComponent(id)}`;
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const result = await markNetworkValidationComplete(getPool(), {
        applicationId: id,
        actorUserId: req.platformAdminContext.userId,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
      });
      if (!result.ok) {
        let error = "follow_up_failed";
        if (result.status === REG_APP_STATUS.INVALID_INPUT) error = "invalid";
        else if (result.status === REG_APP_STATUS.NOT_FOUND) error = "not_found";
        else if (result.status === REG_APP_STATUS.NOT_ELIGIBLE) error = "not_eligible";
        else if (result.status === REG_APP_STATUS.NOT_PROVISIONED) error = "not_eligible";
        return res.redirect(303, `${detailPath}?error=${error}`);
      }
      return res.redirect(303, `${detailPath}?notice=validation_complete`);
    }
  );

  router.post(
    "/admin/registration-applications/:id/retry-provision",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const id = String(req.params.id || "");
      const detailPath = `/admin/registration-applications/${encodeURIComponent(id)}`;
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const result = await approveAndProvisionRegistrationApplication(getPool(), {
        applicationId: id,
        actorUserId: req.platformAdminContext.userId,
        organizationKey: req.body && req.body.organization_key,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
        dataEnvironment: "testing",
      });
      if (!result.ok) {
        let error = "retry_failed";
        if (result.status === REG_APP_STATUS.INVALID_INPUT) {
          error =
            result.message === "administrator_email_required"
              ? "administrator_email_required"
              : "invalid";
        } else if (result.status === REG_APP_STATUS.NOT_FOUND) error = "not_found";
        else if (result.status === REG_APP_STATUS.NOT_ELIGIBLE) error = "not_eligible";
        else if (result.status === REG_APP_STATUS.PROVISION_FAILED) error = "provision_failed";
        return res.redirect(303, `${detailPath}?error=${error}`);
      }
      if (result.alreadyProvisioned) {
        const key = result.organizationKey || (result.records && result.records.organizationKey);
        if (key) {
          return res.redirect(
            303,
            `/admin/organizations/${encodeURIComponent(key)}?notice=already_provisioned`
          );
        }
        return res.redirect(303, `${detailPath}?notice=already_provisioned`);
      }
      const orgKey = result.organizationKey || (result.records && result.records.organizationKey);
      if (orgKey) {
        const inviteLink = buildAdministratorInviteLink(
          result.invitation && result.invitation.rawToken,
          env
        );
        if (inviteLink) {
          setInviteOnceCookie(
            res,
            { organizationKey: orgKey, inviteLink },
            { secure: isProduction }
          );
        }
        return res.redirect(
          303,
          `/admin/organizations/${encodeURIComponent(orgKey)}?notice=retry_succeeded#pa-org-invitation`
        );
      }
      return res.redirect(303, `${detailPath}?notice=retry_succeeded`);
    }
  );

  router.post(
    "/admin/registration-applications/:id/link-organization",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const id = String(req.params.id || "");
      const detailPath = `/admin/registration-applications/${encodeURIComponent(id)}`;
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const result = await linkRegistrationApplicationToOrganization(getPool(), {
        applicationId: id,
        actorUserId: req.platformAdminContext.userId,
        organizationKey: req.body && req.body.organization_key,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
      });
      if (!result.ok) {
        let error = "link_failed";
        if (result.status === REG_APP_STATUS.INVALID_INPUT) error = "invalid";
        else if (result.status === REG_APP_STATUS.NOT_FOUND) {
          error =
            result.message === "organization_not_found" ? "organization_not_found" : "not_found";
        } else if (result.status === REG_APP_STATUS.NOT_ELIGIBLE) error = "not_eligible";
        return res.redirect(303, `${detailPath}?error=${error}`);
      }
      return res.redirect(303, `${detailPath}?notice=organization_linked`);
    }
  );

  router.get("/admin/plans", requireApex, requirePlatformAdmin, async (req, res) => {
    const catalogue = await listPlatformPlansCatalogue(getPool(), { includeInactive: true });
    if (!catalogue.ok || catalogue.status === PLANS_STATUS.LOOKUP_ERROR) {
      return sendControlled(req, res, 503, "Plan catalogue is temporarily unavailable.");
    }
    const html = renderPlatformAdminView(
      "platform-admin/plans.ejs",
      shellLocals(req, res, "plans", {
        pageTitle: "Plans",
        plans: catalogue.plans || [],
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/admin/subscriptions", requireApex, requirePlatformAdmin, async (req, res) => {
    const list = await listPlatformSubscriptions(getPool(), {
      page: req.query.page,
      limit: req.query.limit,
      q: req.query.q,
      status: req.query.status,
      plan: req.query.plan,
      ending_soon: req.query.ending_soon,
      trial_source: req.query.trial_source,
    });
    if (!list.ok && list.status === SUBSCRIPTIONS_STATUS.LOOKUP_ERROR) {
      return sendControlled(req, res, 503, "Subscription directory is temporarily unavailable.");
    }
    if (!list.ok && list.status === SUBSCRIPTIONS_STATUS.INVALID_INPUT) {
      return sendControlled(req, res, 400, "Invalid subscription directory filters.");
    }
    const html = renderPlatformAdminView(
      "platform-admin/subscriptions.ejs",
      shellLocals(req, res, "subscriptions", {
        pageTitle: "Subscriptions",
        subscriptions: list.subscriptions || [],
        page: list.page,
        limit: list.limit,
        total: list.total,
        totalPages: list.totalPages,
        keyPrefix: list.keyPrefix || "",
        statusFilter: list.statusFilter || "",
        planFilter: list.planFilter || "",
        endingSoon: Boolean(list.endingSoon),
        trialSourceFilter: list.trialSourceFilter || "",
        defaultLimit: SUB_DEFAULT_LIMIT,
        maxLimit: SUB_MAX_LIMIT,
        allowedLimits: SUB_ALLOWED_LIMITS,
        allowedStatuses: SUB_ALLOWED_STATUSES,
        allowedPlans: ["free", "growth", "network"],
        rangeFrom: list.total === 0 ? 0 : (list.page - 1) * list.limit + 1,
        rangeTo: Math.min(list.page * list.limit, list.total),
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/admin/domains", requireApex, requirePlatformAdmin, async (req, res) => {
    const list = await listPlatformDomains(getPool(), {
      page: req.query.page,
      limit: req.query.limit,
      q: req.query.q,
      org: req.query.org,
      status: req.query.status,
      type: req.query.type,
      verified: req.query.verified,
    });
    if (!list.ok && list.status === DOMAINS_STATUS.LOOKUP_ERROR) {
      return sendControlled(req, res, 503, "Domain directory is temporarily unavailable.");
    }
    if (!list.ok && list.status === DOMAINS_STATUS.INVALID_INPUT) {
      return sendControlled(req, res, 400, "Invalid domain directory filters.");
    }
    const html = renderPlatformAdminView(
      "platform-admin/domains.ejs",
      shellLocals(req, res, "domains", {
        pageTitle: "Domains",
        domains: list.domains || [],
        page: list.page,
        limit: list.limit,
        total: list.total,
        totalPages: list.totalPages,
        hostnamePrefix: list.hostnamePrefix || "",
        orgKeyPrefix: list.orgKeyPrefix || "",
        statusFilter: list.statusFilter || "",
        typeFilter: list.typeFilter || "",
        verifiedFilter: list.verifiedFilter || "",
        defaultLimit: DOMAIN_DEFAULT_LIMIT,
        maxLimit: DOMAIN_MAX_LIMIT,
        allowedLimits: DOMAIN_ALLOWED_LIMITS,
        allowedStatuses: DOMAIN_ALLOWED_STATUSES,
        allowedDomainTypes: ALLOWED_DOMAIN_TYPES,
        rangeFrom: list.total === 0 ? 0 : (list.page - 1) * list.limit + 1,
        rangeTo: Math.min(list.page * list.limit, list.total),
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/admin/domains/:hostname", requireApex, requirePlatformAdmin, async (req, res) => {
    const detail = await getPlatformDomainDetail(getPool(), req.params.hostname, env);
    if (!detail.ok) {
      if (detail.status === DOMAIN_DETAIL_STATUS.LOOKUP_ERROR) {
        return sendControlled(req, res, 503, "Domain detail is temporarily unavailable.");
      }
      if (detail.status === DOMAIN_DETAIL_STATUS.INVALID_INPUT) {
        return sendControlled(req, res, 400, "Invalid hostname.");
      }
      return sendControlled(req, res, 404, "This domain could not be found.");
    }
    const flash = readFlash(req);
    const html = renderPlatformAdminView(
      "platform-admin/domain-detail.ejs",
      shellLocals(req, res, "domains", {
        pageTitle: detail.domain.hostname,
        domain: detail.domain,
        allowedStatuses: detail.allowedStatuses || DOMAIN_DETAIL_STATUSES,
        currentDeploymentCode: detail.currentDeploymentCode || "",
        notice: flash.notice,
        error: flash.error,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.post(
    "/admin/domains/:hostname/status",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      const hostname = String(req.params.hostname || "");
      const detailPath = `/admin/domains/${encodeURIComponent(hostname)}`;
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf`);
      }
      const confirmed = String((req.body && req.body.confirm_status) || "") === "1";
      const result = await updatePlatformDomainStatus(getPool(), {
        hostname,
        status: req.body && req.body.status,
        confirmed,
        env,
      });
      if (!result.ok) {
        let error = "status_failed";
        if (result.status === DOMAIN_DETAIL_STATUS.CONFIRMATION_REQUIRED) error = "confirm_required";
        else if (result.status === DOMAIN_DETAIL_STATUS.INVALID_INPUT) error = "invalid";
        else if (result.status === DOMAIN_DETAIL_STATUS.NOT_FOUND) error = "not_found";
        else if (result.status === DOMAIN_DETAIL_STATUS.DEPLOYMENT_MISMATCH) {
          error = "deployment_mismatch";
        }
        return res.redirect(303, `${detailPath}?error=${error}`);
      }
      return res.redirect(303, `${detailPath}?notice=status_saved`);
    }
  );

  router.post(
    "/admin/domains/:hostname/organization",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      const hostname = String(req.params.hostname || "");
      const detailPath = `/admin/domains/${encodeURIComponent(hostname)}`;
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf`);
      }
      const confirmed = String((req.body && req.body.confirm_organization) || "") === "1";
      const result = await assignPlatformDomainOrganization(getPool(), {
        hostname,
        organizationKey: req.body && req.body.organization_key,
        confirmed,
        env,
      });
      if (!result.ok) {
        let error = "organization_failed";
        if (result.status === DOMAIN_DETAIL_STATUS.CONFIRMATION_REQUIRED) error = "confirm_required";
        else if (result.status === DOMAIN_DETAIL_STATUS.INVALID_INPUT) error = "invalid";
        else if (result.status === DOMAIN_DETAIL_STATUS.NOT_FOUND) error = "not_found";
        else if (result.status === DOMAIN_DETAIL_STATUS.FORBIDDEN) error = "not_entitled";
        else if (result.status === DOMAIN_DETAIL_STATUS.DEPLOYMENT_MISMATCH) {
          error = "deployment_mismatch";
        }
        return res.redirect(303, `${detailPath}?error=${error}`);
      }
      return res.redirect(303, `${detailPath}?notice=organization_saved`);
    }
  );

  router.get("/admin/deployments", requireApex, requirePlatformAdmin, async (req, res) => {
    const list = await listPlatformDeployments(getPool(), env);
    if (!list.ok || list.status === DEPLOY_STATUS.LOOKUP_ERROR) {
      return sendControlled(req, res, 503, "Deployment registry is temporarily unavailable.");
    }
    const html = renderPlatformAdminView(
      "platform-admin/deployments.ejs",
      shellLocals(req, res, "deployments", {
        pageTitle: "Deployments",
        deployments: list.deployments || [],
        currentDeploymentCode: list.currentDeploymentCode || "",
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/admin/deployments/:deploymentCode", requireApex, requirePlatformAdmin, async (req, res) => {
    const detail = await getPlatformDeploymentDetail(getPool(), req.params.deploymentCode, env);
    if (!detail.ok) {
      if (detail.status === DEPLOY_DETAIL_STATUS.LOOKUP_ERROR) {
        return sendControlled(req, res, 503, "Deployment detail is temporarily unavailable.");
      }
      if (detail.status === DEPLOY_DETAIL_STATUS.INVALID_INPUT) {
        return sendControlled(req, res, 400, "Invalid deployment code.");
      }
      return sendControlled(req, res, 404, "This deployment could not be found.");
    }
    const html = renderPlatformAdminView(
      "platform-admin/deployment-detail.ejs",
      shellLocals(req, res, "deployments", {
        pageTitle: detail.deployment.deploymentCode,
        deployment: detail.deployment,
        domains: detail.domains || [],
        products: detail.products || [],
        diagnostics: detail.diagnostics || [],
        currentDeploymentCode: detail.currentDeploymentCode || "",
        isCurrentProcess: Boolean(detail.isCurrentProcess),
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/admin/settings", requireApex, requirePlatformAdmin, async (req, res) => {
    const list = await listPlatformDeployments(getPool(), env);
    if (!list.ok || list.status === DEPLOY_STATUS.LOOKUP_ERROR) {
      return sendControlled(req, res, 503, "Platform settings are temporarily unavailable.");
    }
    const current =
      (list.deployments || []).find((d) => d.deploymentCode === list.currentDeploymentCode) ||
      null;
    const orgReserved = Array.from(ORGANIZATION_RESERVED_SLUGS).sort();
    const hostReserved = Array.from(BRANCH_HOST_RESERVED_SLUGS).sort();
    const html = renderPlatformAdminView(
      "platform-admin/settings.ejs",
      shellLocals(req, res, "settings", {
        pageTitle: "Settings",
        currentDeployment: current,
        currentDeploymentCode: list.currentDeploymentCode || "",
        hostnamePattern: current && current.canonicalDomain
          ? `{organization}.${current.canonicalDomain}`
          : "{organization}.blessboard.org",
        organizationReserved: orgReserved,
        hostReserved,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get(
    "/admin/organizations/:organizationKey",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const detail = await getPlatformOrganizationSummary(getPool(), req.params.organizationKey);
      if (!detail.ok) {
        if (detail.status === DETAIL_STATUS.LOOKUP_ERROR) {
          return sendControlled(req, res, 503, "Organization lookup is temporarily unavailable.");
        }
        if (detail.status === DETAIL_STATUS.INVALID_INPUT) {
          return sendControlled(req, res, 404, "This organization could not be found.");
        }
        return sendControlled(req, res, 404, "This organization could not be found.");
      }
      const entitlementsView = await getPlatformOrganizationEntitlementsView(
        getPool(),
        req.params.organizationKey
      );
      if (!entitlementsView.ok && entitlementsView.status === ENTITLEMENTS_ADMIN_STATUS.LOOKUP_ERROR) {
        return sendControlled(req, res, 503, "Entitlements lookup is temporarily unavailable.");
      }
      const flash = readFlash(req);
      const inviteOnceLink = consumeInviteOnceCookie(
        req,
        res,
        detail.organization.organizationKey
      );
      let pendingInvitations = [];
      let churchScope = null;
      try {
        const scopeRow = await getPool().query(
          `SELECT o.id AS organization_id, c.id AS church_id
             FROM platform.organizations o
             JOIN blessboard.churches c ON c.organization_id = o.id
            WHERE o.organization_key = $1
            ORDER BY c.id ASC
            LIMIT 1`,
          [detail.organization.organizationKey]
        );
        if (scopeRow.rows[0]) {
          churchScope = {
            organizationId: String(scopeRow.rows[0].organization_id),
            churchId: String(scopeRow.rows[0].church_id),
          };
          const pending = await listPendingInvitations(getPool(), {
            organizationId: churchScope.organizationId,
            churchId: churchScope.churchId,
            limit: 20,
          });
          if (pending.ok) pendingInvitations = pending.invitations || [];
        }
      } catch {
        pendingInvitations = [];
        churchScope = null;
      }
      let registrationApplicationId = null;
      let onboardingSummary = null;
      let supportContacts = [];
      let platformAdmins = [];
      try {
        const onboard = await getOrganizationOnboardingSummary(getPool(), {
          organizationKey: detail.organization.organizationKey,
        });
        if (onboard.ok && onboard.summary) {
          onboardingSummary = onboard.summary;
          registrationApplicationId = onboard.summary.registrationApplicationId;
          const [contacts, admins] = await Promise.all([
            registrationAppRepo.listOrganizationSupportContacts(
              getPool(),
              onboard.summary.organizationId,
              { limit: 20 }
            ),
            registrationAppRepo.listActivePlatformAdministrators(getPool()),
          ]);
          supportContacts = (contacts || []).map((c) => ({
            id: String(c.id),
            contactMethod: String(c.contact_method),
            outcome: String(c.outcome),
            note: String(c.note || ""),
            contactedAt: c.contacted_at,
            nextFollowUpAt: c.next_follow_up_at,
            createdByDisplayName:
              c.created_by_display_name != null ? String(c.created_by_display_name) : "",
          }));
          platformAdmins = (admins || []).map((u) => ({
            id: String(u.id),
            displayName: String(u.display_name || ""),
            email: String(u.email_normalized || ""),
          }));
        } else if (!registrationApplicationId) {
          registrationApplicationId = await registrationAppRepo.findApplicationIdForOrganizationKey(
            getPool(),
            detail.organization.organizationKey
          );
        }
      } catch {
        registrationApplicationId = null;
        onboardingSummary = null;
      }
      let growthTrial = null;
      try {
        const organizationId = await resolveOrganizationIdByKey(
          getPool(),
          detail.organization.organizationKey
        );
        if (organizationId) {
          const trialState = await getGrowthTrialOfferState(getPool(), organizationId);
          if (trialState.ok) growthTrial = trialState;
        }
      } catch {
        growthTrial = null;
      }
      const html = renderPlatformAdminView(
        "platform-admin/organization-detail.ejs",
        shellLocals(req, res, "organizations", {
          pageTitle: detail.organization.displayName || "Organization",
          organization: detail.organization,
          branches: detail.branches || [],
          entitlements: entitlementsView.entitlements || null,
          usage: entitlementsView.usage || null,
          domains: entitlementsView.domains || [],
          plans: entitlementsView.plans || [],
          featureKeys: entitlementsView.featureKeys || [],
          registrationApplicationId,
          onboardingSummary,
          supportContacts,
          platformAdmins,
          growthTrial,
          followUpStatuses: registrationAppRepo.FOLLOW_UP_STATUSES,
          onboardingStatuses: ONBOARDING_STATUSES,
          inviteOnceLink: inviteOnceLink || null,
          pendingInvitations,
          churchScope,
          notice: flash.notice,
          error: flash.error,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  function orgDetailPath(organizationKey) {
    return `/admin/organizations/${encodeURIComponent(String(organizationKey || "").trim().toLowerCase())}`;
  }

  router.post(
    "/admin/organizations/:organizationKey/invitations/resend",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const organizationKey = String(req.params.organizationKey || "")
        .trim()
        .toLowerCase();
      const detailPath = orgDetailPath(organizationKey);
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf#pa-org-invitation`);
      }
      const email = String((req.body && req.body.email) || "").trim();
      const displayName = String((req.body && req.body.display_name) || "").trim() || email;
      const roleKey = String((req.body && req.body.role_key) || "church_hq_admin")
        .trim()
        .toLowerCase();
      const scopeRow = await getPool().query(
        `SELECT o.id AS organization_id, c.id AS church_id
           FROM platform.organizations o
           JOIN blessboard.churches c ON c.organization_id = o.id
          WHERE o.organization_key = $1
          ORDER BY c.id ASC
          LIMIT 1`,
        [organizationKey]
      );
      if (!scopeRow.rows[0]) {
        return res.redirect(303, `${detailPath}?error=not_found#pa-org-invitation`);
      }
      const result = await inviteBlessBoardStaff(getPool(), {
        organizationId: String(scopeRow.rows[0].organization_id),
        churchId: String(scopeRow.rows[0].church_id),
        actorUserId: req.platformAdminContext.userId,
        email,
        displayName,
        roleKey,
      });
      if (!result.ok) {
        let error = "invite_failed";
        if (result.reason === "already_assigned") error = "already_assigned";
        else if (result.status === "limit_exceeded") error = "limit_exceeded";
        return res.redirect(303, `${detailPath}?error=${error}#pa-org-invitation`);
      }
      const inviteLink = buildAdministratorInviteLink(result.rawToken, env);
      if (inviteLink) {
        setInviteOnceCookie(
          res,
          { organizationKey, inviteLink },
          { secure: isProduction }
        );
      }
      return res.redirect(303, `${detailPath}?notice=invitation_resent#pa-org-invitation`);
    }
  );

  async function resolveOrganizationIdByKey(pool, organizationKey) {
    const r = await pool.query(
      `SELECT id FROM platform.organizations WHERE organization_key = $1 LIMIT 1`,
      [organizationKey]
    );
    return r.rows[0] ? String(r.rows[0].id) : null;
  }

  router.post(
    "/admin/organizations/:organizationKey/support-requested",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const organizationKey = String(req.params.organizationKey || "")
        .trim()
        .toLowerCase();
      const detailPath = orgDetailPath(organizationKey);
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf#pa-org-onboarding`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const raw = String((req.body && req.body.support_requested) || "").toLowerCase();
      const result = await setOrganizationSupportRequested(getPool(), {
        organizationKey,
        supportRequested: raw === "1" || raw === "true",
        actorUserId: req.platformAdminContext.userId,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
      });
      if (!result.ok) {
        let error = "support_request_failed";
        if (result.status === ONBOARDING_ADMIN_STATUS.INVALID_INPUT) error = "invalid";
        else if (result.status === ONBOARDING_ADMIN_STATUS.NOT_FOUND) error = "not_found";
        else if (result.status === ONBOARDING_ADMIN_STATUS.NOT_BLESSBOARD) error = "not_blessboard";
        return res.redirect(303, `${detailPath}?error=${error}#pa-org-onboarding`);
      }
      return res.redirect(303, `${detailPath}?notice=support_request_saved#pa-org-onboarding`);
    }
  );

  router.post(
    "/admin/organizations/:organizationKey/next-follow-up",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const organizationKey = String(req.params.organizationKey || "")
        .trim()
        .toLowerCase();
      const detailPath = orgDetailPath(organizationKey);
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf#pa-org-onboarding`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const clear = String((req.body && req.body.clear_next_follow_up) || "") === "1";
      const result = await setOrganizationNextFollowUp(getPool(), {
        organizationKey,
        nextFollowUpAt: clear ? null : req.body && req.body.next_follow_up_at,
        clear,
        actorUserId: req.platformAdminContext.userId,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
      });
      if (!result.ok) {
        let error = "follow_up_schedule_failed";
        if (result.status === ONBOARDING_ADMIN_STATUS.INVALID_INPUT) {
          error =
            result.message === "next_follow_up_must_be_future"
              ? "next_follow_up_past"
              : "invalid";
        } else if (result.status === ONBOARDING_ADMIN_STATUS.NOT_FOUND) error = "not_found";
        else if (result.status === ONBOARDING_ADMIN_STATUS.NOT_BLESSBOARD) error = "not_blessboard";
        return res.redirect(303, `${detailPath}?error=${error}#pa-org-onboarding`);
      }
      return res.redirect(303, `${detailPath}?notice=next_follow_up_saved#pa-org-onboarding`);
    }
  );

  router.post(
    "/admin/organizations/:organizationKey/follow-up-status",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const organizationKey = String(req.params.organizationKey || "")
        .trim()
        .toLowerCase();
      const detailPath = orgDetailPath(organizationKey);
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf#pa-org-onboarding`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const result = await updateOrganizationFollowUpStatus(getPool(), {
        organizationKey,
        followUpStatus: req.body && req.body.follow_up_status,
        actorUserId: req.platformAdminContext.userId,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
      });
      if (!result.ok) {
        let error = "follow_up_failed";
        if (result.status === ONBOARDING_ADMIN_STATUS.INVALID_INPUT) error = "invalid";
        else if (result.status === ONBOARDING_ADMIN_STATUS.NOT_FOUND) error = "not_found";
        else if (result.status === ONBOARDING_ADMIN_STATUS.NOT_BLESSBOARD) error = "not_blessboard";
        return res.redirect(303, `${detailPath}?error=${error}#pa-org-onboarding`);
      }
      return res.redirect(303, `${detailPath}?notice=follow_up_saved#pa-org-onboarding`);
    }
  );

  router.post(
    "/admin/organizations/:organizationKey/assign-support",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const organizationKey = String(req.params.organizationKey || "")
        .trim()
        .toLowerCase();
      const detailPath = orgDetailPath(organizationKey);
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf#pa-org-onboarding`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const rawSupport = req.body && req.body.support_user_id;
      const result = await assignOrganizationSupport(getPool(), {
        organizationKey,
        supportUserId: rawSupport === "" || rawSupport == null ? null : rawSupport,
        actorUserId: req.platformAdminContext.userId,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
      });
      if (!result.ok) {
        let error = "assign_failed";
        if (result.status === ONBOARDING_ADMIN_STATUS.INVALID_INPUT) error = "invalid";
        else if (result.status === ONBOARDING_ADMIN_STATUS.NOT_FOUND) error = "not_found";
        else if (result.status === ONBOARDING_ADMIN_STATUS.NOT_BLESSBOARD) error = "not_blessboard";
        else if (result.status === ONBOARDING_ADMIN_STATUS.FORBIDDEN) error = "not_platform_admin";
        return res.redirect(303, `${detailPath}?error=${error}#pa-org-onboarding`);
      }
      return res.redirect(303, `${detailPath}?notice=support_assigned#pa-org-onboarding`);
    }
  );

  router.post(
    "/admin/organizations/:organizationKey/onboarding-status",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const organizationKey = String(req.params.organizationKey || "")
        .trim()
        .toLowerCase();
      const detailPath = orgDetailPath(organizationKey);
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf#pa-org-onboarding`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const result = await overrideOrganizationOnboardingStatus(getPool(), {
        organizationKey,
        onboardingStatus: req.body && req.body.onboarding_status,
        reason: req.body && req.body.reason,
        actorUserId: req.platformAdminContext.userId,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
      });
      if (!result.ok) {
        let error = "onboarding_status_failed";
        if (result.status === ONBOARDING_ADMIN_STATUS.INVALID_INPUT) {
          error = result.message === "reason_required" ? "reason_required" : "invalid";
        } else if (result.status === ONBOARDING_ADMIN_STATUS.NOT_FOUND) error = "not_found";
        else if (result.status === ONBOARDING_ADMIN_STATUS.NOT_BLESSBOARD) error = "not_blessboard";
        return res.redirect(303, `${detailPath}?error=${error}#pa-org-onboarding`);
      }
      return res.redirect(303, `${detailPath}?notice=onboarding_status_saved#pa-org-onboarding`);
    }
  );

  router.post(
    "/admin/organizations/:organizationKey/growth-trial/offer",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      const organizationKey = String(req.params.organizationKey || "")
        .trim()
        .toLowerCase();
      const detailPath = orgDetailPath(organizationKey);
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf#pa-org-growth-trial`);
      }
      const organizationId = await resolveOrganizationIdByKey(getPool(), organizationKey);
      if (!organizationId) {
        return res.redirect(303, `${detailPath}?error=not_found#pa-org-growth-trial`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const result = await createGrowthTrialOffer(getPool(), {
        organizationId,
        actorUserId: req.platformAdminContext.userId,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
      });
      if (!result.ok) {
        return res.redirect(303, `${detailPath}?error=growth_trial_offer_failed#pa-org-growth-trial`);
      }
      return res.redirect(303, `${detailPath}?notice=growth_trial_offered#pa-org-growth-trial`);
    }
  );

  router.post(
    "/admin/organizations/:organizationKey/growth-trial/cancel",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      const organizationKey = String(req.params.organizationKey || "")
        .trim()
        .toLowerCase();
      const detailPath = orgDetailPath(organizationKey);
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf#pa-org-growth-trial`);
      }
      const organizationId = await resolveOrganizationIdByKey(getPool(), organizationKey);
      if (!organizationId) {
        return res.redirect(303, `${detailPath}?error=not_found#pa-org-growth-trial`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const result = await cancelGrowthTrialOffer(getPool(), {
        organizationId,
        actorUserId: req.platformAdminContext.userId,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
      });
      if (!result.ok) {
        return res.redirect(303, `${detailPath}?error=growth_trial_cancel_failed#pa-org-growth-trial`);
      }
      return res.redirect(303, `${detailPath}?notice=growth_trial_canceled#pa-org-growth-trial`);
    }
  );

  router.post(
    "/admin/organizations/:organizationKey/growth-trial/exception",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      const organizationKey = String(req.params.organizationKey || "")
        .trim()
        .toLowerCase();
      const detailPath = orgDetailPath(organizationKey);
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, `${detailPath}?error=csrf#pa-org-growth-trial`);
      }
      const confirmed = String((req.body && req.body.confirm_exception) || "") === "1";
      if (!confirmed) {
        return res.redirect(303, `${detailPath}?error=confirm_required#pa-org-growth-trial`);
      }
      const organizationId = await resolveOrganizationIdByKey(getPool(), organizationKey);
      if (!organizationId) {
        return res.redirect(303, `${detailPath}?error=not_found#pa-org-growth-trial`);
      }
      const deployment = getPlatformDeploymentCode(env);
      const result = await grantGrowthTrialException(getPool(), {
        organizationId,
        actorUserId: req.platformAdminContext.userId,
        reason: req.body && req.body.exception_reason,
        deploymentCode: deployment && deployment.ok ? deployment.code : "blessboard-org-v5",
      });
      if (!result.ok) {
        const error =
          result.reason === "exception_reason_required" ? "reason_required" : "growth_trial_exception_failed";
        return res.redirect(303, `${detailPath}?error=${error}#pa-org-growth-trial`);
      }
      return res.redirect(303, `${detailPath}?notice=growth_trial_exception#pa-org-growth-trial`);
    }
  );

  router.post(
    "/admin/organizations/:organizationKey/plan",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      const organizationKey = String(req.params.organizationKey || "")
        .trim()
        .toLowerCase();
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.status(403).type("text").send("Invalid or missing CSRF token.");
      }
      const confirmed = String((req.body && req.body.confirm_plan_change) || "") === "1";
      const result = await assignOrganizationPlanByKey(getPool(), {
        organizationKey,
        planKey: req.body && req.body.plan_key,
        notes: req.body && req.body.notes,
        confirmed,
      });
      if (!result.ok) {
        let error = "plan_failed";
        if (result.status === ENTITLEMENTS_ADMIN_STATUS.CONFIRMATION_REQUIRED) {
          error = "confirm_required";
        } else if (result.status === ENTITLEMENTS_ADMIN_STATUS.NOT_FOUND) {
          error = "not_found";
        } else if (result.status === ENTITLEMENTS_ADMIN_STATUS.INVALID_INPUT) {
          error = "invalid";
        } else if (result.status === ENTITLEMENTS_ADMIN_STATUS.LIMIT_EXCEEDED) {
          error = "branch_limit";
        }
        return res.redirect(
          303,
          `/admin/organizations/${encodeURIComponent(organizationKey)}?error=${error}#pa-org-subscription`
        );
      }
      return res.redirect(
        303,
        `/admin/organizations/${encodeURIComponent(organizationKey)}?notice=plan_saved#pa-org-subscription`
      );
    }
  );

  router.post(
    "/admin/organizations/:organizationKey/billing/activate-paid",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      const organizationKey = String(req.params.organizationKey || "")
        .trim()
        .toLowerCase();
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.status(403).type("text").send("Invalid or missing CSRF token.");
      }
      const confirmed = String((req.body && req.body.confirm_billing_activation) || "") === "1";
      const result = await activatePaidSubscriptionByOrganizationKey(getPool(), {
        organizationKey,
        planKey: req.body && req.body.plan_key,
        reason: req.body && req.body.reason,
        billingCustomerRef: req.body && req.body.billing_customer_ref,
        billingSubscriptionRef: req.body && req.body.billing_subscription_ref,
        billingProvider: (req.body && req.body.billing_provider) || "manual_external",
        confirmed,
        actorUserId: req.platformAdminContext && req.platformAdminContext.userId,
        env,
      });
      if (!result.ok) {
        let error = "billing_failed";
        if (result.status === BILLING_STATUS.CONFIRMATION_REQUIRED) {
          error = "confirm_required";
        } else if (result.status === BILLING_STATUS.NOT_FOUND) {
          error = "not_found";
        } else if (result.status === BILLING_STATUS.INVALID_INPUT) {
          error = "invalid";
        } else if (result.status === BILLING_STATUS.CONFLICT) {
          error = "branch_limit";
        }
        return res.redirect(
          303,
          `/admin/organizations/${encodeURIComponent(organizationKey)}?error=${error}#pa-org-billing`
        );
      }
      return res.redirect(
        303,
        `/admin/organizations/${encodeURIComponent(organizationKey)}?notice=billing_activated#pa-org-billing`
      );
    }
  );

  router.post(
    "/admin/organizations/:organizationKey/entitlement-override",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      const organizationKey = String(req.params.organizationKey || "")
        .trim()
        .toLowerCase();
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.status(403).type("text").send("Invalid or missing CSRF token.");
      }
      const confirmed = String((req.body && req.body.confirm_override) || "") === "1";
      const booleanRaw = String((req.body && req.body.boolean_value) || "").toLowerCase();
      const result = await setOrganizationEntitlementOverrideByKey(getPool(), {
        organizationKey,
        featureKey: req.body && req.body.feature_key,
        featureKind: req.body && req.body.feature_kind,
        booleanValue: booleanRaw === "1" || booleanRaw === "true" || booleanRaw === "on",
        limitValue: req.body && req.body.limit_value,
        reason: req.body && req.body.reason,
        confirmed,
        createdByUserId: req.platformAdminContext && req.platformAdminContext.userId,
      });
      if (!result.ok) {
        let error = "override_failed";
        if (result.status === ENTITLEMENTS_ADMIN_STATUS.CONFIRMATION_REQUIRED) {
          error = "confirm_required";
        } else if (result.status === ENTITLEMENTS_ADMIN_STATUS.NOT_FOUND) {
          error = "not_found";
        } else if (result.status === ENTITLEMENTS_ADMIN_STATUS.INVALID_INPUT) {
          error = "invalid";
        }
        return res.redirect(
          303,
          `/admin/organizations/${encodeURIComponent(organizationKey)}?error=${error}#pa-org-overrides`
        );
      }
      return res.redirect(
        303,
        `/admin/organizations/${encodeURIComponent(organizationKey)}?notice=override_saved#pa-org-overrides`
      );
    }
  );

  function rejectMaintenanceUnlessTesting(req, res) {
    if (!isTestingDataMaintenanceAllowed(env)) {
      return sendControlled(req, res, 404, "This page could not be found.");
    }
    return null;
  }

  router.get("/admin/maintenance", requireApex, requirePlatformAdmin, async (req, res) => {
    setAdminNoStore(res);
    const blocked = rejectMaintenanceUnlessTesting(req, res);
    if (blocked) return blocked;

    const model = await loadMaintenancePageModel(getPool(), { env });
    if (!model.ok) {
      if (model.status === MAINT_STATUS.FORBIDDEN || model.status === MAINT_STATUS.IDENTITY_BLOCKED) {
        return sendControlled(req, res, 404, "This page could not be found.");
      }
      return sendControlled(req, res, 503, "Maintenance tools are temporarily unavailable.");
    }

    const flash = readFlash(req);
    const html = renderPlatformAdminView(
      "platform-admin/maintenance.ejs",
      shellLocals(req, res, "maintenance", {
        pageTitle: "Maintenance",
        maintenance: model,
        confirmPhraseFull: FULL_RESET_CONFIRM_PHRASE,
        categoryActions: CATEGORY_ACTIONS,
        notice: flash.notice,
        error: flash.error,
        previewJson: null,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.post(
    "/admin/maintenance/preview",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      const blocked = rejectMaintenanceUnlessTesting(req, res);
      if (blocked) return blocked;

      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, "/admin/maintenance?error=csrf");
      }

      const secret = parseSessionSecret(env);
      if (!secret.ok) {
        return res.redirect(303, "/admin/maintenance?error=unavailable");
      }
      const sessionSecret = String(env.SESSION_SECRET || "").trim();

      const action = String((req.body && req.body.action) || "clear_all").trim();
      const preview = await previewTestingDataReset(getPool(), {
        env,
        actorUserId: req.platformAdminContext.userId,
        action,
        sessionSecret,
      });
      if (!preview.ok) {
        return res.redirect(303, "/admin/maintenance?error=preview_failed");
      }

      const model = await loadMaintenancePageModel(getPool(), { env });
      if (!model.ok) {
        return sendControlled(req, res, 503, "Maintenance tools are temporarily unavailable.");
      }

      const html = renderPlatformAdminView(
        "platform-admin/maintenance.ejs",
        shellLocals(req, res, "maintenance", {
          pageTitle: "Maintenance",
          maintenance: model,
          confirmPhraseFull: FULL_RESET_CONFIRM_PHRASE,
          categoryActions: CATEGORY_ACTIONS,
          notice: "preview_ready",
          error: null,
          previewResult: preview,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  router.post(
    "/admin/maintenance/reset",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      setAdminNoStore(res);
      // Hard gate before any mutation / DB work beyond auth already done.
      if (!isTestingDataMaintenanceAllowed(env)) {
        return sendControlled(req, res, 404, "This page could not be found.");
      }

      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.redirect(303, "/admin/maintenance?error=csrf");
      }

      const secret = parseSessionSecret(env);
      if (!secret.ok) {
        return res.redirect(303, "/admin/maintenance?error=unavailable");
      }
      const sessionSecret = String(env.SESSION_SECRET || "").trim();

      const deployment = getPlatformDeploymentCode(env);
      const action = String((req.body && req.body.action) || "").trim();
      const confirmPhrase = String((req.body && req.body.confirm_phrase) || "");
      const confirmChecked = String((req.body && req.body.confirm_destructive) || "") === "1";
      const previewToken = String((req.body && req.body.preview_token) || "");
      const session =
        req.v5Session && req.v5Session.authenticated && req.v5Session.session
          ? req.v5Session.session
          : null;

      const result = await executeTestingDataReset(getPool(), {
        env,
        actorUserId: req.platformAdminContext.userId,
        action,
        confirmPhrase,
        confirmChecked,
        previewToken,
        sessionSecret,
        deploymentCode: deployment.ok ? deployment.code : "blessboard-org-v5",
        keepSessionId: session && session.id ? session.id : null,
        dryRun: false,
      });

      if (!result.ok) {
        let error = "reset_failed";
        if (result.status === MAINT_STATUS.INVALID_INPUT) error = "confirm_invalid";
        else if (result.status === MAINT_STATUS.PREVIEW_REQUIRED) error = "preview_required";
        else if (result.status === MAINT_STATUS.PREVIEW_STALE) error = "preview_stale";
        else if (result.status === MAINT_STATUS.IDENTITY_BLOCKED) error = "identity_blocked";
        else if (result.status === MAINT_STATUS.LOCK_BUSY) error = "busy";
        else if (result.status === MAINT_STATUS.FORBIDDEN) error = "forbidden";
        return res.redirect(303, `/admin/maintenance?error=${error}`);
      }

      const model = await loadMaintenancePageModel(getPool(), { env });
      const html = renderPlatformAdminView(
        "platform-admin/maintenance.ejs",
        shellLocals(req, res, "maintenance", {
          pageTitle: "Maintenance",
          maintenance: model.ok ? model : null,
          confirmPhraseFull: FULL_RESET_CONFIRM_PHRASE,
          categoryActions: CATEGORY_ACTIONS,
          notice: "reset_complete",
          error: null,
          resetResult: result,
          previewResult: null,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  return router;
}

module.exports = {
  createPlatformAdminRouter,
  renderPlatformAdminView,
  parsePhoneVerificationAttemptForm,
  mapPhoneVerificationAttemptError,
  mapEmailVerificationResendError,
  mapDuplicateDecisionError,
  parseInformationRequestForm,
  mapInformationRequestError,
  parseRejectForm,
  mapRejectRouteError,
  parseReopenForm,
  mapReopenRouteError,
  REJECTION_CATEGORIES,
};
