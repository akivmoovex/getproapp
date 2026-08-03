"use strict";

/**
 * ActiveClinic foundation state taxonomy (AC-V6-S08).
 * Safe, tenant-isolation-friendly messages — no permission keys or IDs.
 */

const STATE = Object.freeze({
  EMPTY: "empty",
  NO_RESULTS: "no_results",
  LOADING: "loading",
  VALIDATION_ERROR: "validation_error",
  REQUEST_ERROR: "request_error",
  ACCESS_RESTRICTED: "access_restricted",
  CONTEXT_UNAVAILABLE: "context_unavailable",
  SESSION_EXPIRED: "session_expired",
  NOT_FOUND: "not_found",
  SERVICE_UNAVAILABLE: "service_unavailable",
  OFFLINE: "offline",
  SUCCESS_TERMINAL: "success_terminal",
});

/** Maps taxonomy keys to access-state pageId values. */
const PAGE_ID = Object.freeze({
  [STATE.ACCESS_RESTRICTED]: "access-denied",
  [STATE.SESSION_EXPIRED]: "session-expired",
  [STATE.NOT_FOUND]: "not-found",
  [STATE.CONTEXT_UNAVAILABLE]: "context-unavailable",
  [STATE.SERVICE_UNAVAILABLE]: "service-unavailable",
  [STATE.REQUEST_ERROR]: "error",
});

const PRESETS = Object.freeze({
  [STATE.ACCESS_RESTRICTED]: {
    pageTitle: "Access restricted",
    heading: "You do not have access to this area",
    message: "Ask an administrator if you need permission, or return to an area you can use.",
    primaryHref: "/app",
    primaryLabel: "Back to home",
    httpStatus: 403,
  },
  [STATE.SESSION_EXPIRED]: {
    pageTitle: "Session ended",
    heading: "Your session has ended",
    message: "Sign in again to continue.",
    primaryHref: "/login?expired=1",
    primaryLabel: "Sign in",
    httpStatus: 401,
  },
  [STATE.NOT_FOUND]: {
    pageTitle: "Not found",
    heading: "Page not found",
    message: "That page is not available, or you do not have access to it.",
    primaryHref: "/app",
    primaryLabel: "Back to home",
    httpStatus: 404,
  },
  [STATE.CONTEXT_UNAVAILABLE]: {
    pageTitle: "Workspace unavailable",
    heading: "This ActiveClinic workspace is currently unavailable",
    message: "Sign out and try another organization, or contact your administrator.",
    primaryHref: "/login",
    primaryLabel: "Sign in",
    httpStatus: 403,
  },
  [STATE.SERVICE_UNAVAILABLE]: {
    pageTitle: "Temporarily unavailable",
    heading: "ActiveClinic is temporarily unavailable",
    message: "Please try again in a few moments.",
    primaryHref: "/app",
    primaryLabel: "Try again",
    httpStatus: 503,
  },
  [STATE.REQUEST_ERROR]: {
    pageTitle: "Something went wrong",
    heading: "Something went wrong",
    message: "Please try again. If the problem continues, contact your administrator.",
    primaryHref: "/app",
    primaryLabel: "Back to home",
    httpStatus: 500,
  },
});

/**
 * Inline list/module state view models (EMPTY / NO_RESULTS / soft RESTRICTED).
 */
function buildInlineState(input) {
  const stateKey = String((input && input.stateKey) || STATE.EMPTY);
  const title = String((input && input.title) || "").trim() || "Nothing to show";
  const description =
    String((input && input.description) || "").trim() ||
    "There is nothing to display right now.";
  const marker = String((input && input.marker) || stateKey).trim();
  const primaryAction =
    input && input.primaryAction && input.primaryAction.href
      ? {
          href: String(input.primaryAction.href),
          label: String(input.primaryAction.label || "Continue"),
        }
      : null;
  const secondaryAction =
    input && input.secondaryAction && input.secondaryAction.href
      ? {
          href: String(input.secondaryAction.href),
          label: String(input.secondaryAction.label || "Back"),
        }
      : null;

  return {
    stateKey,
    title,
    description,
    marker,
    primaryAction,
    secondaryAction,
    contextLabel: (input && input.contextLabel) || null,
  };
}

function buildFullPageState(stateKey, overrides) {
  const preset = PRESETS[stateKey] || PRESETS[STATE.REQUEST_ERROR];
  const o = overrides || {};
  return {
    stateKey,
    pageId: PAGE_ID[stateKey] || "error",
    pageTitle: o.pageTitle || preset.pageTitle,
    heading: o.heading || preset.heading,
    message: o.message || preset.message,
    primaryHref: o.primaryHref || preset.primaryHref,
    primaryLabel: o.primaryLabel || preset.primaryLabel,
    secondaryHref: o.secondaryHref != null ? o.secondaryHref : null,
    secondaryLabel: o.secondaryLabel || null,
    showLogout: o.showLogout === true,
    httpStatus: o.httpStatus || preset.httpStatus,
  };
}

module.exports = {
  STATE,
  PAGE_ID,
  PRESETS,
  buildInlineState,
  buildFullPageState,
};
