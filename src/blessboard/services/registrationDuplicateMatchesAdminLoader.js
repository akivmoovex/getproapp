"use strict";

/**
 * Phase2 Prompt 049 — Platform Admin loaders for duplicate match list + comparison.
 * Read-only; wraps Prompt 048 query service. No merge/reject/decision writes.
 */

const {
  listDuplicateMatches,
  getDuplicateComparison,
} = require("./registrationDuplicateMatchQueryService");
const {
  DECISION_OPTIONS,
  isReasonRequired,
  ALWAYS_REQUIRE_REASON,
  STRONG_OVERRIDE_DECISIONS,
} = require("./registrationDuplicateReviewDecisionService");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  LOOKUP_ERROR: "lookup_error",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Approved comparison field keys for subject application side. */
const SUBJECT_COMPARISON_KEYS = Object.freeze([
  "id",
  "type",
  "churchName",
  "city",
  "country",
  "applicationStatus",
  "provisioningStatus",
  "organizationId",
  "hasContactEmail",
  "hasContactPhone",
]);

/** Approved comparison field keys by matched record type. */
const CANDIDATE_COMPARISON_KEYS = Object.freeze({
  application: [
    "type",
    "id",
    "churchName",
    "city",
    "country",
    "applicationStatus",
    "provisioningStatus",
  ],
  organization: [
    "type",
    "id",
    "displayName",
    "organizationKey",
    "status",
    "dataEnvironment",
    "hasPrimaryEmail",
  ],
  church: [
    "type",
    "id",
    "displayName",
    "churchKey",
    "organizationId",
    "status",
    "hasPrimaryEmail",
  ],
  branch: ["type", "id", "displayName", "branchKey", "churchId", "status", "countryCode"],
  domain: ["type", "id", "hostname", "domainType", "status", "organizationId"],
  user: ["type", "id", "label", "status"],
});

const RISK_DISPLAY_LABELS = Object.freeze({
  confirmed: "Identical match",
  strong: "High match",
  possible: "Partial match",
  none: "No match",
});

const REASON_TAG_LABELS = Object.freeze({
  exact_registration_number: "Registration number",
  verified_phone_overlap: "Verified phone",
  exact_phone_overlap: "Phone match",
  church_owned_email: "Church email",
  platform_user_email: "Account email",
  same_contact_email: "Email match",
  exact_website_domain: "Domain match",
  exact_name_city_country: "Name and location",
  exact_church_name: "Exact name",
  same_city_country: "Same town",
  same_city_only: "Same city",
  canonical_manual_evidence: "Manual confirmation",
});

const PHONE_OVERLAP_CODES = Object.freeze([
  "verified_phone_overlap",
  "exact_phone_overlap",
]);

const EMAIL_OVERLAP_CODES = Object.freeze([
  "church_owned_email",
  "same_contact_email",
  "platform_user_email",
]);

const RECORD_TYPE_LABELS = Object.freeze({
  application: "Registration application",
  organization: "Organization",
  church: "Church",
  branch: "Branch",
  domain: "Domain",
  user: "Platform user account",
});

/** Prompt 051 — authorized comparison attributes (never invent missing values). */
const COMPARISON_ATTRIBUTE_DEFS = Object.freeze([
  {
    key: "legalName",
    label: "Legal / public name",
    icon: "badge",
    matchCodes: ["exact_church_name", "exact_name_city_country"],
  },
  {
    key: "country",
    label: "Country",
    icon: "public",
    matchCodes: ["same_city_country", "exact_name_city_country"],
  },
  { key: "province", label: "Province", icon: "map", matchCodes: [] },
  { key: "district", label: "District", icon: "map", matchCodes: [] },
  {
    key: "town",
    label: "Town",
    icon: "location_city",
    matchCodes: ["same_city_country", "same_city_only", "exact_name_city_country"],
  },
  { key: "address", label: "Address", icon: "home", matchCodes: [] },
  {
    key: "phone",
    label: "Phone",
    icon: "call",
    matchCodes: ["exact_phone_overlap", "verified_phone_overlap"],
  },
  {
    key: "email",
    label: "Email",
    icon: "mail",
    matchCodes: ["same_contact_email", "church_owned_email", "platform_user_email"],
  },
  {
    key: "website",
    label: "Website / domain",
    icon: "language",
    matchCodes: ["exact_website_domain"],
  },
  {
    key: "registrationNumber",
    label: "Registration number",
    icon: "fingerprint",
    matchCodes: ["exact_registration_number"],
  },
  { key: "leader", label: "Leader", icon: "person", matchCodes: [] },
  { key: "branchCount", label: "Branch count", icon: "account_tree", matchCodes: [] },
  { key: "adminCount", label: "Admin count", icon: "group", matchCodes: [] },
  {
    key: "organizationStatus",
    label: "Organization status",
    icon: "verified",
    matchCodes: [],
  },
  { key: "createdAt", label: "Creation date", icon: "calendar_today", matchCodes: [] },
]);

