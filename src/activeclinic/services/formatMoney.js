"use strict";

/**
 * Money formatting for ActiveClinic billing
 * Integer minor units → human-readable currency display
 */

/**
 * Format minor currency units to human-readable ZMW (or other currency)
 * @param {number} amountMinor - Amount in minor units (e.g., 10000 = ZMW 100.00)
 * @param {string} [currencyCode='ZMW'] - ISO 4217 currency code
 * @param {boolean} [includeCode=true] - Whether to include currency code
 * @returns {string} Formatted money string (e.g., "ZMW 100.00")
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
 * Format minor currency units for display without currency code
 * @param {number} amountMinor - Amount in minor units
 * @returns {string} Formatted amount (e.g., "100.00")
 */
function formatMoneyPlain(amountMinor) {
  return formatMoney(amountMinor, "ZMW", false);
}

/**
 * Parse user input to minor units
 * @param {string} input - User input (e.g., "100.50" or "100")
 * @returns {number|null} Amount in minor units, or null if invalid
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

module.exports = {
  formatMoney,
  formatMoneyPlain,
  parseMoneyInput,
};
