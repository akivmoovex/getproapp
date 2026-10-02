"use strict";

const bcrypt = require("bcryptjs");

const BCRYPT_MODULAR_RE = /^\$2[aby]\$\d{2}\$/;

/**
 * @param {string|null|undefined} hash
 */
function classifyPasswordHash(hash) {
  const s = String(hash || "");
  if (!s) return { kind: "missing", migratable: false };
  if (BCRYPT_MODULAR_RE.test(s)) {
    const cost = Number(s.split("$")[2] || 0);
    return { kind: "bcrypt", migratable: true, cost };
  }
  return { kind: "unknown", migratable: false };
}

/**
 * @param {string} password
 * @param {string} hash
 */
async function verifyBcryptPassword(password, hash) {
  if (!BCRYPT_MODULAR_RE.test(String(hash || ""))) return false;
  return bcrypt.compare(String(password || ""), String(hash));
}

module.exports = {
  BCRYPT_MODULAR_RE,
  classifyPasswordHash,
  verifyBcryptPassword,
};
