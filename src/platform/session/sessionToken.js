"use strict";

/**
 * V5 deployment-scoped session token helpers.
 * Raw tokens exist only in memory/cookies; PostgreSQL stores SHA-256 hex hashes.
 */

const crypto = require("crypto");

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours absolute
const LAST_SEEN_MIN_INTERVAL_MS = 15 * 60 * 1000; // rolling update throttle

/**
 * @returns {{ rawToken: string, tokenHash: string }}
 */
function generateSessionToken() {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  return { rawToken, tokenHash: hashSessionToken(rawToken) };
}

/**
 * @param {string} rawToken
 * @returns {string}
 */
function hashSessionToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken || ""), "utf8").digest("hex");
}

/**
 * @param {string} a
 * @param {string} b
 */
function timingSafeEqualHex(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * @param {string} value
 * @returns {string}
 */
function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

/**
 * @param {Date | string | number} [from]
 * @returns {Date}
 */
function sessionExpiresAt(from) {
  const base = from ? new Date(from) : new Date();
  return new Date(base.getTime() + SESSION_TTL_MS);
}

module.exports = {
  SESSION_TTL_MS,
  LAST_SEEN_MIN_INTERVAL_MS,
  generateSessionToken,
  hashSessionToken,
  timingSafeEqualHex,
  sha256Hex,
  sessionExpiresAt,
};
