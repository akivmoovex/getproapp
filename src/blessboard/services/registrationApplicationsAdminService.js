"use strict";

/**
 * Platform-admin registration applications list/detail, follow-up, and risk review actions.
 * Approve calls the canonical provision orchestrator; reject does not provision.
 */

const repo = require("../repositories/platformChurchRegistrationRepository");
const {
  recordAuditEventSafe,
  listOrganizationAuditEvents,
} = require("../../platform/services/auditEventService");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");
const {
  NETWORK_PLAN_CODE,
  validateRequestedOrganizationKey,
  isNetworkPlanSelection,
} = require("./platformChurchRegistrationValidation");
const {
  ALLOWED_PUBLIC_PLAN_CODES,
  planDisplayLabel,
} = require("./registrationPlanMapping");
const {
  provisionRegisteredBlessBoardChurch,
  isProvisioningFailureRetryable,
} = require("./provisionRegisteredBlessBoardChurch");
const {
  RISK_DECISIONS,
  RISK_REASON_CODES,
  filterAllowlistedReasonCodes,
  reasonLabelsForAdmin,
} = require("./registrationRiskDecision");
const {
  QUEUES,
  ACTIONS,
  QUEUE_FILTERS,
  presentRegistrationOperatorView,
  queueFilterSpec,
} = require("./registrationOperatorPresenter");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  LOOKUP_ERROR: "lookup_error",
  NOT_PROVISIONED: "not_provisioned",
  NOT_ELIGIBLE: "not_eligible",
  ALREADY_PROVISIONED: "already_provisioned",
  PROVISION_FAILED: "provision_failed",
});

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const ALLOWED_LIMITS = Object.freeze([10, 25, 50, 100]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TERMINAL_FOLLOW_UP = Object.freeze(["completed", "unreachable", "not_interested"]);

/**
 * Derive Prompt 26 workflow status from the three-axis model (no CRM column).
 * @param {object} row
 */
function deriveWorkflowStatus(row) {
  const app = String(row.application_status || "");
  const prov = String(row.provisioning_status || "");
  let follow = String(row.follow_up_status || "");
  if (follow === "call_pending") follow = "contact_pending";
  if (follow === "needs_help" || follow === "self_onboarding") follow = "awaiting_customer";

  if (app === "rejected") return "rejected";
  if (app === "cancelled") return "closed";
  if (prov === "provisioned") return "approved";
  if (app === "closed") return "closed";
  if (TERMINAL_FOLLOW_UP.includes(String(row.follow_up_status || ""))) return "closed";
  if (follow && repo.WORKFLOW_STATUSES.includes(follow)) return follow;
  if (follow === "contacted") return "contacted";
  if (follow === "qualified") return "qualified";
  if (follow === "approved_for_provision") return "approved_for_provision";
  if (follow === "validation_pending" || follow === "validation_in_progress") return follow;
  if (follow === "awaiting_customer") return "awaiting_customer";
  if (follow === "contact_pending") return "contact_pending";
  if (Boolean(row.support_requested) || String(row.selected_plan || "") === NETWORK_PLAN_CODE) {
    return follow || "validation_pending";
  }
  return follow || "new";
}

/**
 * Deterministic support-queue priority (lower rank = higher priority).
 * @param {object} row
 */
function computeSupportPriority(row) {
  const app = String(row.application_status || "");
  const prov = String(row.provisioning_status || "");
  const follow = String(row.follow_up_status || "");
  const nextAt = row.next_follow_up_at ? new Date(row.next_follow_up_at) : null;
  const overdue =
    nextAt &&
    !Number.isNaN(nextAt.getTime()) &&
    nextAt.getTime() < Date.now() &&
    !["rejected", "cancelled", "closed"].includes(app) &&
    !TERMINAL_FOLLOW_UP.includes(follow);

  if (prov === "provisioning_failed") {
    return { rank: 0, key: "critical", label: "Critical" };
  }
  if (app === "duplicate_review" || overdue) {
    return { rank: 1, key: "high", label: "High" };
  }
  if (
    Boolean(row.support_requested) ||
    [
      "new",
      "call_pending",
      "contact_pending",
      "validation_pending",
      "validation_in_progress",
      "needs_help",
      "awaiting_customer",
    ].includes(follow)
  ) {
    return { rank: 2, key: "medium", label: "Medium" };
  }
  return { rank: 3, key: "normal", label: "Normal" };
}

function sanitizeProvisioningErrorDetail(raw) {
  const s = String(raw || "")
    .replace(/postgresql:\/\/\S+/gi, "[redacted]")
    .replace(/password[^\s]*/gi, "[redacted]")
    .replace(/connection\s+string[^\n]*/gi, "[redacted]")
    .replace(/stack\s*trace[^\n]*/gi, "[redacted]")
    .replace(/\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)\b[\s\S]{0,200}/gi, "[sql redacted]")
    .slice(0, 240);
  return s || null;
}

function needsAttention(row) {
  const app = String(row.application_status || "");
  const prov = String(row.provisioning_status || "");
  const follow = String(row.follow_up_status || "");
  if (Boolean(row.support_requested)) return true;
  if (app === "submitted" || app === "duplicate_review") return true;
  if (prov === "provisioning_failed") return true;
  if (
    follow === "new" ||
    follow === "call_pending" ||
    follow === "contact_pending" ||
    follow === "validation_pending" ||
    follow === "validation_in_progress" ||
    follow === "approved_for_provision" ||
    follow === "needs_help" ||
    follow === "awaiting_customer"
  ) {
    return true;
  }
  return false;
}

