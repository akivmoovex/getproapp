"use strict";

/**
 * Short-lived encrypted password vault for multi-step registration (BB + AC).
 * Passwords never go in draft cookies, HTML, URLs, or logs.
 */

const crypto = require("crypto");
const { PRODUCT } = require("./constants");

const COOKIE_BY_PRODUCT = Object.freeze({
  [PRODUCT.BLESSBOARD]: "bb_reg_pwd",
  [PRODUCT.ACTIVECLINIC]: "ac_reg_pwd",
});

const MAX_AGE_MS = 60 * 60 * 1000;

const PASSWORD_FIELD_ALIASES = Object.freeze({
  password: ["password"],
  password_confirm: ["password_confirm", "passwordConfirm"],
});

function cookieNameForProduct(productCode) {
  const name = COOKIE_BY_PRODUCT[String(productCode || "").trim().toLowerCase()];
  if (!name) {
    throw new Error(`registrationPasswordVault: unknown product ${JSON.stringify(productCode)}`);
  }
  return name;
}

function signingSecret(env) {
  const secret = String((env && env.SESSION_SECRET) || "").trim();
  if (secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters for registration password vault");
  }
  return secret;
}

function deriveVaultKey(env) {
  return crypto.createHash("sha256").update(`${signingSecret(env)}:gp-reg-pwd-v1`).digest();
}

function parseCookieHeader(header, name) {
  if (!header) return null;
  const parts = String(header).split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return decodeURIComponent(trimmed.slice(name.length + 1));
    }
  }
  return null;
}

function encryptPayload(plaintext, env) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveVaultKey(env), iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

function decryptPayload(payloadB64, env) {
  const buf = Buffer.from(String(payloadB64 || ""), "base64url");
  if (buf.length < 29) return null;
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveVaultKey(env), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

function signEnvelope(envelopeB64, env) {
  return crypto.createHmac("sha256", signingSecret(env)).update(envelopeB64).digest("base64url");
}

function readBodyPasswordFields(body) {
  const src = body && typeof body === "object" ? body : {};
  const password = PASSWORD_FIELD_ALIASES.password
    .map((key) => (src[key] != null ? String(src[key]) : ""))
    .find((value) => value.length > 0);
  const confirm = PASSWORD_FIELD_ALIASES.password_confirm
    .map((key) => (src[key] != null ? String(src[key]) : ""))
    .find((value) => value.length > 0);
  return {
    password: password || "",
    password_confirm: confirm || "",
  };
}

/**
 * @param {import('express').Response} res
 * @param {NodeJS.ProcessEnv} env
 * @param {{ password?: unknown, password_confirm?: unknown, passwordConfirm?: unknown }} fields
 * @param {{ productCode: string, isProduction: boolean }} opts
 */
function storeRegistrationPasswordVault(res, env, fields, opts) {
  const productCode = opts && opts.productCode;
  const cookieName = cookieNameForProduct(productCode);
  const { password, password_confirm } = readBodyPasswordFields(fields);
  if (!password) {
    clearRegistrationPasswordVault(res, opts);
    return false;
  }

  const envelope = {
    password,
    password_confirm: password_confirm || password,
    updatedAt: Date.now(),
  };
  const envelopeB64 = encryptPayload(JSON.stringify(envelope), env);
  const sig = signEnvelope(envelopeB64, env);
  const value = `${envelopeB64}.${sig}`;
  const secure = opts && opts.isProduction ? "; Secure" : "";
  res.append(
    "Set-Cookie",
    `${cookieName}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(MAX_AGE_MS / 1000)}${secure}`
  );
  return true;
}

/**
 * @param {import('express').Request} req
 * @param {NodeJS.ProcessEnv} env
 * @param {string} productCode
 * @returns {{ password: string, password_confirm: string }|null}
 */
function readRegistrationPasswordVault(req, env, productCode) {
  const cookieName = cookieNameForProduct(productCode);
  const raw =
    (req.cookies && req.cookies[cookieName]) ||
    parseCookieHeader(req.headers && req.headers.cookie, cookieName);
  if (!raw) return null;

  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const envelopeB64 = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = signEnvelope(envelopeB64, env);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  let plaintext;
  try {
    plaintext = decryptPayload(envelopeB64, env);
  } catch (_err) {
    return null;
  }
  if (!plaintext) return null;

  let parsed;
  try {
    parsed = JSON.parse(plaintext);
  } catch (_err) {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.updatedAt && Date.now() - parsed.updatedAt > MAX_AGE_MS) return null;

  const password = String(parsed.password || "");
  if (!password) return null;
  return {
    password,
    password_confirm: String(parsed.password_confirm || parsed.password || ""),
  };
}

/**
 * @param {import('express').Response} res
 * @param {{ productCode: string, isProduction: boolean }} opts
 */
function clearRegistrationPasswordVault(res, opts) {
  const cookieName = cookieNameForProduct(opts && opts.productCode);
  const secure = opts && opts.isProduction ? "; Secure" : "";
  res.append(
    "Set-Cookie",
    `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  );
}

/**
 * Merge POST body with vault passwords for server-side validation only.
 * @param {import('express').Request} req
 * @param {NodeJS.ProcessEnv} env
 * @param {string} productCode
 * @param {object} body
 */
function mergeRegistrationBodyWithPasswordVault(req, env, productCode, body) {
  const merged = { ...(body && typeof body === "object" ? body : {}) };
  const fromBody = readBodyPasswordFields(merged);
  if (fromBody.password) {
    return merged;
  }
  const vault = readRegistrationPasswordVault(req, env, productCode);
  if (!vault) return merged;
  return {
    ...merged,
    password: vault.password,
    password_confirm: vault.password_confirm,
    passwordConfirm: vault.password_confirm,
  };
}

module.exports = {
  COOKIE_BY_PRODUCT,
  MAX_AGE_MS,
  storeRegistrationPasswordVault,
  readRegistrationPasswordVault,
  clearRegistrationPasswordVault,
  mergeRegistrationBodyWithPasswordVault,
};
