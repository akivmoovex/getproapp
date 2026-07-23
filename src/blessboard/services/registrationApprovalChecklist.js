"use strict";

/**
 * Deterministic, read-only Phase2 approval checklist from verification facts (Batch 9).
 * Does not mutate input, persist checklist state, write audits, or gate approval.
 */

const STATUSES = Object.freeze({
  COMPLETE: "complete",
  INCOMPLETE: "incomplete",
  WARNING: "warning",
  NOT_AVAILABLE: "not_available",
  MANUAL_REVIEW_REQUIRED: "manual_review_required",
});

const ITEM_DEFS = Object.freeze([
  {
    key: "applicant_email_verified",
    label: "Applicant email verified",
    required: true,
    actionTarget: "#reg-verification",
    sourceFactKeys: ["applicant_email_verified"],
  },
  {
    key: "phone_uniqueness_reviewed",
    label: "Phone uniqueness reviewed",
    required: true,
    actionTarget: "#reg-verification",
    sourceFactKeys: ["phone_unique_registration_scope"],
  },
  {
    key: "email_uniqueness_reviewed",
    label: "Email uniqueness reviewed",
    required: true,
    actionTarget: "#reg-verification",
    sourceFactKeys: ["email_unique_platform_users_only"],
  },
  {
    key: "duplicate_results_reviewed",
    label: "Duplicate results reviewed",
    required: true,
    actionTarget: "#reg-verification",
    sourceFactKeys: ["duplicate_review_evidence", "church_name_exact_match"],
  },
  {
    key: "applicant_called",
    label: "Applicant called",
    required: true,
    // `#reg-contact` is not present on the detail page today.
    actionTarget: null,
    sourceFactKeys: ["applicant_contacted_by_phone"],
  },
  {
    key: "applicant_identity_confirmed",
    label: "Applicant identity confirmed",
    required: true,
    actionTarget: "#reg-verification",
    sourceFactKeys: ["applicant_identity_confirmed", "applicant_contacted_by_phone"],
  },
  {
    key: "applicant_authority_confirmed",
    label: "Applicant authority confirmed",
    required: true,
    actionTarget: "#reg-administration",
    sourceFactKeys: ["applicant_authority_confirmed", "authority_terms_accepted", "applicant_identity_confirmed"],
  },
  {
    key: "required_fields_complete",
    label: "Required registration fields complete",
    required: true,
    actionTarget: "#reg-verification",
    sourceFactKeys: ["required_fields_complete"],
  },
  {
    key: "website_or_organization_key_confirmed",
    label: "Website or organization key confirmed",
    required: true,
    actionTarget: "#reg-website",
    sourceFactKeys: ["organization_key_available", "distinct_website_key_available"],
  },
  {
    key: "final_reviewer_note_entered",
    label: "Final reviewer note entered",
    required: true,
    // `#reg-review-activity` is not present; do not invent a fake anchor.
    actionTarget: null,
    sourceFactKeys: ["final_reviewer_note_present"],
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
 * @param {unknown} verification
 * @returns {Map<string, object>}
 */
function indexFacts(verification) {
  const map = new Map();
  if (!verification || typeof verification !== "object") return map;
  if (!Array.isArray(verification.facts)) return map;
  for (const raw of verification.facts) {
    if (!raw || typeof raw !== "object") continue;
    const key = trimStr(raw.key);
    if (!key) continue;
    map.set(key, {
      key,
      status: trimStr(raw.status).toLowerCase() || "not_checked",
      result: trimStr(raw.result).toLowerCase(),
      explanation: trimStr(raw.explanation),
      supported: raw.supported !== false,
      requiresManualReview: Boolean(raw.requiresManualReview),
    });
  }
  return map;
}

/**
 * @param {object} def
 * @param {object} partial
 */
function item(def, partial) {
  return {
    key: def.key,
    label: def.label,
    status: partial.status,
    explanation: String(partial.explanation || "").slice(0, 600),
    sourceFactKeys: [...(partial.sourceFactKeys || def.sourceFactKeys)],
    supported: partial.supported !== false,
    required: Boolean(def.required),
    actionTarget: def.actionTarget == null ? null : String(def.actionTarget),
  };
}

/**
 * @param {Map<string, object>} facts
 * @param {string} key
 */
function getFact(facts, key) {
  return facts.get(key) || null;
}

/**
 * @param {Map<string, object>} facts
 * @param {object|null|undefined} reviewRecommendation
 */
function deriveItems(facts, reviewRecommendation) {
  const recCode =
    reviewRecommendation && typeof reviewRecommendation === "object"
      ? trimStr(reviewRecommendation.code).toLowerCase()
      : "";

  // 1. applicant_email_verified
  const emailVerified = getFact(facts, "applicant_email_verified");
  const emailVerifiedItem = (() => {
    if (!emailVerified || emailVerified.supported === false) {
      return item(ITEM_DEFS[0], {
        status: STATUSES.NOT_AVAILABLE,
        supported: false,
        explanation:
          "Applicant email ownership is not stored by BlessBoard registration today. Email uniqueness or delivery is not treated as verification.",
        sourceFactKeys: ["applicant_email_verified"],
      });
    }
    if (emailVerified.status === "passed") {
      return item(ITEM_DEFS[0], {
        status: STATUSES.COMPLETE,
        supported: true,
        explanation: "Canonical evidence confirms applicant email ownership.",
      });
    }
    return item(ITEM_DEFS[0], {
      status: STATUSES.INCOMPLETE,
      supported: true,
      explanation: "Applicant email ownership has not been confirmed.",
    });
  })();

  // 2. phone_uniqueness_reviewed
  const phone = getFact(facts, "phone_unique_registration_scope");
  const phoneItem = (() => {
    if (!phone || phone.supported === false) {
      return item(ITEM_DEFS[1], {
        status: STATUSES.NOT_AVAILABLE,
        supported: false,
        explanation: "Phone uniqueness evidence is not available.",
      });
    }
    if (phone.status === "failed") {
      return item(ITEM_DEFS[1], {
        status: STATUSES.INCOMPLETE,
        explanation:
          "A duplicate phone was found in the registration-application uniqueness scope. Phone uniqueness is not complete.",
      });
    }
    if (phone.status === "passed") {
      return item(ITEM_DEFS[1], {
        status: STATUSES.COMPLETE,
        explanation:
          "Registration-scope phone uniqueness passed. This check covers registration applications only, not platform users or organization contacts.",
      });
    }
    if (phone.status === "warning") {
      return item(ITEM_DEFS[1], {
        status: STATUSES.WARNING,
        explanation:
          "Phone uniqueness has a limited or uncertain scope and requires review.",
      });
    }
    return item(ITEM_DEFS[1], {
      status: STATUSES.WARNING,
      explanation:
        "Phone uniqueness was not confirmed with a live registration-scope lookup. Scope remains limited until re-checked.",
    });
  })();

  // 3. email_uniqueness_reviewed
  const emailUnique = getFact(facts, "email_unique_platform_users_only");
  const emailUniqueItem = (() => {
    if (!emailUnique || emailUnique.supported === false) {
      return item(ITEM_DEFS[2], {
        status: STATUSES.NOT_AVAILABLE,
        supported: false,
        explanation: "Email uniqueness evidence is not available.",
      });
    }
    if (emailUnique.status === "passed") {
      return item(ITEM_DEFS[2], {
        status: STATUSES.WARNING,
        explanation:
          "Email uniqueness was checked against platform users only. This partial scope is not treated as fully complete and does not confirm email ownership.",
      });
    }
    if (emailUnique.status === "warning") {
      return item(ITEM_DEFS[2], {
        status: STATUSES.WARNING,
        explanation:
          "Email uniqueness warning applies to platform users only. Pending applications and organization contacts are not fully covered.",
      });
    }
    if (emailUnique.result === "email_missing") {
      return item(ITEM_DEFS[2], {
        status: STATUSES.INCOMPLETE,
        explanation: "Applicant email is missing, so uniqueness cannot be reviewed.",
      });
    }
    return item(ITEM_DEFS[2], {
      status: STATUSES.INCOMPLETE,
      explanation:
        "Email uniqueness was not confirmed with a live platform-user lookup. Do not treat absence of a signal as full uniqueness.",
    });
  })();

  // 4. duplicate_results_reviewed
  const duplicate = getFact(facts, "duplicate_review_evidence");
  const churchName = getFact(facts, "church_name_exact_match");
  const duplicateItem = (() => {
    const sourceFactKeys = ["duplicate_review_evidence"];
    if (churchName) sourceFactKeys.push("church_name_exact_match");

    if (!duplicate || duplicate.supported === false) {
      return item(ITEM_DEFS[3], {
        status: STATUSES.INCOMPLETE,
        supported: !duplicate || duplicate.supported !== false,
        explanation:
          "Duplicate review evidence is missing. A similar church name check alone is insufficient.",
        sourceFactKeys,
      });
    }
    if (
      duplicate.status === "manually_reviewed" ||
      duplicate.result === "admin_action_recorded"
    ) {
      let explanation =
        "Canonical duplicate-review evidence exists (administrator review action recorded).";
      if (recCode === "high_duplicate_risk") {
        explanation +=
          " Advisory recommendation context indicates elevated duplicate risk; confirm the recorded review still applies.";
      }
      return item(ITEM_DEFS[3], {
        status: STATUSES.COMPLETE,
        explanation,
        sourceFactKeys,
      });
    }
    if (duplicate.status === "warning") {
      return item(ITEM_DEFS[3], {
        status: STATUSES.MANUAL_REVIEW_REQUIRED,
        explanation:
          "Duplicate signals or a duplicate-review hold are present. Canonical review completion is not recorded. A similar name match alone is not sufficient review.",
        sourceFactKeys,
      });
    }
    // not_checked / none
    if (churchName && churchName.status === "warning") {
      return item(ITEM_DEFS[3], {
        status: STATUSES.MANUAL_REVIEW_REQUIRED,
        explanation:
          "An exact church-name match exists, but structured duplicate-review evidence is incomplete. Similar name alone does not complete this item.",
        sourceFactKeys,
      });
    }
    return item(ITEM_DEFS[3], {
      status: STATUSES.INCOMPLETE,
      explanation:
        "No canonical duplicate-review evidence is recorded yet. Similar church name alone is insufficient.",
      sourceFactKeys,
    });
  })();

  // 5. applicant_called
  const phoneContact = getFact(facts, "applicant_contacted_by_phone");
  const calledItem = (() => {
    if (!phoneContact || phoneContact.supported === false) {
      return item(ITEM_DEFS[4], {
        status: STATUSES.NOT_AVAILABLE,
        supported: false,
        explanation: "Phone contact evidence is not available.",
      });
    }
    if (
      phoneContact.status === "passed" ||
      phoneContact.status === "manually_reviewed" ||
      phoneContact.result === "structured_applicant_contacted" ||
      phoneContact.result === "phone_contact_logged"
    ) {
      return item(ITEM_DEFS[4], {
        status: STATUSES.COMPLETE,
        explanation:
          phoneContact.result === "structured_applicant_contacted" ||
          phoneContact.source === "phone_verification_attempts"
            ? "Structured phone-verification evidence shows an answered call was recorded. A planned follow-up alone is not a completed call."
            : "Canonical support-contact evidence shows a phone interaction was logged. A planned follow-up alone is not a completed call.",
      });
    }
    if (phoneContact.status === "warning") {
      return item(ITEM_DEFS[4], {
        status: STATUSES.MANUAL_REVIEW_REQUIRED,
        explanation:
          "Structured phone-verification history is unavailable. Generic support-contact notes are not treated as completed call evidence.",
      });
    }
    return item(ITEM_DEFS[4], {
      status: STATUSES.INCOMPLETE,
      explanation:
        "No structured answered phone-verification call is recorded. A planned follow-up is not a completed call.",
    });
  })();

  // 6. applicant_identity_confirmed
  const identity = getFact(facts, "applicant_identity_confirmed");
  const identityItem = (() => {
    const sourceFactKeys = ["applicant_identity_confirmed"];
    if (phoneContact) sourceFactKeys.push("applicant_contacted_by_phone");
    if (!identity || identity.supported === false) {
      return item(ITEM_DEFS[5], {
        status: STATUSES.NOT_AVAILABLE,
        supported: false,
        explanation:
          "Applicant identity confirmation is not stored. A phone contact log alone is insufficient to confirm identity.",
        sourceFactKeys,
      });
    }
    if (identity.status === "passed" || identity.status === "manually_reviewed") {
      return item(ITEM_DEFS[5], {
        status: STATUSES.COMPLETE,
        explanation: "Canonical evidence confirms applicant identity.",
        sourceFactKeys,
      });
    }
    if (identity.status === "failed") {
      return item(ITEM_DEFS[5], {
        status: STATUSES.INCOMPLETE,
        explanation: "Structured phone-verification evidence records that applicant identity was not confirmed.",
        sourceFactKeys,
      });
    }
    if (identity.status === "warning") {
      return item(ITEM_DEFS[5], {
        status: STATUSES.MANUAL_REVIEW_REQUIRED,
        explanation:
          "Structured phone-verification history is unavailable, so identity confirmation cannot be evaluated from call evidence.",
        sourceFactKeys,
      });
    }
    return item(ITEM_DEFS[5], {
      status: STATUSES.INCOMPLETE,
      explanation: "Applicant identity has not been confirmed.",
      sourceFactKeys,
    });
  })();

  // 7. applicant_authority_confirmed
  const authorityFact = getFact(facts, "applicant_authority_confirmed");
  const authority = getFact(facts, "authority_terms_accepted");
  const authorityItem = (() => {
    const sourceFactKeys = ["authority_terms_accepted"];
    if (authorityFact) sourceFactKeys.unshift("applicant_authority_confirmed");
    if (identity) sourceFactKeys.push("applicant_identity_confirmed");

    if (authorityFact && authorityFact.supported !== false) {
      if (authorityFact.status === "passed" || authorityFact.status === "manually_reviewed") {
        return item(ITEM_DEFS[6], {
          status: STATUSES.COMPLETE,
          explanation:
            "Structured phone-verification evidence explicitly confirms applicant authority. Terms acceptance remains separate supporting context.",
          sourceFactKeys,
        });
      }
      if (authorityFact.status === "failed") {
        return item(ITEM_DEFS[6], {
          status: STATUSES.INCOMPLETE,
          explanation:
            "Structured phone-verification evidence records that applicant authority was not confirmed.",
          sourceFactKeys,
        });
      }
      if (authorityFact.status === "warning") {
        return item(ITEM_DEFS[6], {
          status: STATUSES.MANUAL_REVIEW_REQUIRED,
          explanation:
            "Structured phone-verification history is unavailable. Terms acceptance alone does not confirm authority.",
          sourceFactKeys,
        });
      }
    }

    if (!authority) {
      return item(ITEM_DEFS[6], {
        status: STATUSES.INCOMPLETE,
        explanation: "No authority or terms-acceptance evidence is available.",
        sourceFactKeys,
      });
    }
    if (authority.status === "failed" || authority.result === "terms_not_accepted") {
      return item(ITEM_DEFS[6], {
        status: STATUSES.INCOMPLETE,
        explanation: "Terms acceptance is missing. Authority cannot be confirmed.",
        sourceFactKeys,
      });
    }
    // Terms alone — never complete without independent authority evidence.
    return item(ITEM_DEFS[6], {
      status: STATUSES.MANUAL_REVIEW_REQUIRED,
      explanation:
        "Terms acceptance is recorded, but that alone does not confirm authority to administer the church. Independent authority evidence is not available.",
      sourceFactKeys,
    });
  })();

  // 8. required_fields_complete
  const requiredFields = getFact(facts, "required_fields_complete");
  const requiredFieldsItem = (() => {
    if (!requiredFields || requiredFields.supported === false) {
      return item(ITEM_DEFS[7], {
        status: STATUSES.NOT_AVAILABLE,
        supported: false,
        explanation: "Required-fields completeness evidence is not available.",
      });
    }
    if (requiredFields.status === "passed") {
      return item(ITEM_DEFS[7], {
        status: STATUSES.COMPLETE,
        explanation: "All fields required at public registration submission are present.",
      });
    }
    return item(ITEM_DEFS[7], {
      status: STATUSES.INCOMPLETE,
      explanation:
        requiredFields.explanation ||
        "Required registration fields are incomplete.",
    });
  })();

  // 9. website_or_organization_key_confirmed
  const orgKey = getFact(facts, "organization_key_available");
  const websiteKey = getFact(facts, "distinct_website_key_available");
  const orgKeyItem = (() => {
    const sourceFactKeys = ["organization_key_available"];
    if (websiteKey) sourceFactKeys.push("distinct_website_key_available");
    if (!orgKey) {
      return item(ITEM_DEFS[8], {
        status: STATUSES.WARNING,
        explanation:
          "Organization key availability is unknown. A separate website key is not stored on registration applications.",
        sourceFactKeys,
      });
    }
    if (orgKey.status === "passed") {
      return item(ITEM_DEFS[8], {
        status: STATUSES.COMPLETE,
        explanation:
          "Organization key is present on the application. A distinct website key is not used; organization key is the canonical identifier.",
        sourceFactKeys,
      });
    }
    if (orgKey.status === "failed") {
      return item(ITEM_DEFS[8], {
        status: STATUSES.INCOMPLETE,
        explanation:
          orgKey.explanation ||
          "Organization key is reserved or unavailable. A separate website-key result is not invented.",
        sourceFactKeys,
      });
    }
    return item(ITEM_DEFS[8], {
      status: STATUSES.WARNING,
      explanation:
        "Organization key is not stored on this application. Availability is checked later at approve/provision time. A separate website key is not stored.",
      sourceFactKeys,
    });
  })();

  // 10. final_reviewer_note_entered
  const note = getFact(facts, "final_reviewer_note_present");
  const noteItem = (() => {
    if (!note || note.supported === false) {
      return item(ITEM_DEFS[9], {
        status: STATUSES.NOT_AVAILABLE,
        supported: false,
        explanation: "Reviewer-note evidence is not available.",
      });
    }
    if (
      note.status === "manually_reviewed" &&
      note.result === "review_notes_present"
    ) {
      return item(ITEM_DEFS[9], {
        status: STATUSES.COMPLETE,
        explanation: "A canonical final reviewer note is present on the application.",
      });
    }
    if (note.result === "contact_note_present") {
      return item(ITEM_DEFS[9], {
        status: STATUSES.INCOMPLETE,
        explanation:
          "A general support-contact note exists, but that is not treated as a final reviewer note unless recorded as review notes.",
      });
    }
    return item(ITEM_DEFS[9], {
      status: STATUSES.INCOMPLETE,
      explanation: "No final reviewer note is present on the application.",
    });
  })();

  return [
    emailVerifiedItem,
    phoneItem,
    emailUniqueItem,
    duplicateItem,
    calledItem,
    identityItem,
    authorityItem,
    requiredFieldsItem,
    orgKeyItem,
    noteItem,
  ];
}

/**
 * @param {object[]} items
 */
function summarize(items) {
  const summary = {
    total: items.length,
    complete: 0,
    incomplete: 0,
    warning: 0,
    notAvailable: 0,
    manualReviewRequired: 0,
    requiredComplete: 0,
    requiredOutstanding: 0,
  };
  for (const it of items) {
    if (it.status === STATUSES.COMPLETE) summary.complete += 1;
    else if (it.status === STATUSES.INCOMPLETE) summary.incomplete += 1;
    else if (it.status === STATUSES.WARNING) summary.warning += 1;
    else if (it.status === STATUSES.NOT_AVAILABLE) summary.notAvailable += 1;
    else if (it.status === STATUSES.MANUAL_REVIEW_REQUIRED) {
      summary.manualReviewRequired += 1;
    }

    if (it.required) {
      if (it.status === STATUSES.COMPLETE) summary.requiredComplete += 1;
      else summary.requiredOutstanding += 1;
    }
  }
  return summary;
}

/**
 * Build an advisory Phase2 approval checklist from verification facts.
 *
 * @param {{
 *   verification?: { facts?: object[], summary?: object, checkedAt?: string|null },
 *   reviewRecommendation?: object|null,
 *   now?: Date|string,
 * }} [input]
 */
function buildRegistrationApprovalChecklist(input = {}) {
  const calculatedAt =
    input.now != null ? new Date(input.now).toISOString() : new Date().toISOString();

  let facts;
  try {
    facts = indexFacts(input.verification);
  } catch {
    facts = new Map();
  }

  let items;
  try {
    items = deriveItems(facts, input.reviewRecommendation);
  } catch {
    items = ITEM_DEFS.map((def) =>
      item(def, {
        status: STATUSES.NOT_AVAILABLE,
        supported: false,
        explanation:
          "Checklist item could not be derived from the provided verification facts.",
      })
    );
  }

  // Ensure every defined item is always present (stable order).
  if (!Array.isArray(items) || items.length !== ITEM_DEFS.length) {
    items = ITEM_DEFS.map((def) => {
      const found = Array.isArray(items)
        ? items.find((i) => i && i.key === def.key)
        : null;
      if (found) return found;
      return item(def, {
        status: STATUSES.NOT_AVAILABLE,
        supported: false,
        explanation:
          "Checklist item could not be derived from the provided verification facts.",
      });
    });
  }

  return {
    items,
    summary: summarize(items),
    calculatedAt,
    advisory: true,
  };
}

module.exports = {
  STATUSES,
  ITEM_DEFS,
  buildRegistrationApprovalChecklist,
};
