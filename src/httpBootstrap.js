/**
 * Small Express bootstrap helpers (env → middleware config). Keeps server.js shorter without changing behavior.
 */

const MORGAN_FORMATS = ["dev", "combined", "common", "short", "tiny"];

/** Request access log format. Optional override: GETPRO_MORGAN_FORMAT=dev|combined|common|short|tiny */
function getMorganFormat() {
  const v = String(process.env.GETPRO_MORGAN_FORMAT || "")
    .trim()
    .toLowerCase();
  if (v && MORGAN_FORMATS.includes(v)) {
    return v;
  }
  return process.env.NODE_ENV === "production" ? "combined" : "dev";
}

/** Behind Hostinger / nginx the real browser host is often in X-Forwarded-Host; trust proxy must be on. */
function configureTrustProxy(app) {
  if (process.env.TRUST_PROXY === "0" || process.env.TRUST_PROXY === "false") {
    app.set("trust proxy", false);
  } else if (process.env.TRUST_PROXY) {
    const n = Number(process.env.TRUST_PROXY);
    app.set("trust proxy", Number.isFinite(n) && n >= 0 ? n : 1);
  } else {
    app.set("trust proxy", 1);
  }
}

/** Set GETPRO_DISABLE_COMPRESSION=1 when a reverse proxy already gzip/br’s responses (avoid double encoding). */
function shouldSkipCompression() {
  return (
    process.env.GETPRO_DISABLE_COMPRESSION === "1" ||
    String(process.env.GETPRO_DISABLE_COMPRESSION || "").toLowerCase() === "true"
  );
}

module.exports = {
  getMorganFormat,
  configureTrustProxy,
  shouldSkipCompression,
};
