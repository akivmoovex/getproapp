"use strict";

/**
 * Pay-run payment reversal / correction: max age of the **original** ledger line's
 * `payment_date` (calendar days, UTC), unless super_admin bypasses in the route layer.
 *
 * Override with env: FIELD_AGENT_PAY_RUN_REVERSAL_WINDOW_DAYS (integer 1–365).
 */
const DEFAULT_PAY_RUN_REVERSAL_WINDOW_DAYS = 14;

/**
 * @returns {number}
 */
function getPayRunPaymentReversalWindowDays() {
  const raw = process.env.FIELD_AGENT_PAY_RUN_REVERSAL_WINDOW_DAYS;
  if (raw == null || String(raw).trim() === "") {
    return DEFAULT_PAY_RUN_REVERSAL_WINDOW_DAYS;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 365) {
    return DEFAULT_PAY_RUN_REVERSAL_WINDOW_DAYS;
  }
  return Math.floor(n);
}

module.exports = {
  DEFAULT_PAY_RUN_REVERSAL_WINDOW_DAYS,
  getPayRunPaymentReversalWindowDays,
};