/**
 * @param {unknown} value
 * @param {{ withheld?: boolean }} [opts]
 * @returns {string}
 */
function formatComparisonDisplayValue(value, opts = {}) {
  if (opts.withheld) return "Not shown";
  if (value == null) return "Not provided";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const s = String(value).trim();
  if (!s) return "Not provided";
  if (opts.key === "createdAt" || (s.includes("T") && /\d{4}-\d{2}-\d{2}/.test(s))) {
    try {
      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) {
        return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
      }
    } catch {
      /* fall through */
    }
  }
  return s;
}

/**
 * @param {object|null|undefined} side
 * @param {string} key
 * @returns {{ value: unknown, withheld: boolean }}
 */
function readAuthorizedSideValue(side, key) {
  const s = side && typeof side === "object" ? side : {};
  if (key === "legalName") {
    const value = s.legalName || s.publicName || null;
    return { value, withheld: false };
  }
  if (key === "phone" && s.phoneWithheld) {
    return { value: null, withheld: true };
  }
  if (key === "email" && s.emailWithheld) {
    return { value: null, withheld: true };
  }
  const raw = s[key];
  return {
    value: raw != null && String(raw).trim() !== "" ? raw : null,
    withheld: false,
  };
}

/**
 * Build attribute-by-attribute comparison rows for desktop + mobile screens.
 *
 * @param {object|null|undefined} subjectSide
 * @param {object|null|undefined} candidateSide
 * @param {string[]} signalCodes
 * @param {{ reasonTags?: string[], reasons?: string[] }} [meta]
 */
function buildComparisonAttributeRows(subjectSide, candidateSide, signalCodes, meta = {}) {
  const codes = new Set(
    (Array.isArray(signalCodes) ? signalCodes : []).map((c) => String(c || "").trim()).filter(Boolean)
  );
  const reasonTags = Array.isArray(meta.reasonTags) ? meta.reasonTags : [];

  return COMPARISON_ATTRIBUTE_DEFS.map((def) => {
    const leftRaw = readAuthorizedSideValue(subjectSide, def.key);
    const rightRaw = readAuthorizedSideValue(candidateSide, def.key);
    const leftWithheld = Boolean(leftRaw && leftRaw.withheld);
    const rightWithheld = Boolean(rightRaw && rightRaw.withheld);
    const leftValue = leftRaw && typeof leftRaw === "object" ? leftRaw.value : leftRaw;
    const rightValue = rightRaw && typeof rightRaw === "object" ? rightRaw.value : rightRaw;
    const leftDisplay = formatComparisonDisplayValue(leftValue, {
      withheld: leftWithheld,
      key: def.key,
    });
    const rightDisplay = formatComparisonDisplayValue(rightValue, {
      withheld: rightWithheld,
      key: def.key,
    });
    const bothMissing =
      (leftDisplay === "Not provided" || leftDisplay === "Not shown") &&
      (rightDisplay === "Not provided" || rightDisplay === "Not shown");
    const signalMatch = (def.matchCodes || []).some((code) => codes.has(code));
    const valuesEqual =
      leftDisplay !== "Not provided" &&
      leftDisplay !== "Not shown" &&
      rightDisplay !== "Not provided" &&
      rightDisplay !== "Not shown" &&
      leftDisplay.toLowerCase() === rightDisplay.toLowerCase();

    let state = "unavailable";
    let stateLabel = "Unavailable";
    let stateIcon = "remove";
    if (signalMatch || valuesEqual) {
      state = "match";
      stateLabel = "Match";
      stateIcon = "check_circle";
    } else if (!bothMissing) {
      state = "diff";
      stateLabel = "Different";
      stateIcon = "close";
    }

    const matchedReasonTags = (def.matchCodes || [])
      .filter((code) => codes.has(code))
      .map((code) => reasonTagLabel(code));

    return {
      key: def.key,
      label: def.label,
      icon: def.icon,
      subjectValue: leftDisplay,
      candidateValue: rightDisplay,
      state,
      stateLabel,
      stateIcon,
      reasonTags: matchedReasonTags.length
        ? matchedReasonTags
        : state === "match" && reasonTags.length
          ? []
          : [],
    };
  });
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function trimStr(value) {
  if (value == null) return "";
  return String(value).trim();
}

/**
 * @param {object|null|undefined} obj
 * @param {string[]} keys
 */
function pickApprovedFields(obj, keys) {
  const src = obj && typeof obj === "object" ? obj : {};
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(src, key)) {
      out[key] = src[key];
    } else {
      out[key] = null;
    }
  }
  return out;
}

