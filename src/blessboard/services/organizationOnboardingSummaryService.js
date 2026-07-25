"use strict";

/**
 * Canonical organization onboarding summary for platform admin.
 * Checklist facts and progress are derived at query time (never store %).
 */

const repo = require("../repositories/platformChurchRegistrationRepository");
const {
  normalizeOrganizationKey,
} = require("./organizationKey");
const { publicChurchHomePath } = require("../urls/churchUrlHelper");
const {
  resolveWebsiteActionUrls,
} = require("../urls/websiteActionUrls");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  LOOKUP_ERROR: "lookup_error",
  NOT_BLESSBOARD: "not_blessboard",
});

const ORG_KEY_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ONBOARDING_STATUSES = Object.freeze([
  "not_started",
  "in_progress",
  "completed",
  "skipped",
]);

const CHECKLIST_KEYS = Object.freeze([
  "organization_details",
  "first_branch",
  "contact_details",
  "service_times",
  "logo",
  "preview",
  "publish",
]);

const CHECKLIST_LABELS = Object.freeze({
  organization_details: "Organization details",
  first_branch: "First branch",
  contact_details: "Contact details",
  service_times: "Service times",
  logo: "Logo",
  preview: "Preview",
  publish: "Publish",
});

/**
 * Derive site publication aggregate from public_pages counts.
 * Suspended org/church is reported separately — not as a publication enum.
 * @param {{ draftPages?: number, publishedPages?: number, totalPages?: number }} pub
 * @returns {'unpublished'|'partially_published'|'published'}
 */
function derivePublicationStatus(pub) {
  const published = Number(pub && pub.publishedPages) || 0;
  const draft = Number(pub && pub.draftPages) || 0;
  if (published <= 0) return "unpublished";
  if (draft > 0) return "partially_published";
  return "published";
}

/**
 * @param {unknown} rawKey
 * @returns {{ ok: true, key: string } | { ok: false, reason: string }}
 */
function resolveOrganizationKeyFact(rawKey) {
  const norm = normalizeOrganizationKey(rawKey);
  if (!norm.ok) {
    return { ok: false, reason: norm.reason || "invalid_key" };
  }
  return { ok: true, key: norm.key };
}

/**
 * Platform-admin preview is org-scoped (never session tenant).
 * HQ preview uses the authenticated tenant session.
 * @param {string|null} organizationKey
 * @param {'platform_admin'|'hq'} linkContext
 */
function resolvePreviewActionUrl(organizationKey, linkContext) {
  const actions = resolveWebsiteActionUrls({
    actor: linkContext === "hq" ? "hq" : "platform_admin",
    organizationKey,
  });
  return actions.previewUrl;
}

/**
 * Publish complete → public miniwebsite. Incomplete → HQ publish workflow (HQ)
 * or org-detail status for platform admin (never a false public Complete).
 * @param {{
 *   organizationKey: string|null,
 *   publishComplete: boolean,
 *   linkContext: 'platform_admin'|'hq',
 * }} input
 */
function resolvePublishAction(input) {
  const actions = resolveWebsiteActionUrls({
    actor: input.linkContext === "hq" ? "hq" : "platform_admin",
    organizationKey: input.organizationKey,
  });
  if (input.publishComplete && actions.publishedWebsiteUrl) {
    return {
      actionUrl: actions.publishedWebsiteUrl,
      actionLabel: actions.publishedWebsiteLabel || "View published website",
    };
  }
  return {
    actionUrl: actions.publishWorkflowUrl,
    actionLabel: actions.publishWorkflowLabel || "Publish website",
  };
}

/**
 * @param {object} facts
 * @param {string} organizationKey
 * @param {{ linkContext?: 'platform_admin'|'hq' }} [options]
 */
