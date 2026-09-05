"use strict";

/**
 * Shared content/media library model for the V7 website engine.
 *
 * Storage stays product-owned: ActiveClinic reads platform.website_media and
 * BlessBoard reads blessboard.media_assets. Each product adapts its rows into
 * one canonical card shape here, so search, type filtering, empty states and
 * the rendered UI behave identically without duplicating either store.
 *
 * Normalising is also the tenant-safety boundary: internal columns
 * (storage keys, content hashes, organization and instance ids) are dropped so
 * they never reach a template or a JSON response.
 */

const LIBRARY_KIND = Object.freeze({
  IMAGE: "image",
  DOCUMENT: "document",
  VIDEO: "video_url",
});

const LIBRARY_KIND_LABEL = Object.freeze({
  [LIBRARY_KIND.IMAGE]: "Images",
  [LIBRARY_KIND.DOCUMENT]: "Documents",
  [LIBRARY_KIND.VIDEO]: "Videos",
});

const LIBRARY_STATE = Object.freeze({
  READY: "ready",
  EMPTY: "empty",
  NO_RESULTS: "no-results",
  ERROR: "error",
});

const LIBRARY_MODE = Object.freeze({
  GRID: "grid",
  LIST: "list",
});

const MAX_QUERY_LENGTH = 100;

/** Folder rail selections that are views rather than folder rows. */
const FOLDER_ALL = "all";
const FOLDER_UNFILED = "unfiled";
const MAX_FOLDER_NAME_LENGTH = 80;

/** Empty-state copy, keyed by state. Products may override per surface. */
const EMPTY_STATE_COPY = Object.freeze({
  [LIBRARY_STATE.EMPTY]: Object.freeze({
    title: "No files yet",
    body: "Upload an image to reuse it across your website.",
  }),
  [LIBRARY_STATE.NO_RESULTS]: Object.freeze({
    title: "No matching files",
    body: "Try a different filename or file type.",
  }),
  [LIBRARY_STATE.ERROR]: Object.freeze({
    title: "Library unavailable",
    body: "We could not load your files. Try again in a moment.",
  }),
});

function text(value, max) {
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : 240;
  const raw = String(value == null ? "" : value)
    .replace(/\s+/g, " ")
    .trim();
  return raw.length > limit ? raw.slice(0, limit) : raw;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function formatDate(value) {
  if (!value) return "";
  const when = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(when.getTime())) return "";
  return when.toISOString().slice(0, 10);
}

/**
 * Map a product MIME type or kind onto a canonical library kind.
 * @param {{ mediaKind?: unknown, category?: unknown, mimeType?: unknown }} raw
 * @returns {string}
 */
function resolveKind(raw) {
  const declared = String((raw && (raw.mediaKind || raw.category)) || "")
    .trim()
    .toLowerCase();
  if (declared === LIBRARY_KIND.VIDEO || declared === "video") return LIBRARY_KIND.VIDEO;
  if (declared === LIBRARY_KIND.DOCUMENT) return LIBRARY_KIND.DOCUMENT;
  if (declared === LIBRARY_KIND.IMAGE) return LIBRARY_KIND.IMAGE;

  const mime = String((raw && raw.mimeType) || "").trim().toLowerCase();
  if (mime.startsWith("image/")) return LIBRARY_KIND.IMAGE;
  if (mime.startsWith("video/")) return LIBRARY_KIND.VIDEO;
  if (mime) return LIBRARY_KIND.DOCUMENT;
  return LIBRARY_KIND.DOCUMENT;
}

/**
 * Canonical library card. Internal storage fields are intentionally dropped.
 *
 * @param {object} raw product media row (already tenant-scoped by the caller)
 * @param {{ previewUrl?: string|null, detailsUrl?: string|null, usageLabel?: string|null }} [extra]
 */
function normalizeLibraryItem(raw, extra) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id == null ? "" : raw.id).trim();
  if (!id) return null;

  const opts = extra && typeof extra === "object" ? extra : {};
  const kind = resolveKind(raw);
  const title = text(raw.originalFilename || raw.title || raw.filename, 180) || "Untitled file";
  const previewUrl =
    opts.previewUrl != null
      ? opts.previewUrl
      : raw.previewUrl || raw.publicSrc || raw.deliveryPath || null;
  const visibility = String(raw.visibility || "").trim().toLowerCase() || null;
  const sizeBytes = Number(raw.sizeBytes) || 0;

  return {
    id,
    title,
    kind,
    kindLabel: LIBRARY_KIND_LABEL[kind] || "Files",
    mimeType: text(raw.mimeType, 120) || "",
    sizeBytes,
    sizeLabel: formatBytes(sizeBytes),
    previewUrl: previewUrl ? String(previewUrl) : null,
    detailsUrl: opts.detailsUrl ? String(opts.detailsUrl) : null,
    // Alt text is asset-scoped in ActiveClinic and section-scoped in
    // BlessBoard, so it is optional and never invented here.
    altText: raw.altText == null ? null : text(raw.altText, 240),
    supportsAltText: raw.altText !== undefined,
    visibility,
    width: Number(raw.widthPx) || null,
    height: Number(raw.heightPx) || null,
    createdAtLabel: formatDate(raw.createdAt),
    usageLabel: opts.usageLabel ? text(opts.usageLabel, 180) : null,
    // Flat folder assignment; null means Unfiled.
    folderId: raw.folderId == null ? null : String(raw.folderId),
  };
}