function mapListRow(row) {
  if (!row) return null;
  const selectedPlan = row.selected_plan != null ? String(row.selected_plan) : null;
  const priority = computeSupportPriority(row);
  const workflowStatus = deriveWorkflowStatus(row);
  const operator = presentRegistrationOperatorView(row);
  return {
    id: String(row.id),
    churchName: String(row.church_name || ""),
    contactName: String(row.contact_name || ""),
    contactEmail: String(row.contact_email || ""),
    contactPhone: row.contact_phone != null ? String(row.contact_phone) : "",
    contactPhoneNormalized:
      row.contact_phone_normalized != null ? String(row.contact_phone_normalized) : "",
    country: String(row.country || ""),
    city: String(row.city || ""),
    selectedPlan,
    selectedPlanLabel: planDisplayLabel(row.selected_plan) || null,
    isNetworkPlan: selectedPlan === NETWORK_PLAN_CODE,
    supportRequested: Boolean(row.support_requested),
    createdAt: row.created_at,
    applicationStatus: String(row.application_status || ""),
    provisioningStatus: String(row.provisioning_status || ""),
    workflowStatus,
    displayStatus: operator.displayStatus,
    statusExplanation: operator.explanation,
    recommendedAction: operator.recommendedAction,
    recommendedActionLabel: operator.recommendedActionLabel,
    operatorQueue: operator.queue,
    operatorTone: operator.tone,
    organizationHref: operator.organizationHref,
    priorityRank: priority.rank,
    priorityKey: priority.key,
    priorityLabel: priority.label,
    legacyStatus: row.legacy_status != null ? String(row.legacy_status) : null,
    organizationId: row.organization_id != null ? String(row.organization_id) : null,
    organizationKey: row.organization_key != null ? String(row.organization_key) : null,
    organizationDisplayName:
      row.organization_display_name != null ? String(row.organization_display_name) : null,
    organizationStatus: row.organization_status != null ? String(row.organization_status) : null,
    followUpStatus: row.follow_up_status != null ? String(row.follow_up_status) : null,
    assignedSupportUserId: row.assigned_support_user_id
      ? String(row.assigned_support_user_id)
      : null,
    assignedSupportDisplayName:
      row.support_display_name != null ? String(row.support_display_name) : null,
    assignedSupportEmail: row.support_email != null ? String(row.support_email) : null,
    lastContactedAt: row.last_contacted_at || null,
    nextFollowUpAt: row.next_follow_up_at || null,
    firstContactedAt: row.first_contacted_at || null,
    attention: needsAttention(row),
    riskDecision: row.risk_decision != null ? String(row.risk_decision) : null,
    riskReasonCodes: filterAllowlistedReasonCodes(row.risk_reason_codes || []),
    riskReasonLabels: reasonLabelsForAdmin(row.risk_reason_codes || []),
    riskDecidedAt: row.risk_decided_at || null,
    rejectionReason: row.rejection_reason != null ? String(row.rejection_reason) : null,
  };
}

/**
 * @param {object} input
 */
