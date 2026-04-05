/**
 * Global public branding (single source of truth for logo/product name and header tagline).
 * Override in deployment via GETPRO_PRODUCT_NAME, GETPRO_PRODUCT_NAME_GETPRO, GETPRO_PUBLIC_TAGLINE.
 */
const PRODUCT_NAME = String(process.env.GETPRO_PRODUCT_NAME || "Pro-online").trim();
const PRODUCT_NAME_GETPRO = String(process.env.GETPRO_PRODUCT_NAME_GETPRO || "GetPro").trim();
const PUBLIC_TAGLINE = String(process.env.GETPRO_PUBLIC_TAGLINE || "My Trusted Professional").trim();

module.exports = {
  PRODUCT_NAME,
  PRODUCT_NAME_GETPRO,
  PUBLIC_TAGLINE,
};
