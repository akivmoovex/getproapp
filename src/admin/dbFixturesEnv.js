/**
 * Single source of truth for Admin → DB seeded-data tools (seed/clear).
 * Used by GET /admin/db (read-only when disabled) and POST /admin/db/seed|clear (403 when disabled).
 *
 * Matrix:
 *
 * (a) NODE_ENV !== "production" → DB tools **enabled**
 * (b) NODE_ENV === "production" AND GETPRO_ALLOW_DB_FIXTURES=1 AND GETPRO_ALLOW_DB_FIXTURES_IN_PRODUCTION=1
 *     → DB tools **enabled** (production-*like* host only, e.g. pronline.org with NODE_ENV=production)
 * (c) NODE_ENV === "production" AND one or both flags missing / not exactly "1"
 *     → DB tools **disabled** (GET read-only; POST 403)
 *
 * Deployment intent (BASE_DOMAIN is not read here — configure env per host in your panel):
 * - **pronline.org** (test/demo): use (a) e.g. NODE_ENV=development, or use (b) if the host runs NODE_ENV=production.
 * - **getproapp.org** (real production): use (c) — NODE_ENV=production and **do not** set the two flags below.
 *
 * Why two flags for (b): NODE_ENV=production is common on demo hosts; a single env typo should not enable
 * fixtures. Real production stays safe by omitting both variables (see .env.production.example).
 */
"use strict";

function envFlagIsOne(name) {
  return String(process.env[name] || "").trim() === "1";
}

function areAdminDbFixturesEnabled() {
  if (process.env.NODE_ENV !== "production") return true;
  return envFlagIsOne("GETPRO_ALLOW_DB_FIXTURES") && envFlagIsOne("GETPRO_ALLOW_DB_FIXTURES_IN_PRODUCTION");
}

module.exports = { areAdminDbFixturesEnabled };
