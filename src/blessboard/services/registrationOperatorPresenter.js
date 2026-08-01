"use strict";

/**
 * Single operator-facing presenter for registration applications.
 * Maps internal three-axis status into queue, display label, explanation, and next action.
 * EJS must not re-derive these rules.
 */

const { NETWORK_PLAN_CODE } = require("./platformChurchRegistrationValidation");
const { planDisplayLabel } = require("./registrationPlanMapping");

const QUEUES = Object.freeze({
  NEEDS_REVIEW: "needs_review",
  PHASE5_NEW: "phase5_new",
  PROVISIONING_FAILED: "provisioning_failed",
  NETWORK_VALIDATION: "network_validation",
  NETWORK_READY: "network_ready",
  PROVISIONED: "provisioned",
  REJECTED: "rejected",
  OTHER: "other",
});

const ACTIONS = Object.freeze({
  APPROVE_AND_PROVISION: "approve_and_provision",
  RETRY_PROVISIONING: "retry_provisioning",
  REQUEST_INFORMATION: "request_information",
  MARK_VALIDATION_COMPLETE: "mark_validation_complete",
  APPROVE_NETWORK_ORGANIZATION: "approve_network_organization",
  VIEW_ORGANIZATION: "view_organization",
  ASSIGN_SUPPORT: "assign_support",
  RECORD_CONTACT: "record_contact",
  NONE: "none",
});

const DISPLAY = Object.freeze({
  PROVISIONED: "Provisioned",
  NEEDS_REVIEW: "Needs review",
  AWAITING_INFORMATION: "Awaiting information",
  PROVISIONING_FAILED: "Provisioning failed",
  NETWORK_VALIDATION: "Network validation",
  READY_FOR_APPROVAL: "Ready for approval",
  REJECTED: "Rejected",
  CLOSED: "Closed",
});

const QUEUE_FILTERS = Object.freeze([
  { key: "", label: "All" },
  { key: QUEUES.NEEDS_REVIEW, label: "Needs review" },
  { key: QUEUES.PROVISIONING_FAILED, label: "Provisioning failed" },
  { key: QUEUES.NETWORK_VALIDATION, label: "Network validation" },
  { key: QUEUES.NETWORK_READY, label: "Ready for approval" },
  { key: QUEUES.PROVISIONED, label: "Provisioned" },
  { key: QUEUES.REJECTED, label: "Rejected" },
]);

const ACTION_LABELS = Object.freeze({
  [ACTIONS.APPROVE_AND_PROVISION]: "Approve and provision",
  [ACTIONS.RETRY_PROVISIONING]: "Retry provisioning",
  [ACTIONS.REQUEST_INFORMATION]: "Request information",
  [ACTIONS.MARK_VALIDATION_COMPLETE]: "Mark validation complete",
  [ACTIONS.APPROVE_NETWORK_ORGANIZATION]: "Approve and create organization",
  [ACTIONS.VIEW_ORGANIZATION]: "View organization",
  [ACTIONS.ASSIGN_SUPPORT]: "Assign support owner",
  [ACTIONS.RECORD_CONTACT]: "Record contact",
  [ACTIONS.NONE]: "No action required",
});

/** Short labels for list-row navigation buttons (not the "next step" copy). */
const OPEN_ACTION_LABELS_BY_DISPLAY = Object.freeze({
  [DISPLAY.NEEDS_REVIEW]: "Review",
  [DISPLAY.AWAITING_INFORMATION]: "Review",
  [DISPLAY.PROVISIONING_FAILED]: "Retry",
  [DISPLAY.NETWORK_VALIDATION]: "Continue",
  [DISPLAY.READY_FOR_APPROVAL]: "Review",
  [DISPLAY.PROVISIONED]: "View",
  [DISPLAY.REJECTED]: "View",
  [DISPLAY.CLOSED]: "View",
});

