"use strict";

/**
 * Shared HQ/Branch/Facility website-scope list presentation (E1).
 * Cards only — no three-column studio. Product adapters supply authorized entries.
 */

const { PRODUCT_CODE } = require("./publicWebsiteUrl");

function normalizePendingCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function publicationLabel(status) {
  const raw = String(status || "").trim().toLowerCase();
  if (!raw) return "Unknown";
  if (raw === "published" || raw === "live" || raw === "active") return "Published";
  if (raw === "draft" || raw === "coming_soon" || raw === "unpublished") return "Draft";
  if (raw === "suspended" || raw === "offline") return "Offline";
  return String(status);
}

/**
 * @param {object} input
 */
function buildWebsiteScopeListPageView(input) {
  const opts = input && typeof input === "object" ? input : {};
  const productCode = String(opts.productCode || "").trim().toLowerCase();
  const entries = Array.isArray(opts.websites) ? opts.websites : [];
  const currentScopeId = String(opts.currentScopeId || "");
  const cards = entries.map((entry) => {
    const id = String((entry && entry.id) || "");
    const pending = normalizePendingCount(entry && entry.pendingChangeCount);
    const pub = publicationLabel(entry && entry.publicationStatus);
    return {
      id,
      name: String((entry && entry.name) || id || "Website"),
      scopeKind: String((entry && entry.scopeKind) || "website"),
      scopeLabel: String((entry && entry.scopeLabel) || ""),
      publicationStatus: String((entry && entry.publicationStatus) || ""),
      publicationLabel: pub,
      pendingChangeCount: pending,
      pendingLabel:
        pending === 1 ? "1 pending change" : `${pending} pending changes`,
      editHref: (entry && entry.editHref) || null,
      liveHref: (entry && entry.liveHref) || null,
      settingsHref: (entry && entry.settingsHref) || null,
      isCurrent: id === currentScopeId || Boolean(entry && entry.isCurrent),
      canEdit: entry && entry.canEdit !== false,
      inheritNote: (entry && entry.inheritNote) || null,
    };
  });
  const productLabel =
    productCode === PRODUCT_CODE.ACTIVECLINIC
      ? "ActiveClinic"
      : productCode === PRODUCT_CODE.BLESSBOARD
        ? "BlessBoard"
        : "Website";
  const multi = cards.length > 1;
  return {
    pageTitle: "Choose Website to Edit",
    productCode,
    productLabel,
    siteLabel: opts.siteLabel || "",
    intro: multi
      ? "Pick a website you are authorized to manage. Each site keeps its own drafts, history, and publish scope."
      : "This is the website you are authorized to manage.",
    safetyNote:
      "Saved drafts stay on their website. Publishing only affects the selected website’s public scope — branches that inherit live HQ content may still show HQ updates after an HQ publish.",
    websites: cards,
    currentScopeId,
    backHref: opts.backHref || null,
    backLabel: opts.backLabel || "Back to editor",
    csrfField: opts.csrfField || "_csrf",
    csrfToken: opts.csrfToken || "",
    notice: opts.notice || null,
    error: opts.error || null,
    multiWebsite: multi,
    hierarchySupported: opts.hierarchySupported !== false,
    hierarchyNote: opts.hierarchyNote || null,
  };
}

module.exports = {
  buildWebsiteScopeListPageView,
  publicationLabel,
  normalizePendingCount,
};
