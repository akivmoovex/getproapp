"use strict";

/**
 * ActiveClinic transactional email templates (Phase G).
 * Safe fields only. No passwords, IDs, internal notes, or provision errors.
 */

const TEMPLATE = Object.freeze({
  INFORMATION_REQUESTED: "clinic_registration.information_requested",
  READY_TO_SIGN_IN: "clinic_registration.ready_to_sign_in",
  STAFF_INVITATION: "staff.invitation",
});

function trimText(value, max) {
  const text = String(value == null ? "" : value).trim();
  if (!text) return "";
  return text.slice(0, max);
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlParagraph(value) {
  const text = String(value == null ? "" : value);
  if (!text) return "";
  return `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`;
}

function htmlCta(href, label) {
  const url = String(href || "").trim();
  if (!url) return "";
  return `<p><a href="${escapeHtml(url)}">${escapeHtml(label)}</a></p>`;
}

function buildTransactionalHtml(paragraphs, ctaUrl, ctaLabel) {
  const body = (Array.isArray(paragraphs) ? paragraphs : [])
    .filter(Boolean)
    .map((p) => htmlParagraph(p))
    .join("");
  return `${body}${htmlCta(ctaUrl, ctaLabel)}`;
}

function normalizeOrigin(raw) {
  return String(raw || "").trim().replace(/\/+$/, "");
}

function joinUrl(origin, path) {
  const base = normalizeOrigin(origin);
  const rel = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${rel}` : rel;
}

function buildInformationRequestedMessage(input) {
  const clinicName = trimText(input && input.clinicName, 200) || "your clinic";
  const applicationNumber = trimText(input && input.applicationNumber, 64);
  const requestText = trimText(input && input.requestText, 8000);
  const requestedAt = input && input.requestedAt ? String(input.requestedAt).slice(0, 10) : "";
  const ctaPath = "/register-clinic/status";
  const ctaUrl = joinUrl(input && input.publicOrigin, ctaPath);
  const subject = `ActiveClinic: more information needed (${applicationNumber || "application"})`;
  const text = [
    `ActiveClinic needs more information for ${clinicName}.`,
    applicationNumber ? `Application number: ${applicationNumber}` : "",
    requestedAt ? `Requested: ${requestedAt}` : "",
    "",
    requestText || "Please check your application status for the information requested.",
    "",
    `Check status: ${ctaUrl}`,
    "No SMS was sent from ActiveClinic.",
  ]
    .filter((line, i, arr) => line !== "" || (arr[i - 1] !== "" && i !== 0))
    .join("\n")
    .trim();
  const html = buildTransactionalHtml(
    [
      `ActiveClinic needs more information for ${clinicName}.`,
      applicationNumber ? `Application number: ${applicationNumber}` : "",
      requestedAt ? `Requested: ${requestedAt}` : "",
      requestText || "Please check your application status for the information requested.",
      "No SMS was sent from ActiveClinic.",
    ],
    ctaUrl,
    "Check status"
  );
  return {
    templateKey: TEMPLATE.INFORMATION_REQUESTED,
    subject,
    text,
    html,
    ctaPath,
    ctaUrl,
  };
}

function buildReadyToSignInMessage(input) {
  const clinicName = trimText(input && input.clinicName, 200) || "your clinic";
  const applicationNumber = trimText(input && input.applicationNumber, 64);
  const ctaPath = "/login";
  const ctaUrl = joinUrl(input && input.publicOrigin, ctaPath);
  const subject = `ActiveClinic: ${clinicName} is ready to sign in`;
  const text = [
    `${clinicName} has been approved on ActiveClinic.`,
    applicationNumber ? `Application number: ${applicationNumber}` : "",
    "The clinic administrator can sign in with the email or phone and password from the application.",
    "",
    `Sign in: ${ctaUrl}`,
    "No password is included in this email. No SMS was sent from ActiveClinic.",
  ]
    .filter((line, i, arr) => line !== "" || (arr[i - 1] !== "" && i !== 0))
    .join("\n")
    .trim();
  const html = buildTransactionalHtml(
    [
      `${clinicName} has been approved on ActiveClinic.`,
      applicationNumber ? `Application number: ${applicationNumber}` : "",
      "The clinic administrator can sign in with the email or phone and password from the application.",
      "No password is included in this email. No SMS was sent from ActiveClinic.",
    ],
    ctaUrl,
    "Sign in"
  );
  return {
    templateKey: TEMPLATE.READY_TO_SIGN_IN,
    subject,
    text,
    html,
    ctaPath,
    ctaUrl,
  };
}

function buildStaffInvitationMessage(input) {
  const organizationName =
    trimText(input && input.organizationName, 200) || "your organization";
  const activationUrl = String((input && input.activationUrl) || "").trim();
  const ctaPath = "/activate";
  const subject = `You are invited to ${organizationName} on ActiveClinic`;
  const expiry =
    input && input.expiresAt
      ? `This activation link expires on ${new Date(input.expiresAt).toISOString().slice(0, 16).replace("T", " ")} UTC.`
      : "This activation link expires in 72 hours.";
  const text = [
    `You have been invited to join ${organizationName} on ActiveClinic.`,
    expiry,
    "",
    `Activate your account: ${activationUrl}`,
    "If you did not expect this invitation, ignore this email.",
  ].join("\n");
  const html = buildTransactionalHtml(
    [
      `You have been invited to join ${organizationName} on ActiveClinic.`,
      expiry,
      "If you did not expect this invitation, ignore this email.",
    ],
    activationUrl,
    "Activate your account"
  );
  return {
    templateKey: TEMPLATE.STAFF_INVITATION,
    subject,
    text,
    html,
    ctaPath,
    ctaUrl: activationUrl,
  };
}

function buildActiveClinicEmailMessage(templateKey, input) {
  if (templateKey === TEMPLATE.INFORMATION_REQUESTED) {
    return buildInformationRequestedMessage(input);
  }
  if (templateKey === TEMPLATE.READY_TO_SIGN_IN) {
    return buildReadyToSignInMessage(input);
  }
  if (templateKey === TEMPLATE.STAFF_INVITATION) {
    return buildStaffInvitationMessage(input);
  }
  return null;
}

module.exports = {
  TEMPLATE,
  escapeHtml,
  buildInformationRequestedMessage,
  buildReadyToSignInMessage,
  buildStaffInvitationMessage,
  buildActiveClinicEmailMessage,
};
