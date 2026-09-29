"use strict";

/**
 * Shared website media library page view model (Wave 4B-1).
 */

const { renderWebsiteLibrary, LIBRARY_STYLESHEET } = require("./renderWebsiteLibrary");
const libraryModel = require("./libraryModel");

/**
 * @param {{
 *   productCode?: string,
 *   siteLabel?: string,
 *   items?: Array<object>,
 *   basePath?: string,
 *   backHref?: string|null,
 *   uploadAction?: string|null,
 *   canUpload?: boolean,
 *   selectMode?: boolean,
 *   q?: unknown,
 *   kind?: unknown,
 *   csrfField?: string|null,
 *   csrfToken?: string|null,
 *   notice?: string|null,
 *   error?: string|null,
 * }} input
 */
function buildMediaPageView(input) {
  const opts = input && typeof input === "object" ? input : {};
  const basePath = String(opts.basePath || "");
  const selectMode = opts.selectMode === true;
  const library = libraryModel.buildLibraryView({
    items: Array.isArray(opts.items) ? opts.items : [],
    q: opts.q,
    kind: opts.kind,
    basePath: selectMode ? `${basePath}?select=1` : basePath,
    heading: selectMode ? "Select from Media Library" : "Media Library",
    description: selectMode
      ? "Reuse an image already uploaded for this website."
      : "Images belong to this website only. Other sites cannot see or reuse this media.",
    selectMode,
    canUpload: opts.canUpload === true,
    uploadAction: opts.uploadAction || null,
    csrfField: opts.csrfField || "_csrf",
    csrfToken: opts.csrfToken || "",
    foldersEnabled: false,
    searchEnabled: true,
    typeFilterEnabled: true,
  });
  const libraryHtml = renderWebsiteLibrary(library);
  return {
    productCode: String(opts.productCode || ""),
    siteLabel: String(opts.siteLabel || "Website"),
    pageTitle: selectMode ? "Select media" : "Media Library",
    backHref: opts.backHref ? String(opts.backHref) : null,
    backLabel: "Back to editor",
    notice: opts.notice || null,
    error: opts.error || null,
    library,
    libraryHtml,
    libraryStylesheet: LIBRARY_STYLESHEET,
    selectMode,
    canUpload: opts.canUpload === true,
    uploadAction: opts.uploadAction || null,
    csrfField: opts.csrfField || "_csrf",
    csrfToken: opts.csrfToken || "",
  };
}

module.exports = {
  buildMediaPageView,
};