/**
 * @param {Array<object>} rows
 * @param {(row: object) => object} [decorate] per-row preview/details/usage
 * @returns {Array<object>}
 */
function normalizeLibraryItems(rows, decorate) {
  const list = Array.isArray(rows) ? rows : [];
  const out = [];
  for (const row of list) {
    const extra = typeof decorate === "function" ? decorate(row) : null;
    const item = normalizeLibraryItem(row, extra);
    if (item) out.push(item);
  }
  return out;
}

/** @param {unknown} value */
function normalizeQuery(value) {
  return String(value == null ? "" : value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

/**
 * Folder selection: "all", "unfiled", or a folder id.
 * @param {unknown} value
 */
function normalizeFolderFilter(value) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw || raw.toLowerCase() === FOLDER_ALL) return FOLDER_ALL;
  if (raw.toLowerCase() === FOLDER_UNFILED) return FOLDER_UNFILED;
  return raw;
}

/** @param {unknown} value */
function normalizeKindFilter(value) {
  const raw = String(value == null ? "" : value).trim().toLowerCase();
  if (raw === LIBRARY_KIND.IMAGE) return LIBRARY_KIND.IMAGE;
  if (raw === LIBRARY_KIND.DOCUMENT) return LIBRARY_KIND.DOCUMENT;
  if (raw === LIBRARY_KIND.VIDEO || raw === "video") return LIBRARY_KIND.VIDEO;
  return "";
}

/**
 * Filename search plus type and folder filtering, shared by both products.
 * @param {Array<object>} items normalized items
 * @param {{ q?: unknown, kind?: unknown, folder?: unknown }} [filters]
 */