/**
 * @param {object|null|undefined} candidate
 */
function pickCandidateFields(candidate) {
  const type = candidate && candidate.type != null ? String(candidate.type) : "";
  const keys = CANDIDATE_COMPARISON_KEYS[type] || ["type", "id"];
  return pickApprovedFields(candidate, keys);
}

/**
 * @param {object|null|undefined} subject
 */
function pickSubjectFields(subject) {
  return pickApprovedFields(subject, SUBJECT_COMPARISON_KEYS);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function humanizeToken(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {object|null|undefined} candidate
 * @returns {string}
 */
function candidateDisplayLabel(candidate) {
  if (!candidate || typeof candidate !== "object") return "Matched record";
  if (candidate.type === "user") return "Platform user account";
  if (candidate.label) return String(candidate.label);
  if (candidate.displayName) return String(candidate.displayName);
  if (candidate.churchName) return String(candidate.churchName);
  if (candidate.hostname) return String(candidate.hostname);
  if (candidate.organizationKey) return String(candidate.organizationKey);
  const type = trimStr(candidate.type) || "record";
  const id = trimStr(candidate.id);
  return id ? `${type} ${id.slice(0, 8)}` : type;
}

/**
 * @param {string} code
 * @returns {string}
 */
function reasonTagLabel(code) {
  const key = trimStr(code);
  if (REASON_TAG_LABELS[key]) return REASON_TAG_LABELS[key];
  return humanizeToken(key) || "Match signal";
}

/**
 * @param {unknown} rawReasons
 * @param {unknown} signals
 * @returns {{ code: string, message: string, label: string }[]}
 */
function normalizeReasonEntries(rawReasons, signals) {
  const list = Array.isArray(rawReasons) ? rawReasons : [];
  /** @type {{ code: string, message: string, label: string }[]} */
  const out = [];
  const seen = new Set();
  for (const item of list) {
    let code = "";
    let message = "";
    if (typeof item === "string") {
      message = item.trim();
      code = "";
    } else if (item && typeof item === "object") {
      code = item.code != null ? String(item.code).trim() : "";
      message = item.message != null ? String(item.message).trim() : "";
    }
    if (!code && !message) continue;
    const key = code || message;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      code,
      message: message || reasonTagLabel(code),
      label: code ? reasonTagLabel(code) : message,
    });
  }
  if (!out.length && Array.isArray(signals)) {
    for (const signal of signals) {
      const code = trimStr(signal);
      if (!code || seen.has(code)) continue;
      seen.add(code);
      out.push({
        code,
        message: reasonTagLabel(code),
        label: reasonTagLabel(code),
      });
    }
  }
  return out;
}

/**
 * @param {object|null|undefined} candidate
 * @returns {string}
 */
function candidateLocationLabel(candidate) {
  const c = candidate && typeof candidate === "object" ? candidate : {};
  const parts = [c.city, c.country || c.countryCode].map(trimStr).filter(Boolean);
  if (parts.length) return parts.join(", ");
  if (c.hostname) return String(c.hostname);
  return "";
}

/**
 * @param {object|null|undefined} candidate
 * @param {string} matchedRecordType
 * @returns {string}
 */
function candidateOrganizationStatus(candidate, matchedRecordType) {
  const c = candidate && typeof candidate === "object" ? candidate : {};
  const type = trimStr(matchedRecordType || c.type);
  if (type === "application") {
    return trimStr(c.applicationStatus) || "Not provided";
  }
  if (type === "user") {
    return trimStr(c.status) || "Not provided";
  }
  return trimStr(c.status) || "Not provided";
}

/**
 * @param {string|null|undefined} reviewDecision
 * @returns {{ code: string|null, label: string }}
 */
function presentReviewStatus(reviewDecision) {
  const code = reviewDecision != null && String(reviewDecision).trim() ? String(reviewDecision).trim() : null;
  if (!code) {
    return { code: null, label: "Not reviewed" };
  }
  return { code, label: humanizeToken(code) };
}

