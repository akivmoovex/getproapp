"use strict";

/**
 * Deterministic, read-only advisory recommendation from verification facts (Phase2 Batch 8).
 * Does not mutate facts, write audits, gate approval, or perform database lookups.
 */

const CODES = Object.freeze({
  RECOMMENDED_FOR_APPROVAL: "recommended_for_approval",
  MANUAL_REVIEW_REQUIRED: "manual_review_required",
  ADDITIONAL_INFORMATION_REQUIRED: "additional_information_required",
  HIGH_DUPLICATE_RISK: "high_duplicate_risk",
  NOT_ELIGIBLE: "not_eligible",
});

const LABELS = Object.freeze({
  [CODES.RECOMMENDED_FOR_APPROVAL]: "Recommended for approval",
  [CODES.MANUAL_REVIEW_REQUIRED]: "Manual review required",
  [CODES.ADDITIONAL_INFORMATION_REQUIRED]: "Additional information required",
  [CODES.HIGH_DUPLICATE_RISK]: "High duplicate risk",
  [CODES.NOT_ELIGIBLE]: "Not eligible",
});

const TONES = Object.freeze({
  [CODES.RECOMMENDED_FOR_APPROVAL]: "ok",
  [CODES.MANUAL_REVIEW_REQUIRED]: "warn",
  [CODES.ADDITIONAL_INFORMATION_REQUIRED]: "warn",
  [CODES.HIGH_DUPLICATE_RISK]: "danger",
  [CODES.NOT_ELIGIBLE]: "danger",
});

/** Supported facts that, when failed, mean the application is not eligible under current rules. */
const NOT_ELIGIBLE_FACT_KEYS = Object.freeze([
  "requested_plan_eligible",
  "required_fields_complete",
  "approval_eligible_current_rules",
]);

/**
 * Provisioning failure results that mean the applicant must supply/clarify data
 * (not Network admin validation or other ops gates).
 */
