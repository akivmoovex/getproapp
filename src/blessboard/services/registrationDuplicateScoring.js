"use strict";

/**
 * Deterministic, explainable duplicate risk scoring for Phase2 registration matches.
 * Pure function of subject + candidate fields (+ optional manual evidence).
 * Does not query the database, merge records, reject applications, or change approval gates.
 */

const {
  normalizeChurchNameForDuplicate,
  normalizePlaceForDuplicate,
  normalizeChurchNameCityCountryForDuplicate,
  normalizePhoneForDuplicate,
  normalizeEmailForDuplicate,
  normalizeWebsiteDomainForDuplicate,
  normalizeRegistrationNumberForDuplicate,
} = require("./registrationDuplicateNormalization");

const RISK_LEVELS = Object.freeze({
  NONE: "none",
  POSSIBLE: "possible",
  STRONG: "strong",
  CONFIRMED: "confirmed",
});

/** Internal weights — explainable bands, not ML confidence. */
const SIGNAL_WEIGHTS = Object.freeze({
  exact_registration_number: 80,
  verified_phone_overlap: 75,
  church_owned_email: 75,
  exact_phone_overlap: 55,
  exact_website_domain: 40,
  exact_name_city_country: 20,
  platform_user_email: 18,
  same_contact_email: 18,
  exact_church_name: 12,
  same_city_country: 8,
  same_city_only: 4,
});

const POSSIBLE_MIN = 8;
const STRONG_MIN = 40;

