"use strict";

/**
 * Sanitized host fingerprint for identity storage and logs.
 * Never includes password, user, path, or full URI.
 */

/**
 * @param {string} connectionString
 * @returns {string}
 */
function sanitizeHostFingerprint(connectionString) {
  if (!connectionString || !String(connectionString).trim()) return "(none)";
  let host = "";
  try {
    const u = new URL(String(connectionString).replace(/^postgresql:/i, "postgres:"));
    host = (u.hostname || "").toLowerCase();
  } catch {
    return "(unparseable)";
  }
  if (!host) return "(unparseable)";
  const labels = host.split(".").filter(Boolean);
  if (labels.length === 0) return "(unparseable)";
  if (labels.length === 1) {
    const h = labels[0];
    return h.length <= 3 ? "***" : `${h.slice(0, 2)}***`;
  }
  const first = labels[0];
  const rest = labels.slice(1).join(".");
  const redactedFirst = first.length <= 3 ? "***" : `${first.slice(0, 2)}***`;
  return `${redactedFirst}.${rest}`;
}

module.exports = {
  sanitizeHostFingerprint,
};
