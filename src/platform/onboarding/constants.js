"use strict";

const PRODUCT = Object.freeze({
  ACTIVECLINIC: "activeclinic",
  BLESSBOARD: "blessboard",
});

const STATUS = Object.freeze({
  NOT_STARTED: "not_started",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  SKIPPED: "skipped",
});

const STEP_KIND = Object.freeze({
  REQUIRED: "required",
  RECOMMENDED: "recommended",
});

const AUDIT_ACTION = Object.freeze({
  EVALUATED: "evaluated",
  RESUMED: "resumed",
  STEP_SKIPPED: "step_skipped",
  COMPLETED: "completed",
  ORG_SKIPPED: "org_skipped",
});

const TERMINAL_STATUSES = Object.freeze([STATUS.COMPLETED, STATUS.SKIPPED]);

const PATHS = Object.freeze({
  [PRODUCT.ACTIVECLINIC]: Object.freeze({
    dashboard: "/app",
    onboarding: "/app/onboarding",
  }),
  [PRODUCT.BLESSBOARD]: Object.freeze({
    dashboard: "/hq",
    onboarding: "/hq/onboarding",
  }),
});

function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(String(status || ""));
}

function pathsForProduct(productCode) {
  return PATHS[String(productCode || "")] || null;
}

module.exports = {
  PRODUCT,
  STATUS,
  STEP_KIND,
  AUDIT_ACTION,
  TERMINAL_STATUSES,
  PATHS,
  isTerminalStatus,
  pathsForProduct,
};
