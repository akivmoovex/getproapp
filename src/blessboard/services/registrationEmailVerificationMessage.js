"use strict";

/**
 * Pure registration email-verification message builder (Phase2 Prompt 037).
 * Builds recipient/subject/bodies/URL only. Does not send, persist, or log tokens.
 */

/** Approved public verify path from PHASE2_033 (apex marketing host). */
const PUBLIC_VERIFY_PATH_PREFIX = "/register/email-verification";

/**
 * @param {unknown} value
 * @returns {string}
 */
function trimStr(value) {
  if (value == null) return "";
  return String(value).trim();
}

/**
 * Escape values for HTML email bodies.
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * @param {unknown} value
 * @returns {Date}
 */
function requireExpiry(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error("expiresAt must be a valid date");
    }
    return value;
  }
  const raw = trimStr(value);
  if (!raw) {
    throw new Error("expiresAt is required");
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new Error("expiresAt must be a valid date");
  }
  return d;
}

/**
 * @param {Date} expiresAt
 * @returns {string}
 */
function formatExpiryUtc(expiresAt) {
  return `${expiresAt.toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

/**
 * Normalize a public apex base URL (no trailing slash).
 * @param {unknown} publicBaseUrl
 * @returns {string}
 */
function normalizePublicBaseUrl(publicBaseUrl) {
  const raw = trimStr(publicBaseUrl).replace(/\/+$/, "");
  if (!raw) {
    throw new Error("publicBaseUrl is required");
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("publicBaseUrl must be an absolute URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("publicBaseUrl must use http or https");
  }
  if (!parsed.host) {
    throw new Error("publicBaseUrl must include a host");
  }
  return `${parsed.protocol}//${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "")}`;
}

/**
 * Build the approved public verification URL (token path-encoded).
 * @param {string} publicBaseUrl
 * @param {string} plaintextToken
 * @returns {string}
 */
function buildVerificationUrl(publicBaseUrl, plaintextToken) {
  const base = normalizePublicBaseUrl(publicBaseUrl);
  const token = trimStr(plaintextToken);
  if (!token) {
    throw new Error("plaintextToken is required");
  }
  return `${base}${PUBLIC_VERIFY_PATH_PREFIX}/${encodeURIComponent(token)}`;
}

/**
 * Build a registration email-verification message.
 *
 * @param {{
 *   churchName?: string,
 *   applicationName?: string,
 *   applicantEmail: string,
 *   plaintextToken: string,
 *   expiresAt: Date|string,
 *   publicBaseUrl: string,
 * }} input
 * @returns {{
 *   recipient: string,
 *   subject: string,
 *   plainTextBody: string,
 *   htmlBody: string,
 *   verificationUrl: string,
 * }}
 */
function buildRegistrationVerificationEmailMessage(input = {}) {
  const src = input && typeof input === "object" ? input : {};
  const churchName = trimStr(src.churchName || src.applicationName);
  const applicantEmail = trimStr(src.applicantEmail);
  const plaintextToken = trimStr(src.plaintextToken);
  const publicBaseUrl = trimStr(src.publicBaseUrl);

  if (!churchName) {
    throw new Error("churchName (or applicationName) is required");
  }
  if (!applicantEmail) {
    throw new Error("applicantEmail is required");
  }
  if (!plaintextToken) {
    throw new Error("plaintextToken is required");
  }
  if (!publicBaseUrl) {
    throw new Error("publicBaseUrl is required");
  }

  const expiresAt = requireExpiry(src.expiresAt);
  const verificationUrl = buildVerificationUrl(publicBaseUrl, plaintextToken);
  const expiryLabel = formatExpiryUtc(expiresAt);
  const recipient = applicantEmail;
  const subject = `Verify your email for ${churchName}`;

  const plainTextBody = [
    `Hello,`,
    ``,
    `Please verify the email address for the BlessBoard registration for ${churchName}.`,
    ``,
    `Open this link to confirm ownership of ${applicantEmail}:`,
    verificationUrl,
    ``,
    `This link expires at ${expiryLabel}.`,
    ``,
    `If you did not request this verification, you can ignore this message. Do not forward the link.`,
    ``,
    `BlessBoard will never ask for your password in an email.`,
    ``,
    `For help, contact BlessBoard support through the platform website.`,
  ].join("\n");

  const safeChurch = escapeHtml(churchName);
  const safeEmail = escapeHtml(applicantEmail);
  const safeUrl = escapeHtml(verificationUrl);
  const safeHref = verificationUrl.replace(/"/g, "%22");
  const safeExpiry = escapeHtml(expiryLabel);

  const htmlBody = [
    `<!DOCTYPE html>`,
    `<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>`,
    `<body>`,
    `<p>Hello,</p>`,
    `<p>Please verify the email address for the BlessBoard registration for <strong>${safeChurch}</strong>.</p>`,
    `<p>Confirm ownership of <strong>${safeEmail}</strong> by opening this link:</p>`,
    `<p><a href="${safeHref}">Verify email address</a></p>`,
    `<p>Or copy and paste this URL into your browser:<br>${safeUrl}</p>`,
    `<p>This link expires at <strong>${safeExpiry}</strong>.</p>`,
    `<p>If you did not request this verification, you can ignore this message. Do not forward the link.</p>`,
    `<p>BlessBoard will never ask for your password in an email.</p>`,
    `<p>For help, contact BlessBoard support through the platform website.</p>`,
    `</body></html>`,
  ].join("");

  return {
    recipient,
    subject,
    plainTextBody,
    htmlBody,
    verificationUrl,
  };
}

module.exports = {
  PUBLIC_VERIFY_PATH_PREFIX,
  escapeHtml,
  buildVerificationUrl,
  buildRegistrationVerificationEmailMessage,
};
