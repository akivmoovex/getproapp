"use strict";

/**
 * Shared Admin Console / Growth list pagination helpers.
 * Default page size 50–100; hard server-side maximum.
 */

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

/**
 * @param {object} [query]
 * @param {{ defaultLimit?: number, maxLimit?: number }} [opts]
 * @returns {{ page: number, limit: number, offset: number }}
 */
function parseAdminListPageParams(query, opts = {}) {
  const defaultLimit = Math.min(
    Math.max(Number(opts.defaultLimit) || DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE
  );
  const maxLimit = Math.min(Math.max(Number(opts.maxLimit) || MAX_PAGE_SIZE, 1), MAX_PAGE_SIZE);

  let page = Math.floor(Number(query && query.page));
  if (!Number.isFinite(page) || page < 1) page = 1;

  let limit = Math.floor(Number(query && query.limit));
  if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;

  return { page, limit, offset: (page - 1) * limit };
}

/**
 * @param {{ page: number, limit: number, total: number }} input
 * @returns {{ page: number, limit: number, total: number, totalPages: number, from: number, to: number, hasPrev: boolean, hasNext: boolean, offset: number }}
 */
function buildAdminListPageResult(input) {
  const limit = Math.min(Math.max(Number(input.limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
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
 * Build Previous/Next URLs preserving existing query filters.
 * @param {string} basePath
 * @param {object} query - current req.query (filters preserved)
 * @param {{ page: number, hasPrev: boolean, hasNext: boolean, totalPages: number }} meta
 * @param {{ pageParam?: string, omitKeys?: string[] }} [opts]
 */
function buildAdminListPageUrls(basePath, query, meta, opts = {}) {
  const pageParam = opts.pageParam || "page";
  const omit = new Set(opts.omitKeys || []);
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

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  parseAdminListPageParams,
  buildAdminListPageResult,
  buildAdminListPageUrls,
};
