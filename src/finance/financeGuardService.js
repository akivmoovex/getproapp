"use strict";

/**
 * Central finance mutation guards: hard-close, accounting period lock, reversal window, and role-aligned helpers.
 * Controllers keep HTTP concerns; repositories call this module so rules stay consistent.
 */

const { getPayRunPaymentReversalWindowDays } = require("../config/fieldAgentPayRun");
const accountingPeriodsRepo = require("../db/pg/accountingPeriodsRepo");
const { canPayRunOverrideReversalWindow, canPayRunCloseRun } = require("../auth/roles");

const PAY_RUN_CLOSED_ERROR = "PAY_RUN_CLOSED";
const PAY_RUN_CLOSED_MESSAGE = "Pay run is closed and cannot be modified";

const REVERSAL_WINDOW_EXPIRED_ERROR = "REVERSAL_WINDOW_EXPIRED";
const REVERSAL_WINDOW_EXPIRED_MESSAGE = "Reversal window expired. Create adjustment in next period.";

const ACCOUNTING_PERIOD_LOCKED_ERROR = "ACCOUNTING_PERIOD_LOCKED";
const ACCOUNTING_PERIOD_LOCKED_MESSAGE = "Accounting period is locked";

/**
 * @param {Record<string, unknown> | null | undefined} row
 * @returns {boolean}
 */
function payRunIsHardClosed(row) {
  return !!(row && row.closed_at != null);
}

/**
 * @param {Record<string, unknown> | null | undefined} run
 * @returns {string | null}
 */
function payRunAccountingPeriodKey(run) {
  return accountingPeriodsRepo.accountingPeriodKeyFromPeriodStart(run && run.period_start);
}

/**
 * @param {Record<string, unknown>} row — payment ledger row
 * @returns {string} YYYY-MM-DD or ""
 */