const MANUAL_CONFIRMED_ACTIONS = Object.freeze([
  "link_organization",
  "duplicate_marked_same",
  "same_organization",
  "confirm_duplicate",
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
 * @param {unknown} party
 */
function pickParty(party) {
  const p = party && typeof party === "object" ? party : {};
  return {
    id: p.id != null ? String(p.id) : null,
    type: trimStr(p.type || p.targetType || "application").toLowerCase() || "application",
    churchName: p.churchName != null ? p.churchName : p.church_name,
    displayName: p.displayName != null ? p.displayName : p.display_name,
    city: p.city,
    country: p.country != null ? p.country : p.countryCode != null ? p.countryCode : p.country_code,
    contactEmail: p.contactEmail != null ? p.contactEmail : p.contact_email,
    contactPhone:
      p.contactPhone != null
        ? p.contactPhone
        : p.contact_phone != null
          ? p.contact_phone
          : p.phone,
    contactPhoneNormalized:
      p.contactPhoneNormalized != null
        ? p.contactPhoneNormalized
        : p.contact_phone_normalized != null
          ? p.contact_phone_normalized
          : null,
    registrationNumber:
      p.registrationNumber != null
        ? p.registrationNumber
        : p.registration_number != null
          ? p.registration_number
          : null,
    website: p.website != null ? p.website : p.hostname != null ? p.hostname : p.domain,
    phoneVerified: p.phoneVerified === true || p.phone_verified === true,
    emailOwnershipVerified:
      p.emailOwnershipVerified === true || p.email_ownership_verified === true,
    churchOwnedEmails: Array.isArray(p.churchOwnedEmails)
      ? p.churchOwnedEmails
      : Array.isArray(p.church_owned_emails)
        ? p.church_owned_emails
        : [],
    primaryEmail: p.primaryEmail != null ? p.primaryEmail : p.primary_email,
    isPlatformUser: p.isPlatformUser === true || p.type === "user" || p.targetType === "user",
  };
}

/**
 * @param {ReturnType<typeof pickParty>} party
 */
function resolvePhoneNormalized(party) {
  const existing = trimStr(party.contactPhoneNormalized);
  if (existing) {
    const viaHelper = normalizePhoneForDuplicate(existing, party.country);
    if (viaHelper && viaHelper.normalized) return viaHelper.normalized;
    if (/^\+[1-9]\d{6,14}$/.test(existing)) return existing;
  }
  const fromDisplay = normalizePhoneForDuplicate(party.contactPhone, party.country);
  return fromDisplay && fromDisplay.normalized ? fromDisplay.normalized : null;
}

/**
 * @param {ReturnType<typeof pickParty>} party
 */
function resolveEmailNormalized(party) {
  const out = normalizeEmailForDuplicate(party.contactEmail);
  return out && out.normalized ? out.normalized : null;
}

/**
 * @param {ReturnType<typeof pickParty>} party
 * @returns {Set<string>}
 */
function churchOwnedEmailSet(party) {
  const set = new Set();
  for (const raw of party.churchOwnedEmails) {
    const n = normalizeEmailForDuplicate(raw);
    if (n && n.normalized) set.add(n.normalized);
  }
  const primary = normalizeEmailForDuplicate(party.primaryEmail);
  if (primary && primary.normalized) set.add(primary.normalized);
  return set;
}

/**
 * @param {unknown} manualEvidence
 */
function resolveManualEvidence(manualEvidence) {
  const m = manualEvidence && typeof manualEvidence === "object" ? manualEvidence : {};
  const action = trimStr(m.action || m.reviewAction || m.decision).toLowerCase();
  const linkedSameOrganization =
    m.linkedSameOrganization === true ||
    m.linked_same_organization === true ||
    action === "link_organization";
  const adminMarkedSame =
    m.adminMarkedSameDuplicate === true ||
    m.admin_marked_same_duplicate === true ||
    m.confirmedDuplicate === true ||
    ["same", "same_organization", "duplicate_marked_same", "confirm_duplicate"].includes(
      action
    ) ||
    MANUAL_CONFIRMED_ACTIONS.includes(action);
  const adminMarkedDifferent =
    m.adminMarkedDifferentDuplicate === true ||
    m.admin_marked_different_duplicate === true ||
    action === "different" ||
    action === "not_duplicate" ||
    action === "duplicate_marked_different";

  return {
    linkedSameOrganization,
    adminMarkedSame,
    adminMarkedDifferent,
    hasCanonicalConfirmation: linkedSameOrganization || adminMarkedSame,
  };
}

/**
 * @param {string} code
 * @param {number} weight
 * @param {string} message
 */
function reason(code, weight, message) {
  return {
    code,
    weight,
    message: String(message || ""),
  };
}

/**
 * Map total weight + manual evidence to a risk level.
 * `confirmed` requires canonical manual evidence — never inferred from field overlap alone.
 * @param {number} totalWeight
 * @param {ReturnType<typeof resolveManualEvidence>} manual
 * @param {object[]} reasons
 */
function resolveRiskLevel(totalWeight, manual, reasons) {
  if (manual.adminMarkedDifferent) {
    return {
      riskLevel: RISK_LEVELS.NONE,
      explanation:
        "An administrator already marked these records as not the same organization. Automated overlap is advisory only and does not reopen a confirmed-different decision. No automatic merge or rejection.",
    };
  }

  if (manual.hasCanonicalConfirmation) {
    return {
      riskLevel: RISK_LEVELS.CONFIRMED,
      explanation:
        "Canonical manual evidence already links or confirms these records as the same organization. Field overlap is supporting context only. No automatic merge or rejection; approval gates are unchanged.",
    };
  }

  if (totalWeight >= STRONG_MIN) {
    return {
      riskLevel: RISK_LEVELS.STRONG,
      explanation:
        "Strong exact-match signals were found (for example verified phone, church-owned email, registration number, or occupying phone). This is advisory only — no automatic merge, rejection, or approval-gate change.",
    };
  }

  if (totalWeight >= POSSIBLE_MIN) {
    return {
      riskLevel: RISK_LEVELS.POSSIBLE,
      explanation:
        "Limited or weak overlap was found (for example similar/exact name or same town). Name similarity and town alone do not confirm a duplicate. Advisory only — no automatic merge or rejection.",
    };
  }

  if (reasons.length > 0) {
    return {
      riskLevel: RISK_LEVELS.POSSIBLE,
      explanation:
        "Only weak overlap was found (for example same town alone). This remains a weak signal and does not confirm a duplicate. Advisory only — no automatic merge or rejection.",
    };
  }

  return {
    riskLevel: RISK_LEVELS.NONE,
    explanation:
      "No meaningful duplicate overlap was detected between these records. Advisory only; approval gates are unchanged.",
  };
}

/**
 * Score one subject ↔ candidate pair.
 *
 * @param {{
 *   subject?: object,
 *   candidate?: object,
 *   manualEvidence?: object,
 *   now?: Date|string,
 * }} [input]
 * @returns {{
 *   riskLevel: string,
 *   totalWeight: number,
 *   reasons: { code: string, weight: number, message: string }[],
 *   signals: string[],
 *   explanation: string,
 *   subjectId: string|null,
 *   candidateId: string|null,
 *   candidateType: string,
 *   advisory: true,
 *   autoMerge: false,
 *   autoReject: false,
 *   approvalGateUnchanged: true,
 *   calculatedAt: string
 * }}
 */
function scoreRegistrationDuplicateMatch(input) {
  const opts = input && typeof input === "object" ? input : {};
  const calculatedAt =
    opts.now != null ? new Date(opts.now).toISOString() : new Date().toISOString();
  const subject = pickParty(opts.subject);
  const candidate = pickParty(opts.candidate);
  const manual = resolveManualEvidence(opts.manualEvidence);

  const reasons = [];
  const add = (code, weight, message) => {
    reasons.push(reason(code, weight, message));
  };

  // —— High-weight signals ——
  const subjectReg = normalizeRegistrationNumberForDuplicate(subject.registrationNumber);
  const candidateReg = normalizeRegistrationNumberForDuplicate(candidate.registrationNumber);
  if (
    subjectReg &&
    subjectReg.normalized &&
    candidateReg &&
    candidateReg.normalized &&
    subjectReg.normalized === candidateReg.normalized
  ) {
    add(
      "exact_registration_number",
      SIGNAL_WEIGHTS.exact_registration_number,
      `Exact registration number match (${subjectReg.normalized}).`
    );
  }

  const subjectPhone = resolvePhoneNormalized(subject);
  const candidatePhone = resolvePhoneNormalized(candidate);
  if (subjectPhone && candidatePhone && subjectPhone === candidatePhone) {
    const verified = subject.phoneVerified === true || candidate.phoneVerified === true;
    if (verified) {
      add(
        "verified_phone_overlap",
        SIGNAL_WEIGHTS.verified_phone_overlap,
        "Same phone number with verified phone evidence on at least one side."
      );
    } else {
      add(
        "exact_phone_overlap",
        SIGNAL_WEIGHTS.exact_phone_overlap,
        "Same normalized phone number (occupying / exact overlap). Phone is not marked verified on either side."
      );
    }
  }

  const subjectEmail = resolveEmailNormalized(subject);
  const candidateOwned = churchOwnedEmailSet(candidate);
  const subjectOwned = churchOwnedEmailSet(subject);
  if (subjectEmail && candidateOwned.has(subjectEmail)) {
    add(
      "church_owned_email",
      SIGNAL_WEIGHTS.church_owned_email,
      "Applicant email matches a church-owned email on the candidate organization."
    );
  } else if (subjectEmail && subjectOwned.size && candidate.type === "application") {
    const candidateEmail = resolveEmailNormalized(candidate);
    if (candidateEmail && subjectOwned.has(candidateEmail)) {
      add(
        "church_owned_email",
        SIGNAL_WEIGHTS.church_owned_email,
        "Candidate email matches a church-owned email associated with the subject."
      );
    }
  }

  // —— Medium ——
  const subjectDomain = normalizeWebsiteDomainForDuplicate(subject.website);
  const candidateDomain = normalizeWebsiteDomainForDuplicate(candidate.website);
  if (
    subjectDomain &&
    subjectDomain.normalized &&
    candidateDomain &&
    candidateDomain.normalized &&
    subjectDomain.normalized === candidateDomain.normalized
  ) {
    add(
      "exact_website_domain",
      SIGNAL_WEIGHTS.exact_website_domain,
      `Exact website domain match (${subjectDomain.normalized}).`
    );
  }

  // —— Limited name / location ——
  const subjectNameSource = subject.churchName != null ? subject.churchName : subject.displayName;
  const candidateNameSource =
    candidate.churchName != null ? candidate.churchName : candidate.displayName;
  const triple = normalizeChurchNameCityCountryForDuplicate({
    churchName: subjectNameSource,
    city: subject.city,
    country: subject.country,
  });
  const candidateTriple = normalizeChurchNameCityCountryForDuplicate({
    churchName: candidateNameSource,
    city: candidate.city,
    country: candidate.country,
  });
  const subjectName = normalizeChurchNameForDuplicate(subjectNameSource);
  const candidateName = normalizeChurchNameForDuplicate(candidateNameSource);
  const subjectCity = normalizePlaceForDuplicate(subject.city);
  const candidateCity = normalizePlaceForDuplicate(candidate.city);
  const subjectCountry = normalizePlaceForDuplicate(subject.country);
  const candidateCountry = normalizePlaceForDuplicate(candidate.country);

  const exactTriple =
    triple && candidateTriple && triple.key && triple.key === candidateTriple.key;
  const exactName =
    subjectName &&
    candidateName &&
    subjectName.normalized &&
    subjectName.normalized === candidateName.normalized;
  const sameCity =
    subjectCity &&
    candidateCity &&
    subjectCity.normalized &&
    subjectCity.normalized === candidateCity.normalized;
  const sameCountry =
    subjectCountry &&
    candidateCountry &&
    subjectCountry.normalized &&
    subjectCountry.normalized === candidateCountry.normalized;

  if (exactTriple) {
    add(
      "exact_name_city_country",
      SIGNAL_WEIGHTS.exact_name_city_country,
      "Exact church name, city, and country match. Name similarity alone does not confirm a duplicate."
    );
  } else if (exactName) {
    add(
      "exact_church_name",
      SIGNAL_WEIGHTS.exact_church_name,
      "Exact church name match without a full city/country triple. Limited weight only."
    );
  }

  if (!exactTriple && sameCity && sameCountry) {
    add(
      "same_city_country",
      SIGNAL_WEIGHTS.same_city_country,
      "Same town/city and country only. Same town alone remains a weak signal."
    );
  } else if (!exactTriple && sameCity && !exactName) {
    add(
      "same_city_only",
      SIGNAL_WEIGHTS.same_city_only,
      "Same city/town only. This is a weak signal and does not confirm a duplicate."
    );
  }

  // Platform-user email overlap (not ownership, not church-owned).
  if (subjectEmail) {
    const candidateEmail = resolveEmailNormalized(candidate);
    const alreadyChurchOwned = reasons.some((r) => r.code === "church_owned_email");
    if (
      !alreadyChurchOwned &&
      candidateEmail &&
      subjectEmail === candidateEmail &&
      (candidate.isPlatformUser || candidate.type === "user")
    ) {
      add(
        "platform_user_email",
        SIGNAL_WEIGHTS.platform_user_email,
        "Applicant email matches an existing platform user account. This is not email ownership proof and is not treated as a confirmed duplicate."
      );
    } else if (
      !alreadyChurchOwned &&
      candidateEmail &&
      subjectEmail === candidateEmail &&
      candidate.type === "application"
    ) {
      add(
        "same_contact_email",
        SIGNAL_WEIGHTS.same_contact_email,
        "Same contact email appears on another registration application. Email uniqueness is not ownership proof."
      );
    }
  }

  // Deduplicate by code (keep first / highest intentional single emission).
  const seen = new Set();
  const uniqueReasons = [];
  for (const r of reasons) {
    if (seen.has(r.code)) continue;
    seen.add(r.code);
    uniqueReasons.push(r);
  }

  const totalWeight = uniqueReasons.reduce((sum, r) => sum + Number(r.weight || 0), 0);
  const { riskLevel, explanation } = resolveRiskLevel(totalWeight, manual, uniqueReasons);

  // If confirmed, keep reasons but ensure manual reason is present.
  if (riskLevel === RISK_LEVELS.CONFIRMED) {
    uniqueReasons.unshift(
      reason(
        "canonical_manual_evidence",
        0,
        manual.linkedSameOrganization
          ? "Canonical link-organization (or equivalent) evidence already exists."
          : "Administrator already confirmed these records as the same organization."
      )
    );
  }

  return {
    riskLevel,
    totalWeight,
    reasons: uniqueReasons,
    signals: uniqueReasons.map((r) => r.code),
    explanation,
    subjectId: subject.id,
    candidateId: candidate.id,
    candidateType: candidate.type,
    advisory: true,
    autoMerge: false,
    autoReject: false,
    approvalGateUnchanged: true,
    calculatedAt,
  };
}

/**
 * Score many candidates; sort strong/confirmed first, then by weight.
 * @param {{
 *   subject?: object,
 *   candidates?: object[],
 *   manualEvidenceByCandidateId?: Record<string, object>,
 *   now?: Date|string,
 * }} [input]
 */
function scoreRegistrationDuplicateMatches(input = {}) {
  const list = Array.isArray(input.candidates) ? input.candidates : [];
  const byId =
    input.manualEvidenceByCandidateId && typeof input.manualEvidenceByCandidateId === "object"
      ? input.manualEvidenceByCandidateId
      : {};
  const scored = list.map((candidate) => {
    const id = candidate && candidate.id != null ? String(candidate.id) : "";
    return scoreRegistrationDuplicateMatch({
      subject: input.subject,
      candidate,
      manualEvidence: id && byId[id] ? byId[id] : input.manualEvidence,
      now: input.now,
    });
  });

  const rank = {
    [RISK_LEVELS.CONFIRMED]: 0,
    [RISK_LEVELS.STRONG]: 1,
    [RISK_LEVELS.POSSIBLE]: 2,
    [RISK_LEVELS.NONE]: 3,
  };
  scored.sort((a, b) => {
    const ra = rank[a.riskLevel] != null ? rank[a.riskLevel] : 9;
    const rb = rank[b.riskLevel] != null ? rank[b.riskLevel] : 9;
    if (ra !== rb) return ra - rb;
    return b.totalWeight - a.totalWeight;
  });
  return scored;
}

module.exports = {
  RISK_LEVELS,
  SIGNAL_WEIGHTS,
  POSSIBLE_MIN,
  STRONG_MIN,
  scoreRegistrationDuplicateMatch,
  scoreRegistrationDuplicateMatches,
};
