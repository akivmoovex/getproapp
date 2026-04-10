/**
 * Global public branding (single source of truth for logo/product name and header tagline).
 * Override in deployment via GETPRO_PRODUCT_NAME, GETPRO_PRODUCT_NAME_GETPRO, GETPRO_PUBLIC_TAGLINE.
 * Lockup variant (which product line is visible + theme tokens): GETPRO_HTML_DATA_BRAND or APP_BRAND — getpro | proonline.
 */
const PRODUCT_NAME = String(process.env.GETPRO_PRODUCT_NAME || "Pro-online").trim();
const PRODUCT_NAME_GETPRO = String(process.env.GETPRO_PRODUCT_NAME_GETPRO || "GetPro").trim();
const PUBLIC_TAGLINE = String(process.env.GETPRO_PUBLIC_TAGLINE || "My Trusted Professional").trim();

const _htmlBrandRaw = String(process.env.GETPRO_HTML_DATA_BRAND || process.env.APP_BRAND || "")
  .trim()
  .toLowerCase();
const HTML_DATA_BRAND =
  _htmlBrandRaw === "getpro" || _htmlBrandRaw === "proonline" ? _htmlBrandRaw : "";

module.exports = {
  PRODUCT_NAME,
  PRODUCT_NAME_GETPRO,
  PUBLIC_TAGLINE,
  HTML_DATA_BRAND,
};
