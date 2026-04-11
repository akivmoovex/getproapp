"use strict";

const { zmJoinEmbedAbsoluteUrl, marketingApexOpsSlugFromRequest } = require("./marketingOperationalUrls");
const { getClientCountryCode } = require("../platform/host");

/**
 * Locals for unsupported-country banner + join iframe override on public pages.
 *
 * Why banner only on global marketing apex (isApexHost + tenant.slug === "global"):
 * Geo CTAs from the apex send users to zm.* / il.*; a "coming soon in your country" strip on zm.* / il.*
 * would contradict already being on a regional hub.
 *
 * Why missing geo shows NO banner: without CF-IPCountry / x-country-code / GETPRO_FORCE_CLIENT_COUNTRY we
 * cannot classify the visitor; do not treat everyone as "unsupported."
 *
 * Directory access: this helper does NOT redirect or block. All countries can open /directory; the banner
 * is informational only (see views/partials/unsupported_country_banner.ejs).
 */
function buildPublicGeoLocals(req) {
  const cc = getClientCountryCode(req);
  const hasCc = typeof cc === "string" && cc.length === 2 && /^[A-Z]{2}$/.test(cc);
  const isGlobalMarketingApex = !!(req.isApexHost && req.tenant && req.tenant.slug === "global");
  const showUnsupportedCountryBanner =
    hasCc && cc !== "ZM" && cc !== "IL" && isGlobalMarketingApex;

  let joinModalEmbedSrc = showUnsupportedCountryBanner ? zmJoinEmbedAbsoluteUrl() : undefined;

  if (showUnsupportedCountryBanner && !joinModalEmbedSrc) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("[getpro] buildPublicGeoLocals: banner set but join URL missing; using /join?embed=1 fallback");
    }
    joinModalEmbedSrc = "/join?embed=1";
  }

  return {
    showUnsupportedCountryBanner,
    joinModalEmbedSrc,
  };
}

/**
 * Dev-only: one line per request for GET / and GET /directory. No PII; not logged in production.
 */
function logPublicGeoDebug(req, geoLocals) {
  if (process.env.NODE_ENV === "production") return;
  const cc = getClientCountryCode(req) || "";
  const isGlobalMarketingApex = !!(req.isApexHost && req.tenant && req.tenant.slug === "global");
  const opsSlug = isGlobalMarketingApex ? marketingApexOpsSlugFromRequest(req) : "—";
  // eslint-disable-next-line no-console
  console.log(
    `[getpro:public-geo] ${req.method} ${req.path || ""} cc=${cc} isGlobalMarketingApex=${isGlobalMarketingApex} banner=${geoLocals.showUnsupportedCountryBanner} opsSlug=${opsSlug}`
  );
}

module.exports = {
  buildPublicGeoLocals,
  logPublicGeoDebug,
};
