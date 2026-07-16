"use strict";

/**
 * BlessBoard failure-state catalogue and safe HTML/JSON renderer.
 * Does not invent tenant content. Never exposes stack traces, SQL, secrets, or paths.
 */

const { normalizeHostFromRequest } = require("./host");
const { getCorrelationId } = require("../middleware/requestCorrelationId");

const PACKAGE_FEATURE_DENIED = "PACKAGE_FEATURE_DENIED";

const SECRET_LEAK_RE =
  /password|secret|DATABASE_URL|postgres(ql)?:\/\/|api[_-]?key|bearer\s+\S+|-----BEGIN|\/Users\/|\/home\/|\\\\[A-Za-z]|at\s+\S+\s+\(|node_modules|\.js:\d+/i;

const FAILURE_KINDS = Object.freeze({
  validation: Object.freeze({
    status: 400,
    code: "validation_failed",
    title: "We could not process that request",
    icon: "error",
    defaultLead:
      "Some details were missing or invalid. Please check what you entered and try again.",
  }),
  unauthenticated: Object.freeze({
    status: 401,
    code: "unauthenticated",
    title: "Sign in required",
    icon: "lock",
    defaultLead: "You need to sign in to continue.",
  }),
  forbidden: Object.freeze({
    status: 403,
    code: "forbidden",
    title: "You do not have access",
    icon: "block",
    defaultLead: "Your account does not have permission for this action.",
  }),
  not_found: Object.freeze({
    status: 404,
    code: "not_found",
    title: "Page not found",
    icon: "search_off",
    defaultLead: "We could not find that page or church site.",
  }),
  package_restricted: Object.freeze({
    status: 409,
    code: "package_restricted",
    title: "Not included in your package",
    icon: "workspace_premium",
    defaultLead:
      "This feature is limited by your BlessBoard package. It is not a permissions problem — upgrade or adjust usage to continue.",
  }),
  quota_conflict: Object.freeze({
    status: 409,
    code: "quota_conflict",
    title: "Package limit reached",
    icon: "speed",
    defaultLead:
      "This action would exceed your package limit. Free capacity or upgrade to continue.",
  }),
  rate_limited: Object.freeze({
    status: 429,
    code: "rate_limited",
    title: "Too many requests",
    icon: "timer",
    defaultLead: "Please wait a few minutes and try again.",
  }),
  internal_error: Object.freeze({
    status: 500,
    code: "internal_error",
    title: "Something went wrong",
    icon: "warning",
    defaultLead: "BlessBoard hit an unexpected problem. Please try again shortly.",
  }),
  service_unavailable: Object.freeze({
    status: 503,
    code: "service_unavailable",
    title: "BlessBoard is temporarily unavailable",
    icon: "cloud_off",
    defaultLead: "Please try again shortly.",
  }),
  organization_suspended: Object.freeze({
    status: 503,
    code: "organization_suspended",
    title: "This church organisation is suspended",
    icon: "pause_circle",
    defaultLead:
      "This church site is temporarily unavailable while the organisation is suspended. Public and portal access is paused. Contact platform support if you need help.",
  }),
  organization_dormant: Object.freeze({
    status: 503,
    code: "organization_dormant",
    title: "This church organisation is dormant",
    icon: "hourglass_empty",
    defaultLead:
      "This church site is temporarily unavailable because the organisation is dormant due to inactivity. The public site is unpublished. HQ and branch administrators may sign in to reactivate. Member access is paused. Data is preserved.",
  }),
  branch_suspended: Object.freeze({
    status: 503,
    code: "branch_suspended",
    title: "This branch is suspended",
    icon: "pause_circle",
    defaultLead:
      "This church site is temporarily unavailable while the branch is suspended. Contact your church office if you need assistance.",
  }),
  branch_inactive: Object.freeze({
    status: 503,
    code: "branch_inactive",
    title: "This branch is not active",
    icon: "info",
    defaultLead:
      "This church site is temporarily unavailable because the branch is not active. Please check back later or contact the church office.",
  }),
});

function wantsJson(req) {
  const accept = String((req && req.headers && req.headers.accept) || "");
  if (/\bapplication\/json\b/i.test(accept)) return true;
  const path = String((req && req.path) || "");
  return path.startsWith("/api/") || /\.json$/i.test(path);
}

function sanitizePublicMessage(value, fallback) {
  const text = String(value == null ? "" : value).trim();
  if (!text) return fallback;
  if (SECRET_LEAK_RE.test(text)) return fallback;
  if (/\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)\b/i.test(text)) return fallback;
  // Strip absolute paths and stack frames
  if (/\/[A-Za-z0-9._-]+\/[A-Za-z0-9._/-]{12,}/.test(text) && /src\/|node_modules|Views\//i.test(text)) {
    return fallback;
  }
  return text.slice(0, 500);
}

