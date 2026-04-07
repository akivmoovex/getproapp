"use strict";

/**
 * Bounded in-memory TTL cache for tenant metadata reads (not business/listing data).
 * Disabled when GETPRO_TENANT_META_CACHE_MS=0 (still reads GETPRO_TENANT_STAGE_CACHE_MS for stage).
 */

const MAX_ENTRIES = 200;

/** @type {Map<string, { value: unknown, expires: number }>} */
const store = new Map();

function metaTtlMs() {
  const n = Number(process.env.GETPRO_TENANT_META_CACHE_MS);
  return Number.isFinite(n) && n >= 0 ? n : 60_000;
}

function stageTtlMs() {
  const n = Number(process.env.GETPRO_TENANT_STAGE_CACHE_MS);
  return Number.isFinite(n) && n >= 0 ? n : 30_000;
}

function evictIfNeeded() {
  if (store.size < MAX_ENTRIES) return;
  const first = store.keys().next().value;
  if (first !== undefined) store.delete(first);
}

/**
 * @template T
 * @param {string} key
 * @param {number} ttlMs
 * @param {() => T} compute
 * @returns {T}
 */
function getOrSet(key, ttlMs, compute) {
  if (ttlMs === 0) return compute();
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) {
    return /** @type {T} */ (hit.value);
  }
  if (hit) store.delete(key);
  const value = compute();
  evictIfNeeded();
  store.set(key, { value, expires: now + ttlMs });
  return value;
}

/**
 * Async variant for PostgreSQL-backed tenant metadata (middleware must await).
 * @template T
 * @param {string} key
 * @param {number} ttlMs
 * @param {() => Promise<T>} compute
 * @returns {Promise<T>}
 */
async function getOrSetAsync(key, ttlMs, compute) {
  if (ttlMs === 0) return compute();
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) {
    return /** @type {T} */ (hit.value);
  }
  if (hit) store.delete(key);
  const value = await compute();
  evictIfNeeded();
  store.set(key, { value, expires: now + ttlMs });
  return value;
}

/**
 * Exposed for tests / debugging only.
 */
function __resetTenantMetadataCacheForTests() {
  store.clear();
}

module.exports = {
  metaTtlMs,
  stageTtlMs,
  getOrSet,
  getOrSetAsync,
  __resetTenantMetadataCacheForTests,
};
