"use strict";

/**
 * BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST — pilot-safe hostname gate.
 *
 * Used only when BLESSBOARD_TENANT_ROUTING_MODE=authoritative.
 * Empty / unset → fail-closed (no estate-wide serve).
 * Explicit hostnames → exact match after normalizeHostname.
 * Lone token "*" → estate allow-all (signed cutover only; design-approved).
 *
 * Never inferred from NODE_ENV, org key, Git branch, or partial wildcards (*.example).
 */

const { normalizeHostname } = require("../../platform/hostname");

const ENV_KEY = "BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST";
const ESTATE_ALL_TOKEN = "*";

const ALLOWLIST_MODE = Object.freeze({
  EMPTY: "empty",
  HOSTS: "hosts",
  ALL: "all",
});

const ALLOWLIST_DECISION = Object.freeze({
  N_A: "n/a",
  ALLOW: "allow",
  DENY: "deny",
  DENY_EMPTY: "deny_empty",
});

let warnedEmptyAuthoritative = false;
let warnedInvalidEntries = false;

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   mode: 'empty'|'hosts'|'all',
 *   hosts: string[],
 *   hostSet: Set<string>,
 *   invalidEntryCount: number,
 *   rawConfigured: boolean,
 * }}
 */
function parseAuthoritativeHostAllowlist(env) {
  const source = env || process.env;
  const raw = String(source[ENV_KEY] || "");
  const rawConfigured = raw.trim() !== "";
  if (!rawConfigured) {
    return {
      mode: ALLOWLIST_MODE.EMPTY,
      hosts: [],
      hostSet: new Set(),
      invalidEntryCount: 0,
      rawConfigured: false,
    };
  }

  const parts = raw.split(/[,\s]+/).map((p) => p.trim()).filter(Boolean);
  let invalidEntryCount = 0;
  /** @type {string[]} */
  const hosts = [];
  let sawEstateAll = false;

  for (const part of parts) {
    if (part === ESTATE_ALL_TOKEN) {
      sawEstateAll = true;
      continue;
    }
    const normalized = normalizeHostname(part);
    if (!normalized.ok) {
      invalidEntryCount += 1;
      continue;
    }
    hosts.push(normalized.hostname);
  }

  if (sawEstateAll) {
    return {
      mode: ALLOWLIST_MODE.ALL,
      hosts: [],
      hostSet: new Set(),
      invalidEntryCount,
      rawConfigured: true,
    };
  }

  const unique = [...new Set(hosts)];
  if (unique.length === 0) {
    return {
      mode: ALLOWLIST_MODE.EMPTY,
      hosts: [],
      hostSet: new Set(),
      invalidEntryCount,
      rawConfigured: true,
    };
  }

  return {
    mode: ALLOWLIST_MODE.HOSTS,
    hosts: unique,
    hostSet: new Set(unique),
    invalidEntryCount,
    rawConfigured: true,
  };
}

/**
 * @param {{ mode: string, hostSet: Set<string> }} allowlist
 * @param {unknown} hostname
 * @returns {'n/a'|'allow'|'deny'|'deny_empty'}
 */
function decideAuthoritativeHostAllowlist(allowlist, hostname) {
  const list = allowlist && typeof allowlist === "object" ? allowlist : null;
  if (!list) return ALLOWLIST_DECISION.DENY_EMPTY;

  if (list.mode === ALLOWLIST_MODE.ALL) {
    return ALLOWLIST_DECISION.ALLOW;
  }
  if (list.mode === ALLOWLIST_MODE.EMPTY) {
    return ALLOWLIST_DECISION.DENY_EMPTY;
  }

  const normalized = normalizeHostname(hostname);
  if (!normalized.ok) {
    return ALLOWLIST_DECISION.DENY;
  }
  if (list.hostSet && list.hostSet.has(normalized.hostname)) {
    return ALLOWLIST_DECISION.ALLOW;
  }
  return ALLOWLIST_DECISION.DENY;
}

/**
 * Safe one-shot warnings (no secrets; hostnames OK).
 * @param {{ mode: string, invalidEntryCount: number, hosts: string[] }} allowlist
 * @param {(line: string) => void} [logFn]
 */
function warnAuthoritativeAllowlistIfNeeded(allowlist, logFn) {
  const out = typeof logFn === "function" ? logFn : (msg) => console.warn(msg);
  if (allowlist && allowlist.invalidEntryCount > 0 && !warnedInvalidEntries) {
    warnedInvalidEntries = true;
    out(
      `[blessboard-tenant-routing] ${ENV_KEY} dropped ${allowlist.invalidEntryCount} invalid hostname entr(y/ies); using valid entries only.`
    );
  }
  if (allowlist && allowlist.mode === ALLOWLIST_MODE.EMPTY && !warnedEmptyAuthoritative) {
    warnedEmptyAuthoritative = true;
    out(
      `[blessboard-tenant-routing] ${ENV_KEY} is empty while mode=authoritative; failing closed (foundation only). Set explicit hostnames or * for estate cutover.`
    );
  }
}

/** Test helper */
function resetAuthoritativeAllowlistWarningsForTests() {
  warnedEmptyAuthoritative = false;
  warnedInvalidEntries = false;
}

module.exports = {
  ENV_KEY,
  ESTATE_ALL_TOKEN,
  ALLOWLIST_MODE,
  ALLOWLIST_DECISION,
  parseAuthoritativeHostAllowlist,
  decideAuthoritativeHostAllowlist,
  warnAuthoritativeAllowlistIfNeeded,
  resetAuthoritativeAllowlistWarningsForTests,
};
