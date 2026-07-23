"use strict";

/**
 * Read-only verification facts for Platform Admin registration review (Phase2 Batch 7).
 * Derives honest statuses from canonical application data + optional injected lookups.
 * Does not mutate data, write audits, persist statuses, or gate approval.
 */

const {
  isNetworkPlanSelection,
} = require("./platformChurchRegistrationValidation");
const { ALLOWED_PUBLIC_PLAN_CODES } = require("./registrationPlanMapping");
const {
  RISK_REASON_CODES,
  filterAllowlistedReasonCodes,
} = require("./registrationRiskDecision");

const STATUSES = Object.freeze({
  NOT_CHECKED: "not_checked",
  PASSED: "passed",
  WARNING: "warning",
  FAILED: "failed",
  MANUALLY_REVIEWED: "manually_reviewed",
});

const ALLOWED_STATUS_SET = new Set(Object.values(STATUSES));

const FACT_DEFS = Object.freeze([
  {
    key: "phone_unique_registration_scope",
    label: "Applicant phone unique (registration applications)",
  },
  {
    key: "church_name_exact_match",
    label: "Exact church name match at same city and country",
  },
  {
    key: "required_fields_complete",
    label: "Required registration fields complete",
  },
  {
    key: "requested_plan_eligible",
    label: "Requested plan eligible",
  },
  {
    key: "organization_linked",
    label: "Application linked to an organization",
  },
  {
    key: "risk_decision_present",
    label: "Existing risk decision",
  },
  {
    key: "support_or_follow_up_required",
    label: "Support or follow-up required",
  },
  {
    key: "approval_eligible_current_rules",
    label: "Eligible for approval under current backend rules",
  },
  {
    key: "email_unique_platform_users_only",
    label: "Applicant email unique among platform users",
  },
  {
    key: "duplicate_review_evidence",
    label: "Duplicate review evidence",
  },
  {
    key: "applicant_contacted_by_phone",
    label: "Applicant contacted by phone",
  },
  {
    key: "authority_terms_accepted",
    label: "Terms acceptance recorded",
  },
  {
    key: "organization_key_available",
    label: "Organization key available",
  },
  {
    key: "provisioning_prerequisites_current_rules",
    label: "Provisioning prerequisites under current backend rules",
  },
  {
    key: "final_reviewer_note_present",
    label: "Final reviewer note present",
  },
  {
    key: "applicant_email_verified",
    label: "Applicant email verified",
    unsupported: true,
  },
  {
    key: "applicant_identity_confirmed",
    label: "Applicant identity confirmed",
  },
  {
    key: "applicant_authority_confirmed",
    label: "Applicant authority confirmed",
  },
  {
    key: "registration_documents_complete",
    label: "Registration documents complete",
    unsupported: true,
  },
  {
    key: "distinct_website_key_available",
    label: "Distinct website key available",
    unsupported: true,
  },
]);

/**
 * @param {unknown} value
 * @returns {string}
 */
function trimStr(value) {
  if (value == null) return "";
  return String(value).trim();
}

/**
 * @param {object} app
 * @param {string} camel
 * @param {string} snake
 * @returns {unknown}
 */
