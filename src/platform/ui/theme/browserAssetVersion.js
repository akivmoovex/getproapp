"use strict";

/**
 * Cache-bust query stamp for V2.04 theme-sensitive browser CSS/JS.
 *
 * Static assets remain long-cacheable (Cache-Control max-age). Browsers only
 * re-fetch when the `?v=` query changes. Bump this constant whenever V2.04
 * theme / product-token / inline-editor browser assets change and must
 * invalidate prior hosted copies.
 *
 * Do not generate per-request timestamps. Do not set max-age to zero.
 */
const V204_BROWSER_ASSET_VERSION = "v204-qa-3";

module.exports = {
  V204_BROWSER_ASSET_VERSION,
};