/**
 * @param {string[]} signalCodes
 * @returns {{ phone: boolean, email: boolean, labels: string[] }}
 */
function presentContactOverlap(signalCodes) {
  const codes = Array.isArray(signalCodes) ? signalCodes.map(trimStr).filter(Boolean) : [];
  const phone = codes.some((c) => PHONE_OVERLAP_CODES.includes(c));
  const email = codes.some((c) => EMAIL_OVERLAP_CODES.includes(c));
  /** @type {string[]} */
  const labels = [];
  if (phone) labels.push("Phone overlap");
  if (email) labels.push("Email overlap");
  if (!labels.length) labels.push("No contact overlap");
  return { phone, email, labels };
}

/**
 * @param {object} match
 * @param {string} applicationId
 */
function presentMatchForView(match, applicationId) {
  const m = match && typeof match === "object" ? match : {};
  const matchId = m.id != null ? String(m.id) : "";
  const appId = String(applicationId || "");
  const evidence =
    m.evidenceSnapshot && typeof m.evidenceSnapshot === "object"
      ? m.evidenceSnapshot
      : m.evidence_snapshot && typeof m.evidence_snapshot === "object"
        ? m.evidence_snapshot
        : {};
  const signals = Array.isArray(evidence.signals)
    ? evidence.signals.map((s) => String(s))
    : Array.isArray(m.signals)
      ? m.signals.map((s) => String(s))
      : [];
  const reasonEntries = normalizeReasonEntries(
    Array.isArray(m.reasons) && m.reasons.length ? m.reasons : evidence.reasons,
    signals
  );
  const reasonCodes = reasonEntries.map((r) => r.code).filter(Boolean);
  const signalCodes = signals.length ? signals : reasonCodes;
  const rawCandidate = m.candidate && typeof m.candidate === "object" ? m.candidate : {};
  const candidate = pickCandidateFields(rawCandidate);
  const riskLevel = String(m.riskLevel || m.risk_level || "none");
  const review = presentReviewStatus(m.reviewDecision != null ? m.reviewDecision : m.review_decision);
  const recordType = String(
    m.matchedRecordType || m.matched_record_type || rawCandidate.type || ""
  );
  const location = candidateLocationLabel(rawCandidate) || "Not provided";
  const contactOverlap = presentContactOverlap(signalCodes);
  const reviewedByUserIdRaw =
    m.reviewedByUserId != null
      ? m.reviewedByUserId
      : m.reviewed_by_user_id != null
        ? m.reviewed_by_user_id
        : null;
  const reviewedAtRaw =
    m.reviewedAt != null ? m.reviewedAt : m.reviewed_at != null ? m.reviewed_at : null;
  const reviewReasonRaw =
    m.reviewReason != null
      ? m.reviewReason
      : m.review_reason != null
        ? m.review_reason
        : null;

  return {
    id: matchId || (m.id != null ? String(m.id) : ""),
    applicationId: appId,
    matchedRecordType: recordType,
    matchedRecordTypeLabel: RECORD_TYPE_LABELS[recordType] || humanizeToken(recordType) || "Record",
    matchedRecordId: String(m.matchedRecordId || m.matched_record_id || ""),
    score: Number(m.score) || 0,
    riskLevel,
    riskLabel: RISK_DISPLAY_LABELS[riskLevel] || humanizeToken(riskLevel) || "Match",
    reviewDecision: review.code,
    reviewStatus: review.label,
    reviewReason: reviewReasonRaw != null ? String(reviewReasonRaw) : null,
    reviewedByUserId: reviewedByUserIdRaw != null ? String(reviewedByUserIdRaw) : null,
    reviewedAt: reviewedAtRaw || null,
    reasons: reasonEntries.map((r) => r.message),
    reasonTags: reasonEntries.map((r) => r.label),
    explanation: evidence.explanation != null ? String(evidence.explanation) : "",
    location,
    contactOverlap,
    organizationStatus: candidateOrganizationStatus(
      { ...rawCandidate, ...candidate },
      recordType
    ),
    candidate,
    candidateLabel: candidateDisplayLabel(rawCandidate),
    compareHref:
      appId && (matchId || m.id) && UUID_RE.test(appId) && UUID_RE.test(String(matchId || m.id))
        ? `/admin/registration-applications/${encodeURIComponent(appId)}/duplicates/${encodeURIComponent(String(matchId || m.id))}`
        : null,
  };
}

/**
 * @param {unknown} err
 * @param {Function|undefined} logFn
 * @param {string} message
 */