function resolveShell(req, explicit) {
  if (explicit) return explicit;
  const path = String((req && req.path) || "");
  if (req && req.churchHqAdmin) return "hq";
  if (req && req.churchBranchAdmin) return "branch";
  if (req && req.churchMember) return "member";
  if (req && req.churchLeader) return "leader";
  if (path.startsWith("/hq")) return "hq";
  if (path.startsWith("/branch")) return "branch";
  if (path.startsWith("/member")) return "member";
  if (path.startsWith("/leader")) return "leader";
  if (req && req.churchContext && req.churchContext.kind === "vertical-apex") return "apex";
  return "public";
}

function defaultActions(kind, shell) {
  const actions = [];
  if (kind === "unauthenticated") {
    if (shell === "hq") actions.push({ href: "/hq/login", label: "Sign in to HQ", primary: true });
    else if (shell === "branch") actions.push({ href: "/branch/login", label: "Sign in", primary: true });
    else if (shell === "leader") actions.push({ href: "/leader/login", label: "Sign in", primary: true });
    else actions.push({ href: "/login", label: "Sign in", primary: true });
  } else if (kind === "package_restricted" || kind === "quota_conflict") {
    if (shell === "hq") actions.push({ href: "/hq/account", label: "View package", primary: true });
    else if (shell === "branch") actions.push({ href: "/branch/account", label: "View package", primary: true });
    else actions.push({ href: "/", label: "Back to home", primary: true });
  } else if (kind === "organization_dormant") {
    actions.push({ href: "/hq/login", label: "HQ sign in", primary: true });
    actions.push({ href: "/branch/login", label: "Branch admin sign in", primary: false });
  } else if (kind === "not_found") {
    actions.push({ href: "https://blessboard.com", label: "Go to BlessBoard home", primary: true });
  } else if (kind === "rate_limited" || kind === "internal_error" || kind === "service_unavailable") {
    actions.push({ href: "/", label: "Try again from home", primary: true });
  } else if (kind === "forbidden" || kind === "validation") {
    actions.push({ href: "/", label: "Back to home", primary: true });
  } else {
    actions.push({ href: "https://blessboard.com", label: "Go to BlessBoard home", primary: true });
  }
  return actions;
}

function churchDisplayName(req) {
  const ctx = req && req.churchContext;
  if (!ctx) return null;
  const branch = ctx.branch;
  const org = ctx.organization;
  const name = (branch && branch.name) || (org && org.name) || null;
  if (!name) return null;
  // Avoid fabricated marketing copy — only pass through known names from context
  return String(name).trim().slice(0, 120) || null;
}

function buildFailureLocals(req, kindKey, opts = {}) {
  const def = FAILURE_KINDS[kindKey] || FAILURE_KINDS.internal_error;
  const shell = resolveShell(req, opts.shell);
  const correlationId = opts.correlationId || getCorrelationId(req);
  const lead = sanitizePublicMessage(opts.lead || opts.message, def.defaultLead);
  const title = sanitizePublicMessage(opts.title, def.title);
  const churchName = opts.churchName != null ? opts.churchName : churchDisplayName(req);
  const actions =
    Array.isArray(opts.actions) && opts.actions.length
      ? opts.actions
      : defaultActions(kindKey, shell);

  return {
    pageTitle: title,
    failureKind: kindKey,
    failureCode: def.code,
    failureStatus: def.status,
    failureIcon: opts.icon || def.icon,
    failureTitle: title,
    failureLead: lead,
    failureActions: actions,
    correlationId,
    churchName: churchName || "Church",
    requestedHost: opts.requestedHost || normalizeHostFromRequest(req),
    requestedSlug: opts.requestedSlug || null,
    shell,
    noindex: true,
    metaDescription: lead,
  };
}

/**
 * Render a BlessBoard failure state. Prefer HTML using the shared unavailable card layout.
 * @returns {import("express").Response}
 */
function renderChurchFailureState(req, res, kindKey, opts = {}) {
  const def = FAILURE_KINDS[kindKey] || FAILURE_KINDS.internal_error;
  const status = Number(opts.status) || def.status;
  const locals = buildFailureLocals(req, kindKey in FAILURE_KINDS ? kindKey : "internal_error", opts);

  if (correlationIdHeader(res, locals.correlationId)) {
    /* set */
  }

  if (wantsJson(req) || opts.forceJson) {
    return res.status(status).json({
      ok: false,
      error: locals.failureCode,
      message: locals.failureLead,
      correlationId: locals.correlationId,
    });
  }

  return res.status(status).render("church/public/failure_state", locals);
}

