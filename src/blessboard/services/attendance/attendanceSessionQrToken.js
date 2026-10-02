"use strict";

/**
 * Opaque attendance QR / check-in tokens.
 *
 * Payload MUST NOT contain:
 * - Church ID / member_number
 * - phone
 * - member personal data
 *
 * Token body is: version + jti + kind + sessionId + exp + HMAC signature.
 * Member binding (if any) lives server-side via token_hash → member_id.
 */

const crypto = require("node:crypto");
const { TOKEN_KIND } = require("./attendanceDomainConstants");

const DEFAULT_TTL_SECONDS = 15 * 60;

function resolveSecret(deps) {
  const fromDeps = deps && deps.qrSigningSecret;
  if (fromDeps && String(fromDeps).trim()) return String(fromDeps);
  const fromEnv =
    process.env.BLESSBOARD_ATTENDANCE_QR_SECRET ||
    process.env.ATTENDANCE_QR_SIGNING_SECRET ||
    "";
  if (fromEnv.trim()) return fromEnv.trim();
  // Deterministic local/dev fallback — production must set env secret.
  return "bb-attendance-qr-dev-only-not-for-production";
}

function signPayload(secret, payloadB64) {
  return crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

/**
 * Build a signed opaque token string.
 * @returns {{ token: string, tokenHash: string, jti: string, expiresAt: Date, kind: string, sessionId: string }}
 */
function issueAttendanceToken(input, deps) {
  const kind = String((input && input.kind) || TOKEN_KIND.SESSION).trim();
  if (!Object.values(TOKEN_KIND).includes(kind)) {
    return { ok: false, code: "invalid_token_kind" };
  }
  const sessionId = String((input && input.sessionId) || "").trim();
  if (!sessionId) return { ok: false, code: "session_id_required" };

  const ttl = Number.isFinite(input && input.ttlSeconds)
    ? Math.max(30, Math.min(Number(input.ttlSeconds), 24 * 3600))
    : DEFAULT_TTL_SECONDS;
  const now = input.now instanceof Date ? input.now : new Date();
  const expiresAt = new Date(now.getTime() + ttl * 1000);
  const jti = crypto.randomUUID();

  // No churchId, phone, memberNumber, name, email in payload.
  const claims = {
    v: 1,
    jti,
    k: kind === TOKEN_KIND.SESSION ? "s" : "m",
    sid: sessionId,
    exp: Math.floor(expiresAt.getTime() / 1000),
  };
  const payloadB64 = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const secret = resolveSecret(deps);
  const sig = signPayload(secret, payloadB64);
  const token = `${payloadB64}.${sig}`;

  return {
    ok: true,
    token,
    tokenHash: hashToken(token),
    jti,
    kind,
    sessionId,
    expiresAt,
    // memberId is NEVER embedded — caller stores mapping server-side when kind=member_claim
    memberIdForStorageOnly: input.memberId || null,
  };
}

/**
 * Verify signature + expiry. Does not load member/church data from token.
 */
function verifyAttendanceToken(rawToken, deps) {
  const token = String(rawToken || "").trim();
  if (!token || !token.includes(".")) {
    return { ok: false, code: "invalid_qr" };
  }
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return { ok: false, code: "invalid_qr" };

  const secret = resolveSecret(deps);
  const expected = signPayload(secret, payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, code: "invalid_qr" };
  }

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch (_err) {
    return { ok: false, code: "invalid_qr" };
  }

  if (!claims || claims.v !== 1 || !claims.jti || !claims.sid || !claims.exp) {
    return { ok: false, code: "invalid_qr" };
  }
  // Reject if payload smuggled PII keys (defense in depth).
  for (const forbidden of [
    "churchId",
    "church_id",
    "memberNumber",
    "member_number",
    "phone",
    "email",
    "firstName",
    "lastName",
    "fullName",
  ]) {
    if (Object.prototype.hasOwnProperty.call(claims, forbidden)) {
      return { ok: false, code: "invalid_qr" };
    }
  }

  const now = deps && deps.now instanceof Date ? deps.now : new Date();
  if (Number(claims.exp) * 1000 < now.getTime()) {
    return { ok: false, code: "expired_qr" };
  }

  const kind =
    claims.k === "m" ? TOKEN_KIND.MEMBER_CLAIM : TOKEN_KIND.SESSION;

  return {
    ok: true,
    jti: claims.jti,
    sessionId: String(claims.sid),
    kind,
    expiresAt: new Date(Number(claims.exp) * 1000),
    tokenHash: hashToken(token),
  };
}

function assertTokenHasNoPii(tokenString) {
  const raw = String(tokenString || "");
  const lower = raw.toLowerCase();
  // Heuristic: decoded payload should not contain obvious PII field names.
  const payloadB64 = raw.split(".")[0] || "";
  let decoded = "";
  try {
    decoded = Buffer.from(payloadB64, "base64url").toString("utf8").toLowerCase();
  } catch (_err) {
    decoded = "";
  }
  const banned = ["phone", "email", "member_number", "church_id", "firstname", "lastname"];
  for (const b of banned) {
    if (decoded.includes(`"${b}"`) || lower.includes(`"${b}"`)) {
      return { ok: false, code: "pii_in_qr" };
    }
  }
  return { ok: true };
}

module.exports = {
  issueAttendanceToken,
  verifyAttendanceToken,
  hashToken,
  assertTokenHasNoPii,
  DEFAULT_TTL_SECONDS,
};
