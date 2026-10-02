"use strict";

/**
 * Product-agnostic multi-step draft field merge.
 * Empty / omitted incoming keys do not erase prior values.
 * Protected and secret keys are never taken from the client.
 */

const DEFAULT_SECRET_KEYS = Object.freeze([
  "password",
  "password_confirm",
  "passwordConfirm",
]);

/**
 * @param {object|null|undefined} formData
 * @param {Iterable<string>} [secretKeys]
 */
function stripSecretKeys(formData, secretKeys) {
  if (!formData || typeof formData !== "object") return {};
  const secrets = new Set(secretKeys || DEFAULT_SECRET_KEYS);
  const out = { ...formData };
  for (const key of secrets) {
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      delete out[key];
    }
  }
  return out;
}

/**
 * @param {{
 *   prior?: object|null,
 *   incoming?: object|null,
 *   options?: {
 *     fieldAllowlist?: string[]|Set<string>|null,
 *     protectedKeys?: string[]|Set<string>,
 *     secretKeys?: string[]|Set<string>,
 *     allowEmptyKeys?: string[]|Set<string>,
 *     serverOverrides?: object|null,
 *   },
 * }} input
 * @returns {object}
 */
function mergeDraftFields(input) {
  const options = (input && input.options) || {};
  const secretKeys = options.secretKeys
    ? new Set(options.secretKeys)
    : new Set(DEFAULT_SECRET_KEYS);
  const protectedKeys = new Set(options.protectedKeys || []);
  const allowEmptyKeys = new Set(options.allowEmptyKeys || []);
  const allowlist = options.fieldAllowlist
    ? new Set(options.fieldAllowlist)
    : null;

  const out = stripSecretKeys(input && input.prior, secretKeys);

  if (options.serverOverrides && typeof options.serverOverrides === "object") {
    for (const [key, value] of Object.entries(options.serverOverrides)) {
      if (secretKeys.has(key)) continue;
      out[key] = value;
    }
  }

  const incoming = (input && input.incoming) || {};
  for (const [key, raw] of Object.entries(incoming)) {
    if (secretKeys.has(key)) continue;
    if (protectedKeys.has(key)) continue;
    if (allowlist && !allowlist.has(key)) continue;
    if (raw === null || raw === undefined) continue;
    if (typeof raw === "string" && raw.trim() === "" && !allowEmptyKeys.has(key)) {
      continue;
    }
    out[key] = raw;
  }

  return stripSecretKeys(out, secretKeys);
}

module.exports = {
  DEFAULT_SECRET_KEYS,
  stripSecretKeys,
  mergeDraftFields,
};