function correlationIdHeader(res, id) {
  if (!id) return false;
  try {
    if (!res.getHeader("X-Request-Id")) res.setHeader("X-Request-Id", id);
    return true;
  } catch {
    return false;
  }
}

function isQuotaErrorCode(code) {
  return (
    code === "FOUNDATION_MEMBER_LIMIT" ||
    code === "FOUNDATION_ADMIN_LIMIT" ||
    code === "PACKAGE_STORAGE_LIMIT" ||
    code === "PACKAGE_EXTERNAL_EMAIL_LIMIT" ||
    code === "PACKAGE_SCHEDULED_REPORT_LIMIT" ||
    code === "QUOTA_CONFLICT"
  );
}

/**
 * Map a thrown error to a failure kind + safe message.
 */
function mapErrorToFailure(err) {
  if (!err) {
    return { kind: "internal_error", message: FAILURE_KINDS.internal_error.defaultLead };
  }
  const code = err.code || err.name;
  const status = Number(err.status || err.statusCode) || null;

  if (code === PACKAGE_FEATURE_DENIED || code === "PACKAGE_FEATURE_DENIED") {
    return {
      kind: "package_restricted",
      message: sanitizePublicMessage(err.message, FAILURE_KINDS.package_restricted.defaultLead),
    };
  }
  if (isQuotaErrorCode(code)) {
    return {
      kind: "quota_conflict",
      message: sanitizePublicMessage(err.message, FAILURE_KINDS.quota_conflict.defaultLead),
    };
  }
  if (code === "VALIDATION" || status === 400) {
    return {
      kind: "validation",
      message: sanitizePublicMessage(err.message, FAILURE_KINDS.validation.defaultLead),
    };
  }
  if (status === 401 || code === "UNAUTHENTICATED") {
    return { kind: "unauthenticated", message: FAILURE_KINDS.unauthenticated.defaultLead };
  }
  if (status === 403 || code === "FORBIDDEN") {
    return {
      kind: "forbidden",
      message: sanitizePublicMessage(err.message, FAILURE_KINDS.forbidden.defaultLead),
    };
  }
  if (status === 404 || code === "NOT_FOUND") {
    return {
      kind: "not_found",
      message: sanitizePublicMessage(err.message, FAILURE_KINDS.not_found.defaultLead),
    };
  }
  if (status === 429 || code === "RATE_LIMITED") {
    return {
      kind: "rate_limited",
      message: sanitizePublicMessage(err.message, FAILURE_KINDS.rate_limited.defaultLead),
    };
  }
  if (status === 503 || code === "SERVICE_UNAVAILABLE") {
    return {
      kind: "service_unavailable",
      message: sanitizePublicMessage(err.message, FAILURE_KINDS.service_unavailable.defaultLead),
    };
  }
  return {
    kind: "internal_error",
    message: FAILURE_KINDS.internal_error.defaultLead,
  };
}

function logChurchFailure(req, err, mapped) {
  const correlationId = getCorrelationId(req);
  // eslint-disable-next-line no-console
  console.error("[church] request failure", {
    correlationId,
    kind: mapped.kind,
    path: req && (req.originalUrl || req.url),
    method: req && req.method,
    errCode: err && err.code ? String(err.code) : null,
    errName: err && err.name ? String(err.name) : null,
    // Never log full message if it looks like a secret; use sanitized
    message: sanitizePublicMessage(err && err.message, "(redacted)"),
  });
}

/**
 * Express error middleware for BlessBoard church hosts.
 */
function churchFailureErrorHandler(err, req, res, next) {
  if (!req || !req.isChurchHost) {
    return next(err);
  }
  if (res.headersSent) {
    return next(err);
  }
  const mapped = mapErrorToFailure(err);
  logChurchFailure(req, err, mapped);
  return renderChurchFailureState(req, res, mapped.kind, { message: mapped.message });
}

/**
 * Resolve lifecycle unavailable kind from org/branch status.
 */
function unavailableKindFromStatus(orgStatus, branchStatus) {
  if (orgStatus === "dormant") return "organization_dormant";
  if (orgStatus === "suspended") return "organization_suspended";
  if (orgStatus && orgStatus !== "active") return "organization_suspended";
  if (branchStatus === "suspended") return "branch_suspended";
  if (branchStatus && branchStatus !== "active") return "branch_inactive";
  return "service_unavailable";
}

module.exports = {
  FAILURE_KINDS,
  SECRET_LEAK_RE,
  wantsJson,
  sanitizePublicMessage,
  buildFailureLocals,
  renderChurchFailureState,
  mapErrorToFailure,
  churchFailureErrorHandler,
  unavailableKindFromStatus,
  isQuotaErrorCode,
};
