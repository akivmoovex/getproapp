"use strict";

/**
 * Church administrator invitation / access-confirmation email message builder.
 * Pure: builds subject/bodies/URL only. Does not send, persist, or log tokens.
 */

function trimStr(value) {
  if (value == null) return "";
  return String(value).trim();
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizePublicBaseUrl(publicBaseUrl) {
  const raw = trimStr(publicBaseUrl).replace(/\/+$/, "");
  if (!raw) throw new Error("publicBaseUrl is required");
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("publicBaseUrl must be an absolute URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("publicBaseUrl must be http(s)");
  }
  return `${parsed.protocol}//${parsed.host}`;
}

function formatExpiryUtc(expiresAt) {
  const d = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(d.getTime())) throw new Error("expiresAt must be a valid date");
  return `${d.toISOString().replace("T", " ").slice(0, 19)} UTC`;
}

/**
 * @param {{
 *   churchName: string,
 *   administratorName?: string|null,
 *   recipientEmail: string,
 *   inviteUrl?: string|null,
 *   loginUrl: string,
 *   expiresAt?: Date|string|null,
 *   kind?: 'setup_invitation'|'access_confirmation',
 * }} input
 */
function buildChurchAdministratorInvitationMessage(input) {
  const src = input && typeof input === "object" ? input : {};
  const kind =
    src.kind === "access_confirmation" ? "access_confirmation" : "setup_invitation";
  const churchName = trimStr(src.churchName) || "Your church";
  const administratorName = trimStr(src.administratorName) || null;
  const recipient = trimStr(src.recipientEmail).toLowerCase();
  if (!recipient) throw new Error("recipientEmail is required");
  const loginUrl = trimStr(src.loginUrl);
  if (!loginUrl) throw new Error("loginUrl is required");
  const inviteUrl = trimStr(src.inviteUrl) || null;
  if (kind === "setup_invitation" && !inviteUrl) {
    throw new Error("inviteUrl is required for setup invitations");
  }
  const expiresLabel = src.expiresAt ? formatExpiryUtc(src.expiresAt) : null;

  const subject = "Your BlessBoard church workspace is ready";
  const greeting = administratorName ? `Hello ${administratorName},` : "Hello,";

  if (kind === "access_confirmation") {
    const text = [
      greeting,
      "",
      `The BlessBoard workspace for ${churchName} is ready.`,
      "Your existing BlessBoard account has been granted church administrator access.",
      "",
      `Sign in: ${loginUrl}`,
      "",
      "If you did not expect this email, contact BlessBoard support.",
      "",
      "— BlessBoard",
    ].join("\n");
    const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1c1929">
<p>${escapeHtml(greeting)}</p>
<p>The BlessBoard workspace for <strong>${escapeHtml(churchName)}</strong> is ready.</p>
<p>Your existing BlessBoard account has been granted church administrator access.</p>
<p><a href="${escapeHtml(loginUrl)}" style="display:inline-block;padding:12px 18px;background:#6C5CE7;color:#fff;text-decoration:none;border-radius:8px">Sign in to BlessBoard</a></p>
<p style="font-size:13px;color:#5c566e">If you did not expect this email, contact BlessBoard support.</p>
</body></html>`;
    return Object.freeze({
      kind,
      recipient,
      subject,
      text,
      html,
      inviteUrl: null,
      loginUrl,
    });
  }

  const text = [
    greeting,
    "",
    `The BlessBoard workspace for ${churchName} has been created.`,
    "You are invited as the church administrator. Use the secure link below to create your password and activate access.",
    "",
    `Activate access: ${inviteUrl}`,
    expiresLabel ? `This invitation expires on ${expiresLabel}.` : "",
    "This link can be used only once. Do not forward it.",
    "",
    `After activation, sign in at: ${loginUrl}`,
    "",
    "If you did not expect this email, contact BlessBoard support.",
    "",
    "— BlessBoard",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1c1929">
<p>${escapeHtml(greeting)}</p>
<p>The BlessBoard workspace for <strong>${escapeHtml(churchName)}</strong> has been created.</p>
<p>You are invited as the church administrator. Use the secure button below to create your password and activate access.</p>
<p><a href="${escapeHtml(inviteUrl)}" style="display:inline-block;padding:12px 18px;background:#6C5CE7;color:#fff;text-decoration:none;border-radius:8px">Activate your administrator account</a></p>
${
  expiresLabel
    ? `<p style="font-size:13px;color:#5c566e">This invitation expires on ${escapeHtml(expiresLabel)}.</p>`
    : ""
}
<p style="font-size:13px;color:#5c566e">This link can be used only once. Do not forward it.</p>
<p style="font-size:13px;color:#5c566e">After activation, sign in at <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a>.</p>
</body></html>`;

  return Object.freeze({
    kind,
    recipient,
    subject,
    text,
    html,
    inviteUrl,
    loginUrl,
  });
}

module.exports = {
  buildChurchAdministratorInvitationMessage,
  normalizePublicBaseUrl,
  escapeHtml,
};