function logLoaderFailure(message, err, logFn) {
  if (typeof logFn !== "function") return;
  try {
    logFn(message, err);
  } catch {
    /* ignore logger failures */
  }
}

/**
 * Load persisted duplicate matches once for the list workspace.
 * Never throws. Never merges/rejects. Never exposes unrelated user emails.
 *
 * @param {{ query: Function }} db
 * @param {string} applicationId
 * @param {{
 *   listDuplicateMatches?: Function,
 *   queryDeps?: object,
 *   logDuplicateMatchesError?: Function,
 * }} [options]
 */
async function loadRegistrationDuplicateMatchesForAdmin(db, applicationId, options = {}) {
  const id = trimStr(applicationId);
  if (!id || !UUID_RE.test(id)) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      message: "invalid_application_id",
    };
  }

  const listFn =
    typeof options.listDuplicateMatches === "function"
      ? options.listDuplicateMatches
      : listDuplicateMatches;
  const logFn = options.logDuplicateMatchesError;

  try {
    const result = await listFn(db, id, options.queryDeps || {});
    if (!result || !result.ok) {
      const st = result && result.status ? String(result.status) : STATUS.LOOKUP_ERROR;
      if (st === "invalid_input") {
        return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_application_id" };
      }
      if (st === "not_found") {
        return { ok: false, status: STATUS.NOT_FOUND, message: "application_not_found" };
      }
      return {
        ok: true,
        status: STATUS.OK,
        applicationId: id,
        subject: null,
        matches: [],
        empty: true,
        unavailable: true,
        advisory: true,
        autoMerge: false,
        autoReject: false,
        approvalGateUnchanged: true,
        detailHref: `/admin/registration-applications/${encodeURIComponent(id)}`,
      };
    }

    const matches = Array.isArray(result.matches)
      ? result.matches.map((m) => presentMatchForView(m, id))
      : [];

    return {
      ok: true,
      status: STATUS.OK,
      applicationId: id,
      subject: pickSubjectFields(result.subject),
      matches,
      empty: matches.length === 0,
      unavailable: false,
      advisory: true,
      autoMerge: false,
      autoReject: false,
      approvalGateUnchanged: true,
      detailHref: `/admin/registration-applications/${encodeURIComponent(id)}`,
    };
  } catch (err) {
    logLoaderFailure(
      "duplicate matches load failed; using safe unavailable fallback",
      err,
      logFn
    );
    return {
      ok: true,
      status: STATUS.OK,
      applicationId: id,
      subject: null,
      matches: [],
      empty: true,
      unavailable: true,
      advisory: true,
      autoMerge: false,
      autoReject: false,
      approvalGateUnchanged: true,
      detailHref: `/admin/registration-applications/${encodeURIComponent(id)}`,
    };
  }
}

/**
 * Load one duplicate comparison once. Comparison sides limited to approved fields.
 *
 * @param {{ query: Function }} db
 * @param {string} applicationId
 * @param {string} matchId
 * @param {{
 *   getDuplicateComparison?: Function,
 *   queryDeps?: object,
 *   logDuplicateMatchesError?: Function,
 * }} [options]
 */