function normalizeListFilters(input) {
  const raw = input && typeof input === "object" ? input : {};
  let page = Number.parseInt(String(raw.page != null ? raw.page : "1"), 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (page > 10000) page = 10000;

  let limit = Number.parseInt(String(raw.limit != null ? raw.limit : String(DEFAULT_LIMIT)), 10);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) {
    limit = MAX_LIMIT;
  } else if (!ALLOWED_LIMITS.includes(limit)) {
    let best = ALLOWED_LIMITS[0];
    let bestDist = Math.abs(limit - best);
    for (const allowed of ALLOWED_LIMITS) {
      const dist = Math.abs(limit - allowed);
      if (dist < bestDist) {
        best = allowed;
        bestDist = dist;
      }
    }
    limit = best;
  }

  const applicationStatus = String(raw.application_status || raw.applicationStatus || "")
    .trim()
    .toLowerCase();
  const provisioningStatus = String(raw.provisioning_status || raw.provisioningStatus || "")
    .trim()
    .toLowerCase();
  const followUpStatus = String(raw.follow_up_status || raw.followUpStatus || "")
    .trim()
    .toLowerCase();
  let linked = String(raw.linked || "all")
    .trim()
    .toLowerCase();
  if (!repo.LINKED_FILTERS.includes(linked)) linked = "all";

  const selectedPlanRaw = String(raw.selected_plan || raw.selectedPlan || raw.plan || "")
    .trim()
    .toLowerCase();
  const selectedPlan = ALLOWED_PUBLIC_PLAN_CODES.includes(selectedPlanRaw)
    ? selectedPlanRaw
    : null;

  let supportRequested = null;
  const supportRaw = String(raw.support_requested || raw.supportRequested || "")
    .trim()
    .toLowerCase();
  if (supportRaw) {
    if (supportRaw === "true" || supportRaw === "1" || supportRaw === "yes") {
      supportRequested = true;
    } else if (supportRaw === "false" || supportRaw === "0" || supportRaw === "no") {
      supportRequested = false;
    } else {
      return { ok: false, reason: "support_requested" };
    }
  }

  let requiresReview = null;
  const reviewRaw = String(raw.requires_review || raw.requiresReview || "")
    .trim()
    .toLowerCase();
  if (reviewRaw) {
    if (reviewRaw === "true" || reviewRaw === "1" || reviewRaw === "yes") {
      requiresReview = true;
    } else if (reviewRaw === "false" || reviewRaw === "0" || reviewRaw === "no") {
      requiresReview = false;
    } else {
      return { ok: false, reason: "requires_review" };
    }
  }

  let overdueFollowUp = null;
  const overdueRaw = String(
    raw.overdue_follow_up || raw.overdueFollowUp || raw.overdue || ""
  )
    .trim()
    .toLowerCase();
  if (overdueRaw) {
    if (overdueRaw === "true" || overdueRaw === "1" || overdueRaw === "yes") {
      overdueFollowUp = true;
    } else if (overdueRaw === "false" || overdueRaw === "0" || overdueRaw === "no") {
      overdueFollowUp = false;
    } else {
      return { ok: false, reason: "overdue_follow_up" };
    }
  }

  const queue = queueFilterSpec(raw.queue || raw.operator_queue || "");
  if ((raw.queue || raw.operator_queue) && !queue) {
    return { ok: false, reason: "queue" };
  }

  let search = null;
  if (raw.q != null && String(raw.q).trim() !== "") {
    search = String(raw.q).trim().slice(0, 120).toLowerCase();
  }

  let createdFrom = null;
  let createdToExclusive = null;
  const fromRaw = String(raw.from || raw.created_from || "").trim();
  const toRaw = String(raw.to || raw.created_to || "").trim();
  if (fromRaw) {
    if (!DATE_RE.test(fromRaw)) {
      return { ok: false, reason: "from" };
    }
    createdFrom = `${fromRaw}T00:00:00.000Z`;
  }
  if (toRaw) {
    if (!DATE_RE.test(toRaw)) {
      return { ok: false, reason: "to" };
    }
    const d = new Date(`${toRaw}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return { ok: false, reason: "to" };
    d.setUTCDate(d.getUTCDate() + 1);
    createdToExclusive = d.toISOString();
  }

  return {
    ok: true,
    value: {
      page,
      limit,
      offset: (page - 1) * limit,
      applicationStatus: repo.APPLICATION_STATUSES.includes(applicationStatus)
        ? applicationStatus
        : null,
      provisioningStatus: repo.PROVISIONING_STATUSES.includes(provisioningStatus)
        ? provisioningStatus
        : null,
      followUpStatus: (() => {
        const rawFollow = followUpStatus;
        if (!rawFollow) return null;
        if (rawFollow === "contact_pending" || rawFollow === "call_pending") {
          return "contact_pending";
        }
        return repo.FOLLOW_UP_STATUSES.includes(rawFollow) ? rawFollow : null;
      })(),
      selectedPlan,
      supportRequested,
      requiresReview: requiresReview === true ? true : null,
      overdueFollowUp: overdueFollowUp === true ? true : null,
      queue,
      linked,
      search,
      createdFrom,
      createdToExclusive,
      sort: "created_desc",
    },
  };
}

/**
 * @param {{ query: Function }} db
 * @param {object} input
 */
async function listRegistrationApplicationsAdmin(db, input) {
  const normalized = normalizeListFilters(input);
  if (!normalized.ok) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      message: `invalid_input:${normalized.reason}`,
      applications: [],
      page: 1,
      limit: DEFAULT_LIMIT,
      total: 0,
      totalPages: 0,
      filters: {},
    };
  }
  if (!db || typeof db.query !== "function") {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      message: "database required",
      applications: [],
      page: 1,
      limit: DEFAULT_LIMIT,
      total: 0,
      totalPages: 0,
      filters: {},
    };
  }

  try {
    const filters = normalized.value;
    const [rows, total] = await Promise.all([
      repo.listRegistrationApplications(db, filters),
      repo.countRegistrationApplications(db, filters),
    ]);
    const totalPages = total === 0 ? 0 : Math.ceil(total / filters.limit);
    return {
      ok: true,
      status: STATUS.OK,
      applications: (rows || []).map(mapListRow).filter(Boolean),
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages,
      filters: {
        applicationStatus: filters.applicationStatus || "",
        provisioningStatus: filters.provisioningStatus || "",
        followUpStatus: filters.followUpStatus || "",
        selectedPlan: filters.selectedPlan || "",
        supportRequested:
          filters.supportRequested === true
            ? "true"
            : filters.supportRequested === false
              ? "false"
              : "",
        requiresReview: filters.requiresReview === true ? "true" : "",
        overdueFollowUp: filters.overdueFollowUp === true ? "true" : "",
        queue: filters.queue || "",
        linked: filters.linked,
        q: filters.search || "",
        from: input && (input.from || input.created_from) ? String(input.from || input.created_from) : "",
        to: input && (input.to || input.created_to) ? String(input.to || input.created_to) : "",
      },
      queueFilters: QUEUE_FILTERS,
    };
  } catch {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      message: "lookup_error",
      applications: [],
      page: 1,
      limit: DEFAULT_LIMIT,
      total: 0,
      totalPages: 0,
      filters: {},
    };
  }
}

/**
 * @param {{ query: Function }} db
 * @param {string} applicationId
 * @param {NodeJS.ProcessEnv} [env]
 */
async function getRegistrationApplicationDetail(db, applicationId, env) {
  const id = String(applicationId || "").trim();
  if (!UUID_RE.test(id)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input" };
  }
  if (!db || typeof db.query !== "function") {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "database required" };
  }

  try {
    const row = await repo.getRegistrationApplicationById(db, id);
    if (!row) {
      return { ok: false, status: STATUS.NOT_FOUND, message: "not_found" };
    }

    const listMapped = mapListRow(row);
    const organizationId = row.organization_id ? String(row.organization_id) : null;
    let planKey = null;
    let subscriptionStatus = null;
    let subscriptionStartsAt = null;
    let subscriptionEndsAt = null;
    let publication = { draftPages: 0, publishedPages: 0 };
    let contacts = [];
    let auditEvents = [];
    let platformAdmins = [];

    const applicationSupportContact =
      Boolean(row.support_requested) || String(row.selected_plan || "") === NETWORK_PLAN_CODE;
    const supportOpsAvailable = Boolean(organizationId) || applicationSupportContact;

    platformAdmins = (
      (await repo.listActivePlatformAdministrators(db)) || []
    ).map((u) => ({
      id: String(u.id),
      displayName: String(u.display_name || ""),
      email: String(u.email_normalized || ""),
    }));

    if (organizationId) {
      const [subSummary, pub, contactRows] = await Promise.all([
        repo.getOrganizationCurrentSubscriptionSummary(db, organizationId),
        repo.getOrganizationPublicationSummary(db, organizationId),
        repo.listOrganizationSupportContacts(db, organizationId, { limit: 50 }),
      ]);
      if (subSummary) {
        planKey = subSummary.planKey;
        subscriptionStatus = subSummary.subscriptionStatus;
        subscriptionStartsAt = subSummary.startsAt;
        subscriptionEndsAt = subSummary.endsAt;
      }
      publication = pub;
      contacts = (contactRows || []).map((c) => ({
        id: String(c.id),
        contactMethod: String(c.contact_method),
        outcome: String(c.outcome),
        note: String(c.note || ""),
        contactedAt: c.contacted_at,
        nextFollowUpAt: c.next_follow_up_at,
        createdAt: c.created_at,
        createdByDisplayName: c.created_by_display_name != null ? String(c.created_by_display_name) : "",
        createdByEmail: c.created_by_email != null ? String(c.created_by_email) : "",
      }));

      const audit = await listOrganizationAuditEvents(db, {
        organizationId,
        actionCategory: "registration",
        limit: 20,
      });
      if (audit.ok) {
        auditEvents = (audit.events || []).map((e) => ({
          actionKey: e.actionKey,
          outcome: e.outcome,
          createdAt: e.createdAt,
          entityType: e.entityType,
          metadata: e.metadataJson || {},
        }));
      }
    } else if (supportOpsAvailable) {
      const contactRows = await repo.listApplicationSupportContacts(db, id, { limit: 50 });
      contacts = (contactRows || []).map((c) => ({
        id: String(c.id),
        contactMethod: String(c.contact_method),
        outcome: String(c.outcome),
        note: String(c.note || ""),
        contactedAt: c.contacted_at,
        nextFollowUpAt: c.next_follow_up_at,
        createdAt: c.created_at,
        createdByDisplayName: c.created_by_display_name != null ? String(c.created_by_display_name) : "",
        createdByEmail: c.created_by_email != null ? String(c.created_by_email) : "",
      }));
    }

    const reviewEvents = Array.isArray(row.review_events) ? row.review_events : [];
    const reviewAudit = reviewEvents
      .filter((e) => e && typeof e === "object")
      .map((e) => ({
        actionKey: `registration.${String(e.action || "event")}`,
        outcome: "success",
        createdAt: e.at || null,
        entityType: "registration_application",
        metadata: {
          reason_codes: e.reason_codes || undefined,
          note_len: e.note_len != null ? e.note_len : undefined,
          from_status: e.from_status || undefined,
          to_status: e.to_status || undefined,
          status: e.status || undefined,
        },
      }));
    // Application review_events are the durable trail for unprovisioned ops; merge when org audits exist.
    auditEvents = [...reviewAudit, ...auditEvents]
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      })
      .slice(0, 40);

    const errorCode = row.provisioning_error_code
      ? String(row.provisioning_error_code).slice(0, 120)
      : null;
    const errorSummary = sanitizeProvisioningErrorDetail(row.provisioning_error_detail);
    const provisioningFailed = String(row.provisioning_status) === "provisioning_failed";
    const retryAllowed =
      provisioningFailed &&
      !isNetworkPlanSelection(row.selected_plan) &&
      isProvisioningFailureRetryable(errorCode);

    return {
      ok: true,
      status: STATUS.OK,
      application: {
        ...listMapped,
        roleInChurch: row.role_in_church != null ? String(row.role_in_church) : null,
        branchName: row.branch_name != null ? String(row.branch_name) : null,
        branchCount: row.branch_count != null ? String(row.branch_count) : null,
        message: row.registration_message != null ? String(row.registration_message) : null,
        consentTerms: Boolean(row.consent_terms),
        provisioningStartedAt: row.provisioning_started_at,
        provisionedAt: row.provisioned_at,
        provisioningFailedAt: row.provisioning_failed_at,
        provisioningErrorCode: errorCode,
        provisioningErrorSummary: errorSummary,
        provisioningFailureCategory: errorCode || (provisioningFailed ? "provisioning_failed" : null),
        retryAllowed,
        retryAllowedNote: provisioningFailed
          ? retryAllowed
            ? "Retry uses the same idempotent provisioning orchestrator. Permanent validation conflicts require correction or rejection."
            : "This failure is not retryable from this screen. Correct the underlying conflict or reject the application."
          : null,
        onboardingStatus: row.onboarding_status != null ? String(row.onboarding_status) : null,
        supportRequested: Boolean(row.support_requested),
        firstContactedAt: listMapped.firstContactedAt,
        nextFollowUpAt: listMapped.nextFollowUpAt,
        lastContactedAt: listMapped.lastContactedAt,
        onboardingCompletedAt: row.onboarding_completed_at,
        lastActivityAt: row.last_activity_at,
        organizationCreatedAt: row.organization_created_at,
        assignedSupportUserId: listMapped.assignedSupportUserId,
        planKey,
        planKeyLabel: planKey ? planDisplayLabel(planKey) : null,
        subscriptionStatus,
        subscriptionStartsAt,
        subscriptionEndsAt,
        publication,
        followUpAvailable: supportOpsAvailable,
        supportAssignmentAvailable: supportOpsAvailable,
        contactHistoryAvailable: supportOpsAvailable,
        linkOrganizationAvailable:
          !organizationId &&
          String(row.provisioning_status || "") !== "provisioned" &&
          !["rejected", "cancelled"].includes(String(row.application_status || "")),
        riskReviewActionsAvailable:
          !organizationId &&
          String(row.provisioning_status || "") !== "provisioned" &&
          String(row.provisioning_status || "") !== "provisioning_failed" &&
          ["submitted", "duplicate_review"].includes(String(row.application_status || "")) &&
          !isNetworkPlanSelection(row.selected_plan),
        networkApproveAvailable:
          !organizationId &&
          isNetworkPlanSelection(row.selected_plan) &&
          String(row.provisioning_status || "") !== "provisioned" &&
          ["approved_for_provision", "qualified"].includes(
            String(row.follow_up_status || "")
          ) &&
          !["rejected", "cancelled"].includes(String(row.application_status || "")),
        markValidationCompleteAvailable:
          !organizationId &&
          isNetworkPlanSelection(row.selected_plan) &&
          String(row.provisioning_status || "") !== "provisioned" &&
          !["approved_for_provision", "qualified"].includes(
            String(row.follow_up_status || "")
          ) &&
          !["rejected", "cancelled", "closed"].includes(String(row.application_status || "")),
        retryProvisionAvailable: retryAllowed,
        rejectActionsAvailable:
          !organizationId &&
          String(row.provisioning_status || "") !== "provisioned" &&
          ["submitted", "duplicate_review"].includes(String(row.application_status || "")),
        reviewEvents,
        operatorView: presentRegistrationOperatorView({
          ...row,
          selectedPlan: row.selected_plan,
          applicationStatus: row.application_status,
          provisioningStatus: row.provisioning_status,
          followUpStatus: row.follow_up_status,
          organizationKey: row.organization_key,
          supportRequested: row.support_requested,
          subscriptionStatus,
        }),
      },
      contacts,
      auditEvents,
      platformAdmins,
      followUpStatuses: repo.FOLLOW_UP_STATUSES,
      contactMethods: repo.CONTACT_METHODS,
      contactOutcomes: repo.CONTACT_OUTCOMES,
      deploymentCode: (() => {
        const d = getPlatformDeploymentCode(env || process.env);
        return d && d.ok ? d.code : "blessboard-org-v5";
      })(),
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "lookup_error" };
  }
}

async function withOwnedClient(db, fn) {
  let client = null;
  let owned = false;
  try {
    if (db && typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }
    return await fn(client);
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   applicationId: string,
 *   followUpStatus: string,
 *   actorUserId: string,
 *   deploymentCode?: string,
 * }} input
 */
async function updateRegistrationFollowUpStatus(db, input) {
  const applicationId = String((input && input.applicationId) || "").trim();
  const followUpStatus = String((input && input.followUpStatus) || "")
    .trim()
    .toLowerCase();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!UUID_RE.test(applicationId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input" };
  }
  if (!repo.FOLLOW_UP_STATUSES.includes(followUpStatus)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_follow_up_status" };
  }

  try {
    return await withOwnedClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const app = await repo.lockApplicationById(client, applicationId);
        if (!app) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, message: "not_found" };
        }

        const provisioned =
          Boolean(app.organization_id) && String(app.provisioning_status) === "provisioned";
        const applicationSupportContact =
          Boolean(app.support_requested) || String(app.selected_plan || "") === NETWORK_PLAN_CODE;

        if (!provisioned && applicationSupportContact) {
          const fromStatus = app.follow_up_status != null ? String(app.follow_up_status) : null;
          await repo.updateApplicationSupportFollowUp(client, applicationId, {
            followUpStatus,
            supportRequested: true,
            reviewEvent: {
              at: new Date().toISOString(),
              action: "follow_up_status_updated",
              actor_user_id: actorUserId,
              from_status: fromStatus || undefined,
              to_status: followUpStatus,
            },
          });
          await client.query("COMMIT");
          return { ok: true, status: STATUS.OK, followUpStatus, fromStatus, scope: "application" };
        }

        if (!provisioned) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.NOT_PROVISIONED,
            message: "follow_up_requires_provisioned_organization",
          };
        }
        const organizationId = String(app.organization_id);
        let onboarding = await repo.ensureOrganizationOnboardingRow(client, {
          organizationId,
          applicationId,
        });
        const fromStatus = onboarding ? String(onboarding.follow_up_status || "") : null;
        onboarding = await repo.updateOrganizationOnboarding(client, organizationId, {
          followUpStatus,
          lastActivityAt: new Date().toISOString(),
        });
        await recordAuditEventSafe(client, {
          deploymentCode: input.deploymentCode || "blessboard-org-v5",
          organizationId,
          actorUserId,
          outcome: "success",
          actionKey: "registration.follow_up_status_updated",
          entityType: "organization_onboarding",
          entityId: organizationId,
          metadata: {
            category: "registration",
            from_status: fromStatus || undefined,
            to_status: followUpStatus,
            actor_type: "platform_admin",
            source: "admin_registration_applications",
          },
        });
        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, followUpStatus, fromStatus, scope: "organization" };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "lookup_error" };
  }
}

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   applicationId: string,
 *   supportUserId: string|null,
 *   actorUserId: string,
 *   deploymentCode?: string,
 * }} input
 */
async function assignRegistrationSupport(db, input) {
  const applicationId = String((input && input.applicationId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const rawSupport =
    input && input.supportUserId != null && String(input.supportUserId).trim() !== ""
      ? String(input.supportUserId).trim()
      : null;
  if (!UUID_RE.test(applicationId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input" };
  }
  if (rawSupport && !UUID_RE.test(rawSupport)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_support_user" };
  }

  try {
    return await withOwnedClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const app = await repo.lockApplicationById(client, applicationId);
        if (!app) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, message: "not_found" };
        }

        const provisioned =
          Boolean(app.organization_id) && String(app.provisioning_status) === "provisioned";
        const applicationSupportContact =
          Boolean(app.support_requested) || String(app.selected_plan || "") === NETWORK_PLAN_CODE;

        if (rawSupport) {
          const admins = await repo.listActivePlatformAdministrators(client);
          const allowed = admins.some((u) => String(u.id) === rawSupport);
          if (!allowed) {
            await client.query("ROLLBACK");
            return { ok: false, status: STATUS.FORBIDDEN, message: "not_platform_admin" };
          }
        }

        if (!provisioned && applicationSupportContact) {
          await repo.updateApplicationSupportFollowUp(client, applicationId, {
            assignedSupportUserId: rawSupport,
            clearAssignedSupport: !rawSupport,
            supportRequested: true,
            reviewEvent: {
              at: new Date().toISOString(),
              action: "support_assigned",
              actor_user_id: actorUserId,
              status: rawSupport ? "assigned" : "unassigned",
            },
          });
          await client.query("COMMIT");
          return { ok: true, status: STATUS.OK, supportUserId: rawSupport, scope: "application" };
        }

        if (!provisioned) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.NOT_PROVISIONED,
            message: "assignment_requires_provisioned_organization",
          };
        }
        const organizationId = String(app.organization_id);
        await repo.ensureOrganizationOnboardingRow(client, {
          organizationId,
          applicationId,
        });

        await repo.updateOrganizationOnboarding(client, organizationId, {
          assignedSupportUserId: rawSupport,
          clearAssignedSupport: !rawSupport,
          lastActivityAt: new Date().toISOString(),
        });

        await recordAuditEventSafe(client, {
          deploymentCode: input.deploymentCode || "blessboard-org-v5",
          organizationId,
          actorUserId,
          outcome: "success",
          actionKey: "registration.support_assigned",
          entityType: "organization_onboarding",
          entityId: organizationId,
          metadata: {
            category: "registration",
            status: rawSupport ? "assigned" : "unassigned",
            actor_type: "platform_admin",
            source: "admin_registration_applications",
          },
        });
        await repo.updateApplicationSupportFollowUp(client, applicationId, {
          reviewEvent: {
            at: new Date().toISOString(),
            action: "support_assigned",
            actor_user_id: actorUserId,
            status: rawSupport ? "assigned" : "unassigned",
          },
        });
        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, supportUserId: rawSupport, scope: "organization" };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "lookup_error" };
  }
}

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   applicationId: string,
 *   actorUserId: string,
 *   contactMethod: string,
 *   outcome: string,
 *   note: string,
 *   followUpStatus?: string|null,
 *   nextFollowUpAt?: string|null,
 *   deploymentCode?: string,
 * }} input
 */
async function addRegistrationSupportContact(db, input) {
  const applicationId = String((input && input.applicationId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const contactMethod = String((input && input.contactMethod) || "")
    .trim()
    .toLowerCase();
  const outcome = String((input && input.outcome) || "")
    .trim()
    .toLowerCase();
  const note = String((input && input.note) || "").trim();
  if (!UUID_RE.test(applicationId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input" };
  }
  if (!repo.CONTACT_METHODS.includes(contactMethod)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_contact_method" };
  }
  if (!repo.CONTACT_OUTCOMES.includes(outcome)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_outcome" };
  }
  if (note.length < 1 || note.length > 2000) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_note" };
  }

  let nextFollowUpAt = null;
  if (input.nextFollowUpAt != null && String(input.nextFollowUpAt).trim() !== "") {
    const raw = String(input.nextFollowUpAt).trim();
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) {
      return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_next_follow_up" };
    }
    nextFollowUpAt = d.toISOString();
  }

  let followUpStatus = null;
  if (input.followUpStatus != null && String(input.followUpStatus).trim() !== "") {
    followUpStatus = String(input.followUpStatus).trim().toLowerCase();
    if (!repo.FOLLOW_UP_STATUSES.includes(followUpStatus)) {
      return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_follow_up_status" };
    }
  }

  try {
    return await withOwnedClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const app = await repo.lockApplicationById(client, applicationId);
        if (!app) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, message: "not_found" };
        }

        const provisioned =
          Boolean(app.organization_id) && String(app.provisioning_status) === "provisioned";
        const applicationSupportContact =
          Boolean(app.support_requested) || String(app.selected_plan || "") === NETWORK_PLAN_CODE;
        const nowIso = new Date().toISOString();

        if (!provisioned && applicationSupportContact) {
          const contact = await repo.createOrganizationSupportContact(client, {
            organizationId: null,
            registrationApplicationId: applicationId,
            createdByUserId: actorUserId,
            contactMethod,
            outcome,
            note,
            contactedAt: null,
            nextFollowUpAt,
          });
          const appPatch = {
            supportRequested: true,
            lastContactedAt: nowIso,
            reviewEvent: {
              at: nowIso,
              action: "support_contact_added",
              actor_user_id: actorUserId,
              status: outcome,
              reason_codes: [contactMethod],
              note_len: note.length,
            },
          };
          if (followUpStatus) appPatch.followUpStatus = followUpStatus;
          if (!app.first_contacted_at) appPatch.firstContactedAt = nowIso;
          if (Object.prototype.hasOwnProperty.call(input || {}, "nextFollowUpAt")) {
            appPatch.nextFollowUpAt = nextFollowUpAt;
          }
          await repo.updateApplicationSupportFollowUp(client, applicationId, appPatch);
          await client.query("COMMIT");
          return {
            ok: true,
            status: STATUS.OK,
            contactId: String(contact.id),
            scope: "application",
          };
        }

        if (!app.organization_id) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.NOT_PROVISIONED,
            message: "contact_requires_linked_organization",
          };
        }
        const organizationId = String(app.organization_id);
        const onboarding = await repo.ensureOrganizationOnboardingRow(client, {
          organizationId,
          applicationId,
        });
        const contact = await repo.createOrganizationSupportContact(client, {
          organizationId,
          registrationApplicationId: applicationId,
          createdByUserId: actorUserId,
          contactMethod,
          outcome,
          note,
          contactedAt: null,
          nextFollowUpAt,
        });

        const firstContactedAt =
          onboarding && onboarding.first_contacted_at ? null : nowIso;
        await repo.updateOrganizationOnboarding(client, organizationId, {
          followUpStatus: followUpStatus || undefined,
          firstContactedAt,
          lastContactedAt: nowIso,
          nextFollowUpAt,
          lastActivityAt: nowIso,
        });

        await recordAuditEventSafe(client, {
          deploymentCode: input.deploymentCode || "blessboard-org-v5",
          organizationId,
          actorUserId,
          outcome: "success",
          actionKey: "registration.support_contact_added",
          entityType: "organization_support_contact",
          entityId: contact.id,
          metadata: {
            category: "registration",
            reason_code: contactMethod,
            status: outcome,
            actor_type: "platform_admin",
            source: "admin_registration_applications",
            // note intentionally omitted
          },
        });
        await repo.updateApplicationSupportFollowUp(client, applicationId, {
          reviewEvent: {
            at: nowIso,
            action: "support_contact_added",
            actor_user_id: actorUserId,
            status: outcome,
            reason_codes: [contactMethod],
            note_len: note.length,
          },
        });
        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, contactId: String(contact.id), scope: "organization" };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "lookup_error" };
  }
}

/**
 * Reject an unprovisioned registration application (no tenant created).
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   applicationId: string,
 *   actorUserId: string,
 *   reason: string,
 *   deploymentCode?: string,
 * }} input
 */
async function rejectRegistrationApplication(db, input) {
  const applicationId = String((input && input.applicationId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const reason = String((input && input.reason) || "")
    .trim()
    .slice(0, 500);
  if (!UUID_RE.test(applicationId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input" };
  }
  if (!reason || reason.length < 3) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "rejection_reason_required" };
  }

  try {
    return await withOwnedClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const app = await repo.lockApplicationById(client, applicationId);
        if (!app) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, message: "not_found" };
        }
        if (app.organization_id || String(app.provisioning_status) === "provisioned") {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.NOT_ELIGIBLE,
            message: "already_provisioned",
          };
        }
        const appStatus = String(app.application_status || "");
        if (appStatus === "rejected") {
          await client.query("COMMIT");
          return { ok: true, status: STATUS.OK, alreadyRejected: true };
        }
        if (!["submitted", "duplicate_review"].includes(appStatus)) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_ELIGIBLE, message: "not_eligible" };
        }

        const priorCodes = filterAllowlistedReasonCodes(app.risk_reason_codes || []);
        const reasonCodes = filterAllowlistedReasonCodes([
          ...priorCodes,
          RISK_REASON_CODES.ADMIN_REJECTED,
        ]);
        const nowIso = new Date().toISOString();
        await repo.updateApplicationRiskReviewState(client, applicationId, {
          applicationStatus: "rejected",
          riskDecision: RISK_DECISIONS.REJECT,
          riskReasonCodes: reasonCodes,
          riskDecidedAt: nowIso,
          rejectionReason: reason,
          reviewEvent: {
            at: nowIso,
            action: "reject",
            actor_user_id: actorUserId,
            reason_codes: reasonCodes,
            note_len: reason.length,
          },
        });
        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, alreadyRejected: false };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "lookup_error" };
  }
}

/**
 * Approve a held Foundation/Growth (or validated Network) application and provision
 * via the canonical orchestrator using an administrator invitation (no password entry).
 * Idempotent when already provisioned.
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   applicationId: string,
 *   actorUserId: string,
 *   organizationKey?: string|null,
 *   deploymentCode?: string,
 *   dataEnvironment?: string,
 *   provisionFn?: Function,
 * }} input
 */
async function approveAndProvisionRegistrationApplication(db, input) {
  const applicationId = String((input && input.applicationId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!UUID_RE.test(applicationId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input" };
  }

  let organizationKey = null;
  if (input && input.organizationKey != null && String(input.organizationKey).trim() !== "") {
    const keyResult = validateRequestedOrganizationKey(input.organizationKey);
    if (!keyResult.ok) {
      return {
        ok: false,
        status: STATUS.INVALID_INPUT,
        message: keyResult.field || "invalid_organization_key",
      };
    }
    organizationKey = keyResult.value;
  }

  const deploymentCode = (input && input.deploymentCode) || "blessboard-org-v5";
  const dataEnvironment = (input && input.dataEnvironment) || "testing";
  const provisionFn = (input && input.provisionFn) || provisionRegisteredBlessBoardChurch;

  let appSnapshot = null;
  try {
    const prepared = await withOwnedClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const app = await repo.lockApplicationById(client, applicationId);
        if (!app) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, message: "not_found" };
        }
        if (
          String(app.provisioning_status) === "provisioned" &&
          app.organization_id
        ) {
          await client.query("COMMIT");
          return {
            ok: true,
            status: STATUS.ALREADY_PROVISIONED,
            alreadyProvisioned: true,
            organizationId: String(app.organization_id),
            organizationKey: app.organization_key != null ? String(app.organization_key) : null,
          };
        }
        if (!String(app.contact_email || "").trim()) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.INVALID_INPUT,
            message: "administrator_email_required",
          };
        }
        if (isNetworkPlanSelection(app.selected_plan)) {
          const follow = String(app.follow_up_status || "");
          if (follow !== "approved_for_provision" && follow !== "qualified") {
            await client.query("ROLLBACK");
            return {
              ok: false,
              status: STATUS.NOT_ELIGIBLE,
              message: "network_validation_required",
            };
          }
          const netAppStatus = String(app.application_status || "");
          if (netAppStatus === "rejected" || netAppStatus === "cancelled") {
            await client.query("ROLLBACK");
            return { ok: false, status: STATUS.NOT_ELIGIBLE, message: "not_eligible" };
          }
        } else {
          const appStatus = String(app.application_status || "");
          if (appStatus === "rejected" || appStatus === "cancelled" || appStatus === "closed") {
            await client.query("ROLLBACK");
            return { ok: false, status: STATUS.NOT_ELIGIBLE, message: "not_eligible" };
          }
          if (!["submitted", "duplicate_review"].includes(appStatus)) {
            await client.query("ROLLBACK");
            return { ok: false, status: STATUS.NOT_ELIGIBLE, message: "not_eligible" };
          }
        }
        const provStatus = String(app.provisioning_status || "");
        if (provStatus === "provisioning_failed") {
          if (
            isNetworkPlanSelection(app.selected_plan) ||
            !isProvisioningFailureRetryable(app.provisioning_error_code)
          ) {
            await client.query("ROLLBACK");
            return { ok: false, status: STATUS.NOT_ELIGIBLE, message: "retry_not_allowed" };
          }
        }

        const nowIso = new Date().toISOString();
        const isNetwork = isNetworkPlanSelection(app.selected_plan);
        await repo.updateApplicationRiskReviewState(client, applicationId, {
          applicationStatus: "submitted",
          clearRejectionReason: true,
          reviewEvent: {
            at: nowIso,
            action: isNetwork
              ? "approve_network_organization"
              : provStatus === "provisioning_failed"
                ? "retry_provision"
                : "approve_provision",
            actor_user_id: actorUserId,
            reason_codes: filterAllowlistedReasonCodes(app.risk_reason_codes || []),
          },
        });
        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, application: app, networkShell: isNetwork };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });

    if (!prepared.ok) return prepared;
    if (prepared.alreadyProvisioned) {
      return {
        ok: true,
        status: STATUS.OK,
        alreadyProvisioned: true,
        organizationId: prepared.organizationId,
        organizationKey: prepared.organizationKey || null,
      };
    }
    appSnapshot = prepared.application;

    const provision = await provisionFn(
      db,
      {
        applicationId,
        requestedOrganizationKey: organizationKey || undefined,
        actorContext: {
          type: "platform_admin",
          source: "admin_registration_applications",
          actorUserId,
          dataEnvironment,
          deploymentCode,
        },
      },
      {
        allowRetry: true,
        networkOrganizationShell: Boolean(prepared.networkShell),
        administratorViaInvitation: true,
      }
    );

    if (provision.ok) {
      const organizationId =
        (provision.records && provision.records.organizationId) ||
        null;
      const orgKey =
        (provision.records && provision.records.organizationKey) || null;
      if (organizationId) {
        await recordAuditEventSafe(db, {
          deploymentCode,
          organizationId,
          actorUserId,
          outcome: "success",
          actionKey: prepared.networkShell
            ? "registration.network_organization_created"
            : "registration.application_approved",
          entityType: "registration_application",
          entityId: applicationId,
          metadata: {
            category: "registration",
            actor_type: "platform_admin",
            source: "admin_registration_applications",
            network_shell: Boolean(prepared.networkShell),
            network_activation_required: Boolean(prepared.networkShell),
            reason_codes: filterAllowlistedReasonCodes(
              (appSnapshot && appSnapshot.risk_reason_codes) || []
            ),
            status: provision.alreadyProvisioned ? "already_provisioned" : "provisioned",
          },
        });
      }
      return {
        ok: true,
        status: STATUS.OK,
        alreadyProvisioned: Boolean(provision.alreadyProvisioned),
        networkOrganizationCreated: Boolean(prepared.networkShell),
        records: provision.records || null,
        organizationId,
        organizationKey: orgKey,
        invitation:
          provision.records && provision.records.invitationId
            ? {
                id: provision.records.invitationId,
                rawToken: provision.records.invitationRawToken || null,
                delivery: "copy_once",
              }
            : null,
      };
    }

    if (provision.status === "duplicate_email_review") {
      return {
        ok: false,
        status: STATUS.NOT_ELIGIBLE,
        message: "duplicate_email_review",
        provisionStatus: provision.status,
      };
    }
    if (String(provision.message || "").includes("administratorEmail")) {
      return {
        ok: false,
        status: STATUS.INVALID_INPUT,
        message: "administrator_email_required",
      };
    }
    return {
      ok: false,
      status: STATUS.PROVISION_FAILED,
      message: provision.status || "provision_failed",
      provisionStatus: provision.status || null,
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "lookup_error" };
  }
}

/**
 * Soft-link an unprovisioned application to an existing organization.
 * Does not provision a tenant and does not activate a paid Network subscription.
 */
async function linkRegistrationApplicationToOrganization(db, input) {
  const applicationId = String((input && input.applicationId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const organizationKey = String((input && input.organizationKey) || "")
    .trim()
    .toLowerCase();
  if (!UUID_RE.test(applicationId) || !UUID_RE.test(actorUserId) || !organizationKey) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input" };
  }

  try {
    return await withOwnedClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const app = await repo.lockApplicationById(client, applicationId);
        if (!app) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, message: "not_found" };
        }
        if (app.organization_id || String(app.provisioning_status) === "provisioned") {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_ELIGIBLE, message: "already_linked" };
        }
        if (["rejected", "cancelled"].includes(String(app.application_status || ""))) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_ELIGIBLE, message: "not_eligible" };
        }

        const organizationId = await repo.findOrganizationIdByKey(client, organizationKey);
        if (!organizationId) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, message: "organization_not_found" };
        }

        const linked = await repo.linkApplicationToOrganization(
          client,
          applicationId,
          organizationId
        );
        if (!linked) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_ELIGIBLE, message: "link_failed" };
        }

        await repo.ensureOrganizationOnboardingRow(client, {
          organizationId,
          applicationId,
        });

        const nowIso = new Date().toISOString();
        await repo.updateApplicationRiskReviewState(client, applicationId, {
          reviewEvent: {
            at: nowIso,
            action: "linked_organization",
            actor_user_id: actorUserId,
            status: organizationKey,
          },
        });

        await recordAuditEventSafe(client, {
          deploymentCode: input.deploymentCode || "blessboard-org-v5",
          organizationId,
          actorUserId,
          outcome: "success",
          actionKey: "registration.application_linked",
          entityType: "registration_application",
          entityId: applicationId,
          metadata: {
            category: "registration",
            actor_type: "platform_admin",
            source: "admin_registration_applications",
            status: organizationKey,
          },
        });

        await client.query("COMMIT");
        return {
          ok: true,
          status: STATUS.OK,
          organizationId,
          organizationKey,
        };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "lookup_error" };
  }
}

/**
 * Mark Network validation complete (status-only). Does not provision or activate Network.
 * @param {{ query: Function }} db
 * @param {{ applicationId: string, actorUserId: string, deploymentCode?: string }} input
 */
async function markNetworkValidationComplete(db, input) {
  return updateRegistrationFollowUpStatus(db, {
    applicationId: input && input.applicationId,
    actorUserId: input && input.actorUserId,
    followUpStatus: "approved_for_provision",
    deploymentCode: input && input.deploymentCode,
  });
}

module.exports = {
  STATUS,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  ALLOWED_LIMITS,
  normalizeListFilters,
  listRegistrationApplicationsAdmin,
  getRegistrationApplicationDetail,
  updateRegistrationFollowUpStatus,
  markNetworkValidationComplete,
  assignRegistrationSupport,
  addRegistrationSupportContact,
  rejectRegistrationApplication,
  approveAndProvisionRegistrationApplication,
  linkRegistrationApplicationToOrganization,
  sanitizeProvisioningErrorDetail,
  needsAttention,
  deriveWorkflowStatus,
  computeSupportPriority,
  QUEUES,
  ACTIONS,
  QUEUE_FILTERS,
  presentRegistrationOperatorView,
};
