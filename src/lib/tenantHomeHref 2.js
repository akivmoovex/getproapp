"use strict";

/**
 * Tenant-prefixed public home URL for links (path prefix or absolute legacy URL).
 * @param {string | null | undefined} prefix
 * @returns {string}
 */
function tenantHomeHrefFromPrefix(prefix) {
  if (prefix === "" || prefix == null) return "/";
  const ps = String(prefix);
  if (ps.startsWith("http")) return `${ps.replace(/\/$/, "")}/`;
  return `${ps}/`;
}

module.exports = { tenantHomeHrefFromPrefix };
