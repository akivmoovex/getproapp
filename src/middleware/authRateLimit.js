"use strict";

const rateLimit = require("express-rate-limit");

const WINDOW_MS = Number(process.env.GETPRO_LOGIN_RATE_WINDOW_MS) || 15 * 60 * 1000;
const ADMIN_MAX = Number(process.env.GETPRO_ADMIN_LOGIN_RATE_MAX) || 25;
const COMPANY_MAX = Number(process.env.GETPRO_COMPANY_LOGIN_RATE_MAX) || 30;
const FIELD_AGENT_MAX = Number(process.env.GETPRO_FIELD_AGENT_LOGIN_RATE_MAX) || 30;
/** Optional cap for authenticated field-agent POSTs (check-phone, add-contact, callback). Defaults to same as login/signup max. */
const rawAuthedPostMax = process.env.GETPRO_FIELD_AGENT_AUTHED_POST_RATE_MAX;
const FIELD_AGENT_AUTHED_POST_MAX =
  rawAuthedPostMax !== undefined && String(rawAuthedPostMax).trim() !== ""
    ? Number(rawAuthedPostMax)
    : FIELD_AGENT_MAX;
const FIELD_AGENT_AUTHED_POST_LIMIT =
  Number.isFinite(FIELD_AGENT_AUTHED_POST_MAX) && FIELD_AGENT_AUTHED_POST_MAX > 0
    ? FIELD_AGENT_AUTHED_POST_MAX
    : FIELD_AGENT_MAX;

const base = {
  windowMs: WINDOW_MS,
  standardHeaders: true,
  legacyHeaders: false,
};

/**
 * POST /admin/login — IP-based cap on password attempts (failed logins still return 200).
 */
const adminLoginLimiter = rateLimit({
  ...base,
  limit: ADMIN_MAX,
  handler: (req, res, _next, options) => {
    res
      .status(options.statusCode)
      .type("text")
      .send(
        "Too many login attempts from this network. Please wait a few minutes and try again.\n"
      );
  },
});

function companyPortalBasePath(req) {
  const b = req.baseUrl != null && String(req.baseUrl).length > 0 ? String(req.baseUrl) : "/company";
  return b.replace(/\/$/, "") || "/company";
}

/**
 * POST /company|/provider/login — complements in-memory tenant+IP throttling in companyPersonnelAuth.
 */
const companyPortalLoginLimiter = rateLimit({
  ...base,
  limit: COMPANY_MAX,
  handler: (req, res) => {
    const pb = companyPortalBasePath(req);
    const msg =
      "Too many sign-in attempts from this network. Please wait a few minutes and try again.";
    return res.redirect(302, `${pb}/login?error=${encodeURIComponent(msg)}`);
  },
});

/**
 * POST /field-agent/login and /field-agent/signup — same window as admin login limiter.
 */
const fieldAgentLoginLimiter = rateLimit({
  ...base,
  limit: FIELD_AGENT_MAX,
  handler: (req, res) => {
    const msg = "Too many attempts from this network. Please wait a few minutes and try again.\n";
    return res.status(429).type("text").send(msg);
  },
});

/**
 * Authenticated field-agent POSTs (after requireFieldAgent): separate counter from login/signup.
 * JSON for /api/* or Accept: application/json; plain text otherwise (HTML forms).
 */
const fieldAgentAuthedPostLimiter = rateLimit({
  ...base,
  limit: FIELD_AGENT_AUTHED_POST_LIMIT,
  handler: (req, res, _next, options) => {
    const msg = "Too many requests from this network. Please wait a few minutes and try again.";
    const p = String(req.path || "");
    const accept = String(req.get("Accept") || "");
    const tid = req.tenant && req.tenant.id != null ? Number(req.tenant.id) : null;
    // eslint-disable-next-line no-console
    console.warn(
      "[getpro] field-agent authed POST rate limit",
      JSON.stringify({
        op: "field_agent_authed_post_rate_limit",
        severity: "warning",
        method: String(req.method || ""),
        path: p.slice(0, 200),
        tenantId: Number.isFinite(tid) && tid > 0 ? tid : null,
        ip: String(req.ip || "").slice(0, 64),
        limit: FIELD_AGENT_AUTHED_POST_LIMIT,
        windowMs: WINDOW_MS,
        response: p.includes("/api/") || accept.includes("application/json") ? "json" : "text",
      })
    );
    if (p.includes("/api/") || accept.includes("application/json")) {
      return res.status(options.statusCode).json({ ok: false, error: msg });
    }
    return res.status(options.statusCode).type("text").send(`${msg}\n`);
  },
});

module.exports = {
  adminLoginLimiter,
  companyPortalLoginLimiter,
  fieldAgentLoginLimiter,
  fieldAgentAuthedPostLimiter,
};