function buildChecklist(facts, organizationKey, options = {}) {
  const linkContext = options.linkContext === "hq" ? "hq" : "platform_admin";
  const keyFact = resolveOrganizationKeyFact(organizationKey || facts.organizationKey);
  const organizationKeyAvailable = keyFact.ok;
  const resolvedKey = keyFact.ok ? keyFact.key : null;
  const websiteActions = resolveWebsiteActionUrls({
    actor: linkContext === "hq" ? "hq" : "platform_admin",
    organizationKey: resolvedKey,
  });

  const hasOrgName = Boolean(String(facts.orgDisplayName || "").trim());
  const hasChurch = Boolean(facts.churchId);
  const hasChurchName = Boolean(String(facts.churchDisplayName || "").trim());
  const organizationDetailsComplete = hasOrgName && hasChurch && hasChurchName;

  const firstBranchComplete = (Number(facts.activeBranchCount) || 0) > 0;

  const hasChurchContact =
    Boolean(String(facts.primaryEmail || "").trim()) ||
    Boolean(String(facts.primaryPhone || "").trim());
  const hasBranchContact = Boolean(facts.hasBranchContact);
  const contactDetailsComplete = hasChurchContact || hasBranchContact;

  const serviceTimesComplete = Boolean(facts.hasServiceTimesContent);
  const logoComplete = Boolean(facts.hasLogo);

  const previewAcknowledged = Boolean(facts.previewAcknowledged);
  const previewRouteAvailable = Boolean(facts.hasPreviewableHomepage);
  const previewComplete = previewAcknowledged && previewRouteAvailable;
  const previewActionUrl = previewRouteAvailable
    ? resolvePreviewActionUrl(resolvedKey, linkContext)
    : null;

  const publishedHomepageAvailable = Boolean(facts.hasPublishedHomepage);
  const websiteStatusPublished =
    String(facts.websiteStatus || "").toLowerCase() === "published";
  const publicWebsitePath = organizationKeyAvailable
    ? publicChurchHomePath(resolvedKey)
    : null;
  const publicWebsiteResolvable = Boolean(
    organizationKeyAvailable && publishedHomepageAvailable && publicWebsitePath
  );
  const publishComplete =
    organizationKeyAvailable &&
    publishedHomepageAvailable &&
    publicWebsiteResolvable &&
    (websiteStatusPublished || (Number(facts.publishedPages) || 0) > 0);

  let publishExplanation;
  if (publishComplete) {
    publishExplanation = "Published homepage is addressable at the public website path.";
  } else if ((Number(facts.publishedPages) || 0) > 0 && !organizationKeyAvailable) {
    publishExplanation =
      "Published content exists, but the public website address is unavailable.";
  } else if (organizationKeyAvailable && !publishedHomepageAvailable) {
    publishExplanation = "The website has not been published yet.";
  } else if (!organizationKeyAvailable) {
    publishExplanation = "A valid organization key is required before the site can be public.";
  } else {
    publishExplanation = "No published public_pages rows for this church.";
  }

  const publishAction = resolvePublishAction({
    organizationKey: resolvedKey,
    publishComplete,
    linkContext,
  });

  let previewExplanation;
  if (previewComplete) {
    previewExplanation = "Preview acknowledged and a previewable homepage exists.";
  } else if (previewAcknowledged && !previewRouteAvailable) {
    previewExplanation = "Preview was acknowledged, but no previewable homepage exists yet.";
  } else if (previewRouteAvailable) {
    previewExplanation = "Homepage can be previewed; acknowledgement not recorded yet.";
  } else {
    previewExplanation = "No previewable homepage is available yet.";
  }

  const paSafe = linkContext === "platform_admin";
  const items = [
    {
      key: "organization_details",
      label: CHECKLIST_LABELS.organization_details,
      completed: organizationDetailsComplete,
      source: "derived",
      explanation: organizationDetailsComplete
        ? "Organization and church display names are present."
        : "Requires organization and church display names.",
      actionUrl: paSafe ? null : "/hq/settings",
      actionLabel: paSafe ? null : "Organization settings",
    },
    {
      key: "first_branch",
      label: CHECKLIST_LABELS.first_branch,
      completed: firstBranchComplete,
      source: "derived",
      explanation: firstBranchComplete
        ? "At least one active BlessBoard branch exists."
        : "No active branch linked to this church yet.",
      actionUrl: paSafe ? null : "/hq/settings#bb-hq-branch",
      actionLabel: paSafe ? null : "First branch settings",
    },
    {
      key: "contact_details",
      label: CHECKLIST_LABELS.contact_details,
      completed: contactDetailsComplete,
      source: "derived",
      explanation: contactDetailsComplete
        ? "Phone or email is present on church or branch settings."
        : "No phone or email on church_settings or branch_settings.",
      actionUrl: paSafe ? null : "/hq/settings",
      actionLabel: paSafe ? null : "Contact settings",
    },
    {
      key: "service_times",
      label: CHECKLIST_LABELS.service_times,
      completed: serviceTimesComplete,
      source: "derived",
      explanation: serviceTimesComplete
        ? paSafe
          ? "Service-time content found on the church homepage (editable by church HQ administrators)."
          : "Service-time content found on a public page section."
        : paSafe
          ? "No service-time content yet. Church HQ administrators edit this on the home page."
          : "No structured service-time records; optional page sections not present.",
      actionUrl: websiteActions.serviceTimesUrl,
      actionLabel: websiteActions.serviceTimesLabel,
    },
    {
      key: "logo",
      label: CHECKLIST_LABELS.logo,
      completed: logoComplete,
      source: "derived",
      explanation: logoComplete
        ? "Church branding logo media is present."
        : "No dedicated logo/branding field in V5; not inferred from generic media.",
      actionUrl: null,
      actionLabel: null,
    },
    {
      key: "preview",
      label: CHECKLIST_LABELS.preview,
      completed: previewComplete,
      source: "stored",
      explanation: previewExplanation,
      actionUrl: previewActionUrl,
      actionLabel: previewActionUrl
        ? websiteActions.previewLabel || "Open website preview"
        : null,
      previewAcknowledged,
      previewRouteAvailable,
    },
    {
      key: "publish",
      label: CHECKLIST_LABELS.publish,
      completed: publishComplete,
      source: "derived",
      explanation: publishExplanation,
      actionUrl: publishAction.actionUrl,
      actionLabel: publishAction.actionLabel,
    },
  ];

  return items;
}

