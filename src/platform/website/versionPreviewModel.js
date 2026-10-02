"use strict";

/**
 * Shared tenant website version preview view model (Wave 4B-2).
 */

const { formatWhen } = require("./historyModel");

/**
 * @param {object} version
 * @param {{
 *   productCode?: string,
 *   siteLabel?: string,
 *   historyHref?: string|null,
 *   restoreHref?: string|null,
 *   canRestore?: boolean,
 *   csrfField?: string,
 *   csrfToken?: string,
 * }} input
 */
function buildVersionPreviewView(version, input) {
  const opts = input && typeof input === "object" ? input : {};
  const row = version && typeof version === "object" ? version : {};
  const versionNumber = Number(row.versionNumber) || 0;
  const statusRaw = String(row.status || "").trim().toLowerCase();
  const isLive = statusRaw === "published";
  return {
    productCode: String(opts.productCode || ""),
    siteLabel: String(opts.siteLabel || ""),
    title: "Viewing historical version",
    versionNumber,
    referenceLabel: versionNumber ? `v${versionNumber}` : "—",
    publishedAt: row.publishedAt || null,
    publishedAtLabel: formatWhen(row.publishedAt),
    isLive,
    isReadOnly: true,
    historyHref: opts.historyHref ? String(opts.historyHref) : null,
    restoreHref: opts.restoreHref ? String(opts.restoreHref) : null,
    canRestore: opts.canRestore === true && !isLive && Boolean(opts.restoreHref),
    csrfField: String(opts.csrfField || "_csrf"),
    csrfToken: String(opts.csrfToken || ""),
    intro:
      "This is a read-only snapshot from a published version. The live website and your current draft are unchanged.",
    liveNote: isLive ? "This version is currently live for visitors." : null,
  };
}

module.exports = {
  buildVersionPreviewView,
};
