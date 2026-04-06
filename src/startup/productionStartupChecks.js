"use strict";

const { loadAssetMap } = require("../platform/assetUrls");

function warn(message) {
  // eslint-disable-next-line no-console
  console.warn(`[getpro] WARN: ${message}`);
}

/**
 * One-time production deployment sanity checks. Does not run per request.
 * Critical issues (e.g. missing SESSION_SECRET) are handled in server.js before this runs.
 */
function runProductionStartupChecks() {
  if (process.env.NODE_ENV !== "production") return;

  const base = (process.env.BASE_DOMAIN || "").trim();
  if (!base) {
    warn(
      "BASE_DOMAIN is unset — regional subdomains (e.g. zm.* / il.*) and path→subdomain redirects will not work. Set BASE_DOMAIN in hosting env (no scheme, e.g. example.com)."
    );
  }

  const trust = process.env.TRUST_PROXY;
  if (trust === "0" || String(trust).toLowerCase() === "false") {
    warn(
      "TRUST_PROXY is disabled — behind nginx or a load balancer, client IP and rate limits may be wrong. Use TRUST_PROXY=1 unless you are sure this process receives the real client connection."
    );
  }

  if (!process.env.ADMIN_PASSWORD || String(process.env.ADMIN_PASSWORD).trim() === "") {
    warn(
      "ADMIN_PASSWORD is unset — admin bootstrap will fail and /admin login will not work until it is set in hosting env."
    );
  }

  const secret = process.env.SESSION_SECRET;
  if (secret != null && String(secret).trim().length > 0 && String(secret).length < 32) {
    warn(
      "SESSION_SECRET is shorter than 32 characters — use a long random value so session cookies cannot be guessed."
    );
  }

  const map = loadAssetMap();
  const keyCount = map && typeof map === "object" ? Object.keys(map).length : 0;
  const forceBuild = process.env.GETPRO_USE_BUILD_ASSETS === "1";
  const disableBuild = process.env.GETPRO_USE_BUILD_ASSETS === "0";

  if (forceBuild && keyCount === 0) {
    warn(
      "GETPRO_USE_BUILD_ASSETS=1 but public/build/asset-map.json is missing or empty — run `npm run build` or unset GETPRO_USE_BUILD_ASSETS. Falling back to legacy /public assets."
    );
  } else if (!disableBuild && keyCount === 0) {
    warn(
      "public/build/asset-map.json is missing or empty — serving legacy /public JS/CSS with ?v= cache busting. Run `npm run build` if you expected Vite hashed assets in production."
    );
  }
}

module.exports = { runProductionStartupChecks };