/**
 * Prefer stored terminal statuses; otherwise derive from checklist.
 * Manual completed/skipped overrides are respected even if checklist incomplete.
 * @param {string|null} storedStatus
 * @param {{ completed: boolean }[]} checklist
 * @returns {{ status: string, derived: boolean, allRequiredComplete: boolean }}
 */
function resolveOnboardingStatus(storedStatus, checklist) {
  const stored = String(storedStatus || "not_started");
  const completedCount = checklist.filter((c) => c.completed).length;
  const allRequiredComplete = completedCount === checklist.length && checklist.length > 0;

  if (stored === "completed" || stored === "skipped") {
    return { status: stored, derived: false, allRequiredComplete };
  }
  if (allRequiredComplete) {
    return { status: "completed", derived: true, allRequiredComplete };
  }
  if (completedCount > 0) {
    return { status: "in_progress", derived: stored !== "in_progress", allRequiredComplete };
  }
  return {
    status: stored === "in_progress" ? "in_progress" : "not_started",
    derived: false,
    allRequiredComplete: false,
  };
}

/**
 * @param {object} facts
 * @returns {{ at: Date|string|null, source: string|null }}
 */
function resolveLastActivity(facts) {
  const loginAt = facts.churchAdminLastLoginAt || null;
  if (loginAt) {
    return { at: loginAt, source: "church_admin_last_login" };
  }
  if (facts.lastActivityAt) {
    return { at: facts.lastActivityAt, source: "onboarding_last_activity" };
  }
  return { at: null, source: null };
}

/**
 * @param {object} facts
 * @param {string} organizationKey
 * @param {{ linkContext?: 'platform_admin'|'hq' }} [options]
 */