async function loadRegistrationDuplicateComparisonForAdmin(
  db,
  applicationId,
  matchId,
  options = {}
) {
  const appId = trimStr(applicationId);
  const mid = trimStr(matchId);
  if (!appId || !UUID_RE.test(appId) || !mid || !UUID_RE.test(mid)) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      message: "invalid_ids",
    };
  }

  const getFn =
    typeof options.getDuplicateComparison === "function"
      ? options.getDuplicateComparison
      : getDuplicateComparison;
  const logFn = options.logDuplicateMatchesError;
  const listHref = `/admin/registration-applications/${encodeURIComponent(appId)}/duplicates`;
  const detailHref = `/admin/registration-applications/${encodeURIComponent(appId)}`;

  try {
    const result = await getFn(db, appId, mid, options.queryDeps || {});
    if (!result || !result.ok) {
      const st = result && result.status ? String(result.status) : STATUS.LOOKUP_ERROR;
      if (st === "invalid_input") {
        return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_ids" };
      }
      if (st === "not_found") {
        const msg =
          result && result.message === "match_not_found"
            ? "match_not_found"
            : "application_not_found";
        return { ok: false, status: STATUS.NOT_FOUND, message: msg };
      }
      return {
        ok: true,
        status: STATUS.OK,
        applicationId: appId,
        matchId: mid,
        unavailable: true,
        empty: true,
        match: null,
        comparison: null,
        advisory: true,
        autoMerge: false,
        autoReject: false,
        approvalGateUnchanged: true,
        listHref,
        detailHref,
      };
    }

    const presentedMatch = presentMatchForView(result.match, appId);
    const cmp = result.comparison && typeof result.comparison === "object" ? result.comparison : {};
    const authorizedSubject =
      cmp.authorizedSubject && typeof cmp.authorizedSubject === "object"
        ? cmp.authorizedSubject
        : null;
    const authorizedCandidate =
      cmp.authorizedCandidate && typeof cmp.authorizedCandidate === "object"
        ? cmp.authorizedCandidate
        : null;
    const evidence = cmp.evidenceSnapshot && typeof cmp.evidenceSnapshot === "object"
      ? cmp.evidenceSnapshot
      : {};
    const signalCodes = [
      ...(Array.isArray(evidence.signals) ? evidence.signals : []),
      ...(Array.isArray(evidence.reasons)
        ? evidence.reasons.map((r) => (r && r.code != null ? r.code : null)).filter(Boolean)
        : []),
    ].map((s) => String(s));
    const attributes = buildComparisonAttributeRows(
      authorizedSubject,
      authorizedCandidate,
      signalCodes,
      {
        reasonTags: presentedMatch.reasonTags,
        reasons: presentedMatch.reasons,
      }
    );

    return {
      ok: true,
      status: STATUS.OK,
      applicationId: appId,
      matchId: mid,
      unavailable: false,
      empty: false,
      match: presentedMatch,
      comparison: {
        subject: pickSubjectFields(cmp.subject),
        candidate: pickCandidateFields(cmp.candidate),
        authorizedSubject,
        authorizedCandidate,
        attributes,
        score: Number(cmp.score) || 0,
        riskLevel: cmp.riskLevel != null ? String(cmp.riskLevel) : "none",
        riskLabel:
          RISK_DISPLAY_LABELS[cmp.riskLevel] ||
          humanizeToken(cmp.riskLevel) ||
          "Match",
        reasons: presentedMatch.reasons,
        reasonTags: presentedMatch.reasonTags,
        explanation:
          cmp.evidenceSnapshot && cmp.evidenceSnapshot.explanation != null
            ? String(cmp.evidenceSnapshot.explanation)
            : presentedMatch.explanation,
        reviewDecision: cmp.reviewDecision != null ? String(cmp.reviewDecision) : null,
        reviewReason: cmp.reviewReason != null ? String(cmp.reviewReason) : null,
        reviewedByUserId: presentedMatch.reviewedByUserId,
        reviewedAt: presentedMatch.reviewedAt,
        decisionOptions: DECISION_OPTIONS.map((opt) => ({
          value: opt.value,
          label: opt.label,
          reasonRequired: isReasonRequired(opt.value, presentedMatch.riskLevel),
        })),
        reasonAlwaysRequiredDecisions: ALWAYS_REQUIRE_REASON.slice(),
        strongOverrideDecisions: STRONG_OVERRIDE_DECISIONS.slice(),
        reasonRequiredForStrongMatch:
          presentedMatch.riskLevel === "strong" || presentedMatch.riskLevel === "confirmed",
      },
      advisory: true,
      autoMerge: false,
      autoReject: false,
      approvalGateUnchanged: true,
      listHref,
      detailHref,
    };
  } catch (err) {
    logLoaderFailure(
      "duplicate comparison load failed; using safe unavailable fallback",
      err,
      logFn
    );
    return {
      ok: true,
      status: STATUS.OK,
      applicationId: appId,
      matchId: mid,
      unavailable: true,
      empty: true,
      match: null,
      comparison: null,
      advisory: true,
      autoMerge: false,
      autoReject: false,
      approvalGateUnchanged: true,
      listHref,
      detailHref,
    };
  }
}

module.exports = {
  STATUS,
  SUBJECT_COMPARISON_KEYS,
  CANDIDATE_COMPARISON_KEYS,
  RISK_DISPLAY_LABELS,
  REASON_TAG_LABELS,
  COMPARISON_ATTRIBUTE_DEFS,
  loadRegistrationDuplicateMatchesForAdmin,
  loadRegistrationDuplicateComparisonForAdmin,
  presentMatchForView,
  pickSubjectFields,
  pickCandidateFields,
  candidateDisplayLabel,
  normalizeReasonEntries,
  presentContactOverlap,
  buildComparisonAttributeRows,
  formatComparisonDisplayValue,
};
