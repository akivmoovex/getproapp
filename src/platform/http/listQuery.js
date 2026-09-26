"use strict";

/**
 * Shared list search / filter / pagination helpers (BlessBoard + ActiveClinic).
 * Server-side clamps only — never trust client limit/offset unbounded.
 */

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LEN = 120;

/**
 * Clamp a limit to [1, maxLimit] with a default when invalid.
 * @param {unknown} raw
 * @param {{ defaultLimit?: number, maxLimit?: number }} [opts]
 * @returns {number}
 */
function clampLimit(raw, opts) {
  const options = opts || {};
  const maxLimit = Math.min(
    Math.max(Number(options.maxLimit) || MAX_PAGE_SIZE, 1),
    MAX_PAGE_SIZE
  );
  const defaultLimit = Math.min(
    Math.max(Number(options.defaultLimit) || DEFAULT_PAGE_SIZE, 1),
    maxLimit
  );
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return defaultLimit;
  return Math.min(Math.floor(n), maxLimit);
}

/**
 * @param {object} [query]
 * @param {{
 *   defaultLimit?: number,
 *   maxLimit?: number,
 *   searchKeys?: string[],
 *   filterKeys?: string[],
 *   sortKeys?: string[],
 *   defaultSort?: string|null,
 * }} [opts]
 * @returns {{
 *   page: number,
 *   limit: number,
 *   offset: number,
 *   q: string|null,
 *   filters: Record<string, string>,
 *   sort: string|null,
 * }}
 */
function parseListQuery(query, opts) {
  const options = opts || {};
  const defaultLimit = Math.min(
    Math.max(Number(options.defaultLimit) || DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE
  );
  const maxLimit = Math.min(
    Math.max(Number(options.maxLimit) || MAX_PAGE_SIZE, 1),
    MAX_PAGE_SIZE
  );

  let page = Math.floor(Number(query && query.page));
  if (!Number.isFinite(page) || page < 1) page = 1;

  const limit = clampLimit(query && (query.limit || query.pageSize), {
    defaultLimit,
    maxLimit,
  });

  const searchKeys = Array.isArray(options.searchKeys)
    ? options.searchKeys
    : ["q", "search", "query"];
  let q = null;
  if (query && typeof query === "object") {
    for (const key of searchKeys) {
      if (!Object.prototype.hasOwnProperty.call(query, key)) continue;
      const raw = String(query[key] == null ? "" : query[key]).trim();
      if (!raw) continue;
      q = sanitizeSearchQuery(raw);
      break;
    }
  }

  const filters = pickAllowedFilters(query, options.filterKeys || []);
  const sort = pickAllowedSort(query, options.sortKeys || [], options.defaultSort);

  return {
    page,
    limit,
    offset: (page - 1) * limit,
    q,
    filters,
    sort,
  };
}

/**
 * @param {unknown} raw
 */
function sanitizeSearchQuery(raw) {
  const s = String(raw == null ? "" : raw)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SEARCH_LEN);
  return s || null;
}

/**
 * @param {object|null|undefined} query
 * @param {string[]} allowedKeys
 */
function pickAllowedFilters(query, allowedKeys) {
  const out = {};
  if (!query || typeof query !== "object" || !Array.isArray(allowedKeys)) {
    return out;
  }
  for (const key of allowedKeys) {
    if (!Object.prototype.hasOwnProperty.call(query, key)) continue;
    const value = query[key];
    if (value == null || value === "") continue;
    if (Array.isArray(value)) {
      const items = value
        .map((v) => String(v).trim())
        .filter(Boolean)
        .slice(0, 20);
      if (items.length) out[key] = items;
      continue;
    }
    const s = String(value).trim().slice(0, 120);
    if (s) out[key] = s;
  }
  return out;
}

/**
 * @param {object|null|undefined} query
 * @param {string[]} allowedSortKeys
 * @param {string|null|undefined} defaultSort
 */
function pickAllowedSort(query, allowedSortKeys, defaultSort) {
  const allowed = new Set(
    (Array.isArray(allowedSortKeys) ? allowedSortKeys : []).map(String)
  );
  const fallback =
    defaultSort && allowed.has(String(defaultSort)) ? String(defaultSort) : null;
  if (!query || typeof query !== "object") return fallback;
  const raw = String(query.sort || query.orderBy || "").trim();
  if (!raw) return fallback;
  if (allowed.size && !allowed.has(raw)) return fallback;
  return raw;
}

/**
 * @param {{ page: number, limit: number, total: number }} input
 */
function buildListPageResult(input) {
  const limit = Math.min(
    Math.max(Number(input.limit) || DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE
  );
  const total = Math.max(0, Math.floor(Number(input.total) || 0));
  const totalPages = Math.max(Math.ceil(total / limit) || 1, 1);
  let page = Math.floor(Number(input.page) || 1);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (page > totalPages) page = totalPages;
  const offset = (page - 1) * limit;
  const from = total === 0 ? 0 : offset + 1;
  const to = total === 0 ? 0 : Math.min(offset + limit, total);
  return {
    page,
    limit,
    total,
    totalPages,
    from,
    to,
    hasPrev: page > 1,
    hasNext: page < totalPages,
    offset,
  };
}

/**
 * @param {string} basePath
 * @param {object} query
 * @param {{ page: number, hasPrev: boolean, hasNext: boolean }} meta
 * @param {{ pageParam?: string, omitKeys?: string[] }} [opts]
 */
function buildListPageUrls(basePath, query, meta, opts) {
  const options = opts || {};
  const pageParam = options.pageParam || "page";
  const omit = new Set(options.omitKeys || []);
  const base = {};
  if (query && typeof query === "object") {
    for (const [key, value] of Object.entries(query)) {
      if (omit.has(key) || key === pageParam) continue;
      if (value == null || value === "") continue;
      base[key] = value;
    }
  }

  function href(page) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(base)) {
      if (Array.isArray(value)) {
        for (const item of value) params.append(key, String(item));
      } else {
        params.set(key, String(value));
      }
    }
    if (page > 1) params.set(pageParam, String(page));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return {
    prevUrl: meta.hasPrev ? href(meta.page - 1) : null,
    nextUrl: meta.hasNext ? href(meta.page + 1) : null,
  };
}

/** Back-compat aliases used by church admin list code. */
function parseAdminListPageParams(query, opts) {
  const parsed = parseListQuery(query, opts);
  return {
    page: parsed.page,
    limit: parsed.limit,
    offset: parsed.offset,
  };
}

const buildAdminListPageResult = buildListPageResult;
const buildAdminListPageUrls = buildListPageUrls;

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_SEARCH_LEN,
  clampLimit,
  parseListQuery,
  sanitizeSearchQuery,
  pickAllowedFilters,
  pickAllowedSort,
  buildListPageResult,
  buildListPageUrls,
  parseAdminListPageParams,
  buildAdminListPageResult,
  buildAdminListPageUrls,
};
