"use strict";

/**
 * HMAC-signed booking draft cookie scoped to clinicKey (P24–P25).
 * Cookie name: ac_book_draft
 */

const crypto = require("crypto");
const { generateIdempotencyKey } = require("./activeClinicPublicBookingService");

const COOKIE_NAME = "ac_book_draft";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function signingSecret(env) {
  const secret = String((env && env.SESSION_SECRET) || "").trim();
  if (secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters for booking draft cookies");
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

/**
 * @returns {object|null}
 */
function readBookingDraft(req, env, clinicKey) {
  const raw = (req.cookies && req.cookies[COOKIE_NAME])
    || parseCookieHeader(req.headers && req.headers.cookie, COOKIE_NAME);
  if (!raw) return null;

  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;

  const payloadB64 = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = signPayload(payloadB64, signingSecret(env));
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch (_err) {
    return null;
  }

  if (!parsed || parsed.clinicKey !== clinicKey) return null;
  if (parsed.updatedAt && Date.now() - parsed.updatedAt > MAX_AGE_MS) return null;
  return parsed;
}

function writeBookingDraft(res, env, draft, { isProduction }) {
  const payload = {
    ...draft,
    updatedAt: Date.now(),
  };
  if (!payload.idempotencyKey) {
    payload.idempotencyKey = generateIdempotencyKey();
  }
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = signPayload(payloadB64, signingSecret(env));
  const value = `${payloadB64}.${sig}`;
  const secure = isProduction ? "; Secure" : "";
  res.append("Set-Cookie", `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(MAX_AGE_MS / 1000)}${secure}`);
  return payload;
}

function clearBookingDraft(res, { isProduction }) {
  const secure = isProduction ? "; Secure" : "";
  res.append("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

function emptyConsultationDraft(clinicKey) {
  return {
    clinicKey,
    bookingKind: "consultation",
    serviceKey: null,
    serviceTypeId: null,
    serviceDisplayName: null,
    staffKey: null,
    preferredStaffId: null,
    staffDisplayName: null,
    anyDoctor: false,
    preferredStartsAt: null,
    patientFirstName: null,
    patientLastName: null,
    patientPhone: null,
    patientEmail: null,
    visitReason: null,
    idempotencyKey: generateIdempotencyKey(),
  };
}

function mergeDraft(existing, patch) {
  return { ...(existing || {}), ...patch, clinicKey: (existing && existing.clinicKey) || patch.clinicKey };
}

/** Public slot config is not published — always honest no_slots_published until schema exists. */
function resolvePublicSlotAvailabilityState() {
  return "no_slots_published";
}

const CONSULTATION_WIZARD_STEPS = Object.freeze([
  { key: "type", label: "Consultation type", step: 1 },
  { key: "doctor", label: "Doctor", step: 2 },
  { key: "slot", label: "Preferred time", step: 3 },
  { key: "patient", label: "Your details", step: 4 },
  { key: "review", label: "Review", step: 5 },
]);

function canModifyBookingStatus(status) {
  return status === "submitted_pending_confirmation" || status === "confirmed";
}

module.exports = {
  COOKIE_NAME,
  CONSULTATION_WIZARD_STEPS,
  readBookingDraft,
  writeBookingDraft,
  clearBookingDraft,
  emptyConsultationDraft,
  mergeDraft,
  resolvePublicSlotAvailabilityState,
  canModifyBookingStatus,
};