function assembleSummary(facts, organizationKey, options = {}) {
  const keyFact = resolveOrganizationKeyFact(organizationKey || facts.organizationKey);
  const resolvedKey = keyFact.ok ? keyFact.key : null;
  const publicWebsitePath = keyFact.ok ? publicChurchHomePath(resolvedKey) : null;
  const publishedHomepageAvailable = Boolean(facts.hasPublishedHomepage);
  const publicWebsiteAvailable = Boolean(
    keyFact.ok && publishedHomepageAvailable && publicWebsitePath
  );

  const checklist = buildChecklist(facts, resolvedKey || organizationKey, options);
  const completedCount = checklist.filter((c) => c.completed).length;
  const totalCount = checklist.length;
  const percentage =
    totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  const statusResolved = resolveOnboardingStatus(facts.onboardingStatus, checklist);
  const publicationStatus = derivePublicationStatus({
    draftPages: facts.draftPages,
    publishedPages: facts.publishedPages,
  });
  const lastActivity = resolveLastActivity(facts);

  const orgStatus = String(facts.organizationStatus || "");
  const churchStatus = String(facts.churchStatus || "");
  const operationallySuspended =
    orgStatus === "inactive" ||
    orgStatus === "retired" ||
    churchStatus === "suspended" ||
    churchStatus === "inactive" ||
    churchStatus === "archived";

  let publicWebsiteUnavailableReason = null;
  if (!publicWebsiteAvailable) {
    if (!keyFact.ok) {
      publicWebsiteUnavailableReason =
        keyFact.reason === "reserved_key"
          ? "Organization key is reserved and cannot form a public path."
          : "A valid organization key is missing.";
    } else if (!publishedHomepageAvailable) {
      publicWebsiteUnavailableReason = "The website has not been published yet.";
    } else if (operationallySuspended) {
      publicWebsiteUnavailableReason = "Organization or church is not active.";
    } else {
      publicWebsiteUnavailableReason = "Public website address unavailable.";
    }
  }

  return {
    organizationId: String(facts.organizationId),
    organizationKey: resolvedKey || String(facts.organizationKey || organizationKey || ""),
    organizationKeyAvailable: keyFact.ok,
    publicWebsitePath,
    publicWebsiteAvailable,
    publicWebsiteUnavailableReason,
    publishedHomepageAvailable,
    publishedHomepageId: facts.publishedHomepageId
      ? String(facts.publishedHomepageId)
      : null,
    websiteStatus: facts.websiteStatus != null ? String(facts.websiteStatus) : null,
    hasBlessBoardChurch: Boolean(facts.churchId),
    onboardingStatus: statusResolved.status,
    onboardingStatusStored: facts.onboardingStatus != null ? String(facts.onboardingStatus) : null,
    onboardingStatusDerived: statusResolved.derived,
    followUpStatus: facts.followUpStatus != null ? String(facts.followUpStatus) : null,
    assignedSupportUser: facts.assignedSupportUserId
      ? {
          id: String(facts.assignedSupportUserId),
          displayName: facts.supportDisplayName != null ? String(facts.supportDisplayName) : "",
          email: facts.supportEmail != null ? String(facts.supportEmail) : "",
        }
      : null,
    supportRequested: Boolean(facts.supportRequested),
    startedAt: facts.onboardingStartedAt || null,
    completedAt: facts.onboardingCompletedAt || null,
    checklist,
    completedCount,
    totalCount,
    percentage,
    publicationStatus,
    publicationCounts: {
      draftPages: Number(facts.draftPages) || 0,
      publishedPages: Number(facts.publishedPages) || 0,
    },
    operationallySuspended,
    organizationStatus: orgStatus || null,
    churchStatus: churchStatus || null,
    firstContactedAt: facts.firstContactedAt || null,
    lastContactedAt: facts.lastContactedAt || null,
    nextFollowUpAt: facts.nextFollowUpAt || null,
    nextFollowUpOverdue: (() => {
      if (!facts.nextFollowUpAt) return false;
      const t = new Date(facts.nextFollowUpAt).getTime();
      return Number.isFinite(t) && t < Date.now();
    })(),
    registrationApplicationId: facts.registrationApplicationId
      ? String(facts.registrationApplicationId)
      : null,
    planKey: facts.planKey != null ? String(facts.planKey) : null,
    lastActivityAt: lastActivity.at,
    lastActivitySource: lastActivity.source,
    previewAcknowledged: Boolean(facts.previewAcknowledged),
    onboardingRowPresent: Boolean(facts.onboardingRowPresent),
  };
}

/**
 * @param {{ query: Function }} db
 * @param {{
 *   organizationId?: string,
 *   organizationKey?: string,
 *   linkContext?: 'platform_admin'|'hq',
 * }} input
 */
async function getOrganizationOnboardingSummary(db, input) {
  if (!db || typeof db.query !== "function") {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "database required", summary: null };
  }

  const organizationIdRaw = input && input.organizationId != null ? String(input.organizationId).trim() : "";
  const organizationKeyRaw =
    input && input.organizationKey != null
      ? String(input.organizationKey).trim().toLowerCase()
      : "";
  const linkContext = input && input.linkContext === "hq" ? "hq" : "platform_admin";

  if (organizationIdRaw && !UUID_RE.test(organizationIdRaw)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_organization_id", summary: null };
  }
  if (organizationKeyRaw && !ORG_KEY_RE.test(organizationKeyRaw)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_organization_key", summary: null };
  }
  if (!organizationIdRaw && !organizationKeyRaw) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "organization_required", summary: null };
  }

  try {
    const facts = await repo.loadOrganizationOnboardingFacts(db, {
      organizationId: organizationIdRaw || null,
      organizationKey: organizationKeyRaw || null,
    });
    if (!facts) {
      return { ok: false, status: STATUS.NOT_FOUND, message: "not_found", summary: null };
    }
    if (!facts.churchId) {
      return {
        ok: true,
        status: STATUS.NOT_BLESSBOARD,
        message: "not_blessboard",
        summary: null,
        organizationKey: String(facts.organizationKey || ""),
        organizationStatus: facts.organizationStatus != null ? String(facts.organizationStatus) : null,
      };
    }

    const summary = assembleSummary(facts, facts.organizationKey, { linkContext });
    return { ok: true, status: STATUS.OK, summary };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "lookup_error", summary: null };
  }
}

module.exports = {
  STATUS,
  ONBOARDING_STATUSES,
  CHECKLIST_KEYS,
  CHECKLIST_LABELS,
  derivePublicationStatus,
  buildChecklist,
  resolveOnboardingStatus,
  resolveLastActivity,
  assembleSummary,
  getOrganizationOnboardingSummary,
  resolveOrganizationKeyFact,
  resolvePreviewActionUrl,
  resolvePublishAction,
};
