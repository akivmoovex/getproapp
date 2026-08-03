"use strict";

/**
 * ActiveClinic activation / reset link + share helpers.
 * Uses deployment publicOrigin — never hard-codes production domain in callers.
 * WhatsApp = wa.me share URL only (no Business API).
 */

const {
  buildWhatsAppShareUrl,
} = require("../../platform/services/createScopedTeamMemberService");
const {
  getDeploymentProfile,
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");

const DELIVERY = Object.freeze({
  NOT_REQUESTED: "not_requested",
  LINK_GENERATED: "link_generated",
  QUEUED: "queued",
  SENT: "sent",
  FAILED: "failed",
  UNAVAILABLE: "unavailable",
});

/**
 * @param {NodeJS.ProcessEnv|object|null} env
 * @param {string} [deploymentCode]
 */
function resolvePublicOrigin(env, deploymentCode) {
  const code = deploymentCode || CODE_ACTIVECLINIC_ORG_V6;
  try {
    const profile = getDeploymentProfile(
      env && typeof env === "object"
        ? { ...env, PLATFORM_DEPLOYMENT_CODE: code }
        : { PLATFORM_DEPLOYMENT_CODE: code }
    );
    if (profile && profile.publicOrigin) {
      return String(profile.publicOrigin).replace(/\/+$/, "");
    }
  } catch {
    /* fall through */
  }
  if (env && env.PUBLIC_ORIGIN) {
    return String(env.PUBLIC_ORIGIN).replace(/\/+$/, "");
  }
  return "https://activeclinic.org";
}

/**
 * @param {{ publicOrigin?: string, env?: object, deploymentCode?: string, rawToken: string }} input
 */
function buildActivationUrl(input) {
  const origin =
    (input.publicOrigin && String(input.publicOrigin).replace(/\/+$/, "")) ||
    resolvePublicOrigin(input.env, input.deploymentCode);
  return `${origin}/activate/${encodeURIComponent(String(input.rawToken))}`;
}

/**
 * @param {{ publicOrigin?: string, env?: object, deploymentCode?: string, rawToken: string }} input
 */
function buildResetPasswordUrl(input) {
  const origin =
    (input.publicOrigin && String(input.publicOrigin).replace(/\/+$/, "")) ||
    resolvePublicOrigin(input.env, input.deploymentCode);
  return `${origin}/reset-password/${encodeURIComponent(String(input.rawToken))}`;
}

/**
 * @param {{
 *   organizationName: string,
 *   staffDisplayName?: string|null,
 *   activationUrl: string,
 * }} input
 */
function buildActivationShareMessage(input) {
  const org = String(input.organizationName || "your organization").trim();
  const link = String(input.activationUrl || "").trim();
  return (
    `You have been invited to join ${org} on ActiveClinic. ` +
    `Use this secure link to activate your account: ${link}`
  );
}

/**
 * @param {{
 *   phoneNormalized?: string|null,
 *   emailNormalized?: string|null,
 *   organizationName: string,
 *   activationUrl: string,
 *   staffDisplayName?: string|null,
 * }} input
 */
function buildInvitationShareViewModel(input) {
  const message = buildActivationShareMessage({
    organizationName: input.organizationName,
    staffDisplayName: input.staffDisplayName,
    activationUrl: input.activationUrl,
  });
  const phone = input.phoneNormalized ? String(input.phoneNormalized) : null;
  const email = input.emailNormalized
    ? String(input.emailNormalized).trim().toLowerCase()
    : null;
  const whatsappUrl = phone
    ? buildWhatsAppShareUrl({ phoneE164: phone, message })
    : null;
  const mailtoUrl = email
    ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
        "ActiveClinic account activation"
      )}&body=${encodeURIComponent(message)}`
    : null;

  return {
    activationUrl: input.activationUrl,
    shareMessage: message,
    copyText: input.activationUrl,
    whatsappUrl,
    mailtoUrl,
    hasPhone: Boolean(phone),
    hasEmail: Boolean(email),
    deliveryStatus: DELIVERY.LINK_GENERATED,
    deliveryNote:
      "Link generated for authorized sharing. Automated email/SMS delivery is unavailable without a configured provider.",
  };
}

module.exports = {
  DELIVERY,
  resolvePublicOrigin,
  buildActivationUrl,
  buildResetPasswordUrl,
  buildActivationShareMessage,
  buildInvitationShareViewModel,
  buildWhatsAppShareUrl,
};
