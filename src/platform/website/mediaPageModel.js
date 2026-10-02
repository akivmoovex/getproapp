"use strict";

/**
 * Shared website media library page view model (Wave 4B-1 / V2.04 Phase 3B).
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
 *   folder?: unknown,
 *   csrfField?: string|null,
 *   csrfToken?: string|null,
 *   notice?: string|null,
 *   error?: string|null,
 *   foldersEnabled?: boolean,
 *   canManageFolders?: boolean,
 *   folders?: Array<object>,
 *   folderCounts?: object,
 *   folderCreateAction?: string|null,
 *   folderRenameAction?: string|null,
 *   folderDeleteAction?: string|null,
 *   moveAction?: string|null,
 *   folderNotice?: string|null,
 * }} input
 */
function buildMediaPageView(input) {
  const opts = input && typeof input === "object" ? input : {};
  const basePath = String(opts.basePath || "");
  const selectMode = opts.selectMode === true;
  const foldersEnabled = opts.foldersEnabled === true;
  const library = libraryModel.buildLibraryView({
    items: Array.isArray(opts.items) ? opts.items : [],
    q: opts.q,
    kind: opts.kind,
    folder: opts.folder,
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
    foldersEnabled,
    canManageFolders: foldersEnabled && opts.canManageFolders !== false && !selectMode,
    folders: Array.isArray(opts.folders) ? opts.folders : [],
    folderCounts: opts.folderCounts && typeof opts.folderCounts === "object" ? opts.folderCounts : {},
    folderCreateAction: opts.folderCreateAction || null,
    folderRenameAction: opts.folderRenameAction || null,
    folderDeleteAction: opts.folderDeleteAction || null,
    moveAction: opts.moveAction || null,
    folderNotice: opts.folderNotice || null,
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
    foldersEnabled,
  };
}

module.exports = {
  buildMediaPageView,
};
