"use strict";

/**
 * BlessBoard public apex hosts (marketing + platform admin).
 * Tenant church sites remain under CHURCH_HOST_DOMAIN / canonical domain only.
 *
 * Implementation lives in blessBoardEnv.js (single source of truth for deployment config).
 */

const {
  DEFAULT_CANONICAL_DOMAIN,
  DEFAULT_COM_APEX_ALIASES,
  normalizeHost,
  getBlessBoardCanonicalDomain,
  getBlessBoardApexDomainSet,
  isBlessBoardApexDomain,
} = require("./blessBoardEnv");

/** @deprecated Prefer DEFAULT_COM_APEX_ALIASES from blessBoardEnv — kept for V4 test compatibility. */
const DEFAULT_APEX_DOMAINS = DEFAULT_COM_APEX_ALIASES;

module.exports = {
  DEFAULT_CANONICAL_DOMAIN,
  DEFAULT_APEX_DOMAINS,
  normalizeHost,
  getBlessBoardCanonicalDomain,
  getBlessBoardApexDomainSet,
  isBlessBoardApexDomain,
};