function isNetworkRow(row) {
  return (
    String(row.selected_plan || row.selectedPlan || "") === NETWORK_PLAN_CODE ||
    Boolean(row.support_requested || row.supportRequested)
  );
}

function followUpOf(row) {
  let follow = String(row.follow_up_status || row.followUpStatus || "");
  if (follow === "call_pending") follow = "contact_pending";
  if (follow === "needs_help" || follow === "self_onboarding") follow = "awaiting_customer";
  return follow;
}

function planLabelOf(row) {
  const plan = row.selected_plan || row.selectedPlan;
  return planDisplayLabel(plan) || String(plan || "Unknown plan");
}

/**
 * List-row open control: human label + href for the primary navigation button.
 * Distinct from recommendedActionLabel (which describes the next operational step).
 * @param {{ displayStatus?: string, recommendedAction?: string, organizationHref?: string|null }} operator
 * @param {{ id?: string|null }} [row]
 */
function presentOpenAction(operator, row) {
  const view = operator && typeof operator === "object" ? operator : {};
  const applicationId = row && row.id != null ? String(row.id) : "";
  const detailHref = applicationId
    ? `/admin/registration-applications/${encodeURIComponent(applicationId)}`
    : null;

  if (view.recommendedAction === ACTIONS.VIEW_ORGANIZATION && view.organizationHref) {
    return {
      openActionLabel: "View",
      actionHref: String(view.organizationHref),
    };
  }

  const displayKey = String(view.displayStatus || "").replace(/\s*\(.*\)$/, "").trim();
  // Growth Trial display is "Provisioned (Growth Trial)" — normalize to Provisioned.
  const normalizedDisplay = displayKey.startsWith(DISPLAY.PROVISIONED)
    ? DISPLAY.PROVISIONED
    : displayKey;

  let openActionLabel = OPEN_ACTION_LABELS_BY_DISPLAY[normalizedDisplay];
  if (!openActionLabel) {
    if (view.recommendedAction === ACTIONS.RETRY_PROVISIONING) openActionLabel = "Retry";
    else if (view.recommendedAction === ACTIONS.MARK_VALIDATION_COMPLETE) openActionLabel = "Continue";
    else if (view.recommendedAction === ACTIONS.VIEW_ORGANIZATION) openActionLabel = "View";
    else openActionLabel = "Review";
  }

  return {
    openActionLabel,
    actionHref: detailHref,
  };
}

/**
 * @param {object} row — DB row or already-mapped list/detail application
 */
