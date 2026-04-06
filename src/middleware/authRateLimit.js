"use strict";

const rateLimit = require("express-rate-limit");

const WINDOW_MS = Number(process.env.GETPRO_LOGIN_RATE_WINDOW_MS) || 15 * 60 * 1000;
const ADMIN_MAX = Number(process.env.GETPRO_ADMIN_LOGIN_RATE_MAX) || 25;
const COMPANY_MAX = Number(process.env.GETPRO_COMPANY_LOGIN_RATE_MAX) || 30;

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

module.exports = {
  adminLoginLimiter,
  companyPortalLoginLimiter,
};
