"use strict";

/**
 * Finance permission aliases + separation-of-duties helpers for giving entries.
 * Canonical keys are finance.*; legacy giving.* accepted for HQ/branch compatibility.
 */

const ERROR_CODES = Object.freeze({
  FINANCE_SELF_APPROVAL_DENIED: "FINANCE_SELF_APPROVAL_DENIED",
  FINANCE_STALE_TRANSITION: "FINANCE_STALE_TRANSITION",
  FINANCE_REASON_REQUIRED: "FINANCE_REASON_REQUIRED",
  FINANCE_HARD_DELETE_DENIED: "FINANCE_HARD_DELETE_DENIED",
  FINANCE_EXPORT_DENIED: "FINANCE_EXPORT_DENIED",
  FINANCE_BANK_DENIED: "FINANCE_BANK_DENIED",
});

/** Map canonical finance permission → accepted aliases (any grant allows). */
const PERMISSION_ALIASES = Object.freeze({
  "finance.transactions.view": Object.freeze([
    "finance.transactions.view",
    "giving.view_summary",
  ]),
  "finance.transactions.create": Object.freeze([
    "finance.transactions.create",
    "giving.record",
  ]),
  "finance.transactions.edit_draft": Object.freeze([
    "finance.transactions.edit_draft",
    "giving.record",
  ]),
  "finance.transactions.submit": Object.freeze([
    "finance.transactions.submit",
    "giving.submit",
  ]),
  "finance.transactions.approve": Object.freeze([
    "finance.transactions.approve",
    "giving.approve",
  ]),
  "finance.transactions.reject": Object.freeze([
    "finance.transactions.reject",
    "giving.approve",
  ]),
  "finance.transactions.adjust": Object.freeze(["finance.transactions.adjust"]),
  "finance.transactions.void": Object.freeze([
    "finance.transactions.void",
    "giving.void",
  ]),
  "finance.transactions.reverse": Object.freeze(["finance.transactions.reverse"]),
  "finance.reports.view": Object.freeze([
    "finance.reports.view",
    "giving.view_summary",
  ]),
  "finance.data.export": Object.freeze(["finance.data.export"]),
  "finance.bank_details.view": Object.freeze(["finance.bank_details.view"]),
  "finance.settings.manage": Object.freeze(["finance.settings.manage"]),
  "finance.welfare_instructions.view": Object.freeze([
    "finance.welfare_instructions.view",
  ]),
  "finance.welfare_disbursement.record": Object.freeze([
    "finance.welfare_disbursement.record",
  ]),
});

function aliasesFor(permissionKey) {
  const key = String(permissionKey || "").trim();
  return PERMISSION_ALIASES[key] || Object.freeze([key]);
}

function sameUser(a, b) {
  if (a == null || b == null || a === "" || b === "") return false;
  return String(a) === String(b);
}

/**
 * Evaluate whether actor may approve this entry (SoD).
 * @returns {{ ok: true } | { ok: false, code: string, safeMessage: string }}
 */
function evaluateApprovalSeparation(entry, actorUserId) {
  const actor = String(actorUserId || "").trim();
  if (!entry || !actor) {
    return {
      ok: false,
      code: ERROR_CODES.FINANCE_SELF_APPROVAL_DENIED,
      safeMessage: "You cannot approve this item.",
    };
  }
  if (sameUser(entry.recordedByUserId, actor)) {
    return {
      ok: false,
      code: ERROR_CODES.FINANCE_SELF_APPROVAL_DENIED,
      safeMessage: "You cannot approve an item you created.",
    };
  }
  if (sameUser(entry.submittedByUserId, actor)) {
    return {
      ok: false,
      code: ERROR_CODES.FINANCE_SELF_APPROVAL_DENIED,
      safeMessage: "You cannot approve an item you submitted.",
    };
  }
  if (sameUser(entry.adjustedByUserId, actor)) {
    return {
      ok: false,
      code: ERROR_CODES.FINANCE_SELF_APPROVAL_DENIED,
      safeMessage: "You cannot approve an adjustment you created.",
    };
  }
  if (sameUser(entry.lastMateriallyEditedByUserId, actor)) {
    return {
      ok: false,
      code: ERROR_CODES.FINANCE_SELF_APPROVAL_DENIED,
      safeMessage: "You cannot approve an item you materially edited after submission.",
    };
  }
  return { ok: true };
}

/**
 * Safe browser-facing message for finance errors (no actor IDs).
 */
function safeFinanceErrorMessage(code) {
  switch (String(code || "")) {
    case ERROR_CODES.FINANCE_SELF_APPROVAL_DENIED:
      return "You cannot approve this item because of separation-of-duties rules.";
    case ERROR_CODES.FINANCE_STALE_TRANSITION:
      return "This item has already changed. Refresh and try again.";
    case ERROR_CODES.FINANCE_REASON_REQUIRED:
      return "A reason is required for this action.";
    case ERROR_CODES.FINANCE_HARD_DELETE_DENIED:
      return "Approved finance records cannot be deleted.";
    case ERROR_CODES.FINANCE_EXPORT_DENIED:
      return "Export is not permitted.";
    case ERROR_CODES.FINANCE_BANK_DENIED:
      return "Bank details are not available.";
    default:
      return "This finance action is not permitted.";
  }
}

module.exports = {
  ERROR_CODES,
  PERMISSION_ALIASES,
  aliasesFor,
  sameUser,
  evaluateApprovalSeparation,
  safeFinanceErrorMessage,
};
