"use strict";

/**
 * Phase 5 registration-queue presentation helpers.
 * Presentation only — does not rename stored statuses or persist values.
 */

const { chipClassForTone } = require("./registrationStatusPresentation");

const PHASE5_VISIBLE = Object.freeze({
  NEW: "new",
  NEEDS_INFORMATION: "needs_information",
  APPROVED: "approved",
  REJECTED: "rejected",
});

const PHASE5_LABELS = Object.freeze({
  [PHASE5_VISIBLE.NEW]: "New",
  [PHASE5_VISIBLE.NEEDS_INFORMATION]: "Needs Information",
  [PHASE5_VISIBLE.APPROVED]: "Approved",
  [PHASE5_VISIBLE.REJECTED]: "Rejected",
});

const PHASE5_TONES = Object.freeze({
  [PHASE5_VISIBLE.NEW]: "warn",
  [PHASE5_VISIBLE.NEEDS_INFORMATION]: "warn",
  [PHASE5_VISIBLE.APPROVED]: "success",
  [PHASE5_VISIBLE.REJECTED]: "danger",
});

/** Primary Phase 5 status filter options (maps to existing query params via applyVisibleStatusQuery). */
const PHASE5_STATUS_FILTERS = Object.freeze([
  { key: "", label: "All statuses" },
  { key: PHASE5_VISIBLE.NEW, label: PHASE5_LABELS[PHASE5_VISIBLE.NEW] },
  {
    key: PHASE5_VISIBLE.NEEDS_INFORMATION,
    label: PHASE5_LABELS[PHASE5_VISIBLE.NEEDS_INFORMATION],
  },
  { key: PHASE5_VISIBLE.APPROVED, label: PHASE5_LABELS[PHASE5_VISIBLE.APPROVED] },
  { key: PHASE5_VISIBLE.REJECTED, label: PHASE5_LABELS[PHASE5_VISIBLE.REJECTED] },
]);

function followUpOf(row) {
  let follow = String(
    (row && (row.follow_up_status || row.followUpStatus)) || ""
  )
    .trim()
    .toLowerCase();
  if (follow === "call_pending") follow = "contact_pending";
  return follow;
}

/**
 * Derive Phase 5 queue badge from canonical status combinations.
 *
 * Mapping (presentation only):
 * - Rejected: application_status in (rejected, cancelled)
 * - Approved: provisioning_status = provisioned, OR application_status = closed with linked org
 * - Needs Information: follow_up_status in (awaiting_customer, needs_help, self_onboarding)
 * - New: all other non-terminal queue states (submitted, duplicate_review, network validation,
 *   ready for approval, provisioning, provisioning_failed, etc.)
 *
 * @param {object|null|undefined} row — list row (camelCase or snake_case)
 * @returns {{ key: string, label: string, tone: string, chipClass: string }}
 */
function presentPhase5QueueStatus(row) {
  const app = String(
    (row && (row.application_status || row.applicationStatus)) || ""
  )
    .trim()
    .toLowerCase();
  const prov = String(
    (row && (row.provisioning_status || row.provisioningStatus)) || ""
  )
    .trim()
    .toLowerCase();
  const follow = followUpOf(row);
  const orgKey =
    row && (row.organization_key || row.organizationKey)
      ? String(row.organization_key || row.organizationKey).trim()
      : "";
  const orgId =
    row && (row.organization_id || row.organizationId)
      ? String(row.organization_id || row.organizationId).trim()
      : "";

  let key = PHASE5_VISIBLE.NEW;

  if (app === "rejected" || app === "cancelled") {
    key = PHASE5_VISIBLE.REJECTED;
  } else if (prov === "provisioned" || (app === "closed" && (orgKey || orgId))) {
    key = PHASE5_VISIBLE.APPROVED;
  } else if (
    follow === "awaiting_customer" ||
    follow === "needs_help" ||
    follow === "self_onboarding"
  ) {
    key = PHASE5_VISIBLE.NEEDS_INFORMATION;
  }

  const tone = PHASE5_TONES[key] || "muted";
  return {
    key,
    label: PHASE5_LABELS[key] || PHASE5_LABELS[PHASE5_VISIBLE.NEW],
    tone,
    chipClass: chipClassForTone(tone),
  };
}

/**
 * Format registration submitted date for Phase 5 queue (e.g. Oct 24, 2024).
 * @param {unknown} raw
 * @returns {string}
 */