function pick(app, camel, snake) {
  if (!app || typeof app !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(app, camel) && app[camel] != null) {
    return app[camel];
  }
  if (snake && Object.prototype.hasOwnProperty.call(app, snake)) {
    return app[snake];
  }
  return app[camel];
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function normalizeReasonCodes(raw) {
  return filterAllowlistedReasonCodes(raw || []);
}

/**
 * @param {object} input
 */
function normalizeApplication(input) {
  const app = input && typeof input === "object" ? input : {};
  const selectedPlan = trimStr(pick(app, "selectedPlan", "selected_plan")).toLowerCase();
  const reasonCodes = normalizeReasonCodes(
    pick(app, "riskReasonCodes", "risk_reason_codes")
  );
  const contacts = Array.isArray(input && input.contacts)
    ? input.contacts
    : Array.isArray(app.contacts)
      ? app.contacts
      : [];
  const reviewEvents = Array.isArray(pick(app, "reviewEvents", "review_events"))
    ? pick(app, "reviewEvents", "review_events")
    : [];

  return {
    id: trimStr(pick(app, "id", "id")) || null,
    churchName: trimStr(pick(app, "churchName", "church_name")),
    country: trimStr(pick(app, "country", "country")),
    city: trimStr(pick(app, "city", "city")),
    contactName: trimStr(pick(app, "contactName", "contact_name")),
    roleInChurch: trimStr(pick(app, "roleInChurch", "role_in_church")),
    contactEmail: trimStr(pick(app, "contactEmail", "contact_email")).toLowerCase(),
    contactPhone: trimStr(pick(app, "contactPhone", "contact_phone")),
    contactPhoneNormalized: trimStr(
      pick(app, "contactPhoneNormalized", "contact_phone_normalized")
    ),
    selectedPlan: selectedPlan || null,
    consentTerms: Boolean(pick(app, "consentTerms", "consent_terms")),
    applicationStatus: trimStr(
      pick(app, "applicationStatus", "application_status")
    ).toLowerCase(),
    provisioningStatus: trimStr(
      pick(app, "provisioningStatus", "provisioning_status")
    ).toLowerCase(),
    followUpStatus: trimStr(pick(app, "followUpStatus", "follow_up_status")).toLowerCase(),
    supportRequested: Boolean(pick(app, "supportRequested", "support_requested")),
    riskDecision: trimStr(pick(app, "riskDecision", "risk_decision")).toLowerCase() || null,
    riskReasonCodes: reasonCodes,
    riskDecidedAt: pick(app, "riskDecidedAt", "risk_decided_at") || null,
    organizationId: trimStr(pick(app, "organizationId", "organization_id")) || null,
    organizationKey: trimStr(pick(app, "organizationKey", "organization_key")) || null,
    reviewNotes: trimStr(pick(app, "reviewNotes", "review_notes")),
    reviewEvents,
    contacts,
    riskReviewActionsAvailable:
      pick(app, "riskReviewActionsAvailable", null) === true,
    networkApproveAvailable: pick(app, "networkApproveAvailable", null) === true,
    retryProvisionAvailable: pick(app, "retryProvisionAvailable", null) === true,
    flagsProvided: Object.prototype.hasOwnProperty.call(app, "riskReviewActionsAvailable"),
  };
}

/**
 * @param {object} p
 * @returns {object}
 */
function fact(p) {
  const status = ALLOWED_STATUS_SET.has(p.status) ? p.status : STATUSES.NOT_CHECKED;
  return {
    key: p.key,
    label: p.label,
    status,
    result: p.result != null ? String(p.result) : status,
    explanation: String(p.explanation || ""),
    source: String(p.source || "application"),
    checkedAt: p.checkedAt != null ? p.checkedAt : null,
    supported: p.supported !== false,
    requiresManualReview: Boolean(p.requiresManualReview),
  };
}

function unsupportedFact(def, checkedAt) {
  return fact({
    key: def.key,
    label: def.label,
    status: STATUSES.NOT_CHECKED,
    result: "unsupported",
    explanation:
      "BlessBoard does not yet store the evidence required for this check. It is not verified and must not be treated as passed.",
    source: "unsupported",
    checkedAt,
    supported: false,
    requiresManualReview: true,
  });
}

/**
 * Mirror current admin approve eligibility without changing backend rules.
 * @param {ReturnType<typeof normalizeApplication>} app
 */
function computeApprovalEligible(app) {
  if (app.flagsProvided) {
    return (
      app.riskReviewActionsAvailable ||
      app.networkApproveAvailable ||
      app.retryProvisionAvailable
    );
  }
  if (app.organizationId) return false;
  if (app.provisioningStatus === "provisioned") return false;
  if (!app.contactEmail) return false;
  if (isNetworkPlanSelection(app.selectedPlan)) {
    if (["rejected", "cancelled"].includes(app.applicationStatus)) return false;
    return (
      app.followUpStatus === "approved_for_provision" ||
      app.followUpStatus === "qualified"
    );
  }
  if (["rejected", "cancelled", "closed"].includes(app.applicationStatus)) return false;
  if (app.provisioningStatus === "provisioning_failed") {
    return false;
  }
  return ["submitted", "duplicate_review"].includes(app.applicationStatus);
}

/**
 * @param {ReturnType<typeof normalizeApplication>} app
 */
function computeProvisioningPrerequisites(app) {
  if (!app.contactEmail) return { ok: false, reason: "administrator_email_required" };
  if (app.organizationId && app.provisioningStatus === "provisioned") {
    return { ok: true, reason: "already_provisioned" };
  }
  if (isNetworkPlanSelection(app.selectedPlan)) {
    if (["rejected", "cancelled"].includes(app.applicationStatus)) {
      return { ok: false, reason: "not_eligible" };
    }
    if (
      app.followUpStatus !== "approved_for_provision" &&
      app.followUpStatus !== "qualified"
    ) {
      return { ok: false, reason: "network_validation_required" };
    }
    return { ok: true, reason: "network_ready" };
  }
  if (["rejected", "cancelled", "closed"].includes(app.applicationStatus)) {
    return { ok: false, reason: "not_eligible" };
  }
  if (!["submitted", "duplicate_review"].includes(app.applicationStatus)) {
    if (app.provisioningStatus === "provisioning_failed") {
      return { ok: false, reason: "retry_review_required" };
    }
    return { ok: false, reason: "not_eligible" };
  }
  return { ok: true, reason: "foundation_growth_ready" };
}

/**
 * @param {ReturnType<typeof normalizeApplication>} app
 * @param {object} deps
 * @param {string} checkedAt
 */
async function buildSupportedFacts(app, deps, checkedAt) {
  const codes = app.riskReasonCodes;
  const hasCode = (c) => codes.includes(c);
  const out = [];

  // 1. phone_unique_registration_scope
  {
    const phone = app.contactPhoneNormalized || app.contactPhone;
    let status = STATUSES.NOT_CHECKED;
    let result = "not_checked";
    let requiresManualReview = false;
    let source = "risk_snapshot";
    if (!phone) {
      status = STATUSES.NOT_CHECKED;
      result = "phone_missing";
    } else if (typeof deps.findOccupyingPhoneMatch === "function") {
      source = "registration_phone_lookup";
      const hit = await deps.findOccupyingPhoneMatch(phone, app);
      if (hit === undefined) {
        status = STATUSES.NOT_CHECKED;
        result = "lookup_unavailable";
      } else {
        const hitEmail = trimStr(hit && (hit.contact_email || hit.contactEmail)).toLowerCase();
        if (hit && hitEmail && app.contactEmail && hitEmail === app.contactEmail) {
          status = STATUSES.PASSED;
          result = "soft_idempotent_same_email";
        } else if (hit) {
          status = STATUSES.FAILED;
          result = "duplicate_phone_registration_scope";
          requiresManualReview = true;
        } else {
          status = STATUSES.PASSED;
          result = "unique_registration_scope";
        }
      }
    } else if (hasCode(RISK_REASON_CODES.DUPLICATE_PHONE)) {
      status = STATUSES.FAILED;
      result = "duplicate_phone_in_risk_snapshot";
      requiresManualReview = true;
    } else {
      status = STATUSES.NOT_CHECKED;
      result = "no_live_lookup";
    }
    out.push(
      fact({
        key: "phone_unique_registration_scope",
        label: "Applicant phone unique (registration applications)",
        status,
        result,
        explanation:
          "Phone uniqueness currently covers registration applications only (open or in-flight applications and provisioned/provisioning rows using normalized phone). It does not check platform users, organizations, churches, branches, or support contacts." +
          (status === STATUSES.NOT_CHECKED &&
          (result === "no_live_lookup" || result === "lookup_unavailable")
            ? " No live registration-scope lookup was available, so uniqueness is not confirmed from this snapshot alone."
            : ""),
        source,
        checkedAt: status === STATUSES.NOT_CHECKED ? null : checkedAt,
        supported: true,
        requiresManualReview,
      })
    );
  }

  // 2. church_name_exact_match
  {
    let status = STATUSES.NOT_CHECKED;
    let result = "not_checked";
    let source = "risk_snapshot";
    let requiresManualReview = false;
    if (!app.churchName || !app.city || !app.country) {
      result = "identity_incomplete";
    } else if (typeof deps.findSimilarOrganizationMatch === "function") {
      source = "registration_name_lookup";
      const hit = await deps.findSimilarOrganizationMatch({
        churchName: app.churchName,
        city: app.city,
        country: app.country,
        excludeApplicationId: app.id,
        excludeContactEmail: app.contactEmail || null,
      });
      if (hit === undefined) {
        status = STATUSES.NOT_CHECKED;
        result = "lookup_unavailable";
      } else if (hit) {
        status = STATUSES.WARNING;
        result = "exact_name_city_country_match";
        requiresManualReview = true;
      } else {
        status = STATUSES.PASSED;
        result = "no_exact_match";
      }
    } else if (hasCode(RISK_REASON_CODES.SIMILAR_ORGANIZATION)) {
      status = STATUSES.WARNING;
      result = "exact_match_in_risk_snapshot";
      requiresManualReview = true;
    } else {
      result = "no_live_lookup";
    }
    out.push(
      fact({
        key: "church_name_exact_match",
        label: "Exact church name match at same city and country",
        status,
        result,
        explanation:
          "This check uses an exact match on church name, city, and country only. It is not a fuzzy similarity score." +
          (status === STATUSES.NOT_CHECKED &&
          (result === "no_live_lookup" || result === "lookup_unavailable")
            ? " No live lookup was available, so absence of a risk code does not prove there is no match."
            : ""),
        source,
        checkedAt: status === STATUSES.NOT_CHECKED ? null : checkedAt,
        supported: true,
        requiresManualReview,
      })
    );
  }

  // 3. required_fields_complete
  {
    const missing = [];
    if (!app.churchName) missing.push("church_name");
    if (!app.country) missing.push("country");
    if (!app.city) missing.push("city");
    if (!app.contactName) missing.push("contact_name");
    if (!app.roleInChurch) missing.push("role_in_church");
    if (!app.contactEmail) missing.push("contact_email");
    if (!app.contactPhone && !app.contactPhoneNormalized) missing.push("contact_phone");
    if (!app.selectedPlan) missing.push("selected_plan");
    if (!app.consentTerms) missing.push("consent_terms");
    const complete = missing.length === 0;
    out.push(
      fact({
        key: "required_fields_complete",
        label: "Required registration fields complete",
        status: complete ? STATUSES.PASSED : STATUSES.FAILED,
        result: complete ? "complete" : "incomplete",
        explanation: complete
          ? "All fields required at public registration submission are present on this application."
          : `Required submission fields are incomplete (${missing.join(", ")}).`,
        source: "application_row",
        checkedAt,
        supported: true,
        requiresManualReview: !complete,
      })
    );
  }

  // 4. requested_plan_eligible
  {
    const eligible =
      Boolean(app.selectedPlan) && ALLOWED_PUBLIC_PLAN_CODES.includes(app.selectedPlan);
    out.push(
      fact({
        key: "requested_plan_eligible",
        label: "Requested plan eligible",
        status: !app.selectedPlan
          ? STATUSES.FAILED
          : eligible
            ? STATUSES.PASSED
            : STATUSES.FAILED,
        result: !app.selectedPlan ? "missing" : eligible ? "eligible" : "ineligible",
        explanation: eligible
          ? "The requested plan is in the allowlisted public registration plans (foundation, growth, network)."
          : "The requested plan is missing or is not an allowlisted public registration plan.",
        source: "application_row",
        checkedAt,
        supported: true,
        requiresManualReview: !eligible,
      })
    );
  }

  // 5. organization_linked
  {
    const linked = Boolean(app.organizationId || app.organizationKey);
    out.push(
      fact({
        key: "organization_linked",
        label: "Application linked to an organization",
        status: linked ? STATUSES.PASSED : STATUSES.NOT_CHECKED,
        result: linked ? "linked" : "unlinked",
        explanation: linked
          ? "This application is linked to an organization key or organization id."
          : "This application is not linked to an organization.",
        source: "application_row",
        checkedAt,
        supported: true,
        requiresManualReview: false,
      })
    );
  }

  // 6. risk_decision_present
  {
    const present = Boolean(app.riskDecision);
    out.push(
      fact({
        key: "risk_decision_present",
        label: "Existing risk decision",
        status: present ? STATUSES.PASSED : STATUSES.NOT_CHECKED,
        result: present ? app.riskDecision : "absent",
        explanation: present
          ? `A stored risk decision is present (${app.riskDecision}). This reports presence only and does not mean low risk.`
          : "No stored risk decision is present. A missing risk decision does not mean low risk.",
        source: "risk_snapshot",
        checkedAt: present ? app.riskDecidedAt || checkedAt : null,
        supported: true,
        requiresManualReview: !present || app.riskDecision === "review_required",
      })
    );
  }

  // 7. support_or_follow_up_required
  {
    const required =
      app.supportRequested || isNetworkPlanSelection(app.selectedPlan);
    out.push(
      fact({
        key: "support_or_follow_up_required",
        label: "Support or follow-up required",
        status: required ? STATUSES.WARNING : STATUSES.PASSED,
        result: required ? "required" : "not_required",
        explanation: required
          ? "Support follow-up is required because support was requested and/or the Network plan was selected."
          : "Support follow-up is not required by support-requested or Network plan flags on this application.",
        source: "application_row",
        checkedAt,
        supported: true,
        requiresManualReview: required,
      })
    );
  }

  // 8. approval_eligible_current_rules
  {
    const eligible = computeApprovalEligible(app);
    out.push(
      fact({
        key: "approval_eligible_current_rules",
        label: "Eligible for approval under current backend rules",
        status: eligible ? STATUSES.PASSED : STATUSES.FAILED,
        result: eligible ? "eligible" : "ineligible",
        explanation:
          "This reflects current backend approval eligibility only (status, plan, Network follow-up, and provisioning state). It is not the future Phase2 verification checklist and does not require email or phone verification.",
        source: "current_approval_rules",
        checkedAt,
        supported: true,
        requiresManualReview: !eligible,
      })
    );
  }

  // 9. email_unique_platform_users_only
  {
    let status = STATUSES.NOT_CHECKED;
    let result = "not_checked";
    let source = "risk_snapshot";
    let requiresManualReview = false;
    if (!app.contactEmail) {
      result = "email_missing";
    } else if (typeof deps.findUserByEmail === "function") {
      source = "platform_user_lookup";
      const user = await deps.findUserByEmail(app.contactEmail);
      if (user === undefined) {
        status = STATUSES.NOT_CHECKED;
        result = "lookup_unavailable";
      } else if (user) {
        status = STATUSES.WARNING;
        result = "email_in_use_by_platform_user";
        requiresManualReview = true;
      } else {
        status = STATUSES.PASSED;
        result = "unique_among_platform_users";
      }
    } else if (hasCode(RISK_REASON_CODES.DUPLICATE_EMAIL)) {
      status = STATUSES.WARNING;
      result = "duplicate_email_in_risk_snapshot";
      requiresManualReview = true;
    } else {
      result = "no_live_lookup";
    }
    out.push(
      fact({
        key: "email_unique_platform_users_only",
        label: "Applicant email unique among platform users",
        status,
        result,
        explanation:
          "Email uniqueness currently covers platform users only. It does not prove uniqueness across pending registration applications, organization contacts, or church/branch contacts, and it does not confirm email ownership." +
          (status === STATUSES.NOT_CHECKED &&
          (result === "no_live_lookup" || result === "lookup_unavailable")
            ? " No live platform-user lookup was available, so uniqueness is not confirmed from this snapshot alone."
            : ""),
        source,
        checkedAt: status === STATUSES.NOT_CHECKED ? null : checkedAt,
        supported: true,
        requiresManualReview,
      })
    );
  }

  // 10. duplicate_review_evidence
  {
    const inDuplicateReview = app.applicationStatus === "duplicate_review";
    const reviewActions = (app.reviewEvents || []).filter(
      (e) =>
        e &&
        typeof e === "object" &&
        ["approve_provision", "approve_network_organization", "reject", "link_organization"].includes(
          String(e.action || "")
        )
    );
    let status = STATUSES.NOT_CHECKED;
    let result = "none";
    let requiresManualReview = true;
    if (reviewActions.length) {
      status = STATUSES.MANUALLY_REVIEWED;
      result = "admin_action_recorded";
      requiresManualReview = false;
    } else if (inDuplicateReview) {
      status = STATUSES.WARNING;
      result = "held_for_duplicate_review";
    } else if (
      hasCode(RISK_REASON_CODES.DUPLICATE_PHONE) ||
      hasCode(RISK_REASON_CODES.DUPLICATE_EMAIL) ||
      hasCode(RISK_REASON_CODES.SIMILAR_ORGANIZATION)
    ) {
      status = STATUSES.WARNING;
      result = "risk_duplicate_signals";
    }
    out.push(
      fact({
        key: "duplicate_review_evidence",
        label: "Duplicate review evidence",
        status,
        result,
        explanation:
          "Evidence is limited to application status, stored risk reason codes, and review events. This is not a structured per-match duplicate decision log.",
        source: "application_status_and_review_events",
        checkedAt: status === STATUSES.NOT_CHECKED ? null : checkedAt,
        supported: true,
        requiresManualReview,
      })
    );
  }

  // 11. applicant_contacted_by_phone — structured phone-verification attempts only
  {
    const phoneEvidence = resolvePhoneVerificationEvidence(deps.phoneVerification);
    let status = STATUSES.NOT_CHECKED;
    let result = "no_structured_phone_attempts";
    let explanation =
      "No structured phone-verification attempts are recorded. Generic support-contact notes are not used as proof of a completed verification call.";
    let requiresManualReview = true;
    let checked = null;

    if (phoneEvidence.unavailable) {
      status = STATUSES.WARNING;
      result = "phone_history_unavailable";
      explanation =
        "Structured phone-verification history is temporarily unavailable. Generic support-contact notes are not used as verified call evidence.";
      requiresManualReview = true;
    } else if (phoneEvidence.hasAttempts && phoneEvidence.summary.applicantContacted === true) {
      status = STATUSES.PASSED;
      result = "structured_applicant_contacted";
      explanation =
        "Based on structured phone-verification attempts, an answered call was recorded. Answered does not automatically confirm identity or authority.";
      requiresManualReview = false;
      checked = checkedAt;
    } else if (phoneEvidence.hasAttempts) {
      status = STATUSES.NOT_CHECKED;
      result = "structured_attempts_without_answered_call";
      explanation =
        "Structured phone-verification attempts exist, but none are recorded as answered. Generic support-contact notes are not used as proof of a completed verification call.";
      requiresManualReview = true;
    }

    out.push(
      fact({
        key: "applicant_contacted_by_phone",
        label: "Applicant contacted by phone",
        status,
        result,
        explanation,
        source: "phone_verification_attempts",
        checkedAt: checked,
        supported: true,
        requiresManualReview,
      })
    );
  }

  // 12. authority_terms_accepted
  {
    out.push(
      fact({
        key: "authority_terms_accepted",
        label: "Terms acceptance recorded",
        status: app.consentTerms ? STATUSES.PASSED : STATUSES.FAILED,
        result: app.consentTerms ? "terms_accepted" : "terms_not_accepted",
        explanation: app.consentTerms
          ? "Terms and privacy acceptance is recorded. This does not independently verify the applicant's authority to administer the church."
          : "Terms and privacy acceptance is not recorded on this application.",
        source: "application_row",
        checkedAt,
        supported: true,
        requiresManualReview: !app.consentTerms,
      })
    );
  }

  // 12b. applicant_authority_confirmed — structured phone evidence only (terms are separate)
  {
    const phoneEvidence = resolvePhoneVerificationEvidence(deps.phoneVerification);
    let status = STATUSES.NOT_CHECKED;
    let result = "authority_not_checked";
    let explanation =
      "Applicant authority has not been confirmed from structured phone-verification attempts. Terms acceptance alone is not independent authority confirmation.";
    let requiresManualReview = true;
    let checked = null;
    let supported = true;

    if (phoneEvidence.unavailable) {
      status = STATUSES.WARNING;
      result = "phone_history_unavailable";
      explanation =
        "Structured phone-verification history is temporarily unavailable, so authority confirmation cannot be evaluated from call evidence. Terms acceptance remains separate supporting context only.";
      requiresManualReview = true;
    } else if (phoneEvidence.summary.authorityConfirmed === true) {
      status = STATUSES.PASSED;
      result = "authority_confirmed";
      explanation =
        "Based on structured phone-verification attempts, applicant authority was explicitly confirmed. Terms acceptance remains separate supporting context and is not treated as authority confirmation by itself.";
      requiresManualReview = false;
      checked = checkedAt;
    } else if (phoneEvidence.latestAuthorityStatus === "not_confirmed") {
      status = STATUSES.FAILED;
      result = "authority_not_confirmed";
      explanation =
        "Based on structured phone-verification attempts, the newest relevant explicit authority status is not confirmed.";
      requiresManualReview = true;
      checked = checkedAt;
    } else if (!phoneEvidence.historyAvailable) {
      // No phoneVerification payload supplied — still supported capability, not checked.
      supported = true;
      status = STATUSES.NOT_CHECKED;
      result = "authority_not_checked";
    }

    out.push(
      fact({
        key: "applicant_authority_confirmed",
        label: "Applicant authority confirmed",
        status,
        result,
        explanation,
        source: "phone_verification_attempts",
        checkedAt: checked,
        supported,
        requiresManualReview,
      })
    );
  }

  // 12c. applicant_identity_confirmed — structured phone evidence only
  {
    const phoneEvidence = resolvePhoneVerificationEvidence(deps.phoneVerification);
    let status = STATUSES.NOT_CHECKED;
    let result = "identity_not_checked";
    let explanation =
      "Applicant identity has not been confirmed from structured phone-verification attempts. An answered call alone does not confirm identity.";
    let requiresManualReview = true;
    let checked = null;

    if (phoneEvidence.unavailable) {
      status = STATUSES.WARNING;
      result = "phone_history_unavailable";
      explanation =
        "Structured phone-verification history is temporarily unavailable, so identity confirmation cannot be evaluated from call evidence.";
      requiresManualReview = true;
    } else if (phoneEvidence.summary.identityConfirmed === true) {
      status = STATUSES.PASSED;
      result = "identity_confirmed";
      explanation =
        "Based on structured phone-verification attempts, applicant identity was explicitly confirmed. An answered call alone is not treated as identity confirmation.";
      requiresManualReview = false;
      checked = checkedAt;
    } else if (phoneEvidence.latestIdentityStatus === "not_confirmed") {
      status = STATUSES.FAILED;
      result = "identity_not_confirmed";
      explanation =
        "Based on structured phone-verification attempts, the newest relevant explicit identity status is not confirmed.";
      requiresManualReview = true;
      checked = checkedAt;
    }

    out.push(
      fact({
        key: "applicant_identity_confirmed",
        label: "Applicant identity confirmed",
        status,
        result,
        explanation,
        source: "phone_verification_attempts",
        checkedAt: checked,
        supported: true,
        requiresManualReview,
      })
    );
  }

  // 13. organization_key_available
  {
    let status = STATUSES.NOT_CHECKED;
    let result = "not_stored";
    let requiresManualReview = false;
    if (app.organizationKey) {
      status = STATUSES.PASSED;
      result = "organization_key_present";
    } else if (hasCode(RISK_REASON_CODES.RESERVED_ORGANIZATION_KEY)) {
      status = STATUSES.FAILED;
      result = "reserved_organization_key";
      requiresManualReview = true;
    }
    out.push(
      fact({
        key: "organization_key_available",
        label: "Organization key available",
        status,
        result,
        explanation:
          "The canonical identifier is the organization key. A separate website key is not stored on registration applications. When no key is present on the application, availability is checked later at approve/provision time.",
        source: app.organizationKey ? "application_row" : "risk_snapshot",
        checkedAt: status === STATUSES.NOT_CHECKED ? null : checkedAt,
        supported: true,
        requiresManualReview,
      })
    );
  }

  // 14. provisioning_prerequisites_current_rules
  {
    const prep = computeProvisioningPrerequisites(app);
    out.push(
      fact({
        key: "provisioning_prerequisites_current_rules",
        label: "Provisioning prerequisites under current backend rules",
        status: prep.ok ? STATUSES.PASSED : STATUSES.FAILED,
        result: prep.reason,
        explanation:
          "This mirrors current provisioning prerequisites (administrator email, application/follow-up status, Network validation). It does not require Phase2 verification checklist completion.",
        source: "current_provisioning_rules",
        checkedAt,
        supported: true,
        requiresManualReview: !prep.ok,
      })
    );
  }

  // 15. final_reviewer_note_present
  {
    const noteFromField = Boolean(app.reviewNotes);
    const noteFromContact = (app.contacts || []).some((c) => {
      const method = trimStr(c && (c.contactMethod || c.contact_method)).toLowerCase();
      const note = trimStr(c && c.note);
      return method === "internal_note" || note.length > 0;
    });
    const present = noteFromField || noteFromContact;
    out.push(
      fact({
        key: "final_reviewer_note_present",
        label: "Final reviewer note present",
        status: present ? STATUSES.MANUALLY_REVIEWED : STATUSES.NOT_CHECKED,
        result: present
          ? noteFromField
            ? "review_notes_present"
            : "contact_note_present"
          : "no_reviewer_note",
        explanation: present
          ? "An administrator note is present (review notes and/or support contact note). This is not a required approval gate today."
          : "No final reviewer note is present on the application. review_notes may be unset in the detail presenter even when a DB column exists.",
        source: noteFromField ? "review_notes" : "support_contacts",
        checkedAt: present ? checkedAt : null,
        supported: true,
        requiresManualReview: !present,
      })
    );
  }

  return out;
}

/**
 * Normalize optional phoneVerification payload from the detail loader.
 * Does not reload attempts; does not trust client-submitted verification values.
 * @param {unknown} phoneVerification
 */
function resolvePhoneVerificationEvidence(phoneVerification) {
  const empty = {
    historyAvailable: false,
    unavailable: false,
    hasAttempts: false,
    summary: {
      applicantContacted: false,
      identityConfirmed: false,
      authorityConfirmed: false,
    },
    latestIdentityStatus: "not_checked",
    latestAuthorityStatus: "not_checked",
  };
  if (!phoneVerification || typeof phoneVerification !== "object") {
    return empty;
  }
  const unavailable = Boolean(phoneVerification.unavailable);
  const attempts = Array.isArray(phoneVerification.attempts) ? phoneVerification.attempts : [];
  const summary =
    phoneVerification.summary && typeof phoneVerification.summary === "object"
      ? phoneVerification.summary
      : {};
  const latestIdentityStatus = trimStr(
    summary.latestIdentityStatus != null
      ? summary.latestIdentityStatus
      : summary.identityConfirmed === true
        ? "confirmed"
        : "not_checked"
  ).toLowerCase() || "not_checked";
  const latestAuthorityStatus = trimStr(
    summary.latestAuthorityStatus != null
      ? summary.latestAuthorityStatus
      : summary.authorityConfirmed === true
        ? "confirmed"
        : "not_checked"
  ).toLowerCase() || "not_checked";

  return {
    historyAvailable: true,
    unavailable,
    hasAttempts: attempts.length > 0 || Number(summary.totalAttempts) > 0,
    summary: {
      applicantContacted: summary.applicantContacted === true,
      identityConfirmed:
        summary.identityConfirmed === true || latestIdentityStatus === "confirmed",
      authorityConfirmed:
        summary.authorityConfirmed === true || latestAuthorityStatus === "confirmed",
    },
    latestIdentityStatus:
      latestIdentityStatus === "confirmed" || latestIdentityStatus === "not_confirmed"
        ? latestIdentityStatus
        : "not_checked",
    latestAuthorityStatus:
      latestAuthorityStatus === "confirmed" || latestAuthorityStatus === "not_confirmed"
        ? latestAuthorityStatus
        : "not_checked",
  };
}

/**
 * Build read-only verification facts for one registration application.
 *
 * @param {{
 *   application?: object,
 *   contacts?: object[],
 *   now?: Date|string,
 *   findOccupyingPhoneMatch?: Function,
 *   findSimilarOrganizationMatch?: Function,
 *   findUserByEmail?: Function,
 * }} [input]
 */
async function buildRegistrationVerificationFacts(input = {}) {
  const checkedAt =
    input.now != null
      ? new Date(input.now).toISOString()
      : new Date().toISOString();
  const app = normalizeApplication({
    ...(input.application || {}),
    contacts: input.contacts != null ? input.contacts : (input.application && input.application.contacts),
  });

  const deps = {
    findOccupyingPhoneMatch: input.findOccupyingPhoneMatch,
    findSimilarOrganizationMatch: input.findSimilarOrganizationMatch,
    findUserByEmail: input.findUserByEmail,
    phoneVerification: input.phoneVerification,
  };

  const supported = await buildSupportedFacts(app, deps, checkedAt);
  const unsupported = FACT_DEFS.filter((d) => d.unsupported).map((d) =>
    unsupportedFact(d, checkedAt)
  );

  const byKey = new Map();
  for (const f of [...supported, ...unsupported]) {
    byKey.set(f.key, f);
  }
  const facts = FACT_DEFS.map((d) => byKey.get(d.key)).filter(Boolean);

  const summary = {
    passed: 0,
    warning: 0,
    failed: 0,
    notChecked: 0,
    manuallyReviewed: 0,
    supported: 0,
    unsupported: 0,
  };
  for (const f of facts) {
    if (f.supported) summary.supported += 1;
    else summary.unsupported += 1;
    if (f.status === STATUSES.PASSED) summary.passed += 1;
    else if (f.status === STATUSES.WARNING) summary.warning += 1;
    else if (f.status === STATUSES.FAILED) summary.failed += 1;
    else if (f.status === STATUSES.MANUALLY_REVIEWED) summary.manuallyReviewed += 1;
    else summary.notChecked += 1;
  }

  return {
    facts,
    summary,
    checkedAt,
  };
}

module.exports = {
  STATUSES,
  FACT_DEFS,
  buildRegistrationVerificationFacts,
  computeApprovalEligible,
  computeProvisioningPrerequisites,
  resolvePhoneVerificationEvidence,
};