function paymentRowPaymentDateAsYmd(row) {
  const pd = row && row.payment_date;
  if (pd == null) return "";
  if (typeof pd === "string") return String(pd).slice(0, 10);
  if (Object.prototype.toString.call(pd) === "[object Date]") {
    const dt = /** @type {Date} */ (pd);
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const d = String(dt.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(pd).slice(0, 10);
}

/**
 * Whole calendar days (UTC) from payment date to today. Future-dated payments count as age 0.
 * @param {string} ymd
 * @returns {number}
 */
function calendarAgeDaysFromTodayUtc(ymd) {
  const s = String(ymd).slice(0, 10);
  const parts = s.split("-");
  if (parts.length !== 3) return Number.POSITIVE_INFINITY;
  const y = Number(parts[0]);
  const mo = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return Number.POSITIVE_INFINITY;
  const pay = Date.UTC(y, mo - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diff = Math.floor((today - pay) / 86400000);
  return diff < 0 ? 0 : diff;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} executor
 * @param {number} tenantId
 * @param {Record<string, unknown> | null | undefined} run
 * @returns {Promise<{ ok: true } | { ok: false, error: string, message: string }>}
 */
async function assertAccountingPeriodNotLockedForPayRun(executor, tenantId, run) {
  const key = payRunAccountingPeriodKey(run);
  if (!key) return { ok: true };
  const locked = await accountingPeriodsRepo.isAccountingPeriodLocked(executor, tenantId, key);
  if (locked) {
    return { ok: false, error: ACCOUNTING_PERIOD_LOCKED_ERROR, message: ACCOUNTING_PERIOD_LOCKED_MESSAGE };
  }
  return { ok: true };
}

/**
 * @param {Record<string, unknown> | null | undefined} run
 * @returns {{ ok: true } | { ok: false, error: string, message: string }}
 */
function assertPayRunNotHardClosed(run) {
  if (payRunIsHardClosed(run)) {
    return { ok: false, error: PAY_RUN_CLOSED_ERROR, message: PAY_RUN_CLOSED_MESSAGE };
  }
  return { ok: true };
}

/**
 * Hard-close + accounting period lock (e.g. mark-paid, add-payment preamble).
 * @param {import("pg").Pool | import("pg").PoolClient} executor
 * @param {number} tenantId
 * @param {Record<string, unknown>} run
 */
async function assertHardCloseAndPeriodUnlocked(executor, tenantId, run) {
  const hc = assertPayRunNotHardClosed(run);
  if (!hc.ok) return hc;
  return assertAccountingPeriodNotLockedForPayRun(executor, tenantId, run);
}

/**
 * @param {{
 *   original: Record<string, unknown>,
 *   run: Record<string, unknown>,
 *   bypassReversalWindow?: boolean,
 *   windowDays: number,
 * }} p
 * @returns {{ ok: true } | { ok: false, error: string, message: string }}
 */
function validateReversalWindowForOriginalPayment(p) {
  if (p.bypassReversalWindow) {
    return { ok: true };
  }
  const ymd = paymentRowPaymentDateAsYmd(p.original);
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    return { ok: false, error: "INVALID_DATE", message: "Invalid original payment date." };
  }
  const age = calendarAgeDaysFromTodayUtc(ymd);
  if (age > p.windowDays) {
    return { ok: false, error: REVERSAL_WINDOW_EXPIRED_ERROR, message: REVERSAL_WINDOW_EXPIRED_MESSAGE };
  }
  return { ok: true };
}

/**
 * @param {Record<string, unknown>} original
 * @param {number} windowDays
 * @returns {boolean}
 */
function paymentExceedsReversalWindowDays(original, windowDays) {
  const w = Number(windowDays);
  if (!Number.isFinite(w) || w < 1) return false;
  const ymd = paymentRowPaymentDateAsYmd(original);
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  return calendarAgeDaysFromTodayUtc(ymd) > w;
}

function getConfiguredReversalWindowDays() {
  return getPayRunPaymentReversalWindowDays();
}

/**
 * Routes should derive bypass from this helper so role rules stay aligned with {@link validateReversalWindowForOriginalPayment}.
 * @param {unknown} role
 * @returns {boolean}
 */
function reversalWindowBypassGrantedForRole(role) {
  return canPayRunOverrideReversalWindow(role);
}

/**
 * Soft-close route permission (same rule as `requirePayRunClose` middleware).
 * @param {unknown} role
 * @returns {boolean}
 */
function softClosePermissionGrantedForRole(role) {
  return canPayRunCloseRun(role);
}

/**
 * @param {Record<string, unknown>} run
 * @returns {{ ok: true } | { ok: false, error: string, message: string }}
 */
function assertPayRunStatusAllowsLedgerPaymentOrReversal(run) {
  const st = String(run.status || "");
  if (st !== "approved" && st !== "paid") {
    return { ok: false, error: "INVALID_STATE", message: "Ledger changes require an approved or paid pay run." };
  }
  return { ok: true };
}

/**
 * @param {Record<string, unknown>} run
 * @returns {{ ok: true } | { ok: false, error: string, message: string }}
 */
function assertPayRunStatusAllowsRecordingPayment(run) {
  const st = String(run.status || "");
  if (st !== "approved" && st !== "paid") {
    return { ok: false, error: "INVALID_STATE", message: "Payments can only be recorded for approved or paid runs." };
  }
  return { ok: true };
}

/**
 * Record new payment line: hard-close, period lock, approved/paid.
 * @param {import("pg").Pool | import("pg").PoolClient} executor
 * @param {number} tenantId
 * @param {Record<string, unknown>} run
 */
async function assertPaymentRecordingGuards(executor, tenantId, run) {
  const hc = assertPayRunNotHardClosed(run);
  if (!hc.ok) return hc;
  const ap = await assertAccountingPeriodNotLockedForPayRun(executor, tenantId, run);
  if (!ap.ok) return ap;
  return assertPayRunStatusAllowsRecordingPayment(run);
}

/**
 * Reverse / correct: hard-close, period lock, status, reversal window.
 * @param {import("pg").Pool | import("pg").PoolClient} executor
 * @param {number} tenantId
 * @param {Record<string, unknown>} run
 * @param {Record<string, unknown>} original
 * @param {boolean} bypassReversalWindow
 */
async function assertReverseOrCorrectGuards(executor, tenantId, run, original, bypassReversalWindow) {
  const hc = assertPayRunNotHardClosed(run);
  if (!hc.ok) return hc;
  const ap = await assertAccountingPeriodNotLockedForPayRun(executor, tenantId, run);
  if (!ap.ok) return ap;
  const st = assertPayRunStatusAllowsLedgerPaymentOrReversal(run);
  if (!st.ok) return st;
  const windowDays = getConfiguredReversalWindowDays();
  return validateReversalWindowForOriginalPayment({
    original,
    run,
    bypassReversalWindow,
    windowDays,
  });
}

/**
 * @param {Record<string, unknown>} run — pay run row before soft-close
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function assertSoftCloseStatusPreconditions(run) {
  const st = String(run.status || "");
  if (!["locked", "approved", "paid"].includes(st)) {
    return { ok: false, error: "INVALID_STATUS_FOR_CLOSE" };
  }
  return { ok: true };
}

module.exports = {
  PAY_RUN_CLOSED_ERROR,
  PAY_RUN_CLOSED_MESSAGE,
  REVERSAL_WINDOW_EXPIRED_ERROR,
  REVERSAL_WINDOW_EXPIRED_MESSAGE,
  ACCOUNTING_PERIOD_LOCKED_ERROR,
  ACCOUNTING_PERIOD_LOCKED_MESSAGE,
  payRunIsHardClosed,
  payRunAccountingPeriodKey,
  paymentRowPaymentDateAsYmd,
  calendarAgeDaysFromTodayUtc,
  assertAccountingPeriodNotLockedForPayRun,
  assertPayRunNotHardClosed,
  assertHardCloseAndPeriodUnlocked,
  validateReversalWindowForOriginalPayment,
  paymentExceedsReversalWindowDays,
  getConfiguredReversalWindowDays,
  reversalWindowBypassGrantedForRole,
  softClosePermissionGrantedForRole,
  assertPayRunStatusAllowsLedgerPaymentOrReversal,
  assertPayRunStatusAllowsRecordingPayment,
  assertPaymentRecordingGuards,
  assertReverseOrCorrectGuards,
  assertSoftCloseStatusPreconditions,
};
