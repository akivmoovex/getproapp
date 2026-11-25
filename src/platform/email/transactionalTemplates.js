"use strict";

/**
 * Transactional copy for verification, activation, recovery, and a failed send.
 * The body is the code or the link plus the product name. No clinical content.
 */

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function productLabel(name) {
  const label = String(name || "GetPro").replace(/[\r\n<>]/g, "").slice(0, 80);
  return label || "GetPro";
}

function verificationTemplate(productName, text) {
  const label = productLabel(productName);
  const body = String(text || "");
  return {
    templateKey: "verification",
    subject: `${label} verification code`,
    text: body,
    html: `<p>${escapeHtml(body)}</p><p>${escapeHtml(label)}</p>`,
  };
}

function activationTemplate(productName, url) {
  const label = productLabel(productName);
  const link = String(url || "");
  return {
    templateKey: "account_activation",
    subject: `Activate your ${label} account`,
    text: `Activate your ${label} account: ${link}\nIf you did not request this, ignore this email.`,
    html: `<p>Activate your ${escapeHtml(label)} account.</p><p><a href="${escapeHtml(link)}">Activate account</a></p>`,
  };
}

function recoveryTemplate(productName, url) {
  const label = productLabel(productName);
  const link = String(url || "");
  return {
    templateKey: "password_recovery",
    subject: `Reset your ${label} password`,
    text: `Reset your ${label} password: ${link}\nThis link can be used once. If you did not request it, ignore this email.`,
    html: `<p>Reset your ${escapeHtml(label)} password.</p><p><a href="${escapeHtml(link)}">Reset password</a></p>`,
  };
}

function deliveryErrorTemplate(productName) {
  const label = productLabel(productName);
  const text = `We could not send the ${label} message. Try again later.`;
  return {
    templateKey: "delivery_error",
    subject: `${label} message was not sent`,
    text,
    html: `<p>${escapeHtml(text)}</p>`,
  };
}

module.exports = {
  verificationTemplate,
  activationTemplate,
  recoveryTemplate,
  deliveryErrorTemplate,
};