const APPLICANT_DATA_MISSING_RESULTS = Object.freeze([
  "administrator_email_required",
  "email_missing",
  "incomplete",
  "missing",
  "phone_missing",
  "identity_incomplete",
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
 * @param {unknown} verification
 * @returns {object[]}
 */
function normalizeFacts(verification) {
  if (!verification || typeof verification !== "object") return [];
  if (!Array.isArray(verification.facts)) return [];
  return verification.facts.filter((f) => f && typeof f === "object");
}

/**
 * @param {object} fact
 */
function indexFact(fact) {
  return {
    key: trimStr(fact.key),
    status: trimStr(fact.status).toLowerCase() || "not_checked",
    result: trimStr(fact.result).toLowerCase(),
    explanation: trimStr(fact.explanation),
    supported: fact.supported !== false,
    requiresManualReview: Boolean(fact.requiresManualReview),
  };
}

/**
 * @param {object} fact
 * @param {string} message
 */
function reasonFrom(fact, message) {
  return {
    factKey: fact.key,
    status: fact.status,
    message: String(message || "").slice(0, 400),
  };
}

/**
 * @param {object} input
 */
function buildResult(input) {
  return {
    code: input.code,
    label: LABELS[input.code] || input.code,
    tone: TONES[input.code] || "warn",
    explanation: input.explanation,
    reasons: input.reasons || [],
    blockingFacts: input.blockingFacts || [],
    warningFacts: input.warningFacts || [],
    calculatedAt: input.calculatedAt,
    advisory: true,
  };
}

/**
 * Build an advisory recommendation from verification facts.
 *
 * @param {{
 *   verification?: { facts?: object[], summary?: object, checkedAt?: string|null },
 *   now?: Date|string,
 * }} [input]
 */
function buildRegistrationReviewRecommendation(input = {}) {
  const calculatedAt =
    input.now != null ? new Date(input.now).toISOString() : new Date().toISOString();
  const rawFacts = normalizeFacts(input.verification);
  const facts = rawFacts.map(indexFact).filter((f) => f.key);

  if (!facts.length) {
    return buildResult({
      code: CODES.MANUAL_REVIEW_REQUIRED,
      calculatedAt,
      explanation:
        "Verification facts are unavailable or malformed. Manual review is required. This is an advisory recommendation and does not change the current BlessBoard approval gate.",
      reasons: [
        {
          factKey: "verification",
          status: "not_checked",
          message: "No usable verification facts were provided.",
        },
      ],
      blockingFacts: [],
      warningFacts: [],
    });
  }

  const byKey = new Map(facts.map((f) => [f.key, f]));
  const supported = facts.filter((f) => f.supported);
  const unsupported = facts.filter((f) => !f.supported);
  const supportedWarning = supported.filter((f) => f.status === "warning");
  const supportedFailed = supported.filter((f) => f.status === "failed");
  const warningFactKeys = supportedWarning.map((f) => f.key);

  // —— 1. not_eligible ——
  const eligibilityBlockers = [];
  for (const key of NOT_ELIGIBLE_FACT_KEYS) {
    const fact = byKey.get(key);
    if (fact && fact.supported && fact.status === "failed") {
      eligibilityBlockers.push(fact);
    }
  }
  if (eligibilityBlockers.length) {
    return buildResult({
      code: CODES.NOT_ELIGIBLE,
      calculatedAt,
      explanation:
        "Supported eligibility facts show this application is not eligible under current BlessBoard rules. Unsupported checks are not treated as ineligibility. This is an advisory recommendation and does not change the current approval gate.",
      reasons: eligibilityBlockers.map((f) =>
        reasonFrom(f, `${f.key} failed (${f.result || f.status}).`)
      ),
      blockingFacts: eligibilityBlockers.map((f) => f.key),
      warningFacts: warningFactKeys,
    });
  }

  // —— 2. high_duplicate_risk ——
  const phone = byKey.get("phone_unique_registration_scope");
  const riskDecision = byKey.get("risk_decision_present");
  const duplicateEvidence = byKey.get("duplicate_review_evidence");
  const strongIdentifier = byKey.get("strong_duplicate_identifier");
  const organizationLinked = byKey.get("organization_linked");

  const strongReasons = [];
  const strongBlocking = [];

  if (phone && phone.supported && phone.status === "failed") {
    strongReasons.push(
      reasonFrom(
        phone,
        "Normalized phone conflicts with another registration-scope application."
      )
    );
    strongBlocking.push(phone.key);
  }

  if (
    strongIdentifier &&
    strongIdentifier.supported &&
    (strongIdentifier.status === "failed" || strongIdentifier.status === "warning") &&
    strongIdentifier.result !== "duplicate_matches_unavailable" &&
    strongIdentifier.result !== "no_duplicate_matches_payload"
  ) {
    strongReasons.push(
      reasonFrom(
        strongIdentifier,
        "Canonical duplicate matches include a strong exact identifier (not name alone)."
      )
    );
    strongBlocking.push(strongIdentifier.key);
  }

  if (
    riskDecision &&
    riskDecision.supported &&
    (riskDecision.result === "reject" ||
      riskDecision.result === "allow_with_high_risk_duplicate_decision" ||
      riskDecision.result === "high_risk_duplicate_decision_without_risk_snapshot")
  ) {
    strongReasons.push(
      reasonFrom(
        riskDecision,
        riskDecision.result === "reject"
          ? "Stored risk decision indicates reject."
          : "Risk snapshot conflicts with high-risk duplicate-match review decisions."
      )
    );
    strongBlocking.push(riskDecision.key);
  }

  if (
    duplicateEvidence &&
    duplicateEvidence.supported &&
    (duplicateEvidence.result === "confirmed_duplicate" ||
      duplicateEvidence.result === "impersonation_concern" ||
      (duplicateEvidence.status === "warning" &&
        duplicateEvidence.result === "held_for_duplicate_review") ||
      (duplicateEvidence.status === "failed" &&
        (duplicateEvidence.result === "confirmed_duplicate" ||
          duplicateEvidence.result === "impersonation_concern")))
  ) {
    strongReasons.push(
      reasonFrom(
        duplicateEvidence,
        duplicateEvidence.result === "confirmed_duplicate" ||
          duplicateEvidence.result === "impersonation_concern"
          ? "Canonical duplicate review recorded confirmed_duplicate or impersonation_concern."
          : "Application is held for duplicate review with explicit duplicate-review evidence."
      )
    );
    strongBlocking.push(duplicateEvidence.key);
  }

  if (
    organizationLinked &&
    organizationLinked.supported &&
    organizationLinked.status === "passed" &&
    duplicateEvidence &&
    duplicateEvidence.supported &&
    duplicateEvidence.status === "warning" &&
    (duplicateEvidence.result === "held_for_duplicate_review" ||
      duplicateEvidence.result === "risk_duplicate_signals" ||
      duplicateEvidence.result === "matches_awaiting_review")
  ) {
    if (!strongBlocking.includes(organizationLinked.key)) {
      strongReasons.push(
        reasonFrom(
          organizationLinked,
          "Organization is already linked while duplicate-review evidence remains active."
        )
      );
      strongBlocking.push(organizationLinked.key);
    }
  }

  if (strongBlocking.length) {
    return buildResult({
      code: CODES.HIGH_DUPLICATE_RISK,
      calculatedAt,
      explanation:
        "Supported evidence shows a strong duplicate concern. Similar church name alone is not treated as high duplicate risk, and no duplicate score is invented. This is an advisory recommendation and does not change the current approval gate.",
      reasons: strongReasons,
      blockingFacts: [...new Set(strongBlocking)],
      warningFacts: warningFactKeys,
    });
  }

  // —— 3. additional_information_required ——
  const infoReasons = [];
  const infoBlocking = [];
  const provisioning = byKey.get("provisioning_prerequisites_current_rules");
  const followUp = byKey.get("support_or_follow_up_required");
  const authority = byKey.get("authority_terms_accepted");

  if (
    provisioning &&
    provisioning.supported &&
    provisioning.status === "failed" &&
    APPLICANT_DATA_MISSING_RESULTS.includes(provisioning.result)
  ) {
    infoReasons.push(
      reasonFrom(
        provisioning,
        "Provisioning prerequisites failed because required applicant data is missing."
      )
    );
    infoBlocking.push(provisioning.key);
  }

  if (
    followUp &&
    followUp.supported &&
    followUp.status === "warning" &&
    followUp.result === "applicant_action_required"
  ) {
    infoReasons.push(
      reasonFrom(followUp, "Follow-up state explicitly requires applicant action.")
    );
    infoBlocking.push(followUp.key);
  }

  if (authority && authority.supported && authority.status === "failed") {
    infoReasons.push(
      reasonFrom(authority, "Terms acceptance is missing; applicant clarification is required.")
    );
    infoBlocking.push(authority.key);
  }

  if (infoBlocking.length) {
    return buildResult({
      code: CODES.ADDITIONAL_INFORMATION_REQUIRED,
      calculatedAt,
      explanation:
        "Supported facts indicate the applicant must provide or clarify information. Unsupported document or email-verification checks are not treated as automatic applicant failures. This is an advisory recommendation and does not change the current approval gate.",
      reasons: infoReasons,
      blockingFacts: [...new Set(infoBlocking)],
      warningFacts: warningFactKeys,
    });
  }

  // —— 4. manual_review_required ——
  const manualReasons = [];
  const manualKeys = [];

  function addManual(fact, message) {
    if (!fact || manualKeys.includes(fact.key)) return;
    manualReasons.push(reasonFrom(fact, message));
    manualKeys.push(fact.key);
  }

  for (const fact of supportedWarning) {
    // church_name_exact_match warning alone → manual (never high_duplicate_risk).
    addManual(fact, `Supported fact has warning status (${fact.result || "warning"}).`);
  }

  for (const fact of supportedFailed) {
    if (!NOT_ELIGIBLE_FACT_KEYS.includes(fact.key)) {
      addManual(fact, `Supported fact failed (${fact.result || "failed"}).`);
    }
  }

  const phoneContact = byKey.get("applicant_contacted_by_phone");
  if (
    phoneContact &&
    phoneContact.supported &&
    (phoneContact.status === "manually_reviewed" ||
      (phoneContact.status === "passed" &&
        phoneContact.result === "phone_contact_logged"))
  ) {
    addManual(
      phoneContact,
      "A phone contact was logged; this does not confirm applicant identity."
    );
  }

  const orgKey = byKey.get("organization_key_available");
  if (orgKey && orgKey.supported && orgKey.status === "not_checked") {
    addManual(
      orgKey,
      "Organization key availability is not fully confirmed on this application."
    );
  }

  const emailUnique = byKey.get("email_unique_platform_users_only");
  if (emailUnique && emailUnique.supported && emailUnique.status === "not_checked") {
    addManual(
      emailUnique,
      "Email uniqueness was not confirmed with a live platform-user lookup (platform users only when checked)."
    );
  } else if (emailUnique && emailUnique.supported && emailUnique.status === "passed") {
    // Limited scope is noted on recommended path; passed does not alone force manual.
  }

  if (
    duplicateEvidence &&
    duplicateEvidence.supported &&
    duplicateEvidence.status === "not_checked"
  ) {
    addManual(duplicateEvidence, "Duplicate review evidence is incomplete.");
  }

  // Unsupported checks normally require manual review — never not_eligible / failed.
  // Exception: when all critical supported facts pass and no other manual signal exists,
  // recommended_for_approval lists unsupported facts as limitations (see step 5).
  const criticalPresentAndPassed = NOT_ELIGIBLE_FACT_KEYS.every((key) => {
    const fact = byKey.get(key);
    return fact && fact.supported && fact.status === "passed";
  });
  const otherManualSignals = manualKeys.length > 0;
  if (unsupported.length && (!criticalPresentAndPassed || otherManualSignals)) {
    for (const fact of unsupported) {
      addManual(
        fact,
        "Important check is unsupported in the current backend and requires manual review (not automatic failure)."
      );
    }
  }

  // Authority is terms-only while identity remains unsupported: force manual when
  // other review signals already exist; otherwise list as a recommended limitation.
  const identity = byKey.get("applicant_identity_confirmed");
  if (
    otherManualSignals &&
    authority &&
    authority.supported &&
    authority.status === "passed" &&
    identity &&
    !identity.supported
  ) {
    addManual(
      authority,
      "Authority evidence is limited to accepted terms; applicant identity is not confirmed."
    );
  }

  for (const fact of supported) {
    if (
      fact.requiresManualReview &&
      (fact.status === "warning" || fact.status === "failed") &&
      !manualKeys.includes(fact.key)
    ) {
      addManual(fact, "Fact requires manual review.");
    }
  }

  if (manualKeys.length) {
    return buildResult({
      code: CODES.MANUAL_REVIEW_REQUIRED,
      calculatedAt,
      explanation:
        "Supported verification signals require manual review. Unsupported checks do not automatically fail the application. This is an advisory recommendation and does not change the current approval gate.",
      reasons: manualReasons,
      blockingFacts: [],
      warningFacts: warningFactKeys,
    });
  }

  // —— 5. recommended_for_approval ——
  const noSupportedFailed = supportedFailed.length === 0;
  const phoneOk =
    !phone ||
    !phone.supported ||
    phone.status === "passed" ||
    phone.status === "not_checked";

  if (
    criticalPresentAndPassed &&
    noSupportedFailed &&
    phoneOk &&
    supportedWarning.length === 0
  ) {
    const limitationKeys = unsupported.map((f) => f.key);
    const limitationParts = [];
    if (limitationKeys.length > 0) {
      limitationParts.push(
        `Remaining unsupported checks are limitations only: ${limitationKeys.join(", ")}.`
      );
    }
    if (emailUnique && emailUnique.supported && emailUnique.status === "passed") {
      limitationParts.push(
        "Email uniqueness covers platform users only and does not confirm ownership."
      );
    }
    if (authority && authority.supported && authority.status === "passed") {
      limitationParts.push(
        "Authority evidence is limited to recorded terms acceptance."
      );
    }
    const limitationText =
      limitationParts.length > 0 ? ` ${limitationParts.join(" ")}` : "";
    return buildResult({
      code: CODES.RECOMMENDED_FOR_APPROVAL,
      calculatedAt,
      explanation:
        `Supported critical verification facts pass and no high duplicate-risk or missing-information condition was found.${limitationText} This is an advisory recommendation and does not change the current BlessBoard approval gate.`,
      reasons: NOT_ELIGIBLE_FACT_KEYS.map((key) => {
        const fact = byKey.get(key);
        return reasonFrom(fact, `${key} passed.`);
      }),
      blockingFacts: [],
      warningFacts: [],
    });
  }

  return buildResult({
    code: CODES.MANUAL_REVIEW_REQUIRED,
    calculatedAt,
    explanation:
      "Verification facts do not meet the bar for an advisory approval recommendation. Manual review is required. This is an advisory recommendation and does not change the current approval gate.",
    reasons: [
      {
        factKey: "verification",
        status: "not_checked",
        message: "Defaulted to manual review after applying deterministic rules.",
      },
    ],
    blockingFacts: [],
    warningFacts: warningFactKeys,
  });
}

module.exports = {
  CODES,
  LABELS,
  TONES,
  buildRegistrationReviewRecommendation,
};
