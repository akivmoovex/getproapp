"use strict";

/**
 * Prevent reverse-proxy / LiteSpeed caching of authenticated and auth-gated responses.
 * Observed on blessboard.org: 303 → /login responses were served with Age ≈ 12m while
 * the browser still held a valid session cookie (no Cache-Control / Vary: Cookie).
 */

/**
 * @param {import('express').Response} res
 */
function setV5PrivateNoStore(res) {
  try {
    res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Surrogate-Control", "no-store");
    // Cookie presence must not share a cache entry with anonymous 303s.
    const existing = res.getHeader("Vary");
    if (!existing) {
      res.setHeader("Vary", "Cookie");
    } else {
      const parts = String(existing)
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      if (!parts.some((p) => p.toLowerCase() === "cookie")) {
        parts.push("Cookie");
        res.setHeader("Vary", parts.join(", "));
      }
    }
  } catch {
    /* headers may be unavailable */
  }
}

/**
 * @param {string} pathOnly
 */
function wantsV5PrivateNoStore(pathOnly) {
  const p = String(pathOnly || "").split("?")[0];
  return (
    p === "/login" ||
    p.startsWith("/login/") ||
    p === "/logout" ||
    p === "/admin" ||
    p.startsWith("/admin/") ||
    p === "/branch-admin" ||
    p.startsWith("/branch-admin/") ||
    p === "/hq" ||
    p.startsWith("/hq/") ||
    p === "/member" ||
    p.startsWith("/member/") ||
    p.startsWith("/auth/") ||
    p === "/app" ||
    p.startsWith("/app/") ||
    /\/patient(?:\/|$)/.test(p)
  );
}

/**
 * Early middleware: mark auth / admin shells as non-cacheable.
 */
function createV5PrivateNoStoreMiddleware() {
  return function v5PrivateNoStoreMiddleware(req, res, next) {
    const pathOnly = String(req.path || "").split("?")[0];
    if (wantsV5PrivateNoStore(pathOnly)) {
      setV5PrivateNoStore(res);
    }
    return next();
  };
}

module.exports = {
  setV5PrivateNoStore,
  wantsV5PrivateNoStore,
  createV5PrivateNoStoreMiddleware,
};
