"use strict";

/**
 * Build server-rendered login mode tab hrefs (/login?mode=email|phone).
 * Preserves safe notice query params; never embeds transfer tokens.
 */

const SAFE_LOGIN_QUERY_KEYS = Object.freeze([
  "activated",
  "reset",
  "expired",
  "logged_out",
]);

/**
 * @param {Record<string, unknown> | null | undefined} query
 * @returns {{ modeEmailHref: string, modePhoneHref: string }}
 */
function buildLoginModeHrefs(query) {
  const params = new URLSearchParams();
  const src = query && typeof query === "object" ? query : {};
  for (const key of SAFE_LOGIN_QUERY_KEYS) {
    if (src[key] == null || src[key] === "") continue;
    params.set(key, String(src[key]));
  }

  function hrefFor(mode) {
    const next = new URLSearchParams(params);
    next.set("mode", mode);
    return `/login?${next.toString()}`;
  }

  return {
    modeEmailHref: hrefFor("email"),
    modePhoneHref: hrefFor("phone"),
  };
}

/**
 * @param {unknown} raw
 * @returns {'email'|'phone'}
 */
function resolveLoginModeQuery(raw) {
  return String(raw || "").trim().toLowerCase() === "phone" ? "phone" : "email";
}

module.exports = {
  SAFE_LOGIN_QUERY_KEYS,
  buildLoginModeHrefs,
  resolveLoginModeQuery,
};
