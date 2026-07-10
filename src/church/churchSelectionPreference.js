"use strict";

/**
 * Lightweight public navigation preference for returning visitors on the BlessBoard apex.
 *
 * Stores only public slugs (`churchSlug|branchSlug`) — never authenticates and never grants access.
 * Tenant homepage / login / registration branch context does NOT use this cookie; those resolve from
 * the branch host (`{host_slug}.blessboard.com`) via attachChurchContext.
 *
 * Intentional GET behavior: a single-branch church selection may Set-Cookie on the redirect response
 * from GET /churches/:slug. That is a navigation preference only (same payload as POST open), not an
 * auth grant. Multi-branch selection sets the cookie on POST .../open.
 */

const { getChurchHostDomain } = require("./host");

const COOKIE_NAME = "bb_church_pref";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // 180 days
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

function isSafeSlug(value) {
  const s = String(value || "")
    .toLowerCase()
    .trim();
  return Boolean(s && SLUG_RE.test(s));
}

function normalizeSlug(value) {
  const s = String(value || "")
    .toLowerCase()
    .trim();
  return isSafeSlug(s) ? s : "";
}

/**
 * Parse a single cookie value from the Cookie header (no cookie-parser dependency).
 * @param {import("express").Request} req
 * @param {string} name
 * @returns {string | null}
 */
function readRawCookie(req, name) {
  if (req && req.cookies && typeof req.cookies[name] === "string") {
    return req.cookies[name];
  }
  const header = req && req.headers && req.headers.cookie;
  if (!header || typeof header !== "string") return null;
  const parts = header.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      return part.slice(idx + 1).trim();
    }
  }
  return null;
}

/**
 * @param {import("express").Request} req
 * @returns {{ churchSlug: string, branchSlug: string } | null}
 */
function readChurchSelectionPreference(req) {
  const raw = readRawCookie(req, COOKIE_NAME);
  if (!raw || typeof raw !== "string") return null;
  const parts = raw.split("|");
  if (parts.length !== 2) return null;
  const churchSlug = normalizeSlug(parts[0]);
  const branchSlug = normalizeSlug(parts[1]);
  if (!churchSlug || !branchSlug) return null;
  return { churchSlug, branchSlug };
}

function cookieDomainForRequest(req) {
  const host = String((req && req.hostname) || "")
    .toLowerCase()
    .trim();
  if (!host || host === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return undefined;
  }
  const churchDomain = String(getChurchHostDomain() || "")
    .toLowerCase()
    .trim();
  if (churchDomain && (host === churchDomain || host.endsWith(`.${churchDomain}`))) {
    return `.${churchDomain}`;
  }
  return undefined;
}

/**
 * Secure cookies on production and on HTTPS requests (including proxied TLS).
 * @param {import("express").Request} [req]
 */
function cookieSecureFlag(req) {
  if (String(process.env.NODE_ENV || "").trim() === "production") return true;
  if (req && req.secure) return true;
  const proto =
    req && typeof req.get === "function" ? String(req.get("x-forwarded-proto") || "") : "";
  if (proto.split(",")[0].trim().toLowerCase() === "https") return true;
  return false;
}

/**
 * @param {import("express").Request} [req]
 */
function churchSelectionCookieOptions(req) {
  const opts = {
    maxAge: MAX_AGE_SECONDS * 1000,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: cookieSecureFlag(req),
  };
  const domain = cookieDomainForRequest(req);
  if (domain) opts.domain = domain;
  return opts;
}

/**
 * @param {import("express").Response} res
 * @param {import("express").Request} req
 * @param {{ churchSlug: string, branchSlug: string }} pref
 */
function setChurchSelectionPreference(res, req, pref) {
  const churchSlug = normalizeSlug(pref && pref.churchSlug);
  const branchSlug = normalizeSlug(pref && pref.branchSlug);
  if (!churchSlug || !branchSlug) return false;

  res.cookie(COOKIE_NAME, `${churchSlug}|${branchSlug}`, churchSelectionCookieOptions(req));
  return true;
}

/**
 * @param {import("express").Response} res
 * @param {import("express").Request} req
 */
function clearChurchSelectionPreference(res, req) {
  const opts = churchSelectionCookieOptions(req);
  // clearCookie ignores maxAge; keep path/domain/secure/sameSite aligned with set.
  delete opts.maxAge;
  res.clearCookie(COOKIE_NAME, opts);
}

module.exports = {
  COOKIE_NAME,
  MAX_AGE_SECONDS,
  isSafeSlug,
  normalizeSlug,
  readChurchSelectionPreference,
  setChurchSelectionPreference,
  clearChurchSelectionPreference,
  cookieSecureFlag,
  cookieDomainForRequest,
  churchSelectionCookieOptions,
};
