"use strict";

/**
 * Long-lived caching for fingerprinted/versioned static files (`?v=`).
 * Unversioned assets keep a short public TTL so in-place updates still refresh.
 * HTML / authenticated responses are not served through express.static.
 *
 * @param {boolean} isProduction
 */
function createStaticAssetCacheOptions(isProduction) {
  return {
    maxAge: isProduction ? "1d" : 0,
    immutable: false,
    setHeaders(res, filePath) {
      const req = res.req;
      const url = String((req && (req.originalUrl || req.url)) || "");
      const versioned = /[?&]v=/.test(url);
      const font = /\.(?:woff2|woff)$/i.test(filePath);
      if (isProduction && (versioned || font)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  };
}

module.exports = {
  createStaticAssetCacheOptions,
};