function filterLibraryItems(items, filters) {
  const list = Array.isArray(items) ? items : [];
  const opts = filters && typeof filters === "object" ? filters : {};
  const q = normalizeQuery(opts.q).toLowerCase();
  const kind = normalizeKindFilter(opts.kind);
  const folder = opts.folder === undefined ? FOLDER_ALL : normalizeFolderFilter(opts.folder);

  return list.filter((item) => {
    if (!item) return false;
    if (folder === FOLDER_UNFILED && item.folderId) return false;
    if (folder !== FOLDER_ALL && folder !== FOLDER_UNFILED && item.folderId !== folder) return false;
    if (kind && item.kind !== kind) return false;
    if (q) {
      const haystack = `${item.title || ""} ${item.altText || ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

function appendQuery(basePath, params) {
  const base = String(basePath == null ? "" : basePath);
  const pairs = [];
  for (const key of Object.keys(params || {})) {
    const value = params[key];
    if (value == null || value === "") continue;
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  if (!pairs.length) return base;
  return `${base}${base.includes("?") ? "&" : "?"}${pairs.join("&")}`;
}

/**
 * Build the full shared library view model.
 *
 * @param {{
 *   items?: Array<object>,
 *   q?: unknown,
 *   kind?: unknown,
 *   basePath?: string,
 *   mode?: string,
 *   error?: boolean,
 *   selectMode?: boolean,
 *   canUpload?: boolean,
 *   uploadAction?: string|null,
 *   csrfField?: string|null,
 *   csrfToken?: string|null,
 *   heading?: string|null,
 *   description?: string|null,
 *   emptyState?: object|null,
 *   searchEnabled?: boolean,
 *   typeFilterEnabled?: boolean,
 * }} input
 */
function buildLibraryView(input) {
  const opts = input && typeof input === "object" ? input : {};
  const all = Array.isArray(opts.items) ? opts.items.filter(Boolean) : [];
  const q = normalizeQuery(opts.q);
  const kind = normalizeKindFilter(opts.kind);
  const folder = normalizeFolderFilter(opts.folder);
  const basePath = String(opts.basePath || "");
  const isError = opts.error === true;

  const items = isError ? [] : filterLibraryItems(all, { q, kind, folder });

  let state = LIBRARY_STATE.READY;
  if (isError) state = LIBRARY_STATE.ERROR;
  else if (!all.length) state = LIBRARY_STATE.EMPTY;
  else if (!items.length) state = LIBRARY_STATE.NO_RESULTS;

  const counts = { total: all.length };
  for (const value of Object.values(LIBRARY_KIND)) {
    counts[value] = all.filter((item) => item && item.kind === value).length;
  }

  const folderParam = folder === FOLDER_ALL ? "" : folder;

  // Only offer type tabs for kinds the tenant actually has.
  const kindFilters = [
    {
      key: "",
      label: "All",
      count: counts.total,
      href: appendQuery(basePath, { q, folder: folderParam }),
      current: !kind,
    },
  ];
  for (const value of Object.values(LIBRARY_KIND)) {
    if (!counts[value]) continue;
    kindFilters.push({
      key: value,
      label: LIBRARY_KIND_LABEL[value],
      count: counts[value],
      href: appendQuery(basePath, { q, folder: folderParam, type: value }),
      current: kind === value,
    });
  }

  // Flat folder rail: All Media, Unfiled, then each folder by name.
  const folderRows = Array.isArray(opts.folders) ? opts.folders.filter(Boolean) : [];
  const folderCounts = opts.folderCounts && typeof opts.folderCounts === "object"
    ? opts.folderCounts
    : {};
  const foldersEnabled = opts.foldersEnabled === true;

  const folderFilters = [];
  if (foldersEnabled) {
    folderFilters.push({
      key: FOLDER_ALL,
      label: "All Media",
      count: Number(folderCounts[FOLDER_ALL]) || 0,
      href: appendQuery(basePath, { q, type: kind }),
      current: folder === FOLDER_ALL,
      isFolder: false,
    });
    folderFilters.push({
      key: FOLDER_UNFILED,
      label: "Unfiled",
      count: Number(folderCounts[FOLDER_UNFILED]) || 0,
      href: appendQuery(basePath, { q, type: kind, folder: FOLDER_UNFILED }),
      current: folder === FOLDER_UNFILED,
      isFolder: false,
    });
    for (const row of folderRows) {
      const id = String(row.id || "");
      if (!id) continue;
      folderFilters.push({
        key: id,
        label: text(row.name, MAX_FOLDER_NAME_LENGTH) || "Untitled folder",
        count: Number(folderCounts[id]) || 0,
        href: appendQuery(basePath, { q, type: kind, folder: id }),
        current: folder === id,
        isFolder: true,
      });
    }
  }

  const activeFolder = folderFilters.find((entry) => entry.current) || null;
  // Move targets exclude the folder an asset already sits in, which is applied
  // per card in the template.
  const moveTargets = foldersEnabled
    ? [{ key: "", label: "Unfiled" }].concat(
        folderRows
          .filter((row) => row && row.id)
          .map((row) => ({
            key: String(row.id),
            label: text(row.name, MAX_FOLDER_NAME_LENGTH) || "Untitled folder",
          }))
      )
    : [];

  const emptyState = Object.assign(
    {},
    EMPTY_STATE_COPY[state] || EMPTY_STATE_COPY[LIBRARY_STATE.EMPTY],
    opts.emptyState && typeof opts.emptyState === "object" ? opts.emptyState : {}
  );

  return {
    heading: opts.heading == null ? "Media Library" : String(opts.heading),
    description: opts.description == null ? "" : String(opts.description),
    mode: opts.mode === LIBRARY_MODE.LIST ? LIBRARY_MODE.LIST : LIBRARY_MODE.GRID,
    items,
    counts,
    total: counts.total,
    filteredTotal: items.length,
    q,
    kind,
    folder,
    foldersEnabled,
    folderFilters,
    activeFolder,
    activeFolderLabel: activeFolder ? activeFolder.label : "All Media",
    moveTargets,
    canManageFolders: foldersEnabled && opts.canManageFolders === true,
    folderCreateAction: opts.folderCreateAction ? String(opts.folderCreateAction) : null,
    folderRenameAction: opts.folderRenameAction ? String(opts.folderRenameAction) : null,
    folderDeleteAction: opts.folderDeleteAction ? String(opts.folderDeleteAction) : null,
    moveAction: opts.moveAction ? String(opts.moveAction) : null,
    maxFolderNameLength: MAX_FOLDER_NAME_LENGTH,
    folderNotice: opts.folderNotice ? String(opts.folderNotice) : null,
    // "All" plus a single kind is not a choice, so offer tabs only from two
    // distinct kinds upwards.
    kindFilters: kindFilters.length > 2 ? kindFilters : [],
    state,
    isEmpty: state !== LIBRARY_STATE.READY,
    emptyState,
    basePath,
    searchEnabled: opts.searchEnabled !== false && counts.total > 0,
    typeFilterEnabled: opts.typeFilterEnabled !== false,
    selectMode: opts.selectMode === true,
    canUpload: opts.canUpload === true,
    uploadAction: opts.uploadAction ? String(opts.uploadAction) : null,
    csrfField: opts.csrfField ? String(opts.csrfField) : null,
    csrfToken: opts.csrfToken ? String(opts.csrfToken) : null,
  };
}

module.exports = {
  LIBRARY_KIND,
  LIBRARY_KIND_LABEL,
  LIBRARY_STATE,
  LIBRARY_MODE,
  MAX_QUERY_LENGTH,
  FOLDER_ALL,
  FOLDER_UNFILED,
  MAX_FOLDER_NAME_LENGTH,
  normalizeFolderFilter,
  EMPTY_STATE_COPY,
  formatBytes,
  formatDate,
  resolveKind,
  normalizeLibraryItem,
  normalizeLibraryItems,
  normalizeQuery,
  normalizeKindFilter,
  filterLibraryItems,
  buildLibraryView,
};
