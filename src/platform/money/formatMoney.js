"use strict";

/**
 * Shared money helpers — integer minor units only.
 * Products keep domain currency defaults and invoice/receipt semantics.
 */

/**
 * Format minor currency units to human-readable display.
 * @param {number} amountMinor
 * @param {string} [currencyCode='ZMW']
 * @param {boolean} [includeCode=true]
 * @returns {string}
 */
function formatMoney(amountMinor, currencyCode = "ZMW", includeCode = true) {
  if (typeof amountMinor !== "number" || isNaN(amountMinor)) {
    return includeCode ? `${currencyCode} 0.00` : "0.00";
  }

  const amountMajor = amountMinor / 100;
  const formatted = amountMajor.toLocaleString("en-ZM", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return includeCode ? `${currencyCode} ${formatted}` : formatted;
}

/**
 * @param {number} amountMinor
 * @returns {string}
 */
function formatMoneyPlain(amountMinor) {
  return formatMoney(amountMinor, "ZMW", false);
}

/**
 * Parse user input to minor units.
 * @param {string} input
 * @returns {number|null}
 */
function parseMoneyInput(input) {
  if (typeof input !== "string" || !input.trim()) {
    return null;
  }

  const cleaned = input.trim().replace(/[,\s]/g, "");
  const parsed = parseFloat(cleaned);
  if (isNaN(parsed) || parsed < 0) {
    return null;
  }
  return Math.round(parsed * 100);
}

/**
 * Structured minor-unit display for catalogue / API payloads.
 * Uses fixed 2dp (no locale grouping) for stable machine-facing strings.
 * @param {unknown} amountMinor
 * @param {string} [currencyCode]
 * @returns {{ amountMinor: number, currencyCode: string, display: string }|null}
 */
function formatMoneyMinor(amountMinor, currencyCode) {
  if (amountMinor == null || amountMinor === "") return null;
  const n = Number(amountMinor);
  if (!Number.isFinite(n)) return null;
  const code = currencyCode || "ZMW";
  const rounded = Math.round(n);
  const major = (rounded / 100).toFixed(2);
  return {
    amountMinor: rounded,
    currencyCode: code,
    display: `${code} ${major}`,
  };
}

module.exports = {
  formatMoney,
  formatMoneyPlain,
  parseMoneyInput,
  formatMoneyMinor,
};