function presentRegistrationOperatorView(row) {
  if (!row || typeof row !== "object") {
    return {
      displayStatus: DISPLAY.CLOSED,
      explanation: "This registration could not be interpreted.",
      recommendedAction: ACTIONS.NONE,
      recommendedActionLabel: ACTION_LABELS[ACTIONS.NONE],
      queue: QUEUES.OTHER,
      tone: "muted",
      planLabel: "—",
      isNetwork: false,
      organizationHref: null,
    };
  }

  const app = String(row.application_status || row.applicationStatus || "");
  const prov = String(row.provisioning_status || row.provisioningStatus || "");
  const follow = followUpOf(row);
  const network = isNetworkRow(row);
  const planLabel = planLabelOf(row);
  const orgKey = row.organization_key || row.organizationKey || null;
  const organizationHref = orgKey
    ? `/admin/organizations/${encodeURIComponent(String(orgKey))}`
    : null;
  const subStatus = String(row.subscriptionStatus || row.subscription_status || "");
  const growthTrial =
    String(row.selected_plan || row.selectedPlan || "") === "growth" &&
    (subStatus === "trialing" || prov === "provisioned");

  if (app === "rejected") {
    return {
      displayStatus: DISPLAY.REJECTED,
      explanation: "This application was rejected. No organization was provisioned.",
      recommendedAction: ACTIONS.NONE,
      recommendedActionLabel: ACTION_LABELS[ACTIONS.NONE],
      queue: QUEUES.REJECTED,
      tone: "muted",
      planLabel,
      isNetwork: network,
      organizationHref,
    };
  }

  if (app === "cancelled") {
    return {
      displayStatus: DISPLAY.CLOSED,
      explanation: "This application was cancelled.",
      recommendedAction: ACTIONS.NONE,
      recommendedActionLabel: ACTION_LABELS[ACTIONS.NONE],
      queue: QUEUES.REJECTED,
      tone: "muted",
      planLabel,
      isNetwork: network,
      organizationHref,
    };
  }

  if (prov === "provisioned" || (app === "closed" && orgKey)) {
    let explanation = `This ${planLabel} registration was provisioned successfully.`;
    if (growthTrial) {
      explanation =
        "This Growth registration was provisioned with a 30-day trial. Network activation is not involved.";
    } else if (network) {
      explanation =
        "The organization was created. Activate the Network plan from the organization page when the contract is ready.";
    } else if (String(row.selected_plan || row.selectedPlan || "") === "foundation") {
      explanation = "This Foundation church was provisioned automatically or after review.";
    }
    return {
      displayStatus: growthTrial ? "Provisioned · Growth Trial" : DISPLAY.PROVISIONED,
      explanation,
      recommendedAction: organizationHref ? ACTIONS.VIEW_ORGANIZATION : ACTIONS.NONE,
      recommendedActionLabel: organizationHref
        ? ACTION_LABELS[ACTIONS.VIEW_ORGANIZATION]
        : ACTION_LABELS[ACTIONS.NONE],
      queue: QUEUES.PROVISIONED,
      tone: "success",
      planLabel,
      isNetwork: network,
      organizationHref,
    };
  }

  if (prov === "provisioning_failed") {
    return {
      displayStatus: DISPLAY.PROVISIONING_FAILED,
      explanation:
        "Provisioning did not complete. Review the technical details, then retry only if no organization was created.",
      recommendedAction: network ? ACTIONS.NONE : ACTIONS.RETRY_PROVISIONING,
      recommendedActionLabel: network
        ? ACTION_LABELS[ACTIONS.NONE]
        : ACTION_LABELS[ACTIONS.RETRY_PROVISIONING],
      queue: QUEUES.PROVISIONING_FAILED,
      tone: "danger",
      planLabel,
      isNetwork: network,
      organizationHref,
    };
  }

  if (network && !orgKey) {
    if (follow === "approved_for_provision" || follow === "qualified") {
      return {
        displayStatus: DISPLAY.READY_FOR_APPROVAL,
        explanation:
          follow === "qualified"
            ? "Customer support marked this Network application as qualified. A platform administrator may create the organization."
            : "Customer support completed Network validation. The organization is ready to be created. Network plan activation stays separate.",
        recommendedAction: ACTIONS.APPROVE_NETWORK_ORGANIZATION,
        recommendedActionLabel: ACTION_LABELS[ACTIONS.APPROVE_NETWORK_ORGANIZATION],
        queue: QUEUES.NETWORK_READY,
        tone: "success",
        planLabel,
        isNetwork: true,
        organizationHref: null,
      };
    }

    if (follow === "awaiting_customer") {
      return {
        displayStatus: DISPLAY.AWAITING_INFORMATION,
        explanation: "This Network application is waiting for information from the applicant.",
        recommendedAction: ACTIONS.RECORD_CONTACT,
        recommendedActionLabel: ACTION_LABELS[ACTIONS.RECORD_CONTACT],
        queue: QUEUES.NETWORK_VALIDATION,
        tone: "warn",
        planLabel,
        isNetwork: true,
        organizationHref: null,
      };
    }

    const awaitingFirst =
      !follow ||
      follow === "new" ||
      follow === "contact_pending" ||
      follow === "validation_pending";

    return {
      displayStatus: DISPLAY.NETWORK_VALIDATION,
      explanation: awaitingFirst
        ? "This Network application is waiting for customer-support validation. Assign an owner and make first contact."
        : "Network validation is in progress. When checks are complete, mark validation complete so a platform administrator can create the organization.",
      recommendedAction: awaitingFirst
        ? ACTIONS.ASSIGN_SUPPORT
        : ACTIONS.MARK_VALIDATION_COMPLETE,
      recommendedActionLabel: awaitingFirst
        ? ACTION_LABELS[ACTIONS.ASSIGN_SUPPORT]
        : ACTION_LABELS[ACTIONS.MARK_VALIDATION_COMPLETE],
      queue: QUEUES.NETWORK_VALIDATION,
      tone: "warn",
      planLabel,
      isNetwork: true,
      organizationHref: null,
    };
  }

  if (app === "duplicate_review") {
    return {
      displayStatus: DISPLAY.NEEDS_REVIEW,
      explanation: `This ${planLabel} registration requires duplicate or similarity review before provisioning.`,
      recommendedAction: ACTIONS.APPROVE_AND_PROVISION,
      recommendedActionLabel: ACTION_LABELS[ACTIONS.APPROVE_AND_PROVISION],
      queue: QUEUES.NEEDS_REVIEW,
      tone: "warn",
      planLabel,
      isNetwork: false,
      organizationHref: null,
    };
  }

  if (app === "submitted" && (prov === "not_started" || prov === "provisioning")) {
    return {
      displayStatus: DISPLAY.NEEDS_REVIEW,
      explanation:
        prov === "provisioning"
          ? "Provisioning is in progress. Refresh shortly; do not start a second provision."
          : `This ${planLabel} registration is held for manual review. Approve and provision only after validating the details.`,
      recommendedAction:
        prov === "provisioning" ? ACTIONS.NONE : ACTIONS.APPROVE_AND_PROVISION,
      recommendedActionLabel:
        prov === "provisioning"
          ? ACTION_LABELS[ACTIONS.NONE]
          : ACTION_LABELS[ACTIONS.APPROVE_AND_PROVISION],
      queue: QUEUES.NEEDS_REVIEW,
      tone: "warn",
      planLabel,
      isNetwork: false,
      organizationHref: null,
    };
  }

  if (follow === "awaiting_customer") {
    return {
      displayStatus: DISPLAY.AWAITING_INFORMATION,
      explanation: "More information was requested from the applicant.",
      recommendedAction: ACTIONS.REQUEST_INFORMATION,
      recommendedActionLabel: ACTION_LABELS[ACTIONS.REQUEST_INFORMATION],
      queue: QUEUES.NEEDS_REVIEW,
      tone: "warn",
      planLabel,
      isNetwork: network,
      organizationHref,
    };
  }

  return {
    displayStatus: DISPLAY.CLOSED,
    explanation: "No further registration action is required on this application.",
    recommendedAction: organizationHref ? ACTIONS.VIEW_ORGANIZATION : ACTIONS.NONE,
    recommendedActionLabel: organizationHref
      ? ACTION_LABELS[ACTIONS.VIEW_ORGANIZATION]
      : ACTION_LABELS[ACTIONS.NONE],
    queue: QUEUES.OTHER,
    tone: "muted",
    planLabel,
    isNetwork: network,
    organizationHref,
  };
}

function queueFilterSpec(queue) {
  const key = String(queue || "").trim();
  if (!key) return null;
  // phase5_new is a filter-only residual set (visible_status=new); not shown in operator queue chips.
  if (key === QUEUES.PHASE5_NEW) return QUEUES.PHASE5_NEW;
  if (!Object.values(QUEUES).includes(key) || key === QUEUES.OTHER) return null;
  return key;
}

module.exports = {
  QUEUES,
  ACTIONS,
  DISPLAY,
  QUEUE_FILTERS,
  ACTION_LABELS,
  OPEN_ACTION_LABELS_BY_DISPLAY,
  presentRegistrationOperatorView,
  presentOpenAction,
  queueFilterSpec,
  isNetworkRow,
};
