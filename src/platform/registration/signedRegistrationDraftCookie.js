"use strict";

/**
 * HMAC-signed registration wizard draft cookies (httpOnly).
 * Products supply only cookie name (+ optional max age); signing/read/write is shared.
 *
 * Payload: { schemaVersion, status, draftNonce, currentStep, formData, updatedAt }
 */

const crypto = require("crypto");
const { sanitizeRegistrationDraftFormData } = require("./registrationDraftLifecycle");

const DEFAULT_MAX_AGE_MS = 60 * 60 * 1000;
const SOFT_PAYLOAD_BYTES = 3500;

function signingSecret(env) {
  const secret = String((env && env.SESSION_SECRET) || "").trim();
  if (secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters for registration draft cookies");
  }
  return secret;
}

function signPayload(payloadB64, secret) {
  return crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
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

function newDraftNonce() {
  return crypto.randomBytes(16).toString("base64url");
}

/**
 * @param {{
 *   cookieName: string,
 *   maxAgeMs?: number,
 * }} config
 */
function createSignedRegistrationDraftCookie(config) {
  const cookieName = String((config && config.cookieName) || "").trim();
  if (!cookieName) {
    throw new Error("createSignedRegistrationDraftCookie requires cookieName");
  }
  const maxAgeMs =
    Number.isFinite(config && config.maxAgeMs) && config.maxAgeMs > 0
      ? Number(config.maxAgeMs)
      : DEFAULT_MAX_AGE_MS;

  /**
   * @returns {{
   *   formData: object,
   *   updatedAt?: number,
   *   status?: string,
   *   draftNonce?: string,
   *   currentStep?: string|null,
   *   schemaVersion?: number,
   * }|null}
   */
  function readRegistrationDraft(req, env) {
    const raw =
      (req.cookies && req.cookies[cookieName]) ||
      parseCookieHeader(req.headers && req.headers.cookie, cookieName);
    if (!raw) return null;

    const dot = raw.lastIndexOf(".");
    if (dot <= 0) return null;

    const payloadB64 = raw.slice(0, dot);
    const sig = raw.slice(dot + 1);
    let expected;
    try {
      expected = signPayload(payloadB64, signingSecret(env));
    } catch (_err) {
      return null;
    }
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

    let parsed;
    try {
      parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    } catch (_err) {
      return null;
    }

    if (!parsed || typeof parsed !== "object" || !parsed.formData) return null;
    if (parsed.status === "completed") return null;
    if (parsed.updatedAt && Date.now() - parsed.updatedAt > maxAgeMs) return null;
    return parsed;
  }

  /**
   * @param {import('express').Response} res
   * @param {NodeJS.ProcessEnv} env
   * @param {object} formData
   * @param {{
   *   isProduction: boolean,
   *   currentStep?: string|null,
   *   status?: string,
   *   priorDraft?: object|null,
   * }} opts
   */
  function writeRegistrationDraft(res, env, formData, opts) {
    const options = opts && typeof opts === "object" ? opts : {};
    const isProduction = Boolean(options.isProduction);
    const prior = options.priorDraft && typeof options.priorDraft === "object" ? options.priorDraft : null;
    const payload = {
      schemaVersion: 1,
      status: options.status === "completed" ? "completed" : "active",
      draftNonce:
        prior && prior.draftNonce
          ? String(prior.draftNonce)
          : newDraftNonce(),
      currentStep:
        options.currentStep != null && String(options.currentStep).trim()
          ? String(options.currentStep).trim().slice(0, 64)
          : prior && prior.currentStep
            ? String(prior.currentStep).slice(0, 64)
            : null,
      formData: sanitizeRegistrationDraftFormData(formData),
      updatedAt: Date.now(),
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    if (payloadB64.length > SOFT_PAYLOAD_BYTES) {
      throw new Error("registration_draft_payload_too_large");
    }
    const sig = signPayload(payloadB64, signingSecret(env));
    const value = `${payloadB64}.${sig}`;
    const secure = isProduction ? "; Secure" : "";
    const maxAgeSec =
      payload.status === "completed" ? 0 : Math.floor(maxAgeMs / 1000);
    res.append(
      "Set-Cookie",
      `${cookieName}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`
    );
    return payload;
  }

  function clearRegistrationDraft(res, { isProduction }) {
    const secure = isProduction ? "; Secure" : "";
    res.append(
      "Set-Cookie",
      `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
    );
  }

  /**
   * Mark completed then clear (success path).
   */
  function completeRegistrationDraft(res, env, { isProduction, priorDraft }) {
    try {
      writeRegistrationDraft(res, env, (priorDraft && priorDraft.formData) || {}, {
        isProduction,
        status: "completed",
        priorDraft,
        currentStep: priorDraft && priorDraft.currentStep,
      });
    } catch (_err) {
      /* still clear */
    }
    clearRegistrationDraft(res, { isProduction });
  }

  return {
    COOKIE_NAME: cookieName,
    MAX_AGE_MS: maxAgeMs,
    readRegistrationDraft,
    writeRegistrationDraft,
    clearRegistrationDraft,
    completeRegistrationDraft,
  };
}

module.exports = {
  DEFAULT_MAX_AGE_MS,
  createSignedRegistrationDraftCookie,
};