function formatRegistrationDate(raw) {
  if (raw == null || raw === "") return "—";
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/**
 * Location line: city, optionally with country.
 * @param {object|null|undefined} row
 * @returns {string}
 */
function formatRegistrationLocation(row) {
  const city = String((row && (row.city || row.City)) || "").trim();
  const country = String((row && (row.country || row.Country)) || "").trim();
  if (city && country) return `${city}, ${country}`;
  return city || country || "—";
}

/**
 * Always use Review → registration detail for Phase 5 queue primary action.
 * @param {object|null|undefined} row
 * @returns {{ label: string, href: string|null }}
 */
function presentPhase5QueueAction(row) {
  const id = row && row.id != null ? String(row.id).trim() : "";
  return {
    label: "Review",
    href: id ? `/admin/registration-applications/${encodeURIComponent(id)}` : null,
  };
}

/**
 * Map Phase 5 visible_status query onto existing list filters.
 * Does not invent repository filters — only sets known query keys.
 * Explicit advanced filters already present on the query win (not overwritten).
 *
 * @param {Record<string, unknown>} query
 * @returns {Record<string, unknown>}
 */
function applyVisibleStatusQuery(query) {
  const src = query && typeof query === "object" ? query : {};
  const out = { ...src };
  const vs = String(out.visible_status || out.visibleStatus || "")
    .trim()
    .toLowerCase();
  delete out.visible_status;
  delete out.visibleStatus;
  if (!vs) return out;

  if (vs === PHASE5_VISIBLE.NEW) {
    // Align with presentPhase5QueueStatus residual “New” (broader than needs_review).
    if (!out.queue) out.queue = "phase5_new";
  } else if (vs === PHASE5_VISIBLE.NEEDS_INFORMATION) {
    if (!out.follow_up_status && !out.followUpStatus) {
      // Sentinel expanded in list repository to awaiting_customer | needs_help | self_onboarding
      out.follow_up_status = "needs_information";
    }
  } else if (vs === PHASE5_VISIBLE.APPROVED) {
    if (!out.queue) out.queue = "provisioned";
  } else if (vs === PHASE5_VISIBLE.REJECTED) {
    if (!out.queue) out.queue = "rejected";
  }
  return out;
}

/**
 * Infer which Phase 5 visible status is selected from current filter locals.
 * @param {object} filters — list service filters object
 * @param {string} [visibleStatusRaw] — raw visible_status from request if preserved
 */
function resolveSelectedVisibleStatus(filters, visibleStatusRaw) {
  const raw = String(visibleStatusRaw || "").trim().toLowerCase();
  if (
    raw === PHASE5_VISIBLE.NEW ||
    raw === PHASE5_VISIBLE.NEEDS_INFORMATION ||
    raw === PHASE5_VISIBLE.APPROVED ||
    raw === PHASE5_VISIBLE.REJECTED
  ) {
    return raw;
  }
  const f = filters && typeof filters === "object" ? filters : {};
  const queue = String(f.queue || "").trim();
  const follow = String(f.followUpStatus || f.follow_up_status || "").trim();
  if (
    follow === "awaiting_customer" ||
    follow === "needs_help" ||
    follow === "self_onboarding" ||
    follow === "needs_information"
  ) {
    return PHASE5_VISIBLE.NEEDS_INFORMATION;
  }
  if (queue === "phase5_new" || queue === "needs_review") return PHASE5_VISIBLE.NEW;
  if (queue === "provisioned") return PHASE5_VISIBLE.APPROVED;
  if (queue === "rejected") return PHASE5_VISIBLE.REJECTED;
  return "";
}

const RISK_RANK = Object.freeze({
  confirmed: 4,
  strong: 3,
  possible: 2,
  none: 1,
});

/**
 * Build Phase 5 duplicate-warning presentation from existing admin loader payload.
 * Advisory only — does not invent matches or mutate review decisions.
 *
 * @param {object|null|undefined} loaded — loadRegistrationDuplicateMatchesForAdmin result
 * @param {string} applicationId
 * @returns {{ show: boolean, match: object|null, listHref: string|null, advisory: boolean }}
 */
function presentPhase5DuplicateWarning(loaded, applicationId) {
  const appId = String(applicationId || "").trim();
  const listHref = appId
    ? `/admin/registration-applications/${encodeURIComponent(appId)}/duplicates`
    : null;
  const empty = {
    show: false,
    match: null,
    listHref,
    advisory: true,
  };
  if (!loaded || loaded.ok !== true || loaded.unavailable || loaded.empty) {
    return empty;
  }
  const matches = Array.isArray(loaded.matches) ? loaded.matches : [];
  if (!matches.length) return empty;

  const ranked = matches.slice().sort((a, b) => {
    const ra = RISK_RANK[String((a && a.riskLevel) || "none")] || 0;
    const rb = RISK_RANK[String((b && b.riskLevel) || "none")] || 0;
    if (rb !== ra) return rb - ra;
    return (Number(b && b.score) || 0) - (Number(a && a.score) || 0);
  });
  const top = ranked[0];
  if (!top) return empty;
  const risk = String(top.riskLevel || "none");
  if (risk === "none") return empty;

  const candidate = top.candidate && typeof top.candidate === "object" ? top.candidate : {};
  const name =
    String(top.candidateLabel || "").trim() ||
    String(candidate.displayName || candidate.churchName || "").trim() ||
    "Existing record";
  const location = String(top.location || "").trim() || null;
  const reason =
    (Array.isArray(top.reasonTags) && top.reasonTags[0]) ||
    (Array.isArray(top.reasons) && top.reasons[0]) ||
    top.riskLabel ||
    "Possible match";
  const stateLabel =
    String(top.organizationStatus || "").trim() ||
    String(candidate.applicationStatus || candidate.status || "").trim() ||
    top.reviewStatus ||
    null;

  let existingHref = null;
  const type = String(top.matchedRecordType || candidate.type || "").toLowerCase();
  const orgKey = candidate.organizationKey != null ? String(candidate.organizationKey).trim() : "";
  if (type === "organization" && orgKey) {
    existingHref = `/admin/organizations/${encodeURIComponent(orgKey)}`;
  } else if (type === "application" && top.matchedRecordId && UUID_RE.test(String(top.matchedRecordId))) {
    existingHref = `/admin/registration-applications/${encodeURIComponent(String(top.matchedRecordId))}`;
  } else if (top.compareHref) {
    existingHref = String(top.compareHref);
  } else if (listHref) {
    existingHref = listHref;
  }

  return {
    show: true,
    match: {
      id: top.id != null ? String(top.id) : "",
      name,
      location,
      reason: String(reason),
      riskLevel: risk,
      riskLabel: top.riskLabel || risk,
      stateLabel: stateLabel ? String(stateLabel).replace(/_/g, " ") : null,
      existingHref,
      compareHref: top.compareHref || null,
      matchedRecordType: type || null,
    },
    listHref,
    advisory: true,
  };
}

/**
 * Phase 5 request-information reason options mapped to canonical request_category codes.
 * Labels follow Prompt 5 / Stitch wording; codes reuse existing allowlist.
 */
const PHASE5_INFO_REQUEST_REASONS = Object.freeze([
  { code: "correct_phone", label: "Confirm phone number" },
  { code: "correct_email", label: "Confirm email address" },
  { code: "confirm_location", label: "Provide church location" },
  { code: "confirm_applicant_authority", label: "Clarify contact person's role" },
  { code: "clarify_church_identity", label: "Clarify church name" },
  { code: "explain_possible_duplicate", label: "Possible duplicate registration" },
  { code: "other", label: "Other" },
]);

/**
 * Phase 5 rejection reasons mapped onto existing REJECTION_CATEGORIES (no new enum/migration).
 */
const PHASE5_REJECT_REASONS = Object.freeze([
  { code: "duplicate_registration", label: "Duplicate church" },
  { code: "contact_not_verified", label: "Invalid contact details" },
  { code: "invalid_or_incomplete_information", label: "Incomplete or unverifiable registration" },
  { code: "unsupported_organization_type", label: "Not a church organization" },
  { code: "fraudulent_or_prohibited_use", label: "Test or spam submission" },
  { code: "other", label: "Other" },
]);

const PHASE5_REASON_LABEL_BY_CODE = Object.freeze(
  [...PHASE5_INFO_REQUEST_REASONS, ...PHASE5_REJECT_REASONS].reduce((acc, row) => {
    acc[row.code] = row.label;
    return acc;
  }, /** @type {Record<string, string>} */ ({}))
);

/**
 * Honest delivery wording for information-request results.
 * Never claims "sent" from status update alone.
 *
 * @param {string|null|undefined} deliveryStatus
 * @param {{ channel?: string|null, attempted?: boolean|null }} [meta]
 * @returns {{ key: string, label: string }}
 */
function presentPhase5InformationDelivery(deliveryStatus, meta) {
  const status = String(deliveryStatus || "")
    .trim()
    .toLowerCase();
  const channel = String((meta && meta.channel) || "")
    .trim()
    .toLowerCase();
  if (status === "sent") {
    if (channel === "email") return { key: "email_sent", label: "Email sent" };
    if (channel === "phone" || channel === "sms") {
      return { key: "sms_sent", label: "SMS sent" };
    }
    return { key: "sent", label: "Delivery recorded as sent" };
  }
  if (status === "failed") {
    return { key: "delivery_failed", label: "Delivery failed" };
  }
  if (status === "queued") {
    return { key: "queued", label: "Delivery queued" };
  }
  if (status === "sending_unavailable") {
    return { key: "unavailable", label: "Delivery status unavailable" };
  }
  if (status === "recorded" || status === "not_applicable") {
    return { key: "recorded", label: "Information request recorded" };
  }
  if (!status) {
    return { key: "unavailable", label: "Delivery status unavailable" };
  }
  return { key: "recorded", label: "Information request recorded" };
}

/**
 * Derive latest information-request + waiting/response state from communications.
 * Applicant response is only true for stored inbound/applicant_response (or applicant_message inbound).
 *
 * @param {object|null|undefined} communications
 * @param {object|null|undefined} application
 * @returns {object}
 */
function presentPhase5NeedsInformationState(communications, application) {
  const items =
    communications && Array.isArray(communications.items) ? communications.items : [];
  const requests = items.filter(
    (row) => row && String(row.communicationType || "") === "information_request"
  );
  const latestRequest = requests.length ? requests[0] : null;
  const requestAt = latestRequest && latestRequest.createdAt ? latestRequest.createdAt : null;
  const requestTs = requestAt ? new Date(requestAt).getTime() : 0;

  let laterResponse = null;
  for (const row of items) {
    if (!row) continue;
    const type = String(row.communicationType || "");
    const direction = String(row.direction || "").toLowerCase();
    const isResponseType =
      type === "applicant_response" ||
      (type === "applicant_message" && direction === "inbound");
    if (!isResponseType) continue;
    const at = row.createdAt ? new Date(row.createdAt).getTime() : 0;
    if (requestTs && at && at < requestTs) continue;
    laterResponse = row;
    break;
  }

  const reasonCodes = [];
  if (latestRequest) {
    if (latestRequest.requestCategory) {
      reasonCodes.push(String(latestRequest.requestCategory));
    }
    const fields = Array.isArray(latestRequest.requestedFields)
      ? latestRequest.requestedFields
      : [];
    for (const code of fields) {
      const c = String(code || "").trim();
      if (c && !reasonCodes.includes(c)) reasonCodes.push(c);
    }
  }
  const reasonLabels = reasonCodes.map(
    (code) => PHASE5_REASON_LABEL_BY_CODE[code] || String(code).replace(/_/g, " ")
  );

  const delivery = presentPhase5InformationDelivery(
    latestRequest && latestRequest.deliveryStatus,
    { channel: latestRequest && latestRequest.channel }
  );

  const reviewEvents =
    application && Array.isArray(application.reviewEvents) ? application.reviewEvents : [];
  let latestEvent = null;
  for (let ei = reviewEvents.length - 1; ei >= 0; ei -= 1) {
    const ev = reviewEvents[ei];
    if (!ev) continue;
    if (String(ev.action || "") === "information_requested") {
      latestEvent = ev;
      break;
    }
  }

  return {
    hasRequest: Boolean(latestRequest),
    latestRequest,
    latestEvent,
    requestedAt: requestAt || (latestEvent && latestEvent.at) || null,
    reasonCodes,
    reasonLabels,
    messageSummary:
      (latestRequest && (latestRequest.applicantMessage || latestRequest.internalNote)) || null,
    recipient: (latestRequest && latestRequest.recipient) || null,
    delivery,
    waiting: Boolean(latestRequest) && !laterResponse,
    hasApplicantResponse: Boolean(laterResponse),
    laterResponse,
    reminderSupported: false,
  };
}

/**
 * Present rejection result facts from the canonical application detail model.
 *
 * @param {object|null|undefined} application
 * @param {object|null|undefined} communications
 * @returns {object}
 */
function presentPhase5RejectionSummary(application, communications) {
  const app = application && typeof application === "object" ? application : {};
  const events = Array.isArray(app.reviewEvents) ? app.reviewEvents : [];
  let rejectEvent = null;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i];
    if (ev && String(ev.action || "") === "reject") {
      rejectEvent = ev;
      break;
    }
  }
  const category =
    (app.rejectionCategory && String(app.rejectionCategory).trim()) ||
    (rejectEvent && rejectEvent.rejection_category
      ? String(rejectEvent.rejection_category).trim()
      : "") ||
    "";
  const categoryLabel =
    PHASE5_REASON_LABEL_BY_CODE[category] ||
    (category ? category.replace(/_/g, " ") : null);
  const deliveryStatus =
    app.rejectionNotificationStatus != null
      ? String(app.rejectionNotificationStatus)
      : null;
  const delivery = presentPhase5InformationDelivery(deliveryStatus, {
    channel: "email",
  });
  let deliveryLabel = "Rejection recorded";
  if (deliveryStatus === "sent") deliveryLabel = "Email sent";
  else if (deliveryStatus === "failed") deliveryLabel = "Delivery failed";
  else if (deliveryStatus === "sending_unavailable" || deliveryStatus === "queued") {
    deliveryLabel = "Delivery unavailable";
  } else if (!deliveryStatus) {
    deliveryLabel = "Rejection recorded";
  }

  const items =
    communications && Array.isArray(communications.items) ? communications.items : [];
  let applicantMessage = null;
  for (const row of items) {
    if (!row) continue;
    if (String(row.communicationType || "") === "rejection_notice") {
      applicantMessage = row.applicantMessage || null;
      break;
    }
  }

  return {
    category: category || null,
    categoryLabel,
    rejectedAt: (rejectEvent && rejectEvent.at) || app.riskDecidedAt || null,
    actorUserId: rejectEvent && rejectEvent.actor_user_id ? String(rejectEvent.actor_user_id) : null,
    internalNote: app.rejectionReason != null ? String(app.rejectionReason) : null,
    applicantMessage,
    deliveryStatus,
    deliveryLabel,
    deliveryKey: delivery.key,
    reapplicationAllowed:
      app.reapplicationAllowed == null ? null : Boolean(app.reapplicationAllowed),
    canReopen:
      String(app.applicationStatus || "") === "rejected" &&
      !app.organizationId &&
      String(app.provisioningStatus || "") !== "provisioned",
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Presentation-only suggested organization key + public path preview for approval confirm.
 * Does not allocate or reserve a key — provisioning still auto-allocates unless overridden.
 * @param {string|null|undefined} churchName
 * @returns {{ key: string|null, publicPath: string|null, publicUrlPreview: string|null }}
 */
function presentSuggestedOrganizationKeyPreview(churchName) {
  try {
    const {
      slugifyOrganizationKey,
      normalizeOrganizationKey,
    } = require("./organizationKey");
    const slug = slugifyOrganizationKey(churchName);
    const norm = normalizeOrganizationKey(slug);
    if (!norm.ok) {
      return { key: null, publicPath: null, publicUrlPreview: null };
    }
    const publicPath = `/c/${norm.key}`;
    return {
      key: norm.key,
      publicPath,
      publicUrlPreview: `https://blessboard.org${publicPath}`,
    };
  } catch {
    return { key: null, publicPath: null, publicUrlPreview: null };
  }
}

module.exports = {
  PHASE5_VISIBLE,
  PHASE5_LABELS,
  PHASE5_TONES,
  PHASE5_STATUS_FILTERS,
  PHASE5_INFO_REQUEST_REASONS,
  PHASE5_REJECT_REASONS,
  PHASE5_REASON_LABEL_BY_CODE,
  presentPhase5QueueStatus,
  formatRegistrationDate,
  formatRegistrationLocation,
  presentPhase5QueueAction,
  applyVisibleStatusQuery,
  resolveSelectedVisibleStatus,
  presentPhase5DuplicateWarning,
  presentPhase5InformationDelivery,
  presentPhase5NeedsInformationState,
  presentPhase5RejectionSummary,
  presentSuggestedOrganizationKeyPreview,
  chipClassForTone,
};
